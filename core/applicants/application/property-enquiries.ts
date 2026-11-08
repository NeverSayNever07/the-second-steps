import "server-only";

import type { Prisma } from "@/core/db/generated/client";
import { PropertyEnquiryStage } from "@/core/db/generated/enums";
import type { AccessTransaction } from "@/core/access/data/database-context";
import type { ContactActor } from "@/core/contacts/application/contact-actor";
import { hasPermission } from "@/core/access/domain/role";
import { hasBranchAccess } from "@/core/access/domain/scope";
import {
  canAssignEnquiryWork,
  staffName,
} from "@/core/enquiries/application/enquiry-shared";
import type { ListingStateCode } from "@/core/listings/domain/listing";
import { addressLine } from "@/core/properties/application/properties";
import { shareContactWithBranch } from "@/core/properties/application/property-shared";
import { isUuid } from "@/core/properties/domain/ids";
import {
  canMoveEnquiry,
  canRegisterEnquiry,
  canReopenEnquiry,
  enquiryListingNotice,
  enquiryMoveNeedsReason,
  isEnquiryStage,
  isOpenEnquiryStage,
  type PropertyEnquiryStageCode,
} from "../domain/applicant";
import { validateLettingsNote } from "../domain/reasons";
import {
  applicantAudit,
  deny,
  lower,
  upper,
  withApplicantActor,
  type ApplicantActorInput,
} from "./applicant-shared";
import {
  CONTACT_SUMMARY_SELECT,
  activeLeadSource,
  activeReason,
  loadApplicantForWrite,
  summariseContact,
} from "./applicants";

// --- What staff see of an enquiry ---

export const ENQUIRY_SUMMARY_SELECT = {
  id: true,
  applicantId: true,
  stage: true,
  stageChangedAt: true,
  closedByListing: true,
  closureNote: true,
  createdAt: true,
  propertyId: true,
  responsibleBranch: { select: { id: true, name: true } },
  closureReason: { select: { name: true } },
  leadSource: { select: { name: true } },
  assignedMembership: {
    select: {
      id: true,
      userIdentity: {
        select: { firstName: true, lastName: true, primaryEmail: true },
      },
    },
  },
  property: {
    select: {
      id: true,
      addressBuilding: true,
      addressStreet: true,
      townCity: true,
      postcode: true,
    },
  },
  listing: {
    select: {
      id: true,
      state: true,
      versions: {
        orderBy: { versionNo: "desc" },
        take: 1,
        select: { headline: true },
      },
    },
  },
  applicant: {
    select: {
      id: true,
      reference: true,
      status: true,
      leadContact: { select: CONTACT_SUMMARY_SELECT },
    },
  },
} satisfies Prisma.PropertyEnquirySelect;

type EnquiryRow = Prisma.PropertyEnquiryGetPayload<{
  select: typeof ENQUIRY_SUMMARY_SELECT;
}>;

export type EnquirySummary = {
  id: string;
  stage: PropertyEnquiryStageCode;
  stageChangedAt: Date;
  createdAt: Date;
  closure: { reason: string | null; note: string | null } | null;
  /** Closed because its home was withdrawn: the applicant is still to be told. */
  closedByListing: boolean;
  /** What staff should know about the home now, or null. */
  notice: string | null;
  assignee: { membershipId: string; name: string } | null;
  /** Where it came from (phone, website, a portal), when recorded. */
  source: string | null;
  branch: { id: string; name: string };
  property: { id: string; address: string; postcode: string };
  listing: { id: string; state: ListingStateCode; headline: string };
  applicant: { id: string; reference: string; name: string; closed: boolean };
};

export function summariseEnquiry(row: EnquiryRow): EnquirySummary {
  const stage = lower<PropertyEnquiryStageCode>(row.stage);
  const listingState = lower<ListingStateCode>(row.listing.state);
  return {
    id: row.id,
    stage,
    stageChangedAt: row.stageChangedAt,
    createdAt: row.createdAt,
    closure:
      stage === "closed"
        ? {
            reason: row.closureReason?.name ?? null,
            note: row.closureNote,
          }
        : null,
    closedByListing: row.closedByListing,
    notice: row.closedByListing
      ? "This home is no longer available. Tell the applicant."
      : isOpenEnquiryStage(stage)
        ? enquiryListingNotice(listingState)
        : null,
    source: row.leadSource?.name ?? null,
    assignee: row.assignedMembership
      ? {
          membershipId: row.assignedMembership.id,
          name: staffName(row.assignedMembership.userIdentity),
        }
      : null,
    branch: row.responsibleBranch,
    // The property can belong to a branch this person cannot see.
    property: row.property
      ? {
          id: row.property.id,
          address: addressLine(row.property),
          postcode: row.property.postcode,
        }
      : {
          id: row.propertyId,
          address: "A property in another branch",
          postcode: "",
        },
    listing: {
      id: row.listing.id,
      state: listingState,
      headline: row.listing.versions[0]?.headline ?? "",
    },
    applicant: {
      id: row.applicant.id,
      reference: row.applicant.reference,
      name: summariseContact(row.applicant.leadContact).name,
      closed: row.applicant.status === "CLOSED",
    },
  };
}

