"use server";

import { revalidatePath } from "next/cache";
import type { InstructionActionState } from "@/app/dashboard/w/[workspaceSlug]/instructions/actions";
import { changeApplicantStatus } from "@/core/applicants/application/applicants";
import type {
  ApplicantError,
  ApplicantFailure,
} from "@/core/applicants/application/applicant-shared";
import { requireMfaUser } from "@/core/auth/mfa";
import { isUuid } from "@/core/properties/domain/ids";

// Workspace and record ids are bound in the page; everything the browser sends
// in a form is untrusted. Only named fields are read, and the service checks
// the permission, the branch and the workspace again.

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

const FAILURES: Record<ApplicantError, string> = {
  access_denied: "You do not have access to change this applicant.",
  applicant_not_found:
    "The applicant could not be found, or you do not have access to it.",
  enquiry_not_found:
    "The property enquiry could not be found, or you do not have access to it.",
  listing_not_found:
    "The home could not be found, or you do not have access to it.",
  contact_not_found:
    "The contact could not be found, or you do not have access to it.",
  member_not_found: "That household member could not be found.",
  list_item_not_found: "That choice is no longer available. Choose another.",
  invalid_input: "Check the details and try again.",
  duplicate_review_required:
    "This contact looks like an existing one. Review the match first.",
  applicant_exists: "This contact already has an open applicant record.",
  applicant_closed: "This applicant is closed, so it cannot be changed.",
  listing_not_ready:
    "Only a home that is Ready to advertise (inside Zayto only) can take an enquiry.",
  already_enquired: "This applicant already has an open enquiry for that home.",
  branch_access_needed:
    "Recording this needs access to both the applicant's branch and the home's branch. Ask a manager.",
  invalid_state:
    "That could not be done because the record has changed. Reload the page and try again.",
};

function failureMessage(failure: ApplicantFailure) {
  return FAILURES[failure.error];
}

function applicantPath(workspaceSlug: string, applicantId: string) {
  return `/dashboard/w/${workspaceSlug}/applicants/${applicantId}`;
}

function refresh(workspaceSlug: string, applicantId: string) {
  if (isUuid(applicantId)) {
    revalidatePath(applicantPath(workspaceSlug, applicantId));
  }
  revalidatePath(`/dashboard/w/${workspaceSlug}/applicants`);
}

export async function changeApplicantStatusAction(
  workspaceSlug: string,
  applicantId: string,
  _previous: InstructionActionState,
  formData: FormData,
): Promise<InstructionActionState> {
  const user = await requireMfaUser(applicantPath(workspaceSlug, applicantId), {
    workspaceSlug,
  });
  const result = await changeApplicantStatus({
    authSubject: user.id,
    workspaceSlug,
    applicantId,
    to: text(formData, "to"),
    reasonId: text(formData, "reasonId") || null,
    note: text(formData, "note"),
  });
  if (!result.ok) {
    return {
      status: "error",
      message: failureMessage(result),
      fieldErrors: result.fieldErrors,
    };
  }
  refresh(workspaceSlug, applicantId);
  return { status: "saved", message: "Status updated." };
}
