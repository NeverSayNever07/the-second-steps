import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  withVerifiedIdentity,
  type AccessTransaction,
} from "@/core/access/data/database-context";
import type { Permission } from "@/core/access/domain/permission";
import { hasPermission } from "@/core/access/domain/role";
import { hasBranchAccess } from "@/core/access/domain/scope";
import {
  resolveContactActor,
  type ContactActor,
} from "@/core/contacts/application/contact-actor";
import {
  DocumentKind as DatabaseKind,
  DocumentMedia as DatabaseMedia,
  DocumentStatus,
} from "@/core/db/generated/enums";
import { MEDIA_RULES } from "@/core/listings/domain/listing-rules";
import { isUuid } from "@/core/properties/domain/ids";
import {
  checkDocumentFile,
  documentContentType,
  documentDisplayName,
  documentObjectKey,
  isDocumentMedia,
  type DocumentFileRefusal,
  type DocumentKind,
  type DocumentMedia,
} from "../domain/document-file";
import type { DocumentStore } from "./document-store";

// Upload and download of private documents (C1). The lifecycle, and why each
// step is ordered as it is, is in .cursor/plans/c0-design-private-documents.md:
// the row is always written before the file, and on failure the row is always
// changed before the file is deleted, so a stored row never loses its file.

export type DocumentActorInput = {
  authSubject: string;
  workspaceSlug: string;
};

/** The record a document belongs to. */
export type DocumentTarget =
  | { kind: "instruction_agreement"; instructionId: string }
  | { kind: "compliance_evidence"; propertyId: string }
  | { kind: "listing_photo" | "listing_floorplan"; listingId: string };

export type DocumentAccessError =
  | "access_denied"
  // Not found, or not visible to this member: the two are never told apart.
  | "record_not_found"
  // An ended instruction or archived property takes no new documents.
  | "record_closed"
  // A listing already holds the most photos or floorplans allowed.
  | "media_limit";

export type UploadDocumentError =
  DocumentAccessError | DocumentFileRefusal | "storage_unavailable";

export type DownloadDocumentError =
  | "access_denied"
  | "document_not_found"
  | "integrity_mismatch"
  | "storage_unavailable";

export type StoredDocument = {
  id: string;
  displayName: string;
  media: DocumentMedia;
  byteSize: number;
};

type Failure<E> = { ok: false; error: E };

/**
 * Runs the work in a later business transaction (C2 agreement draft, C3
 * evidence event) in the same transaction that marks the file stored. Throw
 * to roll both back.
 */
export type AttachDocument = (
  transaction: AccessTransaction,
  actor: ContactActor,
  documentId: string,
) => Promise<void>;

/** Uploads stuck as pending for longer than this are treated as abandoned. */
const ABANDONED_CLEANUP_LIMIT = 20;

const KIND: Record<DocumentKind, DatabaseKind> = {
  instruction_agreement: DatabaseKind.INSTRUCTION_AGREEMENT,
  compliance_evidence: DatabaseKind.COMPLIANCE_EVIDENCE,
  listing_photo: DatabaseKind.LISTING_PHOTO,
  listing_floorplan: DatabaseKind.LISTING_FLOORPLAN,
};

const MEDIA: Record<DocumentMedia, DatabaseMedia> = {
  pdf: DatabaseMedia.PDF,
  jpeg: DatabaseMedia.JPEG,
  png: DatabaseMedia.PNG,
};

const MEDIA_FROM_DATABASE: Record<DatabaseMedia, DocumentMedia> = {
  PDF: "pdf",
  JPEG: "jpeg",
  PNG: "png",
};

const MANAGE_PERMISSION: Record<DocumentKind, Permission> = {
  instruction_agreement: "instruction.manage",
  compliance_evidence: "property.compliance.manage",
  listing_photo: "listing.prepare",
  listing_floorplan: "listing.prepare",
};

const READ_PERMISSION: Record<DatabaseKind, Permission> = {
  INSTRUCTION_AGREEMENT: "instruction.read",
  COMPLIANCE_EVIDENCE: "property.read",
  LISTING_PHOTO: "listing.read",
  LISTING_FLOORPLAN: "listing.read",
};

