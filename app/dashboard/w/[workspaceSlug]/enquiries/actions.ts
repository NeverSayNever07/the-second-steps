"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMfaUser } from "@/core/auth/mfa";
import {
  closeEnquiry,
  createEnquiry,
  getEnquiry,
  reopenEnquiry,
  updateEnquiry,
} from "@/core/enquiries/application/enquiries";
import { assignEnquiryLead } from "@/core/enquiries/application/enquiry-assign";
import {
  addEnquiryTask,
  cancelEnquiryTask,
  completeEnquiryTask,
} from "@/core/enquiries/application/enquiry-tasks";
import {
  bookAppraisal,
  cancelAppraisal,
  completeAppraisal,
  recordAppraisalDidNotAttend,
  reviewAppraisalBookingDuplicates,
} from "@/core/enquiries/application/appraisals";
import {
  parseDateOnly,
  validateEnquirer,
  validateTaskTitle,
  type EnquirerField,
} from "@/core/enquiries/domain/enquiry";
import { isUuid } from "@/core/properties/domain/ids";

export type QuickEnquiryField =
  | EnquirerField
  | "branchId"
  | "leadSourceId"
  | "leadMembershipId"
  | "taskTitle"
  | "taskDueOn"
  | "taskAssigneeId";

export type QuickEnquiryState = {
  status: "idle" | "error";
  message: string;
  fieldErrors?: Partial<Record<QuickEnquiryField, string>>;
};

export type EditEnquiryField =
  EnquirerField | "leadSourceId" | "leadMembershipId";

export type EditEnquiryState = {
  status: "idle" | "error";
  message: string;
  fieldErrors?: Partial<Record<EditEnquiryField, string>>;
};

export type EnquiryActionState = {
  status: "idle" | "error" | "saved";
  message: string;
};

export type AppraisalBookingState = {
  status: "idle" | "error" | "review";
  message: string;
  contactMatches?: Array<{
    id: string;
    name: string;
    reference: string;
    strength: "strong" | "possible";
    matchedFields: string[];
  }>;
  propertyMatches?: Array<{
    id: string;
    reference: string;
    strength: "strong" | "possible";
    archived: boolean;
    addressLine: string;
    postcode: string;
  }>;
};

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function createEnquiryAction(
  workspaceSlug: string,
  _previousState: QuickEnquiryState,
  formData: FormData,
): Promise<QuickEnquiryState> {
  const path = `/dashboard/w/${workspaceSlug}/enquiries`;
  const user = await requireMfaUser(`${path}/new`, { workspaceSlug });
  const enquirer = {
    name: text(formData, "name"),
    email: text(formData, "email"),
    telephone: text(formData, "telephone"),
    addressBuilding: text(formData, "addressBuilding"),
    addressStreet: text(formData, "addressStreet"),
    postcode: text(formData, "postcode"),
    summary: text(formData, "summary"),
  };
  const branchId = text(formData, "branchId");
  const leadSourceId = text(formData, "leadSourceId");
  const leadMembershipId = text(formData, "leadMembershipId");
  const taskTitle = text(formData, "taskTitle");
  const taskDueOn = text(formData, "taskDueOn");
  const taskAssigneeId = text(formData, "taskAssigneeId");
  const enquirerValidation = validateEnquirer(enquirer, {
    hasContact: false,
    hasProperty: false,
  });
  const fieldErrors: QuickEnquiryState["fieldErrors"] = enquirerValidation.ok
    ? {}
    : { ...enquirerValidation.errors };
  if (!isUuid(branchId)) fieldErrors.branchId = "Choose a responsible branch.";
  if (leadSourceId && !isUuid(leadSourceId)) {
    fieldErrors.leadSourceId = "Choose a lead source from the list.";
  }
  if (leadMembershipId && !isUuid(leadMembershipId)) {
    fieldErrors.leadMembershipId = "Choose a staff member from the list.";
  }
  const hasAnyTask = Boolean(taskTitle || taskDueOn || taskAssigneeId);
  if (hasAnyTask) {
    const title = validateTaskTitle(taskTitle);
    if (!title.ok) fieldErrors.taskTitle = title.error;
    if (!parseDateOnly(taskDueOn)) fieldErrors.taskDueOn = "Choose a due date.";
    if (!isUuid(taskAssigneeId)) {
      fieldErrors.taskAssigneeId = "Choose who will do this.";
    }
  }
  if (Object.keys(fieldErrors).length) {
    return {
      status: "error",
      message: "Check the highlighted details and try again.",
      fieldErrors,
    };
  }

  const result = await createEnquiry({
    authSubject: user.id,
    workspaceSlug,
    branchId,
    enquirer,
    leadSourceId: leadSourceId || null,
    leadMembershipId: leadMembershipId || null,
    firstTask: hasAnyTask
      ? {
          title: taskTitle,
          dueOn: taskDueOn,
          assignedMembershipId: taskAssigneeId,
        }
      : null,
  });
  if (!result.ok) {
    return {
      status: "error",
      message:
        result.error === "access_denied"
          ? "You do not have access to create this landlord lead in that branch."
          : "The landlord lead could not be saved. Refresh the page and try again.",
    };
  }
  revalidatePath(path);
  revalidatePath(`/dashboard/w/${workspaceSlug}`);
  redirect(`${path}?created=${result.enquiryId}`);
}

