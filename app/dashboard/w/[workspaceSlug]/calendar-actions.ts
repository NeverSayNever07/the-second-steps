"use server";

import { revalidatePath } from "next/cache";
import {
  planWorkItem,
  type WorkItemRef,
} from "@/core/actions/application/work-items";
import { requireMfaUser } from "@/core/auth/mfa";
import { moveScheduledAppraisal } from "@/core/enquiries/application/appraisals";
import { parseUkDateTime } from "@/core/enquiries/domain/enquiry";

export type MoveCalendarEntryResult =
  { ok: true } | { ok: false; message: string };

function failure(error: string): MoveCalendarEntryResult {
  if (error === "invalid_input") {
    return { ok: false, message: "Choose a valid date and time." };
  }
  if (error === "invalid_state") {
    return {
      ok: false,
      message: "That appointment has changed. Refresh and try again.",
    };
  }
  return {
    ok: false,
    message:
      "The appointment could not be moved. Check your access and try again.",
  };
}

export async function moveCalendarEntryAction(
  workspaceSlug: string,
  entry: {
    source: string;
    id: string;
    enquiryId: string | null;
  },
  localDateTime: string,
): Promise<MoveCalendarEntryResult> {
  const path = `/dashboard/w/${workspaceSlug}`;
  const user = await requireMfaUser(path, { workspaceSlug });
  const scheduledAt = parseUkDateTime(localDateTime);
  if (!scheduledAt) {
    return failure("invalid_input");
  }
  const actor = { authSubject: user.id, workspaceSlug };

  if (entry.source === "appraisal") {
    if (!entry.enquiryId) {
      return failure("invalid_input");
    }
    const result = await moveScheduledAppraisal({
      ...actor,
      enquiryId: entry.enquiryId,
      appraisalId: entry.id,
      scheduledAt,
    });
    if (!result.ok) {
      return failure(result.error);
    }
  } else if (entry.source === "lead_task" || entry.source === "action") {
    const result = await planWorkItem({
      ...actor,
      item: { source: entry.source, id: entry.id } satisfies WorkItemRef,
      plannedFor: scheduledAt.toISOString(),
    });
    if (!result.ok) {
      return failure(result.error);
    }
  } else {
    return failure("invalid_input");
  }

  revalidatePath(path);
  return { ok: true };
}
