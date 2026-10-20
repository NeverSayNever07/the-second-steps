import "server-only";

import { withVerifiedIdentity } from "@/core/access/data/database-context";
import { hasPermission } from "@/core/access/domain/role";
import { hasBranchAccess } from "@/core/access/domain/scope";
import {
  ContactNoteStatus,
  ContactNoteVisibility,
  ContactStatus,
} from "@/core/db/generated/enums";
import {
  chooseNoteBranch,
  validateNoteBody,
  validateNoteOccurredAt,
  validateNoteReason,
} from "@/core/contacts/domain/contact";
import { audit, deny, type ContactWriteResult } from "./contacts";
import { resolveContactActor, type ContactActor } from "./contact-actor";

type Transaction = Parameters<typeof resolveContactActor>[0];
type ActorInput = { authSubject: string; workspaceSlug: string };

export type NoteWriteResult =
  { ok: true; noteId: string } | { ok: false; error: NoteWriteError };
type NoteWriteError = Extract<ContactWriteResult, { ok: false }>["error"];

export type ContactNoteView = {
  id: string;
  body: string;
  occurredAt: Date;
  createdAt: Date;
  authorName: string;
  branchId: string;
  branchName: string;
  agencyWide: boolean;
  edited: boolean;
  voided: boolean;
  voidReason: string | null;
  voidedByName: string | null;
  voidedAt: Date | null;
  canManage: boolean;
};

async function refuse(
  transaction: Transaction,
  actor: ContactActor,
  action: string,
  error: NoteWriteError,
  targetId: string,
): Promise<NoteWriteResult> {
  await deny(transaction, actor, action, error, targetId);
  return { ok: false, error };
}

export async function actorName(transaction: Transaction, actor: ContactActor) {
  const identity = await transaction.userIdentity.findUnique({
    where: { id: actor.userIdentityId },
    select: { firstName: true, lastName: true },
  });
  const name = [identity?.firstName, identity?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  // Never the sign-in email: note authors are shown to every colleague.
  return (name || "Unnamed colleague").slice(0, 200);
}

async function withNoteActor(
  input: ActorInput,
  permission: "contact.note.create" | "contact.note.manage",
  action: string,
  targetId: string,
  operation: (
    transaction: Transaction,
    actor: ContactActor,
  ) => Promise<NoteWriteResult>,
): Promise<NoteWriteResult> {
  const result = await withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity): Promise<NoteWriteResult> => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor) return { ok: false, error: "access_denied" };
      if (!hasPermission(actor.roles, permission)) {
        return refuse(transaction, actor, action, "access_denied", targetId);
      }
      return operation(transaction, actor);
    },
  );
  return result ?? { ok: false, error: "access_denied" };
}

export async function addContactNote(
  input: ActorInput & {
    contactId: string;
    body: string;
    occurredAt?: Date | null;
    shareWithAllBranches: boolean;
  },
): Promise<NoteWriteResult> {
  const action = "contact.note.create";
  return withNoteActor(
    input,
    "contact.note.create",
    action,
    input.contactId,
    async (transaction, actor) => {
      const body = validateNoteBody(input.body);
      const occurredAt = validateNoteOccurredAt(input.occurredAt);
      if (!body.ok || !occurredAt.ok) {
        return refuse(
          transaction,
          actor,
          action,
          "invalid_input",
          input.contactId,
        );
      }
      const contact = await transaction.contact.findFirst({
        where: { id: input.contactId, workspaceId: actor.workspaceId },
        select: {
          id: true,
          status: true,
          branchLinks: {
            where: { endedAt: null },
            select: { branchId: true, isPrimary: true },
          },
        },
      });
      if (!contact) return { ok: false, error: "contact_not_found" };
      if (contact.status === ContactStatus.MERGED) {
        return refuse(transaction, actor, action, "invalid_state", contact.id);
      }
      const branchId = chooseNoteBranch({
        contactBranches: contact.branchLinks,
        canAccess: (id) => hasBranchAccess(actor.scope, id),
      });
      if (!branchId) {
        return refuse(transaction, actor, action, "access_denied", contact.id);
      }
      const note = await transaction.contactNote.create({
        data: {
          workspaceId: actor.workspaceId,
          contactId: contact.id,
          branchId,
          visibility: input.shareWithAllBranches
            ? ContactNoteVisibility.AGENCY
            : ContactNoteVisibility.BRANCH,
          body: body.body,
          occurredAt: occurredAt.occurredAt,
          createdByMembershipId: actor.membershipId,
          authorName: await actorName(transaction, actor),
        },
        select: { id: true },
      });
      await audit(transaction, actor, {
        action,
        outcome: "SUCCEEDED",
        targetId: contact.id,
        metadata: {
          noteId: note.id,
          branchId,
          visibility: input.shareWithAllBranches ? "agency" : "branch",
        },
      });
      return { ok: true, noteId: note.id };
    },
  );
}