export async function updateEnquiryAction(
  workspaceSlug: string,
  enquiryId: string,
  _previousState: EditEnquiryState,
  formData: FormData,
): Promise<EditEnquiryState> {
  const path = recordPath(workspaceSlug, enquiryId);
  const user = await requireMfaUser(`${path}/edit`, { workspaceSlug });
  const current = await getEnquiry({
    authSubject: user.id,
    workspaceSlug,
    enquiryId,
  });
  if (!current) {
    return {
      status: "error",
      message:
        "This landlord lead could not be found or is no longer available.",
    };
  }
  const enquirer = {
    name: text(formData, "name"),
    email: text(formData, "email"),
    telephone: text(formData, "telephone"),
    addressBuilding: text(formData, "addressBuilding"),
    addressStreet: text(formData, "addressStreet"),
    postcode: text(formData, "postcode"),
    summary: text(formData, "summary"),
  };
  const leadSourceId = text(formData, "leadSourceId");
  const leadMembershipId = text(formData, "leadMembershipId");
  const validation = validateEnquirer(enquirer, {
    hasContact: Boolean(current.contactId),
    hasProperty: Boolean(current.propertyId),
  });
  const fieldErrors: EditEnquiryState["fieldErrors"] = validation.ok
    ? {}
    : { ...validation.errors };
  if (leadSourceId && !isUuid(leadSourceId)) {
    fieldErrors.leadSourceId = "Choose a lead source from the list.";
  }
  if (leadMembershipId && !isUuid(leadMembershipId)) {
    fieldErrors.leadMembershipId = "Choose a staff member from the list.";
  }
  if (Object.keys(fieldErrors).length) {
    return {
      status: "error",
      message: "Check the highlighted details and try again.",
      fieldErrors,
    };
  }
  const result = await updateEnquiry({
    authSubject: user.id,
    workspaceSlug,
    enquiryId,
    enquirer,
    leadSourceId: leadSourceId || null,
    leadMembershipId: leadMembershipId || null,
  });
  if (!result.ok) {
    return { status: "error", message: failureMessage(result.error) };
  }
  revalidatePath(path);
  revalidatePath(`/dashboard/w/${workspaceSlug}/enquiries`);
  revalidatePath(`/dashboard/w/${workspaceSlug}`);
  redirect(`${path}?updated=yes`);
}

function failureMessage(error: string) {
  if (error === "invalid_input") return "Check the details and try again.";
  if (error === "invalid_state")
    return "That change is no longer available. Refresh the page and check the current stage.";
  if (error.endsWith("_not_found"))
    return "That record could not be found. Refresh the page and try again.";
  return "The change could not be saved. Check your access and try again.";
}

function recordPath(workspaceSlug: string, enquiryId: string) {
  return `/dashboard/w/${workspaceSlug}/enquiries/${enquiryId}`;
}

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

