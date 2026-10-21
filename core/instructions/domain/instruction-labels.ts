import type {
  AgreementStatusCode,
  ChecklistItemCode,
  DepositOfferingCode,
  ExceptionKindCode,
  FeeFrequencyCode,
  FeeVatCode,
  JourneyStageCode,
  OwnershipCheckStatusCode,
  RentPeriodCode,
} from "./instruction";

export const JOURNEY_STAGE_LABELS: Record<JourneyStageCode, string> = {
  onboarding: "Onboarding",
  ready_to_market: "Ready to market",
  withdrawn: "Withdrawn",
};

export const RENT_PERIOD_LABELS: Record<RentPeriodCode, string> = {
  month: "per month",
  week: "per week",
};

export const FEE_FREQUENCY_LABELS: Record<FeeFrequencyCode, string> = {
  one_off: "one-off",
  weekly: "weekly",
  monthly: "monthly",
};

export const FEE_VAT_LABELS: Record<FeeVatCode, string> = {
  inclusive: "VAT included",
  exclusive: "VAT added",
  none: "No VAT",
};

export const DEPOSIT_OFFERING_LABELS: Record<DepositOfferingCode, string> = {
  standard: "Standard deposit",
  replacement: "Deposit replacement",
  both: "Standard deposit or replacement",
};

export const AGREEMENT_STATUS_LABELS: Record<AgreementStatusCode, string> = {
  prepared: "Prepared",
  sent: "Sent",
  signed: "Signed",
};

export const AGREEMENT_STATE_LABELS = {
  draft: "Draft (not yet completed)",
  completed: "Completed",
  superseded: "Superseded",
  discarded: "Discarded",
} as const;

export const OWNERSHIP_CHECK_STATUS_LABELS: Record<
  OwnershipCheckStatusCode,
  string
> = {
  in_progress: "In progress",
  verified: "Verified",
  not_verified: "Not verified",
};

export const EXCEPTION_KIND_LABELS: Record<ExceptionKindCode, string> = {
  agreement: "Signed agreement",
  ownership_check: "Ownership check",
};

export const CHECKLIST_ACTION_HINTS: Record<ChecklistItemCode, string> = {
  lead_staff: "Choose a lead staff member.",
  landlord: "Add a landlord and make one the main contact.",
  service: "Choose the service in the terms.",
  asking_rent: "Enter the agreed asking rent in the terms.",
  fee: "Enter the agency fee and how VAT applies in the terms.",
  deposit: "Choose the deposit offered in the terms.",
  agreement:
    "Upload the signed agreement PDF once every landlord has signed it.",
  ownership_check:
    "Record the ownership check as verified, or ask a manager for an exception.",
};

const pounds = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

/** £1,850.00 from whole pence. */
export function formatPence(pence: number) {
  return pounds.format(pence / 100);
}

/** "1850.00" for a form field, from whole pence. */
export function penceToField(pence: number | null | undefined) {
  return pence === null || pence === undefined ? "" : (pence / 100).toFixed(2);
}

/** "12" or "12.5" for a form field, from basis points. */
export function basisPointsToField(points: number | null | undefined) {
  if (points === null || points === undefined) return "";
  return String(Number((points / 100).toFixed(2)));
}

export function formatRent(terms: {
  askingRentPence: number | null;
  rentPeriod: RentPeriodCode | null;
}) {
  if (terms.askingRentPence === null || !terms.rentPeriod) {
    return "Not agreed yet";
  }
  return `${formatPence(terms.askingRentPence)} ${RENT_PERIOD_LABELS[terms.rentPeriod]}`;
}

export function formatFee(terms: {
  feeKind: "percentage" | "fixed" | null;
  feeValue: number | null;
  feeFrequency: FeeFrequencyCode | null;
  feeVat: FeeVatCode | null;
}) {
  if (!terms.feeKind || terms.feeValue === null || !terms.feeVat) {
    return "Not agreed yet";
  }
  const amount =
    terms.feeKind === "percentage"
      ? `${basisPointsToField(terms.feeValue)}% of the rent`
      : `${formatPence(terms.feeValue)}${terms.feeFrequency ? ` ${FEE_FREQUENCY_LABELS[terms.feeFrequency]}` : ""}`;
  return `${amount} (${FEE_VAT_LABELS[terms.feeVat].toLowerCase()})`;
}
