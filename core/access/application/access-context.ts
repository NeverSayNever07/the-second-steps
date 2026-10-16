import "server-only";

import { cache } from "react";

import type { Permission } from "@/core/access/domain/permission";
import type { SystemRole } from "@/core/access/domain/role";
import {
  permissionsForRoles,
  validateRoleCombination,
} from "@/core/access/domain/role";
import type { MembershipScope } from "@/core/access/domain/scope";
import { validateMembershipScope } from "@/core/access/domain/scope";
import {
  setWorkspaceDatabaseContext,
  withVerifiedIdentity,
} from "@/core/access/data/database-context";
import { DATABASE_ROLE_TO_SYSTEM_ROLE } from "@/core/access/data/role-mapping";

export type WorkspaceDestination = {
  id: string;
  slug: string;
  displayName: string;
  membershipId: string;
};

export type AccessDestinations = {
  isPlatformOwner: boolean;
  workspaces: readonly WorkspaceDestination[];
};

export type WorkspaceAccessContext = {
  userIdentityId: string;
  workspace: {
    id: string;
    slug: string;
    displayName: string;
  };
  membership: {
    id: string;
    roles: readonly SystemRole[];
    scope: MembershipScope;
  };
  permissions: ReturnType<typeof permissionsForRoles>;
};

export class AccessDeniedError extends Error {
  constructor() {
    super("Access denied.");
    this.name = "AccessDeniedError";
  }
}

export async function getAccessDestinations(
  authSubject: string,
): Promise<AccessDestinations | null> {
  return withVerifiedIdentity(authSubject, async (transaction, identity) => {
    const memberships = await transaction.membership.findMany({
      where: {
        userIdentityId: identity.userIdentityId,
        status: "ACTIVE",
        workspace: { status: "ACTIVE" },
      },
      select: {
        id: true,
        workspace: {
          select: { id: true, slug: true, displayName: true },
        },
      },
      orderBy: { workspace: { displayName: "asc" } },
    });

    return {
      isPlatformOwner: identity.isPlatformOwner,
      workspaces: memberships.map((membership) => ({
        membershipId: membership.id,
        ...membership.workspace,
      })),
    };
  });
}

async function loadWorkspaceAccessContext(
  authSubject: string,
  workspaceSlug: string,
): Promise<WorkspaceAccessContext | null> {
  return withVerifiedIdentity(authSubject, async (transaction, identity) => {
    const membershipSummary = await transaction.membership.findFirst({
      where: {
        userIdentityId: identity.userIdentityId,
        status: "ACTIVE",
        workspace: { slug: workspaceSlug, status: "ACTIVE" },
      },
      select: {
        id: true,
        workspace: {
          select: { id: true, slug: true, displayName: true },
        },
      },
    });
    if (!membershipSummary) return null;

    await setWorkspaceDatabaseContext(
      transaction,
      membershipSummary.workspace.id,
    );

    const membership = await transaction.membership.findUnique({
      where: { id: membershipSummary.id },
      select: {
        id: true,
        scopeMode: true,
        roles: { select: { roleCode: true } },
        branchAccess: { select: { branchId: true } },
      },
    });
    if (!membership) return null;

    const roles = membership.roles.map(
      ({ roleCode }) => DATABASE_ROLE_TO_SYSTEM_ROLE[roleCode],
    );
    const roleValidation = validateRoleCombination(roles);
    if (!roleValidation.ok) return null;

    const proposedScope: MembershipScope =
      membership.scopeMode === "WORKSPACE"
        ? { kind: "workspace" }
        : {
            kind: "named_branches",
            branchIds: membership.branchAccess.map(({ branchId }) => branchId),
          };
    const scopeValidation = validateMembershipScope(proposedScope);
    if (!scopeValidation.ok) return null;

    return {
      userIdentityId: identity.userIdentityId,
      workspace: membershipSummary.workspace,
      membership: {
        id: membership.id,
        roles: roleValidation.roles,
        scope: scopeValidation.scope,
      },
      permissions: permissionsForRoles(roleValidation.roles),
    };
  });
}

// A layout and its page both need the context; one request loads it once.
// React scopes this cache to a single server request, never across users.
export const getWorkspaceAccessContext = cache(loadWorkspaceAccessContext);

export async function getPlatformAccessContext(authSubject: string) {
  return withVerifiedIdentity(authSubject, async (_transaction, identity) => {
    if (!identity.isPlatformOwner) return null;
    return { userIdentityId: identity.userIdentityId };
  });
}

export function requireWorkspacePermission(
  context: WorkspaceAccessContext,
  permission: Permission,
) {
  if (!context.permissions.has(permission)) throw new AccessDeniedError();
}
