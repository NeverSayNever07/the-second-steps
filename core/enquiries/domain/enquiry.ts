import {
  normalizeEmail,
  normalizeTelephone,
} from "@/core/contacts/domain/contact";
import { normalizePropertyPostcode } from "@/core/properties/domain/property";

export const ENQUIRY_LIMITS = {
  name: 200,
  email: 254,
  telephone: 32,
  addressLine: 160,
  summary: 2000,
  reason: 500,
  note: 500,
  listName: 80,
  taskTitle: 200,
  appraisalNotes: 2000,
} as const;

export const ENQUIRY_STAGES = [
  "new_enquiry",
  "appraisal_booked",
  "appraisal_completed",
  "won",
  "lost",
  "postponed",
] as const;
export type EnquiryStageCode = (typeof ENQUIRY_STAGES)[number];

/** Stages in which an enquiry is still being worked. */
export const OPEN_STAGES: readonly EnquiryStageCode[] = [
  "new_enquiry",
  "appraisal_booked",
  "appraisal_completed",
];

export function isOpenStage(stage: EnquiryStageCode) {
  return OPEN_STAGES.includes(stage);
}

const STAGE_RANK: Record<EnquiryStageCode, number> = {
  new_enquiry: 1,
  appraisal_booked: 2,
  appraisal_completed: 3,
  won: 4,
  lost: 5,
  postponed: 5,
};

/** Matches the database rule: closing or moving backwards needs a reason. */
export function stageChangeNeedsReason(
  from: EnquiryStageCode,
  to: EnquiryStageCode,
) {
  return (
    to === "lost" || to === "postponed" || STAGE_RANK[to] <= STAGE_RANK[from]
  );
}

/**
 * Stage moves staff can make directly. Booking and completing an appraisal
 * move the stage themselves, and reopening is its own permissioned action.
 */
export function canCloseFrom(stage: EnquiryStageCode) {
  return isOpenStage(stage);
}

export function canWinFrom(stage: EnquiryStageCode) {
  return stage === "appraisal_completed";
}

export const APPRAISAL_STATUSES = [
  "scheduled",
  "completed",
  "cancelled",
  "did_not_attend",
] as const;
export type AppraisalStatusCode = (typeof APPRAISAL_STATUSES)[number];

export const LETTING_SERVICES = [
  "let_only",
  "rent_collection",
  "fully_managed",
] as const;
export type LettingServiceCode = (typeof LETTING_SERVICES)[number];

export type EnquirerInput = {
  name: string;
  email: string;
  telephone: string;
  addressBuilding: string;
  addressStreet: string;
  postcode: string;
  summary: string;
};

export type EnquirerField = keyof EnquirerInput;

export type ValidEnquirer = {
  name: string;
  email: string | null;
  telephone: string | null;
  addressBuilding: string | null;
  addressStreet: string | null;
  postcode: string | null;
  summary: string | null;
};

function optional(value: string) {
  return value.trim() || null;
}

/**
 * Quick-capture rules: a name, at least one way to reach the landlord (unless
 * an existing contact was chosen) and a postcode (unless an existing property
 * was chosen).
 */
