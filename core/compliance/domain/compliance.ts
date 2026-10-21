import { parseDateOnly, ukToday } from "@/core/enquiries/domain/enquiry";

// Manual property compliance (C3). Zayto records what staff enter from the
// evidence; it never calculates a legal deadline or an overall verdict. The
// design is in .cursor/plans/c3-design-property-compliance.md.

export const COMPLIANCE_AREAS = [
  "epc_mees",
  "gas_safety",
  "electrical_safety",
  "smoke_co_alarms",
  "licensing",
] as const;
export type ComplianceAreaCode = (typeof COMPLIANCE_AREAS)[number];

export const APPLICABILITIES = [
  "applies",
  "does_not_apply",
  "needs_specialist_review",
] as const;
export type ApplicabilityCode = (typeof APPLICABILITIES)[number];

export const EVIDENCE_STATUSES = [
  "awaiting_evidence",
  "reviewed",
  "action_required",
] as const;
export type EvidenceStatusCode = (typeof EVIDENCE_STATUSES)[number];

/** The header that carries a compliance upload's area and typed facts. */
export const EVIDENCE_HEADER = "x-zayto-evidence";

export const EPC_RATINGS = ["A", "B", "C", "D", "E", "F", "G"] as const;

export const COMPLIANCE_LIMITS = {
  reason: 1000,
  sourceNote: 500,
  reference: 120,
  provider: 160,
  notes: 1000,
  statusNote: 1000,
} as const;

export const isComplianceArea = (value: unknown): value is ComplianceAreaCode =>
  COMPLIANCE_AREAS.includes(value as ComplianceAreaCode);
export const isApplicability = (value: unknown): value is ApplicabilityCode =>
  APPLICABILITIES.includes(value as ApplicabilityCode);
export const isEvidenceStatus = (value: unknown): value is EvidenceStatusCode =>
  EVIDENCE_STATUSES.includes(value as EvidenceStatusCode);

/**
 * Whether evidence for the area must come with an uploaded file (owner
 * decision 2026-10-21). The database holds the rule per requirement version
 * and is the authority; this copy only lets us explain it before saving.
 */
export const isFileRequired = (area: ComplianceAreaCode) =>
  area !== "smoke_co_alarms";

