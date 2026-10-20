import "server-only";

import { hasPermission } from "@/core/access/domain/role";
import { hasBranchAccess } from "@/core/access/domain/scope";
import {
  AppraisalStatus,
  DepositOffering,
  EnquiryTaskStatus,
  FeeFrequency,
  FeeKind,
  FeeVatTreatment,
  DocumentStatus,
  InstructionAgreementState,
  InstructionAgreementStatus,
  InstructionExceptionKind,
  InstructionJourneyStage,
  InstructionOwnershipCheckStatus,
  LettingServiceType,
  RentPeriod,
} from "@/core/db/generated/enums";
import {
  changeEnquiryStageInTransaction,
  stageCode,
} from "@/core/enquiries/application/enquiries";
import {
  canAssignEnquiryWork,
  EnquiryRollback,
  enquiryAudit,
  lockEnquiry,
  withEnquiryActor,
  type EnquiryActor,
  type EnquiryActorInput,
  type EnquiryFailure,
  type EnquiryTransaction,
  type EnquiryWriteError,
} from "@/core/enquiries/application/enquiry-shared";
import { canWinFrom, ukToday } from "@/core/enquiries/domain/enquiry";
import type { DocumentStore } from "@/core/documents/application/document-store";
import type { AttachDocument } from "@/core/documents/application/documents";
import { documentObjectKey } from "@/core/documents/domain/document-file";
import { isUuid } from "@/core/properties/domain/ids";
import {
  agreementNeedsReason,
  createInstructionReference,
  isApprovableExceptionKind,
  isRecordableAgreementStatus,
  isOwnershipCheckStatus,
  ownershipCheckNeedsReason,
  sameTerms,
  validateEndedOn,
  validateInstructionReason,
  validatePastDate,
  validateTerms,
  INSTRUCTION_LIMITS,
  type AgreementStatusCode,
  type ExceptionKindCode,
  type JourneyStageCode,
  type OwnershipCheckStatusCode,
  type TermsInput,
  type ValidTerms,
} from "../domain/instruction";
import {
  currentChecklist,
  loadInstructionRow,
  type LoadedInstruction,
} from "./instruction-records";

const upper = <T>(value: string) => value.toUpperCase() as T;

const STAGE: Record<JourneyStageCode, InstructionJourneyStage> = {
  onboarding: InstructionJourneyStage.ONBOARDING,
  ready_to_market: InstructionJourneyStage.READY_TO_MARKET,
  withdrawn: InstructionJourneyStage.WITHDRAWN,
};
const stageOf = (row: LoadedInstruction): JourneyStageCode =>
  row.journeyStage.toLowerCase() as JourneyStageCode;

const MAX_PARTIES = 10;

async function deny(
  transaction: EnquiryTransaction,
  actor: EnquiryActor,
  action: string,
  error: EnquiryWriteError,
  targetId?: string,
  metadata?: Record<string, string | string[]>,
): Promise<EnquiryFailure> {
  await enquiryAudit(transaction, actor, {
    action,
    outcome: "DENIED",
    targetType: "instruction",
    targetId,
    metadata: { reason: error, ...metadata },
  });
  return { ok: false, error };
}

/** Adds a terms version (and its charges) as the next whole set of terms. */
async function saveTerms(
  transaction: EnquiryTransaction,
  actor: EnquiryActor,
  instructionId: string,
  terms: ValidTerms,
  changeReason: string | null,
) {
  const version = await transaction.instructionTermsVersion.create({
    data: {
      workspaceId: actor.workspaceId,
      instructionId,
      service: upper<LettingServiceType>(terms.service),
      askingRentPence: terms.askingRentPence,
      rentPeriod: terms.rentPeriod && upper<RentPeriod>(terms.rentPeriod),
      feeKind: terms.feeKind && upper<FeeKind>(terms.feeKind),
      feeValue: terms.feeValue,
      feeFrequency:
        terms.feeFrequency && upper<FeeFrequency>(terms.feeFrequency),
      feeVat: terms.feeVat && upper<FeeVatTreatment>(terms.feeVat),
      depositOffering:
        terms.depositOffering && upper<DepositOffering>(terms.depositOffering),
      depositPence: terms.depositPence,
      holdingDepositPence: terms.holdingDepositPence,
      changeReason,
      createdByMembershipId: actor.membershipId,
    },
    select: { id: true },
  });
  for (const charge of terms.charges) {
    await transaction.instructionTermsCharge.create({
      data: {
        workspaceId: actor.workspaceId,
        termsVersionId: version.id,
        name: charge.name,
        amountPence: charge.amountPence,
        vat: upper<FeeVatTreatment>(charge.vat),
      },
    });
  }
}

