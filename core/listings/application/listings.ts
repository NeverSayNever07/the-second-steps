import "server-only";

import { randomUUID } from "node:crypto";
import {
  withVerifiedIdentity,
  type AccessTransaction,
} from "@/core/access/data/database-context";
import { hasPermission } from "@/core/access/domain/role";
import { hasBranchAccess } from "@/core/access/domain/scope";
import { readComplianceAreas } from "@/core/compliance/application/property-compliance";
import type {
  ListingEpcPosition as DbEpcPosition,
  ListingEventKind as DbEventKind,
  ListingState as DbListingState,
} from "@/core/db/generated/enums";
import {
  resolveContactActor,
  type ContactActor,
} from "@/core/contacts/application/contact-actor";
import type {
  DepositOfferingCode,
  RentPeriodCode,
} from "@/core/instructions/domain/instruction";
import {
  addressLine,
  propertyDetailsFromRow,
} from "@/core/properties/application/properties";
import { staffName } from "@/core/enquiries/application/enquiry-shared";
import { isUuid } from "@/core/properties/domain/ids";
import {
  isListingState,
  isReviewedState,
  type ListingEventKind,
  type ListingStateCode,
} from "../domain/listing";
import {
  validateListingContent,
  validateListingReason,
  type FieldOrigin,
  type ListingContent,
  type ListingContentErrors,
  type ListingContentInput,
} from "../domain/listing-content";
import { detectDrift, type DriftItem } from "../domain/listing-drift";
import {
  epcSnapshot,
  type EpcPosition,
  type EpcSnapshot,
} from "../domain/listing-epc";
import {
  complianceWarnings,
  contentReadyChecklist,
  isChecklistMet,
  mediaFingerprint,
  readyToAdvertiseChecklist,
  type ChecklistItem,
  type ListingWarning,
} from "../domain/listing-readiness";
import {
  listingFactsFromProperty,
  listingRentFromTerms,
  type ListingPropertyFacts,
  type ListingRentSource,
} from "../domain/listing-source";

// Listings (marketing build M3). Every write is one audited transaction in
// the workspace context; the database sets the property, numbers versions,
// copies the rent from the agreed terms, and refuses anything its rules do
// not allow (migration 20261022100000_listings_core). Nothing here publishes
// anything. Audit entries carry ids only.

export type ListingActorInput = { authSubject: string; workspaceSlug: string };

export type ListingError =
  | "access_denied"
  | "listing_not_found"
  | "instruction_not_found"
  // The instruction is not (or no longer) Ready to market.
  | "instruction_not_ready"
  | "invalid_input"
  // Someone saved a newer version since this one was opened.
  | "version_conflict"
  // The checklist is not complete.
  | "not_ready"
  // The database refused: for example the listing moved on meanwhile.
  | "invalid_state";

export type ListingFailure = {
  ok: false;
  error: ListingError;
  fieldErrors?: ListingContentErrors;
  checklist?: ChecklistItem[];
};

class ListingRollback extends Error {
  constructor(readonly failure: ListingFailure) {
    super(`Listing change rolled back: ${failure.error}`);
  }
}

function databaseCode(error: unknown): string | null {
  const direct = (error as { code?: unknown } | null)?.code;
  const text = String((error as { message?: unknown } | null)?.message ?? "");
  if (typeof direct === "string" && /^\d{5}$/.test(direct)) return direct;
  return /\b(23505|23514|42501)\b/.exec(text)?.[1] ?? null;
}

