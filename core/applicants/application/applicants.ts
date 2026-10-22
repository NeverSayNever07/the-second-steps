import "server-only";

import type { Prisma } from "@/core/db/generated/client";
import {
  ApplicantStatus,
  LettingsOutcomeKind,
  type FurnishedStatus,
  type PropertyType,
  type RentPeriod,
} from "@/core/db/generated/enums";
import type { RentPeriodCode } from "@/core/instructions/domain/instruction";
import type {
  FurnishedStatusCode,
  PropertyTypeCode,
} from "@/core/properties/domain/property";
import type { AccessTransaction } from "@/core/access/data/database-context";
import { hasPermission } from "@/core/access/domain/role";
import { hasBranchAccess } from "@/core/access/domain/scope";
import type { ContactActor } from "@/core/contacts/application/contact-actor";
import { createContactInTransaction } from "@/core/contacts/application/contacts";
import {
  unreviewedContactDuplicates,
  type ContactChoice,
} from "@/core/enquiries/application/appraisals";
import { canAssignEnquiryWork } from "@/core/enquiries/application/enquiry-shared";
import { shareContactWithBranch } from "@/core/properties/application/property-shared";
import { contactDisplayName } from "@/core/properties/application/properties";
import { isUuid } from "@/core/properties/domain/ids";
import {
  applicantMoveNeedsReason,
  canMoveApplicant,
  isApplicantReopen,
  isApplicantStatus,
  type ApplicantStatusCode,
} from "../domain/applicant";
import {
  STARTER_APPLICANT_REASONS,
  STARTER_ENQUIRY_REASONS,
  validateLettingsNote,
  type LettingsReasonKind,
} from "../domain/reasons";
import {
  validateRequirements,
  type Requirements,
  type RequirementsInput,
} from "../domain/requirements";
import {
  ApplicantRollback,
  applicantAudit,
  createApplicantReference,
  deny,
  lower,
  upper,
  withApplicantActor,
  type ApplicantActorInput,
  type ApplicantFailure,
} from "./applicant-shared";

// --- Reading helpers shared with the enquiry services ---

export const CONTACT_SUMMARY_SELECT = {
  id: true,
  kind: true,
  reference: true,
  firstName: true,
  lastName: true,
  legalName: true,
  contactPoints: {
    where: { archivedAt: null },
    select: { kind: true, value: true, isPreferred: true },
    orderBy: [{ isPreferred: "desc" }, { createdAt: "asc" }],
  },
} satisfies Prisma.ContactSelect;

type ContactRow = Prisma.ContactGetPayload<{
  select: typeof CONTACT_SUMMARY_SELECT;
}>;

/** Name, reference and the two contact details staff see for a household. */
export type ContactSummary = {
  id: string;
  name: string;
  reference: string;
  email: string | null;
  telephone: string | null;
};

export function summariseContact(contact: ContactRow): ContactSummary {
  const point = (kind: "EMAIL" | "TELEPHONE") =>
    contact.contactPoints.find((item) => item.kind === kind)?.value ?? null;
  return {
    id: contact.id,
    name: contactDisplayName(contact) || "Unnamed contact",
    reference: contact.reference,
    email: point("EMAIL"),
    telephone: point("TELEPHONE"),
  };
}

const isoDate = (value: Date | null) =>
  value ? value.toISOString().slice(0, 10) : null;

type RequirementRow = Prisma.ApplicantRequirementVersionGetPayload<object>;

export function requirementsFromRow(row: RequirementRow): Requirements {
  return {
    areas: row.areas,
    minRentPence: row.minRentPence,
    maxRentPence: row.maxRentPence,
    rentPeriod: lower<RentPeriodCode>(row.rentPeriod),
    minBedrooms: row.minBedrooms,
    maxBedrooms: row.maxBedrooms,
    propertyTypes: row.propertyTypes.map((type) =>
      lower<PropertyTypeCode>(type),
    ),
    furnished: row.furnished ? lower<FurnishedStatusCode>(row.furnished) : null,
    moveFrom: isoDate(row.moveFrom),
    moveBy: isoDate(row.moveBy),
    householdSize: row.householdSize,
    hasPets: row.hasPets,
    notes: row.notes,
  };
}

