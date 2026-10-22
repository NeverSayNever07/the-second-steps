"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { InstructionActionState } from "@/app/dashboard/w/[workspaceSlug]/instructions/actions";
import { requireMfaUser } from "@/core/auth/mfa";
import { createSupabaseDocumentStore } from "@/core/documents/data/supabase-document-store";
import {
  moveListingMedia,
  removeListingMedia,
  setListingMediaCaption,
  type MediaMove,
} from "@/core/listings/application/listing-media";
import {
  confirmContentReady,
  confirmReadyToAdvertise,
  prepareListing,
  returnListingToDraft,
  saveListingDraft,
  withdrawListing,
  type ListingError,
  type ListingFailure,
} from "@/core/listings/application/listings";
import { isUuid } from "@/core/properties/domain/ids";

// Workspace and record ids are bound in the page and encrypted by Next.js;
// everything the browser sends in a form is untrusted. Only named fields are
// read, and the service checks the permission and the workspace again.

export type ListingFormState = {
  status: "idle" | "error" | "saved";
  message: string;
  fieldErrors?: Partial<Record<string, string>>;
  /** The version now saved, so the form can carry on from it. */
  versionNo?: number;
};

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

const FAILURES: Record<ListingError, string> = {
  access_denied: "You do not have access to change listings.",
  listing_not_found:
    "The listing could not be found, or you do not have access to it.",
  instruction_not_found:
    "The instruction could not be found, or you do not have access to it.",
  instruction_not_ready:
    "The instruction must be Ready to market for this. Check the instruction.",
  invalid_input: "Check the details and try again.",
  version_conflict:
    "Someone saved a newer version while you were editing. Reload the page to see it, then make your change again.",
  not_ready: "Some items on the checklist still need doing.",
  invalid_state:
    "That could not be done because the listing has changed. Reload the page and try again.",
};

function failureMessage(failure: ListingFailure) {
  return FAILURES[failure.error];
}

function listingPath(workspaceSlug: string, listingId: string) {
  return `/dashboard/w/${workspaceSlug}/marketing/${listingId}`;
}

async function authenticate(workspaceSlug: string, path: string) {
  const user = await requireMfaUser(path, { workspaceSlug });
  return { authSubject: user.id, workspaceSlug };
}

function refresh(workspaceSlug: string, listingId: string) {
  revalidatePath(listingPath(workspaceSlug, listingId));
  revalidatePath(`/dashboard/w/${workspaceSlug}/marketing`);
}

/** Prepares (or opens) the instruction's listing and goes to it. */
export async function prepareListingAction(
  workspaceSlug: string,
  instructionId: string,
  startFromPrevious = false,
): Promise<void> {
  const instructionPath = `/dashboard/w/${workspaceSlug}/instructions/${instructionId}`;
  const actor = await authenticate(workspaceSlug, instructionPath);
  const result = await prepareListing({
    ...actor,
    instructionId,
    startFromPrevious: startFromPrevious === true,
  });
  if (!result.ok) redirect(`${instructionPath}?listing=${result.error}`);
  revalidatePath(instructionPath);
  revalidatePath(`/dashboard/w/${workspaceSlug}/marketing`);
  redirect(listingPath(workspaceSlug, result.listingId));
}

function contentFromForm(formData: FormData) {
  return {
    headline: text(formData, "headline"),
    summary: text(formData, "summary"),
    description: text(formData, "description"),
    // One highlight per line.
    highlights: text(formData, "highlights")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    availableFrom: text(formData, "availableFrom"),
    availabilityNote: text(formData, "availabilityNote"),
    depositNote: text(formData, "depositNote"),
    materialInformation: text(formData, "materialInformation"),
    materialInformationNotApplicable:
      text(formData, "materialInformationNotApplicable") === "yes",
  };
}

export async function saveListingDraftAction(
  workspaceSlug: string,
  listingId: string,
  baseVersionNo: number,
  _previous: ListingFormState,
  formData: FormData,
): Promise<ListingFormState> {
  const actor = await authenticate(
    workspaceSlug,
    listingPath(workspaceSlug, listingId),
  );
  const result = await saveListingDraft({
    ...actor,
    listingId,
    baseVersionNo: Number.isSafeInteger(baseVersionNo) ? baseVersionNo : -1,
    content: contentFromForm(formData),
    notApplicable: formData.getAll("notApplicable").map(String),
  });
  if (!result.ok) {
    return {
      status: "error",
      message: failureMessage(result),
      fieldErrors: result.fieldErrors,
    };
  }
  refresh(workspaceSlug, listingId);
  return {
    status: "saved",
    message: `Draft saved as version ${result.versionNo}.`,
    versionNo: result.versionNo,
  };
}

