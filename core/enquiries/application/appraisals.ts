import "server-only";

import { hasPermission } from "@/core/access/domain/role";
import {
  createContactInTransaction,
  type NewContactInput,
} from "@/core/contacts/application/contacts";
import {
  normalizeEmail,
  normalizePostcode,
  normalizeTelephone,
} from "@/core/contacts/domain/contact";
import {
  AppraisalStatus,
  ContactPointKind,
  ContactStatus,
  EnquiryStage,
  EnquiryTaskStatus,
  FeeKind,
  LettingServiceType,
  VatTreatment,
} from "@/core/db/generated/enums";
import {
  createPropertyInTransaction,
  findDuplicateProperties,
} from "@/core/properties/application/properties";
import { recordOwnerInTransaction } from "@/core/properties/application/property-ownership";
import { PropertyRollback } from "@/core/properties/application/property-shared";
import {
  classifyAddressDuplicate,
  validatePropertyDetails,
  type PropertyDetailsInput,
} from "@/core/properties/domain/property";
import { isUuid } from "@/core/properties/domain/ids";
import {
  validateAppraisalOutcome,
  validateAppraisalBookingNotes,
  validateReason,
  type AppraisalOutcomeInput,
} from "../domain/enquiry";
import { changeEnquiryStageInTransaction } from "./enquiries";
import {
  canAssignEnquiryWork,
  EnquiryRollback,
  enquiryAudit,
  enquiryDeny,
  lockEnquiry,
  withEnquiryActor,
  type EnquiryActor,
  type EnquiryActorInput,
  type EnquiryTransaction,
  type EnquiryWriteError,
} from "./enquiry-shared";

export type BookingContactInput =
  | Omit<Extract<NewContactInput, { kind: "person" }>, "branchId">
  | Omit<Extract<NewContactInput, { kind: "organisation" }>, "branchId">;

export type ContactChoice =
  | { kind: "existing"; contactId: string }
  | {
      kind: "new";
      contact: BookingContactInput;
      reviewedDuplicateIds: readonly string[];
    };

export type PropertyChoice =
  | { kind: "existing"; propertyId: string }
  | {
      kind: "new";
      property: PropertyDetailsInput;
      reviewedDuplicateIds: readonly string[];
    };

async function translatePropertyRollback<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PropertyRollback) {
      throw new EnquiryRollback(
        error.error === "ownership_not_found" ||
          error.error === "has_open_enquiry" ||
          error.error === "has_current_instruction"
          ? "invalid_state"
          : error.error,
      );
    }
    throw error;
  }
}

const DAY_MS = 86_400_000;

/** Up to a year back (recorded late) and two years ahead. */
export function appraisalTimeIsReasonable(scheduledAt: Date) {
  const time = scheduledAt.getTime();
  const now = Date.now();
  return (
    !Number.isNaN(time) &&
    time >= now - 366 * DAY_MS &&
    time <= now + 731 * DAY_MS
  );
}

