"use server";

import { requireMfaUser } from "@/core/auth/mfa";
import {
  listLandlords,
  type LandlordContactState,
  type LandlordListResult,
  type LandlordRelationshipState,
} from "@/core/contacts/application/landlords";
import { isUuid, SEARCH_TEXT_MAX } from "@/core/properties/domain/ids";

export type LandlordSearchState = {
  status: "ready" | "error";
  message: string;
  query: string;
  result: LandlordListResult;
};

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function searchLandlordsAction(
  workspaceSlug: string,
  previous: LandlordSearchState,
  formData: FormData,
): Promise<LandlordSearchState> {
  const path = `/dashboard/w/${workspaceSlug}/landlords`;
  const user = await requireMfaUser(path, { workspaceSlug });
  const query = text(formData, "query").slice(0, SEARCH_TEXT_MAX);
  const requestedKind = text(formData, "kind");
  const kind = ["person", "organisation"].find(
    (value): value is "person" | "organisation" => value === requestedKind,
  );
  const branch = text(formData, "branch");
  const requestedRelationship = text(formData, "relationship");
  const relationship = ["current", "former", "all"].find(
    (value): value is LandlordRelationshipState =>
      value === requestedRelationship,
  );
  const requestedContactState = text(formData, "contactState");
  const contactState = ["active", "archived", "all"].find(
    (value): value is LandlordContactState => value === requestedContactState,
  );
  const requestedPage = Number(text(formData, "page"));
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
  try {
    const result = await listLandlords({
      authSubject: user.id,
      workspaceSlug,
      query,
      kind,
      branchId: isUuid(branch) ? branch : undefined,
      relationship,
      contactState,
      page,
    });
    return { status: "ready", message: "", query, result };
  } catch {
    return {
      ...previous,
      status: "error",
      message: "Landlords could not be searched. Try again.",
    };
  }
}
