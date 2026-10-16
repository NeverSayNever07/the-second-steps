import "server-only";

import { randomUUID } from "node:crypto";
import type { SandboxPersona } from "@/core/auth/config";
import { getSandboxPersona, isSandboxEnvironment } from "@/core/auth/config";
import { db } from "@/core/db/client";
import { AuthenticationProvider } from "@/core/db/generated/enums";
import {
  type AccessTransaction,
  setSandboxProvisioningContext,
  setWorkspaceDatabaseContext,
} from "./database-context";

const SANDBOX_WORKSPACE = {
  slug: "oakfield-lettings-demo",
  displayName: "Oakfield Lettings",
  legalName: "Oakfield Lettings Limited (Demo)",
  companyNumber: "00000000",
  primaryEmail: "hello@oakfield.test",
  telephone: "020 7946 0998",
  website: "https://oakfield.example",
  registeredAddress1: "1 Example Square",
  registeredTownCity: "Demo Town",
  registeredCounty: "London",
  registeredPostcode: "ZZ1 1ZZ",
} as const;

const SANDBOX_PERSONA_NAMES: Readonly<
  Record<SandboxPersona, { firstName: string; lastName: string }>
> = {
  account_owner: { firstName: "Olivia", lastName: "Hart" },
  branch_manager: { firstName: "Ben", lastName: "Carter" },
  platform_owner: { firstName: "Theo", lastName: "Grant" },
  dual_owner: { firstName: "Maya", lastName: "Ellis" },
  no_access: { firstName: "Noah", lastName: "Reed" },
};

const SANDBOX_BRANCHES = [
  {
    name: "Main Branch",
    email: "main@oakfield.test",
    telephone: "020 7946 0998",
    address1: "1 Example Square",
    townCity: "Demo Town",
    county: "London",
    postcode: "ZZ1 1ZZ",
  },
  {
    name: "Riverside Branch",
    email: "riverside@oakfield.test",
    telephone: "020 7946 0999",
    address1: "24 Riverside Walk",
    townCity: "Demo Town",
    county: "London",
    postcode: "ZZ1 2ZZ",
  },
] as const;

type SandboxBranchName = (typeof SANDBOX_BRANCHES)[number]["name"];

const SANDBOX_DIRECTORY_FIXTURES = [
  {
    identityId: "10000000-0000-4000-8000-000000000001",
    firstName: "Amelia",
    lastName: "Stone",
    primaryEmail: "amelia.admin@oakfield.test",
    status: "ACTIVE",
    roleCode: "AGENCY_ADMIN",
    branchNames: null,
  },
  {
    identityId: "10000000-0000-4000-8000-000000000002",
    firstName: "Priya",
    lastName: "Shah",
    primaryEmail: "priya.manager@oakfield.test",
    status: "ACTIVE",
    roleCode: "PROPERTY_MANAGER",
    branchNames: ["Main Branch", "Riverside Branch"],
  },
  {
    identityId: "10000000-0000-4000-8000-000000000003",
    firstName: "Ruby",
    lastName: "Walker",
    primaryEmail: "ruby.negotiator@oakfield.test",
    status: "ACTIVE",
    roleCode: "NEGOTIATOR",
    branchNames: ["Riverside Branch"],
  },
  {
    identityId: "10000000-0000-4000-8000-000000000004",
    firstName: "Jordan",
    lastName: "Reed",
    primaryEmail: "jordan.suspended@oakfield.test",
    status: "SUSPENDED",
    roleCode: "READ_ONLY",
    branchNames: ["Main Branch"],
  },
] as const satisfies readonly {
  identityId: string;
  firstName: string;
  lastName: string;
  primaryEmail: string;
  status: "ACTIVE" | "SUSPENDED";
  roleCode: "AGENCY_ADMIN" | "PROPERTY_MANAGER" | "NEGOTIATOR" | "READ_ONLY";
  branchNames: readonly SandboxBranchName[] | null;
}[];

