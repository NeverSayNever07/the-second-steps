import type { EnquiryStageCode } from "@/core/enquiries/domain/enquiry";
import type { JourneyStageCode } from "@/core/instructions/domain/instruction";
import type { ListingStateCode } from "@/core/listings/domain/listing";

// Where a property is on its way from landlord lead to let (ADR-039), and the
// one next step. It is worked out when shown from records that already exist
// (the lead's stage, the instruction's stage and checklist, the listing's
// state) and never stored. It adds no rule and replaces no gate: every step
// it names is still checked where it has always been checked. Viewings and
// Let are shown as still to come until Zayto has them.

export const JOURNEY_STEP_IDS = [
  "lead",
  "appraisal",
  "instruction",
  "listing",
  "enquiries",
  "viewings",
  "let",
] as const;
export type JourneyStepId = (typeof JOURNEY_STEP_IDS)[number];

export const JOURNEY_STEP_LABELS: Record<JourneyStepId, string> = {
  lead: "Lead",
  appraisal: "Appraisal",
  instruction: "Instruction",
  listing: "Listing",
  enquiries: "Enquiries",
  viewings: "Viewings",
  let: "Let",
};

export type JourneyStepState = "done" | "current" | "ahead";

export type JourneyStep = {
  id: JourneyStepId;
  label: string;
  state: JourneyStepState;
  /** A few words under the label, or "". */
  caption: string;
  /** One sentence shown when the step is chosen. */
  detail: string;
};

export type NextStepTarget =
  | { kind: "lead"; leadId: string }
  | { kind: "instruction"; instructionId: string }
  | { kind: "listing"; listingId: string; tab?: "readiness" | "enquiries" };

export type NextStep = {
  title: string;
  description: string;
  actionLabel: string;
  target: NextStepTarget;
  checklist: { label: string; met: boolean }[];
};

export type PropertyJourney = {
  steps: JourneyStep[];
  current: JourneyStepId | null;
  /** Null when there is nothing to do, or the viewer cannot see what is next. */
  next: NextStep | null;
};

export type PropertyJourneyInput = {
  /** Leads recorded against the property; null when the viewer may not read them. */
  leads: { id: string; stage: EnquiryStageCode }[] | null;
  /** The property's current (not ended) instruction, if it has one. */
  instruction: {
    id: string;
    journeyStage: JourneyStageCode;
    /** "YYYY-MM-DD"; left out where the page does not load it. */
    instructedOn?: string;
    checklist: { label: string; met: boolean }[];
    checklistComplete: boolean;
  } | null;
  /**
   * The current instruction's current listing: null when it has none,
   * undefined when the viewer may not read listings.
   */
  listing: { id: string; state: ListingStateCode } | null | undefined;
  archived: boolean;
};

const LEAD_RANK: Partial<Record<EnquiryStageCode, number>> = {
  new_enquiry: 1,
  appraisal_booked: 2,
  appraisal_completed: 3,
};

const shortDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});

const NOT_BUILT = "Not built in Zayto yet.";

