import "server-only";

import { withVerifiedIdentity } from "@/core/access/data/database-context";
import { DATABASE_ROLE_TO_SYSTEM_ROLE } from "@/core/access/data/role-mapping";
import { hasPermission } from "@/core/access/domain/role";
import { validateRoleCombination } from "@/core/access/domain/role";
import {
  hasBranchAccess,
  validateMembershipScope,
} from "@/core/access/domain/scope";
import { resolveContactActor } from "@/core/contacts/application/contact-actor";
import type { Prisma } from "@/core/db/generated/client";
import {
  AppraisalStatus,
  EnquiryOutcomeKind,
  EnquiryStage,
  EnquiryTaskStatus,
} from "@/core/db/generated/enums";
import { isUuid, SEARCH_TEXT_MAX } from "@/core/properties/domain/ids";
import { normalizePropertyPostcode } from "@/core/properties/domain/property";
import {
  canCloseFrom,
  canWinFrom,
  parseDateOnly,
  validateEnquirer,
  validateOptionalNote,
  validateReason,
  validateTaskTitle,
  type EnquirerInput,
  type EnquiryStageCode,
} from "../domain/enquiry";
import { createEnquiryReference } from "../domain/enquiry-reference";
import {
  canAssignEnquiryWork,
  enquiryAudit,
  enquiryDeny,
  lockEnquiry,
  staffName,
  withEnquiryActor,
  type EnquiryActor,
  type EnquiryActorInput,
  type EnquiryTransaction,
} from "./enquiry-shared";

const STAGE = {
  new_enquiry: EnquiryStage.NEW_ENQUIRY,
  appraisal_booked: EnquiryStage.APPRAISAL_BOOKED,
  appraisal_completed: EnquiryStage.APPRAISAL_COMPLETED,
  won: EnquiryStage.WON,
  lost: EnquiryStage.LOST,
  postponed: EnquiryStage.POSTPONED,
} as const;

export function stageCode(stage: EnquiryStage): EnquiryStageCode {
  return stage.toLowerCase() as EnquiryStageCode;
}

type FirstTaskInput = {
  title: string;
  dueOn: string;
  assignedMembershipId: string;
};

export type EnquiryDetailsInput = {
  enquirer: EnquirerInput;
  contactId?: string | null;
  propertyId?: string | null;
  leadSourceId?: string | null;
  leadMembershipId?: string | null;
};

async function validateSelections(
  transaction: EnquiryTransaction,
  actor: EnquiryActor,
  input: {
    branchId: string;
    contactId?: string | null;
    propertyId?: string | null;
    leadSourceId?: string | null;
    leadMembershipId?: string | null;
  },
) {
  if (
    [
      input.contactId,
      input.propertyId,
      input.leadSourceId,
      input.leadMembershipId,
    ]
      .filter(Boolean)
      .some((id) => !isUuid(id))
  ) {
    return false;
  }
  const [contact, property, source, assignee] = await Promise.all([
    input.contactId
      ? transaction.contact.findFirst({
          where: {
            id: input.contactId,
            workspaceId: actor.workspaceId,
            status: "ACTIVE",
          },
          select: { id: true },
        })
      : true,
    input.propertyId
      ? transaction.property.findFirst({
          where: {
            id: input.propertyId,
            workspaceId: actor.workspaceId,
            status: "ACTIVE",
          },
          select: { id: true },
        })
      : true,
    input.leadSourceId
      ? transaction.leadSource.findFirst({
          where: {
            id: input.leadSourceId,
            workspaceId: actor.workspaceId,
            status: "ACTIVE",
          },
          select: { id: true },
        })
      : true,
    input.leadMembershipId
      ? canAssignEnquiryWork(
          transaction,
          actor,
          input.leadMembershipId,
          input.branchId,
        )
      : true,
  ]);
  return Boolean(contact && property && source && assignee);
}