function needsWorkspace(persona: SandboxPersona) {
  return (
    persona === "account_owner" ||
    persona === "branch_manager" ||
    persona === "dual_owner"
  );
}

function needsPlatformRole(persona: SandboxPersona) {
  return persona === "platform_owner" || persona === "dual_owner";
}

function workspaceAccessFor(persona: SandboxPersona): {
  roleCode: "WORKSPACE_OWNER" | "BRANCH_MANAGER";
  branchNames: readonly SandboxBranchName[] | null;
} | null {
  if (persona === "account_owner" || persona === "dual_owner") {
    return { roleCode: "WORKSPACE_OWNER", branchNames: null };
  }
  if (persona === "branch_manager") {
    return { roleCode: "BRANCH_MANAGER", branchNames: ["Main Branch"] };
  }
  return null;
}

async function upsertSandboxMembership(
  transaction: AccessTransaction,
  input: {
    workspaceId: string;
    userIdentityId: string;
    status: "ACTIVE" | "SUSPENDED";
    roleCode:
      | "WORKSPACE_OWNER"
      | "AGENCY_ADMIN"
      | "BRANCH_MANAGER"
      | "PROPERTY_MANAGER"
      | "NEGOTIATOR"
      | "READ_ONLY";
    branchIds: readonly string[] | null;
    assignedByUserIdentityId: string;
  },
) {
  const scopeMode = input.branchIds ? "NAMED_BRANCHES" : "WORKSPACE";
  const membership = await transaction.membership.upsert({
    where: {
      workspaceId_userIdentityId: {
        workspaceId: input.workspaceId,
        userIdentityId: input.userIdentityId,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      userIdentityId: input.userIdentityId,
      status: input.status,
      scopeMode,
    },
    update: {
      status: input.status,
      scopeMode,
      endedAt: null,
    },
  });

  await transaction.membershipRole.deleteMany({
    where: { membershipId: membership.id, roleCode: { not: input.roleCode } },
  });
  await transaction.membershipRole.upsert({
    where: {
      membershipId_roleCode: {
        membershipId: membership.id,
        roleCode: input.roleCode,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      membershipId: membership.id,
      roleCode: input.roleCode,
      assignedByUserIdentityId: input.assignedByUserIdentityId,
    },
    update: {},
  });

  await transaction.membershipBranchAccess.deleteMany({
    where: { membershipId: membership.id },
  });
  if (input.branchIds) {
    await transaction.membershipBranchAccess.createMany({
      data: input.branchIds.map((branchId) => ({
        workspaceId: input.workspaceId,
        membershipId: membership.id,
        branchId,
        assignedByUserIdentityId: input.assignedByUserIdentityId,
      })),
    });
  }
}

function branchIdsFor(
  branches: ReadonlyMap<SandboxBranchName, string>,
  names: readonly SandboxBranchName[] | null,
) {
  if (!names) return null;

  return names.map((name) => {
    const branchId = branches.get(name);
    if (!branchId) throw new Error(`Sandbox branch ${name} was not created.`);
    return branchId;
  });
}

export async function provisionSandboxAccess(input: {
  authSubject: string;
  email: string;
}) {
  if (!isSandboxEnvironment()) return;

  const persona = getSandboxPersona(input.email);
  if (!persona) return;

  await db.$transaction(async (transaction) => {
    const candidateUserIdentityId = randomUUID();
    await setSandboxProvisioningContext(transaction, {
      authSubject: input.authSubject,
      userIdentityId: candidateUserIdentityId,
      platformOwner: true,
    });

    const existingLink =
      await transaction.authenticationProviderLink.findUnique({
        where: {
          provider_providerSubject: {
            provider: AuthenticationProvider.SUPABASE,
            providerSubject: input.authSubject,
          },
        },
      });
    const userIdentityId =
      existingLink?.userIdentityId ?? candidateUserIdentityId;

    await setSandboxProvisioningContext(transaction, {
      authSubject: input.authSubject,
      userIdentityId,
      platformOwner: true,
    });

    if (!existingLink) {
      await transaction.userIdentity.create({
        data: {
          id: userIdentityId,
          ...SANDBOX_PERSONA_NAMES[persona],
          primaryEmail: input.email.trim().toLowerCase(),
        },
      });
      await transaction.authenticationProviderLink.create({
        data: {
          userIdentityId,
          provider: AuthenticationProvider.SUPABASE,
          providerSubject: input.authSubject,
        },
      });
    } else {
      await transaction.userIdentity.update({
        where: { id: userIdentityId },
        data: {
          ...SANDBOX_PERSONA_NAMES[persona],
          primaryEmail: input.email.trim().toLowerCase(),
        },
      });
    }

    if (needsPlatformRole(persona)) {
      await transaction.platformRoleAssignment.upsert({
        where: {
          userIdentityId_roleCode: {
            userIdentityId,
            roleCode: "PLATFORM_OWNER",
          },
        },
        create: {
          userIdentityId,
          roleCode: "PLATFORM_OWNER",
          status: "ACTIVE",
          assignedByUserIdentityId: userIdentityId,
        },
        update: { status: "ACTIVE", endedAt: null },
      });
    }

    if (needsWorkspace(persona)) {
      const workspace = await transaction.workspace.upsert({
        where: { slug: SANDBOX_WORKSPACE.slug },
        create: {
          ...SANDBOX_WORKSPACE,
          type: "AGENCY",
          status: "ACTIVE",
        },
        update: {
          ...SANDBOX_WORKSPACE,
          status: "ACTIVE",
        },
      });

      await setWorkspaceDatabaseContext(transaction, workspace.id);

      const branches = new Map<SandboxBranchName, string>();
      for (const branchDetails of SANDBOX_BRANCHES) {
        const branch = await transaction.branch.upsert({
          where: {
            workspaceId_name: {
              workspaceId: workspace.id,
              name: branchDetails.name,
            },
          },
          create: {
            workspaceId: workspace.id,
            ...branchDetails,
            status: "ACTIVE",
          },
          update: { ...branchDetails, status: "ACTIVE" },
        });
        branches.set(branchDetails.name, branch.id);
      }

      for (const fixture of SANDBOX_DIRECTORY_FIXTURES) {
        await transaction.userIdentity.upsert({
          where: { id: fixture.identityId },
          create: {
            id: fixture.identityId,
            firstName: fixture.firstName,
            lastName: fixture.lastName,
            primaryEmail: fixture.primaryEmail,
          },
          update: {
            firstName: fixture.firstName,
            lastName: fixture.lastName,
            primaryEmail: fixture.primaryEmail,
          },
        });
        await upsertSandboxMembership(transaction, {
          workspaceId: workspace.id,
          userIdentityId: fixture.identityId,
          status: fixture.status,
          roleCode: fixture.roleCode,
          branchIds: branchIdsFor(branches, fixture.branchNames),
          assignedByUserIdentityId: userIdentityId,
        });
      }

      const access = workspaceAccessFor(persona);
      if (access) {
        await upsertSandboxMembership(transaction, {
          workspaceId: workspace.id,
          userIdentityId,
          status: "ACTIVE",
          roleCode: access.roleCode,
          branchIds: branchIdsFor(branches, access.branchNames),
          assignedByUserIdentityId: userIdentityId,
        });
      }
    }

    await transaction.auditEvent.create({
      data: {
        workspaceId: null,
        actorUserIdentityId: userIdentityId,
        action: "sandbox.access.provisioned",
        outcome: "SUCCEEDED",
        targetType: "sandbox_persona",
        targetId: persona,
        requestId: randomUUID(),
        metadata: { source: "local_magic_link" },
      },
    });
  });
}
