"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { InstructionActionState } from "@/app/dashboard/w/[workspaceSlug]/instructions/actions";
import {
  changeApplicantStatus,
  addApplicantMember,
  assignApplicant,
  createApplicant,
  removeApplicantMember,
  saveRequirements,
} from "@/core/applicants/application/applicants";
import {
  moveEnquiry,
  registerPropertyEnquiry,
} from "@/core/applicants/application/property-enquiries";
import { findDuplicateContacts } from "@/core/contacts/application/contacts";
import {
  validateContactPoints,
  validatePersonDetails,
} from "@/core/contacts/domain/contact";
import type {
  ApplicantError,
  ApplicantFailure,
} from "@/core/applicants/application/applicant-shared";
import { requireMfaUser } from "@/core/auth/mfa";
import { isUuid } from "@/core/properties/domain/ids";

// Workspace and record ids are bound in the page; everything the browser sends
// in a form is untrusted. Only named fields are read, and the service checks
// the permission, the branch and the workspace again.

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

const FAILURES: Record<ApplicantError, string> = {
  access_denied: "You do not have access to change this applicant.",
  applicant_not_found:
    "The applicant could not be found, or you do not have access to it.",
  enquiry_not_found:
    "The property enquiry could not be found, or you do not have access to it.",
  listing_not_found:
    "The home could not be found, or you do not have access to it.",
  contact_not_found:
    "The contact could not be found, or you do not have access to it.",
  member_not_found: "That household member could not be found.",
  list_item_not_found: "That choice is no longer available. Choose another.",
  invalid_input: "Check the details and try again.",
  duplicate_review_required:
    "This contact looks like an existing one. Review the match first.",
  applicant_exists: "This contact already has an open applicant record.",
  applicant_closed: "This applicant is closed, so it cannot be changed.",
  listing_not_ready:
    "Only a home that is Ready to advertise (inside Zayto only) can take an enquiry.",
  already_enquired: "This applicant already has an open enquiry for that home.",
  branch_access_needed:
    "Recording this needs access to both the applicant's branch and the home's branch. Ask a manager.",
  invalid_state:
    "That could not be done because the record has changed. Reload the page and try again.",
};

function failureMessage(failure: ApplicantFailure) {
  return FAILURES[failure.error];
}

function applicantPath(workspaceSlug: string, applicantId: string) {
  return `/dashboard/w/${workspaceSlug}/applicants/${applicantId}`;
}

function refresh(workspaceSlug: string, applicantId: string) {
  if (isUuid(applicantId)) {
    revalidatePath(applicantPath(workspaceSlug, applicantId));
  }
  revalidatePath(`/dashboard/w/${workspaceSlug}/applicants`);
}

export async function changeApplicantStatusAction(
  workspaceSlug: string,
  applicantId: string,
  _previous: InstructionActionState,
  formData: FormData,
): Promise<InstructionActionState> {
  const user = await requireMfaUser(applicantPath(workspaceSlug, applicantId), {
    workspaceSlug,
  });
  const result = await changeApplicantStatus({
    authSubject: user.id,
    workspaceSlug,
    applicantId,
    to: text(formData, "to"),
    reasonId: text(formData, "reasonId") || null,
    note: text(formData, "note"),
  });
  if (!result.ok) {
    return {
      status: "error",
      message: failureMessage(result),
      fieldErrors: result.fieldErrors,
    };
  }
  refresh(workspaceSlug, applicantId);
  return { status: "saved", message: "Status updated." };
}

