import type {
  ApplicabilityCode,
  EvidenceStatusCode,
} from "@/core/compliance/domain/compliance";

// The listing reads the property's own EPC and energy-efficiency evidence
// (the `epc_mees` compliance area) and snapshots where it stands when
// reviewed. It never owns a second copy of compliance records. The rules are
// the owner's fictional-build decisions, pending independent legal validation
// (ADR-034): Zayto records a position, it does not decide legal compliance.

export type EpcPosition =
  | "evidence_reviewed"
  | "commissioned_awaiting"
  | "does_not_apply"
  | "specialist_review"
  | "action_required"
  | "not_assessed"
  | "evidence_missing"
  | "expired";

export const EPC_POSITION_LABELS: Record<EpcPosition, string> = {
  evidence_reviewed: "EPC evidence reviewed",
  commissioned_awaiting: "EPC commissioned, awaiting the certificate",
  does_not_apply: "EPC does not apply (reason recorded)",
  specialist_review: "Needs specialist review",
  action_required: "Action required on the EPC evidence",
  not_assessed: "EPC not assessed",
  evidence_missing: "No EPC evidence recorded",
  expired: "EPC evidence has expired",
};

/** The relied-on evidence for the area, as the property compliance view gives it. */
export type EpcEvidence = {
  id: string;
  rating: string | null;
  eventOn: string;
  expiresOn: string | null;
  reference: string | null;
};

export type EpcInput = {
  applicability: ApplicabilityCode | "not_assessed";
  status: EvidenceStatusCode | "not_requested";
  reliedEvidence: EpcEvidence | null;
  isExpired: boolean;
  /** The reason recorded with Does not apply or Needs specialist review. */
  applicabilityReason: string | null;
};

/** What a listing records of the EPC position when it is reviewed. */
export type EpcSnapshot = {
  position: EpcPosition;
  rating: string | null;
  evidenceId: string | null;
  eventOn: string | null;
  expiresOn: string | null;
  reference: string | null;
  reason: string | null;
};

export function epcSnapshot(input: EpcInput): EpcSnapshot {
  const evidence = input.reliedEvidence;
  const base = {
    rating: evidence?.rating ?? null,
    evidenceId: evidence?.id ?? null,
    eventOn: evidence?.eventOn ?? null,
    expiresOn: evidence?.expiresOn ?? null,
    reference: evidence?.reference ?? null,
    reason: input.applicabilityReason,
  };
  if (input.applicability === "not_assessed") {
    return { ...base, position: "not_assessed" };
  }
  if (input.applicability === "needs_specialist_review") {
    return { ...base, position: "specialist_review" };
  }
  if (input.applicability === "does_not_apply") {
    return { ...base, position: "does_not_apply" };
  }
  // The area applies.
  if (input.status === "action_required") {
    return { ...base, position: "action_required" };
  }
  if (input.status === "reviewed" && evidence) {
    return {
      ...base,
      position: input.isExpired ? "expired" : "evidence_reviewed",
    };
  }
  if (input.status === "awaiting_evidence") {
    return { ...base, position: "commissioned_awaiting" };
  }
  return { ...base, position: "evidence_missing" };
}

export type EpcBlockReason =
  | "not_assessed"
  | "specialist_review"
  | "action_required"
  | "evidence_missing"
  | "expired"
  | "unrated"
  | "rated_f_or_g";

export const EPC_BLOCK_MESSAGES: Record<EpcBlockReason, string> = {
  not_assessed:
    "Record whether an EPC applies to this property, and its evidence, on the property's Compliance tab.",
  specialist_review:
    "The EPC needs specialist review. Resolve it on the property's Compliance tab.",
  action_required:
    "A review says action is needed on the EPC evidence. Resolve it on the property's Compliance tab.",
  evidence_missing:
    "Add the EPC evidence, or record that it has been commissioned, on the property's Compliance tab.",
  expired:
    "The EPC evidence has expired. Add newer evidence, or record that a new one has been commissioned.",
  unrated:
    "The EPC evidence has no energy rating recorded, so it cannot be advertised. Add the evidence again with its rating on the property's Compliance tab.",
  rated_f_or_g:
    "An EPC rated F or G cannot be advertised until a valid exemption is recorded (Does not apply, with the reason) or specialist review resolves it. No role can override this.",
};

export type EpcCheck = { ok: true } | { ok: false; reason: EpcBlockReason };

/**
 * Whether the EPC position lets a listing become Ready to advertise. Reviewed
 * unexpired evidence with a rating, a commissioned/awaiting state, or a Does
 * not apply with a recorded reason satisfy it. Evidence with no rating (owner
 * decision 2026-10-21) or a relied-on rating of F or G does not, unless Does
 * not apply with a reason has been recorded. Nothing overrides it.
 */
export function epcAdvertisingCheck(snapshot: EpcSnapshot): EpcCheck {
  switch (snapshot.position) {
    case "does_not_apply":
      // A reason is what makes this an assessment rather than a skipped step.
      return snapshot.reason?.trim()
        ? { ok: true }
        : { ok: false, reason: "not_assessed" };
    case "commissioned_awaiting":
      return { ok: true };
    case "evidence_reviewed": {
      const rating = snapshot.rating?.trim().toUpperCase();
      if (!rating) return { ok: false, reason: "unrated" };
      return rating === "F" || rating === "G"
        ? { ok: false, reason: "rated_f_or_g" }
        : { ok: true };
    }
    case "specialist_review":
      return { ok: false, reason: "specialist_review" };
    case "action_required":
      return { ok: false, reason: "action_required" };
    case "expired":
      return { ok: false, reason: "expired" };
    case "evidence_missing":
      return { ok: false, reason: "evidence_missing" };
    case "not_assessed":
      return { ok: false, reason: "not_assessed" };
  }
}

/**
 * Whether the property's EPC evidence has moved since a listing recorded it,
 * so a new confirmation needs a fresh look.
 */
export function epcDrifted(saved: EpcSnapshot, live: EpcSnapshot) {
  return (
    saved.position !== live.position ||
    saved.rating !== live.rating ||
    saved.evidenceId !== live.evidenceId ||
    saved.expiresOn !== live.expiresOn
  );
}
