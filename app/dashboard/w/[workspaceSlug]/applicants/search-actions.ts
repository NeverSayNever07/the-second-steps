"use server";

import {
  loadApplicantPage,
  type ApplicantPage,
} from "@/core/applicants/application/applicant-page";
import { requireMfaUser } from "@/core/auth/mfa";
import { SEARCH_TEXT_MAX } from "@/core/properties/domain/ids";

export type ApplicantSearchState = {
  status: "ready" | "error";
  message: string;
  query: string;
  result: ApplicantPage;
};

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function searchApplicantsAction(
  workspaceSlug: string,
  previous: ApplicantSearchState,
  formData: FormData,
): Promise<ApplicantSearchState> {
  const path = `/dashboard/w/${workspaceSlug}/applicants`;
  const user = await requireMfaUser(path, { workspaceSlug });
  const query = text(formData, "query").trim().slice(0, SEARCH_TEXT_MAX);
  const requestedPage = Number(text(formData, "page"));
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
  try {
    const result = await loadApplicantPage({
      authSubject: user.id,
      workspaceSlug,
      query,
      status: text(formData, "status"),
      branchId: text(formData, "branch"),
      ownerMembershipId: text(formData, "owner"),
      noNextAction: text(formData, "noAction") === "yes",
      page,
    });
    if (!result) throw new Error("not allowed");
    return { status: "ready", message: "", query, result };
  } catch {
    return {
      ...previous,
      status: "error",
      message: "Applicants could not be searched. Try again.",
    };
  }
}
