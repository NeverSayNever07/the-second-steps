import type {
  ApplicabilityCode,
  ComplianceAreaCode,
  EvidenceRelation,
  EvidenceStatusCode,
} from "./compliance";

export const COMPLIANCE_AREA_LABELS: Record<ComplianceAreaCode, string> = {
  epc_mees: "EPC and minimum energy efficiency",
  gas_safety: "Gas safety record (CP12)",
  electrical_safety: "Electrical safety (EICR)",
  smoke_co_alarms: "Smoke and carbon monoxide alarms",
  licensing: "Property licensing",
};

export const APPLICABILITY_LABELS: Record<
  ApplicabilityCode | "not_assessed",
  string
> = {
  not_assessed: "Not assessed",
  applies: "Applies",
  does_not_apply: "Does not apply",
  needs_specialist_review: "Needs specialist review",
};

export const EVIDENCE_STATUS_LABELS: Record<
  EvidenceStatusCode | "not_requested",
  string
> = {
  not_requested: "Not requested",
  awaiting_evidence: "Awaiting evidence",
  reviewed: "Reviewed",
  action_required: "Action required",
};

export const EVIDENCE_RELATION_LABELS: Record<EvidenceRelation, string> = {
  relied_on: "Relied on",
  superseded: "Superseded",
  other: "Not relied on",
};
