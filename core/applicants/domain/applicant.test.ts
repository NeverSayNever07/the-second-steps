import { describe, expect, it } from "vitest";
import { LISTING_STATES } from "@/core/listings/domain/listing";
import {
  applicantMoveNeedsReason,
  APPLICANT_STATUSES,
  APPLICANT_STATUS_LABELS,
  canBookViewing,
  canMoveApplicant,
  canMoveEnquiry,
  canRegisterEnquiry,
  canReopenEnquiry,
  ENQUIRY_STAGES,
  ENQUIRY_STAGE_LABELS,
  enquiryListingNotice,
  enquiryMoveNeedsReason,
  isApplicantReopen,
  isOpenApplicant,
  isOpenEnquiryStage,
} from "./applicant";
import {
  canMoveViewing,
  validateViewingMove,
  validateViewingTimes,
  viewingsOverlap,
  VIEWING_OUTCOME_LABELS,
  VIEWING_STATUSES,
  VIEWING_STATUS_LABELS,
} from "./viewing";

describe("applicant status", () => {
  it("moves between active and on hold, closes from either, and reopens only to active", () => {
    expect(canMoveApplicant("active", "on_hold")).toBe(true);
    expect(canMoveApplicant("on_hold", "active")).toBe(true);
    expect(canMoveApplicant("active", "closed")).toBe(true);
    expect(canMoveApplicant("on_hold", "closed")).toBe(true);
    expect(canMoveApplicant("closed", "active")).toBe(true);
    expect(canMoveApplicant("closed", "on_hold")).toBe(false);
    expect(canMoveApplicant("active", "active")).toBe(false);
  });

  it("needs a reason to close, and tells a reopen from other moves", () => {
    expect(applicantMoveNeedsReason("closed")).toBe(true);
    expect(applicantMoveNeedsReason("on_hold")).toBe(false);
    expect(isApplicantReopen("closed", "active")).toBe(true);
    expect(isApplicantReopen("active", "on_hold")).toBe(false);
    expect(isOpenApplicant("on_hold")).toBe(true);
    expect(isOpenApplicant("closed")).toBe(false);
  });

  it("has a label for every status", () => {
    for (const status of APPLICANT_STATUSES) {
      expect(APPLICANT_STATUS_LABELS[status]).toBeTruthy();
    }
  });
});

describe("property enquiry stages", () => {
  it("moves one step forward or back, closes from any open stage, and reopens to New only", () => {
    expect(canMoveEnquiry("new", "contacted")).toBe(true);
    expect(canMoveEnquiry("contacted", "viewing_arranged")).toBe(true);
    expect(canMoveEnquiry("viewed", "viewing_arranged")).toBe(true);
    expect(canMoveEnquiry("new", "viewing_arranged")).toBe(false);
    expect(canMoveEnquiry("new", "viewed")).toBe(false);
    expect(canMoveEnquiry("viewed", "new")).toBe(false);
    for (const stage of [
      "new",
      "contacted",
      "viewing_arranged",
      "viewed",
    ] as const) {
      expect(canMoveEnquiry(stage, "closed"), stage).toBe(true);
    }
    expect(canMoveEnquiry("closed", "new")).toBe(true);
    expect(canMoveEnquiry("closed", "viewed")).toBe(false);
    expect(canMoveEnquiry("new", "new")).toBe(false);
  });

  it("needs a reason to close, and knows which stages are open", () => {
    expect(enquiryMoveNeedsReason("closed")).toBe(true);
    expect(enquiryMoveNeedsReason("viewed")).toBe(false);
    expect(isOpenEnquiryStage("viewed")).toBe(true);
    expect(isOpenEnquiryStage("closed")).toBe(false);
    for (const stage of ENQUIRY_STAGES) {
      expect(ENQUIRY_STAGE_LABELS[stage]).toBeTruthy();
    }
  });
});

