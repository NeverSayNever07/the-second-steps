// Starter reasons for closing an applicant or an enquiry (and, later,
// cancelling a viewing). An agency can add, rename and hide them in Settings;
// these are only what a new agency starts with. "Home no longer available" is
// never a reason: it is recorded by the database when a listing is withdrawn.

export const STARTER_APPLICANT_REASONS = [
  "Found a home elsewhere",
  "No longer looking",
  "No response",
  "Duplicate record",
  "Other",
] as const;

export const STARTER_ENQUIRY_REASONS = [
  "Not suitable",
  "No response",
  "Applicant withdrew",
  "Duplicate enquiry",
  "Other",
] as const;

export type LettingsReasonKind = "applicant" | "property_enquiry" | "viewing";

/** The longest note kept with a closure or status change. */
export const LETTINGS_NOTE_MAX = 500;

export function validateLettingsNote(value: string | null | undefined) {
  const note = value?.trim() ?? "";
  if (
    note.length > LETTINGS_NOTE_MAX ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(note)
  ) {
    return { ok: false } as const;
  }
  return { ok: true, note: note || null } as const;
}
