import "server-only";

import { withVerifiedIdentity } from "@/core/access/data/database-context";
import { hasPermission } from "@/core/access/domain/role";
import { hasBranchAccess } from "@/core/access/domain/scope";
import type { Prisma } from "@/core/db/generated/client";
import {
  CouncilTaxBand,
  FloorAreaUnit,
  FurnishedStatus,
  PropertyFeature,
  PropertyStatus,
  PropertyType,
} from "@/core/db/generated/enums";
import { resolveContactActor } from "@/core/contacts/application/contact-actor";
import { SEARCH_TEXT_MAX } from "@/core/properties/domain/ids";
import {
  buildNormalizedAddressKey,
  classifyAddressDuplicate,
  normalizePropertyPostcode,
  validateOwnerSelection,
  validatePropertyDetails,
  type PropertyDetailsInput,
  type PropertyTypeCode,
  type ValidPropertyDetails,
} from "@/core/properties/domain/property";
import { createPropertyReference } from "@/core/properties/domain/property-reference";
import {
  recordOwnerInTransaction,
  type OwnerInput,
} from "./property-ownership";
import {
  propertyAudit,
  propertyDeny,
  withPropertyActor,
  type ActorInput,
  type PropertyActor,
  type PropertyTransaction,
  type PropertyWriteResult,
} from "./property-shared";

function toEnum<T extends string>(code: string) {
  return code.toUpperCase() as T;
}

function propertyData(details: ValidPropertyDetails) {
  return {
    addressBuilding: details.addressBuilding,
    addressStreet: details.addressStreet,
    addressLocality: details.addressLocality,
    townCity: details.townCity,
    county: details.county,
    postcode: details.postcode,
    normalizedAddressKey: details.normalizedAddressKey,
    propertyType: toEnum<PropertyType>(details.propertyType),
    bedrooms: details.bedrooms,
    bathrooms: details.bathrooms,
    receptionRooms: details.receptionRooms,
    floorArea: details.floorArea,
    floorAreaUnit: details.floorAreaUnit
      ? toEnum<FloorAreaUnit>(details.floorAreaUnit)
      : null,
    furnishedStatus: details.furnishedStatus
      ? toEnum<FurnishedStatus>(details.furnishedStatus)
      : null,
    features: details.features.map((code) => toEnum<PropertyFeature>(code)),
    parkingNotes: details.parkingNotes,
    outdoorSpaceNotes: details.outdoorSpaceNotes,
    councilTaxBand: details.councilTaxBand
      ? toEnum<CouncilTaxBand>(details.councilTaxBand)
      : null,
    generalNotes: details.generalNotes,
  };
}

export type NewPropertyInput = {
  branchId: string;
  details: PropertyDetailsInput;
  owners: readonly OwnerInput[];
};

export async function createProperty(
  input: ActorInput & NewPropertyInput,
): Promise<PropertyWriteResult> {
  return withPropertyActor(input, async (transaction, actor) => {
    return createPropertyInTransaction(transaction, actor, input);
  });
}

