import "server-only";

import { randomUUID } from "node:crypto";
import {
  withVerifiedIdentity,
  type AccessTransaction,
} from "@/core/access/data/database-context";
import { hasPermission } from "@/core/access/domain/role";
import { hasBranchAccess } from "@/core/access/domain/scope";
import {
  resolveContactActor,
  type ContactActor,
} from "@/core/contacts/application/contact-actor";
import type { AttachDocument } from "@/core/documents/application/documents";
import { isUuid } from "@/core/properties/domain/ids";
import {
  COMPLIANCE_AREAS,
  deriveAreaState,
  isComplianceArea,
  isFileRequired,
  validateApplicability,
  validateEvidenceFacts,
  validateStatus,
  type AreaState,
  type ApplicabilityCode,
  type ComplianceAreaCode,
  type EvidenceFactsInput,
  type EvidenceStatusCode,
} from "../domain/compliance";

// Manual property compliance (C3). Every write is its own audited step in
// the workspace-context transaction; the database sets who, when and which
// requirement version, and refuses anything the rules do not allow. Audit
// entries carry ids only, never notes, references or file names.

export type ComplianceActorInput = {
  authSubject: string;
  workspaceSlug: string;
};

export type ComplianceError =
  | "access_denied"
  | "property_not_found"
  | "invalid_input"
  // The area has no item yet, or the evidence is not part of this area.
  | "evidence_not_found"
  // This area needs an uploaded file before evidence can be recorded.
  | "file_required"
  // The area does not currently apply, so no status can be recorded.
  | "not_applicable"
  // The property is archived.
  | "property_closed"
  // The database refused: for example a race, or evidence whose file has
  // been removed.
  | "invalid_state";

export type ComplianceFailure = { ok: false; error: ComplianceError };

type Created = { ok: true; id: string };

const AUDIT_TARGET = "property" as const;

class ComplianceRollback extends Error {
  constructor(readonly error: ComplianceError) {
    super(`Compliance change rolled back: ${error}`);
  }
}

/** The code of a database refusal, however the driver wraps it. */
function databaseCode(error: unknown): string | null {
  const direct = (error as { code?: unknown } | null)?.code;
  const text = String((error as { message?: unknown } | null)?.message ?? "");
  if (typeof direct === "string" && /^\d{5}$/.test(direct)) return direct;
  return /\b(23505|23514|42501)\b/.exec(text)?.[1] ?? null;
}

function failureFromDatabase(error: unknown): ComplianceError | null {
  if (error instanceof ComplianceRollback) return error.error;
  const code = databaseCode(error);
  // 42501: the row is not visible or not writable by this member. Never
  // told apart from "not found".
  if (code === "42501") return "property_not_found";
  if (code === "23505" || code === "23514") return "invalid_state";
  return null;
}

async function withComplianceActor<T extends { ok: true }>(
  input: ComplianceActorInput,
  operation: (
    transaction: AccessTransaction,
    actor: ContactActor,
  ) => Promise<T | ComplianceFailure>,
): Promise<T | ComplianceFailure> {
  try {
    const result = await withVerifiedIdentity(
      input.authSubject,
      async (transaction, identity): Promise<T | ComplianceFailure> => {
        const actor = await resolveContactActor(transaction, {
          userIdentityId: identity.userIdentityId,
          workspaceSlug: input.workspaceSlug,
        });
        if (!actor) return { ok: false, error: "access_denied" };
        return operation(transaction, actor);
      },
    );
    return result ?? { ok: false, error: "access_denied" };
  } catch (error) {
    const known = failureFromDatabase(error);
    if (known) return { ok: false, error: known };
    throw error;
  }
}