function bookingDetails(formData: FormData) {
  const contactKind = text(formData, "contactKind");
  const organisationType = text(formData, "organisationType") as
    "limited_company" | "llp" | "partnership" | "trust" | "charity" | "other";
  const communication = {
    preferred: null,
    doNotEmail: false,
    doNotTelephone: false,
    doNotSms: false,
    doNotWhatsApp: false,
    doNotPost: false,
  } as const;
  const contactPoints = [
    ...(text(formData, "email")
      ? [
          {
            kind: "email" as const,
            label: "",
            value: text(formData, "email"),
            isPreferred: true,
          },
        ]
      : []),
    ...(text(formData, "telephone")
      ? [
          {
            kind: "telephone" as const,
            label: "",
            value: text(formData, "telephone"),
            isPreferred: !text(formData, "email"),
          },
        ]
      : []),
  ];
  const contact =
    contactKind === "organisation"
      ? {
          kind: "organisation" as const,
          details: {
            type: organisationType,
            legalName: text(formData, "legalName"),
            tradingName: "",
            registrationNumber: "",
            vatNumber: "",
          },
          communication,
          contactPoints,
          addresses: [],
        }
      : {
          kind: "person" as const,
          details: {
            title: "",
            firstName: text(formData, "firstName"),
            middleNames: "",
            lastName: text(formData, "lastName"),
            preferredName: "",
          },
          communication,
          contactPoints,
          addresses: [],
        };
  const property = {
    addressBuilding: text(formData, "addressBuilding"),
    addressStreet: text(formData, "addressStreet"),
    addressLocality: text(formData, "addressLocality"),
    townCity: text(formData, "townCity"),
    county: text(formData, "county"),
    postcode: text(formData, "postcode"),
    propertyType: text(formData, "propertyType"),
    bedrooms: optionalNumber(text(formData, "bedrooms")),
    bathrooms: optionalNumber(text(formData, "bathrooms")),
    receptionRooms: optionalNumber(text(formData, "receptionRooms")),
    floorArea: null,
    floorAreaUnit: null,
    furnishedStatus: null,
    features: [],
    parkingNotes: "",
    outdoorSpaceNotes: "",
    councilTaxBand: null,
    generalNotes: text(formData, "propertyNotes"),
  };
  return { contact, property };
}

export async function bookAppraisalAction(
  workspaceSlug: string,
  enquiryId: string,
  _previousState: AppraisalBookingState,
  formData: FormData,
): Promise<AppraisalBookingState> {
  const path = `${recordPath(workspaceSlug, enquiryId)}/book-appraisal`;
  const user = await requireMfaUser(path, { workspaceSlug });
  if (!["person", "organisation"].includes(text(formData, "contactKind"))) {
    return {
      status: "error",
      message: "Choose whether the landlord is a person or organisation.",
    };
  }
  const details = bookingDetails(formData);
  if (
    text(formData, "contactKind") === "organisation" &&
    ![
      "limited_company",
      "llp",
      "partnership",
      "trust",
      "charity",
      "other",
    ].includes(text(formData, "organisationType"))
  ) {
    return { status: "error", message: "Choose the organisation type." };
  }
  const scheduledAt = new Date(text(formData, "scheduledAtIso"));
  const assignedMembershipId = text(formData, "assignedMembershipId");
  if (Number.isNaN(scheduledAt.getTime()) || !isUuid(assignedMembershipId)) {
    return {
      status: "error",
      message: "Choose a valid date, time and staff member.",
    };
  }

  if (text(formData, "intent") !== "book") {
    const matches = await reviewAppraisalBookingDuplicates({
      authSubject: user.id,
      workspaceSlug,
      ...details,
    });
    if (!matches || !matches.contactMatches)
      return {
        status: "error",
        message: "The duplicate check could not be completed.",
      };
    return {
      status: "review",
      message:
        matches.contactMatches.length || matches.propertyMatches.length
          ? "Review the possible matches before booking."
          : "No possible duplicates found. Review the details, then book the appraisal.",
      contactMatches: matches.contactMatches.map(
        ({ contact, strength, matchedFields }) => ({
          id: contact.id,
          name:
            contact.kind === "PERSON"
              ? [contact.firstName, contact.lastName].filter(Boolean).join(" ")
              : contact.legalName || "Unnamed contact",
          reference: contact.reference,
          strength,
          matchedFields,
        }),
      ),
      propertyMatches: matches.propertyMatches,
    };
  }

  const contactChoice = text(formData, "contactChoice");
  const propertyChoice = text(formData, "propertyChoice");
  // The review never shows more than 20 contacts or 50 properties.
  const reviewedContactIds = formData
    .getAll("reviewedContactId")
    .slice(0, 20)
    .filter(
      (value): value is string => typeof value === "string" && isUuid(value),
    );
  const reviewedPropertyIds = formData
    .getAll("reviewedPropertyId")
    .slice(0, 50)
    .filter(
      (value): value is string => typeof value === "string" && isUuid(value),
    );
  const result = await bookAppraisal({
    authSubject: user.id,
    workspaceSlug,
    enquiryId,
    scheduledAt,
    assignedMembershipId,
    contact:
      contactChoice && contactChoice !== "new" && isUuid(contactChoice)
        ? { kind: "existing", contactId: contactChoice }
        : {
            kind: "new",
            contact: details.contact,
            reviewedDuplicateIds: reviewedContactIds,
          },
    property:
      propertyChoice && propertyChoice !== "new" && isUuid(propertyChoice)
        ? { kind: "existing", propertyId: propertyChoice }
        : {
            kind: "new",
            property: details.property,
            reviewedDuplicateIds: reviewedPropertyIds,
          },
  });
  if (!result.ok) {
    return {
      status: "error",
      message:
        result.error === "duplicate_review_required"
          ? "The details changed or another possible match was found. Run the duplicate check again."
          : failureMessage(result.error),
    };
  }
  revalidatePath(recordPath(workspaceSlug, enquiryId));
  revalidatePath(`/dashboard/w/${workspaceSlug}`, "layout");
  redirect(recordPath(workspaceSlug, enquiryId));
}

