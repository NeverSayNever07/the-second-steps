import { describe, expect, it } from "vitest";
import {
  deriveAreaState,
  isFileRequired,
  validateApplicability,
  validateEvidenceFacts,
  validateStatus,
} from "./compliance";

const NOW = new Date("2026-10-21T12:00:00Z");

describe("validateApplicability", () => {
  it("accepts Applies with no reason", () => {
    const result = validateApplicability({ applicability: "applies" });
    expect(result).toMatchObject({
      ok: true,
      value: { applicability: "applies", reason: null },
    });
  });

  it("needs a reason for Does not apply and Needs specialist review", () => {
    for (const applicability of ["does_not_apply", "needs_specialist_review"]) {
      expect(validateApplicability({ applicability })).toMatchObject({
        ok: false,
        errors: { reason: "Give a reason." },
      });
      expect(
        validateApplicability({ applicability, reason: "   " }),
      ).toMatchObject({ ok: false });
      expect(
        validateApplicability({ applicability, reason: "No gas supply" }),
      ).toMatchObject({ ok: true });
    }
  });

  it("refuses an unknown option or an over-long reason", () => {
    expect(validateApplicability({ applicability: "compliant" })).toMatchObject(
      { ok: false },
    );
    expect(
      validateApplicability({
        applicability: "does_not_apply",
        reason: "x".repeat(1001),
      }),
    ).toMatchObject({ ok: false });
  });
});

describe("validateEvidenceFacts", () => {
  it("accepts a past date and a later expiry as entered", () => {
    const result = validateEvidenceFacts(
      "gas_safety",
      { eventOn: "2026-10-01", expiresOn: "2027-09-30", reference: " CP12-1 " },
      NOW,
    );
    expect(result).toMatchObject({
      ok: true,
      value: { reference: "CP12-1", epcRating: null },
    });
    if (result.ok) {
      expect(result.value.eventOn.toISOString().slice(0, 10)).toBe(
        "2026-10-01",
      );
    }
  });

  it("refuses a missing, invalid or future event date", () => {
    for (const eventOn of [undefined, "", "01/10/2026", "2026-13-01"]) {
      expect(
        validateEvidenceFacts("gas_safety", { eventOn }, NOW),
      ).toMatchObject({ ok: false, errors: { eventOn: expect.any(String) } });
    }
    expect(
      validateEvidenceFacts("gas_safety", { eventOn: "2026-10-22" }, NOW),
    ).toMatchObject({
      ok: false,
      errors: { eventOn: "The date cannot be in the future." },
    });
    expect(
      validateEvidenceFacts("gas_safety", { eventOn: "2026-10-21" }, NOW).ok,
    ).toBe(true);
  });

  it("refuses an expiry before the event date", () => {
    expect(
      validateEvidenceFacts(
        "gas_safety",
        { eventOn: "2026-10-01", expiresOn: "2026-09-30" },
        NOW,
      ),
    ).toMatchObject({ ok: false, errors: { expiresOn: expect.any(String) } });
  });

  it("allows an energy rating only on EPC evidence, from A to G", () => {
    expect(
      validateEvidenceFacts(
        "epc_mees",
        { eventOn: "2026-10-01", epcRating: "c" },
        NOW,
      ),
    ).toMatchObject({ ok: true, value: { epcRating: "C" } });
    expect(
      validateEvidenceFacts(
        "epc_mees",
        { eventOn: "2026-10-01", epcRating: "H" },
        NOW,
      ).ok,
    ).toBe(false);
    expect(
      validateEvidenceFacts(
        "gas_safety",
        { eventOn: "2026-10-01", epcRating: "C" },
        NOW,
      ).ok,
    ).toBe(false);
  });

  it("limits text lengths", () => {
    expect(
      validateEvidenceFacts(
        "gas_safety",
        { eventOn: "2026-10-01", reference: "x".repeat(121) },
        NOW,
      ),
    ).toMatchObject({ ok: false, errors: { reference: expect.any(String) } });
  });
});

