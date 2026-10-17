import "server-only";

import { withVerifiedIdentity } from "@/core/access/data/database-context";
import { hasPermission } from "@/core/access/domain/role";
import { hasBranchAccess } from "@/core/access/domain/scope";
import { resolveContactActor } from "@/core/contacts/application/contact-actor";
import {
  ActionKind as DbActionKind,
  ActionStatus,
  EnquiryTaskStatus,
} from "@/core/db/generated/enums";
import {
  addEnquiryTaskInTransaction,
  closeEnquiryTaskInTransaction,
} from "@/core/enquiries/application/enquiry-tasks";
import {
  canAssignEnquiryWork,
  EnquiryRollback,
  enquiryAudit,
  staffName,
  withEnquiryActor,
  type EnquiryActor,
  type EnquiryActorInput,
  type EnquiryFailure,
  type EnquiryTransaction,
  type EnquiryWriteError,
} from "@/core/enquiries/application/enquiry-shared";
import { ukDayBounds, ukToday } from "@/core/enquiries/domain/enquiry";
import {
  addressLine,
  contactDisplayName,
} from "@/core/properties/application/properties";
import { isUuid } from "@/core/properties/domain/ids";
import {
  isActionKind,
  parseActionDueOn,
  parsePlannedFor,
  validateActionTitle,
  type ActionKindCode,
} from "../domain/action";

/**
 * One list of work for the dashboard. Landlord-lead next actions live in
 * `enquiry_tasks` and general actions in `actions`; this layer reads and
 * changes both the same way. Later modules add their own source here.
 */
export type WorkItemSource = "lead_task" | "action";
export type WorkItemRef = { source: WorkItemSource; id: string };

export type WorkItem = {
  source: WorkItemSource;
  id: string;
  title: string;
  /** General actions only: lead next actions have no type. */
  kind: ActionKindCode | null;
  dueOn: string;
  overdue: boolean;
  plannedFor: Date | null;
  assignee: { membershipId: string; name: string };
  createdAt: Date;
  /** The branch responsible for the item. */
  branchId: string;
  /** How to reach the person the item is about, when it is known. */
  reach: { telephone: string | null; email: string | null };
  /** Each link is present only when the viewer can see that record. */
  enquiry: { id: string; reference: string; name: string } | null;
  contact: { id: string; reference: string; name: string } | null;
  property: { id: string; reference: string; addressLine: string } | null;
};

const IDENTITY_SELECT = {
  firstName: true,
  lastName: true,
  primaryEmail: true,
} as const;
const ASSIGNEE_SELECT = {
  select: { id: true, userIdentity: { select: IDENTITY_SELECT } },
} as const;

const DEFAULT_TAKE = 200;
const MAX_TAKE = 500;

function dayText(value: Date) {
  return value.toISOString().slice(0, 10);
}

