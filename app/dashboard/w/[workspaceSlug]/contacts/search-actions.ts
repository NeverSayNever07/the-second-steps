"use server";

import { requireMfaUser } from "@/core/auth/mfa";
import {
  listContactPage,
  type ContactListState,
} from "@/core/contacts/application/contacts";
import { isUuid, SEARCH_TEXT_MAX } from "@/core/properties/domain/ids";

type ContactPage = NonNullable<Awaited<ReturnType<typeof listContactPage>>>;

export type ContactSearchState = {
  status: "ready" | "error";
  message: string;
  query: string;
  result: ContactPage;
};

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function searchContactsAction(
  workspaceSlug: string,
  previous: ContactSearchState,
  formData: FormData,
): Promise<ContactSearchState> {
  const path = `/dashboard/w/${workspaceSlug}/contacts`;
  const user = await requireMfaUser(path, { workspaceSlug });
  const query = text(formData, "query").slice(0, SEARCH_TEXT_MAX);
  const requestedKind = text(formData, "kind");
  const kind = ["person", "organisation"].find(
    (value): value is "person" | "organisation" => value === requestedKind,
  );
  const branch = text(formData, "branch");
  const requestedState = text(formData, "state");
  const state = ["active", "archived", "merged", "all"].find(
    (value): value is ContactListState => value === requestedState,
  );
  const requestedPage = Number(text(formData, "page"));
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
  try {
    const result = await listContactPage({
      authSubject: user.id,
      workspaceSlug,
      query,
      kind,
      branchId: isUuid(branch) ? branch : undefined,
      state,
      page,
    });
    if (!result) {
      return {
        ...previous,
        status: "error",
        message: "You do not have access to search contacts.",
      };
    }
    return { status: "ready", message: "", query, result };
  } catch {
    return {
      ...previous,
      status: "error",
      message: "Contacts could not be searched. Try again.",
    };
  }
}