/** Creates a property and its owners inside an existing verified transaction. */
export async function createPropertyInTransaction(
  transaction: PropertyTransaction,
  actor: PropertyActor,
  input: NewPropertyInput,
): Promise<PropertyWriteResult> {
  const action = "property.create";
  if (!hasPermission(actor.roles, "property.create")) {
    return propertyDeny(transaction, actor, action, "access_denied");
  }
  const details = validatePropertyDetails(input.details);
  const ownerSelection = validateOwnerSelection(
    input.owners.map((owner, index) => ({
      contactId: "contactId" in owner ? owner.contactId : `new-${index}`,
      isLead: owner.isLead,
    })),
  );
  if (!details.ok || !ownerSelection.ok) {
    return propertyDeny(transaction, actor, action, "invalid_input");
  }
  if (!hasBranchAccess(actor.scope, input.branchId)) {
    return propertyDeny(transaction, actor, action, "access_denied");
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
    return propertyDeny(transaction, actor, action, "invalid_input");
  }

  const property = await transaction.property.create({
    data: {
      workspaceId: actor.workspaceId,
      reference: createPropertyReference(),
      responsibleBranchId: branch.id,
      createdByMembershipId: actor.membershipId,
      ...propertyData(details.data),
    },
    select: { id: true, responsibleBranchId: true },
  });
  for (const owner of input.owners) {
    await recordOwnerInTransaction(transaction, actor, property, owner, {
      demoteExistingLead: false,
    });
  }
  await propertyAudit(transaction, actor, {
    action,
    outcome: "SUCCEEDED",
    targetId: property.id,
    metadata: {
      branchId: branch.id,
      propertyType: details.data.propertyType,
      ownerCount: String(input.owners.length),
    },
  });
  return { ok: true, propertyId: property.id };
}

export async function updateProperty(
  input: ActorInput & { propertyId: string; details: PropertyDetailsInput },
): Promise<PropertyWriteResult> {
  const action = "property.update";
  return withPropertyActor(input, async (transaction, actor) => {
    if (!hasPermission(actor.roles, "property.update")) {
      return propertyDeny(
        transaction,
        actor,
        action,
        "access_denied",
        input.propertyId,
      );
    }
    const property = await transaction.property.findFirst({
      where: { id: input.propertyId, workspaceId: actor.workspaceId },
    });
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
    const details = validatePropertyDetails(input.details);
    if (!details.ok) {
      return propertyDeny(
        transaction,
        actor,
        action,
        "invalid_input",
        property.id,
      );
    }

    const next = propertyData(details.data);
    const current: Record<string, unknown> = property;
    const changed = Object.entries(next)
      .filter(
        ([key, value]) =>
          key !== "normalizedAddressKey" &&
          JSON.stringify(value) !== JSON.stringify(current[key]),
      )
      .map(([key]) => key);
    await transaction.property.update({
      where: { id: property.id },
      data: { ...next, features: { set: next.features } },
    });
    await propertyAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: property.id,
      metadata: { changedFields: changed },
    });
    return { ok: true, propertyId: property.id };
  });
}

function changePropertyArchiveState(
  input: ActorInput & { propertyId: string; reactivate: boolean },
): Promise<PropertyWriteResult> {
  const action = input.reactivate ? "property.reactivate" : "property.archive";
  const expected = input.reactivate
    ? PropertyStatus.ARCHIVED
    : PropertyStatus.ACTIVE;
  return withPropertyActor(input, async (transaction, actor) => {
    if (!hasPermission(actor.roles, "property.archive")) {
      return propertyDeny(
        transaction,
        actor,
        action,
        "access_denied",
        input.propertyId,
      );
    }
    const property = await transaction.property.findFirst({
      where: { id: input.propertyId, workspaceId: actor.workspaceId },
      select: { id: true, status: true, currentOpenEnquiryCount: true },
    });
    if (!property) return { ok: false, error: "property_not_found" };
    if (property.status !== expected) {
      return propertyDeny(
        transaction,
        actor,
        action,
        "invalid_state",
        property.id,
      );
    }
    // The database counts open landlord leads even where this user cannot
    // see them, and would refuse the archive with a raw error.
    if (!input.reactivate && property.currentOpenEnquiryCount > 0) {
      return propertyDeny(
        transaction,
        actor,
        action,
        "has_open_enquiry",
        property.id,
      );
    }
    await transaction.property.update({
      where: { id: property.id },
      data: input.reactivate
        ? { status: PropertyStatus.ACTIVE, archivedAt: null }
        : { status: PropertyStatus.ARCHIVED, archivedAt: new Date() },
    });
    await propertyAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: property.id,
    });
    return { ok: true, propertyId: property.id };
  });
}

export function archiveProperty(input: ActorInput & { propertyId: string }) {
  return changePropertyArchiveState({ ...input, reactivate: false });
}

