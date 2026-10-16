"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { NoteFormState } from "@/app/dashboard/w/[workspaceSlug]/contacts/actions";
import { requireMfaUser } from "@/core/auth/mfa";
import {
  createContact,
  findDuplicateContacts,
  listContacts,
} from "@/core/contacts/application/contacts";
import {
  validateContactPoints,
  validateOrganisationDetails,
  validatePersonDetails,
  type ContactPointInput,
  type OrganisationDetailsInput,
  type PersonDetailsInput,
} from "@/core/contacts/domain/contact";
import {
  archiveProperty,
  createProperty,
  findDuplicateProperties,
  reactivateProperty,
  type PropertyDuplicate,
} from "@/core/properties/application/properties";
import {
  addPropertyOwner,
  endPropertyOwnership,
  setPropertyLeadOwner,
  type OwnerInput,
} from "@/core/properties/application/property-ownership";
import {
  validatePropertyDetails,
  type PropertyDetailsInput,
} from "@/core/properties/domain/property";
import {
  addPropertyNote,
  editPropertyNote,
  voidPropertyNote,
} from "@/core/properties/application/property-notes";
import type { PropertyWriteError } from "@/core/properties/application/property-shared";
import { SEARCH_TEXT_MAX, isUuid } from "@/core/properties/domain/ids";

// Arguments bound in the page (workspace and record ids) are encrypted by
// Next.js, but anything the browser sends when it calls an action, such as a
// form field or an object argument, is untrusted. Read those explicitly and
// never spread them into a call that carries the signed-in identity.

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

// The browser sends the chosen time as an ISO string in its own time zone.
function noteOccurredAt(formData: FormData) {
  const value = text(formData, "occurredAt").trim();
  return value ? new Date(value) : null;
}

function noteFailure(error: PropertyWriteError): NoteFormState {
  return {
    status: "error",
    message:
      error === "invalid_input"
        ? "Check the note details and try again."
        : error === "invalid_state"
          ? "This note can no longer be changed."
          : "The note could not be saved. Check your access and try again.",
  };
}

export async function addPropertyNoteAction(
  workspaceSlug: string,
  propertyId: string,
  _previousState: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const path = `/dashboard/w/${workspaceSlug}/properties/${propertyId}`;
  const user = await requireMfaUser(path, { workspaceSlug });
  const result = await addPropertyNote({
    authSubject: user.id,
    workspaceSlug,
    propertyId,
    body: text(formData, "body"),
    occurredAt: noteOccurredAt(formData),
  });
  if (!result.ok) return noteFailure(result.error);
  revalidatePath(path);
  return { status: "saved", message: "Note added." };
}

export async function editPropertyNoteAction(
  workspaceSlug: string,
  propertyId: string,
  noteId: string,
  _previousState: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const path = `/dashboard/w/${workspaceSlug}/properties/${propertyId}`;
  const user = await requireMfaUser(path, { workspaceSlug });
  const result = await editPropertyNote({
    authSubject: user.id,
    workspaceSlug,
    propertyId,
    noteId,
    body: text(formData, "body"),
    occurredAt: noteOccurredAt(formData),
    reason: text(formData, "reason"),
  });
  if (!result.ok) return noteFailure(result.error);
  revalidatePath(path);
  return { status: "saved", message: "Note updated." };
}

export async function voidPropertyNoteAction(
  workspaceSlug: string,
  propertyId: string,
  noteId: string,
  _previousState: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const path = `/dashboard/w/${workspaceSlug}/properties/${propertyId}`;
  const user = await requireMfaUser(path, { workspaceSlug });
  const result = await voidPropertyNote({
    authSubject: user.id,
    workspaceSlug,
    propertyId,
    noteId,
    reason: text(formData, "reason"),
  });
  if (!result.ok) return noteFailure(result.error);
  revalidatePath(path);
  return { status: "saved", message: "Note voided." };
}

export async function changePropertyArchiveAction(
  workspaceSlug: string,
  propertyId: string,
  reactivate: boolean,
) {
  const path = `/dashboard/w/${workspaceSlug}/properties/${propertyId}`;
  const user = await requireMfaUser(path, { workspaceSlug });
  const input = { authSubject: user.id, workspaceSlug, propertyId };
  const result = reactivate
    ? await reactivateProperty(input)
    : await archiveProperty(input);
  if (!result.ok) {
    redirect(
      `${path}?error=${result.error === "has_open_enquiry" ? "has_open_enquiry" : "archive"}`,
    );
  }
  revalidatePath(path);
  revalidatePath(`/dashboard/w/${workspaceSlug}/properties`);
  redirect(path);
}

