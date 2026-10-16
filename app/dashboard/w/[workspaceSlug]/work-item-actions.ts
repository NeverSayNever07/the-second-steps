"use server";

import { revalidatePath } from "next/cache";
import {
  addWorkItem,
  cancelWorkItem,
  completeWorkItem,
  handOverWorkItem,
  planWorkItem,
  snoozeWorkItem,
  type WorkItemRef,
} from "@/core/actions/application/work-items";
import { isActionKind } from "@/core/actions/domain/action";
import { requireMfaUser } from "@/core/auth/mfa";
import { ukInstant, ukToday } from "@/core/enquiries/domain/enquiry";

export type WorkItemResult = { ok: true } | { ok: false; message: string };

type NextStepInput = {
  title: string;
  dueOn: string;
  assignedMembershipId: string;
  kind?: string;
};

function str(value: unknown) {
  return typeof value === "string" ? value : "";
}

function itemRef(item: { source?: unknown; id?: unknown }): WorkItemRef {
  // The service rejects anything that is not a known source and a real id.
  return {
    source: str(item.source) as WorkItemRef["source"],
    id: str(item.id),
  };
}

function failure(error: string): WorkItemResult {
  const message =
    error === "invalid_input"
      ? "Check the details and try again."
      : error === "invalid_state"
        ? "That action has already changed. Refresh the page to see the latest."
        : error.endsWith("_not_found")
          ? "That could not be found. Refresh the page and try again."
          : "The change could not be saved. Check your access and try again.";
  return { ok: false, message };
}

async function authenticate(workspaceSlug: string) {
  const path = `/dashboard/w/${workspaceSlug}`;
  const user = await requireMfaUser(path, { workspaceSlug });
  return { path, actor: { authSubject: user.id, workspaceSlug } };
}

function nextStep(next: NextStepInput | null) {
  if (!next) return null;
  const kind = str(next.kind);
  return {
    title: str(next.title),
    dueOn: str(next.dueOn),
    assignedMembershipId: str(next.assignedMembershipId),
    kind: isActionKind(kind) ? kind : undefined,
  };
}

export async function addWorkItemAction(
  workspaceSlug: string,
  input: {
    title: string;
    kind: string;
    dueOn: string;
    assignedMembershipId: string;
    branchId: string;
    enquiryId: string;
  },
): Promise<WorkItemResult> {
  const { path, actor } = await authenticate(workspaceSlug);
  const kind = str(input.kind);
  const enquiryId = str(input.enquiryId);
  const result = await addWorkItem({
    ...actor,
    title: str(input.title),
    kind: isActionKind(kind) ? kind : undefined,
    dueOn: str(input.dueOn),
    assignedMembershipId: str(input.assignedMembershipId),
    enquiryId: enquiryId || null,
    branchId: enquiryId ? null : str(input.branchId),
  });
  if (!result.ok) return failure(result.error);
  revalidatePath(path);
  return { ok: true };
}

export async function completeWorkItemAction(
  workspaceSlug: string,
  item: { source: string; id: string },
  next: NextStepInput | null,
): Promise<WorkItemResult> {
  const { path, actor } = await authenticate(workspaceSlug);
  const result = await completeWorkItem({
    ...actor,
    item: itemRef(item),
    next: nextStep(next),
  });
  if (!result.ok) return failure(result.error);
  revalidatePath(path);
  return { ok: true };
}

export async function cancelWorkItemAction(
  workspaceSlug: string,
  item: { source: string; id: string },
): Promise<WorkItemResult> {
  const { path, actor } = await authenticate(workspaceSlug);
  const result = await cancelWorkItem({ ...actor, item: itemRef(item) });
  if (!result.ok) return failure(result.error);
  revalidatePath(path);
  return { ok: true };
}

export async function snoozeWorkItemAction(
  workspaceSlug: string,
  item: { source: string; id: string },
  dueOn: string,
): Promise<WorkItemResult> {
  const { path, actor } = await authenticate(workspaceSlug);
  const result = await snoozeWorkItem({
    ...actor,
    item: itemRef(item),
    dueOn: str(dueOn),
  });
  if (!result.ok) return failure(result.error);
  revalidatePath(path);
  return { ok: true };
}

export async function handOverWorkItemAction(
  workspaceSlug: string,
  item: { source: string; id: string },
  assignedMembershipId: string,
): Promise<WorkItemResult> {
  const { path, actor } = await authenticate(workspaceSlug);
  const result = await handOverWorkItem({
    ...actor,
    item: itemRef(item),
    assignedMembershipId: str(assignedMembershipId),
  });
  if (!result.ok) return failure(result.error);
  revalidatePath(path);
  return { ok: true };
}

/** Plans the item for a whole UK clock hour today, or clears the plan with null. */
export async function planWorkItemAction(
  workspaceSlug: string,
  item: { source: string; id: string },
  hour: number | null,
): Promise<WorkItemResult> {
  const { path, actor } = await authenticate(workspaceSlug);
  if (hour !== null && !(Number.isInteger(hour) && hour >= 0 && hour <= 23)) {
    return failure("invalid_input");
  }
  const result = await planWorkItem({
    ...actor,
    item: itemRef(item),
    plannedFor: hour === null ? null : ukInstant(ukToday(), hour).toISOString(),
  });
  if (!result.ok) return failure(result.error);
  revalidatePath(path);
  return { ok: true };
}