// --- Register ---

export type RegisterEnquiryInput = ApplicantActorInput & {
  applicantId: string;
  listingId: string;
  leadSourceId?: string | null;
  /** Who works the enquiry; defaults to the person recording it. */
  assignedMembershipId?: string | null;
};

/**
 * Records an applicant's interest in a listing. Only a Ready to advertise
 * listing can take one (ADR-037; the database refuses otherwise), and it
 * needs work rights in both the applicant's branch and the listing's. The
 * household's contacts are shared with the listing's branch.
 */
export function registerPropertyEnquiry(input: RegisterEnquiryInput) {
  const action = "property_enquiry.register";
  return withApplicantActor<{ ok: true; enquiryId: string }>(
    input,
    async (transaction, actor) => {
      const open = await loadApplicantForWrite(
        transaction,
        actor,
        action,
        input.applicantId,
      );
      if (!open.ok) return open;
      const listing = isUuid(input.listingId)
        ? await transaction.listing.findFirst({
            where: { id: input.listingId, workspaceId: actor.workspaceId },
            select: {
              id: true,
              state: true,
              propertyId: true,
              instruction: { select: { responsibleBranchId: true } },
            },
          })
        : null;
      if (!listing) {
        return deny(
          transaction,
          actor,
          action,
          { ok: false, error: "listing_not_found" },
          { id: open.applicant.id },
        );
      }
      const listingBranch = listing.instruction.responsibleBranchId;
      if (!hasBranchAccess(actor.scope, listingBranch)) {
        return deny(
          transaction,
          actor,
          action,
          { ok: false, error: "branch_access_needed" },
          { id: open.applicant.id },
        );
      }
      if (!canRegisterEnquiry(lower<ListingStateCode>(listing.state))) {
        return deny(
          transaction,
          actor,
          action,
          { ok: false, error: "listing_not_ready" },
          { id: open.applicant.id },
        );
      }
      const existing = await transaction.propertyEnquiry.findFirst({
        where: {
          workspaceId: actor.workspaceId,
          applicantId: open.applicant.id,
          listingId: listing.id,
          stage: { not: PropertyEnquiryStage.CLOSED },
        },
        select: { id: true },
      });
      if (existing) {
        return deny(
          transaction,
          actor,
          action,
          { ok: false, error: "already_enquired" },
          { id: open.applicant.id },
        );
      }
      const source = await activeLeadSource(
        transaction,
        actor,
        input.leadSourceId,
      );
      const assignee = input.assignedMembershipId ?? actor.membershipId;
      if (
        !source.ok ||
        !isUuid(assignee) ||
        !(await canAssignEnquiryWork(
          transaction,
          actor,
          assignee,
          listingBranch,
          "applicant.manage",
        ))
      ) {
        return deny(
          transaction,
          actor,
          action,
          { ok: false, error: "invalid_input" },
          { id: open.applicant.id },
        );
      }

      // The household's contacts need a link to the listing's branch for its
      // staff to see them.
      const members = await transaction.applicantMember.findMany({
        where: {
          workspaceId: actor.workspaceId,
          applicantId: open.applicant.id,
          endedAt: null,
        },
        select: { contactId: true },
      });
      for (const contactId of [
        open.applicant.leadContactId,
        ...members.map((member) => member.contactId),
      ]) {
        await shareContactWithBranch(
          transaction,
          actor,
          contactId,
          listingBranch,
        );
      }

      const enquiry = await transaction.propertyEnquiry.create({
        data: {
          workspaceId: actor.workspaceId,
          applicantId: open.applicant.id,
          listingId: listing.id,
          // The database sets these from the listing; they are sent so the
          // row is complete.
          propertyId: listing.propertyId,
          responsibleBranchId: listingBranch,
          assignedMembershipId: assignee,
          leadSourceId: source.id,
          createdByMembershipId: actor.membershipId,
        },
        select: { id: true },
      });
      await applicantAudit(transaction, actor, {
        action,
        outcome: "SUCCEEDED",
        targetType: "property_enquiry",
        targetId: enquiry.id,
        metadata: { applicantId: open.applicant.id, listingId: listing.id },
      });
      return { ok: true, enquiryId: enquiry.id };
    },
  );
}