export type OwnerChangeState = {
  status: "saved" | "error";
  message: string;
};

function ownerFailure(error: PropertyWriteError): OwnerChangeState {
  return {
    status: "error",
    message:
      error === "invalid_input"
        ? "Check the reason and dates, then try again."
        : error === "invalid_state"
          ? "That change is no longer possible. They may already be an owner or the ownership may have ended."
          : error === "contact_not_found" || error === "ownership_not_found"
            ? "That owner could not be found. Refresh the page and try again."
            : "The change could not be saved. Check your access and try again.",
  };
}

export async function addOwnerAction(
  workspaceSlug: string,
  propertyId: string,
  owner: { contactId: string; isLead: boolean; startedOn: string },
): Promise<OwnerChangeState> {
  const path = `/dashboard/w/${workspaceSlug}/properties/${propertyId}`;
  const user = await requireMfaUser(path, { workspaceSlug });
  if (!isUuid(owner?.contactId)) return ownerFailure("contact_not_found");
  const result = await addPropertyOwner({
    authSubject: user.id,
    workspaceSlug,
    propertyId,
    owner: {
      contactId: owner.contactId,
      isLead: owner.isLead === true,
      startedOn: String(owner.startedOn ?? ""),
    },
  });
  if (!result.ok) return ownerFailure(result.error);
  revalidatePath(path);
  revalidatePath(`/dashboard/w/${workspaceSlug}/contacts`, "layout");
  return { status: "saved", message: "Owner added." };
}

export async function setLeadOwnerAction(
  workspaceSlug: string,
  propertyId: string,
  ownershipId: string,
): Promise<OwnerChangeState> {
  const path = `/dashboard/w/${workspaceSlug}/properties/${propertyId}`;
  const user = await requireMfaUser(path, { workspaceSlug });
  const result = await setPropertyLeadOwner({
    authSubject: user.id,
    workspaceSlug,
    propertyId,
    ownershipId,
  });
  if (!result.ok) return ownerFailure(result.error);
  revalidatePath(path);
  revalidatePath(`/dashboard/w/${workspaceSlug}/properties`);
  return { status: "saved", message: "Lead landlord changed." };
}

export async function endOwnershipAction(
  workspaceSlug: string,
  propertyId: string,
  ownershipId: string,
  input: { reason: string; endedOn: string },
): Promise<OwnerChangeState> {
  const path = `/dashboard/w/${workspaceSlug}/properties/${propertyId}`;
  const user = await requireMfaUser(path, { workspaceSlug });
  const result = await endPropertyOwnership({
    authSubject: user.id,
    workspaceSlug,
    propertyId,
    ownershipId,
    reason: String(input?.reason ?? ""),
    endedOn: String(input?.endedOn ?? ""),
  });
  if (!result.ok) return ownerFailure(result.error);
  revalidatePath(path);
  revalidatePath(`/dashboard/w/${workspaceSlug}/properties`);
  revalidatePath(`/dashboard/w/${workspaceSlug}/contacts`, "layout");
  return { status: "saved", message: "Ownership ended." };
}

export type OwnerContactResult = {
  id: string;
  label: string;
  reference: string;
  kind: "person" | "organisation";
};

function contactLabel(contact: {
  kind: "PERSON" | "ORGANISATION";
  firstName: string | null;
  lastName: string | null;
  legalName: string | null;
}) {
  return contact.kind === "PERSON"
    ? [contact.firstName, contact.lastName].filter(Boolean).join(" ")
    : (contact.legalName ?? "Unnamed organisation");
}

export async function searchOwnerContactsAction(
  workspaceSlug: string,
  query: string,
): Promise<OwnerContactResult[]> {
  const user = await requireMfaUser(
    `/dashboard/w/${workspaceSlug}/properties`,
    { workspaceSlug },
  );
  const contacts = await listContacts({
    authSubject: user.id,
    workspaceSlug,
    query: String(query ?? "").slice(0, SEARCH_TEXT_MAX),
    limit: 20,
  });
  return (contacts ?? []).slice(0, 20).map((contact) => ({
    id: contact.id,
    label: contactLabel(contact),
    reference: contact.reference,
    kind: contact.kind === "PERSON" ? "person" : "organisation",
  }));
}

