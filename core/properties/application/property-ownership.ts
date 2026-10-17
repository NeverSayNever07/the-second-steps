import "server-only";

import { hasPermission } from "@/core/access/domain/role";
import { hasBranchAccess } from "@/core/access/domain/scope";
import { ContactStatus, PropertyStatus } from "@/core/db/generated/enums";
import {
  createContactInTransaction,
  type NewContactInput,
} from "@/core/contacts/application/contacts";
import {
  ownershipDatesAreOrdered,
  parseOwnershipDate,
  validatePropertyReason,
} from "@/core/properties/domain/property";
import { isUuid } from "@/core/properties/domain/ids";
import {
  PropertyRollback,
  lockProperty,
  propertyAudit,
  propertyDeny,
  shareContactWithBranch,
  withPropertyActor,
  type ActorInput,
  type PropertyActor,
  type PropertyTransaction,
  type PropertyWriteResult,
} from "./property-shared";

export type OwnerInput =
  | { contactId: string; isLead: boolean; startedOn: string }
  | { newContact: NewContactInput; isLead: boolean; startedOn: string };

/**
 * Records one current owner inside an existing transaction. Fails by
 * throwing PropertyRollback so the caller's earlier writes are undone.
 */
export async function recordOwnerInTransaction(
  transaction: PropertyTransaction,
  actor: PropertyActor,
  property: { id: string; responsibleBranchId: string },
  owner: OwnerInput,
  options: { demoteExistingLead: boolean },
) {
  const startedOn = parseOwnershipDate(owner.startedOn);
  if (!startedOn.ok) throw new PropertyRollback("invalid_input");

  let contactId: string;
  if ("newContact" in owner) {
    const created = await createContactInTransaction(transaction, actor, {
      ...owner.newContact,
      branchId: property.responsibleBranchId,
    });
    if (!created.ok) throw new PropertyRollback(created.error);
    contactId = created.contactId;
  } else {
    const contact = await transaction.contact.findFirst({
      where: {
        id: owner.contactId,
        workspaceId: actor.workspaceId,
        status: ContactStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!contact) throw new PropertyRollback("contact_not_found");
    contactId = contact.id;

    const alreadyCurrent = await transaction.propertyOwnership.findFirst({
      where: {
        workspaceId: actor.workspaceId,
        propertyId: property.id,
        contactId,
        endedAt: null,
      },
      select: { id: true },
    });
    if (alreadyCurrent) throw new PropertyRollback("invalid_state");
  }

  if (owner.isLead && options.demoteExistingLead) {
    await transaction.propertyOwnership.updateMany({
      where: {
        workspaceId: actor.workspaceId,
        propertyId: property.id,
        isLead: true,
        endedAt: null,
      },
      data: { isLead: false },
    });
  }

  // The owner must be visible to the property's branch, and the ownership
  // policy requires the owner to be visible to the person recording it.
  const branchLinkAdded = await shareContactWithBranch(
    transaction,
    actor,
    contactId,
    property.responsibleBranchId,
  );
  const ownership = await transaction.propertyOwnership.create({
    data: {
      workspaceId: actor.workspaceId,
      propertyId: property.id,
      contactId,
      isLead: owner.isLead,
      startedOn: startedOn.date,
      createdByMembershipId: actor.membershipId,
    },
    select: { id: true },
  });
  await propertyAudit(transaction, actor, {
    action: "property.ownership.add",
    outcome: "SUCCEEDED",
    targetId: property.id,
    metadata: {
      contactId,
      ownershipId: ownership.id,
      lead: String(owner.isLead),
      branchLinkAdded: String(branchLinkAdded),
    },
  });
  return ownership.id;
}

/**
 * Reads the property after locking it, so ownership changes and branch
 * transfers on one property cannot overlap and leave an owner unshared.
 */
async function findActiveProperty(
  transaction: PropertyTransaction,
  actor: PropertyActor,
  propertyId: string,
) {
  if (!isUuid(propertyId)) return null;
  await lockProperty(transaction, actor, propertyId);
  return transaction.property.findFirst({
    where: { id: propertyId, workspaceId: actor.workspaceId },
    select: {
      id: true,
      status: true,
      responsibleBranchId: true,
      currentInstructionCount: true,
    },
  });
}

export function addPropertyOwner(
  input: ActorInput & { propertyId: string; owner: OwnerInput },
): Promise<PropertyWriteResult> {
  const action = "property.ownership.add";
  return withPropertyActor(input, async (transaction, actor) => {
    if (!hasPermission(actor.roles, "property.ownership.manage")) {
      return propertyDeny(
        transaction,
        actor,
        action,
        "access_denied",
        input.propertyId,
      );
    }
    const property = await findActiveProperty(
      transaction,
      actor,
      input.propertyId,
    );
    if (!property) return { ok: false, error: "property_not_found" };
    if (property.status !== PropertyStatus.ACTIVE) {
      return propertyDeny(
        transaction,
        actor,
        action,
        "invalid_state",
        property.id,
      );
    }
    await recordOwnerInTransaction(transaction, actor, property, input.owner, {
      demoteExistingLead: true,
    });
    return { ok: true, propertyId: property.id };
  });
}

export function endPropertyOwnership(
  input: ActorInput & {
    propertyId: string;
    ownershipId: string;
    reason: string;
    endedOn: string;
  },
): Promise<PropertyWriteResult> {
  const action = "property.ownership.end";
  return withPropertyActor(input, async (transaction, actor) => {
    if (!hasPermission(actor.roles, "property.ownership.manage")) {
      return propertyDeny(
        transaction,
        actor,
        action,
        "access_denied",
        input.propertyId,
      );
    }
    if (!isUuid(input.propertyId) || !isUuid(input.ownershipId)) {
      return { ok: false, error: "ownership_not_found" };
    }
    await lockProperty(transaction, actor, input.propertyId);
    const ownership = await transaction.propertyOwnership.findFirst({
      where: {
        id: input.ownershipId,
        propertyId: input.propertyId,
        workspaceId: actor.workspaceId,
      },
      select: {
        id: true,
        contactId: true,
        isLead: true,
        startedOn: true,
        endedAt: true,
      },
    });
    if (!ownership) return { ok: false, error: "ownership_not_found" };
    if (ownership.endedAt) {
      return propertyDeny(
        transaction,
        actor,
        action,
        "invalid_state",
        input.propertyId,
      );
    }
    const reason = validatePropertyReason(input.reason);
    const endedOn = parseOwnershipDate(input.endedOn);
    if (
      !reason.ok ||
      !endedOn.ok ||
      !ownershipDatesAreOrdered(ownership.startedOn, endedOn.date)
    ) {
      return propertyDeny(
        transaction,
        actor,
        action,
        "invalid_input",
        input.propertyId,
      );
    }

    await transaction.propertyOwnership.update({
      where: { id: ownership.id },
      data: {
        endedAt: new Date(),
        endedOn: endedOn.date,
        endReason: reason.reason,
        isLead: false,
      },
    });
    await propertyAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: input.propertyId,
      metadata: {
        contactId: ownership.contactId,
        ownershipId: ownership.id,
        wasLead: String(ownership.isLead),
      },
    });
    return { ok: true, propertyId: input.propertyId };
  });
}