describe("enquiries and the listing's state (ADR-037)", () => {
  it("allows an enquiry or a viewing only on a Ready to advertise listing", () => {
    for (const state of LISTING_STATES) {
      expect(canRegisterEnquiry(state), state).toBe(
        state === "ready_to_advertise",
      );
      expect(canBookViewing(state), state).toBe(state === "ready_to_advertise");
    }
  });

  it("refuses to reopen an enquiry on a withdrawn listing", () => {
    expect(canReopenEnquiry("withdrawn")).toBe(false);
    expect(canReopenEnquiry("ready_to_advertise")).toBe(true);
    expect(canReopenEnquiry("draft")).toBe(true);
  });

  it("tells staff when a home is withdrawn or back in preparation, and nothing when it is ready", () => {
    expect(enquiryListingNotice("withdrawn")).toContain("no longer available");
    expect(enquiryListingNotice("draft")).toContain("not ready");
    expect(enquiryListingNotice("content_ready")).toContain("not ready");
    expect(enquiryListingNotice("ready_to_advertise")).toBeNull();
  });
});

describe("viewings", () => {
  it("can only be finished from scheduled, and every finish is final", () => {
    for (const to of ["completed", "cancelled", "no_show"] as const) {
      expect(canMoveViewing("scheduled", to), to).toBe(true);
    }
    for (const from of ["completed", "cancelled", "no_show"] as const) {
      for (const to of VIEWING_STATUSES) {
        expect(canMoveViewing(from, to), `${from} to ${to}`).toBe(false);
      }
    }
  });

  it("needs an outcome to complete, and takes none on any other move", () => {
    expect(
      validateViewingMove({ to: "completed", outcome: "interested" }),
    ).toEqual({ ok: true, outcome: "interested" });
    expect(validateViewingMove({ to: "completed", outcome: "" })).toEqual({
      ok: false,
      error: "outcome_required",
    });
    expect(validateViewingMove({ to: "completed", outcome: "offer" })).toEqual({
      ok: false,
      error: "outcome_required",
    });
    expect(validateViewingMove({ to: "cancelled", outcome: null })).toEqual({
      ok: true,
      outcome: null,
    });
    expect(
      validateViewingMove({ to: "cancelled", outcome: "interested" }),
    ).toEqual({ ok: false, error: "outcome_not_allowed" });
  });

  it("needs an end after the start, and refuses a viewing longer than a day", () => {
    const start = new Date("2026-11-02T10:00:00Z");
    expect(
      validateViewingTimes({
        startsAt: start,
        endsAt: new Date("2026-11-02T10:30:00Z"),
      }),
    ).toEqual({ ok: true });
    expect(validateViewingTimes({ startsAt: start, endsAt: start }).ok).toBe(
      false,
    );
    expect(
      validateViewingTimes({
        startsAt: start,
        endsAt: new Date("2026-11-02T09:00:00Z"),
      }).ok,
    ).toBe(false);
    expect(
      validateViewingTimes({
        startsAt: start,
        endsAt: new Date("2026-11-03T11:00:00Z"),
      }).ok,
    ).toBe(false);
    expect(
      validateViewingTimes({ startsAt: start, endsAt: new Date("invalid") }).ok,
    ).toBe(false);
  });

  it("spots overlapping viewings, but not ones that only touch", () => {
    const at = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 2, h, m));
    const a = { startsAt: at(10), endsAt: at(10, 30) };
    expect(viewingsOverlap(a, { startsAt: at(10, 15), endsAt: at(11) })).toBe(
      true,
    );
    expect(viewingsOverlap(a, { startsAt: at(10, 30), endsAt: at(11) })).toBe(
      false,
    );
    expect(viewingsOverlap(a, { startsAt: at(9), endsAt: at(10) })).toBe(false);
  });
});

describe("wording", () => {
  // Nothing may say a property is live, published, advertised or from a portal,
  // and no outcome may suggest an offer.
  const FORBIDDEN =
    /\b(live|published|advertised|portal|offer|best match|score|rank)\b/i;

  it("keeps every label free of publishing, portal, offer and ranking language", () => {
    const labels = [
      ...Object.values(APPLICANT_STATUS_LABELS),
      ...Object.values(ENQUIRY_STAGE_LABELS),
      ...Object.values(VIEWING_STATUS_LABELS),
      ...Object.values(VIEWING_OUTCOME_LABELS),
      ...LISTING_STATES.flatMap((state) => enquiryListingNotice(state) ?? []),
    ];
    for (const label of labels) expect(label).not.toMatch(FORBIDDEN);
  });
});
