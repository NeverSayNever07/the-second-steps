"use server";

import { requireMfaUser } from "@/core/auth/mfa";
import { listEnquiryPage } from "@/core/enquiries/application/enquiries";
import {
  ENQUIRY_STAGES,
  type EnquiryStageCode,
} from "@/core/enquiries/domain/enquiry";
import { isUuid, SEARCH_TEXT_MAX } from "@/core/properties/domain/ids";

export type EnquirySearchState = {
  status: "ready" | "error";
  message: string;
  query: string;
  result: Awaited<ReturnType<typeof listEnquiryPage>>;
};

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function searchEnquiriesAction(
  workspaceSlug: string,
  previous: EnquirySearchState,
  formData: FormData,
): Promise<EnquirySearchState> {
  const path = `/dashboard/w/${workspaceSlug}/enquiries`;
  const user = await requireMfaUser(path, { workspaceSlug });
  const query = text(formData, "query").slice(0, SEARCH_TEXT_MAX);
  const branch = text(formData, "branch");
  const assigned = text(formData, "assigned");
  const requestedStage = text(formData, "stage");
  const stage = ENQUIRY_STAGES.find(
    (value): value is EnquiryStageCode => value === requestedStage,
  );
  const includeClosed = text(formData, "closed") === "yes";
  const requestedPage = Number(text(formData, "page"));
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
  try {
    const result = await listEnquiryPage({
      authSubject: user.id,
      workspaceSlug,
      query,
      branchId: isUuid(branch) ? branch : undefined,
      assignedMembershipId: isUuid(assigned) ? assigned : undefined,
      stages: stage ? [stage] : includeClosed ? [...ENQUIRY_STAGES] : undefined,
      page,
    });
    return { status: "ready", message: "", query, result };
  } catch {
    return {
      ...previous,
      status: "error",
      message: "Landlord leads could not be searched. Try again.",
    };
  }
}