/** The email and telephone fields as contact points (email preferred). */
function contactPointsFrom(formData: FormData) {
  return [
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
}

export type NewApplicantState = {
  status: "idle" | "error" | "review";
  message: string;
  fieldErrors?: Partial<Record<string, string>>;
  contactMatches?: {
    id: string;
    name: string;
    reference: string;
    strength: "strong" | "possible";
    matchedFields: string[];
  }[];
};

/**
 * The New applicant modal: the lead contact (a person), the branch, the source
 * and the owner. Continue checks for a matching contact first and only asks
 * when something may match. Requirements, household and next actions are added
 * on the applicant afterwards.
 */
export async function createApplicantAction(
  workspaceSlug: string,
  _previousState: NewApplicantState,
  formData: FormData,
): Promise<NewApplicantState> {
  const base = `/dashboard/w/${workspaceSlug}/applicants`;
  const user = await requireMfaUser(base, { workspaceSlug });
  const errors: Record<string, string> = {};

  const person = {
    title: "",
    firstName: text(formData, "firstName"),
    middleNames: "",
    lastName: text(formData, "lastName"),
    preferredName: "",
  };
  const validPerson = validatePersonDetails(person);
  if (!validPerson.ok) Object.assign(errors, validPerson.fieldErrors);
  const contactPoints = contactPointsFrom(formData);
  if (!contactPoints.length) {
    errors.telephone = "Enter a telephone number or an email address.";
  } else if (!validateContactPoints(contactPoints).ok) {
    errors.email = "Check the email address and telephone number.";
  }
  const branchId = text(formData, "branchId");
  const leadSourceId = text(formData, "leadSourceId");
  const leadMembershipId = text(formData, "leadMembershipId");
  if (!isUuid(branchId)) errors.branchId = "Choose a branch.";
  if (leadSourceId && !isUuid(leadSourceId)) {
    errors.leadSourceId = "Choose a source from the list.";
  }
  if (leadMembershipId && !isUuid(leadMembershipId)) {
    errors.leadMembershipId = "Choose a staff member from the list.";
  }
  if (Object.keys(errors).length) {
    return {
      status: "error",
      message: "Check the highlighted details and try again.",
      fieldErrors: errors,
    };
  }

  const contact = {
    kind: "person" as const,
    details: person,
    communication: {
      preferred: null,
      doNotEmail: false,
      doNotTelephone: false,
      doNotSms: false,
      doNotWhatsApp: false,
      doNotPost: false,
    },
    contactPoints,
    addresses: [],
  };

  const reviewMatches = async (): Promise<NewApplicantState> => {
    const matches = await findDuplicateContacts({
      authSubject: user.id,
      workspaceSlug,
      name: `${person.firstName} ${person.lastName}`,
      email: text(formData, "email") || undefined,
      telephone: text(formData, "telephone") || undefined,
    });
    if (!matches) {
      return {
        status: "error",
        message: "The duplicate check could not be completed.",
      };
    }
    return {
      status: matches.length ? "review" : "idle",
      message: "",
      contactMatches: matches.map(
        ({ contact: match, strength, matchedFields }) => ({
          id: match.id,
          name:
            match.kind === "PERSON"
              ? [match.firstName, match.lastName].filter(Boolean).join(" ")
              : match.legalName || "Unnamed contact",
          reference: match.reference,
          strength,
          matchedFields,
        }),
      ),
    };
  };
  if (text(formData, "intent") !== "book") {
    const review = await reviewMatches();
    if (review.status !== "idle") return review;
  }

  const contactChoice = text(formData, "contactChoice");
  const reviewedContactIds = formData
    .getAll("reviewedContactId")
    .slice(0, 20)
    .filter(
      (value): value is string => typeof value === "string" && isUuid(value),
    );
  const result = await createApplicant({
    authSubject: user.id,
    workspaceSlug,
    branchId,
    leadSourceId: leadSourceId || null,
    leadMembershipId: leadMembershipId || null,
    contact:
      contactChoice && contactChoice !== "new" && isUuid(contactChoice)
        ? { kind: "existing", contactId: contactChoice }
        : {
            kind: "new",
            contact,
            reviewedDuplicateIds: reviewedContactIds,
          },
  });
  if (!result.ok) {
    // A match appeared between the check and the save.
    if (result.error === "duplicate_review_required") {
      const review = await reviewMatches();
      if (review.status === "review") return review;
    }
    return { status: "error", message: failureMessage(result) };
  }
  revalidatePath(base);
  revalidatePath(`/dashboard/w/${workspaceSlug}`, "layout");
  redirect(`${base}/${result.applicantId}?created=yes`);
}

function wholeNumber(value: string) {
  const trimmed = value.trim();
  // A bad entry stays NaN so the rules reject it with a message.
  return trimmed ? Number(trimmed) : null;
}

/** Saves what the household is looking for as a new version (only if it changed). */
export async function saveApplicantRequirementsAction(
  workspaceSlug: string,
  applicantId: string,
  _previous: InstructionActionState,
  formData: FormData,
): Promise<InstructionActionState> {
  const user = await requireMfaUser(applicantPath(workspaceSlug, applicantId), {
    workspaceSlug,
  });
  const result = await saveRequirements({
    authSubject: user.id,
    workspaceSlug,
    applicantId,
    requirements: {
      areas: text(formData, "areas").split(/[\n,]/),
      minRent: text(formData, "minRent"),
      maxRent: text(formData, "maxRent"),
      rentPeriod: text(formData, "rentPeriod"),
      minBedrooms: wholeNumber(text(formData, "minBedrooms")),
      maxBedrooms: wholeNumber(text(formData, "maxBedrooms")),
      propertyTypes: formData
        .getAll("propertyTypes")
        .filter((value): value is string => typeof value === "string"),
      furnished: text(formData, "furnished"),
      moveFrom: text(formData, "moveFrom"),
      moveBy: text(formData, "moveBy"),
      householdSize: wholeNumber(text(formData, "householdSize")),
      hasPets: text(formData, "hasPets") === "yes",
      notes: text(formData, "notes"),
    },
  });
  if (!result.ok) {
    return {
      status: "error",
      message: failureMessage(result),
      fieldErrors: result.fieldErrors,
    };
  }
  refresh(workspaceSlug, applicantId);
  return {
    status: "saved",
    message: result.unchanged
      ? "Nothing had changed."
      : "Requirements saved as a new version.",
  };
}

/**
 * Adds another adult to the household as a new contact. A possible match with
 * an existing contact is shown first; the person ticks a box to confirm that
 * this is a different person (the same rule as everywhere else, ADR-036).
 */
export async function addApplicantMemberAction(
  workspaceSlug: string,
  applicantId: string,
  _previous: InstructionActionState,
  formData: FormData,
): Promise<InstructionActionState> {
  const user = await requireMfaUser(applicantPath(workspaceSlug, applicantId), {
    workspaceSlug,
  });
  const person = {
    title: "",
    firstName: text(formData, "firstName"),
    middleNames: "",
    lastName: text(formData, "lastName"),
    preferredName: "",
  };
  const errors: Record<string, string> = {};
  const validPerson = validatePersonDetails(person);
  if (!validPerson.ok) Object.assign(errors, validPerson.fieldErrors);
  const contactPoints = contactPointsFrom(formData);
  if (!contactPoints.length) {
    errors.telephone = "Enter a telephone number or an email address.";
  } else if (!validateContactPoints(contactPoints).ok) {
    errors.email = "Check the email address and telephone number.";
  }
  if (Object.keys(errors).length) {
    return {
      status: "error",
      message: "Check the highlighted details and try again.",
      fieldErrors: errors,
    };
  }

  const matches =
    (await findDuplicateContacts({
      authSubject: user.id,
      workspaceSlug,
      name: `${person.firstName} ${person.lastName}`,
      email: text(formData, "email") || undefined,
      telephone: text(formData, "telephone") || undefined,
    })) ?? [];
  if (matches.length && text(formData, "different") !== "yes") {
    const names = matches
      .slice(0, 3)
      .map(({ contact }) =>
        contact.kind === "PERSON"
          ? `${[contact.firstName, contact.lastName].filter(Boolean).join(" ")} (${contact.reference})`
          : `${contact.legalName || "Unnamed contact"} (${contact.reference})`,
      )
      .join(", ");
    return {
      status: "error",
      message: "This person may already be a contact.",
      fieldErrors: {
        different: `Possible match: ${names}. Tick the box if this is a different person.`,
      },
    };
  }

  const result = await addApplicantMember({
    authSubject: user.id,
    workspaceSlug,
    applicantId,
    contact: {
      kind: "new",
      contact: {
        kind: "person",
        details: person,
        communication: {
          preferred: null,
          doNotEmail: false,
          doNotTelephone: false,
          doNotSms: false,
          doNotWhatsApp: false,
          doNotPost: false,
        },
        contactPoints,
        addresses: [],
      },
      reviewedDuplicateIds: matches.map(({ contact }) => contact.id),
    },
  });
  if (!result.ok) {
    return { status: "error", message: failureMessage(result) };
  }
  refresh(workspaceSlug, applicantId);
  return { status: "saved", message: "Household member added." };
}

/** Takes someone off the household. Their contact and history are kept. */
export async function removeApplicantMemberAction(
  workspaceSlug: string,
  applicantId: string,
  memberId: string,
): Promise<InstructionActionState> {
  const user = await requireMfaUser(applicantPath(workspaceSlug, applicantId), {
    workspaceSlug,
  });
  const result = await removeApplicantMember({
    authSubject: user.id,
    workspaceSlug,
    applicantId,
    memberId,
  });
  if (!result.ok) {
    return { status: "error", message: failureMessage(result) };
  }
  refresh(workspaceSlug, applicantId);
  return { status: "saved", message: "Household member removed." };
}

/** Changes who looks after the applicant (or clears the owner). */
export async function assignApplicantAction(
  workspaceSlug: string,
  applicantId: string,
  _previous: InstructionActionState,
  formData: FormData,
): Promise<InstructionActionState> {
  const user = await requireMfaUser(applicantPath(workspaceSlug, applicantId), {
    workspaceSlug,
  });
  const result = await assignApplicant({
    authSubject: user.id,
    workspaceSlug,
    applicantId,
    membershipId: text(formData, "membershipId") || null,
  });
  if (!result.ok) {
    return { status: "error", message: failureMessage(result) };
  }
  refresh(workspaceSlug, applicantId);
  return { status: "saved", message: "Owner changed." };
}

/**
 * Records that an applicant is interested in a home. Only a Ready to advertise
 * home can take an enquiry; the service and the database both check it.
 */
export async function registerEnquiryAction(
  workspaceSlug: string,
  applicantId: string,
  listingId: string,
): Promise<InstructionActionState> {
  const user = await requireMfaUser(applicantPath(workspaceSlug, applicantId), {
    workspaceSlug,
  });
  const result = await registerPropertyEnquiry({
    authSubject: user.id,
    workspaceSlug,
    applicantId,
    listingId,
  });
  if (!result.ok) {
    return { status: "error", message: failureMessage(result) };
  }
  refresh(workspaceSlug, applicantId);
  if (isUuid(listingId)) {
    revalidatePath(`/dashboard/w/${workspaceSlug}/marketing/${listingId}`);
  }
  return { status: "saved", message: "Enquiry recorded." };
}

/**
 * Moves a property enquiry one step on or back, or closes it with a reason.
 * The service checks the step, the reason and the person's branch access.
 */
export async function moveEnquiryAction(
  workspaceSlug: string,
  enquiryId: string,
  to: string,
  _previous: InstructionActionState,
  formData: FormData,
): Promise<InstructionActionState> {
  const path = `/dashboard/w/${workspaceSlug}/property-enquiries`;
  const user = await requireMfaUser(path, { workspaceSlug });
  const result = await moveEnquiry({
    authSubject: user.id,
    workspaceSlug,
    enquiryId,
    to,
    reasonId: text(formData, "reasonId") || null,
    note: text(formData, "note"),
  });
  if (!result.ok) {
    return {
      status: "error",
      message: failureMessage(result),
      fieldErrors: result.fieldErrors,
    };
  }
  revalidatePath(path);
  revalidatePath(`/dashboard/w/${workspaceSlug}/applicants`, "layout");
  revalidatePath(`/dashboard/w/${workspaceSlug}/marketing`, "layout");
  return { status: "saved", message: "Enquiry updated." };
}

/**
 * The New enquiry pop-up: an existing applicant, a Ready to advertise home and
 * where the enquiry came from. The service checks the home is Ready to
 * advertise and that the person has access to both branches.
 */
export async function createEnquiryAction(
  workspaceSlug: string,
  _previous: InstructionActionState,
  formData: FormData,
): Promise<InstructionActionState> {
  const path = `/dashboard/w/${workspaceSlug}/property-enquiries`;
  const user = await requireMfaUser(path, { workspaceSlug });
  const applicantId = text(formData, "applicantId");
  const listingId = text(formData, "listingId");
  const leadSourceId = text(formData, "leadSourceId");
  const errors: Record<string, string> = {};
  if (!isUuid(applicantId)) errors.applicantId = "Choose an applicant.";
  if (!isUuid(listingId)) errors.listingId = "Choose a home.";
  if (leadSourceId && !isUuid(leadSourceId)) {
    errors.leadSourceId = "Choose a source from the list.";
  }
  if (Object.keys(errors).length) {
    return {
      status: "error",
      message: "Check the highlighted details and try again.",
      fieldErrors: errors,
    };
  }
  const result = await registerPropertyEnquiry({
    authSubject: user.id,
    workspaceSlug,
    applicantId,
    listingId,
    leadSourceId: leadSourceId || null,
  });
  if (!result.ok) {
    return { status: "error", message: failureMessage(result) };
  }
  revalidatePath(path);
  refresh(workspaceSlug, applicantId);
  revalidatePath(`/dashboard/w/${workspaceSlug}/marketing/${listingId}`);
  return { status: "saved", message: "Enquiry recorded." };
}
