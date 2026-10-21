import { describe, expect, it } from "vitest";
import {
  canMoveListing,
  isCurrentListing,
  isReviewedState,
  LISTING_STATES,
} from "./listing";
import {
  validateListingContent,
  validateListingReason,
} from "./listing-content";
import { detectDrift } from "./listing-drift";
import {
  epcAdvertisingCheck,
  epcDrifted,
  epcSnapshot,
  type EpcInput,
} from "./listing-epc";
import {
  complianceWarnings,
  contentReadyChecklist,
  isChecklistMet,
  mediaFingerprint,
  readyToAdvertiseChecklist,
  type ContentReadyInput,
  type ReadyToAdvertiseInput,
} from "./listing-readiness";
import { LISTING_LIMITS, MEDIA_RULES } from "./listing-rules";
import {
  listingFactsFromProperty,
  listingRentFromTerms,
  type ListingPropertyFacts,
  type SourceSnapshot,
} from "./listing-source";
import type { ValidPropertyDetails } from "@/core/properties/domain/property";

describe("listing states", () => {
  it("allows only the agreed moves and treats Withdrawn as final", () => {
    expect(canMoveListing("draft", "content_ready")).toBe(true);
    expect(canMoveListing("draft", "ready_to_advertise")).toBe(false);
    expect(canMoveListing("content_ready", "ready_to_advertise")).toBe(true);
    expect(canMoveListing("content_ready", "draft")).toBe(true);
    expect(canMoveListing("ready_to_advertise", "draft")).toBe(true);
    expect(canMoveListing("ready_to_advertise", "content_ready")).toBe(false);
    for (const state of LISTING_STATES) {
      expect(canMoveListing("withdrawn", state)).toBe(false);
      if (state !== "withdrawn") {
        expect(canMoveListing(state, "withdrawn")).toBe(true);
      }
    }
  });

  it("knows which states are current and which a review has confirmed", () => {
    expect(isCurrentListing("draft")).toBe(true);
    expect(isCurrentListing("withdrawn")).toBe(false);
    expect(isReviewedState("draft")).toBe(false);
    expect(isReviewedState("content_ready")).toBe(true);
    expect(isReviewedState("ready_to_advertise")).toBe(true);
  });
});

