import type { JourneyStageCode } from "@/core/instructions/domain/instruction";
import type { ListingStateCode } from "@/core/listings/domain/listing";

// Where a property stands in its letting life (ADR-035). It is worked out
// when shown, never stored, so it cannot go stale. Nothing here says a
// property is advertised: Ready to advertise is an internal stage (ADR-034).
// Let and Notice given will join when tenancies exist.

export const LETTING_STATUSES = [
  "not_instructed",
  "onboarding",
  "ready_to_market",
  "listing_in_preparation",
  "ready_to_advertise",
  "ended",
] as const;
export type LettingStatusCode = (typeof LETTING_STATUSES)[number];

export const LETTING_STATUS_LABELS: Readonly<
  Record<LettingStatusCode, string>
> = {
  not_instructed: "Not instructed",
  onboarding: "Onboarding",
  ready_to_market: "Ready to market",
  listing_in_preparation: "Listing in preparation",
  ready_to_advertise: "Ready to advertise (internal)",
  ended: "Instruction ended",
};

export const LETTING_STATUS_DESCRIPTIONS: Readonly<
  Record<LettingStatusCode, string>
> = {
  not_instructed: "No instruction has been started for this property.",
  onboarding: "The instruction is being set up.",
  ready_to_market: "Ready for a listing to be prepared. No listing yet.",
  listing_in_preparation: "A listing is being written and checked.",
  ready_to_advertise:
    "The listing is ready inside Zayto. Nothing has been published.",
  ended: "The last instruction has ended and no new one has started.",
};

export function deriveLettingStatus(input: {
  /** The property's current (not ended) instruction, if it has one. */
  currentInstruction: { journeyStage: JourneyStageCode } | null;
  /** Whether the property has any ended instruction. */
  hasEndedInstruction: boolean;
  /**
   * The state of the current instruction's current listing, null when it has
   * none, or undefined when the viewer may not read listings.
   */
  listingState: ListingStateCode | null | undefined;
}): LettingStatusCode {
  const { currentInstruction, hasEndedInstruction, listingState } = input;
  if (!currentInstruction) {
    return hasEndedInstruction ? "ended" : "not_instructed";
  }
  if (currentInstruction.journeyStage === "onboarding") return "onboarding";
  if (currentInstruction.journeyStage === "withdrawn") return "ended";
  if (listingState === "ready_to_advertise") return "ready_to_advertise";
  if (listingState === "draft" || listingState === "content_ready") {
    return "listing_in_preparation";
  }
  return "ready_to_market";
}