export async function addEnquiryTaskAction(
  workspaceSlug: string,
  enquiryId: string,
  _previousState: EnquiryActionState,
  formData: FormData,
): Promise<EnquiryActionState> {
  const path = recordPath(workspaceSlug, enquiryId);
  const user = await requireMfaUser(path, { workspaceSlug });
  const result = await addEnquiryTask({
    authSubject: user.id,
    workspaceSlug,
    enquiryId,
    title: text(formData, "title"),
    dueOn: text(formData, "dueOn"),
    assignedMembershipId: text(formData, "assignedMembershipId"),
  });
  if (!result.ok)
    return { status: "error", message: failureMessage(result.error) };
  revalidatePath(path);
  revalidatePath(`/dashboard/w/${workspaceSlug}`);
  return { status: "saved", message: "Next action added." };
}

async function closeTaskAction(
  workspaceSlug: string,
  enquiryId: string,
  taskId: string,
  cancel: boolean,
) {
  const path = recordPath(workspaceSlug, enquiryId);
  const user = await requireMfaUser(path, { workspaceSlug });
  const input = { authSubject: user.id, workspaceSlug, enquiryId, taskId };
  const result = cancel
    ? await cancelEnquiryTask(input)
    : await completeEnquiryTask(input);
  if (!result.ok) redirect(`${path}?error=task`);
  revalidatePath(path);
  revalidatePath(`/dashboard/w/${workspaceSlug}`);
}

export async function completeEnquiryTaskAction(
  workspaceSlug: string,
  enquiryId: string,
  taskId: string,
) {
  await closeTaskAction(workspaceSlug, enquiryId, taskId, false);
}

export async function cancelEnquiryTaskAction(
  workspaceSlug: string,
  enquiryId: string,
  taskId: string,
) {
  await closeTaskAction(workspaceSlug, enquiryId, taskId, true);
}

export async function assignEnquiryLeadAction(
  workspaceSlug: string,
  enquiryId: string,
  membershipId: string,
): Promise<EnquiryActionState> {
  const path = recordPath(workspaceSlug, enquiryId);
  const user = await requireMfaUser(path, { workspaceSlug });
  const result = await assignEnquiryLead({
    authSubject: user.id,
    workspaceSlug,
    enquiryId,
    membershipId: typeof membershipId === "string" ? membershipId : "",
  });
  if (!result.ok)
    return { status: "error", message: failureMessage(result.error) };
  revalidatePath(path);
  revalidatePath(`/dashboard/w/${workspaceSlug}`, "layout");
  return { status: "saved", message: "Landlord lead assigned." };
}

