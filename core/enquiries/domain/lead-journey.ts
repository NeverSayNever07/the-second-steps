import type { EnquiryStageCode } from "@/core/enquiries/domain/enquiry";

// Where a landlord lead is on its way to an instruction (ADR-039). It is the
// first three stages of the property's journey, read straight from the lead's
// own stage and never stored. It adds no rule: booking, completing and
// starting an instruction are still checked where they always were.

export type LeadJourneyStep = {
  id: "lead" | "appraisal" | "instruction";
  label: string;
  state: "done" | "current" | "ahead";
  /** A few words under the label, or "". */
  caption: string;
  /** One sentence shown when the step is chosen. */
  detail: string;
};

const ORDER = ["lead", "appraisal", "instruction"] as const;

const CURRENT: Partial<Record<EnquiryStageCode, (typeof ORDER)[number]>> = {
  new_enquiry: "lead",
  appraisal_booked: "appraisal",
  appraisal_completed: "instruction",
};

/**
 * The lead's journey, or null for a lost or postponed lead: the lead does not
 * record how far it had got, so the page shows the outcome instead.
 */
export function deriveLeadJourney(
  stage: EnquiryStageCode,
): LeadJourneyStep[] | null {
  if (stage === "lost" || stage === "postponed") return null;
  const won = stage === "won";
  const currentIndex = won ? ORDER.length : ORDER.indexOf(CURRENT[stage]!);
  const stateOf = (id: (typeof ORDER)[number]) => {
    const index = ORDER.indexOf(id);
    if (index === currentIndex) return "current" as const;
    return index < currentIndex ? ("done" as const) : ("ahead" as const);
  };
  return [
    {
      id: "lead",
      label: "Lead",
      state: stateOf("lead"),
      caption: stateOf("lead") === "current" ? "Open" : "",
      detail:
        stateOf("lead") === "current"
          ? "The landlord lead is open. No appraisal is booked yet."
          : "The landlord lead was captured.",
    },
    {
      id: "appraisal",
      label: "Appraisal",
      state: stateOf("appraisal"),
      caption: stateOf("appraisal") === "current" ? "Booked" : "",
      detail:
        stateOf("appraisal") === "done"
          ? "The appraisal is complete."
          : stateOf("appraisal") === "current"
            ? "An appraisal is booked."
            : "No appraisal is booked yet.",
    },
    {
      id: "instruction",
      label: "Instruction",
      state: stateOf("instruction"),
      caption: won
        ? "Won"
        : stateOf("instruction") === "current"
          ? "Not started"
          : "",
      detail: won
        ? "An instruction was started from this lead."
        : stateOf("instruction") === "current"
          ? "The appraisal is complete. The instruction has not been started."
          : "An instruction can be started once the appraisal is complete.",
    },
  ];
}