export function setPropertyLeadOwner(
  input: ActorInput & { propertyId: string; ownershipId: string },
): Promise<PropertyWriteResult> {
  const action = "property.ownership.lead";
  return withPropertyActor(input, async (transaction, actor) => {
    if (!hasPermission(actor.roles, "property.ownership.manage")) {
      return propertyDeny(
        transaction,
        actor,
        action,
        "access_denied",
        input.propertyId,
      );
    }
    const property = await findActiveProperty(
      transaction,
      actor,
      input.propertyId,
    );
    if (!property) return { ok: false, error: "property_not_found" };
    const ownership = await transaction.propertyOwnership.findFirst({
      where: {
        id: input.ownershipId,
        propertyId: property.id,
        workspaceId: actor.workspaceId,
      },
      select: { id: true, contactId: true, isLead: true, endedAt: true },
    });
    if (!ownership) return { ok: false, error: "ownership_not_found" };
    if (
      property.status !== PropertyStatus.ACTIVE ||
      ownership.endedAt ||
      ownership.isLead
    ) {
      return propertyDeny(
        transaction,
        actor,
        action,
        "invalid_state",
        property.id,
      );
    }

    // Only one current lead is allowed, so the old lead is cleared first.
    await transaction.propertyOwnership.updateMany({
      where: {
        workspaceId: actor.workspaceId,
        propertyId: property.id,
        isLead: true,
        endedAt: null,
      },
      data: { isLead: false },
    });
    await transaction.propertyOwnership.update({
      where: { id: ownership.id },
      data: { isLead: true },
    });
    await propertyAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: property.id,
      metadata: { contactId: ownership.contactId, ownershipId: ownership.id },
    });
    return { ok: true, propertyId: property.id };
  });
}

