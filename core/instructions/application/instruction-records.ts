import "server-only";

import { withVerifiedIdentity } from "@/core/access/data/database-context";
import { hasPermission } from "@/core/access/domain/role";
import { resolveContactActor } from "@/core/contacts/application/contact-actor";
import {
  AppraisalStatus,
  InstructionJourneyStage,
  type Prisma,
} from "@/core/db/generated/client";
import {
  staffName,
  type EnquiryActorInput,
  type EnquiryTransaction,
} from "@/core/enquiries/application/enquiry-shared";
import { stageCode } from "@/core/enquiries/application/enquiries";
import type {
  EnquiryStageCode,
  LettingServiceCode,
} from "@/core/enquiries/domain/enquiry";
import {
  addressLine,
  contactDisplayName,
} from "@/core/properties/application/properties";
import { isUuid, SEARCH_TEXT_MAX } from "@/core/properties/domain/ids";
import { normalizePropertyPostcode } from "@/core/properties/domain/property";
import {
  buildChecklist,
  isChecklistComplete,
  type AgreementStatusCode,
  type ChecklistItem,
  type ChecklistSnapshot,
  type DepositOfferingCode,
  type ExceptionKindCode,
  type FeeFrequencyCode,
  type FeeVatCode,
  type JourneyStageCode,
  type OwnershipCheckStatusCode,
  type RentPeriodCode,
} from "../domain/instruction";

const day = (value: Date) => value.toISOString().slice(0, 10);
const lower = <T extends string>(value: string) => value.toLowerCase() as T;

const NAME_SELECT = {
  firstName: true,
  lastName: true,
  primaryEmail: true,
} as const;

const CONTACT_SELECT = {
  id: true,
  kind: true,
  reference: true,
  firstName: true,
  lastName: true,
  legalName: true,
} satisfies Prisma.ContactSelect;

export type TermsView = {
  id: string;
  service: LettingServiceCode;
  askingRentPence: number | null;
  rentPeriod: RentPeriodCode | null;
  feeKind: "percentage" | "fixed" | null;
  /** Basis points for a percentage fee; pence for a fixed fee. */
  feeValue: number | null;
  feeFrequency: FeeFrequencyCode | null;
  feeVat: FeeVatCode | null;
  depositOffering: DepositOfferingCode | null;
  depositPence: number | null;
  holdingDepositPence: number | null;
  charges: { name: string; amountPence: number; vat: FeeVatCode }[];
  /** Null for the first version. */
  changeReason: string | null;
  createdAt: Date;
  createdBy: string;
};

type TermsRow = Prisma.InstructionTermsVersionGetPayload<{
  include: {
    charges: true;
    createdByMembership: {
      select: { userIdentity: { select: typeof NAME_SELECT } };
    };
  };
}>;

function termsView(row: TermsRow): TermsView {
  return {
    id: row.id,
    service: lower<LettingServiceCode>(row.service),
    askingRentPence: row.askingRentPence,
    rentPeriod: row.rentPeriod ? lower<RentPeriodCode>(row.rentPeriod) : null,
    feeKind: row.feeKind ? lower<"percentage" | "fixed">(row.feeKind) : null,
    feeValue: row.feeValue,
    feeFrequency: row.feeFrequency
      ? lower<FeeFrequencyCode>(row.feeFrequency)
      : null,
    feeVat: row.feeVat ? lower<FeeVatCode>(row.feeVat) : null,
    depositOffering: row.depositOffering
      ? lower<DepositOfferingCode>(row.depositOffering)
      : null,
    depositPence: row.depositPence,
    holdingDepositPence: row.holdingDepositPence,
    charges: [...row.charges]
      // All charges of a version are saved at the same instant, so order by
      // name (the same order the comparison in `validTermsOf` uses).
      .sort(
        (a, b) => a.name.localeCompare(b.name) || a.amountPence - b.amountPence,
      )
      .map((charge) => ({
        name: charge.name,
        amountPence: charge.amountPence,
        vat: lower<FeeVatCode>(charge.vat),
      })),
    changeReason: row.changeReason,
    createdAt: row.createdAt,
    createdBy: staffName(row.createdByMembership.userIdentity),
  };
}

