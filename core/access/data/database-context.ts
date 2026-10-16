import "server-only";

import { Prisma } from "@/core/db/generated/client";
import { AuthenticationProvider } from "@/core/db/generated/enums";
import { db } from "@/core/db/client";
import type { MembershipScope } from "@/core/access/domain/scope";

export type AccessTransaction = Prisma.TransactionClient;

export type VerifiedIdentityContext = {
  userIdentityId: string;
  isPlatformOwner: boolean;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label: string) {
  if (!UUID_PATTERN.test(value)) throw new Error(`${label} is not a UUID.`);
}

async function setLocal(
  transaction: AccessTransaction,
  setting: string,
  value: string,
) {
  await setLocals(transaction, { [setting]: value });
}

// One statement for all settings: each statement is a round trip to the
// database, and these run before every read. Values stay bound parameters.
async function setLocals(
  transaction: AccessTransaction,
  settings: Readonly<Record<string, string>>,
) {
  const assignments = Object.entries(settings).map(
    ([setting, value]) => Prisma.sql`set_config(${setting}, ${value}, true)`,
  );
  await transaction.$queryRaw`SELECT ${Prisma.join(assignments)}`;
}

export async function setWorkspaceDatabaseContext(
  transaction: AccessTransaction,
  workspaceId: string,
) {
  assertUuid(workspaceId, "workspaceId");
  await setLocal(transaction, "app.workspace_id", workspaceId);
}

export async function setWorkspaceMemberDatabaseContext(
  transaction: AccessTransaction,
  input: {
    workspaceId: string;
    membershipId: string;
    scope: MembershipScope;
  },
) {
  assertUuid(input.workspaceId, "workspaceId");
  assertUuid(input.membershipId, "membershipId");

  const branchIds =
    input.scope.kind === "named_branches" ? input.scope.branchIds : [];
  for (const branchId of branchIds) assertUuid(branchId, "branchId");

  await setLocals(transaction, {
    "app.workspace_id": input.workspaceId,
    "app.membership_id": input.membershipId,
    "app.membership_scope_mode": input.scope.kind,
    "app.allowed_branch_ids": `{${branchIds.join(",")}}`,
  });
}

export async function lockWorkspaceAccessChanges(
  transaction: AccessTransaction,
  workspaceId: string,
) {
  assertUuid(workspaceId, "workspaceId");
  await transaction.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${workspaceId}, 0))
  `;
}

export async function withVerifiedIdentity<T>(
  authSubject: string,
  operation: (
    transaction: AccessTransaction,
    context: VerifiedIdentityContext,
  ) => Promise<T>,
): Promise<T | null> {
  assertUuid(authSubject, "authSubject");

  return db.$transaction(async (transaction) => {
    await setLocal(transaction, "app.auth_subject", authSubject);

    const providerLink =
      await transaction.authenticationProviderLink.findUnique({
        where: {
          provider_providerSubject: {
            provider: AuthenticationProvider.SUPABASE,
            providerSubject: authSubject,
          },
        },
      });

    if (!providerLink) return null;

    await setLocal(
      transaction,
      "app.user_identity_id",
      providerLink.userIdentityId,
    );

    const identity = await transaction.userIdentity.findUnique({
      where: { id: providerLink.userIdentityId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!identity) return null;

    const platformRole = await transaction.platformRoleAssignment.findUnique({
      where: {
        userIdentityId_roleCode: {
          userIdentityId: identity.id,
          roleCode: "PLATFORM_OWNER",
        },
        status: "ACTIVE",
      },
      select: { id: true },
    });
    const isPlatformOwner = Boolean(platformRole);

    await setLocal(
      transaction,
      "app.platform_owner",
      isPlatformOwner ? "true" : "false",
    );

    return operation(transaction, {
      userIdentityId: identity.id,
      isPlatformOwner,
    });
  });
}

export async function setSandboxProvisioningContext(
  transaction: AccessTransaction,
  values: {
    authSubject: string;
    userIdentityId: string;
    platformOwner: boolean;
  },
) {
  assertUuid(values.authSubject, "authSubject");
  assertUuid(values.userIdentityId, "userIdentityId");

  await setLocal(transaction, "app.auth_subject", values.authSubject);
  await setLocal(transaction, "app.user_identity_id", values.userIdentityId);
  await setLocal(transaction, "app.identity_provisioning", "true");
  await setLocal(
    transaction,
    "app.platform_owner",
    values.platformOwner ? "true" : "false",
  );
}
