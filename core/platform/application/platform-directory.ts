import "server-only";

import { cache } from "react";

import { withVerifiedIdentity } from "@/core/access/data/database-context";
import { DATABASE_ROLE_TO_SYSTEM_ROLE } from "@/core/access/data/role-mapping";
import type { SystemRole } from "@/core/access/domain/role";

const MAX_SEARCH_LENGTH = 100;

function searchTerm(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, MAX_SEARCH_LENGTH) : undefined;
}

export type PlatformUserSummary = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  primaryEmail: string | null;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: Date;
  isPlatformOwner: boolean;
  memberships: readonly {
    id: string;
    status: "ACTIVE" | "SUSPENDED" | "ENDED";
    roles: readonly SystemRole[];
    customer: {
      slug: string;
      displayName: string;
      status: "ACTIVE" | "SUSPENDED" | "CLOSED";
    };
  }[];
};

export async function listPlatformUsers(
  authSubject: string,
  search?: string,
): Promise<readonly PlatformUserSummary[] | null> {
  const query = searchTerm(search);

  return withVerifiedIdentity(authSubject, async (transaction, identity) => {
    if (!identity.isPlatformOwner) return null;

    const users = await transaction.userIdentity.findMany({
      where: query
        ? {
            OR: [
              { firstName: { contains: query, mode: "insensitive" } },
              { lastName: { contains: query, mode: "insensitive" } },
              { primaryEmail: { contains: query, mode: "insensitive" } },
            ],
          }
        : undefined,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        primaryEmail: true,
        status: true,
        createdAt: true,
        platformRoles: {
          where: { roleCode: "PLATFORM_OWNER", status: "ACTIVE" },
          select: { id: true },
        },
        memberships: {
          select: {
            id: true,
            status: true,
            roles: { select: { roleCode: true } },
            workspace: {
              select: { slug: true, displayName: true, status: true },
            },
          },
          orderBy: { workspace: { displayName: "asc" } },
        },
      },
      orderBy: [
        { firstName: "asc" },
        { lastName: "asc" },
        { primaryEmail: "asc" },
      ],
    });

    return users.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      primaryEmail: user.primaryEmail,
      status: user.status,
      createdAt: user.createdAt,
      isPlatformOwner: user.platformRoles.length > 0,
      memberships: user.memberships.map((membership) => ({
        id: membership.id,
        status: membership.status,
        roles: membership.roles.map(
          ({ roleCode }) => DATABASE_ROLE_TO_SYSTEM_ROLE[roleCode],
        ),
        customer: membership.workspace,
      })),
    }));
  });
}

export type CustomerSummary = {
  id: string;
  slug: string;
  displayName: string;
  type: "AGENCY" | "LANDLORD";
  status: "ACTIVE" | "SUSPENDED" | "CLOSED";
  createdAt: Date;
  activeBranchCount: number;
  activeUserCount: number;
};

