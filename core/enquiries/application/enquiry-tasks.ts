import "server-only";

import { withVerifiedIdentity } from "@/core/access/data/database-context";
import { hasPermission } from "@/core/access/domain/role";
import { resolveContactActor } from "@/core/contacts/application/contact-actor";
import {
  AppraisalStatus,
  EnquiryStage,
  EnquiryTaskStatus,
} from "@/core/db/generated/enums";
import { isUuid } from "@/core/properties/domain/ids";
import {
  isOpenStage,
  parseDateOnly,
  ukDayBounds,
  ukToday,
  validateTaskTitle,
} from "../domain/enquiry";
import { stageCode } from "./enquiries";
import {
  canAssignEnquiryWork,
  enquiryAudit,
  enquiryDeny,
  lockEnquiry,
  withEnquiryActor,
  type EnquiryActor,
  type EnquiryActorInput,
  type EnquiryTransaction,
} from "./enquiry-shared";

type AddTaskInput = {
  enquiryId: string;
  appraisalId?: string | null;
  title: string;
  dueOn: string;
  assignedMembershipId: string;
};

export function addEnquiryTask(input: EnquiryActorInput & AddTaskInput) {
  return withEnquiryActor(input, (transaction, actor) =>
    addEnquiryTaskInTransaction(transaction, actor, input),
  );
}

/** For callers that already hold a transaction, so several changes commit together. */
export async function addEnquiryTaskInTransaction(
  transaction: EnquiryTransaction,
  actor: EnquiryActor,
  input: AddTaskInput,
) {
  const action = "enquiry.task.add";
  if (!hasPermission(actor.roles, "enquiry.update")) {
    return enquiryDeny(
      transaction,
      actor,
      action,
      "access_denied",
      input.enquiryId,
    );
  }
  const title = validateTaskTitle(input.title);
  const dueOn = parseDateOnly(input.dueOn);
  if (
    !isUuid(input.enquiryId) ||
    !isUuid(input.assignedMembershipId) ||
    (input.appraisalId != null && !isUuid(input.appraisalId)) ||
    !title.ok ||
    !dueOn
  ) {
    return enquiryDeny(
      transaction,
      actor,
      action,
      "invalid_input",
      input.enquiryId,
    );
  }
  await lockEnquiry(transaction, actor, input.enquiryId);
  const enquiry = await transaction.enquiry.findFirst({
    where: { id: input.enquiryId, workspaceId: actor.workspaceId },
    select: { id: true, stage: true, responsibleBranchId: true },
  });
  if (!enquiry)
    return { ok: false as const, error: "enquiry_not_found" as const };
  if (!isOpenStage(stageCode(enquiry.stage))) {
    return enquiryDeny(transaction, actor, action, "invalid_state", enquiry.id);
  }
  const canAssign = await canAssignEnquiryWork(
    transaction,
    actor,
    input.assignedMembershipId,
    enquiry.responsibleBranchId,
  );
  const appraisal = input.appraisalId
    ? await transaction.appraisal.findFirst({
        where: {
          id: input.appraisalId,
          enquiryId: enquiry.id,
          workspaceId: actor.workspaceId,
        },
        select: { id: true },
      })
    : true;
  if (!canAssign || !appraisal) {
    return enquiryDeny(transaction, actor, action, "invalid_input", enquiry.id);
  }
  const task = await transaction.enquiryTask.create({
    data: {
      workspaceId: actor.workspaceId,
      enquiryId: enquiry.id,
      appraisalId: input.appraisalId || null,
      title: title.title,
      dueOn,
      assignedMembershipId: input.assignedMembershipId,
      createdByMembershipId: actor.membershipId,
    },
    select: { id: true },
  });
  await enquiryAudit(transaction, actor, {
    action,
    outcome: "SUCCEEDED",
    targetId: enquiry.id,
    metadata: { taskId: task.id },
  });
  return { ok: true as const, enquiryId: enquiry.id, taskId: task.id };
}

type CloseTaskInput = { enquiryId: string; taskId: string };
type CloseStatus =
  typeof EnquiryTaskStatus.DONE | typeof EnquiryTaskStatus.CANCELLED;

function closeTask(
  input: EnquiryActorInput & CloseTaskInput,
  status: CloseStatus,
) {
  return withEnquiryActor(input, (transaction, actor) =>
    closeEnquiryTaskInTransaction(transaction, actor, input, status),
  );
}