// --- Move, close and reopen ---

type LoadedEnquiry = {
  id: string;
  stage: PropertyEnquiryStageCode;
  branchId: string;
  applicantId: string;
  listingId: string;
  applicantClosed: boolean;
  listingState: ListingStateCode;
};

async function loadEnquiryForWrite(
  transaction: AccessTransaction,
  actor: ContactActor,
  action: string,
  enquiryId: string,
): Promise<
  | { ok: true; enquiry: LoadedEnquiry }
  | { ok: false; error: "access_denied" | "enquiry_not_found" }
> {
  if (!hasPermission(actor.roles, "applicant.manage")) {
    await deny(transaction, actor, action, {
      ok: false,
      error: "access_denied",
    });
    return { ok: false, error: "access_denied" };
  }
  const row = isUuid(enquiryId)
    ? await transaction.propertyEnquiry.findFirst({
        where: { id: enquiryId, workspaceId: actor.workspaceId },
        select: {
          id: true,
          stage: true,
          responsibleBranchId: true,
          applicantId: true,
          listingId: true,
          applicant: { select: { status: true } },
          listing: { select: { state: true } },
        },
      })
    : null;
  if (!row || !hasBranchAccess(actor.scope, row.responsibleBranchId)) {
    return { ok: false, error: "enquiry_not_found" };
  }
  return {
    ok: true,
    enquiry: {
      id: row.id,
      stage: lower<PropertyEnquiryStageCode>(row.stage),
      branchId: row.responsibleBranchId,
      applicantId: row.applicantId,
      listingId: row.listingId,
      applicantClosed: row.applicant.status === "CLOSED",
      listingState: lower<ListingStateCode>(row.listing.state),
    },
  };
}

export type MoveEnquiryInput = ApplicantActorInput & {
  enquiryId: string;
  to: string;
  /** Needed to close; from the agency's enquiry reasons. */
  reasonId?: string | null;
  note?: string | null;
};

/**
 * Moves an enquiry one step forward or back, closes it with a reason, or
 * reopens it. The history row is written first; the database checks it
 * matches the move.
 */
export function moveEnquiry(input: MoveEnquiryInput) {
  const action = "property_enquiry.move";
  return withApplicantActor<{ ok: true }>(input, async (transaction, actor) => {
    const loaded = await loadEnquiryForWrite(
      transaction,
      actor,
      action,
      input.enquiryId,
    );
    if (!loaded.ok) return loaded;
    const { enquiry } = loaded;
    const target = { type: "property_enquiry" as const, id: enquiry.id };
    const note = validateLettingsNote(input.note);
    const to = input.to;
    if (!isEnquiryStage(to) || !note.ok) {
      return deny(
        transaction,
        actor,
        action,
        { ok: false, error: "invalid_input" },
        target,
      );
    }
    if (!canMoveEnquiry(enquiry.stage, to)) {
      return deny(
        transaction,
        actor,
        action,
        { ok: false, error: "invalid_state" },
        target,
      );
    }
    if (enquiry.stage === "closed") {
      // A reopen needs the same things a new enquiry does.
      if (
        !canReopenEnquiry(enquiry.listingState) ||
        !canRegisterEnquiry(enquiry.listingState)
      ) {
        return deny(
          transaction,
          actor,
          action,
          { ok: false, error: "listing_not_ready" },
          target,
        );
      }
      if (enquiry.applicantClosed) {
        return deny(
          transaction,
          actor,
          action,
          { ok: false, error: "applicant_closed" },
          target,
        );
      }
      const clash = await transaction.propertyEnquiry.findFirst({
        where: {
          workspaceId: actor.workspaceId,
          applicantId: enquiry.applicantId,
          listingId: enquiry.listingId,
          stage: { not: PropertyEnquiryStage.CLOSED },
        },
        select: { id: true },
      });
      if (clash) {
        return deny(
          transaction,
          actor,
          action,
          { ok: false, error: "already_enquired" },
          target,
        );
      }
    }
    let reasonId: string | null = null;
    if (enquiryMoveNeedsReason(to)) {
      reasonId = await activeReason(
        transaction,
        actor,
        input.reasonId,
        "PROPERTY_ENQUIRY",
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
    await transaction.propertyEnquiryStageHistory.create({
      data: {
        workspaceId: actor.workspaceId,
        propertyEnquiryId: enquiry.id,
        fromStage: upper<PropertyEnquiryStage>(enquiry.stage),
        toStage: upper<PropertyEnquiryStage>(to),
        note: note.note,
        actorMembershipId: actor.membershipId,
      },
    });
    await transaction.propertyEnquiry.update({
      where: { id: enquiry.id },
      data: {
        stage: upper<PropertyEnquiryStage>(to),
        closureReasonId: reasonId,
        closureNote: to === "closed" ? note.note : null,
      },
    });
    await applicantAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetType: "property_enquiry",
      targetId: enquiry.id,
      metadata: { from: enquiry.stage, to },
    });
    return { ok: true };
  });
}

