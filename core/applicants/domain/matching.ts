import type {
  FurnishedStatusCode,
  PropertyTypeCode,
} from "@/core/properties/domain/property";
import type { RentPeriodCode } from "@/core/instructions/domain/instruction";
import type { Requirements } from "./requirements";

// Matching is a filter, never a ranking (ADR-036). Only the criteria below
// may include or exclude a home or an applicant. Pets and household size are
// information for staff and never exclude anyone, and the free-text notes are
// never used. There is no score and no "best match": results come in a
// neutral order.

export const MATCH_CRITERIA = [
  "area",
  "rent",
  "bedrooms",
  "property_type",
  "furnished",
  "available_from",
] as const;
export type MatchCriterion = (typeof MATCH_CRITERIA)[number];

export const MATCH_CRITERION_LABELS: Readonly<Record<MatchCriterion, string>> =
  {
    area: "Area",
    rent: "Rent",
    bedrooms: "Bedrooms",
    property_type: "Property type",
    furnished: "Furnishing",
    available_from: "Available date",
  };

/** What a Ready to advertise listing offers, from its latest saved version. */
export type MatchableListing = {
  id: string;
  rentPence: number | null;
  rentPeriod: RentPeriodCode | null;
  bedrooms: number | null;
  propertyType: PropertyTypeCode | null;
  furnished: FurnishedStatusCode | null;
  townCity: string;
  postcode: string;
  /** "YYYY-MM-DD" */
  availableFrom: string | null;
};

export type MatchResult = { fits: boolean; unmet: MatchCriterion[] };

/** Weekly rent to a calendar month, the way listings already convert it. */
export const monthlyPence = (pence: number, period: RentPeriodCode) =>
  period === "week" ? Math.round((pence * 52) / 12) : pence;

const norm = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

/** "M20 4AB" gives "M20"; the part before the space. */
const outwardCode = (postcode: string) =>
  postcode.trim().toUpperCase().split(/\s+/)[0] ?? "";

/**
 * Whether the home fits what the household asked for. A criterion the
 * household did not set always passes; one they did set that the home cannot
 * show counts as unmet.
 */
export function listingFitsRequirements(
  requirements: Requirements,
  listing: MatchableListing,
): MatchResult {
  const unmet: MatchCriterion[] = [];

  if (requirements.areas.length > 0) {
    const town = norm(listing.townCity);
    const outward = outwardCode(listing.postcode);
    const fits = requirements.areas.some((area) => {
      const wanted = norm(area);
      return wanted === town || wanted.toUpperCase() === outward;
    });
    if (!fits) unmet.push("area");
  }

  const wantsRent =
    requirements.minRentPence !== null || requirements.maxRentPence !== null;
  if (wantsRent) {
    if (listing.rentPence === null || listing.rentPeriod === null) {
      unmet.push("rent");
    } else {
      const rent = monthlyPence(listing.rentPence, listing.rentPeriod);
      const min =
        requirements.minRentPence === null
          ? null
          : monthlyPence(requirements.minRentPence, requirements.rentPeriod);
      const max =
        requirements.maxRentPence === null
          ? null
          : monthlyPence(requirements.maxRentPence, requirements.rentPeriod);
      if ((min !== null && rent < min) || (max !== null && rent > max)) {
        unmet.push("rent");
      }
    }
  }

  if (requirements.minBedrooms !== null || requirements.maxBedrooms !== null) {
    const bedrooms = listing.bedrooms;
    if (
      bedrooms === null ||
      (requirements.minBedrooms !== null &&
        bedrooms < requirements.minBedrooms) ||
      (requirements.maxBedrooms !== null && bedrooms > requirements.maxBedrooms)
    ) {
      unmet.push("bedrooms");
    }
  }

  if (requirements.propertyTypes.length > 0) {
    if (
      listing.propertyType === null ||
      !requirements.propertyTypes.includes(listing.propertyType)
    ) {
      unmet.push("property_type");
    }
  }

  // "Flexible" on either side fits anything.
  if (
    requirements.furnished !== null &&
    requirements.furnished !== "flexible"
  ) {
    if (
      listing.furnished === null ||
      (listing.furnished !== "flexible" &&
        listing.furnished !== requirements.furnished)
    ) {
      unmet.push("furnished");
    }
  }

  if (requirements.moveBy !== null) {
    if (
      listing.availableFrom === null ||
      listing.availableFrom > requirements.moveBy
    ) {
      unmet.push("available_from");
    }
  }

  return { fits: unmet.length === 0, unmet };
}

/** The homes that fit, in a neutral order: earliest available first, then id. */
export function suggestedListings<L extends MatchableListing>(
  requirements: Requirements,
  listings: readonly L[],
): L[] {
  return listings
    .filter((listing) => listingFitsRequirements(requirements, listing).fits)
    .sort(
      (a, b) =>
        (a.availableFrom ?? "9999-12-31").localeCompare(
          b.availableFrom ?? "9999-12-31",
        ) || a.id.localeCompare(b.id),
    );
}

/** The households that fit a home, in a neutral order: registered first, then id. */
export function matchingApplicants<
  A extends { id: string; registeredAt: Date; requirements: Requirements },
>(listing: MatchableListing, applicants: readonly A[]): A[] {
  return applicants
    .filter(
      (applicant) =>
        listingFitsRequirements(applicant.requirements, listing).fits,
    )
    .sort(
      (a, b) =>
        a.registeredAt.getTime() - b.registeredAt.getTime() ||
        a.id.localeCompare(b.id),
    );
}
