import { parseDateOnly, parsePounds } from "@/core/enquiries/domain/enquiry";
import {
  FURNISHED_STATUSES,
  PROPERTY_TYPES,
  type FurnishedStatusCode,
  type PropertyTypeCode,
} from "@/core/properties/domain/property";
import {
  RENT_PERIODS,
  type RentPeriodCode,
} from "@/core/instructions/domain/instruction";

// What an applicant household is looking for (ADR-036): minimal and
// non-sensitive. There is deliberately no field for income, employment,
// immigration status, identity, benefits, children or any protected
// characteristic, and the free-text notes are never used for matching.

export const REQUIREMENT_LIMITS = {
  areas: 10,
  area: 60,
  notes: 500,
  bedrooms: 20,
  householdSize: 20,
} as const;

export type RequirementsInput = {
  areas?: readonly string[] | null;
  minRent?: string | null;
  maxRent?: string | null;
  rentPeriod?: string | null;
  minBedrooms?: number | null;
  maxBedrooms?: number | null;
  propertyTypes?: readonly string[] | null;
  furnished?: string | null;
  /** "YYYY-MM-DD" */
  moveFrom?: string | null;
  moveBy?: string | null;
  householdSize?: number | null;
  hasPets?: boolean | null;
  notes?: string | null;
};

export type Requirements = {
  areas: string[];
  minRentPence: number | null;
  maxRentPence: number | null;
  rentPeriod: RentPeriodCode;
  minBedrooms: number | null;
  maxBedrooms: number | null;
  propertyTypes: PropertyTypeCode[];
  furnished: FurnishedStatusCode | null;
  moveFrom: string | null;
  moveBy: string | null;
  householdSize: number | null;
  hasPets: boolean;
  notes: string;
};

export type RequirementErrors = Partial<
  Record<keyof RequirementsInput, string>
>;

const oneOf = <T extends string>(options: readonly T[], value: unknown) =>
  options.find((option) => option === value) ?? null;

const intInRange = (value: number | null | undefined, max: number, min = 0) =>
  value === null || value === undefined
    ? { ok: true as const, value: null }
    : Number.isInteger(value) && value >= min && value <= max
      ? { ok: true as const, value }
      : { ok: false as const };

// Letters, numbers, spaces and the few marks that appear in place names.
const AREA_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} '.,&-]*$/u;