function text(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function optionalText(
  value: string | null | undefined,
  max: number,
): { ok: true; value: string | null } | { ok: false } {
  const trimmed = text(value);
  if (!trimmed) return { ok: true, value: null };
  return trimmed.length > max ? { ok: false } : { ok: true, value: trimmed };
}

export type ApplicabilityInput = {
  applicability: string | null | undefined;
  reason?: string | null;
  sourceNote?: string | null;
};

export type ApplicabilityErrors = Partial<
  Record<"applicability" | "reason" | "sourceNote", string>
>;

/** Does not apply and Needs specialist review need a written reason. */
export function validateApplicability(input: ApplicabilityInput) {
  const errors: ApplicabilityErrors = {};
  const applicability = input.applicability;
  if (!isApplicability(applicability)) {
    return {
      ok: false,
      errors: { applicability: "Choose an option." },
    } as const;
  }
  const reason = optionalText(input.reason, COMPLIANCE_LIMITS.reason);
  const sourceNote = optionalText(
    input.sourceNote,
    COMPLIANCE_LIMITS.sourceNote,
  );
  if (!reason.ok) {
    errors.reason = `Use ${COMPLIANCE_LIMITS.reason} characters or fewer.`;
  } else if (applicability !== "applies" && !reason.value) {
    errors.reason = "Give a reason.";
  }
  if (!sourceNote.ok) {
    errors.sourceNote = `Use ${COMPLIANCE_LIMITS.sourceNote} characters or fewer.`;
  }
  if (Object.keys(errors).length > 0 || !reason.ok || !sourceNote.ok) {
    return { ok: false, errors } as const;
  }
  return {
    ok: true,
    value: {
      applicability,
      reason: reason.value,
      sourceNote: sourceNote.value,
    },
  } as const;
}

export type EvidenceFactsInput = {
  reference?: string | null;
  provider?: string | null;
  eventOn?: string | null;
  expiresOn?: string | null;
  epcRating?: string | null;
  notes?: string | null;
};

export type EvidenceFactsErrors = Partial<
  Record<keyof EvidenceFactsInput, string>
>;

/**
 * The facts staff type in from the evidence. Dates are as written on the
 * evidence: the event date cannot be in the future and the expiry cannot be
 * before it. Zayto never works out an expiry itself.
 */
export function validateEvidenceFacts(
  area: ComplianceAreaCode,
  input: EvidenceFactsInput,
  now: Date = new Date(),
) {
  const errors: EvidenceFactsErrors = {};
  const reference = optionalText(input.reference, COMPLIANCE_LIMITS.reference);
  const provider = optionalText(input.provider, COMPLIANCE_LIMITS.provider);
  const notes = optionalText(input.notes, COMPLIANCE_LIMITS.notes);
  if (!reference.ok) {
    errors.reference = `Use ${COMPLIANCE_LIMITS.reference} characters or fewer.`;
  }
  if (!provider.ok) {
    errors.provider = `Use ${COMPLIANCE_LIMITS.provider} characters or fewer.`;
  }
  if (!notes.ok) {
    errors.notes = `Use ${COMPLIANCE_LIMITS.notes} characters or fewer.`;
  }

  const eventText = text(input.eventOn);
  const eventOn = parseDateOnly(eventText);
  if (!eventOn) {
    errors.eventOn = "Enter a valid date.";
  } else if (eventText > ukToday(now)) {
    errors.eventOn = "The date cannot be in the future.";
  }

  const expiryText = text(input.expiresOn);
  const expiresOn = expiryText ? parseDateOnly(expiryText) : null;
  if (expiryText && !expiresOn) {
    errors.expiresOn = "Enter a valid date.";
  } else if (expiresOn && eventOn && expiryText < eventText) {
    errors.expiresOn = "The expiry cannot be before the date above.";
  }

  const rating = text(input.epcRating).toUpperCase();
  if (rating) {
    if (area !== "epc_mees") {
      errors.epcRating = "Only EPC evidence has an energy rating.";
    } else if (!EPC_RATINGS.includes(rating as (typeof EPC_RATINGS)[number])) {
      errors.epcRating = "Choose a rating from A to G.";
    }
  }

  if (
    Object.keys(errors).length > 0 ||
    !reference.ok ||
    !provider.ok ||
    !notes.ok ||
    !eventOn
  ) {
    return { ok: false, errors } as const;
  }
  return {
    ok: true,
    value: {
      reference: reference.value,
      provider: provider.value,
      eventOn,
      expiresOn,
      epcRating: rating || null,
      notes: notes.value,
    },
  } as const;
}

export type StatusInput = {
  status: string | null | undefined;
  evidenceId?: string | null;
  note?: string | null;
};

/**
 * Awaiting evidence relies on nothing. Reviewed and Action required name the
 * evidence relied on, and Action required says what is needed.
 */
export function validateStatus(input: StatusInput) {
  const errors: Partial<Record<"status" | "evidenceId" | "note", string>> = {};
  const status = input.status;
  if (!isEvidenceStatus(status)) {
    return { ok: false, errors: { status: "Choose an option." } } as const;
  }
  const note = optionalText(input.note, COMPLIANCE_LIMITS.statusNote);
  const evidenceId = text(input.evidenceId) || null;
  if (status === "awaiting_evidence" && evidenceId) {
    errors.evidenceId = "Awaiting evidence does not rely on any evidence.";
  }
  if (status !== "awaiting_evidence" && !evidenceId) {
    errors.evidenceId = "Choose the evidence this relies on.";
  }
  if (!note.ok) {
    errors.note = `Use ${COMPLIANCE_LIMITS.statusNote} characters or fewer.`;
  } else if (status === "action_required" && !note.value) {
    errors.note = "Say what action is needed.";
  }
  if (Object.keys(errors).length > 0 || !note.ok) {
    return { ok: false, errors } as const;
  }
  return { ok: true, value: { status, evidenceId, note: note.value } } as const;
}

// --- What an area looks like now, worked out from its history ---

export type AreaSnapshot = {
  /** Newest first, as the database orders them. */
  assessments: readonly { applicability: ApplicabilityCode }[];
  evidence: readonly {
    id: string;
    expiresOn: string | null;
    isFileRemoved: boolean;
  }[];
  statusEvents: readonly {
    status: EvidenceStatusCode;
    evidenceId: string | null;
  }[];
};

export type EvidenceRelation = "relied_on" | "superseded" | "other";

export type AreaState = {
  applicability: ApplicabilityCode | "not_assessed";
  /** Not requested until someone records a status. */
  status: EvidenceStatusCode | "not_requested";
  reliedEvidenceId: string | null;
  /** The relied-on evidence carries an expiry date that has passed. */
  isExpired: boolean;
  evidence: Record<string, EvidenceRelation>;
};

/**
 * Not assessed, Not requested, Expired and Superseded are never stored; they
 * follow from the history so they cannot drift. Expired only reports that an
 * entered date has passed: it changes nothing and decides nothing legal.
 */
export function deriveAreaState(
  snapshot: AreaSnapshot,
  now: Date = new Date(),
): AreaState {
  const latestStatus = snapshot.statusEvents[0] ?? null;
  const reliedEvidenceId = latestStatus?.evidenceId ?? null;
  const everRelied = new Set(
    snapshot.statusEvents.flatMap((event) =>
      event.evidenceId ? [event.evidenceId] : [],
    ),
  );
  const relied = snapshot.evidence.find((item) => item.id === reliedEvidenceId);

  const evidence: Record<string, EvidenceRelation> = {};
  for (const item of snapshot.evidence) {
    evidence[item.id] =
      item.id === reliedEvidenceId
        ? "relied_on"
        : everRelied.has(item.id)
          ? "superseded"
          : "other";
  }

  return {
    applicability: snapshot.assessments[0]?.applicability ?? "not_assessed",
    status: latestStatus?.status ?? "not_requested",
    reliedEvidenceId,
    isExpired: Boolean(relied?.expiresOn && relied.expiresOn < ukToday(now)),
    evidence,
  };
}