function complianceAudit(
  transaction: AccessTransaction,
  actor: ContactActor,
  input: {
    action: string;
    outcome: "SUCCEEDED" | "DENIED";
    targetId?: string;
    metadata?: Record<string, string>;
  },
) {
  return transaction.auditEvent.create({
    data: {
      workspaceId: actor.workspaceId,
      actorUserIdentityId: actor.userIdentityId,
      actorMembershipId: actor.membershipId,
      action: input.action,
      outcome: input.outcome,
      targetType: AUDIT_TARGET,
      targetId: isUuid(input.targetId) ? input.targetId : undefined,
      requestId: randomUUID(),
      metadata: input.metadata,
    },
  });
}

async function deny(
  transaction: AccessTransaction,
  actor: ContactActor,
  action: string,
  error: ComplianceError,
  propertyId?: string,
): Promise<ComplianceFailure> {
  await complianceAudit(transaction, actor, {
    action,
    outcome: "DENIED",
    targetId: propertyId,
    metadata: { reason: error },
  });
  return { ok: false, error };
}

/**
 * The property, if visible to this member, with whether it is still open.
 * Not found and not visible are never told apart.
 */
async function visibleProperty(
  transaction: AccessTransaction,
  actor: ContactActor,
  propertyId: string,
) {
  if (!isUuid(propertyId)) return null;
  const property = await transaction.property.findFirst({
    where: { id: propertyId, workspaceId: actor.workspaceId },
    select: { id: true, status: true, responsibleBranchId: true },
  });
  if (
    !property ||
    !hasBranchAccess(actor.scope, property.responsibleBranchId)
  ) {
    return null;
  }
  return property;
}

/**
 * Checks permission, the area and the property for a write. Returns the
 * property or the refusal (already audited).
 */
async function openPropertyForWrite(
  transaction: AccessTransaction,
  actor: ContactActor,
  action: string,
  propertyId: string,
  area: unknown,
): Promise<
  { ok: true; propertyId: string; area: ComplianceAreaCode } | ComplianceFailure
> {
  if (!hasPermission(actor.roles, "property.compliance.manage")) {
    return deny(transaction, actor, action, "access_denied", propertyId);
  }
  if (!isComplianceArea(area)) {
    return deny(transaction, actor, action, "invalid_input", propertyId);
  }
  const property = await visibleProperty(transaction, actor, propertyId);
  if (!property) {
    return deny(transaction, actor, action, "property_not_found", propertyId);
  }
  if (property.status !== "ACTIVE") {
    return deny(transaction, actor, action, "property_closed", propertyId);
  }
  return { ok: true, propertyId: property.id, area };
}

/**
 * The property's item for the area, created the first time anything is
 * recorded. The database picks the requirement version. Two people recording
 * the same area for the first time at once: the second insert does nothing
 * and both then read the one item.
 */
async function ensureItem(
  transaction: AccessTransaction,
  actor: ContactActor,
  propertyId: string,
  area: ComplianceAreaCode,
) {
  const existing = await transaction.propertyComplianceItem.findFirst({
    where: { workspaceId: actor.workspaceId, propertyId, area: toDbArea(area) },
    select: { id: true },
  });
  if (existing) return existing.id;

  await transaction.$executeRaw`
    INSERT INTO "property_compliance_items" ("workspace_id", "property_id",
      "area", "requirement_id", "created_by_membership_id")
    VALUES (${actor.workspaceId}::uuid, ${propertyId}::uuid,
      ${area}::compliance_area, gen_random_uuid(), ${actor.membershipId}::uuid)
    ON CONFLICT ("workspace_id", "property_id", "area") DO NOTHING
  `;
  const created = await transaction.propertyComplianceItem.findFirst({
    where: { workspaceId: actor.workspaceId, propertyId, area: toDbArea(area) },
    select: { id: true },
  });
  if (!created) throw new ComplianceRollback("invalid_state");
  return created.id;
}

function toDbArea(area: ComplianceAreaCode) {
  return area.toUpperCase() as Uppercase<ComplianceAreaCode>;
}

function toDbApplicability(value: ApplicabilityCode) {
  return value.toUpperCase() as Uppercase<ApplicabilityCode>;
}