/** Records a journey change and moves the instruction, as one step. */
async function moveJourney(
  transaction: EnquiryTransaction,
  actor: EnquiryActor,
  row: { id: string; journeyStage: InstructionJourneyStage },
  to: JourneyStageCode,
  reason: string | null,
  extra: { endedOn?: Date; endedReason?: string } = {},
) {
  await transaction.instructionJourneyHistory.create({
    data: {
      workspaceId: actor.workspaceId,
      instructionId: row.id,
      fromStage: row.journeyStage,
      toStage: STAGE[to],
      reason,
      changedByMembershipId: actor.membershipId,
    },
  });
  await transaction.instruction.update({
    where: { id: row.id, workspaceId: actor.workspaceId },
    data: { journeyStage: STAGE[to], ...extra },
  });
}

/**
 * After a change: a property that is Ready to market stays so only while the
 * checklist is complete. If the change broke it, the person is warned first
 * (nothing is saved); once they confirm, the change and the return to
 * Onboarding are saved together with the reason. A fee or landlord change
 * that the signed agreement no longer covers is named as such (C2).
 */
async function settleReadiness(
  transaction: EnquiryTransaction,
  actor: EnquiryActor,
  instructionId: string,
  confirm: boolean | undefined,
  reason: string,
) {
  const state = await currentChecklist(
    transaction,
    actor.workspaceId,
    instructionId,
  );
  if (!state) throw new EnquiryRollback("instruction_not_found");
  if (
    state.row.journeyStage !== InstructionJourneyStage.READY_TO_MARKET ||
    state.complete
  ) {
    return;
  }
  if (!confirm) throw new EnquiryRollback("readiness_would_lapse");
  const agreementLapsed = state.items.some(
    (item) => item.code === "agreement" && !item.met,
  );
  await moveJourney(
    transaction,
    actor,
    state.row,
    "onboarding",
    (agreementLapsed ? `Agreement update required. ${reason}` : reason).slice(
      0,
      INSTRUCTION_LIMITS.reason,
    ),
  );
}

type ChangeOptions = {
  /** The permission needed; ordinary instruction work by default. */
  permission?: "instruction.manage" | "instruction.exception";
};

/**
 * Shared shape of every change to an existing instruction: check the
 * permission and the id, lock and load the instruction, refuse an ended one,
 * run the change, and audit it.
 */
function changeInstruction<
  T extends { ok: true; audit?: Record<string, string> },
>(
  input: EnquiryActorInput & { instructionId: string },
  action: string,
  options: ChangeOptions,
  change: (
    transaction: EnquiryTransaction,
    actor: EnquiryActor,
    row: LoadedInstruction,
  ) => Promise<T | EnquiryFailure>,
) {
  return withEnquiryActor(input, async (transaction, actor) => {
    const id = input.instructionId;
    if (
      !hasPermission(actor.roles, options.permission ?? "instruction.manage")
    ) {
      return deny(transaction, actor, action, "access_denied", id);
    }
    if (!isUuid(id)) {
      return deny(transaction, actor, action, "invalid_input");
    }
    // Changes to one instruction run one after the other.
    await transaction.$queryRaw`
      SELECT "id" FROM "instructions"
      WHERE "id" = ${id}::uuid AND "workspace_id" = ${actor.workspaceId}::uuid
      FOR UPDATE
    `;
    const row = await loadInstructionRow(transaction, actor.workspaceId, id);
    if (!row)
      return { ok: false as const, error: "instruction_not_found" as const };
    if (row.endedOn !== null) {
      return deny(transaction, actor, action, "invalid_state", id);
    }
    const result = await change(transaction, actor, row);
    if (!result.ok) return result;
    await enquiryAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetType: "instruction",
      targetId: id,
      metadata: result.audit,
    });
    return result;
  });
}

const saved = (instructionId: string) => ({
  ok: true as const,
  instructionId,
});