export type PartyView = {
  id: string;
  contact: { id: string; reference: string; name: string };
  isMainContact: boolean;
  addedAt: Date;
  removedAt: Date | null;
  removedReason: string | null;
};

export type InstructionRecord = {
  id: string;
  reference: string;
  instructedOn: string;
  journeyStage: JourneyStageCode;
  journeyChangedAt: Date;
  /** Current until an ended date is recorded. */
  current: boolean;
  ended: {
    on: string;
    reason: string;
    at: Date;
    by: string;
  } | null;
  property: {
    id: string;
    reference: string;
    addressLine: string;
    postcode: string;
  };
  enquiry: { id: string; reference: string; name: string };
  branch: { id: string; name: string };
  leadStaff: { membershipId: string; name: string } | null;
  parties: PartyView[];
  formerParties: PartyView[];
  /** The latest terms, or null if somehow none (the database prevents it). */
  terms: TermsView | null;
  /** Every version, newest first (the first entry is the current terms). */
  termsHistory: TermsView[];
  agreement: {
    status: AgreementStatusCode | null;
    signedOn: string | null;
    events: {
      id: string;
      status: AgreementStatusCode;
      signedOn: string | null;
      reason: string | null;
      at: Date;
      by: string;
    }[];
  };
  ownershipCheck: {
    status: OwnershipCheckStatusCode | null;
    events: {
      id: string;
      status: OwnershipCheckStatusCode;
      checkedOn: string | null;
      method: string | null;
      notes: string | null;
      reason: string | null;
      at: Date;
      by: string;
    }[];
  };
  exceptions: {
    id: string;
    kind: ExceptionKindCode;
    reason: string;
    at: Date;
    by: string;
  }[];
  journeyHistory: {
    id: string;
    from: JourneyStageCode;
    to: JourneyStageCode;
    reason: string | null;
    at: Date;
    by: string;
  }[];
  checklist: ChecklistItem[];
  /** Every checklist item is met (by evidence or a manager's exception). */
  checklistComplete: boolean;
  /** What the signed-in person may do, from their role and branches. */
  can: { manage: boolean; approveExceptions: boolean };
};

