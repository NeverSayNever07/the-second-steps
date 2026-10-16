import "server-only";

import { randomUUID } from "node:crypto";
import { withVerifiedIdentity } from "@/core/access/data/database-context";
import { hasBranchAccess } from "@/core/access/domain/scope";
import { hasPermission } from "@/core/access/domain/role";
import {
  CommunicationChannel,
  ContactAddressKind,
  ContactKind,
  ContactPointKind,
  ContactStatus,
  OrganisationType,
} from "@/core/db/generated/enums";
import type { Prisma } from "@/core/db/generated/client";
import {
  duplicateSignalStrength,
  normalizeEmail,
  normalizeIdentifier,
  normalizePostcode,
  normalizeTelephone,
  preferredChannelIsAllowed,
  validateContactAddresses,
  validateContactPoints,
  validateOrganisationDetails,
  validatePersonDetails,
  type ContactAddressInput,
  type ContactPointInput,
  type OrganisationDetailsInput,
  type PersonDetailsInput,
  type ValidContactAddress,
  type ValidContactPoint,
} from "@/core/contacts/domain/contact";
import { createContactReference } from "@/core/contacts/domain/contact-reference";
import { resolveContactActor, type ContactActor } from "./contact-actor";

type PreferredChannel =
  "email" | "telephone" | "sms" | "whatsapp" | "post" | null;

export type CommunicationPreferencesInput = {
  preferred: PreferredChannel;
  doNotEmail: boolean;
  doNotTelephone: boolean;
  doNotSms: boolean;
  doNotWhatsApp: boolean;
  doNotPost: boolean;
};

type ContactWriteError =
  "access_denied" | "contact_not_found" | "invalid_input" | "invalid_state";

export type ContactWriteResult =
  { ok: true; contactId: string } | { ok: false; error: ContactWriteError };

const CONTACT_INCLUDE = {
  contactPoints: { where: { archivedAt: null }, orderBy: { createdAt: "asc" } },
  addresses: { where: { archivedAt: null }, orderBy: { createdAt: "asc" } },
  branchLinks: {
    where: { endedAt: null },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: { branch: { select: { id: true, name: true } } },
  },
} satisfies Prisma.ContactInclude;

// Lists show names, the preferred contact point and the branch; never
// addresses, so they are not loaded for every row.
const CONTACT_LIST_INCLUDE = {
  contactPoints: CONTACT_INCLUDE.contactPoints,
  branchLinks: CONTACT_INCLUDE.branchLinks,
} satisfies Prisma.ContactInclude;

const CONTACT_LIST_LIMIT = 100;

const POINT_KIND = {
  email: ContactPointKind.EMAIL,
  telephone: ContactPointKind.TELEPHONE,
} as const;
const ADDRESS_KIND = {
  individual: ContactAddressKind.INDIVIDUAL,
  registered: ContactAddressKind.REGISTERED,
  correspondence: ContactAddressKind.CORRESPONDENCE,
} as const;
const CHANNEL = {
  email: CommunicationChannel.EMAIL,
  telephone: CommunicationChannel.TELEPHONE,
  sms: CommunicationChannel.SMS,
  whatsapp: CommunicationChannel.WHATSAPP,
  post: CommunicationChannel.POST,
} as const;
const ORGANISATION_TYPE = {
  limited_company: OrganisationType.LIMITED_COMPANY,
  llp: OrganisationType.LLP,
  partnership: OrganisationType.PARTNERSHIP,
  trust: OrganisationType.TRUST,
  charity: OrganisationType.CHARITY,
  other: OrganisationType.OTHER,
} as const;

function communicationData(input: CommunicationPreferencesInput) {
  const restricted = new Set<string>();
  if (input.doNotEmail) restricted.add("email");
  if (input.doNotTelephone) restricted.add("telephone");
  if (input.doNotSms) restricted.add("sms");
  if (input.doNotWhatsApp) restricted.add("whatsapp");
  if (input.doNotPost) restricted.add("post");
  if (!preferredChannelIsAllowed({ preferred: input.preferred, restricted })) {
    return null;
  }
  return {
    preferredCommunicationChannel: input.preferred
      ? CHANNEL[input.preferred]
      : null,
    doNotEmail: input.doNotEmail,
    doNotTelephone: input.doNotTelephone,
    doNotSms: input.doNotSms,
    doNotWhatsApp: input.doNotWhatsApp,
    doNotPost: input.doNotPost,
  };
}

