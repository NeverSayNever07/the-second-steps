import { describe, expect, it } from "vitest";
import {
  agreementNeedsReason,
  buildChecklist,
  createInstructionReference,
  isChecklistComplete,
  ownershipCheckNeedsReason,
  validateEndedOn,
  validatePastDate,
  validateTerms,
  type ChecklistSnapshot,
  type TermsInput,
} from "./instruction";

const COMPLETE: TermsInput = {
  service: "fully_managed",
  askingRent: "1,500",
  rentPeriod: "month",
  feeKind: "percentage",
  feeValue: "12",
  feeFrequency: "",
  feeVat: "exclusive",
  depositOffering: "standard",
  deposit: "1730.50",
  holdingDeposit: "",
  charges: [{ name: "Setup fee", amount: "250", vat: "none" }],
};

const EMPTY: TermsInput = {
  service: "let_only",
  askingRent: "",
  rentPeriod: "",
  feeKind: "",
  feeValue: "",
  feeFrequency: "",
  feeVat: "",
  depositOffering: "",
  deposit: "",
  holdingDeposit: "",
  charges: [],
};

describe("instruction references", () => {
  it("look like INS- followed by eight unambiguous characters", () => {
    expect(createInstructionReference()).toMatch(/^INS-[2-9A-HJ-NP-Z]{8}$/);
  });
});

describe("validateTerms", () => {
  it("turns pounds into pence and percentages into basis points", () => {
    expect(validateTerms(COMPLETE)).toMatchObject({
      ok: true,
      data: {
        service: "fully_managed",
        askingRentPence: 150000,
        rentPeriod: "month",
        feeKind: "percentage",
        feeValue: 1200,
        feeFrequency: null,
        feeVat: "exclusive",
        depositOffering: "standard",
        depositPence: 173050,
        holdingDepositPence: null,
        charges: [{ name: "Setup fee", amountPence: 25000, vat: "none" }],
      },
    });
  });

  it("accepts terms with only a service, which are incomplete but saved", () => {
    expect(validateTerms(EMPTY)).toMatchObject({
      ok: true,
      data: { askingRentPence: null, feeKind: null, depositOffering: null },
    });
  });

  it("needs a service", () => {
    expect(validateTerms({ ...EMPTY, service: "" })).toMatchObject({
      ok: false,
      errors: { service: expect.any(String) },
    });
    expect(validateTerms({ ...EMPTY, service: "bogus" })).toMatchObject({
      ok: false,
    });
  });

  it("checks the rent and its period", () => {
    for (const askingRent of ["abc", "0", "100001", "12.345", "-5"]) {
      expect(validateTerms({ ...COMPLETE, askingRent })).toMatchObject({
        ok: false,
        errors: { askingRent: expect.any(String) },
      });
    }
    expect(validateTerms({ ...COMPLETE, rentPeriod: "year" })).toMatchObject({
      ok: false,
      errors: { rentPeriod: expect.any(String) },
    });
    expect(validateTerms({ ...COMPLETE, rentPeriod: "week" })).toMatchObject({
      ok: true,
      data: { rentPeriod: "week" },
    });
  });

  it("checks percentage and fixed fees, and always needs a VAT choice", () => {
    for (const feeValue of ["0", "100.01", "abc", ""]) {
      expect(validateTerms({ ...COMPLETE, feeValue })).toMatchObject({
        ok: false,
        errors: { feeValue: expect.any(String) },
      });
    }
    expect(validateTerms({ ...COMPLETE, feeVat: "" })).toMatchObject({
      ok: false,
      errors: { feeVat: expect.any(String) },
    });
    const fixed = { ...COMPLETE, feeKind: "fixed", feeValue: "300" };
    expect(validateTerms(fixed)).toMatchObject({
      ok: false,
      errors: { feeFrequency: expect.any(String) },
    });
    expect(
      validateTerms({ ...fixed, feeFrequency: "monthly", feeVat: "none" }),
    ).toMatchObject({
      ok: true,
      data: {
        feeKind: "fixed",
        feeValue: 30000,
        feeFrequency: "monthly",
        feeVat: "none",
      },
    });
    expect(validateTerms({ ...COMPLETE, feeKind: "other" })).toMatchObject({
      ok: false,
      errors: { feeKind: expect.any(String) },
    });
  });

  it("allows a deposit amount only with a standard deposit offered", () => {
    expect(
      validateTerms({ ...COMPLETE, depositOffering: "replacement" }),
    ).toMatchObject({ ok: false, errors: { deposit: expect.any(String) } });
    expect(
      validateTerms({ ...COMPLETE, depositOffering: "both" }),
    ).toMatchObject({ ok: true });
    expect(
      validateTerms({ ...COMPLETE, depositOffering: "nonsense" }),
    ).toMatchObject({
      ok: false,
      errors: { depositOffering: expect.any(String) },
    });
  });

  it("records deposit and holding deposit as entered, without legal caps", () => {
    expect(
      validateTerms({
        ...COMPLETE,
        deposit: "99999",
        holdingDeposit: "50000",
      }),
    ).toMatchObject({
      ok: true,
      data: { depositPence: 9999900, holdingDepositPence: 5000000 },
    });
  });

  it("checks every charge, and allows at most twenty", () => {
    expect(
      validateTerms({
        ...COMPLETE,
        charges: [{ name: "", amount: "10", vat: "none" }],
      }),
    ).toMatchObject({ ok: false, errors: { charges: expect.any(String) } });
    expect(
      validateTerms({
        ...COMPLETE,
        charges: [{ name: "Fee", amount: "10", vat: "unknown" }],
      }),
    ).toMatchObject({ ok: false });
    expect(
      validateTerms({
        ...COMPLETE,
        charges: Array.from({ length: 21 }, () => ({
          name: "Fee",
          amount: "10",
          vat: "none",
        })),
      }),
    ).toMatchObject({ ok: false });
  });
});

