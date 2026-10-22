import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import {
  withVerifiedIdentity,
  type AccessTransaction,
} from "@/core/access/data/database-context";
import {
  resolveContactActor,
  type ContactActor,
} from "@/core/contacts/application/contact-actor";
import { isUuid } from "@/core/properties/domain/ids";

// Applicants and property enquiries (ADR-036, ADR-037). Every write is one
// audited transaction in the workspace context; the database enforces the
// rules (migration 20261023100000_applicants_and_property_enquiries) and the
// services check first so people get a clear answer. Audit entries carry ids
// only. Nothing here says a home is published or advertised.

export type ApplicantActorInput = {
  authSubject: string;
  workspaceSlug: string;
};

export type ApplicantError =
  | "access_denied"
  | "applicant_not_found"
  | "enquiry_not_found"
  | "listing_not_found"
  | "contact_not_found"
  | "member_not_found"
  | "list_item_not_found"
  | "invalid_input"
  // A new contact matches an existing one that was not reviewed.
  | "duplicate_review_required"
  // This contact already leads an open applicant.
  | "applicant_exists"
  // The applicant is closed.
  | "applicant_closed"
  // Only a Ready to advertise listing can take an enquiry or a viewing.
  | "listing_not_ready"
  // This applicant already has an open enquiry for the listing.
  | "already_enquired"
  // Recording needs work rights in both the applicant's and the listing's branch.
  | "branch_access_needed"
  // The database refused: for example the record moved on meanwhile.
  | "invalid_state";

export type ApplicantFailure = {
  ok: false;
  error: ApplicantError;
  fieldErrors?: Partial<Record<string, string>>;
};

export class ApplicantRollback extends Error {
  constructor(readonly failure: ApplicantFailure) {
    super(`Applicant change rolled back: ${failure.error}`);
  }
}

function databaseCode(error: unknown): string | null {
  const direct = (error as { code?: unknown } | null)?.code;
  const text = String((error as { message?: unknown } | null)?.message ?? "");
  if (typeof direct === "string" && /^\d{5}$/.test(direct)) return direct;
  return /\b(23505|23514|42501)\b/.exec(text)?.[1] ?? null;
}

export async function withApplicantActor<T extends { ok: true }>(
  input: ApplicantActorInput,
  operation: (
    transaction: AccessTransaction,
    actor: ContactActor,
  ) => Promise<T | ApplicantFailure>,
): Promise<T | ApplicantFailure> {
  try {
    const result = await withVerifiedIdentity(
      input.authSubject,
      async (transaction, identity): Promise<T | ApplicantFailure> => {
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
    if (error instanceof ApplicantRollback) return error.failure;
    const code = databaseCode(error);
    // Not visible or not allowed: never told apart from "not found".
    if (code === "42501") return { ok: false, error: "access_denied" };
    if (code === "23505" || code === "23514") {
      return { ok: false, error: "invalid_state" };
    }
    throw error;
  }
}

export function applicantAudit(
  transaction: AccessTransaction,
  actor: ContactActor,
  input: {
    action: string;
    outcome: "SUCCEEDED" | "DENIED";
    targetType?: "applicant" | "property_enquiry" | "lettings_reason";
    targetId?: string;
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
      targetType: input.targetType ?? "applicant",
      targetId: isUuid(input.targetId) ? input.targetId : undefined,
      requestId: randomUUID(),
      metadata: input.metadata,
    },
  });
}

export async function deny(
  transaction: AccessTransaction,
  actor: ContactActor,
  action: string,
  failure: ApplicantFailure,
  target?: { type?: "applicant" | "property_enquiry"; id?: string },
): Promise<ApplicantFailure> {
  await applicantAudit(transaction, actor, {
    action,
    outcome: "DENIED",
    targetType: target?.type,
    targetId: target?.id,
    metadata: { reason: failure.error },
  });
  return failure;
}

const REFERENCE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function createApplicantReference() {
  const suffix = Array.from(
    randomBytes(8),
    (byte) => REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length],
  ).join("");
  return `APP-${suffix}`;
}

export const lower = <T extends string>(value: string) =>
  value.toLowerCase() as T;
export const upper = <T extends string>(value: string) =>
  value.toUpperCase() as T;