function pointData(point: ValidContactPoint) {
  return {
    kind: POINT_KIND[point.kind],
    label: point.label,
    value: point.value,
    normalizedValue: point.normalizedValue,
    isPreferred: point.isPreferred,
  };
}

function addressData(address: ValidContactAddress) {
  return {
    kind: ADDRESS_KIND[address.kind],
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2,
    locality: address.locality,
    townCity: address.townCity,
    county: address.county,
    postcode: address.postcode,
    countryCode: address.countryCode,
  };
}

function validateCreateDetails(
  input:
    | { kind: "person"; details: PersonDetailsInput }
    | { kind: "organisation"; details: OrganisationDetailsInput },
) {
  if (input.kind === "person") {
    const validation = validatePersonDetails(input.details);
    return validation.ok
      ? {
          ok: true as const,
          kind: "person" as const,
          data: validation.details,
        }
      : { ok: false as const };
  }
  const validation = validateOrganisationDetails(input.details);
  return validation.ok
    ? {
        ok: true as const,
        kind: "organisation" as const,
        data: {
          organisationType: ORGANISATION_TYPE[validation.details.type],
          legalName: validation.details.legalName,
          tradingName: validation.details.tradingName,
          registrationNumber: validation.details.registrationNumber,
          normalizedRegistrationNumber:
            validation.details.normalizedRegistrationNumber,
          vatNumber: validation.details.vatNumber,
          normalizedVatNumber: validation.details.normalizedVatNumber,
        },
      }
    : { ok: false as const };
}

export async function audit(
  transaction: Parameters<typeof resolveContactActor>[0],
  actor: ContactActor,
  input: {
    action: string;
    outcome: "SUCCEEDED" | "DENIED";
    targetType?: "contact" | "property";
    targetId?: string;
    metadata?: Record<string, string | string[]>;
  },
) {
  await transaction.auditEvent.create({
    data: {
      workspaceId: actor.workspaceId,
      actorUserIdentityId: actor.userIdentityId,
      actorMembershipId: actor.membershipId,
      action: input.action,
      outcome: input.outcome,
      targetType: input.targetType ?? "contact",
      targetId: input.targetId,
      requestId: randomUUID(),
      metadata: input.metadata,
    },
  });
}

export async function deny(
  transaction: Parameters<typeof resolveContactActor>[0],
  actor: ContactActor,
  action: string,
  error: ContactWriteError,
  targetId?: string,
): Promise<ContactWriteResult> {
  await audit(transaction, actor, {
    action,
    outcome: "DENIED",
    targetId,
    metadata: { reason: error },
  });
  return { ok: false, error };
}

export async function listContacts(input: {
  authSubject: string;
  workspaceSlug: string;
  query?: string;
  kind?: "person" | "organisation";
  includeArchived?: boolean;
  includeMerged?: boolean;
  limit?: number;
}) {
  const { limit = CONTACT_LIST_LIMIT } = input;

  return withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor || !hasPermission(actor.roles, "contact.read")) return null;

      const query = input.query?.trim().slice(0, 160);
      const statuses: ContactStatus[] = [ContactStatus.ACTIVE];
      if (input.includeArchived) statuses.push(ContactStatus.ARCHIVED);
      if (input.includeMerged) statuses.push(ContactStatus.MERGED);

      return transaction.contact.findMany({
        where: {
          workspaceId: actor.workspaceId,
          status: { in: statuses },
          ...(input.kind
            ? {
                kind:
                  input.kind === "person"
                    ? ContactKind.PERSON
                    : ContactKind.ORGANISATION,
              }
            : {}),
          ...(query
            ? {
                OR: [
                  { reference: { contains: query, mode: "insensitive" } },
                  { firstName: { contains: query, mode: "insensitive" } },
                  { lastName: { contains: query, mode: "insensitive" } },
                  { legalName: { contains: query, mode: "insensitive" } },
                  { tradingName: { contains: query, mode: "insensitive" } },
                  {
                    contactPoints: {
                      some: {
                        archivedAt: null,
                        value: { contains: query, mode: "insensitive" },
                      },
                    },
                  },
                ],
              }
            : {}),
        },
        include: CONTACT_LIST_INCLUDE,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: Math.min(limit, CONTACT_LIST_LIMIT),
      });
    },
  );
}