export function createEnquiry(
  input: EnquiryActorInput &
    EnquiryDetailsInput & {
      branchId: string;
      firstTask?: FirstTaskInput | null;
    },
) {
  const action = "enquiry.create";
  return withEnquiryActor(input, async (transaction, actor) => {
    if (!hasPermission(actor.roles, "enquiry.create")) {
      return enquiryDeny(transaction, actor, action, "access_denied");
    }
    if (
      !isUuid(input.branchId) ||
      !hasBranchAccess(actor.scope, input.branchId)
    ) {
      return enquiryDeny(transaction, actor, action, "access_denied");
    }
    const branch = await transaction.branch.findFirst({
      where: {
        id: input.branchId,
        workspaceId: actor.workspaceId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    const enquirer = validateEnquirer(input.enquirer, {
      hasContact: Boolean(input.contactId),
      hasProperty: Boolean(input.propertyId),
    });
    const selections = branch
      ? await validateSelections(transaction, actor, {
          ...input,
          branchId: branch.id,
        })
      : false;
    const taskTitle = input.firstTask
      ? validateTaskTitle(input.firstTask.title)
      : null;
    const taskDate = input.firstTask
      ? parseDateOnly(input.firstTask.dueOn)
      : null;
    const taskAssignee = input.firstTask
      ? isUuid(input.firstTask.assignedMembershipId) &&
        (await canAssignEnquiryWork(
          transaction,
          actor,
          input.firstTask.assignedMembershipId,
          input.branchId,
        ))
      : true;
    if (
      !branch ||
      !enquirer.ok ||
      !selections ||
      (input.firstTask && (!taskTitle?.ok || !taskDate || !taskAssignee))
    ) {
      return enquiryDeny(transaction, actor, action, "invalid_input");
    }

    const enquiry = await transaction.enquiry.create({
      data: {
        workspaceId: actor.workspaceId,
        reference: createEnquiryReference(),
        responsibleBranchId: branch.id,
        enquirerName: enquirer.data.name,
        enquirerEmail: enquirer.data.email,
        enquirerTelephone: enquirer.data.telephone,
        addressBuilding: enquirer.data.addressBuilding,
        addressStreet: enquirer.data.addressStreet,
        postcode: enquirer.data.postcode,
        summary: enquirer.data.summary,
        contactId: input.contactId || null,
        propertyId: input.propertyId || null,
        leadSourceId: input.leadSourceId || null,
        leadMembershipId: input.leadMembershipId || null,
        createdByMembershipId: actor.membershipId,
      },
      select: { id: true },
    });
    if (input.firstTask && taskTitle?.ok && taskDate) {
      await transaction.enquiryTask.create({
        data: {
          workspaceId: actor.workspaceId,
          enquiryId: enquiry.id,
          title: taskTitle.title,
          dueOn: taskDate,
          assignedMembershipId: input.firstTask.assignedMembershipId,
          createdByMembershipId: actor.membershipId,
        },
      });
    }
    await enquiryAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: enquiry.id,
      metadata: {
        branchId: branch.id,
        firstTask: String(Boolean(input.firstTask)),
      },
    });
    return { ok: true as const, enquiryId: enquiry.id };
  });
}

export function updateEnquiry(
  input: EnquiryActorInput & { enquiryId: string } & EnquiryDetailsInput,
) {
  const action = "enquiry.update";
  return withEnquiryActor(input, async (transaction, actor) => {
    if (!hasPermission(actor.roles, "enquiry.update")) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "access_denied",
        input.enquiryId,
      );
    }
    if (!isUuid(input.enquiryId)) {
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
    });
    if (!enquiry)
      return { ok: false as const, error: "enquiry_not_found" as const };
    if (!canCloseFrom(stageCode(enquiry.stage))) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "invalid_state",
        enquiry.id,
      );
    }
    if (
      (input.contactId && input.contactId !== enquiry.contactId) ||
      (input.propertyId && input.propertyId !== enquiry.propertyId)
    ) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "invalid_state",
        enquiry.id,
      );
    }
    const contactId = enquiry.contactId ?? input.contactId ?? null;
    const propertyId = enquiry.propertyId ?? input.propertyId ?? null;
    const enquirer = validateEnquirer(input.enquirer, {
      hasContact: Boolean(contactId),
      hasProperty: Boolean(propertyId),
    });
    // Only new choices are checked, as in the database: a lead source hidden
    // later, a lead who has since lost access, or a linked record moved to
    // another branch must not stop staff editing their own enquiry.
    const changed = <T>(next: T | null | undefined, current: T | null) =>
      next && next !== current ? next : null;
    const selections = await validateSelections(transaction, actor, {
      branchId: enquiry.responsibleBranchId,
      contactId: changed(contactId, enquiry.contactId),
      propertyId: changed(propertyId, enquiry.propertyId),
      leadSourceId: changed(input.leadSourceId, enquiry.leadSourceId),
      leadMembershipId: changed(
        input.leadMembershipId,
        enquiry.leadMembershipId,
      ),
    });
    if (!enquirer.ok || !selections) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "invalid_input",
        enquiry.id,
      );
    }
    await transaction.enquiry.update({
      where: { id: enquiry.id },
      data: {
        enquirerName: enquirer.data.name,
        enquirerEmail: enquirer.data.email,
        enquirerTelephone: enquirer.data.telephone,
        addressBuilding: enquirer.data.addressBuilding,
        addressStreet: enquirer.data.addressStreet,
        postcode: enquirer.data.postcode,
        summary: enquirer.data.summary,
        contactId,
        propertyId,
        leadSourceId: input.leadSourceId || null,
        leadMembershipId: input.leadMembershipId || null,
      },
    });
    await enquiryAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: enquiry.id,
    });
    return { ok: true as const, enquiryId: enquiry.id };
  });
}