function compareItems(a: WorkItem, b: WorkItem) {
  return (
    a.dueOn.localeCompare(b.dueOn) ||
    (a.plannedFor?.getTime() ?? Infinity) -
      (b.plannedFor?.getTime() ?? Infinity) ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Open work in due order, most overdue first. `mine` (the default) is the
 * signed-in user's own work; `visible` is everything their role and branches
 * allow them to see. Each source needs its own read permission.
 */
export async function listWorkItems(
  input: EnquiryActorInput & {
    scope?: "mine" | "visible";
    take?: number;
    now?: Date;
  },
): Promise<WorkItem[]> {
  const take = Math.min(Math.max(input.take ?? DEFAULT_TAKE, 1), MAX_TAKE);
  const today = ukToday(input.now);
  // A planned time belongs to its day: once that day has gone, the item is
  // waiting to be planned again (as when it is snoozed).
  const { start: todayStart } = ukDayBounds(input.now);
  const currentPlan = (plannedFor: Date | null) =>
    plannedFor && plannedFor >= todayStart ? plannedFor : null;
  const result = await withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor) return [];
      const assigned =
        input.scope === "visible"
          ? {}
          : { assignedMembershipId: actor.membershipId };
      const [tasks, actions] = await Promise.all([
        hasPermission(actor.roles, "enquiry.read")
          ? transaction.enquiryTask.findMany({
              where: {
                workspaceId: actor.workspaceId,
                status: EnquiryTaskStatus.OPEN,
                ...assigned,
              },
              include: {
                assignedMembership: ASSIGNEE_SELECT,
                enquiry: {
                  select: {
                    id: true,
                    reference: true,
                    enquirerName: true,
                    enquirerEmail: true,
                    enquirerTelephone: true,
                    responsibleBranchId: true,
                  },
                },
              },
              orderBy: [{ dueOn: "asc" }, { createdAt: "asc" }],
              take,
            })
          : [],
        hasPermission(actor.roles, "action.read")
          ? transaction.action.findMany({
              where: {
                workspaceId: actor.workspaceId,
                status: ActionStatus.OPEN,
                ...assigned,
              },
              include: {
                assignedMembership: ASSIGNEE_SELECT,
                contact: {
                  select: {
                    id: true,
                    kind: true,
                    reference: true,
                    firstName: true,
                    lastName: true,
                    legalName: true,
                    contactPoints: {
                      where: { archivedAt: null },
                      select: {
                        kind: true,
                        value: true,
                        isPreferred: true,
                      },
                      orderBy: [{ isPreferred: "desc" }, { createdAt: "asc" }],
                    },
                  },
                },
                property: {
                  select: {
                    id: true,
                    reference: true,
                    addressBuilding: true,
                    addressStreet: true,
                    townCity: true,
                  },
                },
              },
              orderBy: [{ dueOn: "asc" }, { createdAt: "asc" }],
              take,
            })
          : [],
      ]);

      const items: WorkItem[] = [
        ...tasks.map((task): WorkItem => ({
          source: "lead_task",
          id: task.id,
          title: task.title,
          kind: null,
          dueOn: dayText(task.dueOn),
          overdue: dayText(task.dueOn) < today,
          plannedFor: currentPlan(task.plannedFor),
          assignee: {
            membershipId: task.assignedMembershipId,
            name: staffName(task.assignedMembership.userIdentity),
          },
          createdAt: task.createdAt,
          branchId: task.enquiry.responsibleBranchId,
          enquiry: {
            id: task.enquiry.id,
            reference: task.enquiry.reference,
            name: task.enquiry.enquirerName,
          },
          reach: {
            telephone: task.enquiry.enquirerTelephone,
            email: task.enquiry.enquirerEmail,
          },
          contact: null,
          property: null,
        })),
        ...actions.map((action): WorkItem => ({
          source: "action",
          id: action.id,
          title: action.title,
          kind: action.kind.toLowerCase() as ActionKindCode,
          dueOn: dayText(action.dueOn),
          overdue: dayText(action.dueOn) < today,
          plannedFor: currentPlan(action.plannedFor),
          assignee: {
            membershipId: action.assignedMembershipId,
            name: staffName(action.assignedMembership.userIdentity),
          },
          createdAt: action.createdAt,
          branchId: action.responsibleBranchId,
          reach: {
            telephone:
              action.contact?.contactPoints.find(
                ({ kind }) => kind === "TELEPHONE",
              )?.value ?? null,
            email:
              action.contact?.contactPoints.find(({ kind }) => kind === "EMAIL")
                ?.value ?? null,
          },
          enquiry: null,
          contact: action.contact && {
            id: action.contact.id,
            reference: action.contact.reference,
            name: contactDisplayName(action.contact),
          },
          property: action.property && {
            id: action.property.id,
            reference: action.property.reference,
            addressLine: addressLine(action.property),
          },
        })),
      ];
      return items.sort(compareItems).slice(0, take);
    },
  );
  return result ?? [];
}

type Target = { type: string; id: string };

async function deny(
  transaction: EnquiryTransaction,
  actor: EnquiryActor,
  action: string,
  error: EnquiryWriteError,
  target?: Target,
): Promise<EnquiryFailure> {
  await enquiryAudit(transaction, actor, {
    action,
    outcome: "DENIED",
    targetType: target?.type,
    targetId: target?.id,
    metadata: { reason: error },
  });
  return { ok: false, error };
}

type NextStep = {
  title: string;
  dueOn: string;
  assignedMembershipId: string;
  kind?: ActionKindCode;
};

type NewActionData = {
  title: string;
  dueOn: string;
  assignedMembershipId: string;
  kind?: ActionKindCode;
  branchId: string;
  contactId?: string | null;
  propertyId?: string | null;
};