export async function listCustomers(
  authSubject: string,
  search?: string,
): Promise<readonly CustomerSummary[] | null> {
  const query = searchTerm(search);

  return withVerifiedIdentity(authSubject, async (transaction, identity) => {
    if (!identity.isPlatformOwner) return null;

    const customers = await transaction.workspace.findMany({
      where: {
        type: { not: "PLATFORM_INTERNAL" },
        ...(query
          ? {
              OR: [
                { displayName: { contains: query, mode: "insensitive" } },
                { legalName: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        slug: true,
        displayName: true,
        type: true,
        status: true,
        createdAt: true,
        _count: {
          select: {
            branches: { where: { status: "ACTIVE" } },
            memberships: { where: { status: "ACTIVE" } },
          },
        },
      },
      orderBy: { displayName: "asc" },
    });

    return customers.map(({ _count, ...customer }) => ({
      ...customer,
      type: customer.type as "AGENCY" | "LANDLORD",
      activeBranchCount: _count.branches,
      activeUserCount: _count.memberships,
    }));
  });
}

export type CustomerProfile = {
  id: string;
  slug: string;
  displayName: string;
  legalName: string | null;
  companyNumber: string | null;
  primaryEmail: string | null;
  telephone: string | null;
  website: string | null;
  registeredAddress1: string | null;
  registeredAddress2: string | null;
  registeredTownCity: string | null;
  registeredCounty: string | null;
  registeredPostcode: string | null;
  type: "AGENCY" | "LANDLORD";
  status: "ACTIVE" | "SUSPENDED" | "CLOSED";
  createdAt: Date;
};

async function loadCustomerProfile(
  authSubject: string,
  customerSlug: string,
): Promise<CustomerProfile | null> {
  return withVerifiedIdentity(authSubject, async (transaction, identity) => {
    if (!identity.isPlatformOwner) return null;

    const customer = await transaction.workspace.findFirst({
      where: { slug: customerSlug, type: { not: "PLATFORM_INTERNAL" } },
      select: {
        id: true,
        slug: true,
        displayName: true,
        legalName: true,
        companyNumber: true,
        primaryEmail: true,
        telephone: true,
        website: true,
        registeredAddress1: true,
        registeredAddress2: true,
        registeredTownCity: true,
        registeredCounty: true,
        registeredPostcode: true,
        type: true,
        status: true,
        createdAt: true,
      },
    });

    if (!customer) return null;
    return { ...customer, type: customer.type as "AGENCY" | "LANDLORD" };
  });
}

// The customer layout and its pages both need the profile; load it once per
// request. React scopes this cache to a single request, never across users.
export const getCustomerProfile = cache(loadCustomerProfile);

export type CustomerBranchSummary = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  email: string | null;
  telephone: string | null;
  address1: string | null;
  address2: string | null;
  townCity: string | null;
  county: string | null;
  postcode: string | null;
  users: readonly {
    membershipId: string;
    firstName: string | null;
    lastName: string | null;
    primaryEmail: string | null;
    status: "ACTIVE" | "SUSPENDED" | "ENDED";
    scopeMode: "WORKSPACE" | "NAMED_BRANCHES";
  }[];
};

export type CustomerUserSummary = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  primaryEmail: string | null;
  status: "ACTIVE" | "SUSPENDED" | "ENDED";
  roles: readonly SystemRole[];
  scopeMode: "WORKSPACE" | "NAMED_BRANCHES";
  branches: readonly {
    id: string;
    name: string;
    status: "ACTIVE" | "INACTIVE";
  }[];
};

export async function listCustomerUsers(
  authSubject: string,
  customerSlug: string,
): Promise<readonly CustomerUserSummary[] | null> {
  return withVerifiedIdentity(authSubject, async (transaction, identity) => {
    if (!identity.isPlatformOwner) return null;

    const customer = await transaction.workspace.findFirst({
      where: { slug: customerSlug, type: { not: "PLATFORM_INTERNAL" } },
      select: {
        memberships: {
          select: {
            id: true,
            status: true,
            scopeMode: true,
            userIdentity: {
              select: {
                firstName: true,
                lastName: true,
                primaryEmail: true,
              },
            },
            roles: { select: { roleCode: true } },
            branchAccess: {
              select: {
                branch: {
                  select: { id: true, name: true, status: true },
                },
              },
              orderBy: { branch: { name: "asc" } },
            },
          },
          orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    return (
      customer?.memberships.map((membership) => ({
        id: membership.id,
        firstName: membership.userIdentity.firstName,
        lastName: membership.userIdentity.lastName,
        primaryEmail: membership.userIdentity.primaryEmail,
        status: membership.status,
        roles: membership.roles.map(
          ({ roleCode }) => DATABASE_ROLE_TO_SYSTEM_ROLE[roleCode],
        ),
        scopeMode: membership.scopeMode,
        branches: membership.branchAccess.map(({ branch }) => branch),
      })) ?? null
    );
  });
}

export async function listCustomerBranches(
  authSubject: string,
  customerSlug: string,
): Promise<readonly CustomerBranchSummary[] | null> {
  return withVerifiedIdentity(authSubject, async (transaction, identity) => {
    if (!identity.isPlatformOwner) return null;

    const customer = await transaction.workspace.findFirst({
      where: { slug: customerSlug, type: { not: "PLATFORM_INTERNAL" } },
      select: {
        branches: {
          select: {
            id: true,
            name: true,
            status: true,
            email: true,
            telephone: true,
            address1: true,
            address2: true,
            townCity: true,
            county: true,
            postcode: true,
          },
          orderBy: { name: "asc" },
        },
        memberships: {
          select: {
            id: true,
            status: true,
            scopeMode: true,
            userIdentity: {
              select: {
                firstName: true,
                lastName: true,
                primaryEmail: true,
              },
            },
            branchAccess: { select: { branchId: true } },
          },
          orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    if (!customer) return null;

    return customer.branches.map((branch) => ({
      ...branch,
      users: customer.memberships.flatMap((membership) => {
        const hasAccess =
          membership.scopeMode === "WORKSPACE" ||
          membership.branchAccess.some(
            ({ branchId }) => branchId === branch.id,
          );
        if (!hasAccess) return [];

        return [
          {
            membershipId: membership.id,
            firstName: membership.userIdentity.firstName,
            lastName: membership.userIdentity.lastName,
            primaryEmail: membership.userIdentity.primaryEmail,
            status: membership.status,
            scopeMode: membership.scopeMode,
          },
        ];
      }),
    }));
  });
}