export async function withListingActor<T extends { ok: true }>(
  input: ListingActorInput,
  operation: (
    transaction: AccessTransaction,
    actor: ContactActor,
  ) => Promise<T | ListingFailure>,
): Promise<T | ListingFailure> {
  try {
    const result = await withVerifiedIdentity(
      input.authSubject,
      async (transaction, identity): Promise<T | ListingFailure> => {
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
    if (error instanceof ListingRollback) return error.failure;
    const code = databaseCode(error);
    // Not visible or not allowed: never told apart from "not found".
    if (code === "42501") return { ok: false, error: "listing_not_found" };
    if (code === "23505" || code === "23514") {
      return { ok: false, error: "invalid_state" };
    }
    throw error;
  }
}

export function listingAudit(
  transaction: AccessTransaction,
  actor: ContactActor,
  input: {
    action: string;
    outcome: "SUCCEEDED" | "DENIED";
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
      targetType: "listing",
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
  failure: ListingFailure,
  targetId?: string,
): Promise<ListingFailure> {
  await listingAudit(transaction, actor, {
    action,
    outcome: "DENIED",
    targetId,
    metadata: { reason: failure.error },
  });
  return failure;
}

const lower = <T extends string>(value: string) => value.toLowerCase() as T;
const upper = <T extends string>(value: string) => value.toUpperCase() as T;
const isoDate = (value: Date) => value.toISOString().slice(0, 10);

/** The property's facts and the instruction's latest terms, as a listing sees them. */
async function liveSources(
  transaction: AccessTransaction,
  actor: ContactActor,
  instructionId: string,
  propertyId: string,
) {
  const [property, terms] = await Promise.all([
    transaction.property.findFirst({
      where: { id: propertyId, workspaceId: actor.workspaceId },
    }),
    transaction.instructionTermsVersion.findFirst({
      where: { workspaceId: actor.workspaceId, instructionId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        askingRentPence: true,
        rentPeriod: true,
        depositOffering: true,
        depositPence: true,
        holdingDepositPence: true,
      },
    }),
  ]);
  if (!property || !terms) return null;
  return {
    facts: listingFactsFromProperty(propertyDetailsFromRow(property)),
    rent: listingRentFromTerms({
      id: terms.id,
      askingRentPence: terms.askingRentPence,
      rentPeriod: terms.rentPeriod
        ? lower<RentPeriodCode>(terms.rentPeriod)
        : null,
      depositOffering: terms.depositOffering
        ? lower<DepositOfferingCode>(terms.depositOffering)
        : null,
      depositPence: terms.depositPence,
      holdingDepositPence: terms.holdingDepositPence,
    }),
    address: addressLine(property),
  };
}

/** Every field copied from source in a new version (facts are always copied). */
function originsFor(content: ListingContent): Record<string, FieldOrigin> {
  const written = (value: string) => (value ? "manual" : "not_supplied");
  return {
    rent: "copied",
    deposit: "copied",
    propertyFacts: "copied",
    headline: written(content.headline),
    summary: written(content.summary),
    description: written(content.description),
    highlights: content.highlights.length ? "manual" : "not_supplied",
    availability:
      content.availableFrom || content.availabilityNote
        ? "manual"
        : "not_supplied",
    materialInformation: content.materialInformationNotApplicable
      ? "not_applicable"
      : written(content.materialInformation),
  };
}

const EMPTY_CONTENT: ListingContent = {
  headline: "",
  summary: "",
  description: "",
  highlights: [],
  availableFrom: null,
  availabilityNote: "",
  depositNote: "",
  materialInformation: "",
  materialInformationNotApplicable: false,
};

/**
 * Adds a version. The database numbers it and copies the rent and deposit
 * from the instruction's latest terms; the property facts are always the
 * property's current ones, through the allowlist.
 */
async function insertVersion(
  transaction: AccessTransaction,
  actor: ContactActor,
  listingId: string,
  content: ListingContent,
  facts: ListingPropertyFacts,
  notApplicable: readonly ("bedrooms" | "bathrooms")[],
) {
  const rows = await transaction.$queryRaw<{ version_no: number }[]>`
    INSERT INTO "listing_content_versions" ("workspace_id", "listing_id",
      "source_terms_version_id", "headline", "summary", "description",
      "highlights", "available_from", "availability_note", "deposit_note",
      "material_information", "material_information_not_applicable",
      "property_facts", "not_applicable", "field_origins",
      "created_by_membership_id")
    VALUES (${actor.workspaceId}::uuid, ${listingId}::uuid, gen_random_uuid(),
      ${content.headline}, ${content.summary}, ${content.description},
      ${content.highlights}::varchar(120)[], ${content.availableFrom}::date,
      ${content.availabilityNote}, ${content.depositNote},
      ${content.materialInformation}, ${content.materialInformationNotApplicable},
      ${JSON.stringify(facts)}::jsonb, ${[...notApplicable]}::varchar(40)[],
      ${JSON.stringify(originsFor(content))}::jsonb,
      ${actor.membershipId}::uuid)
    RETURNING "version_no"
  `;
  const versionNo = rows[0].version_no;
  await insertEvent(transaction, actor, listingId, {
    kind: "version_saved",
    versionNo,
  });
  return versionNo;
}

async function insertEvent(
  transaction: AccessTransaction,
  actor: ContactActor,
  listingId: string,
  event: {
    kind: ListingEventKind;
    from?: ListingStateCode;
    to?: ListingStateCode;
    versionNo?: number;
    reason?: string;
    epc?: EpcSnapshot;
    mediaFingerprint?: string;
  },
) {
  await transaction.listingEvent.create({
    data: {
      workspaceId: actor.workspaceId,
      listingId,
      kind: upper<DbEventKind>(event.kind),
      fromState: event.from ? upper<DbListingState>(event.from) : null,
      toState: event.to ? upper<DbListingState>(event.to) : null,
      versionNo: event.versionNo ?? null,
      reason: event.reason ?? null,
      epcPosition: event.epc ? upper<DbEpcPosition>(event.epc.position) : null,
      epcRating: event.epc?.rating ?? null,
      epcEvidenceId: event.epc?.evidenceId ?? null,
      epcEventOn: event.epc?.eventOn
        ? new Date(`${event.epc.eventOn}T00:00:00Z`)
        : null,
      epcExpiresOn: event.epc?.expiresOn
        ? new Date(`${event.epc.expiresOn}T00:00:00Z`)
        : null,
      epcReference: event.epc?.reference ?? null,
      mediaFingerprint: event.mediaFingerprint ?? null,
      actorMembershipId: actor.membershipId,
    },
  });
}

/** An event, then the state change it records: the order the database requires. */
async function moveListing(
  transaction: AccessTransaction,
  actor: ContactActor,
  listingId: string,
  event: Parameters<typeof insertEvent>[3] & {
    from: ListingStateCode;
    to: ListingStateCode;
  },
) {
  await insertEvent(transaction, actor, listingId, event);
  await transaction.$executeRaw`
    UPDATE "listings" SET "state" = ${event.to}::listing_state
    WHERE "workspace_id" = ${actor.workspaceId}::uuid
      AND "id" = ${listingId}::uuid
  `;
}

// --- Preparing ---

/**
 * Prepares a listing from a Ready to market instruction, or opens the
 * current one if it already exists. Pre-filled from the property and terms;
 * the instruction is never changed.
 */
export function prepareListing(
  input: ListingActorInput & { instructionId: string },
): Promise<{ ok: true; listingId: string; created: boolean } | ListingFailure> {
  const action = "listing.prepare";
  return withListingActor(input, async (transaction, actor) => {
    if (!hasPermission(actor.roles, "listing.prepare")) {
      return deny(transaction, actor, action, {
        ok: false,
        error: "access_denied",
      });
    }
    const instruction = isUuid(input.instructionId)
      ? await transaction.instruction.findFirst({
          where: { id: input.instructionId, workspaceId: actor.workspaceId },
          select: {
            id: true,
            propertyId: true,
            responsibleBranchId: true,
            journeyStage: true,
            endedOn: true,
          },
        })
      : null;
    if (
      !instruction ||
      !hasBranchAccess(actor.scope, instruction.responsibleBranchId)
    ) {
      return { ok: false, error: "instruction_not_found" };
    }
    const existing = await transaction.listing.findFirst({
      where: {
        workspaceId: actor.workspaceId,
        instructionId: instruction.id,
        state: { not: "WITHDRAWN" },
      },
      select: { id: true },
    });
    if (existing) return { ok: true, listingId: existing.id, created: false };
    if (instruction.endedOn || instruction.journeyStage !== "READY_TO_MARKET") {
      return deny(
        transaction,
        actor,
        action,
        { ok: false, error: "instruction_not_ready" },
        instruction.id,
      );
    }
    const sources = await liveSources(
      transaction,
      actor,
      instruction.id,
      instruction.propertyId,
    );
    if (!sources) return { ok: false, error: "instruction_not_found" };

    const created = await transaction.$queryRaw<{ id: string }[]>`
      INSERT INTO "listings" ("workspace_id", "instruction_id", "property_id",
        "created_by_membership_id")
      VALUES (${actor.workspaceId}::uuid, ${instruction.id}::uuid,
        ${instruction.propertyId}::uuid, ${actor.membershipId}::uuid)
      RETURNING "id"
    `;
    const listingId = created[0].id;
    await insertEvent(transaction, actor, listingId, { kind: "created" });
    await insertVersion(
      transaction,
      actor,
      listingId,
      EMPTY_CONTENT,
      sources.facts,
      [],
    );
    await listingAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: listingId,
      metadata: { instructionId: instruction.id },
    });
    return { ok: true, listingId, created: true };
  });
}

// --- Reading ---

export type ListingVersionView = ListingContent & {
  versionNo: number;
  rent: ListingRentSource;
  facts: ListingPropertyFacts;
  notApplicable: ("bedrooms" | "bathrooms")[];
  fieldOrigins: Record<string, FieldOrigin>;
  createdAt: Date;
  createdBy: string;
};

export type ListingEventView = {
  id: string;
  kind: ListingEventKind;
  from: ListingStateCode | null;
  to: ListingStateCode | null;
  versionNo: number | null;
  reason: string | null;
  epcPosition: EpcPosition | null;
  at: Date;
  by: string;
};

export type ListingMediaView = {
  id: string;
  role: "photo" | "floorplan";
  caption: string;
  documentId: string;
  displayName: string;
  mediaType: "pdf" | "jpeg" | "png";
  /** The first photo is the listing's main image. */
  isMainImage: boolean;
};

export type ListingView = {
  id: string;
  state: ListingStateCode;
  stateChangedAt: Date;
  instruction: { id: string; reference: string; isReady: boolean };
  property: { id: string; reference: string; address: string };
  current: ListingVersionView;
  versions: { versionNo: number; createdAt: Date; createdBy: string }[];
  events: ListingEventView[];
  live: { rent: ListingRentSource; facts: ListingPropertyFacts };
  drift: DriftItem[];
  epc: EpcSnapshot;
  warnings: ListingWarning[];
  contentChecklist: ChecklistItem[];
  advertiseChecklist: ChecklistItem[];
  /** Photos first then floorplans, each in order; only stored files. */
  media: ListingMediaView[];
  can: { prepare: boolean; review: boolean };
};

const NAME_SELECT = {
  userIdentity: {
    select: { firstName: true, lastName: true, primaryEmail: true },
  },
} as const;

/** A colleague's name; "A colleague" when it is not visible to this viewer. */
function personName(membership: {
  userIdentity: {
    firstName: string | null;
    lastName: string | null;
    primaryEmail: string | null;
  } | null;
}) {
  return staffName(membership.userIdentity);
}

type Loaded = NonNullable<Awaited<ReturnType<typeof loadListing>>>;

async function loadListing(
  transaction: AccessTransaction,
  actor: ContactActor,
  listingId: string,
) {
  if (!isUuid(listingId)) return null;
  const listing = await transaction.listing.findFirst({
    where: { id: listingId, workspaceId: actor.workspaceId },
    include: {
      instruction: {
        select: {
          id: true,
          reference: true,
          journeyStage: true,
          endedOn: true,
          responsibleBranchId: true,
        },
      },
      property: { select: { id: true, reference: true } },
      versions: {
        orderBy: { versionNo: "desc" },
        include: { createdByMembership: { select: NAME_SELECT } },
      },
      media: {
        where: { removedAt: null },
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: {
          id: true,
          role: true,
          position: true,
          caption: true,
          document: {
            select: {
              id: true,
              status: true,
              mediaType: true,
              displayName: true,
            },
          },
        },
      },
      events: {
        orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
        include: { actorMembership: { select: NAME_SELECT } },
      },
    },
  });
  if (
    !listing ||
    !hasBranchAccess(actor.scope, listing.instruction.responsibleBranchId)
  ) {
    return null;
  }
  return listing;
}

function versionView(row: Loaded["versions"][number]): ListingVersionView {
  return {
    versionNo: row.versionNo,
    headline: row.headline,
    summary: row.summary,
    description: row.description,
    highlights: row.highlights,
    availableFrom: row.availableFrom,
    availabilityNote: row.availabilityNote,
    depositNote: row.depositNote,
    materialInformation: row.materialInformation,
    materialInformationNotApplicable: row.materialInformationNotApplicable,
    rent: {
      sourceTermsVersionId: row.sourceTermsVersionId,
      advertisedRentPence: row.advertisedRentPence,
      rentPeriod: row.rentPeriod ? lower<RentPeriodCode>(row.rentPeriod) : null,
      depositOffering: row.depositOffering
        ? lower<DepositOfferingCode>(row.depositOffering)
        : null,
      depositPence: row.depositPence,
      holdingDepositPence: row.holdingDepositPence,
    },
    facts: row.propertyFacts as ListingPropertyFacts,
    notApplicable: row.notApplicable.filter(
      (item): item is "bedrooms" | "bathrooms" =>
        item === "bedrooms" || item === "bathrooms",
    ),
    fieldOrigins: row.fieldOrigins as Record<string, FieldOrigin>,
    createdAt: row.createdAt,
    createdBy: personName(row.createdByMembership),
  };
}

/** The whole picture of a listing: sources, drift, EPC, checklists. */
async function buildView(
  transaction: AccessTransaction,
  actor: ContactActor,
  listing: Loaded,
): Promise<ListingView | null> {
  const latest = listing.versions[0];
  if (!latest) return null;
  const sources = await liveSources(
    transaction,
    actor,
    listing.instruction.id,
    listing.property.id,
  );
  if (!sources) return null;
  const property = await transaction.property.findFirst({
    where: { id: listing.property.id, workspaceId: actor.workspaceId },
    select: { addressBuilding: true, addressStreet: true, townCity: true },
  });
  const areas = await readComplianceAreas(
    transaction,
    actor,
    listing.property.id,
  );
  const current = versionView(latest);
  const state = lower<ListingStateCode>(listing.state);
  const drift = detectDrift(
    { rent: current.rent, facts: current.facts },
    { rent: sources.rent, facts: sources.facts },
  );

  const epcArea = areas.find((area) => area.area === "epc_mees");
  const relied = epcArea?.evidenceList.find(
    (item) => item.relation === "relied_on",
  );
  const epc = epcSnapshot({
    applicability: epcArea?.applicability ?? "not_assessed",
    status: epcArea?.status ?? "not_requested",
    reliedEvidence: relied
      ? {
          id: relied.id,
          rating: relied.epcRating,
          eventOn: relied.eventOn,
          expiresOn: relied.expiresOn,
          reference: relied.reference,
        }
      : null,
    isExpired: epcArea?.isExpired ?? false,
    applicabilityReason: epcArea?.applicabilityReason ?? null,
  });

  // Newest first. Events saved together share a time; show the stage change
  // first, as that is what happened to the listing.
  const ordered = [...listing.events].sort(
    (a, b) =>
      b.recordedAt.getTime() - a.recordedAt.getTime() ||
      Number(b.toState !== null) - Number(a.toState !== null) ||
      a.id.localeCompare(b.id),
  );
  const events = ordered.map((row): ListingEventView => ({
    id: row.id,
    kind: lower<ListingEventKind>(row.kind),
    from: row.fromState ? lower<ListingStateCode>(row.fromState) : null,
    to: row.toState ? lower<ListingStateCode>(row.toState) : null,
    versionNo: row.versionNo,
    reason: row.reason,
    epcPosition: row.epcPosition ? lower<EpcPosition>(row.epcPosition) : null,
    at: row.recordedAt,
    by: personName(row.actorMembership),
  }));
  const stored = listing.media.filter(
    (item) => item.document.status === "STORED",
  );
  const photos = stored.filter((item) => item.role === "PHOTO");
  const floorplans = stored.filter((item) => item.role === "FLOORPLAN");
  const media: ListingMediaView[] = [...photos, ...floorplans].map((item) => ({
    id: item.id,
    role: item.role === "PHOTO" ? "photo" : "floorplan",
    caption: item.caption,
    documentId: item.document.id,
    displayName: item.document.displayName,
    mediaType: lower<"pdf" | "jpeg" | "png">(item.document.mediaType),
    isMainImage: item.id === photos[0]?.id,
  }));
  const contentReview = listing.events.find(
    (row) => row.kind === "MARKED_CONTENT_READY",
  );
  const isReady =
    !listing.instruction.endedOn &&
    listing.instruction.journeyStage === "READY_TO_MARKET";

  return {
    id: listing.id,
    state,
    stateChangedAt: listing.stateChangedAt,
    instruction: {
      id: listing.instruction.id,
      reference: listing.instruction.reference,
      isReady,
    },
    property: {
      id: listing.property.id,
      reference: listing.property.reference,
      address: property ? addressLine(property) : sources.address,
    },
    current,
    versions: listing.versions.map((row) => ({
      versionNo: row.versionNo,
      createdAt: row.createdAt,
      createdBy: personName(row.createdByMembership),
    })),
    events,
    live: { rent: sources.rent, facts: sources.facts },
    drift,
    epc,
    warnings: complianceWarnings(areas),
    contentChecklist: contentReadyChecklist({
      instructionReady: isReady,
      content: current,
      rent: current.rent,
      facts: current.facts,
      notApplicable: new Set(current.notApplicable),
      drift,
      // The person confirming sees the EPC position on the Readiness tab.
      epcRead: true,
    }),
    advertiseChecklist: readyToAdvertiseChecklist({
      isContentReady: state === "content_ready",
      reviewedVersionIsCurrent: contentReview?.versionNo === current.versionNo,
      epcNow: epc,
      epcAtReview: contentReview?.epcPosition
        ? {
            position: lower<EpcPosition>(contentReview.epcPosition),
            rating: contentReview.epcRating,
            evidenceId: contentReview.epcEvidenceId,
            eventOn: contentReview.epcEventOn
              ? isoDate(contentReview.epcEventOn)
              : null,
            expiresOn: contentReview.epcExpiresOn
              ? isoDate(contentReview.epcExpiresOn)
              : null,
            reference: contentReview.epcReference,
            reason: null,
          }
        : null,
      media: {
        photos: photos.length,
        floorplans: floorplans.length,
        hasMainImage: photos.length > 0,
      },
      // Media cannot change while Ready to advertise (the database refuses),
      // so what was reviewed is what the listing holds.
      mediaMatchesReview: true,
      drift,
    }),
    media,
    can: {
      prepare: hasPermission(actor.roles, "listing.prepare"),
      review: hasPermission(actor.roles, "listing.review"),
    },
  };
}

export function getListing(
  input: ListingActorInput & { listingId: string },
): Promise<{ ok: true; listing: ListingView } | ListingFailure> {
  return withListingActor<{ ok: true; listing: ListingView }>(
    input,
    async (transaction, actor) => {
      if (!hasPermission(actor.roles, "listing.read")) {
        return { ok: false, error: "access_denied" };
      }
      const loaded = await loadListing(transaction, actor, input.listingId);
      const view = loaded ? await buildView(transaction, actor, loaded) : null;
      if (!view) return { ok: false, error: "listing_not_found" };
      return { ok: true, listing: view };
    },
  );
}

/** The current listing of an instruction, for its page; null if none or not allowed. */
export async function getCurrentListingForInstruction(
  input: ListingActorInput & { instructionId: string },
): Promise<{ id: string; state: ListingStateCode } | null> {
  const result = await withListingActor(input, async (transaction, actor) => {
    if (
      !hasPermission(actor.roles, "listing.read") ||
      !isUuid(input.instructionId)
    ) {
      return { ok: true as const, listing: null };
    }
    const row = await transaction.listing.findFirst({
      where: {
        workspaceId: actor.workspaceId,
        instructionId: input.instructionId,
        state: { not: "WITHDRAWN" },
      },
      select: { id: true, state: true },
    });
    return {
      ok: true as const,
      listing: row
        ? { id: row.id, state: lower<ListingStateCode>(row.state) }
        : null,
    };
  });
  return result.ok ? result.listing : null;
}

// --- Writing ---

/** Loads a listing for a write, checking the permission and that it is current. */
async function openForWrite(
  transaction: AccessTransaction,
  actor: ContactActor,
  action: string,
  listingId: string,
  permission: "listing.prepare" | "listing.review",
  lock = false,
): Promise<{ ok: true; listing: Loaded } | ListingFailure> {
  if (!hasPermission(actor.roles, permission)) {
    return deny(
      transaction,
      actor,
      action,
      { ok: false, error: "access_denied" },
      listingId,
    );
  }
  if (lock && isUuid(listingId)) {
    // Media changes wait for this transaction, so what is checked is what
    // is confirmed.
    await transaction.$queryRaw`
      SELECT "id" FROM "listings"
      WHERE "id" = ${listingId}::uuid
        AND "workspace_id" = ${actor.workspaceId}::uuid
      FOR UPDATE
    `;
  }
  const listing = await loadListing(transaction, actor, listingId);
  if (!listing) return { ok: false, error: "listing_not_found" };
  if (listing.state === "WITHDRAWN") {
    return deny(
      transaction,
      actor,
      action,
      { ok: false, error: "invalid_state" },
      listing.id,
    );
  }
  return { ok: true, listing };
}

/**
 * Saves the advert text as a new version. The facts are copied from the
 * property and the rent from the latest terms, so saving also takes in any
 * changes there. A reviewed listing goes back to Draft. Refused if someone
 * saved a newer version since `baseVersionNo` was opened.
 */
export function saveListingDraft(
  input: ListingActorInput & {
    listingId: string;
    baseVersionNo: number;
    content: ListingContentInput;
    notApplicable?: readonly string[];
  },
): Promise<{ ok: true; versionNo: number } | ListingFailure> {
  const action = "listing.save";
  return withListingActor(input, async (transaction, actor) => {
    const open = await openForWrite(
      transaction,
      actor,
      action,
      input.listingId,
      "listing.prepare",
    );
    if (!open.ok) return open;
    const { listing } = open;
    const valid = validateListingContent(input.content);
    if (!valid.ok) {
      return deny(
        transaction,
        actor,
        action,
        { ok: false, error: "invalid_input", fieldErrors: valid.errors },
        listing.id,
      );
    }
    if (listing.versions[0]?.versionNo !== input.baseVersionNo) {
      return deny(
        transaction,
        actor,
        action,
        { ok: false, error: "version_conflict" },
        listing.id,
      );
    }
    const sources = await liveSources(
      transaction,
      actor,
      listing.instruction.id,
      listing.property.id,
    );
    if (!sources) return { ok: false, error: "listing_not_found" };
    const notApplicable = (input.notApplicable ?? []).filter(
      (item): item is "bedrooms" | "bathrooms" =>
        item === "bedrooms" || item === "bathrooms",
    );
    const versionNo = await insertVersion(
      transaction,
      actor,
      listing.id,
      valid.value,
      sources.facts,
      notApplicable,
    );
    const state = lower<ListingStateCode>(listing.state);
    if (isReviewedState(state)) {
      await moveListing(transaction, actor, listing.id, {
        kind: "edited_after_review",
        from: state,
        to: "draft",
        versionNo,
      });
    }
    await listingAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: listing.id,
      metadata: { versionNo },
    });
    return { ok: true, versionNo };
  });
}

