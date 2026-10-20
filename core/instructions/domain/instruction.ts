import { randomBytes } from "node:crypto";
import {
  LETTING_SERVICES,
  parseDateOnly,
  parsePercentageToBasisPoints,
  parsePounds,
  ukToday,
  type LettingServiceCode,
} from "@/core/enquiries/domain/enquiry";

const REFERENCE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function createInstructionReference() {
  const suffix = Array.from(
    randomBytes(8),
    (byte) => REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length],
  ).join("");
  return `INS-${suffix}`;
}

export const INSTRUCTION_LIMITS = {
  reason: 500,
  method: 200,
  notes: 2000,
  chargeName: 80,
  charges: 20,
  /** Largest money amount accepted, in pence (£100,000). */
  maxPence: 10_000_000,
} as const;

export const JOURNEY_STAGES = [
  "onboarding",
  "ready_to_market",
  "withdrawn",
] as const;
export type JourneyStageCode = (typeof JOURNEY_STAGES)[number];

export const RENT_PERIODS = ["month", "week"] as const;
export type RentPeriodCode = (typeof RENT_PERIODS)[number];

export const FEE_FREQUENCIES = ["one_off", "weekly", "monthly"] as const;
export type FeeFrequencyCode = (typeof FEE_FREQUENCIES)[number];

export const FEE_VAT_TREATMENTS = ["inclusive", "exclusive", "none"] as const;
export type FeeVatCode = (typeof FEE_VAT_TREATMENTS)[number];

export const DEPOSIT_OFFERINGS = ["standard", "replacement", "both"] as const;
export type DepositOfferingCode = (typeof DEPOSIT_OFFERINGS)[number];

export const AGREEMENT_STATUSES = ["prepared", "sent", "signed"] as const;
export type AgreementStatusCode = (typeof AGREEMENT_STATUSES)[number];
/** Signed now comes only from a completed agreement upload (C2). */
export const RECORDABLE_AGREEMENT_STATUSES = ["prepared", "sent"] as const;

/**
 * The signed-agreement evidence: none completed, a completed agreement that
 * still covers the current fees and landlords, or one that no longer does.
 */
export type AgreementEvidence = "none" | "current" | "update_required";

export const OWNERSHIP_CHECK_STATUSES = [
  "in_progress",
  "verified",
  "not_verified",
] as const;
export type OwnershipCheckStatusCode =
  (typeof OWNERSHIP_CHECK_STATUSES)[number];

export const EXCEPTION_KINDS = ["agreement", "ownership_check"] as const;
export type ExceptionKindCode = (typeof EXCEPTION_KINDS)[number];
/** Earlier agreement exceptions stay as history but can no longer be added. */
export const APPROVABLE_EXCEPTION_KINDS = ["ownership_check"] as const;

function oneOf<T extends string>(options: readonly T[], value: unknown) {
  return options.find((option) => option === value) ?? null;
}

export const isJourneyStage = (value: unknown) =>
  oneOf(JOURNEY_STAGES, value) !== null;
export const isRecordableAgreementStatus = (value: unknown) =>
  oneOf(RECORDABLE_AGREEMENT_STATUSES, value) !== null;
export const isOwnershipCheckStatus = (value: unknown) =>
  oneOf(OWNERSHIP_CHECK_STATUSES, value) !== null;
export const isApprovableExceptionKind = (value: unknown) =>
  oneOf(APPROVABLE_EXCEPTION_KINDS, value) !== null;

/** Text from a form, trimmed; empty means not given. */
function text(value: string | null | undefined) {
  return value?.trim() ?? "";
}

/** A required reason of 1 to `max` characters. */
export function validateInstructionReason(
  value: string | null | undefined,
  max: number = INSTRUCTION_LIMITS.reason,
) {
  const reason = text(value);
  if (!reason) return { ok: false, error: "Give a reason." } as const;
  if (reason.length > max) {
    return { ok: false, error: `Use ${max} characters or fewer.` } as const;
  }
  return { ok: true, reason } as const;
}

export type ChargeInput = { name: string; amount: string; vat: string };

/** What a form sends for the terms. Money is in pounds; percentages in %. */
export type TermsInput = {
  service: string;
  askingRent: string;
  rentPeriod: string;
  feeKind: string;
  feeValue: string;
  feeFrequency: string;
  feeVat: string;
  depositOffering: string;
  deposit: string;
  holdingDeposit: string;
  charges: readonly ChargeInput[];
};

export type ValidTerms = {
  service: LettingServiceCode;
  askingRentPence: number | null;
  rentPeriod: RentPeriodCode | null;
  feeKind: "percentage" | "fixed" | null;
  /** Basis points for a percentage fee; pence for a fixed fee. */
  feeValue: number | null;
  feeFrequency: FeeFrequencyCode | null;
  feeVat: FeeVatCode | null;
  depositOffering: DepositOfferingCode | null;
  depositPence: number | null;
  holdingDepositPence: number | null;
  charges: { name: string; amountPence: number; vat: FeeVatCode }[];
};