async function withDocumentActor<T>(
  input: DocumentActorInput,
  operation: (
    transaction: AccessTransaction,
    actor: ContactActor,
  ) => Promise<T>,
): Promise<T | Failure<"access_denied">> {
  const result = await withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor)
        return { ok: false as const, error: "access_denied" as const };
      return operation(transaction, actor);
    },
  );
  return result ?? { ok: false, error: "access_denied" };
}

function documentAudit(
  transaction: AccessTransaction,
  actor: ContactActor,
  input: {
    action: string;
    outcome: "SUCCEEDED" | "DENIED" | "FAILED";
    targetId?: string;
    // Never the display name or any file content.
    metadata?: Record<string, string | number>;
  },
) {
  return transaction.auditEvent.create({
    data: {
      workspaceId: actor.workspaceId,
      actorUserIdentityId: actor.userIdentityId,
      actorMembershipId: actor.membershipId,
      action: input.action,
      outcome: input.outcome,
      targetType: "document",
      targetId: isUuid(input.targetId) ? input.targetId : undefined,
      requestId: randomUUID(),
      metadata: input.metadata,
    },
  });
}

/** Records a refusal or failure in its own transaction, so it is kept. */
async function recordOutcome(
  input: DocumentActorInput,
  audit: {
    action: string;
    outcome: "DENIED" | "FAILED";
    reason: string;
    targetId?: string;
  },
) {
  await withDocumentActor(input, async (transaction, actor) => {
    await documentAudit(transaction, actor, {
      action: audit.action,
      outcome: audit.outcome,
      targetId: audit.targetId,
      metadata: { reason: audit.reason },
    });
    return { ok: true as const };
  });
}

/** The target's branch if it is visible and open, read through RLS. */
async function openTargetBranch(
  transaction: AccessTransaction,
  actor: ContactActor,
  target: DocumentTarget,
): Promise<{ ok: true; branchId: string } | Failure<DocumentAccessError>> {
  if (target.kind === "instruction_agreement") {
    if (!isUuid(target.instructionId)) {
      return { ok: false, error: "record_not_found" };
    }
    const instruction = await transaction.instruction.findFirst({
      where: { id: target.instructionId, workspaceId: actor.workspaceId },
      select: { responsibleBranchId: true, endedOn: true },
    });
    if (!instruction) return { ok: false, error: "record_not_found" };
    if (instruction.endedOn) return { ok: false, error: "record_closed" };
    return { ok: true, branchId: instruction.responsibleBranchId };
  }

  if ("listingId" in target) {
    if (!isUuid(target.listingId)) {
      return { ok: false, error: "record_not_found" };
    }
    const listing = await transaction.listing.findFirst({
      where: { id: target.listingId, workspaceId: actor.workspaceId },
      select: {
        state: true,
        instruction: { select: { responsibleBranchId: true } },
      },
    });
    if (!listing) return { ok: false, error: "record_not_found" };
    // Withdrawn listings are final; Ready to advertise must go back to Draft.
    if (
      listing.state === "WITHDRAWN" ||
      listing.state === "READY_TO_ADVERTISE"
    ) {
      return { ok: false, error: "record_closed" };
    }
    // Refused here, before the body is read; the database keeps the caps too.
    const role = target.kind === "listing_photo" ? "PHOTO" : "FLOORPLAN";
    const held = await transaction.listingMedia.count({
      where: {
        workspaceId: actor.workspaceId,
        listingId: target.listingId,
        role,
        removedAt: null,
      },
    });
    const cap =
      role === "PHOTO" ? MEDIA_RULES.maxPhotos : MEDIA_RULES.maxFloorplans;
    if (held >= cap) return { ok: false, error: "media_limit" };
    return { ok: true, branchId: listing.instruction.responsibleBranchId };
  }

  if (!isUuid(target.propertyId)) {
    return { ok: false, error: "record_not_found" };
  }
  const property = await transaction.property.findFirst({
    where: { id: target.propertyId, workspaceId: actor.workspaceId },
    select: { responsibleBranchId: true, status: true },
  });
  if (!property) return { ok: false, error: "record_not_found" };
  if (property.status !== "ACTIVE")
    return { ok: false, error: "record_closed" };
  return { ok: true, branchId: property.responsibleBranchId };
}

