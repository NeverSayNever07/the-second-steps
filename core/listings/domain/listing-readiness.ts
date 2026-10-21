import type {
  ApplicabilityCode,
  AreaState,
  ComplianceAreaCode,
  EvidenceStatusCode,
} from "@/core/compliance/domain/compliance";
import type { ListingContent } from "./listing-content";
import type { DriftItem } from "./listing-drift";
import {
  EPC_BLOCK_MESSAGES,
  epcAdvertisingCheck,
  epcDrifted,
  type EpcSnapshot,
} from "./listing-epc";
import { MEDIA_RULES } from "./listing-rules";
import type { ListingPropertyFacts, ListingRentSource } from "./listing-source";

// The two checklists a person works through. Each item says whether it is met
// and what to do about it. Neither is a legal-compliance verdict: they check
// that the advert is complete and that Zayto's own records agree (ADR-034).

export type ChecklistItem = {
  code: string;
  label: string;
  met: boolean;
  /** What to do when it is not met. */
  hint: string;
};

export const isChecklistMet = (items: readonly ChecklistItem[]) =>
  items.every((item) => item.met);

// --- Content ready ---

export type ContentReadyInput = {
  /** The instruction is current and at Ready to market. */
  instructionReady: boolean;
  content: ListingContent;
  rent: ListingRentSource;
  facts: ListingPropertyFacts;
  /** Facts the person marked not applicable, such as bedrooms for a room. */
  notApplicable: ReadonlySet<"bedrooms" | "bathrooms">;
  /** Differences from the sources since this version was saved. */
  drift: readonly DriftItem[];
  /** The property's EPC position was read when the person reviewed. */
  epcRead: boolean;
};

export function contentReadyChecklist(
  input: ContentReadyInput,
): ChecklistItem[] {
  const { content, facts, rent, notApplicable } = input;
  const roomsDone =
    (facts.bedrooms !== null || notApplicable.has("bedrooms")) &&
    (facts.bathrooms !== null || notApplicable.has("bathrooms"));
  const depositDone =
    rent.depositOffering !== null &&
    (rent.depositOffering === "replacement" || rent.depositPence !== null);
  return [
    {
      code: "instruction_ready",
      label: "The instruction is Ready to market",
      met: input.instructionReady,
      hint: "Return to the instruction and complete its checklist.",
    },
    {
      code: "rent",
      label: "An advertised rent with its period",
      met: rent.advertisedRentPence !== null && rent.rentPeriod !== null,
      hint: "Enter the agreed asking rent in the instruction's terms.",
    },
    {
      code: "headline",
      label: "A headline",
      met: content.headline.length > 0,
      hint: "Write the headline on the Content tab.",
    },
    {
      code: "summary",
      label: "A short summary",
      met: content.summary.length > 0,
      hint: "Write the summary on the Content tab.",
    },
    {
      code: "description",
      label: "A full description",
      met: content.description.length > 0,
      hint: "Write the description on the Content tab.",
    },
    {
      code: "core_facts",
      label: "The address, property type and rooms",
      met:
        facts.addressStreet.length > 0 &&
        facts.townCity.length > 0 &&
        facts.postcode.length > 0 &&
        roomsDone,
      hint: "Complete the property details, or mark bedrooms or bathrooms not applicable.",
    },
    {
      code: "availability",
      label: "When it is available",
      met:
        content.availableFrom !== null || content.availabilityNote.length > 0,
      hint: "Enter an available-from date or an availability note.",
    },
    {
      code: "deposit",
      label: "The deposit presentation",
      met: depositDone,
      hint: "Choose the deposit offered in the instruction's terms.",
    },
    {
      code: "material_information",
      label: "Material information",
      met:
        content.materialInformationNotApplicable ||
        content.materialInformation.length > 0,
      hint: "Write what an applicant needs to know, or mark it not applicable.",
    },
    {
      code: "no_drift",
      label: "No unreviewed changes in the property or terms",
      met: input.drift.length === 0,
      hint: "Review the differences, then save a new version.",
    },
    {
      code: "epc_read",
      label: "The EPC position has been looked at",
      met: input.epcRead,
      hint: "Open the Readiness tab and review the EPC position.",
    },
  ];
}

// --- Ready to advertise ---

export type MediaCounts = {
  photos: number;
  floorplans: number;
  /** The first photo, which is the main image, exists. */
  hasMainImage: boolean;
};

export type ReadyToAdvertiseInput = {
  /** The listing is at Content ready. */
  isContentReady: boolean;
  /** The version Content ready was confirmed on is still the current one. */
  reviewedVersionIsCurrent: boolean;
  /** The EPC position as it stands now, and as recorded at review. */
  epcNow: EpcSnapshot;
  epcAtReview: EpcSnapshot | null;
  media: MediaCounts;
  /** The media is what it was when Content ready was confirmed. */
  mediaMatchesReview: boolean;
  drift: readonly DriftItem[];
};

