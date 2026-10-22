// A viewing belongs to a property enquiry (ADR-037). Times are entered by
// staff: Zayto never invents a default length. Outcomes record what the
// applicant thought; none of them is an offer.

export const VIEWING_STATUSES = [
  "scheduled",
  "completed",
  "cancelled",
  "no_show",
] as const;
export type ViewingStatusCode = (typeof VIEWING_STATUSES)[number];

export const VIEWING_STATUS_LABELS: Readonly<
  Record<ViewingStatusCode, string>
> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "Did not attend",
};

export const VIEWING_OUTCOMES = [
  "interested",
  "wants_another_viewing",
  "not_interested",
  "undecided",
] as const;
export type ViewingOutcomeCode = (typeof VIEWING_OUTCOMES)[number];

export const VIEWING_OUTCOME_LABELS: Readonly<
  Record<ViewingOutcomeCode, string>
> = {
  interested: "Interested",
  wants_another_viewing: "Wants another viewing",
  not_interested: "Not interested",
  undecided: "Undecided",
};

const VIEWING_TRANSITIONS: Readonly<
  Record<ViewingStatusCode, readonly ViewingStatusCode[]>
> = {
  scheduled: ["completed", "cancelled", "no_show"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export const canMoveViewing = (
  from: ViewingStatusCode,
  to: ViewingStatusCode,
) => VIEWING_TRANSITIONS[from].includes(to);

export const isViewingStatus = (value: unknown): value is ViewingStatusCode =>
  VIEWING_STATUSES.includes(value as ViewingStatusCode);

export const isViewingOutcome = (value: unknown): value is ViewingOutcomeCode =>
  VIEWING_OUTCOMES.includes(value as ViewingOutcomeCode);

/** Completing a viewing needs an outcome; no other move takes one. */
export function validateViewingMove(input: {
  to: ViewingStatusCode;
  outcome: string | null | undefined;
}):
  | { ok: true; outcome: ViewingOutcomeCode | null }
  | { ok: false; error: "outcome_required" | "outcome_not_allowed" } {
  const outcome = input.outcome?.trim() || null;
  if (input.to === "completed") {
    return isViewingOutcome(outcome)
      ? { ok: true, outcome }
      : { ok: false, error: "outcome_required" };
  }
  return outcome
    ? { ok: false, error: "outcome_not_allowed" }
    : { ok: true, outcome: null };
}

/** A guard against typos (an end on the wrong day), not a default length. */
const LONGEST_VIEWING_MS = 24 * 3_600_000;

export function validateViewingTimes(input: {
  startsAt: Date;
  endsAt: Date;
}): { ok: true } | { ok: false; error: string } {
  const start = input.startsAt.getTime();
  const end = input.endsAt.getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return { ok: false, error: "Enter a valid start and end time." };
  }
  if (end <= start) {
    return { ok: false, error: "The end must be after the start." };
  }
  if (end - start > LONGEST_VIEWING_MS) {
    return { ok: false, error: "A viewing cannot run longer than a day." };
  }
  return { ok: true };
}

/** Whether two viewings of the same person overlap: a warning, never a block. */
export function viewingsOverlap(
  a: { startsAt: Date; endsAt: Date },
  b: { startsAt: Date; endsAt: Date },
) {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

export const VIEWING_FEEDBACK_MAX = 1000;