function toDbStatus(value: EvidenceStatusCode) {
  return value.toUpperCase() as Uppercase<EvidenceStatusCode>;
}

/** Records whether an area applies to the property, with a reason where required. */
export function recordApplicability(
  input: ComplianceActorInput & {
    propertyId: string;
    area: string;
    applicability: string;
    reason?: string | null;
    sourceNote?: string | null;
  },
): Promise<Created | ComplianceFailure> {
  const action = "compliance.applicability_record";
  return withComplianceActor<Created>(input, async (transaction, actor) => {
    const open = await openPropertyForWrite(
      transaction,
      actor,
      action,
      input.propertyId,
      input.area,
    );
    if (!open.ok) return open;
    const valid = validateApplicability(input);
    if (!valid.ok) {
      return deny(transaction, actor, action, "invalid_input", open.propertyId);
    }
    const itemId = await ensureItem(
      transaction,
      actor,
      open.propertyId,
      open.area,
    );
    const row = await transaction.propertyComplianceAssessment.create({
      data: {
        workspaceId: actor.workspaceId,
        itemId,
        applicability: toDbApplicability(valid.value.applicability),
        reason: valid.value.reason,
        sourceNote: valid.value.sourceNote,
        recordedByMembershipId: actor.membershipId,
      },
      select: { id: true },
    });
    await complianceAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: open.propertyId,
      metadata: {
        area: open.area,
        applicability: valid.value.applicability,
        assessmentId: row.id,
      },
    });
    return { ok: true, id: row.id };
  });
}

async function addEvidenceRow(
  transaction: AccessTransaction,
  actor: ContactActor,
  action: string,
  propertyId: string,
  area: ComplianceAreaCode,
  facts: EvidenceFactsInput,
  documentId: string | null,
): Promise<Created | ComplianceFailure> {
  const valid = validateEvidenceFacts(area, facts);
  if (!valid.ok) {
    return deny(transaction, actor, action, "invalid_input", propertyId);
  }
  const itemId = await ensureItem(transaction, actor, propertyId, area);
  const row = await transaction.propertyComplianceEvidence.create({
    data: {
      workspaceId: actor.workspaceId,
      itemId,
      documentId,
      reference: valid.value.reference,
      provider: valid.value.provider,
      eventOn: valid.value.eventOn,
      expiresOn: valid.value.expiresOn,
      epcRating: valid.value.epcRating,
      notes: valid.value.notes,
      recordedByMembershipId: actor.membershipId,
    },
    select: { id: true },
  });
  await complianceAudit(transaction, actor, {
    action,
    outcome: "SUCCEEDED",
    targetId: propertyId,
    metadata: {
      area,
      evidenceId: row.id,
      ...(documentId ? { documentId } : {}),
    },
  });
  return { ok: true, id: row.id };
}

/**
 * Records evidence that has no file. Only areas that do not require a file
 * accept it (smoke and CO alarms); the others come through an upload.
 */
export function recordEvidenceWithoutFile(
  input: ComplianceActorInput & {
    propertyId: string;
    area: string;
    facts: EvidenceFactsInput;
  },
): Promise<Created | ComplianceFailure> {
  const action = "compliance.evidence_add";
  return withComplianceActor<Created>(input, async (transaction, actor) => {
    const open = await openPropertyForWrite(
      transaction,
      actor,
      action,
      input.propertyId,
      input.area,
    );
    if (!open.ok) return open;
    if (isFileRequired(open.area)) {
      return deny(transaction, actor, action, "file_required", open.propertyId);
    }
    return addEvidenceRow(
      transaction,
      actor,
      action,
      open.propertyId,
      open.area,
      input.facts,
      null,
    );
  });
}

/**
 * The upload route's hook for compliance evidence (C3): in the transaction
 * that marks the file stored, the facts become the area's next piece of
 * evidence. A refusal throws, which fails the upload and deletes its file.
 * The route validates the facts before reading the file, so an invalid set
 * here is a defect, not a user error.
 */
