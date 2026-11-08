import "server-only";

import {
  isApplicantStatus,
  type ApplicantStatusCode,
} from "../domain/applicant";
import { isUuid } from "@/core/properties/domain/ids";
import { listApplicants, type ApplicantListItem } from "./applicant-views";

export const APPLICANT_PAGE_SIZE = 25;

export type ApplicantPage = {
  items: ApplicantListItem[];
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

/** One page of the applicants list. Filters are checked here, not trusted. */
export async function loadApplicantPage(input: {
  authSubject: string;
  workspaceSlug: string;
  query?: string;
  status?: string;
  branchId?: string;
  ownerMembershipId?: string;
  noNextAction?: boolean;
  page: number;
}): Promise<ApplicantPage | null> {
  const status: "open" | "all" | ApplicantStatusCode =
    input.status === "all"
      ? "all"
      : isApplicantStatus(input.status)
        ? input.status
        : "open";
  const result = await listApplicants({
    authSubject: input.authSubject,
    workspaceSlug: input.workspaceSlug,
    status,
    query: input.query,
    branchId: isUuid(input.branchId) ? input.branchId : undefined,
    ownerMembershipId: isUuid(input.ownerMembershipId)
      ? input.ownerMembershipId
      : undefined,
    noNextAction: input.noNextAction,
    // One extra row tells us whether there is a next page.
    take: APPLICANT_PAGE_SIZE + 1,
    skip: (input.page - 1) * APPLICANT_PAGE_SIZE,
  });
  if (!result) return null;
  return {
    items: result.items.slice(0, APPLICANT_PAGE_SIZE),
    page: input.page,
    hasPrevious: input.page > 1,
    hasNext: result.items.length > APPLICANT_PAGE_SIZE,
  };
}