export async function changeEnquiryStageInTransaction(
  transaction: EnquiryTransaction,
  actor: EnquiryActor,
  enquiry: { id: string; stage: EnquiryStage },
  to: EnquiryStageCode,
  reason: string | null,
  extra: {
    outcomeReasonId?: string | null;
    outcomeNote?: string | null;
    followUpOn?: Date | null;
  } = {},
) {
  const from = stageCode(enquiry.stage);
  if (from === to) throw new Error("A stage change must move to a new stage.");
  // Omit created_at deliberately: the RLS policy requires PostgreSQL's exact
  // transaction timestamp, while Prisma materialises @default(now()) in the
  // application and can differ by a few milliseconds.
  await transaction.$executeRaw`
    INSERT INTO "enquiry_stage_history" (
      "workspace_id", "enquiry_id", "from_stage", "to_stage", "reason",
      "changed_by_membership_id"
    ) VALUES (
      ${actor.workspaceId}::uuid,
      ${enquiry.id}::uuid,
      ${from}::enquiry_stage,
      ${to}::enquiry_stage,
      ${reason},
      ${actor.membershipId}::uuid
    )
  `;
  await transaction.enquiry.update({
    where: { id: enquiry.id },
    data: {
      stage: STAGE[to],
      outcomeReasonId: extra.outcomeReasonId ?? null,
      outcomeNote: extra.outcomeNote ?? null,
      followUpOn: extra.followUpOn ?? null,
    },
  });
}

export function closeEnquiry(
  input: EnquiryActorInput & {
    enquiryId: string;
    outcome: "won" | "lost" | "postponed";
    outcomeReasonId?: string | null;
    outcomeNote?: string | null;
    followUpOn?: string | null;
  },
) {
  const action = `enquiry.${input.outcome}`;
  return withEnquiryActor(input, async (transaction, actor) => {
    if (!hasPermission(actor.roles, "enquiry.update")) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "access_denied",
        input.enquiryId,
      );
    }
    if (
      !isUuid(input.enquiryId) ||
      !["won", "lost", "postponed"].includes(input.outcome)
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
      select: { id: true, stage: true },
    });
    if (!enquiry)
      return { ok: false as const, error: "enquiry_not_found" as const };
    const from = stageCode(enquiry.stage);
    if (!canCloseFrom(from) || (input.outcome === "won" && !canWinFrom(from))) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "invalid_state",
        enquiry.id,
      );
    }
    const note = validateOptionalNote(input.outcomeNote);
    const followUp = input.followUpOn ? parseDateOnly(input.followUpOn) : null;
    let outcomeReasonId: string | null = null;
    let historyReason: string | null = null;
    if (input.outcome !== "won") {
      if (
        !isUuid(input.outcomeReasonId) ||
        !note.ok ||
        (input.followUpOn && !followUp)
      ) {
        return enquiryDeny(
          transaction,
          actor,
          action,
          "invalid_input",
          enquiry.id,
        );
      }
      const reason = await transaction.enquiryOutcomeReason.findFirst({
        where: {
          id: input.outcomeReasonId,
          workspaceId: actor.workspaceId,
          status: "ACTIVE",
          appliesTo: {
            in: [
              input.outcome === "lost"
                ? EnquiryOutcomeKind.LOST
                : EnquiryOutcomeKind.POSTPONED,
              EnquiryOutcomeKind.BOTH,
            ],
          },
        },
        select: { id: true, name: true },
      });
      if (!reason || (input.outcome === "lost" && followUp)) {
        return enquiryDeny(
          transaction,
          actor,
          action,
          "invalid_input",
          enquiry.id,
        );
      }
      outcomeReasonId = reason.id;
      historyReason = reason.name;
    } else if (input.outcomeReasonId || input.outcomeNote || input.followUpOn) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "invalid_input",
        enquiry.id,
      );
    }
    await transaction.enquiryTask.updateMany({
      where: {
        workspaceId: actor.workspaceId,
        enquiryId: enquiry.id,
        status: EnquiryTaskStatus.OPEN,
      },
      data: {
        status: EnquiryTaskStatus.CANCELLED,
        closedAt: new Date(),
        closedByMembershipId: actor.membershipId,
      },
    });
    await transaction.appraisal.updateMany({
      where: {
        workspaceId: actor.workspaceId,
        enquiryId: enquiry.id,
        status: AppraisalStatus.SCHEDULED,
      },
      data: { status: AppraisalStatus.CANCELLED },
    });
    await changeEnquiryStageInTransaction(
      transaction,
      actor,
      enquiry,
      input.outcome,
      historyReason,
      {
        outcomeReasonId,
        outcomeNote: note.ok ? note.note : null,
        followUpOn: followUp,
      },
    );
    await enquiryAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: enquiry.id,
    });
    return { ok: true as const, enquiryId: enquiry.id };
  });
}