export function attachComplianceEvidence(input: {
  propertyId: string;
  area: string;
  facts: EvidenceFactsInput;
}): AttachDocument {
  return async (transaction, actor, documentId) => {
    const open = await openPropertyForWrite(
      transaction,
      actor,
      "compliance.evidence_add",
      input.propertyId,
      input.area,
    );
    if (!open.ok) throw new ComplianceRollback(open.error);
    const result = await addEvidenceRow(
      transaction,
      actor,
      "compliance.evidence_add",
      open.propertyId,
      open.area,
      input.facts,
      documentId,
    );
    if (!result.ok) throw new ComplianceRollback(result.error);
  };
}

/**
 * Records which evidence is relied on and its status. Only while the area
 * currently applies; the database also checks that the evidence belongs to
 * this area and that its file has not been removed.
 */
export function recordEvidenceStatus(
  input: ComplianceActorInput & {
    propertyId: string;
    area: string;
    status: string;
    evidenceId?: string | null;
    note?: string | null;
  },
): Promise<Created | ComplianceFailure> {
  const action = "compliance.status_record";
  return withComplianceActor<Created>(input, async (transaction, actor) => {
    const open = await openPropertyForWrite(
      transaction,
      actor,
      action,
      input.propertyId,
      input.area,
    );
    if (!open.ok) return open;
    const valid = validateStatus(input);
    if (
      !valid.ok ||
      (valid.value.evidenceId && !isUuid(valid.value.evidenceId))
    ) {
      return deny(transaction, actor, action, "invalid_input", open.propertyId);
    }
    const item = await transaction.propertyComplianceItem.findFirst({
      where: {
        workspaceId: actor.workspaceId,
        propertyId: open.propertyId,
        area: toDbArea(open.area),
      },
      select: {
        id: true,
        assessments: {
          orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
          take: 1,
          select: { applicability: true },
        },
        evidence: valid.value.evidenceId
          ? { where: { id: valid.value.evidenceId }, select: { id: true } }
          : false,
      },
    });
    if (item?.assessments[0]?.applicability !== "APPLIES") {
      return deny(
        transaction,
        actor,
        action,
        "not_applicable",
        open.propertyId,
      );
    }
    if (valid.value.evidenceId && !item.evidence?.length) {
      return deny(
        transaction,
        actor,
        action,
        "evidence_not_found",
        open.propertyId,
      );
    }
    const row = await transaction.propertyComplianceStatusEvent.create({
      data: {
        workspaceId: actor.workspaceId,
        itemId: item.id,
        status: toDbStatus(valid.value.status),
        evidenceId: valid.value.evidenceId,
        note: valid.value.note,
        recordedByMembershipId: actor.membershipId,
      },
      select: { id: true },
    });
    await complianceAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: open.propertyId,
      metadata: {
        area: open.area,
        status: valid.value.status,
        statusEventId: row.id,
        ...(valid.value.evidenceId
          ? { evidenceId: valid.value.evidenceId }
          : {}),
      },
    });
    return { ok: true, id: row.id };
  });
}

// --- Reading ---

export type ComplianceEvidenceView = {
  id: string;
  reference: string | null;
  provider: string | null;
  eventOn: string;
  expiresOn: string | null;
  epcRating: string | null;
  notes: string | null;
  recordedAt: Date;
  /** The stored file to download, or null if none or it was removed. */
  documentId: string | null;
  hasNoFile: boolean;
  isFileRemoved: boolean;
  relation: "relied_on" | "superseded" | "other";
};

export type ComplianceAreaView = AreaState & {
  area: ComplianceAreaCode;
  label: string;
  isFileRequired: boolean;
  /** The reason given for Does not apply or Needs specialist review. */
  applicabilityReason: string | null;
  statusNote: string | null;
  evidenceList: ComplianceEvidenceView[];
};