/**
 * Confirms Content ready on the version the person reviewed. The checklist
 * and the EPC snapshot are worked out here from the database, never taken
 * from the browser.
 */
export function confirmContentReady(
  input: ListingActorInput & { listingId: string; versionNo: number },
): Promise<{ ok: true } | ListingFailure> {
  const action = "listing.content_ready";
  return withListingActor(input, async (transaction, actor) => {
    const open = await openForWrite(
      transaction,
      actor,
      action,
      input.listingId,
      "listing.review",
    );
    if (!open.ok) return open;
    const { listing } = open;
    if (listing.state !== "DRAFT") {
      return deny(
        transaction,
        actor,
        action,
        { ok: false, error: "invalid_state" },
        listing.id,
      );
    }
    if (listing.versions[0]?.versionNo !== input.versionNo) {
      return deny(
        transaction,
        actor,
        action,
        { ok: false, error: "version_conflict" },
        listing.id,
      );
    }
    const view = await buildView(transaction, actor, listing);
    if (!view) return { ok: false, error: "listing_not_found" };
    if (!view.instruction.isReady) {
      return deny(
        transaction,
        actor,
        action,
        { ok: false, error: "instruction_not_ready" },
        listing.id,
      );
    }
    if (!isChecklistMet(view.contentChecklist)) {
      return deny(
        transaction,
        actor,
        action,
        { ok: false, error: "not_ready", checklist: view.contentChecklist },
        listing.id,
      );
    }
    await moveListing(transaction, actor, listing.id, {
      kind: "marked_content_ready",
      from: "draft",
      to: "content_ready",
      versionNo: input.versionNo,
      epc: view.epc,
    });
    await listingAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: listing.id,
      metadata: { versionNo: input.versionNo, epc: view.epc.position },
    });
    return { ok: true };
  });
}