export function validateEnquirer(
  input: EnquirerInput,
  options: { hasContact: boolean; hasProperty: boolean },
) {
  const errors: Partial<Record<EnquirerField, string>> = {};
  const name = input.name.trim();
  const emailText = optional(input.email);
  const telephoneText = optional(input.telephone);
  const building = optional(input.addressBuilding);
  const street = optional(input.addressStreet);
  const postcodeText = optional(input.postcode);
  const summary = optional(input.summary);

  if (!name) errors.name = "Enter the landlord's name.";
  else if (name.length > ENQUIRY_LIMITS.name) {
    errors.name = `Use ${ENQUIRY_LIMITS.name} characters or fewer.`;
  }

  const email = emailText ? normalizeEmail(emailText) : null;
  if (emailText && !email) errors.email = "Enter a valid email address.";
  const telephone = telephoneText ? normalizeTelephone(telephoneText) : null;
  if (telephoneText && !telephone) {
    errors.telephone = "Enter a valid telephone number.";
  }
  if (!emailText && !telephoneText && !options.hasContact) {
    errors.telephone = "Enter a telephone number or an email address.";
  }

  if (building && building.length > ENQUIRY_LIMITS.addressLine) {
    errors.addressBuilding = `Use ${ENQUIRY_LIMITS.addressLine} characters or fewer.`;
  }
  if (street && street.length > ENQUIRY_LIMITS.addressLine) {
    errors.addressStreet = `Use ${ENQUIRY_LIMITS.addressLine} characters or fewer.`;
  }
  const postcode = postcodeText
    ? normalizePropertyPostcode(postcodeText)
    : null;
  if (postcodeText && !postcode) errors.postcode = "Enter a valid UK postcode.";
  if (!postcodeText && !options.hasProperty) {
    errors.postcode = "Enter the property's postcode.";
  }
  if (summary && summary.length > ENQUIRY_LIMITS.summary) {
    errors.summary = `Use ${ENQUIRY_LIMITS.summary} characters or fewer.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors } as const;
  return {
    ok: true,
    data: {
      name,
      email,
      telephone,
      addressBuilding: building,
      addressStreet: street,
      postcode,
      summary,
    } satisfies ValidEnquirer,
  } as const;
}

export function validateReason(
  value: string,
  max: number = ENQUIRY_LIMITS.reason,
) {
  const reason = value.trim();
  if (!reason) return { ok: false, error: "Give a reason." } as const;
  if (reason.length > max) {
    return {
      ok: false,
      error: `Use ${max} characters or fewer.`,
    } as const;
  }
  return { ok: true, reason } as const;
}

export function validateOptionalNote(value: string | null | undefined) {
  const note = value?.trim() ?? "";
  if (!note) return { ok: true, note: null } as const;
  if (note.length > ENQUIRY_LIMITS.note) return { ok: false } as const;
  return { ok: true, note } as const;
}

export function validateListName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Enter a name." } as const;
  if (name.length > ENQUIRY_LIMITS.listName) {
    return {
      ok: false,
      error: `Use ${ENQUIRY_LIMITS.listName} characters or fewer.`,
    } as const;
  }
  return { ok: true, name } as const;
}

export function validateTaskTitle(value: string) {
  const title = value.trim();
  if (!title) return { ok: false, error: "Enter what needs doing." } as const;
  if (title.length > ENQUIRY_LIMITS.taskTitle) {
    return {
      ok: false,
      error: `Use ${ENQUIRY_LIMITS.taskTitle} characters or fewer.`,
    } as const;
  }
  return { ok: true, title } as const;
}

/** Parses "YYYY-MM-DD" into a UTC-midnight date, or null if it is not a real date. */
export function parseDateOnly(value: string | null | undefined) {
  const text = value?.trim();
  if (!text) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== text ||
    Number(match[1]) < 2000 ||
    Number(match[1]) > 2100
  ) {
    return null;
  }
  return date;
}

/** Today's date in UK time as "YYYY-MM-DD". */
export function ukToday(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** The UK calendar date of a moment, as "YYYY-MM-DD". */
export function ukDateOf(moment: Date) {
  return ukToday(moment);
}

/** Overdue means open and due before today (UK date). */
export function isOverdue(dueOn: Date, now: Date = new Date()) {
  return dueOn.toISOString().slice(0, 10) < ukToday(now);
}

/** The start and end (exclusive) of today in UK time, as real moments. */
export function ukDayBounds(now: Date = new Date()) {
  const today = ukToday(now);
  const start = ukMidnight(today);
  const nextDay = new Date(`${today}T12:00:00.000Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const end = ukMidnight(nextDay.toISOString().slice(0, 10));
  return { start, end };
}

function ukMidnight(date: string) {
  // UK midnight is 00:00 (winter) or 23:00 the day before (summer time).
  const guess = new Date(`${date}T00:00:00.000Z`);
  const offsetHours = ukOffsetHours(guess);
  return new Date(guess.getTime() - offsetHours * 3_600_000);
}

function ukOffsetHours(moment: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(moment);
  const part = (type: string) =>
    Number(parts.find((item) => item.type === type)?.value ?? "0");
  const local = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour") % 24,
  );
  return Math.round((local - moment.getTime()) / 3_600_000);
}

export type AppraisalOutcomeInput = {
  expectedMonthlyRent: string;
  recommendedService: string;
  feeKind: string;
  feeValue: string;
  feeVat: string;
  notes: string;
};