async function checkUploadAccess(
  transaction: AccessTransaction,
  actor: ContactActor,
  target: DocumentTarget,
): Promise<{ ok: true } | Failure<DocumentAccessError>> {
  if (!hasPermission(actor.roles, MANAGE_PERMISSION[target.kind])) {
    return { ok: false, error: "access_denied" };
  }
  const branch = await openTargetBranch(transaction, actor, target);
  if (!branch.ok) return branch;
  if (!hasBranchAccess(actor.scope, branch.branchId)) {
    return { ok: false, error: "record_not_found" };
  }
  return { ok: true };
}

/**
 * Whether this member may upload to the target. The upload route calls it
 * before reading the request body, so an unauthorised request never sends
 * its file. The upload itself checks again.
 */
export async function authoriseDocumentUpload(
  input: DocumentActorInput,
  target: DocumentTarget,
): Promise<{ ok: true } | Failure<DocumentAccessError>> {
  return withDocumentActor(input, async (transaction, actor) => {
    const access = await checkUploadAccess(transaction, actor, target);
    if (!access.ok) {
      await documentAudit(transaction, actor, {
        action: "document.upload",
        outcome: "DENIED",
        metadata: { reason: access.error, kind: target.kind },
      });
    }
    return access;
  });
}

/**
 * Marks this workspace's uploads that have been pending for over an hour, on
 * records this member can work on, as abandoned, then deletes their files.
 * Rows first, files second: an upload that finishes in the meantime is
 * stored and skipped (SKIP LOCKED leaves one mid-commit alone).
 */
async function cleanUpAbandonedUploads(
  input: DocumentActorInput,
  store: DocumentStore,
) {
  const abandoned = await withDocumentActor(
    input,
    async (transaction, actor) => {
      const rows = await transaction.$queryRaw<{ id: string; media: string }[]>`
      UPDATE "documents"
      SET "status" = 'failed', "failure_code" = 'abandoned'
      WHERE "id" IN (
        SELECT "id" FROM "documents"
        WHERE "workspace_id" = ${actor.workspaceId}::uuid
          AND "status" = 'pending'
          AND "created_at" < transaction_timestamp() - interval '1 hour'
        ORDER BY "created_at"
        LIMIT ${ABANDONED_CLEANUP_LIMIT}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id", "media_type"::text AS "media"
    `;
      for (const row of rows) {
        await documentAudit(transaction, actor, {
          action: "document.abandoned",
          outcome: "SUCCEEDED",
          targetId: row.id,
        });
      }
      return {
        ok: true as const,
        keys: rows.flatMap((row) =>
          isDocumentMedia(row.media)
            ? [
                documentObjectKey({
                  workspaceId: actor.workspaceId,
                  id: row.id,
                  media: row.media,
                }),
              ]
            : [],
        ),
      };
    },
  );
  if (abandoned.ok) await store.remove(abandoned.keys);
}

/** The row's current status, read in a fresh transaction. */
async function currentStatus(input: DocumentActorInput, documentId: string) {
  const result = await withDocumentActor(input, async (transaction, actor) => {
    const row = await transaction.document.findFirst({
      where: { id: documentId, workspaceId: actor.workspaceId },
      select: { status: true },
    });
    return { ok: true as const, status: row?.status ?? null };
  });
  return result.ok ? result.status : null;
}

/** Marks the caller's own pending upload failed; true if it changed. */
async function markUploadFailed(
  input: DocumentActorInput,
  documentId: string,
  failureCode: "storage_failed" | "link_failed",
) {
  const result = await withDocumentActor(input, async (transaction, actor) => {
    const changed = await transaction.document.updateMany({
      where: {
        id: documentId,
        workspaceId: actor.workspaceId,
        status: DocumentStatus.PENDING,
      },
      data: { status: DocumentStatus.FAILED, failureCode },
    });
    await documentAudit(transaction, actor, {
      action: "document.upload",
      outcome: "FAILED",
      targetId: documentId,
      metadata: { reason: failureCode },
    });
    return { ok: true as const, changed: changed.count === 1 };
  });
  return result.ok && result.changed;
}

