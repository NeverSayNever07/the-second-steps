import "server-only";

import type { Prisma } from "@/core/db/generated/client";
import { ApplicantStatus, ListingState } from "@/core/db/generated/enums";
import { hasPermission } from "@/core/access/domain/role";
import type { RentPeriodCode } from "@/core/instructions/domain/instruction";
import type { ListingStateCode } from "@/core/listings/domain/listing";
import type { ListingPropertyFacts } from "@/core/listings/domain/listing-source";
import { addressLine } from "@/core/properties/application/properties";
import { isUuid } from "@/core/properties/domain/ids";
import {
  matchingApplicants,
  suggestedListings,
  type MatchableListing,
} from "../domain/matching";
import {
  lower,
  withApplicantActor,
  type ApplicantActorInput,
} from "./applicant-shared";
import {
  requirementsFromRow,
  summariseContact,
  CONTACT_SUMMARY_SELECT,
} from "./applicants";

// Matching is a filter, never a ranking (ADR-036): these queries only gather
// what the pure rules in ../domain/matching.ts need and return what fits, in
// a neutral order. Only Ready to advertise homes are ever suggested, and only
// homes and applicants the person's branch scope lets them see.

const MAX_CANDIDATES = 200;

const LISTING_MATCH_SELECT = {
  id: true,
  state: true,
  instruction: {
    select: { responsibleBranch: { select: { id: true, name: true } } },
  },
  property: {
    select: {
      id: true,
      addressBuilding: true,
      addressStreet: true,
      townCity: true,
      postcode: true,
    },
  },
  versions: {
    orderBy: { versionNo: "desc" },
    take: 1,
    select: {
      headline: true,
      advertisedRentPence: true,
      rentPeriod: true,
      availableFrom: true,
      propertyFacts: true,
    },
  },
} satisfies Prisma.ListingSelect;

type ListingRow = Prisma.ListingGetPayload<{
  select: typeof LISTING_MATCH_SELECT;
}>;

/** The saved advert's facts, read defensively: the JSON is written by Zayto but never trusted. */
function factsOf(value: Prisma.JsonValue | undefined) {
  const facts =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<ListingPropertyFacts>)
      : {};
  return {
    bedrooms: typeof facts.bedrooms === "number" ? facts.bedrooms : null,
    propertyType:
      typeof facts.propertyType === "string" ? facts.propertyType : null,
    furnished:
      typeof facts.furnishedStatus === "string" ? facts.furnishedStatus : null,
    townCity: typeof facts.townCity === "string" ? facts.townCity : "",
    postcode: typeof facts.postcode === "string" ? facts.postcode : "",
  };
}

export type MatchedListing = MatchableListing & {
  headline: string;
  address: string;
  branch: { id: string; name: string };
};

function toMatchable(row: ListingRow): MatchedListing | null {
  const version = row.versions[0];
  if (!version) return null;
  const facts = factsOf(version.propertyFacts);
  return {
    id: row.id,
    rentPence: version.advertisedRentPence,
    rentPeriod: version.rentPeriod
      ? lower<RentPeriodCode>(version.rentPeriod)
      : null,
    bedrooms: facts.bedrooms,
    propertyType: facts.propertyType as MatchableListing["propertyType"],
    furnished: facts.furnished as MatchableListing["furnished"],
    townCity: facts.townCity || row.property.townCity,
    postcode: facts.postcode || row.property.postcode,
    availableFrom: version.availableFrom
      ? version.availableFrom.toISOString().slice(0, 10)
      : null,
    headline: version.headline,
    address: addressLine(row.property),
    branch: row.instruction.responsibleBranch,
  };
}

// --- Homes that fit an applicant ---

export type SuggestedListing = {
  listing: MatchedListing;
  /** The applicant already has an open enquiry for this home. */
  alreadyEnquired: boolean;
};

export type SuggestedListingsResult =
  | {
      ok: true;
      /** False when no requirements are saved: nothing is suggested. */
      hasRequirements: boolean;
      items: SuggestedListing[];
    }
  | { ok: false; error: "access_denied" | "applicant_not_found" };