export type PropertyComplianceView = {
  propertyId: string;
  canManage: boolean;
  isOpen: boolean;
  areas: ComplianceAreaView[];
};

const isoDate = (value: Date) => value.toISOString().slice(0, 10);

/**
 * Every compliance area for a property the member can see, newest history
 * first. Areas nobody has recorded yet come back as Not assessed.
 */
export async function getPropertyCompliance(
  input: ComplianceActorInput & { propertyId: string },
): Promise<{ ok: true; view: PropertyComplianceView } | ComplianceFailure> {
  return withComplianceActor<{ ok: true; view: PropertyComplianceView }>(
    input,
    async (transaction, actor) => {
      if (!hasPermission(actor.roles, "property.read")) {
        return { ok: false, error: "access_denied" };
      }
      const property = await visibleProperty(
        transaction,
        actor,
        input.propertyId,
      );
      if (!property) return { ok: false, error: "property_not_found" };

      const [requirements, items] = await Promise.all([
        transaction.complianceRequirement.findMany({
          orderBy: [{ version: "desc" }],
        }),
        transaction.propertyComplianceItem.findMany({
          where: { workspaceId: actor.workspaceId, propertyId: property.id },
          select: {
            area: true,
            requirement: { select: { label: true, isFileRequired: true } },
            assessments: {
              orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
              select: { applicability: true, reason: true },
            },
            evidence: {
              orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
              select: {
                id: true,
                reference: true,
                provider: true,
                eventOn: true,
                expiresOn: true,
                epcRating: true,
                notes: true,
                recordedAt: true,
                document: { select: { id: true, status: true } },
              },
            },
            statusEvents: {
              orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
              select: { status: true, evidenceId: true, note: true },
            },
          },
        }),
      ]);

      const areas = COMPLIANCE_AREAS.map((area): ComplianceAreaView => {
        const item = items.find((row) => row.area === toDbArea(area));
        const requirement =
          item?.requirement ??
          requirements.find((row) => row.area === toDbArea(area));
        const evidence = (item?.evidence ?? []).map((row) => ({
          ...row,
          expiresOnText: row.expiresOn ? isoDate(row.expiresOn) : null,
          isFileRemoved: Boolean(
            row.document && row.document.status !== "STORED",
          ),
        }));
        const state = deriveAreaState({
          assessments: (item?.assessments ?? []).map((row) => ({
            applicability: row.applicability.toLowerCase() as ApplicabilityCode,
          })),
          evidence: evidence.map((row) => ({
            id: row.id,
            expiresOn: row.expiresOnText,
            isFileRemoved: row.isFileRemoved,
          })),
          statusEvents: (item?.statusEvents ?? []).map((row) => ({
            status: row.status.toLowerCase() as EvidenceStatusCode,
            evidenceId: row.evidenceId,
          })),
        });
        return {
          ...state,
          area,
          label: requirement?.label ?? area,
          isFileRequired: requirement?.isFileRequired ?? isFileRequired(area),
          applicabilityReason: item?.assessments[0]?.reason ?? null,
          statusNote: item?.statusEvents[0]?.note ?? null,
          evidenceList: evidence.map((row) => ({
            id: row.id,
            reference: row.reference,
            provider: row.provider,
            eventOn: isoDate(row.eventOn),
            expiresOn: row.expiresOnText,
            epcRating: row.epcRating,
            notes: row.notes,
            recordedAt: row.recordedAt,
            documentId:
              row.document && !row.isFileRemoved ? row.document.id : null,
            hasNoFile: !row.document,
            isFileRemoved: row.isFileRemoved,
            relation: state.evidence[row.id] ?? "other",
          })),
        };
      });

      return {
        ok: true,
        view: {
          propertyId: property.id,
          canManage: hasPermission(actor.roles, "property.compliance.manage"),
          isOpen: property.status === "ACTIVE",
          areas,
        },
      };
    },
  );
}