/**
 * Confirms Ready to advertise: an internal stage, nothing is published. The
 * checklist (EPC position, minimum media, nothing changed since Content
 * ready) is worked out here, and the database checks the EPC and media
 * rules again.
 */
export function confirmReadyToAdvertise(
  input: ListingActorInput & { listingId: string; versionNo: number },
): Promise<{ ok: true } | ListingFailure> {
  const action = "listing.ready_to_advertise";
  return withListingActor(input, async (transaction, actor) => {
    const open = await openForWrite(
      transaction,
      actor,
      action,
      input.listingId,
      "listing.review",
      true,
    );
    if (!open.ok) return open;
    const { listing } = open;
    if (listing.state !== "CONTENT_READY") {
      return deny(
        transaction,
        actor,
        action,
        { ok: false, error: "invalid_state" },
        listing.id,
      );
    }
    if (listing.versions[0]?.versionNo !== input.versionNo) {
      return deny(
        transaction,
        actor,
        action,
        { ok: false, error: "version_conflict" },
        listing.id,
      );
    }
    const view = await buildView(transaction, actor, listing);
    if (!view) return { ok: false, error: "listing_not_found" };
    if (!view.instruction.isReady) {
      return deny(
        transaction,
        actor,
        action,
        { ok: false, error: "instruction_not_ready" },
        listing.id,
      );
    }
    if (!isChecklistMet(view.advertiseChecklist)) {
      return deny(
        transaction,
        actor,
        action,
        { ok: false, error: "not_ready", checklist: view.advertiseChecklist },
        listing.id,
      );
    }
    await moveListing(transaction, actor, listing.id, {
      kind: "marked_ready_to_advertise",
      from: "content_ready",
      to: "ready_to_advertise",
      versionNo: input.versionNo,
      epc: view.epc,
      mediaFingerprint: mediaFingerprint(
        listing.media
          .filter((item) => item.document.status === "STORED")
          .map((item) => ({
            documentId: item.document.id,
            role: item.role === "PHOTO" ? "photo" : "floorplan",
            position: item.position,
          })),
      ),
    });
    await listingAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: listing.id,
      metadata: { versionNo: input.versionNo, epc: view.epc.position },
    });
    return { ok: true };
  });
}

