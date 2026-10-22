import type { ListingStateCode } from "@/core/listings/domain/listing";

// Applicants, property enquiries and viewings (ADR-036, ADR-037). An applicant
// is one household led by one contact. Nothing here says a property is live,
// published or advertised: listings are internal and enquiries are recorded by
// staff.

// --- Applicant ---

export const APPLICANT_STATUSES = ["active", "on_hold", "closed"] as const;
export type ApplicantStatusCode = (typeof APPLICANT_STATUSES)[number];

export const APPLICANT_STATUS_LABELS: Readonly<
  Record<ApplicantStatusCode, string>
> = {
  active: "Active",
  on_hold: "On hold",
  closed: "Closed",
};

/** Closing an applicant needs a reason. Reopening is for managers (applicant.reopen). */
const APPLICANT_TRANSITIONS: Readonly<
  Record<ApplicantStatusCode, readonly ApplicantStatusCode[]>
> = {
  active: ["on_hold", "closed"],
  on_hold: ["active", "closed"],
  closed: ["active"],
};

export const canMoveApplicant = (
  from: ApplicantStatusCode,
  to: ApplicantStatusCode,
) => APPLICANT_TRANSITIONS[from].includes(to);

/** An applicant still being worked: active or on hold. */
export const isOpenApplicant = (status: ApplicantStatusCode) =>
  status !== "closed";

export const applicantMoveNeedsReason = (to: ApplicantStatusCode) =>
  to === "closed";

/** Moving a closed applicant back to active is a reopen. */
export const isApplicantReopen = (
  from: ApplicantStatusCode,
  to: ApplicantStatusCode,
) => from === "closed" && to !== "closed";

export const isApplicantStatus = (
  value: unknown,
): value is ApplicantStatusCode =>
  APPLICANT_STATUSES.includes(value as ApplicantStatusCode);

// --- Property enquiry ---

export const ENQUIRY_STAGES = [
  "new",
  "contacted",
  "viewing_arranged",
  "viewed",
  "closed",
] as const;
export type PropertyEnquiryStageCode = (typeof ENQUIRY_STAGES)[number];

export const ENQUIRY_STAGE_LABELS: Readonly<
  Record<PropertyEnquiryStageCode, string>
> = {
  new: "New",
  contacted: "Contacted",
  viewing_arranged: "Viewing arranged",
  viewed: "Viewed",
  closed: "Closed",
};

const OPEN_ENQUIRY_STAGES = [
  "new",
  "contacted",
  "viewing_arranged",
  "viewed",
] as const;

export const isOpenEnquiryStage = (stage: PropertyEnquiryStageCode) =>
  stage !== "closed";

/**
 * Forward or back one step, or closed (with a reason). A closed enquiry can be
 * reopened to New, but not once its listing is withdrawn (see
 * `canReopenEnquiry`).
 */
export function canMoveEnquiry(
  from: PropertyEnquiryStageCode,
  to: PropertyEnquiryStageCode,
) {
  if (from === to) return false;
  if (from === "closed") return to === "new";
  if (to === "closed") return true;
  return (
    Math.abs(
      OPEN_ENQUIRY_STAGES.indexOf(from) - OPEN_ENQUIRY_STAGES.indexOf(to),
    ) === 1
  );
}

export const enquiryMoveNeedsReason = (to: PropertyEnquiryStageCode) =>
  to === "closed";

export const isEnquiryStage = (
  value: unknown,
): value is PropertyEnquiryStageCode =>
  ENQUIRY_STAGES.includes(value as PropertyEnquiryStageCode);

// --- Listings and enquiries (ADR-037) ---

/** An enquiry or a viewing can only be recorded on a listing that is Ready to advertise. */
export const canRegisterEnquiry = (listingState: ListingStateCode) =>
  listingState === "ready_to_advertise";

export const canBookViewing = canRegisterEnquiry;

/** A closed enquiry cannot come back to life on a withdrawn listing. */
export const canReopenEnquiry = (listingState: ListingStateCode) =>
  listingState !== "withdrawn";

/** The system reason used when a withdrawn listing closes its enquiries and viewings. */
export const HOME_NO_LONGER_AVAILABLE = "Home no longer available";

/**
 * What staff are told about an enquiry or viewing when its listing is not
 * Ready to advertise. Null when nothing needs saying.
 */
export function enquiryListingNotice(
  listingState: ListingStateCode,
): string | null {
  if (listingState === "withdrawn") {
    return "This home is no longer available. Tell the applicant.";
  }
  if (listingState !== "ready_to_advertise") {
    return "This home is not ready (back in preparation). New enquiries and viewings wait until it is ready again.";
  }
  return null;
}