export function assignEnquiry(
  input: ApplicantActorInput & {
    enquiryId: string;
    membershipId: string | null;
  },
) {
  const action = "property_enquiry.assign";
  return withApplicantActor<{ ok: true }>(input, async (transaction, actor) => {
    const loaded = await loadEnquiryForWrite(
      transaction,
      actor,
      action,
      input.enquiryId,
    );
    if (!loaded.ok) return loaded;
    const { enquiry } = loaded;
    if (enquiry.stage === "closed") {
      return deny(
        transaction,
        actor,
        action,
        { ok: false, error: "invalid_state" },
        { type: "property_enquiry", id: enquiry.id },
      );
    }
    if (
      input.membershipId !== null &&
      (!isUuid(input.membershipId) ||
        !(await canAssignEnquiryWork(
          transaction,
          actor,
          input.membershipId,
          enquiry.branchId,
          "applicant.manage",
        )))
    ) {
      return deny(
        transaction,
        actor,
        action,
        { ok: false, error: "invalid_input" },
        { type: "property_enquiry", id: enquiry.id },
      );
    }
    await transaction.propertyEnquiry.update({
      where: { id: enquiry.id },
      data: { assignedMembershipId: input.membershipId },
    });
    await applicantAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetType: "property_enquiry",
      targetId: enquiry.id,
    });
    return { ok: true };
  });
}

// --- Lists ---

export type EnquiryListInput = ApplicantActorInput & {
  /** "open" (the default), "all", or one stage. */
  stage?: "open" | "all" | PropertyEnquiryStageCode;
  branchId?: string;
  assignedMembershipId?: string;
  listingId?: string;
  applicantId?: string;
  take?: number;
  skip?: number;
};

const MAX_TAKE = 100;

export async function listPropertyEnquiries(
  input: EnquiryListInput,
): Promise<{ items: EnquirySummary[]; total: number } | null> {
  const stage = input.stage ?? "open";
  if (stage !== "open" && stage !== "all" && !isEnquiryStage(stage)) {
    return { items: [], total: 0 };
  }
  const result = await withApplicantActor<{
    ok: true;
    items: EnquirySummary[];
    total: number;
  }>(input, async (transaction, actor) => {
    if (!hasPermission(actor.roles, "applicant.read")) {
      return { ok: false, error: "access_denied" };
    }
    const where: Prisma.PropertyEnquiryWhereInput = {
      workspaceId: actor.workspaceId,
      ...(stage === "all"
        ? {}
        : stage === "open"
          ? { stage: { not: PropertyEnquiryStage.CLOSED } }
          : { stage: upper<PropertyEnquiryStage>(stage) }),
      ...(isUuid(input.branchId)
        ? { responsibleBranchId: input.branchId }
        : {}),
      ...(isUuid(input.assignedMembershipId)
        ? { assignedMembershipId: input.assignedMembershipId }
        : {}),
      ...(isUuid(input.listingId) ? { listingId: input.listingId } : {}),
      ...(isUuid(input.applicantId) ? { applicantId: input.applicantId } : {}),
    };
    const [rows, total] = await Promise.all([
      transaction.propertyEnquiry.findMany({
        where,
        select: ENQUIRY_SUMMARY_SELECT,
        orderBy: [{ stageChangedAt: "desc" }, { id: "asc" }],
        take: Math.min(Math.max(input.take ?? 50, 1), MAX_TAKE),
        skip: Math.max(input.skip ?? 0, 0),
      }),
      transaction.propertyEnquiry.count({ where }),
    ]);
    return { ok: true, items: rows.map(summariseEnquiry), total };
  });
  return result.ok ? { items: result.items, total: result.total } : null;
}