const sameRequirements = (a: Requirements, b: Requirements) =>
  JSON.stringify(a) === JSON.stringify(b);

// --- Reasons (starter list per agency) ---

async function ensureStarterReasons(
  transaction: AccessTransaction,
  actor: ContactActor,
) {
  const kinds: [LettingsOutcomeKind, readonly string[]][] = [
    [LettingsOutcomeKind.APPLICANT, STARTER_APPLICANT_REASONS],
    [LettingsOutcomeKind.PROPERTY_ENQUIRY, STARTER_ENQUIRY_REASONS],
  ];
  let inserted = false;
  for (const [appliesTo, names] of kinds) {
    const count = await transaction.lettingsOutcomeReason.count({
      where: { workspaceId: actor.workspaceId, appliesTo },
    });
    if (count > 0) continue;
    // Concurrent first uses both try; only the one that adds rows audits it.
    const added = await transaction.lettingsOutcomeReason.createMany({
      data: names.map((name, sortOrder) => ({
        workspaceId: actor.workspaceId,
        name,
        appliesTo,
        sortOrder,
      })),
      skipDuplicates: true,
    });
    inserted ||= added.count > 0;
  }
  if (inserted) {
    await applicantAudit(transaction, actor, {
      action: "applicant.settings.initialise",
      outcome: "SUCCEEDED",
      targetType: "lettings_reason",
    });
  }
}

export type LettingsReason = {
  id: string;
  name: string;
  appliesTo: LettingsReasonKind;
  status: "active" | "hidden";
  sortOrder: number;
};

