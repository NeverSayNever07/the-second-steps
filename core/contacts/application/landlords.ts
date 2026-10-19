import "server-only";

import { withVerifiedIdentity } from "@/core/access/data/database-context";
import { hasPermission, type SystemRole } from "@/core/access/domain/role";
import {
  ContactKind,
  ContactStatus,
  EnquiryStage,
  InstructionJourneyStage,
} from "@/core/db/generated/enums";
import type { Prisma } from "@/core/db/generated/client";
import type { EnquiryStageCode } from "@/core/enquiries/domain/enquiry";
import type { JourneyStageCode } from "@/core/instructions/domain/instruction";
import { isUuid, SEARCH_TEXT_MAX } from "@/core/properties/domain/ids";
import { resolveContactActor } from "./contact-actor";

const OPEN_LEAD_STAGES = [
  EnquiryStage.NEW_ENQUIRY,
  EnquiryStage.APPRAISAL_BOOKED,
  EnquiryStage.APPRAISAL_COMPLETED,
] as const;

export const LANDLORD_LIST_PAGE_SIZE = 25;
export const CONTACT_HISTORY_PAGE_SIZE = 5;

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

type ContactLeadHistoryItem = {
  id: string;
  reference: string;
  stage: EnquiryStageCode;
  address: string;
  postcode: string | null;
  branch: string;
};

type ContactInstructionHistoryItem = {
  id: string;
  reference: string;
  journeyStage: JourneyStageCode;
  current: boolean;
  currentParty: boolean;
  property: string;
  postcode: string;
  branch: string;
};

type ContactHistoryPage<T> = {
  items: T[];
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

export type ContactLandlordHistory = {
  leads: ContactHistoryPage<ContactLeadHistoryItem> | null;
  instructions: ContactHistoryPage<ContactInstructionHistoryItem> | null;
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

const LEAD_STAGE_CODE = {
  [EnquiryStage.NEW_ENQUIRY]: "new_enquiry",
  [EnquiryStage.APPRAISAL_BOOKED]: "appraisal_booked",
  [EnquiryStage.APPRAISAL_COMPLETED]: "appraisal_completed",
  [EnquiryStage.WON]: "won",
  [EnquiryStage.LOST]: "lost",
  [EnquiryStage.POSTPONED]: "postponed",
} satisfies Record<EnquiryStage, EnquiryStageCode>;

const INSTRUCTION_STAGE_CODE = {
  [InstructionJourneyStage.ONBOARDING]: "onboarding",
  [InstructionJourneyStage.READY_TO_MARKET]: "ready_to_market",
  [InstructionJourneyStage.WITHDRAWN]: "withdrawn",
} satisfies Record<InstructionJourneyStage, JourneyStageCode>;

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

function historyPage(page: number | undefined): number {
  return Math.min(Math.max(Math.trunc(page ?? 1), 1), 10_000);
}

function propertyAddress(property: {
  addressBuilding: string | null;
  addressStreet: string;
  townCity: string;
}): string {
  return [property.addressBuilding, property.addressStreet, property.townCity]
    .filter(Boolean)
    .join(", ");
}

/** Paged lead and instruction history for one visible contact. */
export async function getContactLandlordHistory(input: {
  authSubject: string;
  workspaceSlug: string;
  contactId: string;
  leadPage?: number;
  instructionPage?: number;
}): Promise<ContactLandlordHistory | null> {
  if (!isUuid(input.contactId)) {
    return null;
  }
  const leadPage = historyPage(input.leadPage);
  const instructionPage = historyPage(input.instructionPage);
  return withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor || !hasPermission(actor.roles, "contact.read")) {
        return null;
      }
      const canReadLeads = hasPermission(actor.roles, "enquiry.read");
      const canReadInstructions = hasPermission(
        actor.roles,
        "instruction.read",
      );
      const leads = canReadLeads
        ? await transaction.enquiry.findMany({
            where: {
              workspaceId: actor.workspaceId,
              contactId: input.contactId,
            },
            select: {
              id: true,
              reference: true,
              stage: true,
              addressBuilding: true,
              addressStreet: true,
              postcode: true,
              property: {
                select: {
                  addressBuilding: true,
                  addressStreet: true,
                  townCity: true,
                  postcode: true,
                },
              },
              responsibleBranch: { select: { name: true } },
            },
            orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
            skip: (leadPage - 1) * CONTACT_HISTORY_PAGE_SIZE,
            take: CONTACT_HISTORY_PAGE_SIZE + 1,
          })
        : null;
      const instructions = canReadInstructions
        ? await transaction.instruction.findMany({
            where: {
              workspaceId: actor.workspaceId,
              parties: { some: { contactId: input.contactId } },
            },
            select: {
              id: true,
              reference: true,
              journeyStage: true,
              endedOn: true,
              property: {
                select: {
                  addressBuilding: true,
                  addressStreet: true,
                  townCity: true,
                  postcode: true,
                },
              },
              responsibleBranch: { select: { name: true } },
              parties: {
                where: { contactId: input.contactId },
                select: { removedAt: true },
              },
            },
            orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
            skip: (instructionPage - 1) * CONTACT_HISTORY_PAGE_SIZE,
            take: CONTACT_HISTORY_PAGE_SIZE + 1,
          })
        : null;
      return {
        leads: leads
          ? {
              items: leads.slice(0, CONTACT_HISTORY_PAGE_SIZE).map((lead) => {
                const address = lead.property
                  ? propertyAddress(lead.property)
                  : [lead.addressBuilding, lead.addressStreet]
                      .filter(Boolean)
                      .join(", ");
                return {
                  id: lead.id,
                  reference: lead.reference,
                  stage: LEAD_STAGE_CODE[lead.stage],
                  address: address || "Property not recorded",
                  postcode: lead.property?.postcode ?? lead.postcode,
                  branch: lead.responsibleBranch.name,
                };
              }),
              page: leadPage,
              hasPrevious: leadPage > 1,
              hasNext: leads.length > CONTACT_HISTORY_PAGE_SIZE,
            }
          : null,
        instructions: instructions
          ? {
              items: instructions
                .slice(0, CONTACT_HISTORY_PAGE_SIZE)
                .map((instruction) => ({
                  id: instruction.id,
                  reference: instruction.reference,
                  journeyStage:
                    INSTRUCTION_STAGE_CODE[instruction.journeyStage],
                  current: instruction.endedOn === null,
                  currentParty:
                    instruction.endedOn === null &&
                    instruction.parties.some(
                      (party) => party.removedAt === null,
                    ),
                  property: propertyAddress(instruction.property),
                  postcode: instruction.property.postcode,
                  branch: instruction.responsibleBranch.name,
                })),
              page: instructionPage,
              hasPrevious: instructionPage > 1,
              hasNext: instructions.length > CONTACT_HISTORY_PAGE_SIZE,
            }
          : null,
      };
    },
  );
}
