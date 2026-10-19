import "server-only";

import { withVerifiedIdentity } from "@/core/access/data/database-context";
import { hasPermission, type SystemRole } from "@/core/access/domain/role";
import {
  ContactKind,
  ContactStatus,
  EnquiryStage,
} from "@/core/db/generated/enums";
import type { Prisma } from "@/core/db/generated/client";
import { isUuid, SEARCH_TEXT_MAX } from "@/core/properties/domain/ids";
import { resolveContactActor } from "./contact-actor";

const OPEN_LEAD_STAGES = [
  EnquiryStage.NEW_ENQUIRY,
  EnquiryStage.APPRAISAL_BOOKED,
  EnquiryStage.APPRAISAL_COMPLETED,
] as const;

export const LANDLORD_LIST_PAGE_SIZE = 25;

export type LandlordRelationshipState = "current" | "former" | "all";
export type LandlordContactState = "active" | "archived" | "all";

export type LandlordListItem = {
  id: string;
  reference: string;
  name: string;
  kind: "person" | "organisation";
  archived: boolean;
  preferredContact: { kind: "email" | "telephone"; value: string } | null;
  propertiesWithUs: number;
  openLeads: number;
  currentInstructions: number;
  branches: { id: string; name: string }[];
  currentRelationship: boolean;
};