export type StartInstructionInput = EnquiryActorInput & {
  enquiryId: string;
  /** Defaults to today (UK time). */
  instructedOn?: string | null;
  leadMembershipId?: string | null;
  appraisalId?: string | null;
  /** The instruction's landlords; exactly one is the main contact. */
  parties: { contactId: string; isMain: boolean }[];
  terms: TermsInput;
};

/**
 * The reviewed handover, in one step: the lead is marked Instruction won, its
 * open work is closed, and the instruction is created with its landlords and
 * first terms. It all succeeds or fails together, so a won lead is never left
 * without its instruction. The lead and appraisal stay as history.
 */
export function startInstruction(input: StartInstructionInput) {
  const action = "instruction.start";
  return withEnquiryActor(input, async (transaction, actor) => {
    if (
      !hasPermission(actor.roles, "instruction.manage") ||
      !hasPermission(actor.roles, "enquiry.update")
    ) {
      return deny(transaction, actor, action, "access_denied", input.enquiryId);
    }
    const instructedOn = validatePastDate(input.instructedOn || ukToday());
    const terms = validateTerms(input.terms);
    const contactIds = input.parties.map((party) => party.contactId);
    if (
      !isUuid(input.enquiryId) ||
      !instructedOn.ok ||
      !terms.ok ||
      (input.leadMembershipId != null && !isUuid(input.leadMembershipId)) ||
      (input.appraisalId != null && !isUuid(input.appraisalId)) ||
      input.parties.length < 1 ||
      input.parties.length > MAX_PARTIES ||
      !contactIds.every(isUuid) ||
      new Set(contactIds).size !== contactIds.length ||
      input.parties.filter((party) => party.isMain).length !== 1
    ) {
      return deny(transaction, actor, action, "invalid_input", input.enquiryId);
    }

    await lockEnquiry(transaction, actor, input.enquiryId);
    const enquiry = await transaction.enquiry.findFirst({
      where: { id: input.enquiryId, workspaceId: actor.workspaceId },
      select: { id: true, stage: true, contactId: true, propertyId: true },
    });
    if (!enquiry) {
      return { ok: false as const, error: "enquiry_not_found" as const };
    }
    if (
      !canWinFrom(stageCode(enquiry.stage)) ||
      !enquiry.contactId ||
      !enquiry.propertyId
    ) {
      return deny(transaction, actor, action, "invalid_state", enquiry.id);
    }

    const property = await transaction.property.findFirst({
      where: {
        id: enquiry.propertyId,
        workspaceId: actor.workspaceId,
        status: "ACTIVE",
      },
      select: {
        id: true,
        responsibleBranchId: true,
        currentInstructionCount: true,
      },
    });
    if (!property) {
      return deny(transaction, actor, action, "property_not_found", enquiry.id);
    }
    // One current instruction per property: open that one instead.
    if (property.currentInstructionCount > 0) {
      return deny(transaction, actor, action, "instruction_exists", enquiry.id);
    }
    if (!hasBranchAccess(actor.scope, property.responsibleBranchId)) {
      return deny(transaction, actor, action, "access_denied", enquiry.id);
    }

    if (
      input.leadMembershipId &&
      !(await canAssignEnquiryWork(
        transaction,
        actor,
        input.leadMembershipId,
        property.responsibleBranchId,
        "instruction.manage",
      ))
    ) {
      return deny(transaction, actor, action, "invalid_input", enquiry.id);
    }
    const contacts = await transaction.contact.count({
      where: {
        workspaceId: actor.workspaceId,
        id: { in: contactIds },
        status: "ACTIVE",
      },
    });
    if (contacts !== contactIds.length) {
      return deny(transaction, actor, action, "contact_not_found", enquiry.id);
    }
    if (input.appraisalId) {
      const appraisal = await transaction.appraisal.findFirst({
        where: {
          id: input.appraisalId,
          enquiryId: enquiry.id,
          workspaceId: actor.workspaceId,
          status: AppraisalStatus.COMPLETED,
        },
        select: { id: true },
      });
      if (!appraisal) {
        return deny(
          transaction,
          actor,
          action,
          "appraisal_not_found",
          enquiry.id,
        );
      }
    }

    // The lead is won and its open work closed, as for any outcome.
    await transaction.enquiryTask.updateMany({
      where: {
        workspaceId: actor.workspaceId,
        enquiryId: enquiry.id,
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
      "won",
      null,
    );

    const instruction = await transaction.instruction.create({
      data: {
        workspaceId: actor.workspaceId,
        reference: createInstructionReference(),
        propertyId: property.id,
        enquiryId: enquiry.id,
        appraisalId: input.appraisalId ?? null,
        responsibleBranchId: property.responsibleBranchId,
        leadMembershipId: input.leadMembershipId ?? null,
        instructedOn: instructedOn.date,
        createdByMembershipId: actor.membershipId,
      },
      select: { id: true },
    });
    for (const party of input.parties) {
      await transaction.instructionParty.create({
        data: {
          workspaceId: actor.workspaceId,
          instructionId: instruction.id,
          contactId: party.contactId,
          isMainContact: party.isMain,
          addedByMembershipId: actor.membershipId,
        },
      });
    }
    await saveTerms(transaction, actor, instruction.id, terms.data, null);

    await enquiryAudit(transaction, actor, {
      action,
      outcome: "SUCCEEDED",
      targetType: "instruction",
      targetId: instruction.id,
      metadata: { enquiryId: enquiry.id },
    });
    return saved(instruction.id);
  });
}

function validTermsOf(row: LoadedInstruction): ValidTerms | null {
  const latest = row.termsVersions[0];
  if (!latest) return null;
  const lower = <T extends string>(value: string | null) =>
    (value === null ? null : value.toLowerCase()) as T | null;
  return {
    service: latest.service.toLowerCase() as ValidTerms["service"],
    askingRentPence: latest.askingRentPence,
    rentPeriod: lower(latest.rentPeriod),
    feeKind: lower(latest.feeKind),
    feeValue: latest.feeValue,
    feeFrequency: lower(latest.feeFrequency),
    feeVat: lower(latest.feeVat),
    depositOffering: lower(latest.depositOffering),
    depositPence: latest.depositPence,
    holdingDepositPence: latest.holdingDepositPence,
    charges: latest.charges
      .map((charge) => ({
        name: charge.name,
        amountPence: charge.amountPence,
        vat: charge.vat.toLowerCase() as ValidTerms["charges"][number]["vat"],
      }))
      .sort(
        (a, b) => a.name.localeCompare(b.name) || a.amountPence - b.amountPence,
      ),
  };
}

/**
 * Saves a complete new set of terms (the current ones stay in the history).
 * A reason is required. If the instruction is Ready to market and the new
 * terms would leave the checklist incomplete, the change is refused with
 * `readiness_would_lapse` until `confirmReturnToOnboarding` is set.
 */
export function replaceInstructionTerms(
  input: EnquiryActorInput & {
    instructionId: string;
    terms: TermsInput;
    reason: string;
    confirmReturnToOnboarding?: boolean;
  },
) {
  return changeInstruction(
    input,
    "instruction.terms.change",
    {},
    async (transaction, actor, row) => {
      const terms = validateTerms(input.terms);
      const reason = validateInstructionReason(input.reason);
      const current = validTermsOf(row);
      if (
        !terms.ok ||
        !reason.ok ||
        (current && sameTerms(current, normalisedCharges(terms.data)))
      ) {
        return deny(
          transaction,
          actor,
          "instruction.terms.change",
          "invalid_input",
          row.id,
        );
      }
      await saveTerms(transaction, actor, row.id, terms.data, reason.reason);
      await settleReadiness(
        transaction,
        actor,
        row.id,
        input.confirmReturnToOnboarding,
        `Terms changed: ${reason.reason}`,
      );
      return saved(row.id);
    },
  );
}

function normalisedCharges(terms: ValidTerms): ValidTerms {
  return {
    ...terms,
    charges: [...terms.charges].sort(
      (a, b) => a.name.localeCompare(b.name) || a.amountPence - b.amountPence,
    ),
  };
}

/** Sets or clears the lead staff member. Clearing needs the usual readiness confirmation. */
export function setInstructionLeadStaff(
  input: EnquiryActorInput & {
    instructionId: string;
    membershipId: string | null;
    confirmReturnToOnboarding?: boolean;
  },
) {
  return changeInstruction(
    input,
    "instruction.lead.change",
    {},
    async (transaction, actor, row) => {
      const valid =
        input.membershipId === null ||
        (isUuid(input.membershipId) &&
          input.membershipId !== row.leadMembershipId &&
          (await canAssignEnquiryWork(
            transaction,
            actor,
            input.membershipId,
            row.responsibleBranchId,
            "instruction.manage",
          )));
      if (!valid || (input.membershipId === null && !row.leadMembershipId)) {
        return deny(
          transaction,
          actor,
          "instruction.lead.change",
          "invalid_input",
          row.id,
        );
      }
      await transaction.instruction.update({
        where: { id: row.id, workspaceId: actor.workspaceId },
        data: { leadMembershipId: input.membershipId },
      });
      await settleReadiness(
        transaction,
        actor,
        row.id,
        input.confirmReturnToOnboarding,
        "The lead staff member was removed",
      );
      return saved(row.id);
    },
  );
}

/** Adds a landlord to the instruction, optionally as the main contact. */
export function addInstructionParty(
  input: EnquiryActorInput & {
    instructionId: string;
    contactId: string;
    makeMain?: boolean;
    confirmReturnToOnboarding?: boolean;
  },
) {
  return changeInstruction(
    input,
    "instruction.party.add",
    {},
    async (transaction, actor, row) => {
      const current = row.parties.filter((party) => party.removedAt === null);
      if (
        !isUuid(input.contactId) ||
        current.length >= MAX_PARTIES ||
        current.some((party) => party.contactId === input.contactId)
      ) {
        return deny(
          transaction,
          actor,
          "instruction.party.add",
          "invalid_input",
          row.id,
        );
      }
      const contact = await transaction.contact.findFirst({
        where: {
          id: input.contactId,
          workspaceId: actor.workspaceId,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      if (!contact) {
        return deny(
          transaction,
          actor,
          "instruction.party.add",
          "contact_not_found",
          row.id,
        );
      }
      if (input.makeMain) {
        await transaction.instructionParty.updateMany({
          where: {
            workspaceId: actor.workspaceId,
            instructionId: row.id,
            isMainContact: true,
            removedAt: null,
          },
          data: { isMainContact: false },
        });
      }
      await transaction.instructionParty.create({
        data: {
          workspaceId: actor.workspaceId,
          instructionId: row.id,
          contactId: input.contactId,
          isMainContact: Boolean(input.makeMain),
          addedByMembershipId: actor.membershipId,
        },
      });
      // A new landlord is not covered by the signed agreement (C2).
      await settleReadiness(
        transaction,
        actor,
        row.id,
        input.confirmReturnToOnboarding,
        "Landlord added",
      );
      return saved(row.id);
    },
  );
}

/** Makes another current landlord the main contact. */
export function changeInstructionMainContact(
  input: EnquiryActorInput & { instructionId: string; partyId: string },
) {
  return changeInstruction(
    input,
    "instruction.party.main",
    {},
    async (transaction, actor, row) => {
      const target = row.parties.find(
        (party) =>
          party.id === input.partyId &&
          party.removedAt === null &&
          !party.isMainContact,
      );
      if (!target) {
        return deny(
          transaction,
          actor,
          "instruction.party.main",
          "party_not_found",
          row.id,
        );
      }
      await transaction.instructionParty.updateMany({
        where: {
          workspaceId: actor.workspaceId,
          instructionId: row.id,
          isMainContact: true,
          removedAt: null,
        },
        data: { isMainContact: false },
      });
      await transaction.instructionParty.update({
        where: { id: target.id, workspaceId: actor.workspaceId },
        data: { isMainContact: true },
      });
      return saved(row.id);
    },
  );
}

/**
 * Removes a landlord with a reason; the row is kept. The main contact can be
 * removed only by naming another current landlord to take over.
 */
export function removeInstructionParty(
  input: EnquiryActorInput & {
    instructionId: string;
    partyId: string;
    reason: string;
    newMainPartyId?: string | null;
    confirmReturnToOnboarding?: boolean;
  },
) {
  return changeInstruction(
    input,
    "instruction.party.remove",
    {},
    async (transaction, actor, row) => {
      const reason = validateInstructionReason(input.reason);
      const target = row.parties.find(
        (party) => party.id === input.partyId && party.removedAt === null,
      );
      if (!target) {
        return deny(
          transaction,
          actor,
          "instruction.party.remove",
          "party_not_found",
          row.id,
        );
      }
      const successor = input.newMainPartyId
        ? row.parties.find(
            (party) =>
              party.id === input.newMainPartyId &&
              party.removedAt === null &&
              party.id !== target.id,
          )
        : undefined;
      if (!reason.ok || (target.isMainContact && !successor)) {
        return deny(
          transaction,
          actor,
          "instruction.party.remove",
          "invalid_input",
          row.id,
        );
      }
      await transaction.instructionParty.update({
        where: { id: target.id, workspaceId: actor.workspaceId },
        data: { isMainContact: false, removedReason: reason.reason },
      });
      if (target.isMainContact && successor) {
        await transaction.instructionParty.update({
          where: { id: successor.id, workspaceId: actor.workspaceId },
          data: { isMainContact: true },
        });
      }
      // The signed agreement covered this landlord (C2).
      await settleReadiness(
        transaction,
        actor,
        row.id,
        input.confirmReturnToOnboarding,
        `Landlord removed: ${reason.reason}`,
      );
      return saved(row.id);
    },
  );
}

/**
 * Records a step in preparing the agreement: Prepared or Sent. Signed comes
 * only from a completed agreement upload (C2), so these steps never change
 * the checklist. Repeating a step or moving back is a correction and needs a
 * reason.
 */
export function recordInstructionAgreement(
  input: EnquiryActorInput & {
    instructionId: string;
    status: string;
    reason?: string | null;
  },
) {
  const action = "instruction.agreement.record";
  return changeInstruction(
    input,
    action,
    {},
    async (transaction, actor, row) => {
      const status = isRecordableAgreementStatus(input.status)
        ? (input.status as AgreementStatusCode)
        : null;
      const current = row.agreementEvents[0]
        ? (row.agreementEvents[0].toStatus.toLowerCase() as AgreementStatusCode)
        : null;
      const reason = input.reason?.trim()
        ? validateInstructionReason(input.reason)
        : null;
      if (
        !status ||
        (reason && !reason.ok) ||
        (agreementNeedsReason(current, status) && !reason)
      ) {
        return deny(transaction, actor, action, "invalid_input", row.id);
      }
      await transaction.instructionAgreementEvent.create({
        data: {
          workspaceId: actor.workspaceId,
          instructionId: row.id,
          toStatus: upper<InstructionAgreementStatus>(status),
          reason: reason?.ok ? reason.reason : null,
          recordedByMembershipId: actor.membershipId,
        },
      });
      return saved(row.id);
    },
  );
}

/**
 * The upload route's hook for an agreement PDF (C2): in the transaction that
 * marks the file stored, it becomes the instruction's draft agreement. The
 * database records the terms, fees and landlords it covers, so this inserts
 * only the links. A second draft on the instruction is refused, which fails
 * the upload and deletes its file.
 */
export function attachAgreementDraft(instructionId: string): AttachDocument {
  return async (transaction, actor, documentId) => {
    await transaction.$executeRaw`
      INSERT INTO "instruction_agreements" ("workspace_id", "instruction_id",
        "document_id", "created_by_membership_id")
      VALUES (${actor.workspaceId}::uuid, ${instructionId}::uuid,
        ${documentId}::uuid, ${actor.membershipId}::uuid)
    `;
  };
}

/** The instruction's draft agreement for this uploaded file, if any. */
function draftFor(row: LoadedInstruction, documentId: string) {
  return (
    row.agreements.find(
      (item) =>
        item.documentId === documentId &&
        item.state === InstructionAgreementState.DRAFT,
    ) ?? null
  );
}

/**
 * Completes the draft agreement for an uploaded PDF (C2): the person confirms
 * every listed landlord has signed and enters the signed date shown on the
 * document. Refused if the fees or landlords changed since the upload; a
 * fresh copy is needed then. The database records who and when, and links
 * the agreement this one supersedes.
 */
export function completeInstructionAgreement(
  input: EnquiryActorInput & {
    instructionId: string;
    documentId: string;
    signaturesConfirmed: boolean;
    signedOn: string | null;
  },
) {
  const action = "instruction.agreement.complete";
  return changeInstruction(
    input,
    action,
    {},
    async (transaction, actor, row) => {
      const draft = isUuid(input.documentId)
        ? draftFor(row, input.documentId)
        : null;
      if (!draft) {
        return deny(transaction, actor, action, "agreement_not_found", row.id);
      }
      const signedOn = validatePastDate(input.signedOn);
      if (input.signaturesConfirmed !== true || !signedOn.ok) {
        return deny(transaction, actor, action, "invalid_input", row.id);
      }
      if (draft.materialFingerprint !== row.currentFingerprint) {
        return deny(transaction, actor, action, "agreement_outdated", row.id);
      }
      await transaction.instructionAgreement.update({
        where: { id: draft.id, workspaceId: actor.workspaceId },
        data: {
          state: InstructionAgreementState.COMPLETED,
          signedOn: signedOn.date,
        },
      });
      return {
        ...saved(row.id),
        audit: { agreementId: draft.id, documentId: draft.documentId },
      };
    },
  );
}

/**
 * Discards a draft agreement with a reason (C2). The draft and its file are
 * marked first and committed; the file is deleted afterwards, so a record
 * never loses a file it still needs. A completed agreement cannot be
 * discarded.
 */
export async function discardInstructionAgreementDraft(
  input: EnquiryActorInput & {
    instructionId: string;
    documentId: string;
    reason: string;
    store: DocumentStore;
  },
) {
  const action = "instruction.agreement.discard";
  const result = await changeInstruction(
    input,
    action,
    {},
    async (transaction, actor, row) => {
      const draft = isUuid(input.documentId)
        ? draftFor(row, input.documentId)
        : null;
      if (!draft) {
        return deny(transaction, actor, action, "agreement_not_found", row.id);
      }
      const reason = validateInstructionReason(input.reason);
      if (!reason.ok) {
        return deny(transaction, actor, action, "invalid_input", row.id);
      }
      await transaction.instructionAgreement.update({
        where: { id: draft.id, workspaceId: actor.workspaceId },
        data: {
          state: InstructionAgreementState.DISCARDED,
          discardReason: reason.reason,
        },
      });
      await transaction.document.update({
        where: { id: draft.documentId, workspaceId: actor.workspaceId },
        data: {
          status: DocumentStatus.REMOVED,
          removalReason: reason.reason,
          removedByMembershipId: actor.membershipId,
        },
      });
      return {
        ok: true as const,
        instructionId: row.id,
        audit: { agreementId: draft.id, documentId: draft.documentId },
        key: documentObjectKey({
          workspaceId: actor.workspaceId,
          id: draft.documentId,
          media: "pdf",
        }),
      };
    },
  );
  if (!result.ok) return result;
  await input.store.remove([result.key]);
  return saved(result.instructionId);
}

/**
 * Records the agency's ownership check: In progress, Verified or Not
 * verified. Zayto records the agency's conclusion; it does not decide whether
 * evidence is legally sufficient. Any change after a result is a correction
 * and needs a reason, and Not verified always does.
 */
export function recordInstructionOwnershipCheck(
  input: EnquiryActorInput & {
    instructionId: string;
    status: string;
    checkedOn?: string | null;
    method?: string | null;
    notes?: string | null;
    reason?: string | null;
    confirmReturnToOnboarding?: boolean;
  },
) {
  const action = "instruction.ownership_check.record";
  return changeInstruction(
    input,
    action,
    {},
    async (transaction, actor, row) => {
      const status = isOwnershipCheckStatus(input.status)
        ? (input.status as OwnershipCheckStatusCode)
        : null;
      const current = row.ownershipChecks[0]
        ? (row.ownershipChecks[0].status.toLowerCase() as OwnershipCheckStatusCode)
        : null;
      const method = input.method?.trim() || null;
      const notes = input.notes?.trim() || null;
      const checkedOn = input.checkedOn?.trim()
        ? validatePastDate(input.checkedOn)
        : null;
      const reason = input.reason?.trim()
        ? validateInstructionReason(input.reason)
        : null;
      const isResult = status === "verified" || status === "not_verified";
      if (
        !status ||
        (checkedOn && !checkedOn.ok) ||
        (method && method.length > INSTRUCTION_LIMITS.method) ||
        (notes && notes.length > INSTRUCTION_LIMITS.notes) ||
        (reason && !reason.ok) ||
        (isResult && (!checkedOn || !method)) ||
        (ownershipCheckNeedsReason(current, status) && !reason)
      ) {
        return deny(transaction, actor, action, "invalid_input", row.id);
      }
      await transaction.instructionOwnershipCheck.create({
        data: {
          workspaceId: actor.workspaceId,
          instructionId: row.id,
          status: upper<InstructionOwnershipCheckStatus>(status),
          checkedOn: checkedOn?.ok ? checkedOn.date : null,
          method,
          notes,
          reason: reason?.ok ? reason.reason : null,
          recordedByMembershipId: actor.membershipId,
        },
      });
      await settleReadiness(
        transaction,
        actor,
        row.id,
        input.confirmReturnToOnboarding,
        `Ownership check changed${reason?.ok ? `: ${reason.reason}` : ""}`,
      );
      return saved(row.id);
    },
  );
}

/**
 * A manager's reasoned exception for the ownership check (never for anything
 * else; the signed agreement cannot be excepted since C2). Permanent in this
 * slice.
 */
export function approveInstructionException(
  input: EnquiryActorInput & {
    instructionId: string;
    kind: string;
    reason: string;
  },
) {
  const action = "instruction.exception.approve";
  return changeInstruction(
    input,
    action,
    { permission: "instruction.exception" },
    async (transaction, actor, row) => {
      const reason = validateInstructionReason(input.reason);
      if (!isApprovableExceptionKind(input.kind) || !reason.ok) {
        return deny(transaction, actor, action, "invalid_input", row.id);
      }
      const kind = input.kind as ExceptionKindCode;
      if (row.exceptions.some((item) => item.kind.toLowerCase() === kind)) {
        return deny(transaction, actor, action, "invalid_state", row.id);
      }
      await transaction.instructionException.create({
        data: {
          workspaceId: actor.workspaceId,
          instructionId: row.id,
          kind: upper<InstructionExceptionKind>(kind),
          reason: reason.reason,
          approvedByMembershipId: actor.membershipId,
        },
      });
      return saved(row.id);
    },
  );
}

/**
 * Deliberately marks the property Ready to market, once the checklist is
 * complete. Zayto never advances it silently.
 */
export function markInstructionReadyToMarket(
  input: EnquiryActorInput & { instructionId: string },
) {
  const action = "instruction.ready";
  return changeInstruction(
    input,
    action,
    {},
    async (transaction, actor, row) => {
      if (stageOf(row) !== "onboarding") {
        return deny(transaction, actor, action, "invalid_state", row.id);
      }
      const state = await currentChecklist(
        transaction,
        actor.workspaceId,
        row.id,
      );
      if (!state?.complete) {
        return deny(
          transaction,
          actor,
          action,
          "checklist_incomplete",
          row.id,
          {
            missing: (state?.items ?? [])
              .filter((item) => !item.met)
              .map((item) => item.code),
          },
        );
      }
      await moveJourney(transaction, actor, row, "ready_to_market", null);
      return saved(row.id);
    },
  );
}

/** Moves a Ready to market property back to Onboarding, with a reason. */
export function returnInstructionToOnboarding(
  input: EnquiryActorInput & { instructionId: string; reason: string },
) {
  const action = "instruction.return_to_onboarding";
  return changeInstruction(
    input,
    action,
    {},
    async (transaction, actor, row) => {
      const reason = validateInstructionReason(input.reason);
      if (!reason.ok || stageOf(row) !== "ready_to_market") {
        return deny(transaction, actor, action, "invalid_state", row.id);
      }
      await moveJourney(transaction, actor, row, "onboarding", reason.reason);
      return saved(row.id);
    },
  );
}

/**
 * Ends the instruction with a date (today by default, or an earlier valid
 * date) and a required reason. All history is kept, routine edits stop, and
 * the property moves to Withdrawn with the same reason. A later appointment
 * creates a new instruction.
 */
export function endInstruction(
  input: EnquiryActorInput & {
    instructionId: string;
    endedOn?: string | null;
    reason: string;
  },
) {
  const action = "instruction.end";
  return changeInstruction(
    input,
    action,
    {},
    async (transaction, actor, row) => {
      const reason = validateInstructionReason(input.reason);
      const endedOn = validateEndedOn(
        input.endedOn,
        row.instructedOn.toISOString().slice(0, 10),
      );
      if (!reason.ok || !endedOn.ok) {
        return deny(transaction, actor, action, "invalid_input", row.id);
      }
      await moveJourney(transaction, actor, row, "withdrawn", reason.reason, {
        endedOn: endedOn.date,
        endedReason: reason.reason,
      });
      return saved(row.id);
    },
  );
}