/** A database refusal of a new document row, as an access answer. */
function refusedRecord(error: unknown): Failure<DocumentAccessError> {
  const text = String((error as { message?: unknown } | null)?.message ?? "");
  const direct = (error as { code?: unknown } | null)?.code;
  // Prisma's own codes (P…) wrap the database's; look in the message then.
  const code =
    typeof direct === "string" && /^\d{5}$/.test(direct)
      ? direct
      : /\b(23514|42501)\b/.exec(text)?.[1];
  if (code === "23514") return { ok: false, error: "record_closed" };
  if (code === "42501") return { ok: false, error: "record_not_found" };
  throw error;
}

/**
 * Checks, records and stores one file for a record, then runs `attach` (if
 * given) in the transaction that marks the file stored.
 */
export async function uploadDocument(input: {
  actor: DocumentActorInput;
  target: DocumentTarget;
  originalName: string;
  bytes: Uint8Array;
  store: DocumentStore;
  attach?: AttachDocument;
}): Promise<
  { ok: true; document: StoredDocument } | Failure<UploadDocumentError>
> {
  const { actor: actorInput, target, bytes, store } = input;

  const file = checkDocumentFile(target.kind, bytes);
  if (!file.ok) {
    await recordOutcome(actorInput, {
      action: "document.upload",
      outcome: "DENIED",
      reason: file.reason,
    });
    return { ok: false, error: file.reason };
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const displayName = documentDisplayName(input.originalName, file.media);

  await cleanUpAbandonedUploads(actorInput, store);

  // Transaction 1: the pending row, committed before the file is stored.
  // The record can close between the access check and the insert (a listing
  // confirmed Ready to advertise, say); the database then refuses the row,
  // and that is answered like the check would have.
  const pending = await withDocumentActor(
    actorInput,
    async (
      transaction,
      actor,
    ): Promise<
      { ok: true; id: string; key: string } | Failure<DocumentAccessError>
    > => {
      const access = await checkUploadAccess(transaction, actor, target);
      if (!access.ok) {
        await documentAudit(transaction, actor, {
          action: "document.upload",
          outcome: "DENIED",
          metadata: { reason: access.error, kind: target.kind },
        });
        return access;
      }
      const row = await transaction.document.create({
        data: {
          workspaceId: actor.workspaceId,
          kind: KIND[target.kind],
          instructionId:
            target.kind === "instruction_agreement"
              ? target.instructionId
              : undefined,
          propertyId:
            target.kind === "compliance_evidence"
              ? target.propertyId
              : undefined,
          listingId:
            target.kind === "listing_photo" ||
            target.kind === "listing_floorplan"
              ? target.listingId
              : undefined,
          displayName,
          mediaType: MEDIA[file.media],
          byteSize: bytes.length,
          sha256,
          uploadedByMembershipId: actor.membershipId,
        },
        select: { id: true },
      });
      return {
        ok: true,
        id: row.id,
        key: documentObjectKey({
          workspaceId: actor.workspaceId,
          id: row.id,
          media: file.media,
        }),
      };
    },
  ).catch((error: unknown) => refusedRecord(error));
  if (!pending.ok) return pending;

  const isPut = await store.put(
    pending.key,
    bytes,
    documentContentType(file.media),
  );
  if (!isPut) {
    await markUploadFailed(actorInput, pending.id, "storage_failed");
    return { ok: false, error: "storage_unavailable" };
  }

  // Transaction 2: stored, together with the business record that uses it.
  let isStored = false;
  try {
    const stored = await withDocumentActor(
      actorInput,
      async (transaction, actor) => {
        const changed = await transaction.document.updateMany({
          where: {
            id: pending.id,
            workspaceId: actor.workspaceId,
            status: DocumentStatus.PENDING,
          },
          data: { status: DocumentStatus.STORED },
        });
        if (changed.count !== 1) {
          return { ok: false as const, error: "access_denied" as const };
        }
        if (input.attach) await input.attach(transaction, actor, pending.id);
        await documentAudit(transaction, actor, {
          action: "document.upload",
          outcome: "SUCCEEDED",
          targetId: pending.id,
          metadata: {
            kind: target.kind,
            media: file.media,
            bytes: bytes.length,
          },
        });
        return { ok: true as const };
      },
    );
    isStored = stored.ok;
  } catch {
    // The outcome is unknown (for example a lost reply): read it below.
  }

  if (!isStored) {
    const status = await currentStatus(actorInput, pending.id);
    if (status === DocumentStatus.STORED) {
      isStored = true;
    } else {
      // Row first, then the file. A row already failed by cleanup also
      // leaves this upload to delete its own file.
      const isFailed =
        status === DocumentStatus.FAILED ||
        (await markUploadFailed(actorInput, pending.id, "link_failed"));
      if (isFailed) await store.remove([pending.key]);
      return { ok: false, error: "storage_unavailable" };
    }
  }

  return {
    ok: true,
    document: {
      id: pending.id,
      displayName,
      media: file.media,
      byteSize: bytes.length,
    },
  };
}

/**
 * A stored document's verified bytes for download. Access comes from the
 * workspace in the URL and the database's own scope; the bytes are only
 * returned once their length and SHA-256 match the record.
 */
export async function downloadDocument(input: {
  actor: DocumentActorInput;
  documentId: string;
  store: DocumentStore;
}): Promise<
  | { ok: true; document: StoredDocument; bytes: Uint8Array }
  | Failure<DownloadDocumentError>
> {
  const { actor: actorInput, documentId, store } = input;

  const found = await withDocumentActor(
    actorInput,
    async (
      transaction,
      actor,
    ): Promise<
      | {
          ok: true;
          document: StoredDocument;
          sha256: string;
          key: string;
        }
      | Failure<"document_not_found">
    > => {
      const row = isUuid(documentId)
        ? await transaction.document.findFirst({
            where: {
              id: documentId,
              workspaceId: actor.workspaceId,
              status: DocumentStatus.STORED,
            },
            select: {
              id: true,
              kind: true,
              displayName: true,
              mediaType: true,
              byteSize: true,
              sha256: true,
            },
          })
        : null;
      const isAllowed =
        row && hasPermission(actor.roles, READ_PERMISSION[row.kind]);
      if (!row || !isAllowed) {
        await documentAudit(transaction, actor, {
          action: "document.download",
          outcome: "DENIED",
          targetId: documentId,
          metadata: { reason: "document_not_found" },
        });
        return { ok: false, error: "document_not_found" };
      }
      const media = MEDIA_FROM_DATABASE[row.mediaType];
      return {
        ok: true,
        document: {
          id: row.id,
          displayName: row.displayName,
          media,
          byteSize: row.byteSize,
        },
        sha256: row.sha256,
        key: documentObjectKey({
          workspaceId: actor.workspaceId,
          id: row.id,
          media,
        }),
      };
    },
  );
  if (!found.ok) return found;

  const bytes = await store.get(found.key);
  if (!bytes) {
    await recordOutcome(actorInput, {
      action: "document.download",
      outcome: "FAILED",
      reason: "storage_unavailable",
      targetId: documentId,
    });
    return { ok: false, error: "storage_unavailable" };
  }

  const isIntact =
    bytes.length === found.document.byteSize &&
    createHash("sha256").update(bytes).digest("hex") === found.sha256;
  if (!isIntact) {
    await recordOutcome(actorInput, {
      action: "document.integrity_mismatch",
      outcome: "FAILED",
      reason: "integrity_mismatch",
      targetId: documentId,
    });
    return { ok: false, error: "integrity_mismatch" };
  }

  const audited = await withDocumentActor(
    actorInput,
    async (transaction, actor) => {
      await documentAudit(transaction, actor, {
        action: "document.download",
        outcome: "SUCCEEDED",
        targetId: documentId,
      });
      return { ok: true as const };
    },
  );
  if (!audited.ok) return audited;

  return { ok: true, document: found.document, bytes };
}