export type LandlordListResult = {
  items: LandlordListItem[];
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

type LandlordListInput = {
  authSubject: string;
  workspaceSlug: string;
  query?: string;
  kind?: "person" | "organisation";
  branchId?: string;
  relationship?: LandlordRelationshipState;
  contactState?: LandlordContactState;
  page?: number;
};

const currentRelationship: Prisma.ContactWhereInput = {
  OR: [
    { enquiries: { some: { stage: { in: [...OPEN_LEAD_STAGES] } } } },
    { propertyOwnerships: { some: { endedAt: null } } },
    {
      instructionParties: {
        some: { removedAt: null, instruction: { endedOn: null } },
      },
    },
  ],
};

const anyLandlordHistory: Prisma.ContactWhereInput = {
  OR: [
    { enquiries: { some: {} } },
    { propertyOwnerships: { some: {} } },
    { instructionParties: { some: {} } },
  ],
};

function relationshipFilter(
  state: LandlordRelationshipState,
): Prisma.ContactWhereInput {
  if (state === "current") {
    return currentRelationship;
  }
  if (state === "former") {
    return { AND: [anyLandlordHistory, { NOT: currentRelationship }] };
  }
  return anyLandlordHistory;
}

function contactStatuses(state: LandlordContactState): ContactStatus[] {
  if (state === "archived") {
    return [ContactStatus.ARCHIVED];
  }
  if (state === "all") {
    return [ContactStatus.ACTIVE, ContactStatus.ARCHIVED];
  }
  return [ContactStatus.ACTIVE];
}

function landlordName(contact: {
  kind: ContactKind;
  firstName: string | null;
  lastName: string | null;
  legalName: string | null;
}): string {
  if (contact.kind === ContactKind.ORGANISATION) {
    return contact.legalName ?? "Unnamed organisation";
  }
  return (
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
    "Unnamed person"
  );
}

function mayReadLandlordSummary(roles: readonly SystemRole[]) {
  return (
    hasPermission(roles, "contact.read") &&
    hasPermission(roles, "property.read") &&
    hasPermission(roles, "enquiry.read") &&
    hasPermission(roles, "instruction.read")
  );
}

/** One row per visible landlord contact, with counts limited by branch RLS. */
export async function listLandlords(
  input: LandlordListInput,
): Promise<LandlordListResult> {
  const page = Math.min(Math.max(Math.trunc(input.page ?? 1), 1), 10_000);
  const empty: LandlordListResult = {
    items: [],
    page,
    hasPrevious: page > 1,
    hasNext: false,
  };
  if (input.branchId && !isUuid(input.branchId)) {
    return empty;
  }
  const query = input.query?.trim().slice(0, SEARCH_TEXT_MAX);
  const relationship = input.relationship ?? "current";
  const contactState = input.contactState ?? "active";
  const result = await withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor || !mayReadLandlordSummary(actor.roles)) {
        return null;
      }
      const rows = await transaction.contact.findMany({
        where: {
          workspaceId: actor.workspaceId,
          status: { in: contactStatuses(contactState) },
          AND: [
            relationshipFilter(relationship),
            ...(query
              ? [
                  {
                    OR: [
                      {
                        reference: { contains: query, mode: "insensitive" },
                      },
                      {
                        firstName: { contains: query, mode: "insensitive" },
                      },
                      {
                        lastName: { contains: query, mode: "insensitive" },
                      },
                      {
                        legalName: { contains: query, mode: "insensitive" },
                      },
                      {
                        tradingName: {
                          contains: query,
                          mode: "insensitive",
                        },
                      },
                      {
                        registrationNumber: {
                          contains: query,
                          mode: "insensitive",
                        },
                      },
                      {
                        contactPoints: {
                          some: {
                            archivedAt: null,
                            value: {
                              contains: query,
                              mode: "insensitive",
                            },
                          },
                        },
                      },
                    ],
                  } satisfies Prisma.ContactWhereInput,
                ]
              : []),
          ],
          ...(input.kind
            ? {
                kind:
                  input.kind === "person"
                    ? ContactKind.PERSON
                    : ContactKind.ORGANISATION,
              }
            : {}),
          ...(input.branchId
            ? {
                branchLinks: {
                  some: { branchId: input.branchId, endedAt: null },
                },
              }
            : {}),
        },
        select: {
          id: true,
          reference: true,
          kind: true,
          status: true,
          firstName: true,
          lastName: true,
          legalName: true,
          contactPoints: {
            where: { archivedAt: null },
            select: { kind: true, value: true },
            orderBy: [{ isPreferred: "desc" }, { createdAt: "asc" }],
          },
          branchLinks: {
            where: { endedAt: null },
            select: { branch: { select: { id: true, name: true } } },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          },
          enquiries: {
            where: { stage: { in: [...OPEN_LEAD_STAGES] } },
            select: { id: true },
          },
          propertyOwnerships: {
            where: { endedAt: null },
            select: { id: true },
          },
          instructionParties: {
            where: { removedAt: null, instruction: { endedOn: null } },
            select: {
              instructionId: true,
              instruction: { select: { propertyId: true } },
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * LANDLORD_LIST_PAGE_SIZE,
        take: LANDLORD_LIST_PAGE_SIZE + 1,
      });
      return rows;
    },
  );
  if (!result) {
    return empty;
  }
  const rows = result.slice(0, LANDLORD_LIST_PAGE_SIZE);
  return {
    page,
    hasPrevious: page > 1,
    hasNext: result.length > LANDLORD_LIST_PAGE_SIZE,
    items: rows.map((contact): LandlordListItem => {
      const preferred = contact.contactPoints[0] ?? null;
      const instructionIds = new Set(
        contact.instructionParties.map((party) => party.instructionId),
      );
      const propertyIds = new Set(
        contact.instructionParties.map((party) => party.instruction.propertyId),
      );
      const hasCurrentRelationship =
        contact.enquiries.length > 0 ||
        contact.propertyOwnerships.length > 0 ||
        instructionIds.size > 0;
      return {
        id: contact.id,
        reference: contact.reference,
        name: landlordName(contact),
        kind: contact.kind === ContactKind.PERSON ? "person" : "organisation",
        archived: contact.status === ContactStatus.ARCHIVED,
        preferredContact: preferred
          ? {
              kind: preferred.kind === "EMAIL" ? "email" : "telephone",
              value: preferred.value,
            }
          : null,
        propertiesWithUs: propertyIds.size,
        openLeads: contact.enquiries.length,
        currentInstructions: instructionIds.size,
        branches: contact.branchLinks.map(({ branch }) => branch),
        currentRelationship: hasCurrentRelationship,
      };
    }),
  };
}

/** Distinct visible properties with a current instruction for this landlord. */
export async function getPropertiesWithUsCount(input: {
  authSubject: string;
  workspaceSlug: string;
  contactId: string;
}): Promise<number | null> {
  if (!isUuid(input.contactId)) {
    return null;
  }
  return withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor || !mayReadLandlordSummary(actor.roles)) {
        return null;
      }
      const parties = await transaction.instructionParty.findMany({
        where: {
          workspaceId: actor.workspaceId,
          contactId: input.contactId,
          removedAt: null,
          instruction: { endedOn: null },
        },
        select: { instruction: { select: { propertyId: true } } },
      });
      return new Set(parties.map((party) => party.instruction.propertyId)).size;
    },
  );
}
