import { describe, expect, it } from "vitest";
import {
  buildNormalizedAddressKey,
  classifyAddressDuplicate,
  normalizePropertyPostcode,
  ownershipDatesAreOrdered,
  parseOwnershipDate,
  validateOwnerSelection,
  validatePropertyDetails,
  validatePropertyReason,
  type PropertyDetailsInput,
} from "./property";
import { createPropertyReference } from "./property-reference";

const valid: PropertyDetailsInput = {
  addressBuilding: "Flat 2",
  addressStreet: "10 High Street",
  addressLocality: "",
  townCity: "London",
  county: "",
  postcode: "sw1a1aa",
  propertyType: "flat",
  bedrooms: 2,
  bathrooms: 1,
  receptionRooms: null,
  floorArea: null,
  floorAreaUnit: null,
  furnishedStatus: null,
  features: ["lift", "lift", "balcony"],
  parkingNotes: "",
  outdoorSpaceNotes: "",
  councilTaxBand: "C",
  generalNotes: "",
};

describe("property postcode", () => {
  it("normalises UK postcodes to the spaced form", () => {
    expect(normalizePropertyPostcode("sw1a1aa")).toBe("SW1A 1AA");
    expect(normalizePropertyPostcode("  m1   1ae ")).toBe("M1 1AE");
    expect(normalizePropertyPostcode("EC1A 1BB")).toBe("EC1A 1BB");
    expect(normalizePropertyPostcode("B338TH")).toBe("B33 8TH");
  });

  it("rejects values that are not UK postcodes", () => {
    for (const value of [
      "",
      "12345",
      "SW1A",
      "SW1A 1AAA",
      "ABC DEF",
      "1A 1AA",
    ]) {
      expect(normalizePropertyPostcode(value)).toBeNull();
    }
  });
});

describe("property reference", () => {
  it("matches the database reference format", () => {
    expect(createPropertyReference()).toMatch(/^PRP-[2-9A-HJ-NP-Z]{8}$/);
  });
});

describe("address duplicates", () => {
  const key = (building: string | null, street: string, postcode: string) =>
    buildNormalizedAddressKey({ building, street, postcode });

  it("ignores case, punctuation, spacing and postcode spacing", () => {
    expect(key("Flat 2,", "10 High St.", "SW1A 1AA")).toBe(
      key("flat 2", "10  high st", "sw1a1aa"),
    );
  });

  it("treats the same building, street and postcode as a strong match", () => {
    expect(
      classifyAddressDuplicate(
        key("Flat 2", "10 High Street", "SW1A 1AA"),
        key("FLAT 2", "10 high street", "sw1a 1aa"),
      ),
    ).toBe("strong");
    expect(
      classifyAddressDuplicate(
        key(null, "10 High Street", "SW1A 1AA"),
        key("", "10 High Street", "SW1A 1AA"),
      ),
    ).toBe("strong");
  });

  it("treats the same street and postcode with another building as possible", () => {
    expect(
      classifyAddressDuplicate(
        key("Flat 2", "10 High Street", "SW1A 1AA"),
        key("Flat 3", "10 High Street", "SW1A 1AA"),
      ),
    ).toBe("possible");
    expect(
      classifyAddressDuplicate(
        key("Flat 2", "10 High Street", "SW1A 1AA"),
        key(null, "10 High Street", "SW1A 1AA"),
      ),
    ).toBe("possible");
  });

  it("finds no match for a different street or postcode", () => {
    expect(
      classifyAddressDuplicate(
        key(null, "10 High Street", "SW1A 1AA"),
        key(null, "12 High Street", "SW1A 1AA"),
      ),
    ).toBe("none");
    expect(
      classifyAddressDuplicate(
        key(null, "10 High Street", "SW1A 1AA"),
        key(null, "10 High Street", "SW1A 1AB"),
      ),
    ).toBe("none");
  });
});

