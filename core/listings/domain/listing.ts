// A listing is an advert prepared inside Zayto. None of its states means it
// has been published anywhere: Ready to advertise is internal only
// (ADR-034). Advertised and portal states need a real, verified publication
// action and come later.

export const LISTING_STATES = [
  "draft",
  "content_ready",
  "ready_to_advertise",
  "withdrawn",
] as const;
export type ListingStateCode = (typeof LISTING_STATES)[number];

export const LISTING_STATE_LABELS: Record<ListingStateCode, string> = {
  draft: "Draft",
  content_ready: "Content ready",
  ready_to_advertise: "Ready to advertise (internal only)",
  withdrawn: "Withdrawn",
};

export const LISTING_EVENT_KINDS = [
  "created",
  // Each saved version records the rent it was based on, so rent history
  // needs no separate event.
  "version_saved",
  "marked_content_ready",
  "marked_ready_to_advertise",
  "returned_to_draft",
  "edited_after_review",
  "withdrawn",
  "instruction_returned",
  "instruction_ended",
] as const;
export type ListingEventKind = (typeof LISTING_EVENT_KINDS)[number];

/**
 * The moves a listing may make. Withdrawn is final: a later attempt creates a
 * new listing. Going back to Draft is always possible until withdrawn.
 */
const TRANSITIONS: Record<ListingStateCode, readonly ListingStateCode[]> = {
  draft: ["content_ready", "withdrawn"],
  content_ready: ["draft", "ready_to_advertise", "withdrawn"],
  ready_to_advertise: ["draft", "withdrawn"],
  withdrawn: [],
};

export const canMoveListing = (from: ListingStateCode, to: ListingStateCode) =>
  TRANSITIONS[from].includes(to);

/** A listing that has not been withdrawn: at most one per instruction. */
export const isCurrentListing = (state: ListingStateCode) =>
  state !== "withdrawn";

/** The states a review has confirmed, which any edit takes back to Draft. */
export const isReviewedState = (state: ListingStateCode) =>
  state === "content_ready" || state === "ready_to_advertise";

export const isListingState = (value: unknown): value is ListingStateCode =>
  LISTING_STATES.includes(value as ListingStateCode);