export async function getContact(input: {
  authSubject: string;
  workspaceSlug: string;
  contactId: string;
}) {
  return withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor || !hasPermission(actor.roles, "contact.read")) return null;
      // RLS hides links unless the member can see both contacts.
      return transaction.contact.findFirst({
        where: { id: input.contactId, workspaceId: actor.workspaceId },
        include: {
          ...CONTACT_INCLUDE,
          organisationLinks: {
            where: { endedAt: null },
            orderBy: [{ isPrimary: "desc" }, { startedAt: "asc" }],
            include: {
              personContact: {
                select: {
                  id: true,
                  reference: true,
                  title: true,
                  firstName: true,
                  lastName: true,
                  contactPoints: {
                    where: { archivedAt: null, isPreferred: true },
                    select: { kind: true, value: true },
                  },
                },
              },
            },
          },
          personLinks: {
            where: { endedAt: null },
            orderBy: [{ startedAt: "asc" }],
            include: {
              organisationContact: {
                select: { id: true, reference: true, legalName: true },
              },
            },
          },
        },
      });
    },
  );
}

export type NewContactInput = {
  branchId: string;
  communication: CommunicationPreferencesInput;
  contactPoints: readonly ContactPointInput[];
  addresses: readonly ContactAddressInput[];
} & (
  | { kind: "person"; details: PersonDetailsInput }
  | { kind: "organisation"; details: OrganisationDetailsInput }
);

type CreateContactInput = {
  authSubject: string;
  workspaceSlug: string;
} & NewContactInput;

export async function createContact(
  input: CreateContactInput,
): Promise<ContactWriteResult> {
  const result = await withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity): Promise<ContactWriteResult> => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor) return { ok: false, error: "access_denied" };
      return createContactInTransaction(transaction, actor, input);
    },
  );
  return result ?? { ok: false, error: "access_denied" };
}

/** Creates a contact inside an existing verified transaction, with audit. */
export async function createContactInTransaction(
  transaction: Parameters<typeof resolveContactActor>[0],
  actor: ContactActor,
  input: NewContactInput,
): Promise<ContactWriteResult> {
  const points = validateContactPoints(input.contactPoints);
  const addresses = validateContactAddresses(input.kind, input.addresses);
  const communication = communicationData(input.communication);
  const details = validateCreateDetails(input);
  if (!hasPermission(actor.roles, "contact.create")) {
    return deny(transaction, actor, "contact.create", "access_denied");
  }
  if (!points.ok || !addresses.ok || !communication || !details.ok) {
    return deny(transaction, actor, "contact.create", "invalid_input");
  }
  if (!hasBranchAccess(actor.scope, input.branchId)) {
    return deny(transaction, actor, "contact.create", "access_denied");
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
    return deny(transaction, actor, "contact.create", "invalid_input");
  }

  const contact = await transaction.contact.create({
    data: {
      workspaceId: actor.workspaceId,
      kind:
        input.kind === "person" ? ContactKind.PERSON : ContactKind.ORGANISATION,
      reference: createContactReference(input.kind),
      createdByMembershipId: actor.membershipId,
      ...communication,
      ...details.data,
    },
    select: { id: true },
  });
  await transaction.contactBranchLink.create({
    data: {
      workspaceId: actor.workspaceId,
      contactId: contact.id,
      branchId: branch.id,
      isPrimary: true,
      createdByMembershipId: actor.membershipId,
    },
  });
  if (points.points.length) {
    await transaction.contactPoint.createMany({
      data: points.points.map((point) => ({
        workspaceId: actor.workspaceId,
        contactId: contact.id,
        ...pointData(point),
      })),
    });
  }
  if (addresses.addresses.length) {
    await transaction.contactAddress.createMany({
      data: addresses.addresses.map((address) => ({
        workspaceId: actor.workspaceId,
        contactId: contact.id,
        ...addressData(address),
      })),
    });
  }
  await audit(transaction, actor, {
    action: "contact.create",
    outcome: "SUCCEEDED",
    targetId: contact.id,
    metadata: { kind: input.kind, branchId: branch.id },
  });
  return { ok: true, contactId: contact.id };
}

