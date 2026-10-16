import "server-only";

import { randomUUID } from "node:crypto";
import {
  withVerifiedIdentity,
  type AccessTransaction,
} from "@/core/access/data/database-context";
import { DATABASE_ROLE_TO_SYSTEM_ROLE } from "@/core/access/data/role-mapping";
import {
  hasPermission,
  validateRoleCombination,
} from "@/core/access/domain/role";
import {
  hasBranchAccess,
  validateMembershipScope,
} from "@/core/access/domain/scope";
import {
  resolveContactActor,
  type ContactActor,
} from "@/core/contacts/application/contact-actor";

export type EnquiryTransaction = AccessTransaction;
export type EnquiryActor = ContactActor;
export type EnquiryActorInput = {
  authSubject: string;
  workspaceSlug: string;
};

export type EnquiryWriteError =
  | "access_denied"
  | "enquiry_not_found"
  | "appraisal_not_found"
  | "task_not_found"
  | "work_item_not_found"
  | "contact_not_found"
  | "property_not_found"
  | "list_item_not_found"
  | "duplicate_review_required"
  | "invalid_input"
  | "invalid_state";

export type EnquiryFailure = { ok: false; error: EnquiryWriteError };

/** Throws inside a transaction so earlier writes are rolled back together. */
export class EnquiryRollback extends Error {
  constructor(readonly error: EnquiryWriteError) {
    super(`Enquiry change rolled back: ${error}`);
  }
}

export function enquiryAudit(
  transaction: EnquiryTransaction,
  actor: EnquiryActor,
  input: {
    action: string;
    outcome: "SUCCEEDED" | "DENIED";
    targetId?: string;
    targetType?: string;
    metadata?: Record<string, string | string[]>;
  },
) {
  return transaction.auditEvent.create({
    data: {
      workspaceId: actor.workspaceId,
      actorUserIdentityId: actor.userIdentityId,
      actorMembershipId: actor.membershipId,
      action: input.action,
      outcome: input.outcome,
      targetType: input.targetType ?? "enquiry",
      targetId: input.targetId,
      requestId: randomUUID(),
      metadata: input.metadata,
    },
  });
}

export async function enquiryDeny(
  transaction: EnquiryTransaction,
  actor: EnquiryActor,
  action: string,
  error: EnquiryWriteError,
  targetId?: string,
): Promise<EnquiryFailure> {
  await enquiryAudit(transaction, actor, {
    action,
    outcome: "DENIED",
    targetId,
    metadata: { reason: error },
  });
  return { ok: false, error };
}

export async function withEnquiryActor<T extends { ok: true }>(
  input: EnquiryActorInput,
  operation: (
    transaction: EnquiryTransaction,
    actor: EnquiryActor,
  ) => Promise<T | EnquiryFailure>,
): Promise<T | EnquiryFailure> {
  try {
    const result = await withVerifiedIdentity(
      input.authSubject,
      async (transaction, identity): Promise<T | EnquiryFailure> => {
        const actor = await resolveContactActor(transaction, {
          userIdentityId: identity.userIdentityId,
          workspaceSlug: input.workspaceSlug,
        });
        if (!actor) return { ok: false, error: "access_denied" };
        return operation(transaction, actor);
      },
    );
    return result ?? { ok: false, error: "access_denied" };
  } catch (error) {
    if (error instanceof EnquiryRollback) {
      return { ok: false, error: error.error };
    }
    if (isConflict(error)) return { ok: false, error: "invalid_state" };
    throw error;
  }
}

function isConflict(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  const text = String((error as { message?: unknown } | null)?.message ?? "");
  return (
    code === "P2002" ||
    /unique constraint|violates check constraint|23505|23514/i.test(text)
  );
}

/**
 * A colleague's display name. The database hides identities a role may not
 * see, so the identity can be missing; never assume it is there.
 */
export function staffName(
  identity: {
    firstName: string | null;
    lastName: string | null;
    primaryEmail: string | null;
  } | null,
) {
  if (!identity) return "A colleague";
  const name = [identity.firstName, identity.lastName]
    .filter(Boolean)
    .join(" ");
  return name || identity.primaryEmail || "Unnamed user";
}

export async function lockEnquiry(
  transaction: EnquiryTransaction,
  actor: EnquiryActor,
  enquiryId: string,
) {
  await transaction.$queryRaw`
    SELECT "id" FROM "landlord_enquiries"
    WHERE "id" = ${enquiryId}::uuid
      AND "workspace_id" = ${actor.workspaceId}::uuid
    FOR UPDATE
  `;
}

/**
 * True only when the proposed assignee is active, holds the permission (by
 * default updating enquiries), and can see the branch.
 */
export async function canAssignEnquiryWork(
  transaction: EnquiryTransaction,
  actor: EnquiryActor,
  membershipId: string,
  branchId: string,
  permission: "enquiry.update" | "action.manage" = "enquiry.update",
) {
  const membership = await transaction.membership.findFirst({
    where: {
      id: membershipId,
      workspaceId: actor.workspaceId,
      status: "ACTIVE",
    },
    select: {
      scopeMode: true,
      roles: { select: { roleCode: true } },
      branchAccess: { select: { branchId: true } },
    },
  });
  if (!membership) return false;

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
          branchIds: membership.branchAccess.map(({ branchId: id }) => id),
        },
  );
  return (
    roles.ok &&
    scope.ok &&
    hasPermission(roles.roles, permission) &&
    hasBranchAccess(scope.scope, branchId)
  );
}