export function validateRequirements(input: RequirementsInput) {
  const errors: RequirementErrors = {};

  const areas: string[] = [];
  for (const raw of input.areas ?? []) {
    const area = raw.replace(/\s+/g, " ").trim();
    if (!area) continue;
    if (area.length > REQUIREMENT_LIMITS.area || !AREA_PATTERN.test(area)) {
      errors.areas = "Use town names or postcode districts such as M20.";
      break;
    }
    if (!areas.some((item) => item.toLowerCase() === area.toLowerCase())) {
      areas.push(area);
    }
  }
  if (areas.length > REQUIREMENT_LIMITS.areas) {
    errors.areas = `Choose up to ${REQUIREMENT_LIMITS.areas} areas.`;
  }

  const money = (
    value: string | null | undefined,
    field: "minRent" | "maxRent",
  ) => {
    if (!value?.trim()) return null;
    const pence = parsePounds(value);
    if (pence === null || pence < 100 || pence > 10_000_000) {
      errors[field] = "Enter an amount in pounds.";
      return null;
    }
    return pence;
  };
  const minRentPence = money(input.minRent, "minRent");
  const maxRentPence = money(input.maxRent, "maxRent");
  if (
    minRentPence !== null &&
    maxRentPence !== null &&
    minRentPence > maxRentPence
  ) {
    errors.maxRent = "The most cannot be less than the least.";
  }
  const rentPeriod = input.rentPeriod?.trim()
    ? oneOf(RENT_PERIODS, input.rentPeriod.trim())
    : "month";
  if (!rentPeriod) errors.rentPeriod = "Choose per month or per week.";

  const minBedrooms = intInRange(
    input.minBedrooms,
    REQUIREMENT_LIMITS.bedrooms,
  );
  const maxBedrooms = intInRange(
    input.maxBedrooms,
    REQUIREMENT_LIMITS.bedrooms,
  );
  if (!minBedrooms.ok)
    errors.minBedrooms = "Enter a whole number from 0 to 20.";
  if (!maxBedrooms.ok)
    errors.maxBedrooms = "Enter a whole number from 0 to 20.";
  if (
    minBedrooms.ok &&
    maxBedrooms.ok &&
    minBedrooms.value !== null &&
    maxBedrooms.value !== null &&
    minBedrooms.value > maxBedrooms.value
  ) {
    errors.maxBedrooms = "The most cannot be fewer than the least.";
  }

  const propertyTypes: PropertyTypeCode[] = [];
  for (const raw of input.propertyTypes ?? []) {
    const type = oneOf(PROPERTY_TYPES, raw);
    if (!type) {
      errors.propertyTypes = "Choose from the list of property types.";
      break;
    }
    if (!propertyTypes.includes(type)) propertyTypes.push(type);
  }

  const furnishedText = input.furnished?.trim() ?? "";
  const furnished = furnishedText
    ? oneOf(FURNISHED_STATUSES, furnishedText)
    : null;
  if (furnishedText && !furnished) errors.furnished = "Choose from the list.";

  const date = (
    value: string | null | undefined,
    field: "moveFrom" | "moveBy",
  ) => {
    const text = value?.trim() ?? "";
    if (!text) return null;
    if (!parseDateOnly(text)) {
      errors[field] = "Enter a valid date.";
      return null;
    }
    return text;
  };
  const moveFrom = date(input.moveFrom, "moveFrom");
  const moveBy = date(input.moveBy, "moveBy");
  if (moveFrom && moveBy && moveFrom > moveBy) {
    errors.moveBy = "The latest date cannot be before the earliest.";
  }

  const size = intInRange(
    input.householdSize,
    REQUIREMENT_LIMITS.householdSize,
    1,
  );
  if (!size.ok) errors.householdSize = "Enter a number from 1 to 20.";

  const notes = (input.notes ?? "").trim();
  if (
    notes.length > REQUIREMENT_LIMITS.notes ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(notes)
  ) {
    errors.notes = `Use ${REQUIREMENT_LIMITS.notes} characters or fewer.`;
  }

  if (
    Object.keys(errors).length > 0 ||
    !rentPeriod ||
    !minBedrooms.ok ||
    !maxBedrooms.ok ||
    !size.ok
  ) {
    return { ok: false, errors } as const;
  }
  return {
    ok: true,
    value: {
      areas,
      minRentPence,
      maxRentPence,
      rentPeriod,
      minBedrooms: minBedrooms.value,
      maxBedrooms: maxBedrooms.value,
      propertyTypes,
      furnished,
      moveFrom,
      moveBy,
      householdSize: size.value,
      hasPets: input.hasPets === true,
      notes,
    } satisfies Requirements,
  } as const;
}

/** What the notes box tells staff not to record. */
export const REQUIREMENT_NOTES_HINT =
  "Do not record income, employment, immigration, identity or benefits details here.";

const SENSITIVE_WORDS =
  /\b(income|salary|earns?|employ\w*|job|benefits?|universal credit|housing benefit|dss|passport|visa|immigration|nationality|right to rent|national insurance|bank|credit score|religio\w*|disabilit\w*|pregnan\w*)\b/i;

/**
 * A soft check: returns a warning when the notes look like they hold details
 * that must not be recorded. It never blocks saving.
 */
export function sensitiveNotesWarning(notes: string | null | undefined) {
  return notes && SENSITIVE_WORDS.test(notes) ? REQUIREMENT_NOTES_HINT : null;
}
