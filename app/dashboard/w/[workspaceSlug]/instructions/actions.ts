"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMfaUser } from "@/core/auth/mfa";
import {
  addInstructionParty,
  approveInstructionException,
  changeInstructionMainContact,
  endInstruction,
  markInstructionReadyToMarket,
  recordInstructionAgreement,
  recordInstructionOwnershipCheck,
  removeInstructionParty,
  replaceInstructionTerms,
  returnInstructionToOnboarding,
  setInstructionLeadStaff,
  startInstruction,
} from "@/core/instructions/application/instructions";
import {
  listInstructions,
  type InstructionListResult,
  type InstructionListState,
} from "@/core/instructions/application/instruction-records";
import {
  validateInstructionReason,
  validateTerms,
  JOURNEY_STAGES,
  type TermsErrors,
  type TermsInput,
} from "@/core/instructions/domain/instruction";
import { isUuid, SEARCH_TEXT_MAX } from "@/core/properties/domain/ids";

export type InstructionActionState = {
  status: "idle" | "error" | "saved";
  message: string;
  fieldErrors?: Partial<Record<string, string>>;
  /**
   * The change would take the property back from Ready to market. The form
   * asks the person to confirm and sends it again.
   */
  needsConfirmation?: boolean;
};

const IDLE_ERROR = (message: string): InstructionActionState => ({
  status: "error",
  message,
});

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function failureMessage(error: string) {
  switch (error) {
    case "readiness_would_lapse":
      return "This would take the property back from Ready to market to Onboarding. Confirm to save the change and return it to Onboarding.";
    case "checklist_incomplete":
      return "Ready to market needs every item on the checklist first.";
    case "instruction_exists":
      return "This property already has a current instruction. Open it instead.";
    case "invalid_state":
      return "That has already changed or can no longer be done. Refresh the page to see the latest.";
    case "invalid_input":
      return "Check the details and try again.";
    case "contact_not_found":
    case "property_not_found":
    case "party_not_found":
    case "enquiry_not_found":
    case "instruction_not_found":
    case "appraisal_not_found":
      return "That could not be found. Refresh the page and try again.";
    default:
      return "The change could not be saved. Check your access and try again.";
  }
}

function failure(error: string): InstructionActionState {
  return {
    status: "error",
    message: failureMessage(error),
    needsConfirmation: error === "readiness_would_lapse",
  };
}

/** The terms a form posts, including the repeated charge rows. */
function termsFromForm(formData: FormData): TermsInput {
  const names = formData.getAll("chargeName");
  const amounts = formData.getAll("chargeAmount");
  const vats = formData.getAll("chargeVat");
  const charges = names
    .map((name, index) => ({
      name: typeof name === "string" ? name : "",
      amount: typeof amounts[index] === "string" ? String(amounts[index]) : "",
      vat: typeof vats[index] === "string" ? String(vats[index]) : "",
    }))
    // A completely empty row is just an unused slot.
    .filter((row) => row.name.trim() || row.amount.trim());
  return {
    service: text(formData, "service"),
    askingRent: text(formData, "askingRent"),
    rentPeriod: text(formData, "rentPeriod"),
    feeKind: text(formData, "feeKind"),
    feeValue: text(formData, "feeValue"),
    feeFrequency: text(formData, "feeFrequency"),
    feeVat: text(formData, "feeVat"),
    depositOffering: text(formData, "depositOffering"),
    deposit: text(formData, "deposit"),
    holdingDeposit: text(formData, "holdingDeposit"),
    charges,
  };
}

function termsProblem(errors: TermsErrors): InstructionActionState {
  return {
    status: "error",
    message: "Check the highlighted details and try again.",
    fieldErrors: errors,
  };
}

const instructionPath = (workspaceSlug: string, instructionId: string) =>
  `/dashboard/w/${workspaceSlug}/instructions/${instructionId}`;

export type InstructionSearchState = {
  status: "ready" | "error";
  message: string;
  query: string;
  result: InstructionListResult;
};

export async function searchInstructionsAction(
  workspaceSlug: string,
  previous: InstructionSearchState,
  formData: FormData,
): Promise<InstructionSearchState> {
  const path = `/dashboard/w/${workspaceSlug}/instructions`;
  const user = await requireMfaUser(path, { workspaceSlug });
  const query = text(formData, "query").slice(0, SEARCH_TEXT_MAX);
  const branch = text(formData, "branch");
  const assigned = text(formData, "assigned");
  const requestedStage = text(formData, "stage");
  const journeyStage = JOURNEY_STAGES.find((stage) => stage === requestedStage);
  const requestedState = text(formData, "state");
  const state = ["current", "ended", "all"].find(
    (value): value is InstructionListState => value === requestedState,
  );
  const requestedPage = Number(text(formData, "page"));
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
  try {
    const result = await listInstructions({
      authSubject: user.id,
      workspaceSlug,
      query,
      branchId: isUuid(branch) ? branch : undefined,
      assignedMembershipId: isUuid(assigned) ? assigned : undefined,
      journeyStage,
      state,
      page,
    });
    return { status: "ready", message: "", query, result };
  } catch {
    return {
      ...previous,
      status: "error",
      message: "Instructions could not be searched. Try again.",
    };
  }
}

