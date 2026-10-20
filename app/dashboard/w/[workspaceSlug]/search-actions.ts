"use server";

import { requireMfaUser } from "@/core/auth/mfa";
import { SEARCH_TEXT_MAX } from "@/core/properties/domain/ids";
import {
  searchWorkspace,
  type WorkspaceSearchResult,
} from "@/core/workspace/application/workspace-search";

export type WorkspaceSearchState =
  { status: "ok"; result: WorkspaceSearchResult } | { status: "error" };

export async function searchWorkspaceAction(
  workspaceSlug: string,
  query: string,
): Promise<WorkspaceSearchState> {
  const user = await requireMfaUser(`/dashboard/w/${workspaceSlug}`, {
    workspaceSlug,
  });
  try {
    const result = await searchWorkspace({
      authSubject: user.id,
      workspaceSlug,
      query: typeof query === "string" ? query.slice(0, SEARCH_TEXT_MAX) : "",
    });
    return { status: "ok", result };
  } catch {
    return { status: "error" };
  }
}