export async function suggestedListingsForApplicant(
  input: ApplicantActorInput & { applicantId: string },
): Promise<SuggestedListingsResult> {
  if (!isUuid(input.applicantId)) {
    return { ok: false, error: "applicant_not_found" };
  }
  const result = await withApplicantActor<{
    ok: true;
    hasRequirements: boolean;
    items: SuggestedListing[];
  }>(input, async (transaction, actor) => {
    if (!hasPermission(actor.roles, "applicant.read")) {
      return { ok: false, error: "access_denied" };
    }
    const applicant = await transaction.applicant.findFirst({
      where: { id: input.applicantId, workspaceId: actor.workspaceId },
      select: {
        id: true,
        requirementVersions: { orderBy: { versionNo: "desc" }, take: 1 },
        propertyEnquiries: {
          where: { stage: { not: "CLOSED" } },
          select: { listingId: true },
        },
      },
    });
    if (!applicant) return { ok: false, error: "applicant_not_found" };
    const current = applicant.requirementVersions[0];
    if (!current) return { ok: true, hasRequirements: false, items: [] };

    const rows = await transaction.listing.findMany({
      where: {
        workspaceId: actor.workspaceId,
        state: ListingState.READY_TO_ADVERTISE,
      },
      select: LISTING_MATCH_SELECT,
      orderBy: [{ stateChangedAt: "desc" }, { id: "asc" }],
      take: MAX_CANDIDATES,
    });
    const candidates = rows.flatMap((row) => toMatchable(row) ?? []);
    const enquired = new Set(
      applicant.propertyEnquiries.map((e) => e.listingId),
    );
    return {
      ok: true,
      hasRequirements: true,
      items: suggestedListings(requirementsFromRow(current), candidates).map(
        (listing) => ({ listing, alreadyEnquired: enquired.has(listing.id) }),
      ),
    };
  });
  return result.ok
    ? result
    : {
        ok: false,
        error:
          result.error === "access_denied"
            ? "access_denied"
            : "applicant_not_found",
      };
}

// --- Applicants that fit a home ---

export type FittingApplicant = {
  applicantId: string;
  reference: string;
  name: string;
  registeredAt: Date;
  owner: string | null;
  alreadyEnquired: boolean;
};

export type MatchingApplicantsResult =
  | {
      ok: true;
      /** Whether the home can take an enquiry now (it is Ready to advertise). */
      listingReady: boolean;
      listingState: ListingStateCode;
      items: FittingApplicant[];
    }
  | { ok: false; error: "access_denied" | "listing_not_found" };

export async function matchingApplicantsForListing(
  input: ApplicantActorInput & { listingId: string },
): Promise<MatchingApplicantsResult> {
  if (!isUuid(input.listingId))
    return { ok: false, error: "listing_not_found" };
  const result = await withApplicantActor<{
    ok: true;
    listingReady: boolean;
    listingState: ListingStateCode;
    items: FittingApplicant[];
  }>(input, async (transaction, actor) => {
    if (!hasPermission(actor.roles, "applicant.read")) {
      return { ok: false, error: "access_denied" };
    }
    const listing = await transaction.listing.findFirst({
      where: { id: input.listingId, workspaceId: actor.workspaceId },
      select: LISTING_MATCH_SELECT,
    });
    const matchable = listing ? toMatchable(listing) : null;
    if (!listing || !matchable)
      return { ok: false, error: "listing_not_found" };

    const applicants = await transaction.applicant.findMany({
      where: {
        workspaceId: actor.workspaceId,
        status: ApplicantStatus.ACTIVE,
        // An applicant with no requirements saved fits nothing in particular.
        requirementVersions: { some: {} },
      },
      select: {
        id: true,
        reference: true,
        createdAt: true,
        leadContact: { select: CONTACT_SUMMARY_SELECT },
        leadMembership: {
          select: {
            userIdentity: {
              select: { firstName: true, lastName: true, primaryEmail: true },
            },
          },
        },
        requirementVersions: { orderBy: { versionNo: "desc" }, take: 1 },
        propertyEnquiries: {
          where: { listingId: listing.id, stage: { not: "CLOSED" } },
          select: { id: true },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: MAX_CANDIDATES,
    });
    const candidates = applicants.map((row) => ({
      id: row.id,
      registeredAt: row.createdAt,
      requirements: requirementsFromRow(row.requirementVersions[0]),
      row,
    }));
    const state = lower<ListingStateCode>(listing.state);
    return {
      ok: true,
      listingReady: state === "ready_to_advertise",
      listingState: state,
      items: matchingApplicants(matchable, candidates).map(({ row }) => ({
        applicantId: row.id,
        reference: row.reference,
        name: summariseContact(row.leadContact).name,
        registeredAt: row.createdAt,
        owner: row.leadMembership
          ? [
              row.leadMembership.userIdentity?.firstName,
              row.leadMembership.userIdentity?.lastName,
            ]
              .filter(Boolean)
              .join(" ") || null
          : null,
        alreadyEnquired: row.propertyEnquiries.length > 0,
      })),
    };
  });
  return result.ok
    ? result
    : {
        ok: false,
        error:
          result.error === "access_denied"
            ? "access_denied"
            : "listing_not_found",
      };
}