export function reactivateProperty(input: ActorInput & { propertyId: string }) {
  return changePropertyArchiveState({ ...input, reactivate: true });
}

export type PropertyDuplicate = {
  id: string;
  reference: string;
  strength: "strong" | "possible";
  archived: boolean;
  addressLine: string;
  postcode: string;
};

export function addressLine(property: {
  addressBuilding: string | null;
  addressStreet: string;
  townCity: string;
}) {
  return [property.addressBuilding, property.addressStreet, property.townCity]
    .filter(Boolean)
    .join(", ");
}

/** Only properties the user can see are ever compared or returned. */
export async function findDuplicateProperties(
  input: ActorInput & {
    building: string;
    street: string;
    postcode: string;
    excludePropertyId?: string;
  },
): Promise<PropertyDuplicate[]> {
  const postcode = normalizePropertyPostcode(input.postcode);
  if (!postcode || !input.street.trim()) return [];
  const key = buildNormalizedAddressKey({
    building: input.building.trim() || null,
    street: input.street,
    postcode,
  });

  const result = await withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor || !hasPermission(actor.roles, "property.read")) return null;

      const candidates = await transaction.property.findMany({
        where: {
          workspaceId: actor.workspaceId,
          postcode,
          ...(input.excludePropertyId
            ? { id: { not: input.excludePropertyId } }
            : {}),
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 50,
      });
      return candidates.flatMap((candidate) => {
        const strength = classifyAddressDuplicate(
          key,
          candidate.normalizedAddressKey,
        );
        if (strength === "none") return [];
        return [
          {
            id: candidate.id,
            reference: candidate.reference,
            strength,
            archived: candidate.status === PropertyStatus.ARCHIVED,
            addressLine: addressLine(candidate),
            postcode: candidate.postcode,
          },
        ];
      });
    },
  );
  // Strong matches first.
  return (result ?? []).sort(
    (a, b) => Number(b.strength === "strong") - Number(a.strength === "strong"),
  );
}

type ContactNameFields = {
  kind: "PERSON" | "ORGANISATION";
  firstName: string | null;
  lastName: string | null;
  legalName: string | null;
};

export function contactDisplayName(contact: ContactNameFields) {
  if (contact.kind === "ORGANISATION") return contact.legalName ?? "";
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ");
}

const CONTACT_NAME_SELECT = {
  id: true,
  kind: true,
  reference: true,
  firstName: true,
  lastName: true,
  legalName: true,
} satisfies Prisma.ContactSelect;

export type PropertyListItem = {
  id: string;
  reference: string;
  archived: boolean;
  addressLine: string;
  postcode: string;
  propertyType: PropertyTypeCode;
  bedrooms: number | null;
  branchId: string;
  branchName: string;
  leadLandlord: { contactId: string; name: string } | null;
  updatedAt: Date;
};

