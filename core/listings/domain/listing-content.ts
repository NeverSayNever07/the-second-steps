import { parseDateOnly } from "@/core/enquiries/domain/enquiry";
import { LISTING_LIMITS } from "./listing-rules";

// The advert text staff write. Saving a draft only checks length and format:
// what must be present before a review is the readiness checklist's job, so
// half-finished work can always be saved.

export const FIELD_ORIGINS = [
  "copied",
  "edited",
  "not_supplied",
  "not_applicable",
  // Reserved for the later AI copy step: labelled drafts into editable fields.
  "manual",
  "ai_draft",
  "ai_edited",
] as const;
export type FieldOrigin = (typeof FIELD_ORIGINS)[number];

export type ListingContentInput = {
  headline?: string | null;
  summary?: string | null;
  description?: string | null;
  highlights?: readonly string[] | null;
  /** "YYYY-MM-DD" */
  availableFrom?: string | null;
  availabilityNote?: string | null;
  depositNote?: string | null;
  materialInformation?: string | null;
  materialInformationNotApplicable?: boolean | null;
};

export type ListingContent = {
  headline: string;
  summary: string;
  description: string;
  highlights: string[];
  availableFrom: Date | null;
  availabilityNote: string;
  depositNote: string;
  materialInformation: string;
  materialInformationNotApplicable: boolean;
};

export type ListingContentField = keyof ListingContentInput;
export type ListingContentErrors = Partial<Record<ListingContentField, string>>;

const clean = (value: string | null | undefined) => value?.trim() ?? "";

const tooLong = (max: number) => `Use ${max} characters or fewer.`;

export function validateListingContent(input: ListingContentInput) {
  const errors: ListingContentErrors = {};
  const limit = (
    field: ListingContentField,
    value: string,
    max: number,
  ): string => {
    if (value.length > max) errors[field] = tooLong(max);
    return value;
  };

  const headline = limit(
    "headline",
    clean(input.headline),
    LISTING_LIMITS.headline,
  );
  const summary = limit(
    "summary",
    clean(input.summary),
    LISTING_LIMITS.summary,
  );
  const description = limit(
    "description",
    clean(input.description),
    LISTING_LIMITS.description,
  );
  const availabilityNote = limit(
    "availabilityNote",
    clean(input.availabilityNote),
    LISTING_LIMITS.availabilityNote,
  );
  const depositNote = limit(
    "depositNote",
    clean(input.depositNote),
    LISTING_LIMITS.depositNote,
  );
  const materialInformation = limit(
    "materialInformation",
    clean(input.materialInformation),
    LISTING_LIMITS.materialInformation,
  );

  const highlights = (input.highlights ?? [])
    .map((item) => item.trim())
    .filter(Boolean);
  if (highlights.length > LISTING_LIMITS.highlights) {
    errors.highlights = `Use ${LISTING_LIMITS.highlights} highlights or fewer.`;
  } else if (
    highlights.some((item) => item.length > LISTING_LIMITS.highlight)
  ) {
    errors.highlights = `Keep each highlight to ${LISTING_LIMITS.highlight} characters or fewer.`;
  }

  const availableText = clean(input.availableFrom);
  const availableFrom = availableText ? parseDateOnly(availableText) : null;
  if (availableText && !availableFrom) {
    errors.availableFrom = "Enter a valid date.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors } as const;
  return {
    ok: true,
    value: {
      headline,
      summary,
      description,
      highlights,
      availableFrom,
      availabilityNote,
      depositNote,
      materialInformation,
      materialInformationNotApplicable: Boolean(
        input.materialInformationNotApplicable,
      ),
    } satisfies ListingContent,
  } as const;
}

/** A required reason for withdrawing, returning to Draft or similar. */
export function validateListingReason(value: string | null | undefined) {
  const reason = clean(value);
  if (!reason) return { ok: false, error: "Give a reason." } as const;
  if (reason.length > LISTING_LIMITS.reason) {
    return { ok: false, error: tooLong(LISTING_LIMITS.reason) } as const;
  }
  return { ok: true, reason } as const;
}