export function transferPropertyBranch(
  input: ActorInput & {
    propertyId: string;
    toBranchId: string;
    reason: string;
  },
): Promise<PropertyWriteResult> {
  const action = "property.branch.transfer";
  return withPropertyActor(input, async (transaction, actor) => {
    if (!hasPermission(actor.roles, "property.branch.transfer")) {
      return propertyDeny(
        transaction,
        actor,
        action,
        "access_denied",
        input.propertyId,
      );
    }
    if (!isUuid(input.toBranchId)) {
      return propertyDeny(
        transaction,
        actor,
        action,
        "invalid_input",
        input.propertyId,
      );
    }
    // findActiveProperty locks the property, so two transfers cannot both
    // start from one branch.
    const property = await findActiveProperty(
      transaction,
      actor,
      input.propertyId,
    );
    if (!property) return { ok: false, error: "property_not_found" };
    if (property.status !== PropertyStatus.ACTIVE) {
      return propertyDeny(
        transaction,
        actor,
        action,
        "invalid_state",
        property.id,
      );
    }
    // A property keeps its branch while it has a current instruction, so the
    // two cannot drift apart. A joined transfer is later work.
    if (property.currentInstructionCount > 0) {
      return propertyDeny(
        transaction,
        actor,
        action,
        "has_current_instruction",
        property.id,
      );
    }
    const reason = validatePropertyReason(input.reason);
    if (!reason.ok || input.toBranchId === property.responsibleBranchId) {
      return propertyDeny(
        transaction,
        actor,
        action,
        "invalid_input",
        property.id,
      );
    }
    if (!hasBranchAccess(actor.scope, input.toBranchId)) {
      return propertyDeny(
        transaction,
        actor,
        action,
        "access_denied",
        property.id,
      );
    }
    const toBranch = await transaction.branch.findFirst({
      where: {
        id: input.toBranchId,
        workspaceId: actor.workspaceId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!toBranch) {
      return propertyDeny(
        transaction,
        actor,
        action,
        "invalid_input",
        property.id,
      );
    }

    // Plain SQL so the record carries the database's transaction time, which
    // the database uses to confirm the move and its record belong together.
    await transaction.$executeRaw`
      INSERT INTO "property_branch_transfers" (
        "workspace_id", "property_id", "from_branch_id", "to_branch_id",
        "reason", "transferred_by_membership_id"
      ) VALUES (
        ${actor.workspaceId}::uuid, ${property.id}::uuid,
        ${property.responsibleBranchId}::uuid, ${toBranch.id}::uuid,
        ${reason.reason}, ${actor.membershipId}::uuid
      )
    `;
    await transaction.property.update({
      where: { id: property.id },
      data: { responsibleBranchId: toBranch.id },
    });

    // Current and former owners stay visible to the property's new branch.
    const ownerships = await transaction.propertyOwnership.findMany({
      where: { workspaceId: actor.workspaceId, propertyId: property.id },
      select: { contactId: true },
    });
    let shared = 0;
    for (const contactId of new Set(ownerships.map((o) => o.contactId))) {
      if (
        await shareContactWithBranch(transaction, actor, contactId, toBranch.id)
      ) {
        shared += 1;
      }
    }
    await propertyAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: property.id,
      metadata: {
        fromBranchId: property.responsibleBranchId,
        toBranchId: toBranch.id,
        ownersShared: String(shared),
      },
    });
    return { ok: true, propertyId: property.id };
  });
}