describe("property details", () => {
  it("accepts and normalises valid details", () => {
    const result = validatePropertyDetails(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.postcode).toBe("SW1A 1AA");
    expect(result.data.addressLocality).toBeNull();
    expect(result.data.features).toEqual(["lift", "balcony"]);
    expect(result.data.normalizedAddressKey).toBe(
      "flat 2|10 high street|sw1a1aa",
    );
  });

  it("requires street, town or city, postcode and property type", () => {
    const result = validatePropertyDetails({
      ...valid,
      addressStreet: " ",
      townCity: "",
      postcode: "",
      propertyType: "",
    });
    expect(result).toMatchObject({
      ok: false,
      errors: {
        addressStreet: expect.any(String),
        townCity: expect.any(String),
        postcode: expect.any(String),
        propertyType: expect.any(String),
      },
    });
  });

  it("rejects an invalid postcode, room counts and unknown features", () => {
    const result = validatePropertyDetails({
      ...valid,
      postcode: "nope",
      bedrooms: 51,
      bathrooms: -1,
      receptionRooms: 1.5,
      features: ["lift", "jacuzzi"],
    });
    expect(result).toMatchObject({
      ok: false,
      errors: {
        postcode: "Enter a valid UK postcode.",
        bedrooms: expect.any(String),
        bathrooms: expect.any(String),
        receptionRooms: expect.any(String),
        features: expect.any(String),
      },
    });
  });

  it("needs a floor area and unit together or neither", () => {
    expect(
      validatePropertyDetails({ ...valid, floorArea: 650, floorAreaUnit: null })
        .ok,
    ).toBe(false);
    expect(
      validatePropertyDetails({
        ...valid,
        floorArea: null,
        floorAreaUnit: "sq_m",
      }).ok,
    ).toBe(false);
    expect(
      validatePropertyDetails({
        ...valid,
        floorArea: 650,
        floorAreaUnit: "sq_ft",
      }).ok,
    ).toBe(true);
    expect(
      validatePropertyDetails({
        ...valid,
        floorArea: 0,
        floorAreaUnit: "sq_ft",
      }).ok,
    ).toBe(false);
  });

  it("rejects unknown furnished status and council tax band", () => {
    expect(
      validatePropertyDetails({ ...valid, furnishedStatus: "partly" }).ok,
    ).toBe(false);
    expect(validatePropertyDetails({ ...valid, councilTaxBand: "I" }).ok).toBe(
      false,
    );
    expect(
      validatePropertyDetails({ ...valid, furnishedStatus: "flexible" }).ok,
    ).toBe(true);
  });

  it("enforces free-text length limits", () => {
    expect(
      validatePropertyDetails({ ...valid, parkingNotes: "x".repeat(501) }).ok,
    ).toBe(false);
    expect(
      validatePropertyDetails({ ...valid, generalNotes: "x".repeat(2001) }).ok,
    ).toBe(false);
    expect(
      validatePropertyDetails({ ...valid, generalNotes: "x".repeat(2000) }).ok,
    ).toBe(true);
  });
});

describe("ownership rules", () => {
  it("requires a reason of a sensible length", () => {
    expect(validatePropertyReason("  ")).toMatchObject({ ok: false });
    expect(validatePropertyReason("x".repeat(501))).toMatchObject({
      ok: false,
    });
    expect(validatePropertyReason(" Sold ")).toEqual({
      ok: true,
      reason: "Sold",
    });
  });

  it("parses real calendar dates only", () => {
    expect(parseOwnershipDate("")).toEqual({ ok: true, date: null });
    expect(parseOwnershipDate("2024-02-29")).toMatchObject({ ok: true });
    for (const value of [
      "2023-02-29",
      "29/02/2024",
      "2024-13-01",
      "1800-01-01",
    ]) {
      expect(parseOwnershipDate(value)).toEqual({ ok: false });
    }
  });

  it("keeps the end date on or after the start date", () => {
    const a = new Date("2020-01-01");
    const b = new Date("2021-01-01");
    expect(ownershipDatesAreOrdered(a, b)).toBe(true);
    expect(ownershipDatesAreOrdered(a, a)).toBe(true);
    expect(ownershipDatesAreOrdered(b, a)).toBe(false);
    expect(ownershipDatesAreOrdered(null, a)).toBe(true);
  });

  it("allows at most one lead and no repeated owner", () => {
    expect(
      validateOwnerSelection([
        { contactId: "a", isLead: true },
        { contactId: "b", isLead: false },
      ]),
    ).toEqual({ ok: true });
    expect(
      validateOwnerSelection([
        { contactId: "a", isLead: true },
        { contactId: "b", isLead: true },
      ]),
    ).toEqual({ ok: false, reason: "multiple_leads" });
    expect(
      validateOwnerSelection([
        { contactId: "a", isLead: false },
        { contactId: "a", isLead: false },
      ]),
    ).toEqual({ ok: false, reason: "duplicate_owner" });
  });
});