export async function confirmContentReadyAction(
  workspaceSlug: string,
  listingId: string,
  versionNo: number,
): Promise<InstructionActionState> {
  const actor = await authenticate(
    workspaceSlug,
    listingPath(workspaceSlug, listingId),
  );
  const result = await confirmContentReady({
    ...actor,
    listingId,
    versionNo: Number.isSafeInteger(versionNo) ? versionNo : -1,
  });
  if (!result.ok) {
    return { status: "error", message: failureMessage(result) };
  }
  refresh(workspaceSlug, listingId);
  return { status: "saved", message: "Marked Content ready." };
}

export async function returnListingToDraftAction(
  workspaceSlug: string,
  listingId: string,
  _previous: InstructionActionState,
  formData: FormData,
): Promise<InstructionActionState> {
  const actor = await authenticate(
    workspaceSlug,
    listingPath(workspaceSlug, listingId),
  );
  const result = await returnListingToDraft({
    ...actor,
    listingId,
    reason: text(formData, "reason"),
  });
  if (!result.ok) {
    return {
      status: "error",
      message: failureMessage(result),
      fieldErrors:
        result.error === "invalid_input"
          ? { reason: "Give a reason." }
          : undefined,
    };
  }
  refresh(workspaceSlug, listingId);
  return { status: "saved", message: "Returned to Draft." };
}

export async function withdrawListingAction(
  workspaceSlug: string,
  listingId: string,
  _previous: InstructionActionState,
  formData: FormData,
): Promise<InstructionActionState> {
  const actor = await authenticate(
    workspaceSlug,
    listingPath(workspaceSlug, listingId),
  );
  const result = await withdrawListing({
    ...actor,
    listingId,
    reason: text(formData, "reason"),
  });
  if (!result.ok) {
    return {
      status: "error",
      message: failureMessage(result),
      fieldErrors:
        result.error === "invalid_input"
          ? { reason: "Give a reason." }
          : undefined,
    };
  }
  refresh(workspaceSlug, listingId);
  if (isUuid(listingId)) {
    revalidatePath(`/dashboard/w/${workspaceSlug}/instructions`);
  }
  return { status: "saved", message: "Listing withdrawn." };
}

export async function confirmReadyToAdvertiseAction(
  workspaceSlug: string,
  listingId: string,
  versionNo: number,
): Promise<InstructionActionState> {
  const actor = await authenticate(
    workspaceSlug,
    listingPath(workspaceSlug, listingId),
  );
  const result = await confirmReadyToAdvertise({
    ...actor,
    listingId,
    versionNo: Number.isSafeInteger(versionNo) ? versionNo : -1,
  });
  if (!result.ok) {
    return { status: "error", message: failureMessage(result) };
  }
  refresh(workspaceSlug, listingId);
  return { status: "saved", message: "Marked Ready to advertise." };
}

const MOVES: readonly MediaMove[] = ["up", "down", "first"];

export async function moveListingMediaAction(
  workspaceSlug: string,
  listingId: string,
  mediaId: string,
  move: string,
): Promise<InstructionActionState> {
  const actor = await authenticate(
    workspaceSlug,
    listingPath(workspaceSlug, listingId),
  );
  const checked = MOVES.find((item) => item === move);
  if (!checked) return { status: "error", message: FAILURES.invalid_input };
  const result = await moveListingMedia({
    ...actor,
    listingId,
    mediaId,
    move: checked,
  });
  if (!result.ok) {
    return { status: "error", message: failureMessage(result) };
  }
  refresh(workspaceSlug, listingId);
  return { status: "saved", message: "Order changed." };
}

export async function setListingMediaCaptionAction(
  workspaceSlug: string,
  listingId: string,
  mediaId: string,
  _previous: InstructionActionState,
  formData: FormData,
): Promise<InstructionActionState> {
  const actor = await authenticate(
    workspaceSlug,
    listingPath(workspaceSlug, listingId),
  );
  const result = await setListingMediaCaption({
    ...actor,
    listingId,
    mediaId,
    caption: text(formData, "caption"),
  });
  if (!result.ok) {
    return {
      status: "error",
      message: failureMessage(result),
      fieldErrors:
        result.error === "invalid_input"
          ? { caption: "Use up to 200 characters on one line." }
          : undefined,
    };
  }
  refresh(workspaceSlug, listingId);
  return { status: "saved", message: "Caption saved." };
}

export async function removeListingMediaAction(
  workspaceSlug: string,
  listingId: string,
  mediaId: string,
  _previous: InstructionActionState,
  formData: FormData,
): Promise<InstructionActionState> {
  const actor = await authenticate(
    workspaceSlug,
    listingPath(workspaceSlug, listingId),
  );
  const result = await removeListingMedia({
    ...actor,
    listingId,
    mediaId,
    reason: text(formData, "reason"),
    store: createSupabaseDocumentStore(),
  });
  if (!result.ok) {
    return {
      status: "error",
      message: failureMessage(result),
      fieldErrors:
        result.error === "invalid_input"
          ? { reason: "Give a reason." }
          : undefined,
    };
  }
  refresh(workspaceSlug, listingId);
  return { status: "saved", message: "File removed." };
}