export type TermsErrors = Partial<
  Record<keyof Omit<TermsInput, "charges"> | "charges", string>
>;

function pence(value: string) {
  const amount = parsePounds(value);
  return amount !== null && amount >= 1 && amount <= INSTRUCTION_LIMITS.maxPence
    ? amount
    : null;
}

/**
 * Checks the terms a form sends. Rent, fee and deposit may be left empty (the
 * instruction is then incomplete); anything given must be valid. No legal
 * limits are applied to deposit or fee amounts: those rules are specified
 * separately.
 */
export function validateTerms(input: TermsInput) {
  const errors: TermsErrors = {};

  const service = oneOf(LETTING_SERVICES, text(input.service));
  if (!service) errors.service = "Choose a service.";

  let askingRentPence: number | null = null;
  let rentPeriod: RentPeriodCode | null = null;
  if (text(input.askingRent)) {
    askingRentPence = pence(input.askingRent);
    if (askingRentPence === null) {
      errors.askingRent = "Enter the asking rent in pounds.";
    }
    rentPeriod = oneOf(RENT_PERIODS, text(input.rentPeriod));
    if (!rentPeriod) errors.rentPeriod = "Choose per month or per week.";
  }

  let feeKind: ValidTerms["feeKind"] = null;
  let feeValue: number | null = null;
  let feeFrequency: FeeFrequencyCode | null = null;
  let feeVat: FeeVatCode | null = null;
  if (text(input.feeKind) || text(input.feeValue)) {
    if (input.feeKind === "percentage" || input.feeKind === "fixed") {
      feeKind = input.feeKind;
    } else errors.feeKind = "Choose a percentage or a fixed fee.";
    feeVat = oneOf(FEE_VAT_TREATMENTS, text(input.feeVat));
    if (!feeVat) errors.feeVat = "Say how VAT applies to the fee.";
    if (feeKind === "percentage") {
      feeValue = parsePercentageToBasisPoints(input.feeValue);
      if (feeValue === null || feeValue < 1 || feeValue > 10_000) {
        errors.feeValue = "Enter a percentage between 0.01 and 100.";
      }
    } else if (feeKind === "fixed") {
      feeValue = pence(input.feeValue);
      if (feeValue === null) errors.feeValue = "Enter the fee in pounds.";
      feeFrequency = oneOf(FEE_FREQUENCIES, text(input.feeFrequency));
      if (!feeFrequency) {
        errors.feeFrequency = "Say whether it is one-off, weekly or monthly.";
      }
    }
  }

  const depositOffering = oneOf(DEPOSIT_OFFERINGS, text(input.depositOffering));
  if (text(input.depositOffering) && !depositOffering) {
    errors.depositOffering = "Choose what is offered.";
  }
  let depositPence: number | null = null;
  if (text(input.deposit)) {
    depositPence = pence(input.deposit);
    if (depositPence === null) {
      errors.deposit = "Enter the deposit in pounds.";
    } else if (depositOffering !== "standard" && depositOffering !== "both") {
      errors.deposit = "A deposit amount needs a standard deposit offered.";
    }
  }
  let holdingDepositPence: number | null = null;
  if (text(input.holdingDeposit)) {
    holdingDepositPence = pence(input.holdingDeposit);
    if (holdingDepositPence === null) {
      errors.holdingDeposit = "Enter the holding deposit in pounds.";
    }
  }

  const charges: ValidTerms["charges"] = [];
  if (input.charges.length > INSTRUCTION_LIMITS.charges) {
    errors.charges = `Use ${INSTRUCTION_LIMITS.charges} charges or fewer.`;
  } else {
    for (const charge of input.charges) {
      const name = text(charge.name);
      const amountPence = pence(charge.amount);
      const vat = oneOf(FEE_VAT_TREATMENTS, text(charge.vat));
      if (
        !name ||
        name.length > INSTRUCTION_LIMITS.chargeName ||
        amountPence === null ||
        !vat
      ) {
        errors.charges =
          "Each charge needs a name, an amount in pounds and a VAT choice.";
        break;
      }
      charges.push({ name, amountPence, vat });
    }
  }

  if (Object.keys(errors).length > 0 || !service) {
    return { ok: false, errors } as const;
  }
  return {
    ok: true,
    data: {
      service,
      askingRentPence,
      rentPeriod,
      feeKind,
      feeValue,
      feeFrequency,
      feeVat,
      depositOffering,
      depositPence,
      holdingDepositPence,
      charges,
    } satisfies ValidTerms,
  } as const;
}