async function authenticate(workspaceSlug: string, path: string) {
  const user = await requireMfaUser(path, { workspaceSlug });
  return { authSubject: user.id, workspaceSlug };
}

function done(
  workspaceSlug: string,
  instructionId: string,
  propertyId?: string,
) {
  revalidatePath(instructionPath(workspaceSlug, instructionId));
  if (propertyId) {
    revalidatePath(`/dashboard/w/${workspaceSlug}/properties/${propertyId}`);
  }
  return {
    status: "saved",
    message: "Saved.",
  } satisfies InstructionActionState;
}

export async function startInstructionAction(
  workspaceSlug: string,
  enquiryId: string,
  _previous: InstructionActionState,
  formData: FormData,
): Promise<InstructionActionState> {
  const path = `/dashboard/w/${workspaceSlug}/enquiries/${enquiryId}/start-instruction`;
  const actor = await authenticate(workspaceSlug, path);
  const terms = termsFromForm(formData);
  const validation = validateTerms(terms);
  const partyIds = formData
    .getAll("partyId")
    .filter((value): value is string => typeof value === "string");
  const mainPartyId = text(formData, "mainPartyId");
  const leadMembershipId = text(formData, "leadMembershipId");
  const fieldErrors: Record<string, string> = validation.ok
    ? {}
    : { ...validation.errors };
  if (!partyIds.length || !partyIds.every(isUuid)) {
    fieldErrors.partyId = "Choose at least one landlord.";
  } else if (!partyIds.includes(mainPartyId)) {
    fieldErrors.mainPartyId = "Choose the main contact from the landlords.";
  }
  if (leadMembershipId && !isUuid(leadMembershipId)) {
    fieldErrors.leadMembershipId = "Choose a staff member from the list.";
  }
  if (Object.keys(fieldErrors).length) {
    return {
      status: "error",
      message: "Check the highlighted details and try again.",
      fieldErrors,
    };
  }
  const result = await startInstruction({
    ...actor,
    enquiryId,
    instructedOn: text(formData, "instructedOn") || null,
    leadMembershipId: leadMembershipId || null,
    appraisalId: text(formData, "appraisalId") || null,
    parties: partyIds.map((contactId) => ({
      contactId,
      isMain: contactId === mainPartyId,
    })),
    terms,
  });
  if (!result.ok) return failure(result.error);
  revalidatePath(`/dashboard/w/${workspaceSlug}/enquiries/${enquiryId}`);
  revalidatePath(`/dashboard/w/${workspaceSlug}/enquiries`);
  revalidatePath(`/dashboard/w/${workspaceSlug}`, "layout");
  redirect(
    `${instructionPath(workspaceSlug, result.instructionId)}?started=yes`,
  );
}

export async function replaceTermsAction(
  workspaceSlug: string,
  instructionId: string,
  _previous: InstructionActionState,
  formData: FormData,
): Promise<InstructionActionState> {
  const actor = await authenticate(
    workspaceSlug,
    instructionPath(workspaceSlug, instructionId),
  );
  const terms = termsFromForm(formData);
  const validation = validateTerms(terms);
  if (!validation.ok) return termsProblem(validation.errors);
  const reason = validateInstructionReason(text(formData, "reason"));
  if (!reason.ok) {
    return {
      status: "error",
      message: "Check the highlighted details and try again.",
      fieldErrors: { reason: "Say why the terms are changing." },
    };
  }
  const result = await replaceInstructionTerms({
    ...actor,
    instructionId,
    terms,
    reason: reason.reason,
    confirmReturnToOnboarding: text(formData, "confirm") === "yes",
  });
  if (!result.ok) {
    return result.error === "invalid_input"
      ? IDLE_ERROR(
          "These are the same as the current terms. Change something, or cancel.",
        )
      : failure(result.error);
  }
  return done(workspaceSlug, instructionId);
}

export async function setLeadStaffAction(
  workspaceSlug: string,
  instructionId: string,
  _previous: InstructionActionState,
  formData: FormData,
): Promise<InstructionActionState> {
  const actor = await authenticate(
    workspaceSlug,
    instructionPath(workspaceSlug, instructionId),
  );
  const membershipId = text(formData, "membershipId");
  const result = await setInstructionLeadStaff({
    ...actor,
    instructionId,
    membershipId: membershipId || null,
    confirmReturnToOnboarding: text(formData, "confirm") === "yes",
  });
  if (!result.ok) return failure(result.error);
  return done(workspaceSlug, instructionId);
}

export async function addPartyAction(
  workspaceSlug: string,
  instructionId: string,
  _previous: InstructionActionState,
  formData: FormData,
): Promise<InstructionActionState> {
  const actor = await authenticate(
    workspaceSlug,
    instructionPath(workspaceSlug, instructionId),
  );
  const result = await addInstructionParty({
    ...actor,
    instructionId,
    contactId: text(formData, "contactId"),
    makeMain: text(formData, "makeMain") === "yes",
  });
  if (!result.ok) return failure(result.error);
  return done(workspaceSlug, instructionId);
}