export async function findDuplicatePropertiesAction(
  workspaceSlug: string,
  address: { building: string; street: string; postcode: string },
): Promise<PropertyDuplicate[]> {
  const user = await requireMfaUser(
    `/dashboard/w/${workspaceSlug}/properties`,
    { workspaceSlug },
  );
  // Named fields only: a spread here would let the browser replace the
  // signed-in identity or workspace.
  return findDuplicateProperties({
    authSubject: user.id,
    workspaceSlug,
    building: String(address?.building ?? "").slice(0, 160),
    street: String(address?.street ?? "").slice(0, 160),
    postcode: String(address?.postcode ?? "").slice(0, 16),
  });
}

export type QuickAddOwnerInput =
  | { kind: "person"; firstName: string; lastName: string }
  | { kind: "organisation"; legalName: string };

export type QuickAddOwnerState =
  | { status: "error"; message: string; fieldErrors?: Record<string, string> }
  | {
      status: "duplicates";
      message: string;
      reviewToken: string;
      duplicates: (OwnerContactResult & {
        strength: "strong" | "possible";
      })[];
    }
  | { status: "created"; contact: OwnerContactResult };

/**
 * Creates a minimal contact so it can be chosen as an owner straight away.
 * The same duplicate check as the contact form runs first, and the person
 * can still choose to create the contact anyway.
 */
export async function quickAddOwnerAction(
  workspaceSlug: string,
  branchId: string,
  input: QuickAddOwnerInput & {
    email: string;
    telephone: string;
    reviewToken: string;
  },
): Promise<QuickAddOwnerState> {
  const user = await requireMfaUser(
    `/dashboard/w/${workspaceSlug}/properties`,
    { workspaceSlug },
  );
  if (
    !isUuid(branchId) ||
    (input?.kind !== "person" && input?.kind !== "organisation")
  ) {
    return {
      status: "error",
      message: "Choose the responsible branch and the type of contact.",
    };
  }
  const email = String(input.email ?? "").trim();
  const telephone = String(input.telephone ?? "").trim();
  const points: ContactPointInput[] = [
    ...(email
      ? [
          {
            kind: "email" as const,
            value: email,
            label: "Work",
            isPreferred: true,
          },
        ]
      : []),
    ...(telephone
      ? [
          {
            kind: "telephone" as const,
            value: telephone,
            label: "Mobile",
            isPreferred: true,
          },
        ]
      : []),
  ];
  const person: PersonDetailsInput | null =
    input.kind === "person"
      ? {
          title: "",
          firstName: String(input.firstName ?? ""),
          middleNames: "",
          lastName: String(input.lastName ?? ""),
          preferredName: "",
        }
      : null;
  const organisation: OrganisationDetailsInput | null =
    input.kind === "organisation"
      ? {
          type: "other",
          legalName: String(input.legalName ?? ""),
          tradingName: "",
          registrationNumber: "",
          vatNumber: "",
        }
      : null;

  const fieldErrors: Record<string, string> = {};
  const details = person
    ? validatePersonDetails(person)
    : validateOrganisationDetails(organisation!);
  if (!details.ok) Object.assign(fieldErrors, details.fieldErrors);
  if (!points.length) {
    fieldErrors.contactMethods = "Add an email or telephone.";
  } else if (!validateContactPoints(points).ok) {
    fieldErrors.contactMethods =
      "Check the email address and telephone number.";
  }
  if (Object.keys(fieldErrors).length) {
    return {
      status: "error",
      message: "Review the highlighted details.",
      fieldErrors,
    };
  }

  const reviewToken = createHash("sha256")
    .update(
      JSON.stringify({
        kind: input.kind,
        points: points.map(({ kind, value }) => [kind, value.trim()]),
        name: person
          ? [person.firstName.trim(), person.lastName.trim()]
          : organisation?.legalName.trim(),
      }),
    )
    .digest("hex");
  if (input.reviewToken !== reviewToken) {
    const candidates = await findDuplicateContacts({
      authSubject: user.id,
      workspaceSlug,
      email: email || undefined,
      telephone: telephone || undefined,
      name: person
        ? `${person.firstName} ${person.lastName}`
        : organisation?.legalName,
    });
    if (candidates?.length) {
      return {
        status: "duplicates",
        message:
          "This contact may already exist. Choose them instead, or create a new one.",
        reviewToken,
        duplicates: candidates.map(({ contact, strength }) => ({
          id: contact.id,
          label: contactLabel(contact),
          reference: contact.reference,
          kind: contact.kind === "PERSON" ? "person" : "organisation",
          strength,
        })),
      };
    }
  }

  const common = {
    authSubject: user.id,
    workspaceSlug,
    branchId,
    communication: {
      preferred: null,
      doNotEmail: false,
      doNotTelephone: false,
      doNotSms: false,
      doNotWhatsApp: false,
      doNotPost: false,
    },
    contactPoints: points,
    addresses: [],
  };
  const result = person
    ? await createContact({ ...common, kind: "person", details: person })
    : await createContact({
        ...common,
        kind: "organisation",
        details: organisation!,
      });
  if (!result.ok) {
    return {
      status: "error",
      message:
        "The contact could not be created. Check the branch and your access.",
    };
  }
  revalidatePath(`/dashboard/w/${workspaceSlug}/contacts`);
  return {
    status: "created",
    contact: {
      id: result.contactId,
      label: person
        ? `${person.firstName.trim()} ${person.lastName.trim()}`
        : organisation!.legalName.trim(),
      reference: "",
      kind: input.kind,
    },
  };
}