export function reopenEnquiry(
  input: EnquiryActorInput & { enquiryId: string; reason: string },
) {
  const action = "enquiry.reopen";
  return withEnquiryActor(input, async (transaction, actor) => {
    if (!hasPermission(actor.roles, "enquiry.reopen")) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "access_denied",
        input.enquiryId,
      );
    }
    const reason = validateReason(input.reason);
    if (!isUuid(input.enquiryId) || !reason.ok) {
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
      select: {
        id: true,
        stage: true,
        appraisals: {
          where: { status: AppraisalStatus.COMPLETED },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!enquiry)
      return { ok: false as const, error: "enquiry_not_found" as const };
    if (
      enquiry.stage !== EnquiryStage.LOST &&
      enquiry.stage !== EnquiryStage.POSTPONED
    ) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "invalid_state",
        enquiry.id,
      );
    }
    const to = enquiry.appraisals.length
      ? "appraisal_completed"
      : "new_enquiry";
    await changeEnquiryStageInTransaction(
      transaction,
      actor,
      enquiry,
      to,
      reason.reason,
    );
    await enquiryAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: enquiry.id,
      metadata: { toStage: to },
    });
    return { ok: true as const, enquiryId: enquiry.id };
  });
}

export async function listEnquiries(
  input: EnquiryActorInput & {
    query?: string;
    stages?: EnquiryStageCode[];
    branchId?: string;
    assignedMembershipId?: string;
    take?: number;
  },
) {
  if (
    (input.branchId && !isUuid(input.branchId)) ||
    (input.assignedMembershipId && !isUuid(input.assignedMembershipId))
  ) {
    return [];
  }
  const result = await withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor || !hasPermission(actor.roles, "enquiry.read")) return null;
      const text = input.query?.trim().slice(0, SEARCH_TEXT_MAX);
      const postcode = text ? normalizePropertyPostcode(text) : null;
      const stages = input.stages
        ?.filter((stage) => stage in STAGE)
        .map((stage) => STAGE[stage]);
      return transaction.enquiry.findMany({
        where: {
          workspaceId: actor.workspaceId,
          ...(stages?.length
            ? { stage: { in: stages } }
            : {
                stage: { notIn: [EnquiryStage.LOST, EnquiryStage.POSTPONED] },
              }),
          ...(input.branchId ? { responsibleBranchId: input.branchId } : {}),
          ...(input.assignedMembershipId
            ? { leadMembershipId: input.assignedMembershipId }
            : {}),
          ...(text
            ? {
                OR: [
                  { reference: { contains: text, mode: "insensitive" } },
                  { enquirerName: { contains: text, mode: "insensitive" } },
                  { addressBuilding: { contains: text, mode: "insensitive" } },
                  { addressStreet: { contains: text, mode: "insensitive" } },
                  postcode
                    ? { postcode }
                    : {
                        postcode: {
                          contains: text,
                          mode: "insensitive",
                        },
                      },
                ] satisfies Prisma.EnquiryWhereInput[],
              }
            : {}),
        },
        include: {
          responsibleBranch: { select: { id: true, name: true } },
          leadSource: { select: { id: true, name: true } },
          leadMembership: {
            select: {
              id: true,
              userIdentity: {
                select: { firstName: true, lastName: true, primaryEmail: true },
              },
            },
          },
          appraisals: {
            where: { status: AppraisalStatus.SCHEDULED },
            orderBy: { scheduledAt: "asc" },
            select: { id: true, scheduledAt: true },
            take: 1,
          },
          tasks: {
            where: { status: EnquiryTaskStatus.OPEN },
            orderBy: [{ dueOn: "asc" }, { createdAt: "asc" }],
            select: { id: true, title: true, dueOn: true },
            take: 1,
          },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: Math.min(input.take ?? 50, 100),
      });
    },
  );
  return (result ?? []).map((enquiry) => ({
    id: enquiry.id,
    reference: enquiry.reference,
    stage: stageCode(enquiry.stage),
    enquirerName: enquiry.enquirerName,
    address: [enquiry.addressBuilding, enquiry.addressStreet]
      .filter(Boolean)
      .join(", "),
    postcode: enquiry.postcode,
    branch: enquiry.responsibleBranch,
    leadSource: enquiry.leadSource,
    lead: enquiry.leadMembership
      ? {
          membershipId: enquiry.leadMembership.id,
          name: staffName(enquiry.leadMembership.userIdentity),
        }
      : null,
    appraisal: enquiry.appraisals[0] ?? null,
    nextAction: enquiry.tasks[0] ?? null,
    updatedAt: enquiry.updatedAt,
  }));
}

