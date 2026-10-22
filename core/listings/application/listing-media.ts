import "server-only";

import type { AccessTransaction } from "@/core/access/data/database-context";
import { hasPermission } from "@/core/access/domain/role";
import { hasBranchAccess } from "@/core/access/domain/scope";
import type { ContactActor } from "@/core/contacts/application/contact-actor";
import type { AttachDocument } from "@/core/documents/application/documents";
import type { DocumentStore } from "@/core/documents/application/document-store";
import { documentObjectKey } from "@/core/documents/domain/document-file";
import { isUuid } from "@/core/properties/domain/ids";
import { validateListingReason } from "../domain/listing-content";
import { LISTING_LIMITS } from "../domain/listing-rules";
import {
  deny,
  listingAudit,
  withListingActor,
  type ListingActorInput,
  type ListingFailure,
} from "./listings";

// A listing's photos and floorplans (M5). The files are private documents
// uploaded through the documents route; their order, caption and removal are
// kept here. The database refuses changes while a listing is Ready to
// advertise or withdrawn, and keeps the caps (30 photos, 3 floorplans).
// Nothing here makes a file public.

/**
 * The upload route's hook for a listing photo or floorplan: in the
 * transaction that marks the file stored, it joins the end of the listing's
 * media. The database works out photo or floorplan from the file's kind.
 */
export function attachListingMedia(listingId: string): AttachDocument {
  return async (transaction, actor, documentId) => {
    await transaction.$executeRaw`
      INSERT INTO "listing_media" ("workspace_id", "listing_id", "document_id",
        "role", "position", "added_by_membership_id")
      VALUES (${actor.workspaceId}::uuid, ${listingId}::uuid,
        ${documentId}::uuid, 'photo',
        (SELECT COALESCE(max("position"), 0) + 1 FROM "listing_media"
         WHERE "workspace_id" = ${actor.workspaceId}::uuid
           AND "listing_id" = ${listingId}::uuid
           AND "removed_at" IS NULL),
        ${actor.membershipId}::uuid)
    `;
  };
}

/** The listing's current photos and floorplans, in order. */
async function activeMedia(
  transaction: AccessTransaction,
  actor: ContactActor,
  listingId: string,
) {
  return transaction.listingMedia.findMany({
    where: { workspaceId: actor.workspaceId, listingId, removedAt: null },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: {
      id: true,
      role: true,
      position: true,
      document: { select: { id: true, mediaType: true } },
    },
  });
}

/** A listing a member may change the media of, with its media; or a refusal. */
async function openListing(
  transaction: AccessTransaction,
  actor: ContactActor,
  action: string,
  listingId: string,
): Promise<{ ok: true } | ListingFailure> {
  if (!hasPermission(actor.roles, "listing.prepare")) {
    return deny(
      transaction,
      actor,
      action,
      { ok: false, error: "access_denied" },
      listingId,
    );
  }
  if (!isUuid(listingId)) return { ok: false, error: "listing_not_found" };
  // Changes to one listing's media queue behind each other, so each works
  // from the current order and state.
  await transaction.$queryRaw`
    SELECT "id" FROM "listings"
    WHERE "id" = ${listingId}::uuid
      AND "workspace_id" = ${actor.workspaceId}::uuid
    FOR UPDATE
  `;
  const listing = await transaction.listing.findFirst({
    where: { id: listingId, workspaceId: actor.workspaceId },
    select: {
      state: true,
      instruction: { select: { responsibleBranchId: true } },
    },
  });
  if (
    !listing ||
    !hasBranchAccess(actor.scope, listing.instruction.responsibleBranchId)
  ) {
    return { ok: false, error: "listing_not_found" };
  }
  if (listing.state === "WITHDRAWN" || listing.state === "READY_TO_ADVERTISE") {
    return deny(
      transaction,
      actor,
      action,
      { ok: false, error: "invalid_state" },
      listingId,
    );
  }
  return { ok: true };
}

export type MediaMove = "up" | "down" | "first";

/**
 * Moves a photo or floorplan within its own kind. The first photo is the
 * listing's main image, so "first" makes a photo the main image. Positions
 * are rewritten 1..n in one transaction.
 */