export type PropertyFormState = {
  status: "idle" | "error";
  message: string;
  fieldErrors?: Partial<Record<string, string>>;
};

function numberOrNull(formData: FormData, name: string) {
  const value = text(formData, name).trim();
  return value === "" ? null : Number(value);
}

function parseOwners(raw: string): OwnerInput[] | null {
  try {
    const parsed: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed) || parsed.length > 20) return null;
    return parsed.map((owner) => {
      if (
        !isUuid(owner?.contactId) ||
        typeof owner.isLead !== "boolean" ||
        typeof owner.startedOn !== "string"
      ) {
        throw new Error("Invalid owner");
      }
      return {
        contactId: owner.contactId,
        isLead: owner.isLead,
        startedOn: owner.startedOn,
      };
    });
  } catch {
    return null;
  }
}

export async function createPropertyAction(
  workspaceSlug: string,
  _previousState: PropertyFormState,
  formData: FormData,
): Promise<PropertyFormState> {
  const path = `/dashboard/w/${workspaceSlug}/properties/new`;
  const user = await requireMfaUser(path, { workspaceSlug });
  const details: PropertyDetailsInput = {
    addressBuilding: text(formData, "addressBuilding"),
    addressStreet: text(formData, "addressStreet"),
    addressLocality: text(formData, "addressLocality"),
    townCity: text(formData, "townCity"),
    county: text(formData, "county"),
    postcode: text(formData, "postcode"),
    propertyType: text(formData, "propertyType"),
    bedrooms: numberOrNull(formData, "bedrooms"),
    bathrooms: numberOrNull(formData, "bathrooms"),
    receptionRooms: numberOrNull(formData, "receptionRooms"),
    floorArea: numberOrNull(formData, "floorArea"),
    floorAreaUnit: text(formData, "floorAreaUnit") || null,
    furnishedStatus: text(formData, "furnishedStatus") || null,
    features: formData.getAll("features").map(String),
    parkingNotes: text(formData, "parkingNotes"),
    outdoorSpaceNotes: text(formData, "outdoorSpaceNotes"),
    councilTaxBand: text(formData, "councilTaxBand") || null,
    generalNotes: text(formData, "generalNotes"),
  };
  const validation = validatePropertyDetails(details);
  if (!validation.ok) {
    return {
      status: "error",
      message: "Review the highlighted details.",
      fieldErrors: validation.errors,
    };
  }
  const owners = parseOwners(text(formData, "owners"));
  if (!owners) {
    return {
      status: "error",
      message: "The owners could not be read. Try again.",
    };
  }
  if (owners.filter(({ isLead }) => isLead).length > 1) {
    return { status: "error", message: "Choose only one lead landlord." };
  }

  const branchId = text(formData, "branchId");
  if (!isUuid(branchId)) {
    return {
      status: "error",
      message: "Choose the responsible branch.",
      fieldErrors: {},
    };
  }
  const result = await createProperty({
    authSubject: user.id,
    workspaceSlug,
    branchId,
    details,
    owners,
  });
  if (!result.ok) {
    return {
      status: "error",
      message:
        result.error === "contact_not_found"
          ? "One of the owners could not be found. Remove them and try again."
          : result.error === "invalid_input"
            ? "Review the details, branch and owners, then try again."
            : result.error === "invalid_state"
              ? "An owner is listed twice or cannot be used. Check the owners."
              : "The property could not be created. Check your access and try again.",
    };
  }
  revalidatePath(`/dashboard/w/${workspaceSlug}/properties`);
  redirect(`/dashboard/w/${workspaceSlug}/properties/${result.propertyId}`);
}