async function findManageableNote(
  transaction: Transaction,
  actor: ContactActor,
  input: { contactId: string; noteId: string },
) {
  const note = await transaction.contactNote.findFirst({
    where: {
      id: input.noteId,
      contactId: input.contactId,
      workspaceId: actor.workspaceId,
    },
    select: {
      id: true,
      contactId: true,
      branchId: true,
      status: true,
      body: true,
      occurredAt: true,
      visibility: true,
      version: true,
    },
  });
  return note;
}

export async function editContactNote(
  input: ActorInput & {
    contactId: string;
    noteId: string;
    body: string;
    occurredAt: Date | null;
    shareWithAllBranches: boolean;
    reason: string;
  },
): Promise<NoteWriteResult> {
  const action = "contact.note.edit";
  return withNoteActor(
    input,
    "contact.note.manage",
    action,
    input.contactId,
    async (transaction, actor) => {
      const body = validateNoteBody(input.body);
      const occurredAt = validateNoteOccurredAt(input.occurredAt);
      const reason = validateNoteReason(input.reason);
      if (!body.ok || !occurredAt.ok || !reason.ok) {
        return refuse(
          transaction,
          actor,
          action,
          "invalid_input",
          input.contactId,
        );
      }
      const note = await findManageableNote(transaction, actor, input);
      if (!note) return { ok: false, error: "contact_not_found" };
      if (!hasBranchAccess(actor.scope, note.branchId)) {
        return refuse(
          transaction,
          actor,
          action,
          "access_denied",
          note.contactId,
        );
      }
      if (note.status !== ContactNoteStatus.ACTIVE) {
        return refuse(
          transaction,
          actor,
          action,
          "invalid_state",
          note.contactId,
        );
      }
      const visibility = input.shareWithAllBranches
        ? ContactNoteVisibility.AGENCY
        : ContactNoteVisibility.BRANCH;
      const changedFields = [
        ...(body.body !== note.body ? ["body"] : []),
        ...(occurredAt.occurredAt.getTime() !== note.occurredAt.getTime()
          ? ["occurred_at"]
          : []),
        ...(visibility !== note.visibility ? ["visibility"] : []),
      ];
      if (!changedFields.length) {
        return refuse(
          transaction,
          actor,
          action,
          "invalid_input",
          note.contactId,
        );
      }
      // Only apply the edit if nobody changed the note since it was read, so
      // the recorded "previous" wording is always the wording replaced.
      const updated = await transaction.contactNote.updateMany({
        where: {
          id: note.id,
          workspaceId: actor.workspaceId,
          status: ContactNoteStatus.ACTIVE,
          version: note.version,
        },
        data: {
          body: body.body,
          occurredAt: occurredAt.occurredAt,
          visibility,
          lastEditedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        return refuse(
          transaction,
          actor,
          action,
          "invalid_state",
          note.contactId,
        );
      }
      await transaction.contactNoteRevision.create({
        data: {
          workspaceId: actor.workspaceId,
          noteId: note.id,
          previousBody: note.body,
          previousOccurredAt: note.occurredAt,
          previousVisibility: note.visibility,
          editReason: reason.reason,
          editedByMembershipId: actor.membershipId,
        },
      });
      await audit(transaction, actor, {
        action,
        outcome: "SUCCEEDED",
        targetId: note.contactId,
        metadata: { noteId: note.id, branchId: note.branchId, changedFields },
      });
      return { ok: true, noteId: note.id };
    },
  );
}

export async function voidContactNote(
  input: ActorInput & { contactId: string; noteId: string; reason: string },
): Promise<NoteWriteResult> {
  const action = "contact.note.void";
  return withNoteActor(
    input,
    "contact.note.manage",
    action,
    input.contactId,
    async (transaction, actor) => {
      const reason = validateNoteReason(input.reason);
      if (!reason.ok) {
        return refuse(
          transaction,
          actor,
          action,
          "invalid_input",
          input.contactId,
        );
      }
      const note = await findManageableNote(transaction, actor, input);
      if (!note) return { ok: false, error: "contact_not_found" };
      if (!hasBranchAccess(actor.scope, note.branchId)) {
        return refuse(
          transaction,
          actor,
          action,
          "access_denied",
          note.contactId,
        );
      }
      if (note.status !== ContactNoteStatus.ACTIVE) {
        return refuse(
          transaction,
          actor,
          action,
          "invalid_state",
          note.contactId,
        );
      }
      const voided = await transaction.contactNote.updateMany({
        where: {
          id: note.id,
          workspaceId: actor.workspaceId,
          status: ContactNoteStatus.ACTIVE,
          version: note.version,
        },
        data: {
          status: ContactNoteStatus.VOIDED,
          voidedAt: new Date(),
          voidedByMembershipId: actor.membershipId,
          voidedByName: await actorName(transaction, actor),
          voidReason: reason.reason,
          version: { increment: 1 },
        },
      });
      if (voided.count !== 1) {
        return refuse(
          transaction,
          actor,
          action,
          "invalid_state",
          note.contactId,
        );
      }
      await audit(transaction, actor, {
        action,
        outcome: "SUCCEEDED",
        targetId: note.contactId,
        metadata: { noteId: note.id, branchId: note.branchId },
      });
      return { ok: true, noteId: note.id };
    },
  );
}

const NOTE_PAGE_SIZE = 50;

export async function listContactNotes(
  input: ActorInput & { contactId: string; includeVoided?: boolean },
): Promise<ContactNoteView[] | null> {
  return withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor || !hasPermission(actor.roles, "contact.read")) return null;
      const canManage = hasPermission(actor.roles, "contact.note.manage");
      const notes = await transaction.contactNote.findMany({
        where: {
          workspaceId: actor.workspaceId,
          contactId: input.contactId,
          ...(input.includeVoided && canManage
            ? {}
            : { status: ContactNoteStatus.ACTIVE }),
        },
        orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
        take: NOTE_PAGE_SIZE,
        include: { branch: { select: { name: true } } },
      });
      return notes.map((note) => ({
        id: note.id,
        body: note.body,
        occurredAt: note.occurredAt,
        createdAt: note.createdAt,
        authorName: note.authorName,
        branchId: note.branchId,
        branchName: note.branch.name,
        agencyWide: note.visibility === ContactNoteVisibility.AGENCY,
        edited: note.lastEditedAt !== null,
        voided: note.status === ContactNoteStatus.VOIDED,
        voidReason: note.voidReason,
        voidedByName: note.voidedByName,
        voidedAt: note.voidedAt,
        canManage:
          canManage &&
          note.status === ContactNoteStatus.ACTIVE &&
          hasBranchAccess(actor.scope, note.branchId),
      }));
    },
  );
}