describe("the Ready to market checklist", () => {
  const complete: ChecklistSnapshot = {
    hasLeadStaff: true,
    hasMainContact: true,
    terms: {
      askingRentPence: 150000,
      feeKind: "percentage",
      depositOffering: "standard",
      depositPence: 173000,
    },
    agreement: "current",
    ownershipCheck: "verified",
    exceptions: [],
  };
  const unmet = (snapshot: ChecklistSnapshot) =>
    buildChecklist(snapshot)
      .filter((item) => !item.met)
      .map((item) => item.code);

  it("is complete when everything is in place", () => {
    expect(isChecklistComplete(buildChecklist(complete))).toBe(true);
    expect(unmet(complete)).toEqual([]);
  });

  it("names each missing item that can never be bypassed", () => {
    expect(unmet({ ...complete, hasLeadStaff: false })).toEqual(["lead_staff"]);
    expect(unmet({ ...complete, hasMainContact: false })).toEqual(["landlord"]);
    expect(unmet({ ...complete, terms: null }).sort()).toEqual(
      ["asking_rent", "deposit", "fee", "service"].sort(),
    );
    expect(
      unmet({
        ...complete,
        terms: { ...complete.terms!, askingRentPence: null },
      }),
    ).toEqual(["asking_rent"]);
    expect(
      unmet({ ...complete, terms: { ...complete.terms!, feeKind: null } }),
    ).toEqual(["fee"]);
  });

  it("needs a deposit amount only when a standard deposit is offered", () => {
    expect(
      unmet({
        ...complete,
        terms: { ...complete.terms!, depositPence: null },
      }),
    ).toEqual(["deposit"]);
    expect(
      unmet({
        ...complete,
        terms: {
          ...complete.terms!,
          depositOffering: "replacement",
          depositPence: null,
        },
      }),
    ).toEqual([]);
    expect(
      unmet({
        ...complete,
        terms: { ...complete.terms!, depositOffering: null },
      }),
    ).toEqual(["deposit"]);
  });

  it("needs a signed agreement covering the current fees and landlords", () => {
    for (const agreement of ["none", "update_required"] as const) {
      expect(unmet({ ...complete, agreement })).toEqual(["agreement"]);
    }
    // An earlier agreement exception no longer counts (C2).
    expect(
      unmet({ ...complete, agreement: "none", exceptions: ["agreement"] }),
    ).toEqual(["agreement"]);
  });

  it("needs ownership verified, unless a manager excepted it", () => {
    for (const ownershipCheck of [
      null,
      "in_progress",
      "not_verified",
    ] as const) {
      expect(unmet({ ...complete, ownershipCheck })).toEqual([
        "ownership_check",
      ]);
    }
    const excepted = buildChecklist({
      ...complete,
      ownershipCheck: "not_verified",
      exceptions: ["ownership_check"],
    });
    expect(isChecklistComplete(excepted)).toBe(true);
    expect(excepted.filter((item) => item.excepted)).toHaveLength(1);
  });

  it("cannot bypass anything else with an exception", () => {
    expect(
      unmet({
        ...complete,
        hasLeadStaff: false,
        exceptions: ["ownership_check"],
      }),
    ).toEqual(["lead_staff"]);
  });
});

describe("corrections need a reason", () => {
  it("only moving forward in agreement progress goes without one", () => {
    expect(agreementNeedsReason(null, "signed")).toBe(false);
    expect(agreementNeedsReason("prepared", "sent")).toBe(false);
    expect(agreementNeedsReason("sent", "signed")).toBe(false);
    expect(agreementNeedsReason("sent", "sent")).toBe(true);
    expect(agreementNeedsReason("signed", "prepared")).toBe(true);
  });

  it("any change after a recorded result needs one", () => {
    expect(ownershipCheckNeedsReason(null, "in_progress")).toBe(false);
    expect(ownershipCheckNeedsReason(null, "verified")).toBe(false);
    expect(ownershipCheckNeedsReason("in_progress", "verified")).toBe(false);
    expect(ownershipCheckNeedsReason(null, "not_verified")).toBe(true);
    expect(ownershipCheckNeedsReason("verified", "in_progress")).toBe(true);
    expect(ownershipCheckNeedsReason("not_verified", "verified")).toBe(true);
  });
});

describe("dates", () => {
  const now = new Date("2026-10-17T12:00:00Z");

  it("ends today by default, or on a valid earlier date after the instruction date", () => {
    expect(validateEndedOn("", "2026-10-01", now)).toMatchObject({ ok: true });
    expect(validateEndedOn("2026-10-10", "2026-10-01", now)).toMatchObject({
      ok: true,
    });
    expect(validateEndedOn("2026-10-01", "2026-10-01", now)).toMatchObject({
      ok: true,
    });
    for (const bad of [
      "2026-09-30",
      "2026-10-18",
      "17/10/2026",
      "2026-02-30",
    ]) {
      expect(validateEndedOn(bad, "2026-10-01", now)).toMatchObject({
        ok: false,
      });
    }
  });

  it("accepts a signing or check date up to today", () => {
    expect(validatePastDate("2026-10-17", now)).toMatchObject({ ok: true });
    expect(validatePastDate("2026-10-18", now)).toMatchObject({ ok: false });
    expect(validatePastDate("", now)).toMatchObject({ ok: false });
  });
});
