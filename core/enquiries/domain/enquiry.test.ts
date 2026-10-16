import { describe, expect, it } from "vitest";
import {
  canCloseFrom,
  canWinFrom,
  isOpenStage,
  isOverdue,
  parseDateOnly,
  parsePercentageToBasisPoints,
  parsePounds,
  stageChangeNeedsReason,
  ukDayBounds,
  ukToday,
  validateAppraisalOutcome,
  validateEnquirer,
  validateListName,
  validateOptionalNote,
  validateReason,
  validateTaskTitle,
} from "./enquiry";
import { createEnquiryReference } from "./enquiry-reference";

const validEnquirer = {
  name: "  Olivia Hart  ",
  email: " LANDLORD@EXAMPLE.COM ",
  telephone: "020 7946 0998",
  addressBuilding: " Flat 2 ",
  addressStreet: " High Street ",
  postcode: " sw1a 1aa ",
  summary: "  Looking for full management.  ",
};

describe("enquiry domain", () => {
  it("describes open stages and permitted closing and winning points", () => {
    expect(isOpenStage("new_enquiry")).toBe(true);
    expect(isOpenStage("won")).toBe(false);
    expect(canCloseFrom("appraisal_booked")).toBe(true);
    expect(canCloseFrom("postponed")).toBe(false);
    expect(canWinFrom("appraisal_completed")).toBe(true);
    expect(canWinFrom("appraisal_booked")).toBe(false);
  });

  it("requires reasons for backwards, repeated, lost and postponed moves", () => {
    expect(stageChangeNeedsReason("new_enquiry", "appraisal_booked")).toBe(
      false,
    );
    expect(stageChangeNeedsReason("appraisal_booked", "new_enquiry")).toBe(
      true,
    );
    expect(stageChangeNeedsReason("new_enquiry", "new_enquiry")).toBe(true);
    expect(stageChangeNeedsReason("appraisal_completed", "lost")).toBe(true);
    expect(stageChangeNeedsReason("appraisal_completed", "postponed")).toBe(
      true,
    );
  });

  it("creates non-sequential readable enquiry references", () => {
    expect(createEnquiryReference()).toMatch(/^ENQ-[2-9A-HJ-NP-Z]{8}$/);
  });

  it("normalises a valid quick-capture enquiry", () => {
    expect(
      validateEnquirer(validEnquirer, {
        hasContact: false,
        hasProperty: false,
      }),
    ).toEqual({
      ok: true,
      data: {
        name: "Olivia Hart",
        email: "landlord@example.com",
        telephone: "+442079460998",
        addressBuilding: "Flat 2",
        addressStreet: "High Street",
        postcode: "SW1A 1AA",
        summary: "Looking for full management.",
      },
    });
  });

  it("requires a contact route and postcode unless records are linked", () => {
    const missing = {
      ...validEnquirer,
      email: "",
      telephone: "",
      postcode: "",
    };
    expect(
      validateEnquirer(missing, {
        hasContact: false,
        hasProperty: false,
      }),
    ).toMatchObject({
      ok: false,
      errors: {
        telephone: "Enter a telephone number or an email address.",
        postcode: "Enter the property's postcode.",
      },
    });
    expect(
      validateEnquirer(missing, { hasContact: true, hasProperty: true }),
    ).toMatchObject({ ok: true });
  });

  it("rejects malformed and overlong quick-capture fields", () => {
    expect(
      validateEnquirer(
        {
          ...validEnquirer,
          name: "x".repeat(201),
          email: "not-an-email",
          telephone: "123",
          addressBuilding: "x".repeat(161),
          addressStreet: "x".repeat(161),
          postcode: "not a postcode",
          summary: "x".repeat(2001),
        },
        { hasContact: false, hasProperty: false },
      ),
    ).toMatchObject({
      ok: false,
      errors: {
        name: expect.any(String),
        email: expect.any(String),
        telephone: expect.any(String),
        addressBuilding: expect.any(String),
        addressStreet: expect.any(String),
        postcode: expect.any(String),
        summary: expect.any(String),
      },
    });
  });

  it("validates trimmed reasons, notes, list names and task titles", () => {
    expect(validateReason("  Duplicate lead  ")).toEqual({
      ok: true,
      reason: "Duplicate lead",
    });
    expect(validateReason(" ")).toMatchObject({ ok: false });
    expect(validateOptionalNote("  Try again in spring  ")).toEqual({
      ok: true,
      note: "Try again in spring",
    });
    expect(validateOptionalNote("")).toEqual({ ok: true, note: null });
    expect(validateOptionalNote("x".repeat(501))).toEqual({ ok: false });
    expect(validateListName("  Local   referral  ")).toEqual({
      ok: true,
      name: "Local referral",
    });
    expect(validateListName(" ")).toMatchObject({ ok: false });
    expect(validateTaskTitle("  Call landlord  ")).toEqual({
      ok: true,
      title: "Call landlord",
    });
    expect(validateTaskTitle(" ")).toMatchObject({ ok: false });
  });

  it("parses only real, supported date-only values", () => {
    expect(parseDateOnly("2026-10-16")).toEqual(
      new Date("2026-10-16T00:00:00.000Z"),
    );
    expect(parseDateOnly("2026-02-29")).toBeNull();
    expect(parseDateOnly("1999-12-31")).toBeNull();
    expect(parseDateOnly("16/10/2026")).toBeNull();
    expect(parseDateOnly(" ")).toBeNull();
  });

  it("uses UK calendar dates for today and overdue checks", () => {
    const afterMidnightInLondon = new Date("2026-07-01T23:30:00.000Z");
    expect(ukToday(afterMidnightInLondon)).toBe("2026-07-02");
    expect(
      isOverdue(new Date("2026-07-01T00:00:00.000Z"), afterMidnightInLondon),
    ).toBe(true);
    expect(
      isOverdue(new Date("2026-07-02T00:00:00.000Z"), afterMidnightInLondon),
    ).toBe(false);
  });

  it("returns real UK day bounds in winter, summer and across DST", () => {
    expect(ukDayBounds(new Date("2026-01-10T12:00:00Z"))).toEqual({
      start: new Date("2026-01-10T00:00:00Z"),
      end: new Date("2026-01-11T00:00:00Z"),
    });
    expect(ukDayBounds(new Date("2026-07-10T12:00:00Z"))).toEqual({
      start: new Date("2026-07-09T23:00:00Z"),
      end: new Date("2026-07-10T23:00:00Z"),
    });
    expect(ukDayBounds(new Date("2026-03-29T12:00:00Z"))).toEqual({
      start: new Date("2026-03-29T00:00:00Z"),
      end: new Date("2026-03-29T23:00:00Z"),
    });
  });

  it("parses pounds and percentages without floating-point rounding", () => {
    expect(parsePounds("£1,250.50")).toBe(125_050);
    expect(parsePounds("12.5")).toBe(1_250);
    expect(parsePounds("12.345")).toBeNull();
    expect(parsePounds("-1")).toBeNull();
    expect(parsePercentageToBasisPoints("12.50%")).toBe(1_250);
    expect(parsePercentageToBasisPoints("0.01")).toBe(1);
    expect(parsePercentageToBasisPoints("12.345")).toBeNull();
  });

  it("validates and converts a complete appraisal outcome", () => {
    expect(
      validateAppraisalOutcome({
        expectedMonthlyRent: "1,500",
        recommendedService: "fully_managed",
        feeKind: "percentage",
        feeValue: "12.5%",
        feeVat: "inclusive",
        notes: "  Strong prospect  ",
      }),
    ).toEqual({
      ok: true,
      data: {
        expectedMonthlyRentPence: 150_000,
        recommendedService: "fully_managed",
        feeKind: "percentage",
        feeValue: 1_250,
        feeVat: "inclusive",
        notes: "Strong prospect",
      },
    });
  });

  it("requires a complete, bounded fee group when any fee field is used", () => {
    expect(
      validateAppraisalOutcome({
        expectedMonthlyRent: "100000.01",
        recommendedService: "unknown",
        feeKind: "percentage",
        feeValue: "100.01",
        feeVat: "",
        notes: "x".repeat(2001),
      }),
    ).toMatchObject({
      ok: false,
      errors: {
        expectedMonthlyRent: expect.any(String),
        recommendedService: expect.any(String),
        feeValue: expect.any(String),
        feeVat: expect.any(String),
        notes: expect.any(String),
      },
    });
  });
});
