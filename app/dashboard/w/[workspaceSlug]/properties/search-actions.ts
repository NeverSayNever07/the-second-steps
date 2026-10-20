"use server";

import { requireMfaUser } from "@/core/auth/mfa";
import {
  listPropertyPage,
  type PropertyInstructionFilter,
  type PropertyListState,
  type PropertyPageResult,
} from "@/core/properties/application/property-list";
import { isUuid, SEARCH_TEXT_MAX } from "@/core/properties/domain/ids";

export type PropertySearchState = {
  status: "ready" | "error";
  message: string;
  query: string;
  result: PropertyPageResult;
};

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function searchPropertiesAction(
  workspaceSlug: string,
  previous: PropertySearchState,
  formData: FormData,
): Promise<PropertySearchState> {
  const path = `/dashboard/w/${workspaceSlug}/properties`;
  const user = await requireMfaUser(path, { workspaceSlug });
  const query = text(formData, "query").slice(0, SEARCH_TEXT_MAX);
  const branch = text(formData, "branch");
  const assigned = text(formData, "assigned");
  const requestedInstruction = text(formData, "instruction");
  const instruction = ["any", "none", "onboarding", "ready_to_market"].find(
    (value): value is PropertyInstructionFilter =>
      value === requestedInstruction,
  );
  const requestedState = text(formData, "state");
  const state = ["active", "archived", "all"].find(
    (value): value is PropertyListState => value === requestedState,
  );
  const requestedPage = Number(text(formData, "page"));
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
  try {
    const result = await listPropertyPage({
      authSubject: user.id,
      workspaceSlug,
      query,
      branchId: isUuid(branch) ? branch : undefined,
      assignedMembershipId: isUuid(assigned) ? assigned : undefined,
      instruction,
      state,
      page,
    });
    if (!result) {
      return {
        ...previous,
        status: "error",
        message: "You do not have access to search properties.",
      };
    }
    return { status: "ready", message: "", query, result };
  } catch {
    return {
      ...previous,
      status: "error",
      message: "Properties could not be searched. Try again.",
    };
  }
}