export function moveListingMedia(
  input: ListingActorInput & {
    listingId: string;
    mediaId: string;
    move: MediaMove;
  },
): Promise<{ ok: true } | ListingFailure> {
  const action = "listing.media.move";
  return withListingActor(input, async (transaction, actor) => {
    const open = await openListing(transaction, actor, action, input.listingId);
    if (!open.ok) return open;
    const media = await activeMedia(transaction, actor, input.listingId);
    const target = media.find((item) => item.id === input.mediaId);
    if (!target || !["up", "down", "first"].includes(input.move)) {
      return { ok: false, error: "invalid_input" };
    }
    const sameKind = media.filter((item) => item.role === target.role);
    const index = sameKind.indexOf(target);
    const order = sameKind.filter((item) => item !== target);
    const to =
      input.move === "first"
        ? 0
        : input.move === "up"
          ? Math.max(index - 1, 0)
          : Math.min(index + 1, order.length);
    order.splice(to, 0, target);
    // The kind keeps the same position numbers, handed out in the new
    // order; the other kind is untouched. Distinct numbers 1..n if any were
    // ever duplicated.
    const slots = sameKind.map((item) => item.position).sort((x, y) => x - y);
    const distinct = new Set(slots).size === slots.length;
    for (const [i, item] of order.entries()) {
      const position = distinct ? slots[i] : i + 1;
      if (item.position !== position) {
        await transaction.listingMedia.update({
          where: { id: item.id },
          data: { position },
        });
      }
    }
    await listingAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: input.listingId,
      metadata: { mediaId: target.id, move: input.move },
    });
    return { ok: true };
  });
}

/** Sets a photo or floorplan's caption, shown as its alternative text. */
export function setListingMediaCaption(
  input: ListingActorInput & {
    listingId: string;
    mediaId: string;
    caption: string;
  },
): Promise<{ ok: true } | ListingFailure> {
  const action = "listing.media.caption";
  return withListingActor(input, async (transaction, actor) => {
    const open = await openListing(transaction, actor, action, input.listingId);
    if (!open.ok) return open;
    const caption = input.caption.trim();
    // Control characters (such as new lines) are refused, and the database
    // checks the same; so are invisible format marks such as direction
    // overrides, which could make a caption read misleadingly.
    if (
      caption.length > LISTING_LIMITS.caption ||
      /[\p{Cc}\p{Cf}]/u.test(caption)
    ) {
      return { ok: false, error: "invalid_input" };
    }
    const media = await activeMedia(transaction, actor, input.listingId);
    if (!media.some((item) => item.id === input.mediaId)) {
      return { ok: false, error: "invalid_input" };
    }
    await transaction.listingMedia.update({
      where: { id: input.mediaId },
      data: { caption },
    });
    await listingAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: input.listingId,
      metadata: { mediaId: input.mediaId },
    });
    return { ok: true };
  });
}

/**
 * Removes a photo or floorplan, with a reason: the media row first, then the
 * file's record, both in one transaction; the stored file is deleted after
 * they commit (the documents order: rows first, file second).
 */
export async function removeListingMedia(
  input: ListingActorInput & {
    listingId: string;
    mediaId: string;
    reason: string;
    store: DocumentStore;
  },
): Promise<{ ok: true } | ListingFailure> {
  const action = "listing.media.remove";
  const result = await withListingActor<{ ok: true; key: string }>(
    input,
    async (transaction, actor) => {
      const open = await openListing(
        transaction,
        actor,
        action,
        input.listingId,
      );
      if (!open.ok) return open;
      const reason = validateListingReason(input.reason);
      const media = await activeMedia(transaction, actor, input.listingId);
      const target = media.find((item) => item.id === input.mediaId);
      if (!reason.ok || !target) {
        return { ok: false, error: "invalid_input" };
      }
      await transaction.listingMedia.update({
        where: { id: target.id },
        data: { removedReason: reason.reason },
      });
      await transaction.document.updateMany({
        where: {
          id: target.document.id,
          workspaceId: actor.workspaceId,
          status: "STORED",
        },
        data: {
          status: "REMOVED",
          removalReason: reason.reason,
          removedByMembershipId: actor.membershipId,
        },
      });
      await listingAudit(transaction, actor, {
        action,
        outcome: "SUCCEEDED",
        targetId: input.listingId,
        metadata: { mediaId: target.id, documentId: target.document.id },
      });
      return {
        ok: true,
        key: documentObjectKey({
          workspaceId: actor.workspaceId,
          id: target.document.id,
          media: target.document.mediaType.toLowerCase() as
            "pdf" | "jpeg" | "png",
        }),
      };
    },
  );
  if (!result.ok) return result;
  // A failed delete leaves an orphan file behind a removed record: harmless,
  // and never served, because downloads need a stored record.
  await input.store.remove([result.key]);
  return { ok: true };
}