export async function getEnquiry(
  input: EnquiryActorInput & { enquiryId: string },
) {
  if (!isUuid(input.enquiryId)) return null;
  return withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor || !hasPermission(actor.roles, "enquiry.read")) return null;
      return transaction.enquiry.findFirst({
        where: { id: input.enquiryId, workspaceId: actor.workspaceId },
        include: {
          responsibleBranch: { select: { id: true, name: true } },
          leadSource: { select: { id: true, name: true } },
          leadMembership: {
            select: {
              id: true,
              userIdentity: {
                select: { firstName: true, lastName: true, primaryEmail: true },
              },
            },
          },
          outcomeReason: { select: { id: true, name: true } },
          appraisals: { orderBy: { scheduledAt: "desc" } },
          tasks: { orderBy: [{ status: "asc" }, { dueOn: "asc" }] },
          stageHistory: { orderBy: { createdAt: "desc" } },
        },
      });
    },
  );
}

/** Active enquiry workers the actor is allowed to see, with their branch scope. */
export async function listEnquiryAssignees(input: EnquiryActorInput) {
  const result = await withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor || !hasPermission(actor.roles, "enquiry.read")) return null;
      const memberships = await transaction.membership.findMany({
        where: { workspaceId: actor.workspaceId, status: "ACTIVE" },
        select: {
          id: true,
          scopeMode: true,
          roles: { select: { roleCode: true } },
          branchAccess: { select: { branchId: true } },
          userIdentity: {
            select: { firstName: true, lastName: true, primaryEmail: true },
          },
        },
        orderBy: { createdAt: "asc" },
      });
      return memberships.flatMap((membership) => {
        const roles = validateRoleCombination(
          membership.roles.map(
            ({ roleCode }) => DATABASE_ROLE_TO_SYSTEM_ROLE[roleCode],
          ),
        );
        const scope = validateMembershipScope(
          membership.scopeMode === "WORKSPACE"
            ? { kind: "workspace" }
            : {
                kind: "named_branches",
                branchIds: membership.branchAccess.map(
                  ({ branchId }) => branchId,
                ),
              },
        );
        if (
          !roles.ok ||
          !scope.ok ||
          !hasPermission(roles.roles, "enquiry.update") ||
          !membership.userIdentity
        ) {
          return [];
        }
        return [
          {
            membershipId: membership.id,
            name: staffName(membership.userIdentity),
            branchIds:
              scope.scope.kind === "workspace"
                ? null
                : [...scope.scope.branchIds],
          },
        ];
      });
    },
  );
  return result ?? [];
}