describe("validateListingContent", () => {
  it("accepts an empty draft so unfinished work can be saved", () => {
    expect(validateListingContent({}).ok).toBe(true);
  });

  it("trims text, drops blank highlights and reads the date", () => {
    const result = validateListingContent({
      headline: "  Bright two-bed flat ",
      highlights: [" Garden ", "", "  "],
      availableFrom: "2026-12-01",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.headline).toBe("Bright two-bed flat");
    expect(result.value.highlights).toEqual(["Garden"]);
    expect(result.value.availableFrom?.toISOString().slice(0, 10)).toBe(
      "2026-12-01",
    );
  });

  it("refuses over-long text, too many highlights and a bad date", () => {
    const result = validateListingContent({
      headline: "x".repeat(LISTING_LIMITS.headline + 1),
      highlights: Array.from(
        { length: LISTING_LIMITS.highlights + 1 },
        () => "a",
      ),
      availableFrom: "01/12/2026",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual([
      "availableFrom",
      "headline",
      "highlights",
    ]);
  });

  it("needs a reason that fits", () => {
    expect(validateListingReason("").ok).toBe(false);
    expect(validateListingReason("x".repeat(501)).ok).toBe(false);
    expect(validateListingReason(" Landlord changed their mind ")).toEqual({
      ok: true,
      reason: "Landlord changed their mind",
    });
  });
});

const PROPERTY: ValidPropertyDetails = {
  addressBuilding: "Flat 4",
  addressStreet: "14 Riverside Mews",
  addressLocality: null,
  townCity: "Demo Town",
  county: null,
  postcode: "ZZ1 4AB",
  normalizedAddressKey: "internal-key",
  propertyType: "flat",
  bedrooms: 2,
  bathrooms: 1,
  receptionRooms: 1,
  floorArea: null,
  floorAreaUnit: null,
  furnishedStatus: "unfurnished",
  features: ["lift", "balcony"],
  parkingNotes: null,
  outdoorSpaceNotes: null,
  councilTaxBand: "C",
  generalNotes: "Landlord is difficult about access",
};

describe("what a listing may copy", () => {
  it("never copies the internal summary or the matching key", () => {
    const facts = listingFactsFromProperty(PROPERTY);
    expect(Object.keys(facts)).not.toContain("generalNotes");
    expect(Object.keys(facts)).not.toContain("normalizedAddressKey");
    expect(JSON.stringify(facts)).not.toContain("difficult");
    expect(facts.features).toEqual(["balcony", "lift"]);
  });

  it("copies only the named fields, even if the property gains new ones", () => {
    const withExtra = {
      ...PROPERTY,
      landlordPhone: "07700 900123",
      ownershipNotes: "secret",
    } as ValidPropertyDetails;
    expect(Object.keys(listingFactsFromProperty(withExtra)).sort()).toEqual(
      Object.keys(listingFactsFromProperty(PROPERTY)).sort(),
    );
    expect(JSON.stringify(listingFactsFromProperty(withExtra))).not.toContain(
      "07700",
    );
  });

  it("takes only rent and deposit from the terms, never fees, charges or the service", () => {
    const rent = listingRentFromTerms({
      id: "t1",
      askingRentPence: 145000,
      rentPeriod: "month",
      depositOffering: "standard",
      depositPence: 167300,
      holdingDepositPence: 33500,
      // Not part of the allowed shape; passed to prove they are ignored.
      ...({
        feeKind: "percentage",
        feeValue: 1200,
        service: "fully_managed",
        charges: [{ name: "Set-up", amountPence: 30000 }],
      } as object),
    });
    expect(rent).toEqual({
      sourceTermsVersionId: "t1",
      advertisedRentPence: 145000,
      rentPeriod: "month",
      depositOffering: "standard",
      depositPence: 167300,
      holdingDepositPence: 33500,
    });
  });
});

const facts = (
  over: Partial<ListingPropertyFacts> = {},
): ListingPropertyFacts => ({
  ...listingFactsFromProperty(PROPERTY),
  ...over,
});
const rent = {
  sourceTermsVersionId: "t1",
  advertisedRentPence: 145000,
  rentPeriod: "month" as const,
  depositOffering: "standard" as const,
  depositPence: 167300,
  holdingDepositPence: null,
};
const snapshot = (
  over: Partial<SourceSnapshot["rent"]> = {},
  factOver: Partial<ListingPropertyFacts> = {},
): SourceSnapshot => ({ rent: { ...rent, ...over }, facts: facts(factOver) });

describe("detectDrift", () => {
  it("finds nothing when the sources are unchanged", () => {
    expect(detectDrift(snapshot(), snapshot())).toEqual([]);
  });

  it("reports a changed rent, period and deposit", () => {
    const drift = detectDrift(
      snapshot(),
      snapshot({
        advertisedRentPence: 150000,
        rentPeriod: "week",
        depositPence: 100000,
      }),
    );
    expect(drift.map((item) => item.field)).toEqual([
      "rent",
      "rent_period",
      "deposit",
    ]);
    expect(drift[0]).toMatchObject({ before: "145000", after: "150000" });
  });

  it("reports changed property facts but ignores the order of features", () => {
    expect(
      detectDrift(
        snapshot({}, { features: ["lift", "balcony"] }),
        snapshot({}, { features: ["balcony", "lift"] }),
      ),
    ).toEqual([]);
    const drift = detectDrift(
      snapshot(),
      snapshot({}, { bedrooms: 3, postcode: "ZZ2 1XX", features: ["lift"] }),
    );
    expect(drift.map((item) => item.field).sort()).toEqual([
      "address",
      "features",
      "rooms",
    ]);
  });
});

const epcInput = (over: Partial<EpcInput> = {}): EpcInput => ({
  applicability: "applies",
  status: "reviewed",
  reliedEvidence: {
    id: "e1",
    rating: "C",
    eventOn: "2024-03-12",
    expiresOn: "2034-03-11",
    reference: "REF-1",
  },
  isExpired: false,
  applicabilityReason: null,
  ...over,
});

describe("EPC position and the advertising check", () => {
  it("maps each property compliance state to a position", () => {
    const position = (over: Partial<EpcInput>) =>
      epcSnapshot(epcInput(over)).position;
    expect(position({})).toBe("evidence_reviewed");
    expect(position({ isExpired: true })).toBe("expired");
    expect(
      position({ status: "awaiting_evidence", reliedEvidence: null }),
    ).toBe("commissioned_awaiting");
    expect(position({ status: "action_required" })).toBe("action_required");
    expect(position({ status: "not_requested", reliedEvidence: null })).toBe(
      "evidence_missing",
    );
    expect(position({ applicability: "not_assessed" })).toBe("not_assessed");
    expect(position({ applicability: "needs_specialist_review" })).toBe(
      "specialist_review",
    );
    expect(position({ applicability: "does_not_apply" })).toBe(
      "does_not_apply",
    );
  });

  it("lets reviewed unexpired evidence, commissioned or a reasoned Does not apply through", () => {
    expect(epcAdvertisingCheck(epcSnapshot(epcInput()))).toEqual({ ok: true });
    expect(
      epcAdvertisingCheck(
        epcSnapshot(
          epcInput({ status: "awaiting_evidence", reliedEvidence: null }),
        ),
      ),
    ).toEqual({ ok: true });
    expect(
      epcAdvertisingCheck(
        epcSnapshot(
          epcInput({
            applicability: "does_not_apply",
            reliedEvidence: null,
            status: "not_requested",
            applicabilityReason: "Registered exemption, listed building",
          }),
        ),
      ),
    ).toEqual({ ok: true });
  });

  it("blocks everything else, with a reason a person can act on", () => {
    const reason = (over: Partial<EpcInput>) => {
      const check = epcAdvertisingCheck(epcSnapshot(epcInput(over)));
      return check.ok ? null : check.reason;
    };
    expect(reason({ isExpired: true })).toBe("expired");
    expect(reason({ applicability: "not_assessed" })).toBe("not_assessed");
    expect(reason({ applicability: "needs_specialist_review" })).toBe(
      "specialist_review",
    );
    expect(reason({ status: "action_required" })).toBe("action_required");
    expect(reason({ status: "not_requested", reliedEvidence: null })).toBe(
      "evidence_missing",
    );
    // Does not apply with no reason is not an assessment.
    expect(
      reason({
        applicability: "does_not_apply",
        applicabilityReason: "  ",
        reliedEvidence: null,
      }),
    ).toBe("not_assessed");
  });

  it("blocks a relied-on rating of F or G unless Does not apply with a reason", () => {
    const rated = (rating: string) =>
      epcAdvertisingCheck(
        epcSnapshot(
          epcInput({
            reliedEvidence: {
              id: "e1",
              rating,
              eventOn: "2024-03-12",
              expiresOn: null,
              reference: null,
            },
          }),
        ),
      );
    expect(rated("F")).toEqual({ ok: false, reason: "rated_f_or_g" });
    expect(rated("g")).toEqual({ ok: false, reason: "rated_f_or_g" });
    expect(rated("E")).toEqual({ ok: true });
    // The exemption route: the latest assessment is Does not apply.
    expect(
      epcAdvertisingCheck(
        epcSnapshot(
          epcInput({
            applicability: "does_not_apply",
            applicabilityReason: "Valid exemption registered",
            reliedEvidence: {
              id: "e1",
              rating: "G",
              eventOn: "2024-03-12",
              expiresOn: null,
              reference: null,
            },
          }),
        ),
      ),
    ).toEqual({ ok: true });
  });

  it("notices when the evidence has moved since review", () => {
    const saved = epcSnapshot(epcInput());
    expect(epcDrifted(saved, epcSnapshot(epcInput()))).toBe(false);
    expect(epcDrifted(saved, epcSnapshot(epcInput({ isExpired: true })))).toBe(
      true,
    );
    expect(
      epcDrifted(
        saved,
        epcSnapshot(
          epcInput({
            reliedEvidence: {
              id: "e2",
              rating: "C",
              eventOn: "2025-03-12",
              expiresOn: "2035-03-11",
              reference: null,
            },
          }),
        ),
      ),
    ).toBe(true);
  });
});

const content = (over = {}) => ({
  headline: "Bright two-bed flat",
  summary: "Close to the station.",
  description: "A bright flat with a balcony.",
  highlights: [],
  availableFrom: new Date("2026-12-01T00:00:00Z"),
  availabilityNote: "",
  depositNote: "",
  materialInformation: "Service charge applies.",
  materialInformationNotApplicable: false,
  ...over,
});
const contentInput = (
  over: Partial<ContentReadyInput> = {},
): ContentReadyInput => ({
  instructionReady: true,
  content: content(),
  rent,
  facts: facts(),
  notApplicable: new Set(),
  drift: [],
  epcRead: true,
  ...over,
});
const unmet = (items: { code: string; met: boolean }[]) =>
  items.filter((item) => !item.met).map((item) => item.code);

describe("the Content ready checklist", () => {
  it("is met when everything is in place", () => {
    expect(isChecklistMet(contentReadyChecklist(contentInput()))).toBe(true);
  });

  it("names exactly what is missing", () => {
    expect(
      unmet(
        contentReadyChecklist(
          contentInput({
            instructionReady: false,
            content: content({
              headline: "",
              summary: "",
              description: "",
              availableFrom: null,
              materialInformation: "",
            }),
            rent: { ...rent, advertisedRentPence: null },
            epcRead: false,
          }),
        ),
      ),
    ).toEqual([
      "instruction_ready",
      "rent",
      "headline",
      "summary",
      "description",
      "availability",
      "material_information",
      "epc_read",
    ]);
  });

  it("accepts an availability note instead of a date, and not-applicable choices", () => {
    expect(
      unmet(
        contentReadyChecklist(
          contentInput({
            content: content({
              availableFrom: null,
              availabilityNote: "Available once the tenant leaves",
              materialInformation: "",
              materialInformationNotApplicable: true,
            }),
            facts: facts({ bedrooms: null }),
            notApplicable: new Set(["bedrooms"]),
          }),
        ),
      ),
    ).toEqual([]);
    expect(
      unmet(
        contentReadyChecklist(
          contentInput({ facts: facts({ bedrooms: null }) }),
        ),
      ),
    ).toEqual(["core_facts"]);
  });

  it("needs a deposit amount unless a replacement deposit is offered", () => {
    expect(
      unmet(
        contentReadyChecklist(
          contentInput({ rent: { ...rent, depositPence: null } }),
        ),
      ),
    ).toEqual(["deposit"]);
    expect(
      unmet(
        contentReadyChecklist(
          contentInput({
            rent: {
              ...rent,
              depositOffering: "replacement",
              depositPence: null,
            },
          }),
        ),
      ),
    ).toEqual([]);
  });

  it("is blocked by unreviewed drift", () => {
    const drift = detectDrift(snapshot(), snapshot({ advertisedRentPence: 1 }));
    expect(unmet(contentReadyChecklist(contentInput({ drift })))).toEqual([
      "no_drift",
    ]);
  });
});

const adInput = (
  over: Partial<ReadyToAdvertiseInput> = {},
): ReadyToAdvertiseInput => {
  const epc = epcSnapshot(epcInput());
  return {
    isContentReady: true,
    reviewedVersionIsCurrent: true,
    epcNow: epc,
    epcAtReview: epc,
    media: { photos: 5, floorplans: 1, hasMainImage: true },
    mediaMatchesReview: true,
    drift: [],
    ...over,
  };
};

describe("the Ready to advertise checklist", () => {
  it("is met with the minimum media and a satisfied EPC", () => {
    expect(isChecklistMet(readyToAdvertiseChecklist(adInput()))).toBe(true);
  });

  it("uses the media rule: 5 photos and 1 floorplan", () => {
    expect(MEDIA_RULES.minPhotos).toBe(5);
    expect(MEDIA_RULES.minFloorplans).toBe(1);
    expect(
      unmet(
        readyToAdvertiseChecklist(
          adInput({ media: { photos: 4, floorplans: 1, hasMainImage: true } }),
        ),
      ),
    ).toEqual(["photos"]);
    expect(
      unmet(
        readyToAdvertiseChecklist(
          adInput({ media: { photos: 5, floorplans: 0, hasMainImage: true } }),
        ),
      ),
    ).toEqual(["floorplan"]);
    expect(
      unmet(
        readyToAdvertiseChecklist(
          adInput({ media: { photos: 0, floorplans: 0, hasMainImage: false } }),
        ),
      ),
    ).toEqual(["photos", "main_image", "floorplan"]);
  });

  it("is blocked by a rating of F, an expired EPC and later changes", () => {
    const fRated = epcSnapshot(
      epcInput({
        reliedEvidence: {
          id: "e1",
          rating: "F",
          eventOn: "2024-03-12",
          expiresOn: null,
          reference: null,
        },
      }),
    );
    expect(
      unmet(
        readyToAdvertiseChecklist(
          adInput({ epcNow: fRated, epcAtReview: fRated }),
        ),
      ),
    ).toEqual(["epc"]);

    const expired = epcSnapshot(epcInput({ isExpired: true }));
    expect(
      unmet(readyToAdvertiseChecklist(adInput({ epcNow: expired }))),
    ).toEqual(["epc", "epc_unchanged"]);

    expect(
      unmet(
        readyToAdvertiseChecklist(
          adInput({
            isContentReady: false,
            reviewedVersionIsCurrent: false,
            mediaMatchesReview: false,
          }),
        ),
      ),
    ).toEqual(["content_ready", "unchanged_since_review", "media_unchanged"]);
  });

  it("gives the EPC hint only when it blocks", () => {
    const items = readyToAdvertiseChecklist(adInput());
    expect(items.find((item) => item.code === "epc")?.hint).toBe("");
    const blocked = readyToAdvertiseChecklist(
      adInput({
        epcNow: epcSnapshot(epcInput({ applicability: "not_assessed" })),
      }),
    );
    expect(blocked.find((item) => item.code === "epc")?.hint).toContain(
      "Compliance tab",
    );
  });
});

describe("mediaFingerprint", () => {
  it("is the same for the same media in the same order, and changes with order or files", () => {
    const a = [
      { documentId: "d1", role: "photo" as const, position: 1 },
      { documentId: "d2", role: "photo" as const, position: 2 },
      { documentId: "d3", role: "floorplan" as const, position: 3 },
    ];
    expect(mediaFingerprint(a)).toBe(mediaFingerprint([...a].reverse()));
    expect(mediaFingerprint(a)).not.toBe(
      mediaFingerprint([
        { ...a[0], position: 2 },
        { ...a[1], position: 1 },
        a[2],
      ]),
    );
    expect(mediaFingerprint(a)).not.toBe(mediaFingerprint(a.slice(0, 2)));
  });
});

describe("complianceWarnings", () => {
  const area = (
    code:
      | "gas_safety"
      | "electrical_safety"
      | "smoke_co_alarms"
      | "licensing"
      | "epc_mees",
    over: Partial<{
      applicability:
        | "applies"
        | "does_not_apply"
        | "needs_specialist_review"
        | "not_assessed";
      status:
        "awaiting_evidence" | "reviewed" | "action_required" | "not_requested";
      isExpired: boolean;
      window: "expired" | "within_7" | "within_30" | "within_60" | null;
    }> = {},
  ) => ({
    area: code,
    applicability: "applies" as const,
    status: "reviewed" as const,
    isExpired: false,
    window: null,
    ...over,
  });

  it("says nothing when the evidence is in order, and ignores the EPC area", () => {
    expect(
      complianceWarnings([
        area("gas_safety"),
        area("electrical_safety"),
        area("epc_mees", { applicability: "not_assessed" }),
      ]),
    ).toEqual([]);
  });

  it("warns about gaps in gas, electrical, alarm and licensing evidence", () => {
    const warnings = complianceWarnings([
      area("gas_safety", { isExpired: true, window: "expired" }),
      area("electrical_safety", { status: "awaiting_evidence" }),
      area("smoke_co_alarms", { applicability: "not_assessed" }),
      area("licensing", { status: "action_required" }),
    ]);
    expect(warnings.map((warning) => warning.area)).toEqual([
      "gas_safety",
      "electrical_safety",
      "smoke_co_alarms",
      "licensing",
    ]);
    expect(warnings.every((warning) => warning.severity === "warning")).toBe(
      true,
    );
  });

  it("treats an unassessed licensing area as information only, and skips Does not apply", () => {
    expect(
      complianceWarnings([
        area("licensing", { applicability: "not_assessed" }),
      ]),
    ).toEqual([
      {
        area: "licensing",
        severity: "info",
        message: "Property licensing has not been assessed.",
      },
    ]);
    expect(
      complianceWarnings([
        area("gas_safety", { applicability: "does_not_apply" }),
      ]),
    ).toEqual([]);
  });

  it("flags evidence that is due soon", () => {
    expect(
      complianceWarnings([area("gas_safety", { window: "within_30" })]),
    ).toHaveLength(1);
  });
});