export type ValidAppraisalOutcome = {
  expectedMonthlyRentPence: number | null;
  recommendedService: LettingServiceCode | null;
  feeKind: "percentage" | "fixed" | null;
  feeValue: number | null;
  feeVat: "inclusive" | "exclusive" | null;
  notes: string | null;
};

const MONEY_PATTERN = /^\d{1,7}(\.\d{1,2})?$/;

/** Parses pounds such as "1250" or "1250.50" into whole pence. */
export function parsePounds(value: string) {
  const text = value.trim().replace(/^£/, "").replace(/,/g, "");
  if (!MONEY_PATTERN.test(text)) return null;
  const [pounds, pence = ""] = text.split(".");
  return Number(pounds) * 100 + Number(pence.padEnd(2, "0"));
}

/** Parses a percentage such as "12.5" into basis points (1250). */
export function parsePercentageToBasisPoints(value: string) {
  const text = value.trim().replace(/%$/, "");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function validateAppraisalOutcome(input: AppraisalOutcomeInput) {
  const errors: Partial<Record<keyof AppraisalOutcomeInput, string>> = {};

  let rent: number | null = null;
  if (input.expectedMonthlyRent.trim()) {
    rent = parsePounds(input.expectedMonthlyRent);
    if (rent === null || rent < 1 || rent > 10_000_000) {
      errors.expectedMonthlyRent = "Enter the monthly rent in pounds.";
    }
  }

  const service = input.recommendedService.trim();
  let recommendedService: LettingServiceCode | null = null;
  if (service) {
    recommendedService =
      LETTING_SERVICES.find((option) => option === service) ?? null;
    if (!recommendedService) {
      errors.recommendedService = "Choose a service.";
    }
  }

  let feeKind: ValidAppraisalOutcome["feeKind"] = null;
  let feeValue: number | null = null;
  let feeVat: ValidAppraisalOutcome["feeVat"] = null;
  const anyFee =
    input.feeKind.trim() || input.feeValue.trim() || input.feeVat.trim();
  if (anyFee) {
    if (input.feeKind === "percentage" || input.feeKind === "fixed") {
      feeKind = input.feeKind;
    } else errors.feeKind = "Choose percentage or fixed fee.";
    if (input.feeVat === "inclusive" || input.feeVat === "exclusive") {
      feeVat = input.feeVat;
    } else errors.feeVat = "Say whether the fee includes VAT.";
    if (feeKind === "percentage") {
      feeValue = parsePercentageToBasisPoints(input.feeValue);
      if (feeValue === null || feeValue < 1 || feeValue > 10_000) {
        errors.feeValue = "Enter a percentage between 0.01 and 100.";
      }
    } else if (feeKind === "fixed") {
      feeValue = parsePounds(input.feeValue);
      if (feeValue === null || feeValue < 1 || feeValue > 100_000_000) {
        errors.feeValue = "Enter the fee in pounds.";
      }
    }
  }

  const notes = optional(input.notes);
  if (notes && notes.length > ENQUIRY_LIMITS.appraisalNotes) {
    errors.notes = `Use ${ENQUIRY_LIMITS.appraisalNotes} characters or fewer.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors } as const;
  return {
    ok: true,
    data: {
      expectedMonthlyRentPence: rent,
      recommendedService,
      feeKind,
      feeValue,
      feeVat,
      notes,
    } satisfies ValidAppraisalOutcome,
  } as const;
}

export const STARTER_LEAD_SOURCES = [
  "Rightmove",
  "Zoopla",
  "OnTheMarket",
  "Own website",
  "Phone call",
  "Walk-in",
  "Landlord referral",
  "Tenant referral",
  "Existing landlord (another property)",
  "Social media",
  "Leaflet or advert",
  "Local event",
  "Other",
] as const;

export const STARTER_LOST_REASONS = [
  "Went with another agent",
  "Fees too high",
  "Decided to sell",
  "Decided to let privately",
  "Property not suitable",
  "Could not contact",
  "Other",
] as const;

export const STARTER_POSTPONED_REASONS = [
  "Landlord not ready yet",
  "Waiting for tenants to leave",
  "Waiting for refurbishment",
  "Waiting for a sale decision",
  "Other",
] as const;