type UpdateContactInput = {
  authSubject: string;
  workspaceSlug: string;
  contactId: string;
  communication: CommunicationPreferencesInput;
  contactPoints: readonly ContactPointInput[];
  addresses: readonly ContactAddressInput[];
} & (
  | { kind: "person"; details: PersonDetailsInput }
  | { kind: "organisation"; details: OrganisationDetailsInput }
);

function validateRoutineDetails(
  input:
    | { kind: "person"; details: PersonDetailsInput }
    | { kind: "organisation"; details: OrganisationDetailsInput },
) {
  if (input.kind === "person") {
    const validation = validatePersonDetails(input.details);
    return validation.ok
      ? {
          ok: true as const,
          kind: "person" as const,
          data: validation.details,
        }
      : { ok: false as const };
  }
  const validation = validateOrganisationDetails(input.details);
  return validation.ok
    ? {
        ok: true as const,
        kind: "organisation" as const,
        data: {
          organisationType: ORGANISATION_TYPE[validation.details.type],
          legalName: validation.details.legalName,
          tradingName: validation.details.tradingName,
          registrationNumber: validation.details.registrationNumber,
          normalizedRegistrationNumber:
            validation.details.normalizedRegistrationNumber,
          vatNumber: validation.details.vatNumber,
          normalizedVatNumber: validation.details.normalizedVatNumber,
        },
      }
    : { ok: false as const };
}

async function replaceContactPoints(
  transaction: Parameters<typeof resolveContactActor>[0],
  actor: ContactActor,
  contactId: string,
  points: readonly ValidContactPoint[],
) {
  const retainedIds = points.flatMap(({ id }) => (id ? [id] : []));
  await transaction.contactPoint.updateMany({
    where: { workspaceId: actor.workspaceId, contactId, archivedAt: null },
    data: { isPreferred: false },
  });
  await transaction.contactPoint.updateMany({
    where: {
      workspaceId: actor.workspaceId,
      contactId,
      archivedAt: null,
      ...(retainedIds.length ? { id: { notIn: retainedIds } } : {}),
    },
    data: { archivedAt: new Date() },
  });
  for (const point of points) {
    if (point.id) {
      await transaction.contactPoint.update({
        where: { id: point.id },
        data: pointData(point),
      });
    } else {
      await transaction.contactPoint.create({
        data: {
          workspaceId: actor.workspaceId,
          contactId,
          ...pointData(point),
        },
      });
    }
  }
}

async function replaceContactAddresses(
  transaction: Parameters<typeof resolveContactActor>[0],
  actor: ContactActor,
  contactId: string,
  addresses: readonly ValidContactAddress[],
) {
  const retainedIds = addresses.flatMap(({ id }) => (id ? [id] : []));
  await transaction.contactAddress.updateMany({
    where: {
      workspaceId: actor.workspaceId,
      contactId,
      archivedAt: null,
      ...(retainedIds.length ? { id: { notIn: retainedIds } } : {}),
    },
    data: { archivedAt: new Date() },
  });
  for (const address of addresses) {
    if (address.id) {
      await transaction.contactAddress.update({
        where: { id: address.id },
        data: addressData(address),
      });
    } else {
      await transaction.contactAddress.create({
        data: {
          workspaceId: actor.workspaceId,
          contactId,
          ...addressData(address),
        },
      });
    }
  }
}