function contactName(input: BookingContactInput) {
  return input.kind === "person"
    ? `${input.details.firstName} ${input.details.lastName}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
    : input.details.legalName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

async function unreviewedContactDuplicates(
  transaction: EnquiryTransaction,
  actor: EnquiryActor,
  input: Extract<ContactChoice, { kind: "new" }>,
) {
  const email = input.contact.contactPoints
    .filter((point) => point.kind === "email")
    .map((point) => normalizeEmail(point.value))
    .find(Boolean);
  const telephone = input.contact.contactPoints
    .filter((point) => point.kind === "telephone")
    .map((point) => normalizeTelephone(point.value))
    .find(Boolean);
  const postcode = input.contact.addresses
    .map((address) => normalizePostcode(address.postcode))
    .find(Boolean);
  if (!email && !telephone && !postcode) return [];
  // Same candidates as the duplicate review shown to staff (findDuplicateContacts):
  // active and archived contacts only, the 20 most recently updated. Anything
  // wider could demand a review of a match staff were never shown.
  const candidates = await transaction.contact.findMany({
    where: {
      workspaceId: actor.workspaceId,
      status: { in: [ContactStatus.ACTIVE, ContactStatus.ARCHIVED] },
      OR: [
        ...(email
          ? [
              {
                contactPoints: {
                  some: {
                    kind: ContactPointKind.EMAIL,
                    normalizedValue: email,
                    archivedAt: null,
                  },
                },
              },
            ]
          : []),
        ...(telephone
          ? [
              {
                contactPoints: {
                  some: {
                    kind: ContactPointKind.TELEPHONE,
                    normalizedValue: telephone,
                    archivedAt: null,
                  },
                },
              },
            ]
          : []),
        ...(postcode
          ? [{ addresses: { some: { postcode, archivedAt: null } } }]
          : []),
      ],
    },
    include: {
      contactPoints: { where: { archivedAt: null } },
      addresses: { where: { archivedAt: null } },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: 20,
  });
  const name = contactName(input.contact);
  const reviewed = new Set(input.reviewedDuplicateIds);
  return candidates.filter((candidate) => {
    const exact = candidate.contactPoints.some(
      (point) =>
        (email && point.normalizedValue === email) ||
        (telephone && point.normalizedValue === telephone),
    );
    const candidateName = (
      candidate.kind === "PERSON"
        ? `${candidate.firstName ?? ""} ${candidate.lastName ?? ""}`
        : (candidate.legalName ?? "")
    )
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const sameNameAndPostcode = Boolean(
      name &&
      postcode &&
      name === candidateName &&
      candidate.addresses.some(
        (address) => normalizePostcode(address.postcode) === postcode,
      ),
    );
    return (exact || sameNameAndPostcode) && !reviewed.has(candidate.id);
  });
}

async function unreviewedPropertyDuplicates(
  transaction: EnquiryTransaction,
  actor: EnquiryActor,
  input: Extract<PropertyChoice, { kind: "new" }>,
) {
  const details = validatePropertyDetails(input.property);
  if (!details.ok) return null;
  const candidates = await transaction.property.findMany({
    where: { workspaceId: actor.workspaceId, postcode: details.data.postcode },
    select: { id: true, normalizedAddressKey: true },
    // Same candidates as the review shown to staff (findDuplicateProperties).
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: 50,
  });
  const reviewed = new Set(input.reviewedDuplicateIds);
  return candidates.filter(
    (candidate) =>
      classifyAddressDuplicate(
        details.data.normalizedAddressKey,
        candidate.normalizedAddressKey,
      ) !== "none" && !reviewed.has(candidate.id),
  );
}

export async function reviewAppraisalBookingDuplicates(
  input: EnquiryActorInput & {
    contact: BookingContactInput;
    property: PropertyDetailsInput;
  },
) {
  const contactEmail = input.contact.contactPoints.find(
    (point) => point.kind === "email",
  )?.value;
  const contactTelephone = input.contact.contactPoints.find(
    (point) => point.kind === "telephone",
  )?.value;
  const contactPostcode = input.contact.addresses[0]?.postcode;
  const [{ findDuplicateContacts }, propertyMatches] = await Promise.all([
    import("@/core/contacts/application/contacts"),
    findDuplicateProperties({
      ...input,
      building: input.property.addressBuilding,
      street: input.property.addressStreet,
      postcode: input.property.postcode,
    }),
  ]);
  const contactMatches = await findDuplicateContacts({
    ...input,
    name: contactName(input.contact),
    email: contactEmail,
    telephone: contactTelephone,
    postcode: contactPostcode,
  });
  return { contactMatches, propertyMatches };
}

type ResolveRecordsInput = {
  action: string;
  /** The lead the records are for, when it already exists (for the audit trail). */
  subjectId: string | undefined;
  branchId: string;
  /** Records the lead is already linked to (they must be the ones chosen). */
  linkedContactId: string | null;
  linkedPropertyId: string | null;
  contact: ContactChoice;
  property: PropertyChoice;
};

/**
 * Links or creates the landlord and the property inside the caller's
 * transaction, after the duplicate checks. A refused contact is reported
 * before anything is written; a failed property step rolls the whole
 * transaction back, so a new contact is never left behind.
 */
export async function resolveLandlordAndProperty(
  transaction: EnquiryTransaction,
  actor: EnquiryActor,
  input: ResolveRecordsInput,
): Promise<
  | { ok: true; contactId: string; propertyId: string }
  | { ok: false; error: EnquiryWriteError }
> {
  let contactId: string;
  if (input.contact.kind === "existing") {
    if (
      !isUuid(input.contact.contactId) ||
      (input.linkedContactId &&
        input.linkedContactId !== input.contact.contactId)
    ) {
      return enquiryDeny(
        transaction,
        actor,
        input.action,
        "invalid_input",
        input.subjectId,
      );
    }
    const contact = await transaction.contact.findFirst({
      where: {
        id: input.contact.contactId,
        workspaceId: actor.workspaceId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!contact)
      return enquiryDeny(
        transaction,
        actor,
        input.action,
        "contact_not_found",
        input.subjectId,
      );
    contactId = contact.id;
  } else {
    if (input.linkedContactId)
      return enquiryDeny(
        transaction,
        actor,
        input.action,
        "invalid_state",
        input.subjectId,
      );
    const duplicates = await unreviewedContactDuplicates(
      transaction,
      actor,
      input.contact,
    );
    if (duplicates.length)
      return enquiryDeny(
        transaction,
        actor,
        input.action,
        "duplicate_review_required",
        input.subjectId,
      );
    const created = await createContactInTransaction(transaction, actor, {
      ...input.contact.contact,
      branchId: input.branchId,
    });
    if (!created.ok) throw new EnquiryRollback(created.error);
    contactId = created.contactId;
  }

  let propertyId: string;
  if (input.property.kind === "existing") {
    if (
      !isUuid(input.property.propertyId) ||
      (input.linkedPropertyId &&
        input.linkedPropertyId !== input.property.propertyId)
    ) {
      throw new EnquiryRollback("invalid_input");
    }
    const property = await transaction.property.findFirst({
      where: {
        id: input.property.propertyId,
        workspaceId: actor.workspaceId,
        status: "ACTIVE",
      },
      select: { id: true, responsibleBranchId: true },
    });
    if (!property) throw new EnquiryRollback("property_not_found");
    propertyId = property.id;
    const ownership = await transaction.propertyOwnership.findFirst({
      where: {
        workspaceId: actor.workspaceId,
        propertyId,
        contactId,
        endedAt: null,
      },
      select: { id: true },
    });
    if (!ownership) {
      const lead = await transaction.propertyOwnership.findFirst({
        where: {
          workspaceId: actor.workspaceId,
          propertyId,
          isLead: true,
          endedAt: null,
        },
        select: { id: true },
      });
      await translatePropertyRollback(() =>
        recordOwnerInTransaction(
          transaction,
          actor,
          {
            id: propertyId,
            responsibleBranchId: property.responsibleBranchId,
          },
          { contactId, isLead: !lead, startedOn: "" },
          { demoteExistingLead: false },
        ),
      );
    }
  } else {
    if (input.linkedPropertyId) throw new EnquiryRollback("invalid_state");
    const duplicates = await unreviewedPropertyDuplicates(
      transaction,
      actor,
      input.property,
    );
    if (duplicates === null) throw new EnquiryRollback("invalid_input");
    if (duplicates.length)
      throw new EnquiryRollback("duplicate_review_required");
    const propertyInput = input.property.property;
    const created = await translatePropertyRollback(() =>
      createPropertyInTransaction(transaction, actor, {
        branchId: input.branchId,
        details: propertyInput,
        owners: [{ contactId, isLead: true, startedOn: "" }],
      }),
    );
    if (!created.ok) {
      throw new EnquiryRollback(
        created.error === "ownership_not_found" ||
          created.error === "has_open_enquiry" ||
          created.error === "has_current_instruction"
          ? "invalid_state"
          : created.error,
      );
    }
    propertyId = created.propertyId;
  }

  return { ok: true, contactId, propertyId };
}

/** Records a booked appraisal and moves the lead on, inside the caller's transaction. */
export async function createBookedAppraisal(
  transaction: EnquiryTransaction,
  actor: EnquiryActor,
  enquiry: { id: string; stage: EnquiryStage },
  input: {
    action: string;
    contactId: string;
    propertyId: string;
    scheduledAt: Date;
    assignedMembershipId: string;
    bookingNotes?: string | null;
  },
) {
  const { contactId, propertyId, action } = input;
  const appraisal = await transaction.appraisal.create({
    data: {
      workspaceId: actor.workspaceId,
      enquiryId: enquiry.id,
      scheduledAt: input.scheduledAt,
      assignedMembershipId: input.assignedMembershipId,
      bookingNotes: input.bookingNotes,
      createdByMembershipId: actor.membershipId,
    },
    select: { id: true },
  });
  await transaction.enquiry.update({
    where: { id: enquiry.id },
    data: { contactId, propertyId },
  });
  await changeEnquiryStageInTransaction(
    transaction,
    actor,
    enquiry,
    "appraisal_booked",
    null,
  );
  await enquiryAudit(transaction, actor, {
    action,
    outcome: "SUCCEEDED",
    targetId: enquiry.id,
    metadata: { appraisalId: appraisal.id, contactId, propertyId },
  });
  return { appraisalId: appraisal.id };
}

export function bookAppraisal(
  input: EnquiryActorInput & {
    enquiryId: string;
    scheduledAt: Date;
    assignedMembershipId: string;
    bookingNotes?: string | null;
    contact: ContactChoice;
    property: PropertyChoice;
  },
) {
  const action = "enquiry.appraisal.book";
  return withEnquiryActor(input, async (transaction, actor) => {
    if (!hasPermission(actor.roles, "enquiry.update")) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "access_denied",
        input.enquiryId,
      );
    }
    const bookingNotes = validateAppraisalBookingNotes(input.bookingNotes);
    if (
      !isUuid(input.enquiryId) ||
      !isUuid(input.assignedMembershipId) ||
      !["existing", "new"].includes(input.contact.kind) ||
      !["existing", "new"].includes(input.property.kind) ||
      !(input.scheduledAt instanceof Date) ||
      !appraisalTimeIsReasonable(input.scheduledAt) ||
      !bookingNotes.ok
    ) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "invalid_input",
        input.enquiryId,
      );
    }
    await lockEnquiry(transaction, actor, input.enquiryId);
    const enquiry = await transaction.enquiry.findFirst({
      where: { id: input.enquiryId, workspaceId: actor.workspaceId },
      select: {
        id: true,
        stage: true,
        responsibleBranchId: true,
        contactId: true,
        propertyId: true,
      },
    });
    if (!enquiry)
      return { ok: false as const, error: "enquiry_not_found" as const };
    if (enquiry.stage !== EnquiryStage.NEW_ENQUIRY) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "invalid_state",
        enquiry.id,
      );
    }
    if (
      !(await canAssignEnquiryWork(
        transaction,
        actor,
        input.assignedMembershipId,
        enquiry.responsibleBranchId,
      ))
    ) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "invalid_input",
        enquiry.id,
      );
    }

    const records = await resolveLandlordAndProperty(transaction, actor, {
      action,
      subjectId: enquiry.id,
      branchId: enquiry.responsibleBranchId,
      linkedContactId: enquiry.contactId,
      linkedPropertyId: enquiry.propertyId,
      contact: input.contact,
      property: input.property,
    });
    if (!records.ok) return records;
    const { contactId, propertyId } = records;

    const booked = await createBookedAppraisal(transaction, actor, enquiry, {
      action,
      contactId,
      propertyId,
      scheduledAt: input.scheduledAt,
      assignedMembershipId: input.assignedMembershipId,
      bookingNotes: bookingNotes.notes,
    });
    return {
      ok: true as const,
      enquiryId: enquiry.id,
      appraisalId: booked.appraisalId,
      contactId,
      propertyId,
    };
  });
}

/** Changes the practical details of an appraisal that is still scheduled. */
export function updateScheduledAppraisal(
  input: EnquiryActorInput & {
    enquiryId: string;
    appraisalId: string;
    scheduledAt: Date;
    assignedMembershipId: string;
    bookingNotes?: string | null;
  },
) {
  const action = "enquiry.appraisal.update";
  return withEnquiryActor(input, async (transaction, actor) => {
    if (!hasPermission(actor.roles, "enquiry.update")) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "access_denied",
        input.enquiryId,
      );
    }
    const bookingNotes = validateAppraisalBookingNotes(input.bookingNotes);
    if (
      !isUuid(input.enquiryId) ||
      !isUuid(input.appraisalId) ||
      !isUuid(input.assignedMembershipId) ||
      !(input.scheduledAt instanceof Date) ||
      !appraisalTimeIsReasonable(input.scheduledAt) ||
      !bookingNotes.ok
    ) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "invalid_input",
        input.enquiryId,
      );
    }

    await lockEnquiry(transaction, actor, input.enquiryId);
    const enquiry = await transaction.enquiry.findFirst({
      where: { id: input.enquiryId, workspaceId: actor.workspaceId },
      select: { id: true, stage: true, responsibleBranchId: true },
    });
    if (!enquiry) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "enquiry_not_found",
        input.enquiryId,
      );
    }
    const appraisal = await transaction.appraisal.findFirst({
      where: {
        id: input.appraisalId,
        enquiryId: enquiry.id,
        workspaceId: actor.workspaceId,
      },
      select: { id: true, status: true },
    });
    if (!appraisal) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "appraisal_not_found",
        enquiry.id,
      );
    }
    const canAssign = await canAssignEnquiryWork(
      transaction,
      actor,
      input.assignedMembershipId,
      enquiry.responsibleBranchId,
    );
    if (
      enquiry.stage !== EnquiryStage.APPRAISAL_BOOKED ||
      appraisal.status !== AppraisalStatus.SCHEDULED ||
      !canAssign
    ) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "invalid_state",
        enquiry.id,
      );
    }

    await transaction.appraisal.update({
      where: { id: appraisal.id },
      data: {
        scheduledAt: input.scheduledAt,
        assignedMembershipId: input.assignedMembershipId,
        bookingNotes: bookingNotes.notes,
      },
    });
    await enquiryAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: enquiry.id,
      metadata: { appraisalId: appraisal.id },
    });
    return {
      ok: true as const,
      enquiryId: enquiry.id,
      appraisalId: appraisal.id,
    };
  });
}

const SERVICE = {
  let_only: LettingServiceType.LET_ONLY,
  rent_collection: LettingServiceType.RENT_COLLECTION,
  fully_managed: LettingServiceType.FULLY_MANAGED,
} as const;
const FEE_KIND = {
  percentage: FeeKind.PERCENTAGE,
  fixed: FeeKind.FIXED,
} as const;
const VAT = {
  inclusive: VatTreatment.INCLUSIVE,
  exclusive: VatTreatment.EXCLUSIVE,
} as const;

export function completeAppraisal(
  input: EnquiryActorInput & {
    enquiryId: string;
    appraisalId: string;
    outcome: AppraisalOutcomeInput;
  },
) {
  const action = "enquiry.appraisal.complete";
  return withEnquiryActor(input, async (transaction, actor) => {
    if (!hasPermission(actor.roles, "enquiry.update")) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "access_denied",
        input.enquiryId,
      );
    }
    const outcome = validateAppraisalOutcome(input.outcome);
    if (!isUuid(input.enquiryId) || !isUuid(input.appraisalId) || !outcome.ok) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "invalid_input",
        input.enquiryId,
      );
    }
    await lockEnquiry(transaction, actor, input.enquiryId);
    const enquiry = await transaction.enquiry.findFirst({
      where: { id: input.enquiryId, workspaceId: actor.workspaceId },
      select: { id: true, stage: true, leadSourceId: true },
    });
    if (!enquiry)
      return { ok: false as const, error: "enquiry_not_found" as const };
    const appraisal = await transaction.appraisal.findFirst({
      where: {
        id: input.appraisalId,
        enquiryId: enquiry.id,
        workspaceId: actor.workspaceId,
      },
      select: { id: true, status: true },
    });
    if (!appraisal)
      return { ok: false as const, error: "appraisal_not_found" as const };
    if (
      enquiry.stage !== EnquiryStage.APPRAISAL_BOOKED ||
      appraisal.status !== AppraisalStatus.SCHEDULED ||
      !enquiry.leadSourceId
    ) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "invalid_state",
        enquiry.id,
      );
    }
    await transaction.appraisal.update({
      where: { id: appraisal.id },
      data: {
        status: AppraisalStatus.COMPLETED,
        completedAt: new Date(),
        expectedMonthlyRentPence: outcome.data.expectedMonthlyRentPence,
        recommendedService: outcome.data.recommendedService
          ? SERVICE[outcome.data.recommendedService]
          : null,
        feeKind: outcome.data.feeKind ? FEE_KIND[outcome.data.feeKind] : null,
        feeValue: outcome.data.feeValue,
        feeVat: outcome.data.feeVat ? VAT[outcome.data.feeVat] : null,
        notes: outcome.data.notes,
      },
    });
    await changeEnquiryStageInTransaction(
      transaction,
      actor,
      enquiry,
      "appraisal_completed",
      null,
    );
    await enquiryAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: enquiry.id,
      metadata: { appraisalId: appraisal.id },
    });
    return {
      ok: true as const,
      enquiryId: enquiry.id,
      appraisalId: appraisal.id,
    };
  });
}

function finishWithoutCompletion(
  input: EnquiryActorInput & {
    enquiryId: string;
    appraisalId: string;
    reason: string;
  },
  status:
    typeof AppraisalStatus.CANCELLED | typeof AppraisalStatus.DID_NOT_ATTEND,
) {
  const action =
    status === AppraisalStatus.CANCELLED
      ? "enquiry.appraisal.cancel"
      : "enquiry.appraisal.did_not_attend";
  return withEnquiryActor(input, async (transaction, actor) => {
    if (!hasPermission(actor.roles, "enquiry.update")) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "access_denied",
        input.enquiryId,
      );
    }
    const reason = validateReason(input.reason);
    if (!isUuid(input.enquiryId) || !isUuid(input.appraisalId) || !reason.ok) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "invalid_input",
        input.enquiryId,
      );
    }
    await lockEnquiry(transaction, actor, input.enquiryId);
    const enquiry = await transaction.enquiry.findFirst({
      where: { id: input.enquiryId, workspaceId: actor.workspaceId },
      select: { id: true, stage: true },
    });
    if (!enquiry)
      return { ok: false as const, error: "enquiry_not_found" as const };
    const appraisal = await transaction.appraisal.findFirst({
      where: {
        id: input.appraisalId,
        enquiryId: enquiry.id,
        workspaceId: actor.workspaceId,
      },
      select: { id: true, status: true },
    });
    if (!appraisal)
      return { ok: false as const, error: "appraisal_not_found" as const };
    if (
      enquiry.stage !== EnquiryStage.APPRAISAL_BOOKED ||
      appraisal.status !== AppraisalStatus.SCHEDULED
    ) {
      return enquiryDeny(
        transaction,
        actor,
        action,
        "invalid_state",
        enquiry.id,
      );
    }
    await transaction.appraisal.update({
      where: { id: appraisal.id },
      data: { status },
    });
    // Next actions for a visit that will not happen no longer apply.
    await transaction.enquiryTask.updateMany({
      where: {
        workspaceId: actor.workspaceId,
        enquiryId: enquiry.id,
        appraisalId: appraisal.id,
        status: EnquiryTaskStatus.OPEN,
      },
      data: {
        status: EnquiryTaskStatus.CANCELLED,
        closedAt: new Date(),
        closedByMembershipId: actor.membershipId,
      },
    });
    await changeEnquiryStageInTransaction(
      transaction,
      actor,
      enquiry,
      "new_enquiry",
      reason.reason,
    );
    await enquiryAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: enquiry.id,
      metadata: { appraisalId: appraisal.id },
    });
    return {
      ok: true as const,
      enquiryId: enquiry.id,
      appraisalId: appraisal.id,
    };
  });
}

export function cancelAppraisal(
  input: EnquiryActorInput & {
    enquiryId: string;
    appraisalId: string;
    reason: string;
  },
) {
  return finishWithoutCompletion(input, AppraisalStatus.CANCELLED);
}

export function recordAppraisalDidNotAttend(
  input: EnquiryActorInput & {
    enquiryId: string;
    appraisalId: string;
    reason: string;
  },
) {
  return finishWithoutCompletion(input, AppraisalStatus.DID_NOT_ATTEND);
}