const INSTRUCTION_INCLUDE = {
  property: {
    select: {
      id: true,
      reference: true,
      postcode: true,
      addressBuilding: true,
      addressStreet: true,
      townCity: true,
    },
  },
  enquiry: { select: { id: true, reference: true, enquirerName: true } },
  responsibleBranch: { select: { id: true, name: true } },
  leadMembership: {
    select: { id: true, userIdentity: { select: NAME_SELECT } },
  },
  endedByMembership: { select: { userIdentity: { select: NAME_SELECT } } },
  parties: true,
  termsVersions: {
    include: {
      charges: true,
      createdByMembership: {
        select: { userIdentity: { select: NAME_SELECT } },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  },
  agreementEvents: {
    include: {
      recordedByMembership: {
        select: { userIdentity: { select: NAME_SELECT } },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  },
  ownershipChecks: {
    include: {
      recordedByMembership: {
        select: { userIdentity: { select: NAME_SELECT } },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  },
  exceptions: {
    include: {
      approvedByMembership: {
        select: { userIdentity: { select: NAME_SELECT } },
      },
    },
    orderBy: { createdAt: "asc" },
  },
  journeyHistory: {
    include: {
      changedByMembership: {
        select: { userIdentity: { select: NAME_SELECT } },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  },
} satisfies Prisma.InstructionInclude;

type InstructionRow = Prisma.InstructionGetPayload<{
  include: typeof INSTRUCTION_INCLUDE;
}>;

/** The checklist's inputs, from an instruction row loaded with the include above. */
export function snapshotOf(row: InstructionRow): ChecklistSnapshot {
  const latestTerms = row.termsVersions[0] ?? null;
  return {
    hasLeadStaff: row.leadMembershipId !== null,
    hasMainContact: row.parties.some(
      (party) => party.isMainContact && party.removedAt === null,
    ),
    terms: latestTerms && {
      askingRentPence: latestTerms.askingRentPence,
      feeKind: latestTerms.feeKind,
      depositOffering: latestTerms.depositOffering,
      depositPence: latestTerms.depositPence,
    },
    agreement: row.agreementEvents[0]
      ? lower<AgreementStatusCode>(row.agreementEvents[0].toStatus)
      : null,
    ownershipCheck: row.ownershipChecks[0]
      ? lower<OwnershipCheckStatusCode>(row.ownershipChecks[0].status)
      : null,
    exceptions: row.exceptions.map((item) =>
      lower<ExceptionKindCode>(item.kind),
    ),
  };
}

/**
 * Loads an instruction the current member can see, with everything the
 * checklist needs, inside the caller's transaction. Null if it does not exist
 * or is in a branch they cannot see.
 */
export function loadInstructionRow(
  transaction: EnquiryTransaction,
  workspaceId: string,
  instructionId: string,
) {
  return transaction.instruction.findFirst({
    where: { id: instructionId, workspaceId },
    include: INSTRUCTION_INCLUDE,
  });
}

export type LoadedInstruction = NonNullable<
  Awaited<ReturnType<typeof loadInstructionRow>>
>;

/** The checklist as the database now stands (reads your own writes). */
export async function currentChecklist(
  transaction: EnquiryTransaction,
  workspaceId: string,
  instructionId: string,
) {
  const row = await loadInstructionRow(transaction, workspaceId, instructionId);
  if (!row) return null;
  const items = buildChecklist(snapshotOf(row));
  return { row, items, complete: isChecklistComplete(items) };
}

async function contactNames(
  transaction: EnquiryTransaction,
  workspaceId: string,
  ids: string[],
) {
  const contacts = await transaction.contact.findMany({
    where: { workspaceId, id: { in: ids } },
    select: CONTACT_SELECT,
  });
  return new Map(
    contacts.map((contact) => [
      contact.id,
      {
        id: contact.id,
        reference: contact.reference,
        name: contactDisplayName(contact),
      },
    ]),
  );
}

async function recordFrom(
  transaction: EnquiryTransaction,
  row: LoadedInstruction,
  can: InstructionRecord["can"],
): Promise<InstructionRecord> {
  const contacts = await contactNames(
    transaction,
    row.workspaceId,
    row.parties.map((party) => party.contactId),
  );
  const party = (item: InstructionRow["parties"][number]): PartyView => ({
    id: item.id,
    contact: contacts.get(item.contactId) ?? {
      id: item.contactId,
      reference: "",
      name: "A contact you cannot see",
    },
    isMainContact: item.isMainContact,
    addedAt: item.createdAt,
    removedAt: item.removedAt,
    removedReason: item.removedReason,
  });
  const ordered = [...row.parties].sort(
    (a, b) =>
      Number(b.isMainContact) - Number(a.isMainContact) ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const checklist = buildChecklist(snapshotOf(row));
  const terms = row.termsVersions.map(termsView);
  const latestAgreement = row.agreementEvents[0];
  return {
    id: row.id,
    reference: row.reference,
    instructedOn: day(row.instructedOn),
    journeyStage: lower<JourneyStageCode>(row.journeyStage),
    journeyChangedAt: row.journeyChangedAt,
    current: row.endedOn === null,
    ended:
      row.endedOn && row.endedAt
        ? {
            on: day(row.endedOn),
            reason: row.endedReason ?? "",
            at: row.endedAt,
            by: staffName(row.endedByMembership?.userIdentity ?? null),
          }
        : null,
    property: {
      id: row.property.id,
      reference: row.property.reference,
      addressLine: addressLine(row.property),
      postcode: row.property.postcode,
    },
    enquiry: {
      id: row.enquiry.id,
      reference: row.enquiry.reference,
      name: row.enquiry.enquirerName,
    },
    branch: row.responsibleBranch,
    leadStaff: row.leadMembership
      ? {
          membershipId: row.leadMembership.id,
          name: staffName(row.leadMembership.userIdentity),
        }
      : null,
    parties: ordered.filter((item) => item.removedAt === null).map(party),
    formerParties: ordered
      .filter((item) => item.removedAt !== null)
      .sort((a, b) => b.removedAt!.getTime() - a.removedAt!.getTime())
      .map(party),
    terms: terms[0] ?? null,
    termsHistory: terms,
    agreement: {
      status: latestAgreement
        ? lower<AgreementStatusCode>(latestAgreement.toStatus)
        : null,
      signedOn:
        latestAgreement?.toStatus === "SIGNED" && latestAgreement.signedOn
          ? day(latestAgreement.signedOn)
          : null,
      events: row.agreementEvents.map((event) => ({
        id: event.id,
        status: lower<AgreementStatusCode>(event.toStatus),
        signedOn: event.signedOn ? day(event.signedOn) : null,
        reason: event.reason,
        at: event.createdAt,
        by: staffName(event.recordedByMembership.userIdentity),
      })),
    },
    ownershipCheck: {
      status: row.ownershipChecks[0]
        ? lower<OwnershipCheckStatusCode>(row.ownershipChecks[0].status)
        : null,
      events: row.ownershipChecks.map((event) => ({
        id: event.id,
        status: lower<OwnershipCheckStatusCode>(event.status),
        checkedOn: event.checkedOn ? day(event.checkedOn) : null,
        method: event.method,
        notes: event.notes,
        reason: event.reason,
        at: event.createdAt,
        by: staffName(event.recordedByMembership.userIdentity),
      })),
    },
    exceptions: row.exceptions.map((item) => ({
      id: item.id,
      kind: lower<ExceptionKindCode>(item.kind),
      reason: item.reason,
      at: item.createdAt,
      by: staffName(item.approvedByMembership.userIdentity),
    })),
    journeyHistory: row.journeyHistory.map((item) => ({
      id: item.id,
      from: lower<JourneyStageCode>(item.fromStage),
      to: lower<JourneyStageCode>(item.toStage),
      reason: item.reason,
      at: item.createdAt,
      by: staffName(item.changedByMembership.userIdentity),
    })),
    checklist,
    checklistComplete: isChecklistComplete(checklist),
    can,
  };
}

/** One instruction in full, or null if it does not exist or is not visible. */
export async function getInstruction(
  input: EnquiryActorInput & { instructionId: string },
): Promise<InstructionRecord | null> {
  if (!isUuid(input.instructionId)) return null;
  return withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor || !hasPermission(actor.roles, "instruction.read")) {
        return null;
      }
      const row = await loadInstructionRow(
        transaction,
        actor.workspaceId,
        input.instructionId,
      );
      if (!row) return null;
      const manage = hasPermission(actor.roles, "instruction.manage");
      return recordFrom(transaction, row, {
        manage: manage && row.endedOn === null,
        approveExceptions:
          hasPermission(actor.roles, "instruction.exception") &&
          row.endedOn === null,
      });
    },
  );
}

export type InstructionSummary = {
  id: string;
  reference: string;
  instructedOn: string;
  journeyStage: JourneyStageCode;
  current: boolean;
  endedOn: string | null;
  endedReason: string | null;
  mainContact: string | null;
  service: LettingServiceCode | null;
};

export const INSTRUCTION_LIST_PAGE_SIZE = 25;

export type InstructionListState = "current" | "ended" | "all";

export type InstructionListItem = {
  id: string;
  reference: string;
  instructedOn: string;
  journeyStage: JourneyStageCode;
  current: boolean;
  property: {
    reference: string;
    addressLine: string;
    postcode: string;
  };
  mainLandlord: string | null;
  service: LettingServiceCode | null;
  askingRentPence: number | null;
  rentPeriod: RentPeriodCode | null;
  branch: { id: string; name: string };
  leadStaff: { membershipId: string; name: string } | null;
};

export type InstructionListResult = {
  items: InstructionListItem[];
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

const LIST_STAGE = {
  onboarding: InstructionJourneyStage.ONBOARDING,
  ready_to_market: InstructionJourneyStage.READY_TO_MARKET,
  withdrawn: InstructionJourneyStage.WITHDRAWN,
} satisfies Record<JourneyStageCode, InstructionJourneyStage>;

/** A paged instruction worklist, limited by the actor's workspace and branch scope. */
export async function listInstructions(
  input: EnquiryActorInput & {
    query?: string;
    branchId?: string;
    assignedMembershipId?: string;
    journeyStage?: JourneyStageCode;
    state?: InstructionListState;
    page?: number;
    pageSize?: number;
  },
): Promise<InstructionListResult> {
  const pageSize = Math.min(
    Math.max(Math.trunc(input.pageSize ?? INSTRUCTION_LIST_PAGE_SIZE), 1),
    INSTRUCTION_LIST_PAGE_SIZE,
  );
  const page = Math.min(Math.max(Math.trunc(input.page ?? 1), 1), 10_000);
  const empty = {
    items: [],
    page,
    hasPrevious: page > 1,
    hasNext: false,
  };
  if (
    (input.branchId && !isUuid(input.branchId)) ||
    (input.assignedMembershipId && !isUuid(input.assignedMembershipId))
  ) {
    return empty;
  }
  const text = input.query?.trim().slice(0, SEARCH_TEXT_MAX);
  const postcode = text ? normalizePropertyPostcode(text) : null;
  const state = input.state ?? "current";
  const result = await withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor || !hasPermission(actor.roles, "instruction.read")) {
        return null;
      }
      const search: Prisma.InstructionWhereInput[] = text
        ? [
            { reference: { contains: text, mode: "insensitive" } },
            {
              property: {
                reference: { contains: text, mode: "insensitive" },
              },
            },
            {
              property: {
                addressBuilding: { contains: text, mode: "insensitive" },
              },
            },
            {
              property: {
                addressStreet: { contains: text, mode: "insensitive" },
              },
            },
            {
              property: {
                townCity: { contains: text, mode: "insensitive" },
              },
            },
            postcode
              ? { property: { postcode } }
              : {
                  property: {
                    postcode: { contains: text, mode: "insensitive" },
                  },
                },
            {
              // Every typed word must match the same landlord.
              parties: {
                some: {
                  removedAt: null,
                  contact: {
                    AND: text
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 4)
                      .map((word): Prisma.ContactWhereInput => ({
                        OR: [
                          {
                            reference: { contains: word, mode: "insensitive" },
                          },
                          {
                            firstName: { contains: word, mode: "insensitive" },
                          },
                          {
                            lastName: { contains: word, mode: "insensitive" },
                          },
                          {
                            legalName: { contains: word, mode: "insensitive" },
                          },
                        ],
                      })),
                  },
                },
              },
            },
          ]
        : [];
      const rows = await transaction.instruction.findMany({
        where: {
          workspaceId: actor.workspaceId,
          ...(state === "current"
            ? { endedOn: null }
            : state === "ended"
              ? { endedOn: { not: null } }
              : {}),
          ...(input.branchId ? { responsibleBranchId: input.branchId } : {}),
          ...(input.assignedMembershipId
            ? { leadMembershipId: input.assignedMembershipId }
            : {}),
          ...(input.journeyStage
            ? { journeyStage: LIST_STAGE[input.journeyStage] }
            : {}),
          ...(search.length ? { OR: search } : {}),
        },
        include: {
          property: {
            select: {
              reference: true,
              postcode: true,
              addressBuilding: true,
              addressStreet: true,
              townCity: true,
            },
          },
          responsibleBranch: { select: { id: true, name: true } },
          leadMembership: {
            select: { id: true, userIdentity: { select: NAME_SELECT } },
          },
          parties: {
            where: { isMainContact: true, removedAt: null },
            select: { contactId: true },
            take: 1,
          },
          termsVersions: {
            select: {
              service: true,
              askingRentPence: true,
              rentPeriod: true,
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
          },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize + 1,
      });
      const visibleRows = rows.slice(0, pageSize);
      const contacts = await contactNames(
        transaction,
        actor.workspaceId,
        visibleRows.flatMap((row) =>
          row.parties.map((party) => party.contactId),
        ),
      );
      return {
        rows: visibleRows,
        contacts,
        hasNext: rows.length > pageSize,
      };
    },
  );
  if (!result) {
    return empty;
  }
  return {
    page,
    hasPrevious: page > 1,
    hasNext: result.hasNext,
    items: result.rows.map((row): InstructionListItem => {
      const terms = row.termsVersions[0] ?? null;
      const mainParty = row.parties[0] ?? null;
      return {
        id: row.id,
        reference: row.reference,
        instructedOn: day(row.instructedOn),
        journeyStage: lower<JourneyStageCode>(row.journeyStage),
        current: row.endedOn === null,
        property: {
          reference: row.property.reference,
          addressLine: addressLine(row.property),
          postcode: row.property.postcode,
        },
        mainLandlord: mainParty
          ? (result.contacts.get(mainParty.contactId)?.name ?? null)
          : null,
        service: terms ? lower<LettingServiceCode>(terms.service) : null,
        askingRentPence: terms?.askingRentPence ?? null,
        rentPeriod: terms?.rentPeriod
          ? lower<RentPeriodCode>(terms.rentPeriod)
          : null,
        branch: row.responsibleBranch,
        leadStaff: row.leadMembership
          ? {
              membershipId: row.leadMembership.id,
              name: staffName(row.leadMembership.userIdentity),
            }
          : null,
      };
    }),
  };
}

/** A property's instructions, current first, then ended ones newest first. */
export async function listInstructionsForProperty(
  input: EnquiryActorInput & { propertyId: string },
): Promise<InstructionSummary[]> {
  if (!isUuid(input.propertyId)) return [];
  const result = await withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor || !hasPermission(actor.roles, "instruction.read")) return [];
      const rows = await transaction.instruction.findMany({
        where: { workspaceId: actor.workspaceId, propertyId: input.propertyId },
        include: {
          parties: { where: { isMainContact: true, removedAt: null } },
          termsVersions: {
            select: { service: true },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
          },
        },
      });
      const contacts = await contactNames(
        transaction,
        actor.workspaceId,
        rows.flatMap((row) => row.parties.map((party) => party.contactId)),
      );
      return rows
        .sort(
          (a, b) =>
            Number(a.endedOn !== null) - Number(b.endedOn !== null) ||
            b.instructedOn.getTime() - a.instructedOn.getTime() ||
            b.createdAt.getTime() - a.createdAt.getTime(),
        )
        .map((row): InstructionSummary => ({
          id: row.id,
          reference: row.reference,
          instructedOn: day(row.instructedOn),
          journeyStage: lower<JourneyStageCode>(row.journeyStage),
          current: row.endedOn === null,
          endedOn: row.endedOn ? day(row.endedOn) : null,
          endedReason: row.endedReason,
          mainContact: row.parties[0]
            ? (contacts.get(row.parties[0].contactId)?.name ?? null)
            : null,
          service: row.termsVersions[0]
            ? lower<LettingServiceCode>(row.termsVersions[0].service)
            : null,
        }));
    },
  );
  return result ?? [];
}

/** The instruction made from a landlord lead, if there is one. */
export async function findInstructionForEnquiry(
  input: EnquiryActorInput & { enquiryId: string },
): Promise<{ id: string; reference: string; current: boolean } | null> {
  if (!isUuid(input.enquiryId)) return null;
  return withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor || !hasPermission(actor.roles, "instruction.read")) {
        return null;
      }
      const row = await transaction.instruction.findFirst({
        where: { workspaceId: actor.workspaceId, enquiryId: input.enquiryId },
        select: { id: true, reference: true, endedOn: true },
      });
      return (
        row && {
          id: row.id,
          reference: row.reference,
          current: row.endedOn === null,
        }
      );
    },
  );
}