export async function listProperties(
  input: ActorInput & {
    query?: string;
    branchId?: string;
    includeArchived?: boolean;
    take?: number;
  },
): Promise<PropertyListItem[]> {
  const text = input.query?.trim().slice(0, SEARCH_TEXT_MAX);
  const postcode = text ? normalizePropertyPostcode(text) : null;
  const result = await withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor || !hasPermission(actor.roles, "property.read")) return null;

      const search: Prisma.PropertyWhereInput[] = text
        ? [
            { reference: { contains: text, mode: "insensitive" } },
            { addressBuilding: { contains: text, mode: "insensitive" } },
            { addressStreet: { contains: text, mode: "insensitive" } },
            { townCity: { contains: text, mode: "insensitive" } },
            postcode
              ? { postcode }
              : { postcode: { contains: text, mode: "insensitive" } },
            ...text
              .split(/\s+/)
              .slice(0, 4)
              .map((word): Prisma.PropertyWhereInput => ({
                ownerships: {
                  some: {
                    endedAt: null,
                    contact: {
                      OR: [
                        { firstName: { contains: word, mode: "insensitive" } },
                        { lastName: { contains: word, mode: "insensitive" } },
                        { legalName: { contains: word, mode: "insensitive" } },
                      ],
                    },
                  },
                },
              })),
          ]
        : [];
      return transaction.property.findMany({
        where: {
          workspaceId: actor.workspaceId,
          ...(input.includeArchived ? {} : { status: PropertyStatus.ACTIVE }),
          ...(input.branchId ? { responsibleBranchId: input.branchId } : {}),
          ...(search.length ? { OR: search } : {}),
        },
        include: {
          responsibleBranch: { select: { id: true, name: true } },
          ownerships: {
            where: { endedAt: null, isLead: true },
            include: { contact: { select: CONTACT_NAME_SELECT } },
            take: 1,
          },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: Math.min(input.take ?? 50, 100),
      });
    },
  );

  return (result ?? []).map((property) => {
    const lead = property.ownerships[0]?.contact;
    return {
      id: property.id,
      reference: property.reference,
      archived: property.status === PropertyStatus.ARCHIVED,
      addressLine: addressLine(property),
      postcode: property.postcode,
      propertyType: property.propertyType.toLowerCase() as PropertyTypeCode,
      bedrooms: property.bedrooms,
      branchId: property.responsibleBranch.id,
      branchName: property.responsibleBranch.name,
      leadLandlord: lead
        ? { contactId: lead.id, name: contactDisplayName(lead) }
        : null,
      updatedAt: property.updatedAt,
    };
  });
}

export type PropertyOwnershipView = {
  id: string;
  contactId: string;
  contactReference: string;
  contactKind: "person" | "organisation";
  name: string;
  isLead: boolean;
  startedOn: Date | null;
  endedOn: Date | null;
  endedAt: Date | null;
  endReason: string | null;
};

