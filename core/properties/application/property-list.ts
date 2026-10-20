import "server-only";

import { withVerifiedIdentity } from "@/core/access/data/database-context";
import { hasPermission } from "@/core/access/domain/role";
import { resolveContactActor } from "@/core/contacts/application/contact-actor";
import type { Prisma } from "@/core/db/generated/client";
import {
  InstructionJourneyStage,
  PropertyStatus,
} from "@/core/db/generated/enums";
import type { LettingServiceCode } from "@/core/enquiries/domain/enquiry";
import { staffName } from "@/core/enquiries/application/enquiry-shared";
import type {
  JourneyStageCode,
  RentPeriodCode,
} from "@/core/instructions/domain/instruction";
import { isUuid, SEARCH_TEXT_MAX } from "@/core/properties/domain/ids";
import type { PropertyTypeCode } from "@/core/properties/domain/property";
import {
  addressLine,
  contactDisplayName,
  propertySearchConditions,
} from "./properties";
import type { ActorInput } from "./property-shared";

export const PROPERTY_LIST_PAGE_SIZE = 25;

export type PropertyListState = "active" | "archived" | "all";
/** Filters on the property's current (not ended) instruction. */
export type PropertyInstructionFilter =
  "any" | "none" | "onboarding" | "ready_to_market";

export type PropertyPageItem = {
  id: string;
  reference: string;
  archived: boolean;
  addressLine: string;
  postcode: string;
  propertyType: PropertyTypeCode;
  bedrooms: number | null;
  branchName: string;
  leadLandlord: { contactId: string; name: string } | null;
  instruction: {
    id: string;
    reference: string;
    journeyStage: JourneyStageCode;
    service: LettingServiceCode | null;
    askingRentPence: number | null;
    rentPeriod: RentPeriodCode | null;
    leadStaff: string | null;
  } | null;
  updatedAt: Date;
};

export type PropertyPageResult = {
  items: PropertyPageItem[];
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

const lower = <T extends string>(value: string) => value.toLowerCase() as T;

function instructionCondition(
  filter: PropertyInstructionFilter,
  assignedMembershipId: string | undefined,
): Prisma.PropertyWhereInput {
  const current: Prisma.InstructionWhereInput = {
    endedOn: null,
    ...(assignedMembershipId ? { leadMembershipId: assignedMembershipId } : {}),
    ...(filter === "onboarding"
      ? { journeyStage: InstructionJourneyStage.ONBOARDING }
      : filter === "ready_to_market"
        ? { journeyStage: InstructionJourneyStage.READY_TO_MARKET }
        : {}),
  };
  if (filter === "none") {
    return { instructions: { none: { endedOn: null } } };
  }
  if (filter === "any" && !assignedMembershipId) {
    return {};
  }
  return { instructions: { some: current } };
}

/** One page of the Properties list, limited by workspace and branch scope. */
export async function listPropertyPage(
  input: ActorInput & {
    query?: string;
    branchId?: string;
    assignedMembershipId?: string;
    instruction?: PropertyInstructionFilter;
    state?: PropertyListState;
    page?: number;
  },
): Promise<PropertyPageResult | null> {
  const page = Math.min(Math.max(Math.trunc(input.page ?? 1), 1), 10_000);
  const empty: PropertyPageResult = {
    items: [],
    page,
    hasPrevious: page > 1,
    hasNext: false,
  };
  if (
    (input.branchId && !isUuid(input.branchId)) ||
    (input.assignedMembershipId && !isUuid(input.assignedMembershipId))
  ) {
    return empty;
  }
  const text = input.query?.trim().slice(0, SEARCH_TEXT_MAX);
  const state = input.state ?? "active";
  const search = propertySearchConditions(text);
  const rows = await withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor || !hasPermission(actor.roles, "property.read")) return null;
      // Instruction details need their own permission; without it the
      // summary is left out rather than shown.
      const mayReadInstructions = hasPermission(
        actor.roles,
        "instruction.read",
      );
      const instruction =
        mayReadInstructions &&
        ((input.instruction ?? "any") !== "any" || input.assignedMembershipId)
          ? instructionCondition(
              input.instruction ?? "any",
              input.assignedMembershipId,
            )
          : {};
      const properties = await transaction.property.findMany({
        where: {
          workspaceId: actor.workspaceId,
          ...(state === "active"
            ? { status: PropertyStatus.ACTIVE }
            : state === "archived"
              ? { status: PropertyStatus.ARCHIVED }
              : {}),
          ...(input.branchId ? { responsibleBranchId: input.branchId } : {}),
          AND: [...(search.length ? [{ OR: search }] : []), instruction],
        },
        include: {
          responsibleBranch: { select: { id: true, name: true } },
          ownerships: {
            where: { endedAt: null, isLead: true },
            include: {
              contact: {
                select: {
                  id: true,
                  kind: true,
                  reference: true,
                  firstName: true,
                  lastName: true,
                  legalName: true,
                },
              },
            },
            take: 1,
          },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * PROPERTY_LIST_PAGE_SIZE,
        take: PROPERTY_LIST_PAGE_SIZE + 1,
      });
      const visible = properties.slice(0, PROPERTY_LIST_PAGE_SIZE);
      const instructions = mayReadInstructions
        ? await transaction.instruction.findMany({
            where: {
              workspaceId: actor.workspaceId,
              endedOn: null,
              propertyId: { in: visible.map(({ id }) => id) },
            },
            select: {
              id: true,
              propertyId: true,
              reference: true,
              journeyStage: true,
              leadMembership: {
                select: {
                  userIdentity: {
                    select: {
                      firstName: true,
                      lastName: true,
                      primaryEmail: true,
                    },
                  },
                },
              },
              termsVersions: {
                select: {
                  service: true,
                  askingRentPence: true,
                  rentPeriod: true,
                },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take: 1,
              },
            },
            orderBy: [{ instructedOn: "desc" }, { id: "desc" }],
          })
        : [];
      return {
        properties,
        // Newest current instruction per property.
        instructionByProperty: new Map(
          [...instructions].reverse().map((row) => [row.propertyId, row]),
        ),
      };
    },
  );
  if (!rows) return null;
  return {
    page,
    hasPrevious: page > 1,
    hasNext: rows.properties.length > PROPERTY_LIST_PAGE_SIZE,
    items: rows.properties
      .slice(0, PROPERTY_LIST_PAGE_SIZE)
      .map((property): PropertyPageItem => {
        const lead = property.ownerships[0]?.contact;
        const current = rows.instructionByProperty.get(property.id) ?? null;
        const terms = current?.termsVersions[0] ?? null;
        return {
          id: property.id,
          reference: property.reference,
          archived: property.status === PropertyStatus.ARCHIVED,
          addressLine: addressLine(property),
          postcode: property.postcode,
          propertyType: lower<PropertyTypeCode>(property.propertyType),
          bedrooms: property.bedrooms,
          branchName: property.responsibleBranch.name,
          leadLandlord: lead
            ? { contactId: lead.id, name: contactDisplayName(lead) }
            : null,
          instruction: current
            ? {
                id: current.id,
                reference: current.reference,
                journeyStage: lower<JourneyStageCode>(current.journeyStage),
                service: terms
                  ? lower<LettingServiceCode>(terms.service)
                  : null,
                askingRentPence: terms?.askingRentPence ?? null,
                rentPeriod: terms?.rentPeriod
                  ? lower<RentPeriodCode>(terms.rentPeriod)
                  : null,
                leadStaff: current.leadMembership
                  ? staffName(current.leadMembership.userIdentity)
                  : null,
              }
            : null,
          updatedAt: property.updatedAt,
        };
      }),
  };
}
