import "server-only";

import type { AccessTransaction } from "@/core/access/data/database-context";
import {
  setWorkspaceDatabaseContext,
  setWorkspaceMemberDatabaseContext,
} from "@/core/access/data/database-context";
import { DATABASE_ROLE_TO_SYSTEM_ROLE } from "@/core/access/data/role-mapping";
import {
  validateMembershipScope,
  type MembershipScope,
} from "@/core/access/domain/scope";
import {
  validateRoleCombination,
  type SystemRole,
} from "@/core/access/domain/role";

export type ContactActor = {
  userIdentityId: string;
  membershipId: string;
  workspaceId: string;
  roles: readonly SystemRole[];
  scope: MembershipScope;
};

export async function resolveContactActor(
  transaction: AccessTransaction,
  input: {
    userIdentityId: string;
    workspaceSlug: string;
  },
): Promise<ContactActor | null> {
  // Server Actions can be called with any arguments: a non-string here would
  // reach Prisma as a filter (such as { in: [...] }) rather than a name.
  if (typeof input.workspaceSlug !== "string") return null;
  const actor = await transaction.membership.findFirst({
    where: {
      userIdentityId: input.userIdentityId,
      status: "ACTIVE",
      workspace: {
        slug: input.workspaceSlug,
        status: "ACTIVE",
        type: { not: "PLATFORM_INTERNAL" },
      },
    },
    select: { id: true, workspaceId: true },
  });
  if (!actor) return null;

  await setWorkspaceDatabaseContext(transaction, actor.workspaceId);
  const membership = await transaction.membership.findUnique({
    where: { id: actor.id },
    select: {
      scopeMode: true,
      roles: { select: { roleCode: true } },
      branchAccess: { select: { branchId: true } },
    },
  });
  if (!membership) return null;

  const roleValidation = validateRoleCombination(
    membership.roles.map(
      ({ roleCode }) => DATABASE_ROLE_TO_SYSTEM_ROLE[roleCode],
    ),
  );
  if (!roleValidation.ok) return null;

  const scopeValidation = validateMembershipScope(
    membership.scopeMode === "WORKSPACE"
      ? { kind: "workspace" }
      : {
          kind: "named_branches",
          branchIds: membership.branchAccess.map(({ branchId }) => branchId),
        },
  );
  if (!scopeValidation.ok) return null;

  await setWorkspaceMemberDatabaseContext(transaction, {
    workspaceId: actor.workspaceId,
    membershipId: actor.id,
    scope: scopeValidation.scope,
  });

  return {
    userIdentityId: input.userIdentityId,
    membershipId: actor.id,
    workspaceId: actor.workspaceId,
    roles: roleValidation.roles,
    scope: scopeValidation.scope,
  };
}