export type StartInstructionReview = {
  enquiry: {
    id: string;
    reference: string;
    name: string;
    stage: EnquiryStageCode;
  };
  property: { id: string; reference: string; addressLine: string };
  branch: { id: string; name: string };
  /** The lead's linked landlord, suggested as the main contact. */
  landlord: { id: string; reference: string; name: string };
  /** The property's current owners, suggested as instruction landlords. */
  owners: { id: string; reference: string; name: string; isLead: boolean }[];
  leadStaff: { membershipId: string; name: string } | null;
  appraisalId: string | null;
  /** From the completed appraisal, for review. All may be empty. */
  suggestedTerms: {
    service: LettingServiceCode | null;
    askingRentPence: number | null;
    rentPeriod: RentPeriodCode | null;
    feeKind: "percentage" | "fixed" | null;
    feeValue: number | null;
    feeVat: FeeVatCode | null;
  };
  /** Set when the property already has a current instruction to open instead. */
  existingInstruction: { id: string; reference: string } | null;
  /** The lead is not ready: say why. */
  blocker: "not_completed" | "already_won" | "no_records" | null;
};

/**
 * What the Start instruction review page shows, pre-filled from the lead.
 * Nothing is written. Null if the lead is not visible or the role may not
 * start instructions.
 */
export async function getStartInstructionReview(
  input: EnquiryActorInput & { enquiryId: string },
): Promise<StartInstructionReview | null> {
  if (!isUuid(input.enquiryId)) return null;
  return withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (
        !actor ||
        !hasPermission(actor.roles, "instruction.manage") ||
        !hasPermission(actor.roles, "enquiry.read")
      ) {
        return null;
      }
      const lead = await transaction.enquiry.findFirst({
        where: { id: input.enquiryId, workspaceId: actor.workspaceId },
        include: {
          contact: { select: CONTACT_SELECT },
          property: {
            select: {
              id: true,
              reference: true,
              addressBuilding: true,
              addressStreet: true,
              townCity: true,
              responsibleBranch: { select: { id: true, name: true } },
              ownerships: {
                where: { endedAt: null },
                include: { contact: { select: CONTACT_SELECT } },
                orderBy: [{ isLead: "desc" }, { createdAt: "asc" }],
              },
            },
          },
          leadMembership: {
            select: { id: true, userIdentity: { select: NAME_SELECT } },
          },
          appraisals: {
            where: { status: AppraisalStatus.COMPLETED },
            orderBy: [{ completedAt: "desc" }, { id: "desc" }],
            take: 1,
          },
          instruction: { select: { id: true, reference: true } },
        },
      });
      if (!lead || !lead.contact || !lead.property) {
        return null;
      }
      const stage = stageCode(lead.stage);
      const current = await transaction.instruction.findFirst({
        where: {
          workspaceId: actor.workspaceId,
          propertyId: lead.property.id,
          endedOn: null,
        },
        select: { id: true, reference: true },
      });
      const appraisal = lead.appraisals[0] ?? null;
      return {
        enquiry: {
          id: lead.id,
          reference: lead.reference,
          name: lead.enquirerName,
          stage,
        },
        property: {
          id: lead.property.id,
          reference: lead.property.reference,
          addressLine: addressLine(lead.property),
        },
        branch: lead.property.responsibleBranch,
        landlord: {
          id: lead.contact.id,
          reference: lead.contact.reference,
          name: contactDisplayName(lead.contact),
        },
        owners: lead.property.ownerships.map((ownership) => ({
          id: ownership.contact.id,
          reference: ownership.contact.reference,
          name: contactDisplayName(ownership.contact),
          isLead: ownership.isLead,
        })),
        leadStaff: lead.leadMembership
          ? {
              membershipId: lead.leadMembership.id,
              name: staffName(lead.leadMembership.userIdentity),
            }
          : null,
        appraisalId: appraisal?.id ?? null,
        suggestedTerms: {
          service: appraisal?.recommendedService
            ? lower<LettingServiceCode>(appraisal.recommendedService)
            : null,
          askingRentPence: appraisal?.expectedMonthlyRentPence ?? null,
          rentPeriod: appraisal?.expectedMonthlyRentPence ? "month" : null,
          feeKind: appraisal?.feeKind
            ? lower<"percentage" | "fixed">(appraisal.feeKind)
            : null,
          feeValue: appraisal?.feeValue ?? null,
          feeVat: appraisal?.feeVat
            ? lower<FeeVatCode>(appraisal.feeVat)
            : null,
        },
        existingInstruction: current,
        blocker: lead.instruction
          ? "already_won"
          : stage !== "appraisal_completed"
            ? "not_completed"
            : null,
      };
    },
  );
}