async function childIdsBelongToContact(
  transaction: Parameters<typeof resolveContactActor>[0],
  actor: ContactActor,
  contactId: string,
  points: readonly ValidContactPoint[],
  addresses: readonly ValidContactAddress[],
) {
  const pointIds = points.flatMap(({ id }) => (id ? [id] : []));
  const addressIds = addresses.flatMap(({ id }) => (id ? [id] : []));
  const pointCount = await transaction.contactPoint.count({
    where: {
      id: { in: pointIds },
      workspaceId: actor.workspaceId,
      contactId,
      archivedAt: null,
    },
  });
  const addressCount = await transaction.contactAddress.count({
    where: {
      id: { in: addressIds },
      workspaceId: actor.workspaceId,
      contactId,
      archivedAt: null,
    },
  });
  return pointCount === pointIds.length && addressCount === addressIds.length;
}

export async function updateContact(
  input: UpdateContactInput,
): Promise<ContactWriteResult> {
  const points = validateContactPoints(input.contactPoints);
  const addresses = validateContactAddresses(input.kind, input.addresses);
  const communication = communicationData(input.communication);
  const details = validateRoutineDetails(input);

  const result = await withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity): Promise<ContactWriteResult> => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor) return { ok: false, error: "access_denied" };
      if (!hasPermission(actor.roles, "contact.update")) {
        return deny(
          transaction,
          actor,
          "contact.update",
          "access_denied",
          input.contactId,
        );
      }
      if (!points.ok || !addresses.ok || !communication || !details.ok) {
        return deny(
          transaction,
          actor,
          "contact.update",
          "invalid_input",
          input.contactId,
        );
      }
      const contact = await transaction.contact.findFirst({
        where: { id: input.contactId, workspaceId: actor.workspaceId },
        select: {
          id: true,
          kind: true,
          status: true,
          organisationType: true,
          legalName: true,
          registrationNumber: true,
          vatNumber: true,
        },
      });
      if (!contact) return { ok: false, error: "contact_not_found" };
      if (
        contact.status !== ContactStatus.ACTIVE ||
        contact.kind !==
          (input.kind === "person"
            ? ContactKind.PERSON
            : ContactKind.ORGANISATION)
      ) {
        return deny(
          transaction,
          actor,
          "contact.update",
          "invalid_state",
          contact.id,
        );
      }

      const canManageSensitive = hasPermission(
        actor.roles,
        "contact.sensitive.manage",
      );
      const sensitiveIdentityChanged =
        details.kind === "organisation" &&
        (contact.organisationType !== details.data.organisationType ||
          contact.legalName !== details.data.legalName ||
          contact.registrationNumber !== details.data.registrationNumber ||
          contact.vatNumber !== details.data.vatNumber);
      if (!canManageSensitive && sensitiveIdentityChanged) {
        return deny(
          transaction,
          actor,
          "contact.update",
          "access_denied",
          contact.id,
        );
      }

      const childIdsAreValid = await childIdsBelongToContact(
        transaction,
        actor,
        contact.id,
        points.points,
        addresses.addresses,
      );
      if (!childIdsAreValid) {
        return deny(
          transaction,
          actor,
          "contact.update",
          "invalid_input",
          contact.id,
        );
      }

      await replaceContactPoints(transaction, actor, contact.id, points.points);
      await replaceContactAddresses(
        transaction,
        actor,
        contact.id,
        addresses.addresses,
      );

      await transaction.contact.update({
        where: { id: contact.id },
        data: {
          ...communication,
          ...(details.kind === "person" || canManageSensitive
            ? details.data
            : { tradingName: details.data.tradingName }),
        },
      });
      await audit(transaction, actor, {
        action: "contact.update",
        outcome: "SUCCEEDED",
        targetId: contact.id,
        metadata: {
          changedSections: [
            "details",
            "communication",
            "contact_methods",
            "addresses",
            ...(sensitiveIdentityChanged ? ["organisation_identity"] : []),
          ],
        },
      });
      return { ok: true, contactId: contact.id };
    },
  );
  return result ?? { ok: false, error: "access_denied" };
}

