import { describe, expect, it } from "vitest";
import * as matching from "./matching";
import {
  listingFitsRequirements,
  matchingApplicants,
  MATCH_CRITERIA,
  monthlyPence,
  suggestedListings,
  type MatchableListing,
} from "./matching";
import { validateRequirements, type Requirements } from "./requirements";

const requirements = (input: Parameters<typeof validateRequirements>[0]) => {
  const result = validateRequirements(input);
  if (!result.ok) throw new Error("bad requirements in test");
  return result.value;
};

const listing = (
  overrides: Partial<MatchableListing> = {},
): MatchableListing => ({
  id: "l1",
  rentPence: 120000,
  rentPeriod: "month",
  bedrooms: 2,
  propertyType: "flat",
  furnished: "unfurnished",
  townCity: "Manchester",
  postcode: "M20 4AB",
  availableFrom: "2026-12-01",
  ...overrides,
});

describe("matching a home to a household", () => {
  it("fits when nothing is asked, and when everything asked is met", () => {
    expect(listingFitsRequirements(requirements({}), listing())).toEqual({
      fits: true,
      unmet: [],
    });
    const wanted = requirements({
      areas: ["m20"],
      minRent: "1000",
      maxRent: "1300",
      minBedrooms: 2,
      maxBedrooms: 3,
      propertyTypes: ["flat", "terraced"],
      furnished: "unfurnished",
      moveBy: "2026-12-15",
    });
    expect(listingFitsRequirements(wanted, listing())).toEqual({
      fits: true,
      unmet: [],
    });
  });

  it("matches an area by town or by postcode district, ignoring case and spacing", () => {
    const fits = (area: string, home = listing()) =>
      listingFitsRequirements(requirements({ areas: [area] }), home).fits;
    expect(fits("manchester")).toBe(true);
    expect(fits("M20")).toBe(true);
    expect(fits("m20")).toBe(true);
    expect(fits("Didsbury")).toBe(false);
    expect(fits("M2")).toBe(false);
    expect(fits("M20", listing({ postcode: "  m20   4ab " }))).toBe(true);
  });

  it("reports exactly which criteria are unmet", () => {
    const result = listingFitsRequirements(
      requirements({
        areas: ["Salford"],
        maxRent: "900",
        minBedrooms: 3,
        propertyTypes: ["detached"],
        furnished: "furnished",
        moveBy: "2026-11-01",
      }),
      listing(),
    );
    expect(result.fits).toBe(false);
    expect(result.unmet).toEqual([
      "area",
      "rent",
      "bedrooms",
      "property_type",
      "furnished",
      "available_from",
    ]);
  });

  it("converts weekly rents to a calendar month on both sides", () => {
    expect(monthlyPence(30000, "week")).toBe(130000);
    expect(monthlyPence(120000, "month")).toBe(120000);
    // £300 a week is £1,300 a month; a household asking up to £1,300 a month fits.
    expect(
      listingFitsRequirements(
        requirements({ maxRent: "1300" }),
        listing({ rentPence: 30000, rentPeriod: "week" }),
      ).fits,
    ).toBe(true);
    // A household asking in weekly terms: up to £280 a week is about £1,213 a month.
    expect(
      listingFitsRequirements(
        requirements({ maxRent: "280", rentPeriod: "week" }),
        listing({ rentPence: 120000, rentPeriod: "month" }),
      ).fits,
    ).toBe(true);
    expect(
      listingFitsRequirements(
        requirements({ maxRent: "270", rentPeriod: "week" }),
        listing({ rentPence: 120000, rentPeriod: "month" }),
      ).fits,
    ).toBe(false);
  });

  it("treats flexible furnishing as fitting anything, and part furnished as its own kind", () => {
    const wants = (furnished: string, home: Partial<MatchableListing>) =>
      listingFitsRequirements(requirements({ furnished }), listing(home)).fits;
    expect(wants("flexible", { furnished: "furnished" })).toBe(true);
    expect(wants("furnished", { furnished: "flexible" })).toBe(true);
    expect(wants("furnished", { furnished: "unfurnished" })).toBe(false);
    expect(wants("part_furnished", { furnished: "furnished" })).toBe(false);
  });

  it("counts what a home cannot show as unmet only when it was asked for", () => {
    const blank = listing({
      rentPence: null,
      rentPeriod: null,
      bedrooms: null,
      propertyType: null,
      furnished: null,
      availableFrom: null,
    });
    expect(listingFitsRequirements(requirements({}), blank).fits).toBe(true);
    expect(
      listingFitsRequirements(
        requirements({
          minRent: "500",
          minBedrooms: 1,
          propertyTypes: ["flat"],
          furnished: "furnished",
          moveBy: "2027-01-01",
        }),
        blank,
      ).unmet,
    ).toEqual([
      "rent",
      "bedrooms",
      "property_type",
      "furnished",
      "available_from",
    ]);
  });

  it("never excludes anyone for pets, household size or notes", () => {
    const base = listingFitsRequirements(requirements({}), listing());
    for (const input of [
      { hasPets: true },
      { householdSize: 8 },
      { notes: "Needs ground floor" },
      { hasPets: true, householdSize: 12, notes: "anything at all" },
    ]) {
      expect(listingFitsRequirements(requirements(input), listing())).toEqual(
        base,
      );
    }
  });
});

describe("only the approved criteria can filter", () => {
  it("pins the criteria list, so nothing else can creep in", () => {
    expect([...MATCH_CRITERIA]).toEqual([
      "area",
      "rent",
      "bedrooms",
      "property_type",
      "furnished",
      "available_from",
    ]);
  });

  it("every unmet criterion it can report is one of them", () => {
    const worst = listingFitsRequirements(
      requirements({
        areas: ["Nowhere"],
        maxRent: "100",
        minBedrooms: 9,
        propertyTypes: ["room"],
        furnished: "furnished",
        moveBy: "2020-01-01",
      }),
      listing(),
    );
    for (const criterion of worst.unmet) {
      expect(MATCH_CRITERIA).toContain(criterion);
    }
  });

  it("offers no score or ranking", () => {
    const names = Object.keys(matching).join(" ");
    expect(names).not.toMatch(/score|rank|best|rating/i);
  });
});

describe("lists in a neutral order", () => {
  it("suggests homes earliest available first, then by id, and drops those that do not fit", () => {
    const homes = [
      listing({ id: "c", availableFrom: "2026-12-20" }),
      listing({ id: "b", availableFrom: "2026-11-30" }),
      listing({ id: "a", availableFrom: "2026-11-30" }),
      listing({ id: "x", bedrooms: 1 }),
      listing({ id: "n", availableFrom: null }),
    ];
    const suggested = suggestedListings(
      requirements({ minBedrooms: 2 }),
      homes,
    );
    expect(suggested.map((home) => home.id)).toEqual(["a", "b", "c", "n"]);
  });

  it("lists matching households by when they registered, not by how well they match", () => {
    const wants = (
      input: Parameters<typeof validateRequirements>[0],
    ): Requirements => requirements(input);
    const applicants = [
      {
        id: "late",
        registeredAt: new Date("2026-10-20"),
        requirements: wants({ areas: ["M20"], minBedrooms: 2 }),
      },
      {
        id: "early",
        registeredAt: new Date("2026-10-01"),
        requirements: wants({}),
      },
      {
        id: "no",
        registeredAt: new Date("2026-10-05"),
        requirements: wants({ areas: ["Leeds"] }),
      },
    ];
    expect(matchingApplicants(listing(), applicants).map((a) => a.id)).toEqual([
      "early",
      "late",
    ]);
  });
});