export type PropertyView = {
  id: string;
  reference: string;
  archived: boolean;
  responsibleBranch: { id: string; name: string };
  details: ValidPropertyDetails;
  ownerships: PropertyOwnershipView[];
  transfers: {
    id: string;
    fromBranchName: string;
    toBranchName: string;
    reason: string;
    createdAt: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
  can: {
    update: boolean;
    archive: boolean;
    manageOwners: boolean;
    transfer: boolean;
    addNote: boolean;
    manageNotes: boolean;
  };
};

function ownershipView(ownership: {
  id: string;
  isLead: boolean;
  startedOn: Date | null;
  endedOn: Date | null;
  endedAt: Date | null;
  endReason: string | null;
  contact: ContactNameFields & { id: string; reference: string };
}): PropertyOwnershipView {
  return {
    id: ownership.id,
    contactId: ownership.contact.id,
    contactReference: ownership.contact.reference,
    contactKind:
      ownership.contact.kind === "ORGANISATION" ? "organisation" : "person",
    name: contactDisplayName(ownership.contact),
    isLead: ownership.isLead,
    startedOn: ownership.startedOn,
    endedOn: ownership.endedOn,
    endedAt: ownership.endedAt,
    endReason: ownership.endReason,
  };
}

export async function getProperty(
  input: ActorInput & { propertyId: string },
): Promise<PropertyView | null> {
  const lowerCase = (value: string | null) =>
    value === null ? null : value.toLowerCase();
  return withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor || !hasPermission(actor.roles, "property.read")) return null;

      const property = await transaction.property.findFirst({
        where: { id: input.propertyId, workspaceId: actor.workspaceId },
        include: {
          responsibleBranch: { select: { id: true, name: true } },
          ownerships: {
            include: { contact: { select: CONTACT_NAME_SELECT } },
          },
          branchTransfers: {
            orderBy: { createdAt: "desc" },
            include: {
              fromBranch: { select: { name: true } },
              toBranch: { select: { name: true } },
            },
          },
        },
      });
      if (!property) return null;

      const active = property.status === PropertyStatus.ACTIVE;
      // Current owners first with the lead at the top, then former owners.
      const ownerships = [...property.ownerships]
        .sort(
          (a, b) =>
            Number(Boolean(a.endedAt)) - Number(Boolean(b.endedAt)) ||
            Number(b.isLead) - Number(a.isLead) ||
            (b.endedAt?.getTime() ?? 0) - (a.endedAt?.getTime() ?? 0) ||
            a.createdAt.getTime() - b.createdAt.getTime(),
        )
        .map(ownershipView);

      return {
        id: property.id,
        reference: property.reference,
        archived: !active,
        responsibleBranch: property.responsibleBranch,
        details: {
          addressBuilding: property.addressBuilding,
          addressStreet: property.addressStreet,
          addressLocality: property.addressLocality,
          townCity: property.townCity,
          county: property.county,
          postcode: property.postcode,
          normalizedAddressKey: property.normalizedAddressKey,
          propertyType: property.propertyType.toLowerCase() as PropertyTypeCode,
          bedrooms: property.bedrooms,
          bathrooms: property.bathrooms,
          receptionRooms: property.receptionRooms,
          floorArea: property.floorArea,
          floorAreaUnit: lowerCase(
            property.floorAreaUnit,
          ) as ValidPropertyDetails["floorAreaUnit"],
          furnishedStatus: lowerCase(
            property.furnishedStatus,
          ) as ValidPropertyDetails["furnishedStatus"],
          features: property.features.map(
            (feature) =>
              feature.toLowerCase() as ValidPropertyDetails["features"][number],
          ),
          parkingNotes: property.parkingNotes,
          outdoorSpaceNotes: property.outdoorSpaceNotes,
          councilTaxBand: property.councilTaxBand,
          generalNotes: property.generalNotes,
        },
        ownerships,
        transfers: property.branchTransfers.map((transfer) => ({
          id: transfer.id,
          fromBranchName: transfer.fromBranch.name,
          toBranchName: transfer.toBranch.name,
          reason: transfer.reason,
          createdAt: transfer.createdAt,
        })),
        createdAt: property.createdAt,
        updatedAt: property.updatedAt,
        can: {
          update: active && hasPermission(actor.roles, "property.update"),
          archive: hasPermission(actor.roles, "property.archive"),
          manageOwners:
            active && hasPermission(actor.roles, "property.ownership.manage"),
          transfer:
            active && hasPermission(actor.roles, "property.branch.transfer"),
          addNote: hasPermission(actor.roles, "property.note.create"),
          manageNotes: hasPermission(actor.roles, "property.note.manage"),
        },
      };
    },
  );
}

export type ContactPropertyView = {
  ownershipId: string;
  propertyId: string;
  reference: string;
  addressLine: string;
  postcode: string;
  current: boolean;
  isLead: boolean;
  startedOn: Date | null;
  endedOn: Date | null;
};

/** Properties a contact owns or has owned, limited to those the user can see. */
export async function listPropertiesForContact(
  input: ActorInput & { contactId: string },
): Promise<ContactPropertyView[]> {
  const result = await withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor || !hasPermission(actor.roles, "property.read")) return null;
      return transaction.propertyOwnership.findMany({
        where: { workspaceId: actor.workspaceId, contactId: input.contactId },
        include: { property: true },
        orderBy: [
          { endedAt: { sort: "asc", nulls: "first" } },
          { createdAt: "desc" },
        ],
        take: 100,
      });
    },
  );
  return (result ?? []).map((ownership) => ({
    ownershipId: ownership.id,
    propertyId: ownership.property.id,
    reference: ownership.property.reference,
    addressLine: addressLine(ownership.property),
    postcode: ownership.property.postcode,
    current: ownership.endedAt === null,
    isLead: ownership.isLead,
    startedOn: ownership.startedOn,
    endedOn: ownership.endedOn,
  }));
}