/** True when both are the same terms (so saving would change nothing). */
export function sameTerms(a: ValidTerms, b: ValidTerms) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export type ChecklistItemCode =
  | "lead_staff"
  | "landlord"
  | "service"
  | "asking_rent"
  | "fee"
  | "deposit"
  | "agreement"
  | "ownership_check";

export type ChecklistItem = {
  code: ChecklistItemCode;
  label: string;
  met: boolean;
  /** Met only through a manager's exception. */
  excepted: boolean;
};

/** What the checklist needs to know about an instruction. */
export type ChecklistSnapshot = {
  hasLeadStaff: boolean;
  hasMainContact: boolean;
  terms: {
    askingRentPence: number | null;
    feeKind: string | null;
    depositOffering: string | null;
    depositPence: number | null;
  } | null;
  agreement: AgreementEvidence;
  ownershipCheck: OwnershipCheckStatusCode | null;
  exceptions: readonly ExceptionKindCode[];
};

/**
 * The approved Ready to market checklist. The instruction date, property and
 * branch are always present, so they are not listed. Missing rent, fees,
 * landlords, staff, deposit information or a current signed agreement can
 * never be bypassed; only the ownership check can, by a manager's exception.
 */
export function buildChecklist(snapshot: ChecklistSnapshot): ChecklistItem[] {
  const terms = snapshot.terms;
  const standardOffered =
    terms?.depositOffering === "standard" || terms?.depositOffering === "both";
  const ownershipException = snapshot.exceptions.includes("ownership_check");
  const ownershipVerified = snapshot.ownershipCheck === "verified";
  return [
    {
      code: "lead_staff",
      label: "A lead staff member",
      met: snapshot.hasLeadStaff,
      excepted: false,
    },
    {
      code: "landlord",
      label: "A landlord and a main contact",
      met: snapshot.hasMainContact,
      excepted: false,
    },
    {
      code: "service",
      label: "The service",
      met: terms !== null,
      excepted: false,
    },
    {
      code: "asking_rent",
      label: "The agreed asking rent",
      met: terms?.askingRentPence != null,
      excepted: false,
    },
    {
      code: "fee",
      label: "The agency fee and how VAT applies",
      met: terms?.feeKind != null,
      excepted: false,
    },
    {
      code: "deposit",
      label: standardOffered
        ? "The deposit offered and the tenancy deposit amount"
        : "The deposit offered",
      met:
        terms?.depositOffering != null &&
        (!standardOffered || terms.depositPence != null),
      excepted: false,
    },
    {
      code: "agreement",
      label: "A signed agreement covering the current fees and landlords",
      met: snapshot.agreement === "current",
      excepted: false,
    },
    {
      code: "ownership_check",
      label: "A verified ownership check",
      met: ownershipVerified || ownershipException,
      excepted: !ownershipVerified && ownershipException,
    },
  ];
}

export const isChecklistComplete = (items: readonly ChecklistItem[]) =>
  items.every((item) => item.met);

/**
 * Agreement progress moves forward one recorded step at a time. Repeating or
 * moving back is a correction and needs a reason.
 */
export function agreementNeedsReason(
  current: AgreementStatusCode | null,
  next: AgreementStatusCode,
) {
  if (current === null) return false;
  return (
    AGREEMENT_STATUSES.indexOf(next) <= AGREEMENT_STATUSES.indexOf(current)
  );
}

/** Any entry after a recorded result is a correction and needs a reason. */
export function ownershipCheckNeedsReason(
  current: OwnershipCheckStatusCode | null,
  next: OwnershipCheckStatusCode,
) {
  return (
    next === "not_verified" ||
    current === "verified" ||
    current === "not_verified"
  );
}

/**
 * The date an instruction ended: today by default, or a valid earlier date no
 * earlier than the instruction date.
 */
export function validateEndedOn(
  value: string | null | undefined,
  instructedOn: string,
  now: Date = new Date(),
) {
  const today = ukToday(now);
  const given = text(value) || today;
  const parsed = parseDateOnly(given);
  if (!parsed) return { ok: false, error: "Enter a valid date." } as const;
  if (given > today) {
    return { ok: false, error: "The date cannot be in the future." } as const;
  }
  if (given < instructedOn) {
    return {
      ok: false,
      error: "The date cannot be before the instruction date.",
    } as const;
  }
  return { ok: true, date: parsed } as const;
}

/** A past-or-today date, such as a signing or check date. */
export function validatePastDate(
  value: string | null | undefined,
  now: Date = new Date(),
) {
  const given = text(value);
  const parsed = parseDateOnly(given);
  if (!parsed) return { ok: false, error: "Enter a valid date." } as const;
  if (given > ukToday(now)) {
    return { ok: false, error: "The date cannot be in the future." } as const;
  }
  return { ok: true, date: parsed } as const;
}