export async function updateOrganisationIdentity(input: {
  authSubject: string;
  workspaceSlug: string;
  contactId: string;
  details: OrganisationDetailsInput;
}): Promise<ContactWriteResult> {
  const validation = validateOrganisationDetails(input.details);
  const result = await withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity): Promise<ContactWriteResult> => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor) return { ok: false, error: "access_denied" };
      if (!hasPermission(actor.roles, "contact.sensitive.manage")) {
        return deny(
          transaction,
          actor,
          "contact.organisation_identity.update",
          "access_denied",
          input.contactId,
        );
      }
      if (!validation.ok) {
        return deny(
          transaction,
          actor,
          "contact.organisation_identity.update",
          "invalid_input",
          input.contactId,
        );
      }
      const contact = await transaction.contact.findFirst({
        where: {
          id: input.contactId,
          workspaceId: actor.workspaceId,
          kind: ContactKind.ORGANISATION,
          status: ContactStatus.ACTIVE,
        },
        select: { id: true },
      });
      if (!contact) return { ok: false, error: "contact_not_found" };
      await transaction.contact.update({
        where: { id: contact.id },
        data: {
          organisationType: ORGANISATION_TYPE[validation.details.type],
          legalName: validation.details.legalName,
          tradingName: validation.details.tradingName,
          registrationNumber: validation.details.registrationNumber,
          normalizedRegistrationNumber:
            validation.details.normalizedRegistrationNumber,
          vatNumber: validation.details.vatNumber,
          normalizedVatNumber: validation.details.normalizedVatNumber,
        },
      });
      await audit(transaction, actor, {
        action: "contact.organisation_identity.update",
        outcome: "SUCCEEDED",
        targetId: contact.id,
        metadata: { changedSections: ["organisation_identity"] },
      });
      return { ok: true, contactId: contact.id };
    },
  );
  return result ?? { ok: false, error: "access_denied" };
}

/**
 * Archiving can also be refused because the contact still owns a property or
 * is linked to an open landlord lead.
 */
export type ContactArchiveResult =
  | ContactWriteResult
  | { ok: false; error: "owns_property" | "has_open_enquiry" };

async function changeContactArchiveState(input: {
  authSubject: string;
  workspaceSlug: string;
  contactId: string;
  reactivate: boolean;
}): Promise<ContactArchiveResult> {
  const action = input.reactivate ? "contact.reactivate" : "contact.archive";
  const expectedStatus = input.reactivate
    ? ContactStatus.ARCHIVED
    : ContactStatus.ACTIVE;
  const nextStatus = input.reactivate
    ? ContactStatus.ACTIVE
    : ContactStatus.ARCHIVED;
  const result = await withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity): Promise<ContactArchiveResult> => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor) return { ok: false, error: "access_denied" };
      if (!hasPermission(actor.roles, "contact.archive")) {
        return deny(
          transaction,
          actor,
          action,
          "access_denied",
          input.contactId,
        );
      }
      const contact = await transaction.contact.findFirst({
        where: { id: input.contactId, workspaceId: actor.workspaceId },
        select: {
          id: true,
          status: true,
          currentPropertyOwnershipCount: true,
          currentOpenEnquiryCount: true,
        },
      });
      if (!contact) return { ok: false, error: "contact_not_found" };
      if (contact.status !== expectedStatus) {
        return deny(transaction, actor, action, "invalid_state", contact.id);
      }
      // The database counts current ownerships and open landlord leads even
      // where this user cannot see them, and would refuse the archive with a
      // raw error.
      const blocker = input.reactivate
        ? null
        : contact.currentPropertyOwnershipCount > 0
          ? "owns_property"
          : contact.currentOpenEnquiryCount > 0
            ? "has_open_enquiry"
            : null;
      if (blocker) {
        await audit(transaction, actor, {
          action,
          outcome: "DENIED",
          targetId: contact.id,
          metadata: { reason: blocker },
        });
        return { ok: false, error: blocker };
      }
      await transaction.contact.update({
        where: { id: contact.id },
        data: {
          status: nextStatus,
          archivedAt: input.reactivate ? null : new Date(),
        },
      });
      await audit(transaction, actor, {
        action,
        outcome: "SUCCEEDED",
        targetId: contact.id,
      });
      return { ok: true, contactId: contact.id };
    },
  );
  return result ?? { ok: false, error: "access_denied" };
}

