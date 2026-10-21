"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMfaUser } from "@/core/auth/mfa";
import {
  closeEnquiry,
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
  updateScheduledAppraisal,
} from "@/core/enquiries/application/appraisals";
import {
  parseDateOnly,
  parseUkDateTime,
  validateEnquirer,
  validateTaskTitle,
  type EnquirerField,
} from "@/core/enquiries/domain/enquiry";
import {
  validateContactPoints,
  validateOrganisationDetails,
  validatePersonDetails,
} from "@/core/contacts/domain/contact";
import { createLandlordLead } from "@/core/enquiries/application/landlord-lead-flow";
import { isUuid } from "@/core/properties/domain/ids";
import { validatePropertyDetails } from "@/core/properties/domain/property";

export type EditEnquiryField =
  EnquirerField | "leadSourceId" | "leadMembershipId";

export type EditEnquiryState = {
  status: "idle" | "error";
  message: string;
  fieldErrors?: Partial<Record<EditEnquiryField, string>>;
};

export type NewLandlordLeadState = {
  status: "idle" | "error" | "review";
  message: string;
  fieldErrors?: Partial<Record<string, string>>;
  contactMatches?: AppraisalBookingState["contactMatches"];
  propertyMatches?: AppraisalBookingState["propertyMatches"];
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
  // The landlord's own address, never the property to let (optional).
  const ownAddress = {
    addressLine1: text(formData, "ownAddressLine1"),
    addressLine2: text(formData, "ownAddressLine2"),
    locality: text(formData, "ownLocality"),
    townCity: text(formData, "ownTownCity"),
    county: text(formData, "ownCounty"),
    postcode: text(formData, "ownPostcode"),
  };
  const addresses = Object.values(ownAddress).some((value) => value.trim())
    ? [
        {
          kind:
            contactKind === "organisation"
              ? ("registered" as const)
              : ("individual" as const),
          ...ownAddress,
          countryCode: "GB",
        },
      ]
    : [];
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
          addresses,
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
          addresses,
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
  // A lead saved early already has its landlord and property: only the visit
  // is needed, and nothing is created.
  if (text(formData, "linked") === "yes") {
    const visit = parseUkDateTime(text(formData, "scheduledAt"));
    const attendee = text(formData, "assignedMembershipId");
    if (!visit || !isUuid(attendee)) {
      return {
        status: "error",
        message: "Choose a valid date, time and staff member.",
      };
    }
    const enquiry = await getEnquiry({
      authSubject: user.id,
      workspaceSlug,
      enquiryId,
    });
    if (!enquiry?.contactId || !enquiry.propertyId) {
      return {
        status: "error",
        message: "This lead has no landlord and property recorded yet.",
      };
    }
    const booked = await bookAppraisal({
      authSubject: user.id,
      workspaceSlug,
      enquiryId,
      scheduledAt: visit,
      assignedMembershipId: attendee,
      bookingNotes: text(formData, "bookingNotes"),
      contact: { kind: "existing", contactId: enquiry.contactId },
      property: { kind: "existing", propertyId: enquiry.propertyId },
    });
    if (!booked.ok) {
      return { status: "error", message: failureMessage(booked.error) };
    }
    revalidatePath(recordPath(workspaceSlug, enquiryId));
    revalidatePath(`/dashboard/w/${workspaceSlug}`, "layout");
    redirect(recordPath(workspaceSlug, enquiryId));
  }
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
  const scheduledAt = parseUkDateTime(text(formData, "scheduledAt"));
  const assignedMembershipId = text(formData, "assignedMembershipId");
  if (!scheduledAt || !isUuid(assignedMembershipId)) {
    return {
      status: "error",
      message: "Choose a valid date, time and staff member.",
    };
  }

  // Continue checks for duplicates in the background. Only when something
  // matches does the person see a review; otherwise it books straight away.
  const reviewMatches = async (): Promise<AppraisalBookingState> => {
    const matches = await reviewAppraisalBookingDuplicates({
      authSubject: user.id,
      workspaceSlug,
      ...details,
    });
    if (!matches || !matches.contactMatches) {
      return {
        status: "error",
        message: "The duplicate check could not be completed.",
      };
    }
    return {
      status:
        matches.contactMatches.length || matches.propertyMatches.length
          ? "review"
          : "idle",
      message: "",
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
  };
  if (text(formData, "intent") !== "book") {
    const review = await reviewMatches();
    if (review.status !== "idle") return review;
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
    bookingNotes: text(formData, "bookingNotes"),
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
    // Another possible match appeared between the check and the save: show it.
    if (result.error === "duplicate_review_required") {
      const review = await reviewMatches();
      if (review.status === "review") return review;
      return {
        status: "error",
        message: "Another possible match was found. Try again.",
      };
    }
    return { status: "error", message: failureMessage(result.error) };
  }
  revalidatePath(recordPath(workspaceSlug, enquiryId));
  revalidatePath(`/dashboard/w/${workspaceSlug}`, "layout");
  redirect(recordPath(workspaceSlug, enquiryId));
}

/**
 * The whole New landlord lead step. Continue checks for duplicates in the
 * background and only shows a review when something matches; otherwise the
 * landlord, property, lead and (if chosen) appraisal are saved together.
 */
export async function createLandlordLeadAction(
  workspaceSlug: string,
  _previousState: NewLandlordLeadState,
  formData: FormData,
): Promise<NewLandlordLeadState> {
  const base = `/dashboard/w/${workspaceSlug}/enquiries`;
  const user = await requireMfaUser(`${base}/new`, { workspaceSlug });
  const contactKind = text(formData, "contactKind");
  const details = bookingDetails(formData);
  const errors: Record<string, string> = {};

  // The landlord.
  if (contactKind === "person" && details.contact.kind === "person") {
    const person = validatePersonDetails(details.contact.details);
    if (!person.ok) Object.assign(errors, person.fieldErrors);
  } else if (
    contactKind === "organisation" &&
    details.contact.kind === "organisation"
  ) {
    const organisation = validateOrganisationDetails(details.contact.details);
    if (!organisation.ok) Object.assign(errors, organisation.fieldErrors);
    if (
      ![
        "limited_company",
        "llp",
        "partnership",
        "trust",
        "charity",
        "other",
      ].includes(text(formData, "organisationType"))
    ) {
      errors.organisationType = "Choose the organisation type.";
    }
  } else {
    errors.contactKind =
      "Choose whether the landlord is a person or an organisation.";
  }
  if (!details.contact.contactPoints.length) {
    errors.telephone = "Enter a telephone number or an email address.";
  } else if (!validateContactPoints(details.contact.contactPoints).ok) {
    errors.email = "Check the email address and telephone number.";
  }
  const own = details.contact.addresses[0];
  if (own) {
    if (!own.addressLine1.trim())
      errors.ownAddressLine1 = "Enter the first line.";
    if (!own.townCity.trim()) errors.ownTownCity = "Enter the town or city.";
    if (!own.postcode.trim()) errors.ownPostcode = "Enter the postcode.";
  }

  // The property to let.
  const property = validatePropertyDetails(details.property);
  if (!property.ok) {
    for (const [field, message] of Object.entries(property.errors)) {
      errors[field === "generalNotes" ? "propertyNotes" : field] = message;
    }
  }

  // The lead.
  const branchId = text(formData, "branchId");
  const leadSourceId = text(formData, "leadSourceId");
  const leadMembershipId = text(formData, "leadMembershipId");
  if (!isUuid(branchId)) errors.branchId = "Choose a responsible branch.";
  if (leadSourceId && !isUuid(leadSourceId)) {
    errors.leadSourceId = "Choose a lead source from the list.";
  }
  if (leadMembershipId && !isUuid(leadMembershipId)) {
    errors.leadMembershipId = "Choose a staff member from the list.";
  }

  // What happens next.
  const nextKind = text(formData, "next");
  let next: Parameters<typeof createLandlordLead>[0]["next"] = {
    kind: "none",
  };
  if (nextKind === "appraisal") {
    const scheduledAt = parseUkDateTime(text(formData, "scheduledAt"));
    const assignedMembershipId = text(formData, "assignedMembershipId");
    if (!scheduledAt) {
      errors.scheduledAt = "Choose the date and time of the appraisal.";
    }
    if (!isUuid(assignedMembershipId)) {
      errors.assignedMembershipId = "Choose who will attend.";
    }
    if (scheduledAt) {
      next = {
        kind: "appraisal",
        scheduledAt,
        assignedMembershipId,
        bookingNotes: text(formData, "bookingNotes"),
      };
    }
  } else if (nextKind === "task") {
    const title = validateTaskTitle(text(formData, "taskTitle"));
    const dueOn = text(formData, "taskDueOn");
    const assignedMembershipId = text(formData, "taskAssigneeId");
    if (!title.ok) errors.taskTitle = title.error;
    if (!parseDateOnly(dueOn)) errors.taskDueOn = "Choose a due date.";
    if (!isUuid(assignedMembershipId)) {
      errors.taskAssigneeId = "Choose who will do this.";
    }
    next = {
      kind: "task",
      title: title.ok ? title.title : "",
      dueOn,
      assignedMembershipId,
    };
  } else if (nextKind !== "none") {
    errors.next = "Choose what happens next.";
  }

  if (Object.keys(errors).length) {
    return {
      status: "error",
      message: "Check the highlighted details and try again.",
      fieldErrors: errors,
    };
  }

  const reviewMatches = async (): Promise<NewLandlordLeadState> => {
    const matches = await reviewAppraisalBookingDuplicates({
      authSubject: user.id,
      workspaceSlug,
      ...details,
    });
    if (!matches || !matches.contactMatches) {
      return {
        status: "error",
        message: "The duplicate check could not be completed.",
      };
    }
    return {
      status:
        matches.contactMatches.length || matches.propertyMatches.length
          ? "review"
          : "idle",
      message: "",
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
  };
  if (text(formData, "intent") !== "book") {
    const review = await reviewMatches();
    if (review.status !== "idle") return review;
  }

  const contactChoice = text(formData, "contactChoice");
  const propertyChoice = text(formData, "propertyChoice");
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
  const result = await createLandlordLead({
    authSubject: user.id,
    workspaceSlug,
    branchId,
    leadSourceId: leadSourceId || null,
    leadMembershipId: leadMembershipId || null,
    summary: text(formData, "summary"),
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
    next,
  });
  if (!result.ok) {
    // Another possible match appeared between the check and the save.
    if (result.error === "duplicate_review_required") {
      const review = await reviewMatches();
      if (review.status === "review") return review;
      return {
        status: "error",
        message: "Another possible match was found. Try again.",
      };
    }
    return { status: "error", message: failureMessage(result.error) };
  }
  revalidatePath(base);
  revalidatePath(`/dashboard/w/${workspaceSlug}`, "layout");
  redirect(`${base}/${result.enquiryId}`);
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
  if (outcome !== "lost" && outcome !== "postponed") {
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

export async function updateScheduledAppraisalAction(
  workspaceSlug: string,
  enquiryId: string,
  appraisalId: string,
  _previousState: EnquiryActionState,
  formData: FormData,
): Promise<EnquiryActionState> {
  const path = recordPath(workspaceSlug, enquiryId);
  const user = await requireMfaUser(path, { workspaceSlug });
  const scheduledAt = parseUkDateTime(text(formData, "scheduledAt"));
  const assignedMembershipId = text(formData, "assignedMembershipId");
  if (!scheduledAt || !isUuid(assignedMembershipId)) {
    return {
      status: "error",
      message: "Choose a valid date, time and staff member.",
    };
  }
  const result = await updateScheduledAppraisal({
    authSubject: user.id,
    workspaceSlug,
    enquiryId,
    appraisalId,
    scheduledAt,
    assignedMembershipId,
    bookingNotes: text(formData, "bookingNotes"),
  });
  if (!result.ok) {
    return { status: "error", message: failureMessage(result.error) };
  }
  revalidatePath(path);
  revalidatePath(`/dashboard/w/${workspaceSlug}`, "layout");
  return { status: "saved", message: "Appraisal booking updated." };
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
