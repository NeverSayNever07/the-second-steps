import { describe, expect, it } from "vitest";
import {
  REQUIREMENT_NOTES_HINT,
  sensitiveNotesWarning,
  validateRequirements,
} from "./requirements";

describe("requirements", () => {
  it("accepts an empty set, and a full one, as plain values", () => {
    expect(validateRequirements({})).toMatchObject({
      ok: true,
      value: {
        areas: [],
        minRentPence: null,
        maxRentPence: null,
        rentPeriod: "month",
        propertyTypes: [],
        hasPets: false,
        notes: "",
      },
    });
    expect(
      validateRequirements({
        areas: [" Didsbury ", "M20", "didsbury"],
        minRent: "£1,000",
        maxRent: "1400.50",
        rentPeriod: "month",
        minBedrooms: 2,
        maxBedrooms: 3,
        propertyTypes: ["flat", "terraced", "flat"],
        furnished: "unfurnished",
        moveFrom: "2026-12-01",
        moveBy: "2027-01-15",
        householdSize: 2,
        hasPets: true,
        notes: "Quiet street preferred.",
      }),
    ).toEqual({
      ok: true,
      value: {
        areas: ["Didsbury", "M20"],
        minRentPence: 100000,
        maxRentPence: 140050,
        rentPeriod: "month",
        minBedrooms: 2,
        maxBedrooms: 3,
        propertyTypes: ["flat", "terraced"],
        furnished: "unfurnished",
        moveFrom: "2026-12-01",
        moveBy: "2027-01-15",
        householdSize: 2,
        hasPets: true,
        notes: "Quiet street preferred.",
      },
    });
  });

  it("refuses ranges the wrong way round, bad numbers and bad dates", () => {
    const result = validateRequirements({
      minRent: "1500",
      maxRent: "1000",
      minBedrooms: 4,
      maxBedrooms: 2,
      moveFrom: "2027-02-01",
      moveBy: "2027-01-01",
      householdSize: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual([
        "householdSize",
        "maxBedrooms",
        "maxRent",
        "moveBy",
      ]);
    }
    for (const bad of [
      { minRent: "lots" },
      { minRent: "0.5" },
      { minBedrooms: 2.5 },
      { maxBedrooms: 21 },
      { moveBy: "next spring" },
      { rentPeriod: "year" },
      { furnished: "luxury" },
      { propertyTypes: ["castle"] },
    ]) {
      expect(validateRequirements(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it("limits and checks the areas", () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `Town ${i}`);
    expect(validateRequirements({ areas: eleven }).ok).toBe(false);
    expect(validateRequirements({ areas: ["<script>"] }).ok).toBe(false);
    expect(validateRequirements({ areas: ["x".repeat(61)] }).ok).toBe(false);
    expect(
      validateRequirements({ areas: ["St. Helens", "Hale Barns"] }).ok,
    ).toBe(true);
  });

  it("limits the notes and refuses control characters", () => {
    expect(validateRequirements({ notes: "x".repeat(501) }).ok).toBe(false);
    expect(validateRequirements({ notes: "line\u0007bell" }).ok).toBe(false);
    expect(validateRequirements({ notes: "x".repeat(500) }).ok).toBe(true);
  });

  it("has no field for sensitive details", () => {
    const fields = Object.keys(
      (validateRequirements({}) as { value: object }).value,
    );
    expect(fields).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /income|employ|benefit|passport|nationality|children|religion|disab/i,
        ),
      ]),
    );
  });
});

describe("the notes warning", () => {
  it("warns, but never blocks, when notes look sensitive", () => {
    for (const notes of [
      "Earns 40k and works in IT",
      "On housing benefit",
      "Has a visa until 2028",
      "Mentions their passport",
      "Salary is fine",
    ]) {
      expect(sensitiveNotesWarning(notes), notes).toBe(REQUIREMENT_NOTES_HINT);
      expect(validateRequirements({ notes }).ok, notes).toBe(true);
    }
    expect(sensitiveNotesWarning("Quiet street, near the tram")).toBeNull();
    expect(sensitiveNotesWarning("")).toBeNull();
    expect(sensitiveNotesWarning(null)).toBeNull();
  });
});