export function derivePropertyJourney(
  input: PropertyJourneyInput,
): PropertyJourney {
  const instruction =
    input.instruction && input.instruction.journeyStage !== "withdrawn"
      ? input.instruction
      : null;
  // The open lead that has got furthest, if there is one.
  const openLead =
    [...(input.leads ?? [])]
      .filter((lead) => LEAD_RANK[lead.stage] !== undefined)
      .sort((a, b) => LEAD_RANK[b.stage]! - LEAD_RANK[a.stage]!)[0] ?? null;
  const listing = instruction ? input.listing : null;

  let current: JourneyStepId | null = null;
  if (instruction) {
    if (instruction.journeyStage === "onboarding") current = "instruction";
    else if (listing?.state === "ready_to_advertise") current = "enquiries";
    else current = "listing";
  } else if (openLead) {
    current =
      openLead.stage === "new_enquiry"
        ? "lead"
        : openLead.stage === "appraisal_booked"
          ? "appraisal"
          : "instruction";
  }
  if (input.archived) current = null;

  const currentIndex = current ? JOURNEY_STEP_IDS.indexOf(current) : -1;
  const stateOf = (id: JourneyStepId): JourneyStepState => {
    const index = JOURNEY_STEP_IDS.indexOf(id);
    if (index === currentIndex) return "current";
    return index < currentIndex ? "done" : "ahead";
  };
  const met = instruction?.checklist.filter((item) => item.met).length ?? 0;

  const words: Record<JourneyStepId, { caption: string; detail: string }> = {
    lead: {
      caption: stateOf("lead") === "current" ? "Open" : "",
      detail:
        stateOf("lead") === "done"
          ? "A landlord lead was captured for this property."
          : stateOf("lead") === "current"
            ? "A landlord lead is open. No appraisal is booked yet."
            : "No landlord lead is open for this property.",
    },
    appraisal: {
      caption: stateOf("appraisal") === "current" ? "Booked" : "",
      detail:
        stateOf("appraisal") === "done"
          ? "The appraisal is complete."
          : stateOf("appraisal") === "current"
            ? "An appraisal is booked."
            : "No appraisal yet.",
    },
    instruction: {
      caption: instruction
        ? stateOf("instruction") === "current"
          ? "Onboarding"
          : instruction.instructedOn
            ? shortDate.format(
                new Date(`${instruction.instructedOn}T00:00:00Z`),
              )
            : ""
        : stateOf("instruction") === "current"
          ? "Not started"
          : "",
      detail: instruction
        ? instruction.journeyStage === "onboarding"
          ? `Onboarding: ${met} of ${instruction.checklist.length} checklist items are in place.`
          : "Onboarding is complete and the instruction is Ready to market."
        : stateOf("instruction") === "current"
          ? "The appraisal is complete. The instruction has not been started."
          : "No current instruction.",
    },
    listing: {
      caption:
        stateOf("listing") !== "current"
          ? ""
          : listing === undefined
            ? ""
            : listing === null
              ? "Not started"
              : listing.state === "content_ready"
                ? "Content ready"
                : "Draft",
      detail:
        stateOf("listing") === "done"
          ? "The listing is Ready to advertise inside Zayto. Nothing has been published."
          : stateOf("listing") !== "current"
            ? "A listing is prepared once the instruction is Ready to market."
            : listing === undefined
              ? "The instruction is Ready to market."
              : listing === null
                ? "Ready for a listing to be prepared. There is no listing yet."
                : listing.state === "content_ready"
                  ? "The advert's content is ready. It is not yet Ready to advertise."
                  : "The advert is a draft.",
    },
    enquiries: {
      caption: stateOf("enquiries") === "current" ? "Open" : "",
      detail:
        stateOf("enquiries") === "current"
          ? "Applicants' enquiries can be recorded against this home."
          : "Enquiries can be recorded once the listing is Ready to advertise.",
    },
    viewings: { caption: "", detail: NOT_BUILT },
    let: { caption: "", detail: NOT_BUILT },
  };

  return {
    current,
    steps: JOURNEY_STEP_IDS.map((id) => ({
      id,
      label: JOURNEY_STEP_LABELS[id],
      state: stateOf(id),
      ...words[id],
    })),
    next: input.archived ? null : nextStep(instruction, openLead, listing),
  };
}

function nextStep(
  instruction: PropertyJourneyInput["instruction"],
  openLead: { id: string; stage: EnquiryStageCode } | null,
  listing: PropertyJourneyInput["listing"],
): NextStep | null {
  if (!instruction) {
    if (!openLead) return null;
    const target = { kind: "lead" as const, leadId: openLead.id };
    const base = { actionLabel: "Open landlord lead", target, checklist: [] };
    if (openLead.stage === "new_enquiry") {
      return {
        ...base,
        title: "Book the appraisal",
        description: "The landlord lead is open and has no appraisal yet.",
      };
    }
    if (openLead.stage === "appraisal_booked") {
      return {
        ...base,
        title: "Record the appraisal outcome",
        description: "An appraisal is booked for this property.",
      };
    }
    return {
      ...base,
      title: "Start the instruction",
      description:
        "The appraisal is complete. Start the instruction from the landlord lead.",
    };
  }
  const toInstruction = {
    kind: "instruction" as const,
    instructionId: instruction.id,
  };
  if (instruction.journeyStage === "onboarding") {
    return {
      title: instruction.checklistComplete
        ? "Mark it Ready to market"
        : "Finish onboarding",
      description: instruction.checklistComplete
        ? "Everything needed is in place."
        : "These are needed before the instruction can be Ready to market.",
      actionLabel: "Open instruction",
      target: toInstruction,
      checklist: instruction.checklist,
    };
  }
  // The viewer cannot see listings, so the page does not guess what is next.
  if (listing === undefined) return null;
  if (listing === null) {
    return {
      title: "Prepare the listing",
      description: "The instruction is Ready to market and has no listing yet.",
      actionLabel: "Open instruction",
      target: toInstruction,
      checklist: [],
    };
  }
  if (listing.state === "draft") {
    return {
      title: "Finish the advert",
      description: "The listing is a draft.",
      actionLabel: "Open listing",
      target: { kind: "listing", listingId: listing.id },
      checklist: [],
    };
  }
  if (listing.state === "content_ready") {
    return {
      title: "Check it is Ready to advertise",
      description:
        "The advert's content is ready. Ready to advertise is a stage inside Zayto; nothing is published.",
      actionLabel: "Open readiness",
      target: { kind: "listing", listingId: listing.id, tab: "readiness" },
      checklist: [],
    };
  }
  if (listing.state === "ready_to_advertise") {
    return {
      title: "Record enquiries as applicants ask",
      description:
        "The home is Ready to advertise inside Zayto, so enquiries can be recorded.",
      actionLabel: "Open enquiries",
      target: { kind: "listing", listingId: listing.id, tab: "enquiries" },
      checklist: [],
    };
  }
  return null;
}