export async function closeEnquiryAction(
  workspaceSlug: string,
  enquiryId: string,
  _previousState: EnquiryActionState,
  formData: FormData,
): Promise<EnquiryActionState> {
  const path = recordPath(workspaceSlug, enquiryId);
  const user = await requireMfaUser(path, { workspaceSlug });
  const outcome = text(formData, "outcome");
  if (outcome !== "won" && outcome !== "lost" && outcome !== "postponed") {
    return { status: "error", message: "Choose an outcome." };
  }
  const result = await closeEnquiry({
    authSubject: user.id,
    workspaceSlug,
    enquiryId,
    outcome,
    outcomeReasonId: text(formData, "outcomeReasonId") || null,
    outcomeNote: text(formData, "outcomeNote") || null,
    followUpOn: text(formData, "followUpOn") || null,
  });
  if (!result.ok)
    return { status: "error", message: failureMessage(result.error) };
  revalidatePath(path);
  revalidatePath(`/dashboard/w/${workspaceSlug}`, "layout");
  return { status: "saved", message: "Landlord-lead outcome recorded." };
}

export async function reopenEnquiryAction(
  workspaceSlug: string,
  enquiryId: string,
  _previousState: EnquiryActionState,
  formData: FormData,
): Promise<EnquiryActionState> {
  const path = recordPath(workspaceSlug, enquiryId);
  const user = await requireMfaUser(path, { workspaceSlug });
  const result = await reopenEnquiry({
    authSubject: user.id,
    workspaceSlug,
    enquiryId,
    reason: text(formData, "reason"),
  });
  if (!result.ok)
    return { status: "error", message: failureMessage(result.error) };
  revalidatePath(path);
  revalidatePath(`/dashboard/w/${workspaceSlug}`, "layout");
  return { status: "saved", message: "Landlord lead reopened." };
}

export async function completeAppraisalAction(
  workspaceSlug: string,
  enquiryId: string,
  appraisalId: string,
  _previousState: EnquiryActionState,
  formData: FormData,
): Promise<EnquiryActionState> {
  const path = recordPath(workspaceSlug, enquiryId);
  const user = await requireMfaUser(path, { workspaceSlug });
  const result = await completeAppraisal({
    authSubject: user.id,
    workspaceSlug,
    enquiryId,
    appraisalId,
    outcome: {
      expectedMonthlyRent: text(formData, "expectedMonthlyRent"),
      recommendedService: text(formData, "recommendedService"),
      feeKind: text(formData, "feeKind"),
      feeValue: text(formData, "feeValue"),
      feeVat: text(formData, "feeVat"),
      notes: text(formData, "notes"),
    },
  });
  if (!result.ok)
    return { status: "error", message: failureMessage(result.error) };
  revalidatePath(path);
  revalidatePath(`/dashboard/w/${workspaceSlug}`, "layout");
  return { status: "saved", message: "Appraisal completed." };
}

export async function finishAppraisalAction(
  workspaceSlug: string,
  enquiryId: string,
  appraisalId: string,
  _previousState: EnquiryActionState,
  formData: FormData,
): Promise<EnquiryActionState> {
  const path = recordPath(workspaceSlug, enquiryId);
  const user = await requireMfaUser(path, { workspaceSlug });
  const disposition = text(formData, "disposition");
  const input = {
    authSubject: user.id,
    workspaceSlug,
    enquiryId,
    appraisalId,
    reason: text(formData, "reason"),
  };
  const result =
    disposition === "cancelled"
      ? await cancelAppraisal(input)
      : disposition === "did_not_attend"
        ? await recordAppraisalDidNotAttend(input)
        : null;
  if (!result) return { status: "error", message: "Choose what happened." };
  if (!result.ok)
    return { status: "error", message: failureMessage(result.error) };
  revalidatePath(path);
  revalidatePath(`/dashboard/w/${workspaceSlug}`, "layout");
  return { status: "saved", message: "Appraisal status updated." };
}