export function archiveContact(input: {
  authSubject: string;
  workspaceSlug: string;
  contactId: string;
}) {
  return changeContactArchiveState({ ...input, reactivate: false });
}

export function reactivateContact(input: {
  authSubject: string;
  workspaceSlug: string;
  contactId: string;
}) {
  return changeContactArchiveState({ ...input, reactivate: true });
}

export type DuplicateCandidateInput = {
  authSubject: string;
  workspaceSlug: string;
  excludeContactId?: string;
  email?: string;
  telephone?: string;
  registrationNumber?: string;
  name?: string;
  postcode?: string;
};

function comparableName(value: string | null | undefined) {
  return value?.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() || null;
}

export async function findDuplicateContacts(input: DuplicateCandidateInput) {
  const email = input.email ? normalizeEmail(input.email) : null;
  const telephone = input.telephone
    ? normalizeTelephone(input.telephone)
    : null;
  const registrationNumber = normalizeIdentifier(
    input.registrationNumber?.trim() || null,
  );
  const name = comparableName(input.name);
  const postcode = input.postcode ? normalizePostcode(input.postcode) : null;
  if (!email && !telephone && !registrationNumber && !(name && postcode)) {
    return [];
  }

  const result = await withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor || !hasPermission(actor.roles, "contact.read")) return null;

      const candidates = await transaction.contact.findMany({
        where: {
          workspaceId: actor.workspaceId,
          status: { in: [ContactStatus.ACTIVE, ContactStatus.ARCHIVED] },
          ...(input.excludeContactId
            ? { id: { not: input.excludeContactId } }
            : {}),
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
            ...(registrationNumber
              ? [{ normalizedRegistrationNumber: registrationNumber }]
              : []),
            ...(postcode
              ? [
                  {
                    addresses: {
                      some: { postcode, archivedAt: null },
                    },
                  },
                ]
              : []),
          ],
        },
        include: CONTACT_INCLUDE,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 20,
      });

      return candidates.flatMap((candidate) => {
        const exactEmail = Boolean(
          email &&
          candidate.contactPoints.some(
            (point) =>
              point.kind === ContactPointKind.EMAIL &&
              point.normalizedValue === email,
          ),
        );
        const exactTelephone = Boolean(
          telephone &&
          candidate.contactPoints.some(
            (point) =>
              point.kind === ContactPointKind.TELEPHONE &&
              point.normalizedValue === telephone,
          ),
        );
        const exactRegistrationNumber = Boolean(
          registrationNumber &&
          candidate.normalizedRegistrationNumber === registrationNumber,
        );
        const candidateName = comparableName(
          candidate.kind === ContactKind.PERSON
            ? `${candidate.firstName ?? ""}${candidate.lastName ?? ""}`
            : candidate.legalName,
        );
        const sameNormalizedName = Boolean(name && candidateName === name);
        const samePostcode = Boolean(
          postcode &&
          candidate.addresses.some((address) => address.postcode === postcode),
        );
        const strength = duplicateSignalStrength({
          exactEmail,
          exactTelephone,
          exactRegistrationNumber,
          sameNormalizedName,
          samePostcode,
        });
        if (strength === "none") return [];
        const matchedFields = [
          ...(exactEmail ? ["email"] : []),
          ...(exactTelephone ? ["telephone"] : []),
          ...(exactRegistrationNumber ? ["registration_number"] : []),
          ...(sameNormalizedName ? ["name"] : []),
          ...(samePostcode ? ["postcode"] : []),
        ];
        return [{ contact: candidate, strength, matchedFields }];
      });
    },
  );
  return result ?? null;
}
