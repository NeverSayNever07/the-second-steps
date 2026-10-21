"use server";

import { revalidatePath } from "next/cache";
import type { InstructionActionState } from "@/app/dashboard/w/[workspaceSlug]/instructions/actions";
import { requireMfaUser } from "@/core/auth/mfa";
import { isUuid } from "@/core/properties/domain/ids";
import {
  recordApplicability,
  recordEvidenceStatus,
  recordEvidenceWithoutFile,
  type ComplianceError,
} from "@/core/compliance/application/property-compliance";
import {
  validateApplicability,
  validateEvidenceFacts,
  validateStatus,
  isComplianceArea,
} from "@/core/compliance/domain/compliance";

// Compliance records are added by this action, or by the upload route for
// evidence that comes with a file. Form fields are untrusted: the workspace
// and property are bound in the page, and everything else is validated again
// in the service.

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

const FAILURES: Record<ComplianceError, string> = {
  access_denied: "You do not have access to change compliance records.",
  property_not_found:
    "The property could not be found, or you do not have access to it.",
  invalid_input: "Check the details and try again.",
  evidence_not_found:
    "That evidence could not be found for this area. Refresh and try again.",
  file_required: "This area needs an uploaded file as its evidence.",
  not_applicable:
    "Mark this area as applying to the property before recording its evidence status.",
  property_closed:
    "This property is archived, so its compliance cannot change.",
  invalid_state:
    "That could not be saved, perhaps because the file was removed or the record changed. Refresh and try again.",
};

function failure(error: ComplianceError): InstructionActionState {
  return { status: "error", message: FAILURES[error] };
}

export async function recordComplianceAction(
  workspaceSlug: string,
  propertyId: string,
  area: string,
  // The instruction page this was opened from, if any, so it refreshes too.
  instructionId: string | null,
  _previous: InstructionActionState,
  formData: FormData,
): Promise<InstructionActionState> {
  const path = `/dashboard/w/${workspaceSlug}/properties/${propertyId}`;
  const user = await requireMfaUser(path, { workspaceSlug });
  const actor = { authSubject: user.id, workspaceSlug };
  if (!isComplianceArea(area)) return failure("invalid_input");

  const intent = text(formData, "intent");
  let result;

  if (intent === "applicability") {
    const input = {
      applicability: text(formData, "applicability"),
      reason: text(formData, "reason"),
      sourceNote: text(formData, "sourceNote"),
    };
    const checked = validateApplicability(input);
    if (!checked.ok) {
      return {
        status: "error",
        message: "Check the details and try again.",
        fieldErrors: checked.errors,
      };
    }
    result = await recordApplicability({
      ...actor,
      propertyId,
      area,
      ...input,
    });
  } else if (intent === "evidence") {
    // Evidence with no file (smoke and CO alarms only). Evidence with a file
    // goes through the upload route instead.
    const facts = {
      reference: text(formData, "reference"),
      provider: text(formData, "provider"),
      eventOn: text(formData, "eventOn"),
      expiresOn: text(formData, "expiresOn"),
      epcRating: text(formData, "epcRating"),
      notes: text(formData, "notes"),
    };
    const checked = validateEvidenceFacts(area, facts);
    if (!checked.ok) {
      return {
        status: "error",
        message: "Check the details and try again.",
        fieldErrors: checked.errors,
      };
    }
    result = await recordEvidenceWithoutFile({
      ...actor,
      propertyId,
      area,
      facts,
    });
  } else if (intent === "status") {
    const input = {
      status: text(formData, "status"),
      evidenceId: text(formData, "evidenceId"),
      note: text(formData, "note"),
    };
    const checked = validateStatus(input);
    if (!checked.ok) {
      return {
        status: "error",
        message: "Check the details and try again.",
        fieldErrors: checked.errors,
      };
    }
    result = await recordEvidenceStatus({
      ...actor,
      propertyId,
      area,
      ...input,
    });
  } else {
    return failure("invalid_input");
  }

  if (!result.ok) return failure(result.error);
  revalidatePath(path);
  if (isUuid(instructionId)) {
    revalidatePath(
      `/dashboard/w/${workspaceSlug}/instructions/${instructionId}`,
    );
  }
  return { status: "saved", message: "Compliance updated." };
}