/** The reasons offered when closing applicants and enquiries. */
export async function listLettingsReasons(
  input: ApplicantActorInput,
): Promise<LettingsReason[] | null> {
  const result = await withApplicantActor<{
    ok: true;
    reasons: LettingsReason[];
  }>(input, async (transaction, actor) => {
    if (!hasPermission(actor.roles, "applicant.read")) {
      return { ok: false, error: "access_denied" };
    }
    // Only staff who work with applicants add the starter entries, so
    // read-only roles never write.
    if (hasPermission(actor.roles, "applicant.manage")) {
      await ensureStarterReasons(transaction, actor);
    }
    const rows = await transaction.lettingsOutcomeReason.findMany({
      where: { workspaceId: actor.workspaceId },
      orderBy: [{ appliesTo: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
    return {
      ok: true,
      reasons: rows.map((row) => ({
        id: row.id,
        name: row.name,
        appliesTo: lower(row.appliesTo),
        status: lower(row.status),
        sortOrder: row.sortOrder,
      })),
    };
  });
  return result.ok ? result.reasons : null;
}

export async function activeReason(
  transaction: AccessTransaction,
  actor: ContactActor,
  reasonId: string | null | undefined,
  kind: "APPLICANT" | "PROPERTY_ENQUIRY",
) {
  if (!isUuid(reasonId)) return null;
  const reason = await transaction.lettingsOutcomeReason.findFirst({
    where: {
      id: reasonId,
      workspaceId: actor.workspaceId,
      appliesTo: LettingsOutcomeKind[kind],
      status: "ACTIVE",
    },
    select: { id: true },
  });
  return reason?.id ?? null;
}

export async function activeLeadSource(
  transaction: AccessTransaction,
  actor: ContactActor,
  sourceId: string | null | undefined,
) {
  if (!sourceId) return { ok: true as const, id: null };
  if (!isUuid(sourceId)) return { ok: false as const };
  const source = await transaction.leadSource.findFirst({
    where: { id: sourceId, workspaceId: actor.workspaceId, status: "ACTIVE" },
    select: { id: true },
  });
  return source ? { ok: true as const, id: source.id } : { ok: false as const };
}

// --- Contacts for a household ---

/**
 * The contact for a lead or a household member: an existing one, or a new one
 * after the duplicate review. Either way it is linked to the applicant's
 * branch, so people there can see it.
 */
export async function resolveHouseholdContact(
  transaction: AccessTransaction,
  actor: ContactActor,
  branchId: string,
  choice: ContactChoice,
  action: string,
): Promise<{ ok: true; contactId: string } | ApplicantFailure> {
  if (choice.kind === "existing") {
    if (!isUuid(choice.contactId)) {
      return deny(transaction, actor, action, {
        ok: false,
        error: "invalid_input",
      });
    }
    const contact = await transaction.contact.findFirst({
      where: {
        id: choice.contactId,
        workspaceId: actor.workspaceId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!contact) {
      return deny(transaction, actor, action, {
        ok: false,
        error: "contact_not_found",
      });
    }
    await shareContactWithBranch(transaction, actor, contact.id, branchId);
    return { ok: true, contactId: contact.id };
  }
  if (choice.kind !== "new") {
    return deny(transaction, actor, action, {
      ok: false,
      error: "invalid_input",
    });
  }
  const duplicates = await unreviewedContactDuplicates(
    transaction,
    actor,
    choice,
  );
  if (duplicates.length > 0) {
    return deny(transaction, actor, action, {
      ok: false,
      error: "duplicate_review_required",
    });
  }
  const created = await createContactInTransaction(transaction, actor, {
    ...choice.contact,
    branchId,
  });
  if (!created.ok) {
    return deny(transaction, actor, action, {
      ok: false,
      error:
        created.error === "access_denied" ? "access_denied" : "invalid_input",
    });
  }
  return { ok: true, contactId: created.contactId };
}

// --- Create ---

export type CreateApplicantInput = ApplicantActorInput & {
  branchId: string;
  /** The household's lead: an existing contact, or a new one after the duplicate review. */
  contact: ContactChoice;
  /** Other adults: name and contact details only. */
  members?: readonly ContactChoice[];
  requirements?: RequirementsInput | null;
  leadSourceId?: string | null;
  /** The staff owner; defaults to nobody. */
  leadMembershipId?: string | null;
};

export function createApplicant(input: CreateApplicantInput) {
  const action = "applicant.create";
  return withApplicantActor<{
    ok: true;
    applicantId: string;
    contactId: string;
  }>(input, async (transaction, actor) => {
    if (
      !hasPermission(actor.roles, "applicant.manage") ||
      !isUuid(input.branchId) ||
      !hasBranchAccess(actor.scope, input.branchId)
    ) {
      return deny(transaction, actor, action, {
        ok: false,
        error: "access_denied",
      });
    }
    const requirements = input.requirements
      ? validateRequirements(input.requirements)
      : null;
    if (requirements && !requirements.ok) {
      return deny(transaction, actor, action, {
        ok: false,
        error: "invalid_input",
        fieldErrors: requirements.errors,
      });
    }
    const branch = await transaction.branch.findFirst({
      where: {
        id: input.branchId,
        workspaceId: actor.workspaceId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!branch) {
      return deny(transaction, actor, action, {
        ok: false,
        error: "invalid_input",
      });
    }
    const source = await activeLeadSource(
      transaction,
      actor,
      input.leadSourceId,
    );
    if (!source.ok) {
      return deny(transaction, actor, action, {
        ok: false,
        error: "invalid_input",
      });
    }
    if (
      input.leadMembershipId &&
      (!isUuid(input.leadMembershipId) ||
        !(await canAssignEnquiryWork(
          transaction,
          actor,
          input.leadMembershipId,
          input.branchId,
          "applicant.manage",
        )))
    ) {
      return deny(transaction, actor, action, {
        ok: false,
        error: "invalid_input",
      });
    }

    const lead = await resolveHouseholdContact(
      transaction,
      actor,
      input.branchId,
      input.contact,
      action,
    );
    if (!lead.ok) return lead;

    const existing = await transaction.applicant.findFirst({
      where: {
        workspaceId: actor.workspaceId,
        leadContactId: lead.contactId,
        status: { not: ApplicantStatus.CLOSED },
      },
      select: { id: true },
    });
    if (existing) {
      return deny(transaction, actor, action, {
        ok: false,
        error: "applicant_exists",
      });
    }

    const applicant = await transaction.applicant.create({
      data: {
        workspaceId: actor.workspaceId,
        reference: createApplicantReference(),
        leadContactId: lead.contactId,
        responsibleBranchId: input.branchId,
        leadMembershipId: input.leadMembershipId ?? null,
        leadSourceId: source.id,
        createdByMembershipId: actor.membershipId,
      },
      select: { id: true },
    });

    const seen = new Set<string>([lead.contactId]);
    for (const choice of input.members ?? []) {
      const member = await resolveHouseholdContact(
        transaction,
        actor,
        input.branchId,
        choice,
        action,
      );
      if (!member.ok) throw new ApplicantRollback(member);
      if (seen.has(member.contactId)) continue;
      seen.add(member.contactId);
      await transaction.applicantMember.create({
        data: {
          workspaceId: actor.workspaceId,
          applicantId: applicant.id,
          contactId: member.contactId,
          addedByMembershipId: actor.membershipId,
        },
      });
    }

    if (requirements?.ok) {
      await writeRequirements(
        transaction,
        actor,
        applicant.id,
        requirements.value,
      );
    }

    await applicantAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: applicant.id,
      metadata: { members: seen.size - 1 },
    });
    return { ok: true, applicantId: applicant.id, contactId: lead.contactId };
  });
}

function writeRequirements(
  transaction: AccessTransaction,
  actor: ContactActor,
  applicantId: string,
  value: Requirements,
) {
  return transaction.applicantRequirementVersion.create({
    data: {
      workspaceId: actor.workspaceId,
      applicantId,
      areas: value.areas,
      minRentPence: value.minRentPence,
      maxRentPence: value.maxRentPence,
      rentPeriod: upper<RentPeriod>(value.rentPeriod),
      minBedrooms: value.minBedrooms,
      maxBedrooms: value.maxBedrooms,
      propertyTypes: value.propertyTypes.map((type) =>
        upper<PropertyType>(type),
      ),
      furnished: value.furnished
        ? upper<FurnishedStatus>(value.furnished)
        : null,
      moveFrom: value.moveFrom
        ? new Date(`${value.moveFrom}T00:00:00.000Z`)
        : null,
      moveBy: value.moveBy ? new Date(`${value.moveBy}T00:00:00.000Z`) : null,
      householdSize: value.householdSize,
      hasPets: value.hasPets,
      notes: value.notes,
      createdByMembershipId: actor.membershipId,
    },
    select: { versionNo: true },
  });
}

// --- Open an applicant for a change ---

export type OpenApplicant = {
  id: string;
  status: ApplicantStatusCode;
  branchId: string;
  leadContactId: string;
};

export async function loadApplicantForWrite(
  transaction: AccessTransaction,
  actor: ContactActor,
  action: string,
  applicantId: string,
  options: { allowClosed?: boolean } = {},
): Promise<{ ok: true; applicant: OpenApplicant } | ApplicantFailure> {
  if (!hasPermission(actor.roles, "applicant.manage")) {
    return deny(transaction, actor, action, {
      ok: false,
      error: "access_denied",
    });
  }
  const row = isUuid(applicantId)
    ? await transaction.applicant.findFirst({
        where: { id: applicantId, workspaceId: actor.workspaceId },
        select: {
          id: true,
          status: true,
          responsibleBranchId: true,
          leadContactId: true,
        },
      })
    : null;
  // Not visible, or in a branch the person does not work in: the same answer.
  if (!row || !hasBranchAccess(actor.scope, row.responsibleBranchId)) {
    return { ok: false, error: "applicant_not_found" };
  }
  const status = lower<ApplicantStatusCode>(row.status);
  if (status === "closed" && !options.allowClosed) {
    return deny(
      transaction,
      actor,
      action,
      { ok: false, error: "applicant_closed" },
      { id: row.id },
    );
  }
  return {
    ok: true,
    applicant: {
      id: row.id,
      status,
      branchId: row.responsibleBranchId,
      leadContactId: row.leadContactId,
    },
  };
}

// --- Requirements ---

export function saveRequirements(
  input: ApplicantActorInput & {
    applicantId: string;
    requirements: RequirementsInput;
  },
) {
  const action = "applicant.requirements.save";
  return withApplicantActor<{
    ok: true;
    versionNo: number;
    unchanged: boolean;
  }>(input, async (transaction, actor) => {
    const open = await loadApplicantForWrite(
      transaction,
      actor,
      action,
      input.applicantId,
    );
    if (!open.ok) return open;
    const valid = validateRequirements(input.requirements);
    if (!valid.ok) {
      return deny(
        transaction,
        actor,
        action,
        { ok: false, error: "invalid_input", fieldErrors: valid.errors },
        { id: open.applicant.id },
      );
    }
    const latest = await transaction.applicantRequirementVersion.findFirst({
      where: { workspaceId: actor.workspaceId, applicantId: open.applicant.id },
      orderBy: { versionNo: "desc" },
    });
    if (latest && sameRequirements(requirementsFromRow(latest), valid.value)) {
      return { ok: true, versionNo: latest.versionNo, unchanged: true };
    }
    const saved = await writeRequirements(
      transaction,
      actor,
      open.applicant.id,
      valid.value,
    );
    await applicantAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: open.applicant.id,
      metadata: { versionNo: saved.versionNo },
    });
    return { ok: true, versionNo: saved.versionNo, unchanged: false };
  });
}

// --- Household members ---

export function addApplicantMember(
  input: ApplicantActorInput & { applicantId: string; contact: ContactChoice },
) {
  const action = "applicant.member.add";
  return withApplicantActor<{ ok: true; memberId: string }>(
    input,
    async (transaction, actor) => {
      const open = await loadApplicantForWrite(
        transaction,
        actor,
        action,
        input.applicantId,
      );
      if (!open.ok) return open;
      const resolved = await resolveHouseholdContact(
        transaction,
        actor,
        open.applicant.branchId,
        input.contact,
        action,
      );
      if (!resolved.ok) return resolved;
      if (resolved.contactId === open.applicant.leadContactId) {
        return deny(
          transaction,
          actor,
          action,
          { ok: false, error: "invalid_input" },
          { id: open.applicant.id },
        );
      }
      const already = await transaction.applicantMember.findFirst({
        where: {
          workspaceId: actor.workspaceId,
          applicantId: open.applicant.id,
          contactId: resolved.contactId,
          endedAt: null,
        },
        select: { id: true },
      });
      if (already) {
        return deny(
          transaction,
          actor,
          action,
          { ok: false, error: "invalid_input" },
          { id: open.applicant.id },
        );
      }
      const member = await transaction.applicantMember.create({
        data: {
          workspaceId: actor.workspaceId,
          applicantId: open.applicant.id,
          contactId: resolved.contactId,
          addedByMembershipId: actor.membershipId,
        },
        select: { id: true },
      });
      await applicantAudit(transaction, actor, {
        action,
        outcome: "SUCCEEDED",
        targetId: open.applicant.id,
        metadata: { memberId: member.id },
      });
      return { ok: true, memberId: member.id };
    },
  );
}

export function removeApplicantMember(
  input: ApplicantActorInput & { applicantId: string; memberId: string },
) {
  const action = "applicant.member.remove";
  return withApplicantActor<{ ok: true }>(input, async (transaction, actor) => {
    const open = await loadApplicantForWrite(
      transaction,
      actor,
      action,
      input.applicantId,
    );
    if (!open.ok) return open;
    const member = isUuid(input.memberId)
      ? await transaction.applicantMember.findFirst({
          where: {
            id: input.memberId,
            workspaceId: actor.workspaceId,
            applicantId: open.applicant.id,
            endedAt: null,
          },
          select: { id: true },
        })
      : null;
    if (!member) return { ok: false, error: "member_not_found" };
    // The database sets the time and who ended it.
    await transaction.applicantMember.update({
      where: { id: member.id },
      data: { endedAt: new Date() },
    });
    await applicantAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: open.applicant.id,
      metadata: { memberId: member.id },
    });
    return { ok: true };
  });
}

// --- Status ---

export type ApplicantStatusChange = ApplicantActorInput & {
  applicantId: string;
  to: string;
  /** Needed to close; from the agency's applicant reasons. */
  reasonId?: string | null;
  note?: string | null;
};

/**
 * Puts an applicant on hold, resumes it, closes it (with a reason) or reopens
 * it (managers only). The history row is written first; the database checks
 * it matches the change.
 */
export function changeApplicantStatus(input: ApplicantStatusChange) {
  const action = "applicant.status.change";
  return withApplicantActor<{ ok: true }>(input, async (transaction, actor) => {
    const open = await loadApplicantForWrite(
      transaction,
      actor,
      action,
      input.applicantId,
      { allowClosed: true },
    );
    if (!open.ok) return open;
    const target = { id: open.applicant.id };
    const to = input.to;
    const note = validateLettingsNote(input.note);
    if (!isApplicantStatus(to) || !note.ok) {
      return deny(
        transaction,
        actor,
        action,
        { ok: false, error: "invalid_input" },
        target,
      );
    }
    const from = open.applicant.status;
    if (!canMoveApplicant(from, to)) {
      return deny(
        transaction,
        actor,
        action,
        { ok: false, error: "invalid_state" },
        target,
      );
    }
    if (
      isApplicantReopen(from, to) &&
      !hasPermission(actor.roles, "applicant.reopen")
    ) {
      return deny(
        transaction,
        actor,
        action,
        { ok: false, error: "access_denied" },
        target,
      );
    }
    let reasonId: string | null = null;
    if (applicantMoveNeedsReason(to)) {
      reasonId = await activeReason(
        transaction,
        actor,
        input.reasonId,
        "APPLICANT",
      );
      if (!reasonId) {
        return deny(
          transaction,
          actor,
          action,
          {
            ok: false,
            error: "invalid_input",
            fieldErrors: { reason: "Choose a reason." },
          },
          target,
        );
      }
    }
    if (isApplicantReopen(from, to)) {
      // A reopened applicant takes the lead contact's place again.
      const clash = await transaction.applicant.findFirst({
        where: {
          workspaceId: actor.workspaceId,
          leadContactId: open.applicant.leadContactId,
          status: { not: ApplicantStatus.CLOSED },
          id: { not: open.applicant.id },
        },
        select: { id: true },
      });
      if (clash) {
        return deny(
          transaction,
          actor,
          action,
          { ok: false, error: "applicant_exists" },
          target,
        );
      }
    }
    await transaction.applicantStatusHistory.create({
      data: {
        workspaceId: actor.workspaceId,
        applicantId: open.applicant.id,
        fromStatus: upper<ApplicantStatus>(from),
        toStatus: upper<ApplicantStatus>(to),
        note: note.note,
        actorMembershipId: actor.membershipId,
      },
    });
    await transaction.applicant.update({
      where: { id: open.applicant.id },
      data: {
        status: upper<ApplicantStatus>(to),
        closureReasonId: reasonId,
        closureNote: to === "closed" ? note.note : null,
      },
    });
    await applicantAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: open.applicant.id,
      metadata: { from, to },
    });
    return { ok: true };
  });
}

// --- Owner ---

export function assignApplicant(
  input: ApplicantActorInput & {
    applicantId: string;
    membershipId: string | null;
  },
) {
  const action = "applicant.assign";
  return withApplicantActor<{ ok: true }>(input, async (transaction, actor) => {
    const open = await loadApplicantForWrite(
      transaction,
      actor,
      action,
      input.applicantId,
    );
    if (!open.ok) return open;
    if (
      input.membershipId !== null &&
      (!isUuid(input.membershipId) ||
        !(await canAssignEnquiryWork(
          transaction,
          actor,
          input.membershipId,
          open.applicant.branchId,
          "applicant.manage",
        )))
    ) {
      return deny(
        transaction,
        actor,
        action,
        { ok: false, error: "invalid_input" },
        { id: open.applicant.id },
      );
    }
    await transaction.applicant.update({
      where: { id: open.applicant.id },
      data: { leadMembershipId: input.membershipId },
    });
    await applicantAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: open.applicant.id,
    });
    return { ok: true };
  });
}
