import "server-only";

import { hasPermission } from "@/core/access/domain/role";
import { hasBranchAccess } from "@/core/access/domain/scope";
import { isUuid } from "@/core/properties/domain/ids";
import {
  appraisalTimeIsReasonable,
  createBookedAppraisal,
  resolveLandlordAndProperty,
  type ContactChoice,
  type PropertyChoice,
} from "./appraisals";
import { createEnquiryInTransaction } from "./enquiries";
import {
  canAssignEnquiryWork,
  EnquiryRollback,
  enquiryDeny,
  withEnquiryActor,
  type EnquiryActorInput,
} from "./enquiry-shared";

export type LandlordLeadNext =
  | {
      kind: "appraisal";
      scheduledAt: Date;
      assignedMembershipId: string;
    }
  | {
      kind: "task";
      title: string;
      dueOn: string;
      assignedMembershipId: string;
    }
  | { kind: "none" };

export type CreateLandlordLeadInput = EnquiryActorInput & {
  branchId: string;
  leadSourceId?: string | null;
  leadMembershipId?: string | null;
  summary?: string;
  /** The landlord: an existing contact, or a new one after the duplicate review. */
  contact: ContactChoice;
  /** The property to let: an existing one, or a new one after the duplicate review. */
  property: PropertyChoice;
  /** What happens next: book the appraisal now, set a next action, or save the lead as it is. */
  next: LandlordLeadNext;
};

function displayName(contact: Extract<ContactChoice, { kind: "new" }>) {
  const { contact: details } = contact;
  return details.kind === "person"
    ? [details.details.firstName, details.details.lastName]
        .filter(Boolean)
        .join(" ")
    : details.details.legalName;
}

/**
 * The whole "New landlord lead" step in one transaction: the landlord (new or
 * existing, owner of the property), the property to let (new or existing), the
 * lead itself, and either the booked appraisal or a first next action. If any
 * part fails, nothing is saved, so no half-made landlord or property is left
 * behind. Duplicates must already have been reviewed (see
 * `reviewAppraisalBookingDuplicates`); an unreviewed match is refused.
 */
export function createLandlordLead(input: CreateLandlordLeadInput) {
  const action = "enquiry.create";
  return withEnquiryActor(input, async (transaction, actor) => {
    const booking = input.next.kind === "appraisal";
    if (
      !hasPermission(actor.roles, "enquiry.create") ||
      (booking && !hasPermission(actor.roles, "enquiry.update"))
    ) {
      return enquiryDeny(transaction, actor, action, "access_denied");
    }
    if (
      !isUuid(input.branchId) ||
      !hasBranchAccess(actor.scope, input.branchId)
    ) {
      return enquiryDeny(transaction, actor, action, "access_denied");
    }
    if (
      !["existing", "new"].includes(input.contact.kind) ||
      !["existing", "new"].includes(input.property.kind) ||
      (input.next.kind === "appraisal" &&
        (!(input.next.scheduledAt instanceof Date) ||
          !appraisalTimeIsReasonable(input.next.scheduledAt) ||
          !isUuid(input.next.assignedMembershipId) ||
          !(await canAssignEnquiryWork(
            transaction,
            actor,
            input.next.assignedMembershipId,
            input.branchId,
          ))))
    ) {
      return enquiryDeny(transaction, actor, action, "invalid_input");
    }

    // The landlord and the property are saved first; a refusal here (for
    // example an unreviewed duplicate) happens before anything is written.
    const records = await resolveLandlordAndProperty(transaction, actor, {
      action,
      subjectId: undefined,
      branchId: input.branchId,
      linkedContactId: null,
      linkedPropertyId: null,
      contact: input.contact,
      property: input.property,
    });
    if (!records.ok) return records;
    const { contactId, propertyId } = records;

    // The lead keeps a copy of how the landlord and the property were first
    // described, as quick capture always has.
    const [contact, property] = await Promise.all([
      transaction.contact.findFirst({
        where: { id: contactId, workspaceId: actor.workspaceId },
        select: {
          kind: true,
          firstName: true,
          lastName: true,
          legalName: true,
          contactPoints: {
            where: { archivedAt: null },
            select: { kind: true, value: true, isPreferred: true },
            orderBy: [{ isPreferred: "desc" }, { createdAt: "asc" }],
          },
        },
      }),
      transaction.property.findFirst({
        where: { id: propertyId, workspaceId: actor.workspaceId },
        select: {
          addressBuilding: true,
          addressStreet: true,
          postcode: true,
        },
      }),
    ]);
    // From here on the landlord and property exist, so any refusal must roll
    // the whole transaction back rather than leave them behind.
    if (!contact || !property) throw new EnquiryRollback("invalid_state");
    const created = await createEnquiryInTransaction(transaction, actor, {
      branchId: input.branchId,
      contactId,
      propertyId,
      leadSourceId: input.leadSourceId,
      leadMembershipId: input.leadMembershipId,
      enquirer: {
        name:
          input.contact.kind === "new"
            ? displayName(input.contact)
            : contact.kind === "ORGANISATION"
              ? (contact.legalName ?? "")
              : [contact.firstName, contact.lastName].filter(Boolean).join(" "),
        email:
          contact.contactPoints.find((point) => point.kind === "EMAIL")
            ?.value ?? "",
        telephone:
          contact.contactPoints.find((point) => point.kind === "TELEPHONE")
            ?.value ?? "",
        addressBuilding: property.addressBuilding ?? "",
        addressStreet: property.addressStreet,
        postcode: property.postcode,
        summary: input.summary ?? "",
      },
      firstTask:
        input.next.kind === "task"
          ? {
              title: input.next.title,
              dueOn: input.next.dueOn,
              assignedMembershipId: input.next.assignedMembershipId,
            }
          : null,
    });
    if (!created.ok) throw new EnquiryRollback(created.error);

    if (input.next.kind === "appraisal") {
      await createBookedAppraisal(
        transaction,
        actor,
        { id: created.enquiryId, stage: "NEW_ENQUIRY" },
        {
          action: "enquiry.appraisal.book",
          contactId,
          propertyId,
          scheduledAt: input.next.scheduledAt,
          assignedMembershipId: input.next.assignedMembershipId,
        },
      );
    }
    return {
      ok: true as const,
      enquiryId: created.enquiryId,
      contactId,
      propertyId,
    };
  });
}