describe("validateStatus", () => {
  it("relies on nothing for Awaiting evidence", () => {
    expect(validateStatus({ status: "awaiting_evidence" }).ok).toBe(true);
    expect(
      validateStatus({ status: "awaiting_evidence", evidenceId: "e1" }).ok,
    ).toBe(false);
  });

  it("names the evidence for Reviewed and Action required", () => {
    expect(validateStatus({ status: "reviewed" }).ok).toBe(false);
    expect(validateStatus({ status: "reviewed", evidenceId: "e1" }).ok).toBe(
      true,
    );
  });

  it("asks what action is needed", () => {
    expect(
      validateStatus({ status: "action_required", evidenceId: "e1" }),
    ).toMatchObject({ ok: false, errors: { note: expect.any(String) } });
    expect(
      validateStatus({
        status: "action_required",
        evidenceId: "e1",
        note: "Replace the flue",
      }).ok,
    ).toBe(true);
  });
});

describe("isFileRequired", () => {
  it("requires a file everywhere except smoke and CO alarms", () => {
    expect(isFileRequired("gas_safety")).toBe(true);
    expect(isFileRequired("licensing")).toBe(true);
    expect(isFileRequired("smoke_co_alarms")).toBe(false);
  });
});

describe("deriveAreaState", () => {
  it("is Not assessed and Not requested with no history", () => {
    expect(
      deriveAreaState({ assessments: [], evidence: [], statusEvents: [] }, NOW),
    ).toEqual({
      applicability: "not_assessed",
      status: "not_requested",
      reliedEvidenceId: null,
      isExpired: false,
      evidence: {},
    });
  });

  it("uses the newest assessment and status", () => {
    const state = deriveAreaState(
      {
        assessments: [
          { applicability: "does_not_apply" },
          { applicability: "applies" },
        ],
        evidence: [
          { id: "new", expiresOn: "2027-01-01", isFileRemoved: false },
          { id: "old", expiresOn: "2026-01-01", isFileRemoved: false },
        ],
        statusEvents: [
          { status: "reviewed", evidenceId: "new" },
          { status: "reviewed", evidenceId: "old" },
        ],
      },
      NOW,
    );
    expect(state.applicability).toBe("does_not_apply");
    expect(state.status).toBe("reviewed");
    expect(state.reliedEvidenceId).toBe("new");
  });

  it("marks earlier relied-on evidence Superseded, and unused evidence Other", () => {
    const state = deriveAreaState(
      {
        assessments: [{ applicability: "applies" }],
        evidence: [
          { id: "unused", expiresOn: null, isFileRemoved: false },
          { id: "new", expiresOn: null, isFileRemoved: false },
          { id: "old", expiresOn: null, isFileRemoved: false },
        ],
        statusEvents: [
          { status: "reviewed", evidenceId: "new" },
          { status: "reviewed", evidenceId: "old" },
        ],
      },
      NOW,
    );
    expect(state.evidence).toEqual({
      unused: "other",
      new: "relied_on",
      old: "superseded",
    });
  });

  it("reports Expired only from the relied-on evidence's entered date, changing no status", () => {
    const snapshot = (expiresOn: string | null) => ({
      assessments: [{ applicability: "applies" as const }],
      evidence: [{ id: "e1", expiresOn, isFileRemoved: false }],
      statusEvents: [{ status: "reviewed" as const, evidenceId: "e1" }],
    });
    expect(deriveAreaState(snapshot("2026-10-20"), NOW)).toMatchObject({
      isExpired: true,
      status: "reviewed",
    });
    expect(deriveAreaState(snapshot("2026-10-21"), NOW).isExpired).toBe(false);
    expect(deriveAreaState(snapshot(null), NOW).isExpired).toBe(false);
  });

  it("does not call evidence expired when nothing relies on it", () => {
    expect(
      deriveAreaState(
        {
          assessments: [{ applicability: "applies" }],
          evidence: [
            { id: "e1", expiresOn: "2020-01-01", isFileRemoved: false },
          ],
          statusEvents: [{ status: "awaiting_evidence", evidenceId: null }],
        },
        NOW,
      ).isExpired,
    ).toBe(false);
  });
});