/** Takes a reviewed listing back to Draft, with a reason. */
export function returnListingToDraft(
  input: ListingActorInput & { listingId: string; reason: string },
): Promise<{ ok: true } | ListingFailure> {
  const action = "listing.return_to_draft";
  return withListingActor(input, async (transaction, actor) => {
    const open = await openForWrite(
      transaction,
      actor,
      action,
      input.listingId,
      "listing.review",
    );
    if (!open.ok) return open;
    const { listing } = open;
    const reason = validateListingReason(input.reason);
    const state = lower<ListingStateCode>(listing.state);
    if (!reason.ok || !isReviewedState(state)) {
      return deny(
        transaction,
        actor,
        action,
        { ok: false, error: reason.ok ? "invalid_state" : "invalid_input" },
        listing.id,
      );
    }
    await moveListing(transaction, actor, listing.id, {
      kind: "returned_to_draft",
      from: state,
      to: "draft",
      reason: reason.reason,
    });
    await listingAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: listing.id,
    });
    return { ok: true };
  });
}

/** Withdraws a listing for good, with a reason. A later attempt starts a new one. */
export function withdrawListing(
  input: ListingActorInput & { listingId: string; reason: string },
): Promise<{ ok: true } | ListingFailure> {
  const action = "listing.withdraw";
  return withListingActor(input, async (transaction, actor) => {
    const open = await openForWrite(
      transaction,
      actor,
      action,
      input.listingId,
      "listing.review",
    );
    if (!open.ok) return open;
    const { listing } = open;
    const reason = validateListingReason(input.reason);
    if (!reason.ok) {
      return deny(
        transaction,
        actor,
        action,
        { ok: false, error: "invalid_input" },
        listing.id,
      );
    }
    const state = lower<ListingStateCode>(listing.state);
    if (!isListingState(state)) return { ok: false, error: "invalid_state" };
    await moveListing(transaction, actor, listing.id, {
      kind: "withdrawn",
      from: state,
      to: "withdrawn",
      reason: reason.reason,
    });
    await listingAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetId: listing.id,
    });
    return { ok: true };
  });
}