export async function changeMainContactAction(
  workspaceSlug: string,
  instructionId: string,
  partyId: string,
): Promise<InstructionActionState> {
  const actor = await authenticate(
    workspaceSlug,
    instructionPath(workspaceSlug, instructionId),
  );
  const result = await changeInstructionMainContact({
    ...actor,
    instructionId,
    partyId,
  });
  if (!result.ok) return failure(result.error);
  return done(workspaceSlug, instructionId);
}

export async function removePartyAction(
  workspaceSlug: string,
  instructionId: string,
  partyId: string,
  _previous: InstructionActionState,
  formData: FormData,
): Promise<InstructionActionState> {
  const actor = await authenticate(
    workspaceSlug,
    instructionPath(workspaceSlug, instructionId),
  );
  const result = await removeInstructionParty({
    ...actor,
    instructionId,
    partyId,
    reason: text(formData, "reason"),
    newMainPartyId: text(formData, "newMainPartyId") || null,
  });
  if (!result.ok) return failure(result.error);
  return done(workspaceSlug, instructionId);
}

export async function recordAgreementAction(
  workspaceSlug: string,
  instructionId: string,
  _previous: InstructionActionState,
  formData: FormData,
): Promise<InstructionActionState> {
  const actor = await authenticate(
    workspaceSlug,
    instructionPath(workspaceSlug, instructionId),
  );
  const result = await recordInstructionAgreement({
    ...actor,
    instructionId,
    status: text(formData, "status"),
    signedOn: text(formData, "signedOn") || null,
    reason: text(formData, "reason") || null,
    confirmReturnToOnboarding: text(formData, "confirm") === "yes",
  });
  if (!result.ok) return failure(result.error);
  return done(workspaceSlug, instructionId);
}

export async function recordOwnershipCheckAction(
  workspaceSlug: string,
  instructionId: string,
  _previous: InstructionActionState,
  formData: FormData,
): Promise<InstructionActionState> {
  const actor = await authenticate(
    workspaceSlug,
    instructionPath(workspaceSlug, instructionId),
  );
  const result = await recordInstructionOwnershipCheck({
    ...actor,
    instructionId,
    status: text(formData, "status"),
    checkedOn: text(formData, "checkedOn") || null,
    method: text(formData, "method") || null,
    notes: text(formData, "notes") || null,
    reason: text(formData, "reason") || null,
    confirmReturnToOnboarding: text(formData, "confirm") === "yes",
  });
  if (!result.ok) return failure(result.error);
  return done(workspaceSlug, instructionId);
}

export async function approveExceptionAction(
  workspaceSlug: string,
  instructionId: string,
  _previous: InstructionActionState,
  formData: FormData,
): Promise<InstructionActionState> {
  const actor = await authenticate(
    workspaceSlug,
    instructionPath(workspaceSlug, instructionId),
  );
  const result = await approveInstructionException({
    ...actor,
    instructionId,
    kind: text(formData, "kind"),
    reason: text(formData, "reason"),
  });
  if (!result.ok) return failure(result.error);
  return done(workspaceSlug, instructionId);
}

export async function markReadyAction(
  workspaceSlug: string,
  instructionId: string,
): Promise<InstructionActionState> {
  const actor = await authenticate(
    workspaceSlug,
    instructionPath(workspaceSlug, instructionId),
  );
  const result = await markInstructionReadyToMarket({
    ...actor,
    instructionId,
  });
  if (!result.ok) return failure(result.error);
  return done(workspaceSlug, instructionId);
}

export async function returnToOnboardingAction(
  workspaceSlug: string,
  instructionId: string,
  _previous: InstructionActionState,
  formData: FormData,
): Promise<InstructionActionState> {
  const actor = await authenticate(
    workspaceSlug,
    instructionPath(workspaceSlug, instructionId),
  );
  const result = await returnInstructionToOnboarding({
    ...actor,
    instructionId,
    reason: text(formData, "reason"),
  });
  if (!result.ok) return failure(result.error);
  return done(workspaceSlug, instructionId);
}

export async function endInstructionAction(
  workspaceSlug: string,
  instructionId: string,
  propertyId: string,
  _previous: InstructionActionState,
  formData: FormData,
): Promise<InstructionActionState> {
  const actor = await authenticate(
    workspaceSlug,
    instructionPath(workspaceSlug, instructionId),
  );
  const result = await endInstruction({
    ...actor,
    instructionId,
    endedOn: text(formData, "endedOn") || null,
    reason: text(formData, "reason"),
  });
  if (!result.ok) {
    return result.error === "invalid_input"
      ? IDLE_ERROR("Give a reason and a valid date that is not in the future.")
      : failure(result.error);
  }
  return done(workspaceSlug, instructionId, propertyId);
}