/** For callers that already hold a transaction, so several changes commit together. */
export async function closeEnquiryTaskInTransaction(
  transaction: EnquiryTransaction,
  actor: EnquiryActor,
  input: CloseTaskInput,
  status: CloseStatus,
) {
  const action =
    status === EnquiryTaskStatus.DONE
      ? "enquiry.task.complete"
      : "enquiry.task.cancel";
  if (!hasPermission(actor.roles, "enquiry.update")) {
    return enquiryDeny(
      transaction,
      actor,
      action,
      "access_denied",
      input.enquiryId,
    );
  }
  if (!isUuid(input.enquiryId) || !isUuid(input.taskId)) {
    return enquiryDeny(
      transaction,
      actor,
      action,
      "invalid_input",
      input.enquiryId,
    );
  }
  const task = await transaction.enquiryTask.findFirst({
    where: {
      id: input.taskId,
      enquiryId: input.enquiryId,
      workspaceId: actor.workspaceId,
    },
    select: { id: true, enquiryId: true, status: true },
  });
  if (!task) return { ok: false as const, error: "task_not_found" as const };
  if (task.status !== EnquiryTaskStatus.OPEN) {
    return enquiryDeny(
      transaction,
      actor,
      action,
      "invalid_state",
      task.enquiryId,
    );
  }
  await transaction.enquiryTask.update({
    where: { id: task.id },
    data: {
      status,
      closedAt: new Date(),
      closedByMembershipId: actor.membershipId,
    },
  });
  await enquiryAudit(transaction, actor, {
    action,
    outcome: "SUCCEEDED",
    targetId: task.enquiryId,
    metadata: { taskId: task.id },
  });
  return { ok: true as const, enquiryId: task.enquiryId, taskId: task.id };
}

export function completeEnquiryTask(
  input: EnquiryActorInput & { enquiryId: string; taskId: string },
) {
  return closeTask(input, EnquiryTaskStatus.DONE);
}

export function cancelEnquiryTask(
  input: EnquiryActorInput & { enquiryId: string; taskId: string },
) {
  return closeTask(input, EnquiryTaskStatus.CANCELLED);
}

export async function getEnquiryNeedsAttention(
  input: EnquiryActorInput & { upcomingDays?: number; now?: Date },
) {
  const result = await withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor || !hasPermission(actor.roles, "enquiry.read")) return null;
      const now = input.now ?? new Date();
      const { start, end } = ukDayBounds(now);
      const today = parseDateOnly(ukToday(now))!;
      const lastDueDate = new Date(today);
      lastDueDate.setUTCDate(
        lastDueDate.getUTCDate() +
          Math.min(Math.max(input.upcomingDays ?? 7, 0), 31),
      );
      const [unactionedEnquiries, todaysAppraisals, tasks] = await Promise.all([
        transaction.enquiry.findMany({
          where: {
            workspaceId: actor.workspaceId,
            stage: EnquiryStage.NEW_ENQUIRY,
            tasks: { none: { status: EnquiryTaskStatus.OPEN } },
            OR: [
              { leadMembershipId: actor.membershipId },
              { leadMembershipId: null },
            ],
          },
          select: {
            id: true,
            reference: true,
            enquirerName: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
          take: 50,
        }),
        transaction.appraisal.findMany({
          where: {
            workspaceId: actor.workspaceId,
            assignedMembershipId: actor.membershipId,
            status: AppraisalStatus.SCHEDULED,
            scheduledAt: { gte: start, lt: end },
          },
          include: {
            enquiry: {
              select: { id: true, reference: true, enquirerName: true },
            },
          },
          orderBy: { scheduledAt: "asc" },
          take: 50,
        }),
        transaction.enquiryTask.findMany({
          where: {
            workspaceId: actor.workspaceId,
            assignedMembershipId: actor.membershipId,
            status: EnquiryTaskStatus.OPEN,
            dueOn: { lte: lastDueDate },
          },
          include: {
            enquiry: {
              select: { id: true, reference: true, enquirerName: true },
            },
          },
          orderBy: [{ dueOn: "asc" }, { createdAt: "asc" }],
          take: 100,
        }),
      ]);
      return { unactionedEnquiries, todaysAppraisals, tasks, today };
    },
  );
  return (
    result ?? {
      unactionedEnquiries: [],
      todaysAppraisals: [],
      tasks: [],
      today: parseDateOnly(ukToday(input.now))!,
    }
  );
}