/** Creates a general action. The caller has already checked the permission. */
async function createAction(
  transaction: EnquiryTransaction,
  actor: EnquiryActor,
  input: NewActionData,
) {
  const auditAction = "action.add";
  const title = validateActionTitle(input.title);
  const dueOn = parseActionDueOn(input.dueOn);
  const kind = input.kind ?? "other";
  if (
    !title.ok ||
    !dueOn ||
    !isActionKind(kind) ||
    !isUuid(input.branchId) ||
    !isUuid(input.assignedMembershipId) ||
    (input.contactId != null && !isUuid(input.contactId)) ||
    (input.propertyId != null && !isUuid(input.propertyId))
  ) {
    return deny(transaction, actor, auditAction, "invalid_input");
  }
  // The creator must work in the branch (the database refuses otherwise), and
  // the assignee must be able to work on it too.
  if (
    !hasBranchAccess(actor.scope, input.branchId) ||
    !(await canAssignEnquiryWork(
      transaction,
      actor,
      input.assignedMembershipId,
      input.branchId,
      "action.manage",
    ))
  ) {
    return deny(transaction, actor, auditAction, "invalid_input");
  }
  // Only active records the actor can see may be linked.
  if (input.contactId) {
    const contact = await transaction.contact.findFirst({
      where: {
        id: input.contactId,
        workspaceId: actor.workspaceId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!contact) {
      return deny(transaction, actor, auditAction, "contact_not_found");
    }
  }
  if (input.propertyId) {
    const property = await transaction.property.findFirst({
      where: {
        id: input.propertyId,
        workspaceId: actor.workspaceId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!property) {
      return deny(transaction, actor, auditAction, "property_not_found");
    }
  }
  const created = await transaction.action.create({
    data: {
      workspaceId: actor.workspaceId,
      responsibleBranchId: input.branchId,
      title: title.title,
      kind: kind.toUpperCase() as DbActionKind,
      dueOn,
      assignedMembershipId: input.assignedMembershipId,
      contactId: input.contactId || null,
      propertyId: input.propertyId || null,
      createdByMembershipId: actor.membershipId,
    },
    select: { id: true },
  });
  await enquiryAudit(transaction, actor, {
    action: auditAction,
    outcome: "SUCCEEDED",
    targetType: "action",
    targetId: created.id,
  });
  return {
    ok: true as const,
    source: "action" as const,
    id: created.id,
  };
}

/**
 * Adds work. With a lead it is that lead's next action (so the lead rules
 * hold); without one it is a general action in the given branch, optionally
 * linked to a contact or property.
 */
export function addWorkItem(
  input: EnquiryActorInput &
    Omit<NewActionData, "branchId"> & {
      enquiryId?: string | null;
      appraisalId?: string | null;
      branchId?: string | null;
    },
) {
  return withEnquiryActor(input, async (transaction, actor) => {
    if (input.enquiryId) {
      if (input.contactId || input.propertyId || input.branchId) {
        return deny(transaction, actor, "enquiry.task.add", "invalid_input");
      }
      const added = await addEnquiryTaskInTransaction(transaction, actor, {
        enquiryId: input.enquiryId,
        appraisalId: input.appraisalId,
        title: input.title,
        dueOn: input.dueOn,
        assignedMembershipId: input.assignedMembershipId,
      });
      if (!added.ok) return added;
      return {
        ok: true as const,
        source: "lead_task" as const,
        id: added.taskId,
      };
    }
    if (!hasPermission(actor.roles, "action.manage")) {
      return deny(transaction, actor, "action.add", "access_denied");
    }
    return createAction(transaction, actor, {
      ...input,
      branchId: input.branchId ?? "",
    });
  });
}

type LoadedItem = {
  source: WorkItemSource;
  id: string;
  assignedMembershipId: string;
  branchId: string;
  dueOn: Date;
  /** Present for lead next actions. */
  enquiryId: string | null;
  /** Present for general actions. */
  contactId: string | null;
  propertyId: string | null;
  kind: ActionKindCode | null;
};

const PERMISSION: Record<WorkItemSource, WorkItemPermission> = {
  lead_task: "enquiry.update",
  action: "action.manage",
};
type WorkItemPermission = "enquiry.update" | "action.manage";

const TARGET_TYPE: Record<WorkItemSource, string> = {
  lead_task: "enquiry",
  action: "action",
};

/** Finds an open item the actor can see, or says why not. */
async function loadOpenItem(
  transaction: EnquiryTransaction,
  actor: EnquiryActor,
  ref: WorkItemRef,
): Promise<LoadedItem | "not_found" | "closed"> {
  if (ref.source === "lead_task") {
    const task = await transaction.enquiryTask.findFirst({
      where: { id: ref.id, workspaceId: actor.workspaceId },
      select: {
        id: true,
        status: true,
        enquiryId: true,
        dueOn: true,
        assignedMembershipId: true,
        enquiry: { select: { responsibleBranchId: true } },
      },
    });
    if (!task) return "not_found";
    if (task.status !== EnquiryTaskStatus.OPEN) return "closed";
    return {
      source: "lead_task",
      id: task.id,
      assignedMembershipId: task.assignedMembershipId,
      branchId: task.enquiry.responsibleBranchId,
      dueOn: task.dueOn,
      enquiryId: task.enquiryId,
      contactId: null,
      propertyId: null,
      kind: null,
    };
  }
  const action = await transaction.action.findFirst({
    where: { id: ref.id, workspaceId: actor.workspaceId },
    select: {
      id: true,
      status: true,
      responsibleBranchId: true,
      dueOn: true,
      assignedMembershipId: true,
      contactId: true,
      propertyId: true,
      kind: true,
    },
  });
  if (!action) return "not_found";
  if (action.status !== ActionStatus.OPEN) return "closed";
  return {
    source: "action",
    id: action.id,
    assignedMembershipId: action.assignedMembershipId,
    branchId: action.responsibleBranchId,
    dueOn: action.dueOn,
    enquiryId: null,
    contactId: action.contactId,
    propertyId: action.propertyId,
    kind: action.kind.toLowerCase() as ActionKindCode,
  };
}

/**
 * Shared shape of every change to an existing item: check the ref and the
 * permission, load the open item, run the change, and audit it.
 */
function changeItem<T extends { ok: true }>(
  input: EnquiryActorInput & { item: WorkItemRef },
  name: string,
  change: (
    transaction: EnquiryTransaction,
    actor: EnquiryActor,
    item: LoadedItem,
  ) => Promise<T | EnquiryFailure>,
) {
  const auditAction = `${input.item.source === "lead_task" ? "enquiry.task" : "action"}.${name}`;
  return withEnquiryActor(input, async (transaction, actor) => {
    const { source, id } = input.item;
    const target = { type: TARGET_TYPE[source], id };
    if (
      (source !== "lead_task" && source !== "action") ||
      !hasPermission(actor.roles, PERMISSION[source])
    ) {
      return deny(transaction, actor, auditAction, "access_denied", target);
    }
    if (!isUuid(id)) {
      return deny(transaction, actor, auditAction, "invalid_input", target);
    }
    const item = await loadOpenItem(transaction, actor, input.item);
    if (item === "not_found") {
      return { ok: false as const, error: "work_item_not_found" as const };
    }
    if (item === "closed") {
      return deny(transaction, actor, auditAction, "invalid_state", target);
    }
    const result = await change(transaction, actor, item);
    if (!result.ok) return result;
    await enquiryAudit(transaction, actor, {
      action: auditAction,
      outcome: "SUCCEEDED",
      targetType: TARGET_TYPE[source],
      targetId: item.enquiryId ?? item.id,
      metadata: { itemId: item.id },
    });
    return result;
  });
}

/** Updates fields on an item that is still open. False if it was closed meanwhile. */
async function updateOpenItem(
  transaction: EnquiryTransaction,
  actor: EnquiryActor,
  item: LoadedItem,
  data: {
    dueOn?: Date;
    plannedFor?: Date | null;
    assignedMembershipId?: string;
  },
) {
  const where = {
    id: item.id,
    workspaceId: actor.workspaceId,
    status: ActionStatus.OPEN,
  };
  const { count } =
    item.source === "lead_task"
      ? await transaction.enquiryTask.updateMany({ where, data })
      : await transaction.action.updateMany({ where, data });
  return count === 1;
}

const done = (item: LoadedItem) => ({
  ok: true as const,
  source: item.source,
  id: item.id,
});

/**
 * Finishes an item. A next step may be given so finishing and setting what
 * happens next is one change: a lead's next step is another next action on
 * the same lead; a general action's is a new action in the same branch with
 * the same links.
 */
export function completeWorkItem(
  input: EnquiryActorInput & { item: WorkItemRef; next?: NextStep | null },
) {
  return changeItem(input, "complete", async (transaction, actor, item) => {
    if (item.source === "lead_task") {
      const closed = await closeEnquiryTaskInTransaction(
        transaction,
        actor,
        { enquiryId: item.enquiryId!, taskId: item.id },
        EnquiryTaskStatus.DONE,
      );
      if (!closed.ok) throw new EnquiryRollback(closed.error);
    } else {
      const { count } = await transaction.action.updateMany({
        where: {
          id: item.id,
          workspaceId: actor.workspaceId,
          status: ActionStatus.OPEN,
        },
        data: {
          status: ActionStatus.DONE,
          closedAt: new Date(),
          closedByMembershipId: actor.membershipId,
        },
      });
      if (count !== 1) throw new EnquiryRollback("invalid_state");
    }
    if (!input.next) return { ...done(item), nextId: null as string | null };

    const next =
      item.source === "lead_task"
        ? await addEnquiryTaskInTransaction(transaction, actor, {
            enquiryId: item.enquiryId!,
            ...input.next,
          }).then((added) =>
            added.ok ? { ok: true as const, id: added.taskId } : added,
          )
        : await createAction(transaction, actor, {
            ...input.next,
            branchId: item.branchId,
            contactId: item.contactId,
            propertyId: item.propertyId,
            kind: input.next.kind ?? item.kind ?? "other",
          });
    // Nothing is kept unless the next step was saved too.
    if (!next.ok) throw new EnquiryRollback(next.error);
    return { ...done(item), nextId: next.id as string | null };
  });
}

export function cancelWorkItem(
  input: EnquiryActorInput & { item: WorkItemRef },
) {
  return changeItem(input, "cancel", async (transaction, actor, item) => {
    if (item.source === "lead_task") {
      const closed = await closeEnquiryTaskInTransaction(
        transaction,
        actor,
        { enquiryId: item.enquiryId!, taskId: item.id },
        EnquiryTaskStatus.CANCELLED,
      );
      if (!closed.ok) throw new EnquiryRollback(closed.error);
      return done(item);
    }
    const { count } = await transaction.action.updateMany({
      where: {
        id: item.id,
        workspaceId: actor.workspaceId,
        status: ActionStatus.OPEN,
      },
      data: {
        status: ActionStatus.CANCELLED,
        closedAt: new Date(),
        closedByMembershipId: actor.membershipId,
      },
    });
    if (count !== 1) throw new EnquiryRollback("invalid_state");
    return done(item);
  });
}

/**
 * Moves the due date to today or later. Any planned time is cleared because
 * it belonged to the old day.
 */
export function snoozeWorkItem(
  input: EnquiryActorInput & { item: WorkItemRef; dueOn: string; now?: Date },
) {
  return changeItem(input, "snooze", async (transaction, actor, item) => {
    const dueOn = parseActionDueOn(input.dueOn);
    if (!dueOn || dayText(dueOn) < ukToday(input.now)) {
      return deny(
        transaction,
        actor,
        `${item.source === "lead_task" ? "enquiry.task" : "action"}.snooze`,
        "invalid_input",
        { type: TARGET_TYPE[item.source], id: item.id },
      );
    }
    if (
      !(await updateOpenItem(transaction, actor, item, {
        dueOn,
        plannedFor: null,
      }))
    ) {
      throw new EnquiryRollback("invalid_state");
    }
    return done(item);
  });
}

/** Plans the item for a time in the day, or clears the plan with null. */
export function planWorkItem(
  input: EnquiryActorInput & { item: WorkItemRef; plannedFor: string | null },
) {
  return changeItem(input, "plan", async (transaction, actor, item) => {
    const plannedFor =
      input.plannedFor === null ? null : parsePlannedFor(input.plannedFor);
    if (input.plannedFor !== null && !plannedFor) {
      return deny(
        transaction,
        actor,
        `${item.source === "lead_task" ? "enquiry.task" : "action"}.plan`,
        "invalid_input",
        { type: TARGET_TYPE[item.source], id: item.id },
      );
    }
    if (!(await updateOpenItem(transaction, actor, item, { plannedFor }))) {
      throw new EnquiryRollback("invalid_state");
    }
    return done(item);
  });
}

/**
 * Hands the item to a colleague who is active, can work on it, and can see
 * its branch. Any planned time is cleared: the new owner plans their own day.
 */
export function handOverWorkItem(
  input: EnquiryActorInput & {
    item: WorkItemRef;
    assignedMembershipId: string;
  },
) {
  return changeItem(input, "hand_over", async (transaction, actor, item) => {
    const valid =
      isUuid(input.assignedMembershipId) &&
      input.assignedMembershipId !== item.assignedMembershipId &&
      (await canAssignEnquiryWork(
        transaction,
        actor,
        input.assignedMembershipId,
        item.branchId,
        PERMISSION[item.source],
      ));
    if (!valid) {
      return deny(
        transaction,
        actor,
        `${item.source === "lead_task" ? "enquiry.task" : "action"}.hand_over`,
        "invalid_input",
        { type: TARGET_TYPE[item.source], id: item.id },
      );
    }
    if (
      !(await updateOpenItem(transaction, actor, item, {
        assignedMembershipId: input.assignedMembershipId,
        plannedFor: null,
      }))
    ) {
      throw new EnquiryRollback("invalid_state");
    }
    return done(item);
  });
}