export function readyToAdvertiseChecklist(
  input: ReadyToAdvertiseInput,
): ChecklistItem[] {
  const epc = epcAdvertisingCheck(input.epcNow);
  const epcMoved =
    input.epcAtReview !== null && epcDrifted(input.epcAtReview, input.epcNow);
  return [
    {
      code: "content_ready",
      label: "The listing is Content ready",
      met: input.isContentReady,
      hint: "Complete the Content ready checklist first.",
    },
    {
      code: "unchanged_since_review",
      label: "No edits since Content ready was confirmed",
      met: input.reviewedVersionIsCurrent,
      hint: "Confirm Content ready again on the latest version.",
    },
    {
      code: "epc",
      label: "The EPC position allows advertising",
      met: epc.ok,
      hint: epc.ok ? "" : EPC_BLOCK_MESSAGES[epc.reason],
    },
    {
      code: "epc_unchanged",
      label: "The EPC evidence has not changed since review",
      met: !epcMoved,
      hint: "The property's EPC evidence changed. Review the EPC position again.",
    },
    {
      code: "photos",
      label: `At least ${MEDIA_RULES.minPhotos} photos`,
      met: input.media.photos >= MEDIA_RULES.minPhotos,
      hint: `Add ${Math.max(MEDIA_RULES.minPhotos - input.media.photos, 0)} more on the Media tab.`,
    },
    {
      code: "main_image",
      label: "A main image",
      met: input.media.hasMainImage,
      hint: "The first photo is the main image. Add a photo or choose which is first.",
    },
    {
      code: "floorplan",
      label: `At least ${MEDIA_RULES.minFloorplans} floorplan`,
      met: input.media.floorplans >= MEDIA_RULES.minFloorplans,
      hint: "Add a floorplan on the Media tab.",
    },
    {
      code: "media_unchanged",
      label: "The photos and floorplans have not changed since review",
      met: input.mediaMatchesReview,
      hint: "The media changed after Content ready was confirmed. Confirm it again.",
    },
    {
      code: "no_drift",
      label: "No unreviewed changes in the property or terms",
      met: input.drift.length === 0,
      hint: "Review the differences, then save a new version.",
    },
  ];
}

/**
 * A stable description of the media, so a change after review can be seen:
 * the roles and files in position order.
 */
export function mediaFingerprint(
  items: readonly {
    documentId: string;
    role: "photo" | "floorplan";
    position: number;
  }[],
) {
  return [...items]
    .sort(
      (a, b) =>
        a.position - b.position || a.documentId.localeCompare(b.documentId),
    )
    .map((item) => `${item.role}:${item.documentId}`)
    .join("|");
}

// --- Warnings (never block) ---

export type ListingWarning = {
  area: ComplianceAreaCode;
  severity: "warning" | "info";
  message: string;
};

type WarningArea = Pick<
  AreaState,
  "applicability" | "status" | "isExpired" | "window"
> & { area: ComplianceAreaCode };

const WARNED_AREAS: Partial<Record<ComplianceAreaCode, string>> = {
  gas_safety: "Gas safety record",
  electrical_safety: "Electrical safety (EICR)",
  smoke_co_alarms: "Smoke and carbon monoxide alarms",
  licensing: "Property licensing",
};

/**
 * Gaps in the safety and licensing evidence, shown while preparing an advert.
 * They never stop Content ready or Ready to advertise (owner decisions
 * 2026-10-20); gas and electrical evidence matters at the later occupation
 * gates. A licensing area nobody has assessed is information, not a warning.
 */
export function complianceWarnings(
  areas: readonly WarningArea[],
): ListingWarning[] {
  return areas.flatMap((area): ListingWarning[] => {
    const name = WARNED_AREAS[area.area];
    if (!name) return [];
    const applicability: ApplicabilityCode | "not_assessed" =
      area.applicability;
    if (applicability === "does_not_apply") return [];
    if (applicability === "not_assessed") {
      return [
        {
          area: area.area,
          severity: area.area === "licensing" ? "info" : "warning",
          message: `${name} has not been assessed.`,
        },
      ];
    }
    if (applicability === "needs_specialist_review") {
      return [
        {
          area: area.area,
          severity: "warning",
          message: `${name} needs specialist review.`,
        },
      ];
    }
    const status: EvidenceStatusCode | "not_requested" = area.status;
    if (area.isExpired) {
      return [
        {
          area: area.area,
          severity: "warning",
          message: `${name} evidence has expired.`,
        },
      ];
    }
    if (status === "action_required") {
      return [
        {
          area: area.area,
          severity: "warning",
          message: `${name} needs action.`,
        },
      ];
    }
    if (status === "awaiting_evidence" || status === "not_requested") {
      return [
        {
          area: area.area,
          severity: "warning",
          message: `${name} is awaiting evidence.`,
        },
      ];
    }
    if (area.window && area.window !== "expired") {
      return [
        {
          area: area.area,
          severity: "warning",
          message: `${name} evidence is due soon.`,
        },
      ];
    }
    return [];
  });
}
