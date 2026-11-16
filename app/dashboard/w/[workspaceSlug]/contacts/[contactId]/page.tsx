import {
  ArrowLeft,
  Building2,
  ClipboardList,
  Home,
  Inbox,
  KeyRound,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "@/core/properties/domain/ids";
import {
  ContactArchiveControl,
  ContactEditor,
} from "@/components/contacts/contact-record-actions";
import type { InitialContact } from "@/components/contacts/contact-form";
import { ContactNotes } from "@/components/contacts/contact-notes";
import { OrganisationPeople } from "@/components/contacts/organisation-people";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  KeyDetails,
  SectionCard,
  type KeyDetail,
} from "@/components/records/record-cards";
import { RecordHeader } from "@/components/records/record-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { listApplicants } from "@/core/applicants/application/applicant-views";
import { APPLICANT_STATUS_LABELS } from "@/core/applicants/domain/applicant";
import { requireMfaUserWith } from "@/core/auth/mfa";
import { listContactNotes } from "@/core/contacts/application/contact-notes";
import { getContact } from "@/core/contacts/application/contacts";
import {
  getContactLandlordHistory,
  getPropertiesWithUsCount,
} from "@/core/contacts/application/landlords";
import { ENQUIRY_STAGE_LABELS } from "@/core/enquiries/domain/enquiry-labels";
import { JOURNEY_STAGE_LABELS } from "@/core/instructions/domain/instruction-labels";
import { listPropertiesForContact } from "@/core/properties/application/properties";
import { getWorkspaceBranches } from "@/core/workspace/application/workspace-branches";
import { toActiveBranchOptions } from "@/core/workspace/domain/branch-option";
import {
  addContactNoteAction,
  changeContactArchiveAction,
  createAndLinkPersonAction,
  editContactNoteAction,
  endPersonLinkAction,
  linkPersonAction,
  searchPeopleAction,
  updateContactAction,
  updatePersonLinkAction,
  voidContactNoteAction,
} from "../actions";

function displayName(contact: {
  kind: string;
  title: string | null;
  firstName: string | null;
  lastName: string | null;
  legalName: string | null;
}) {
  return contact.kind === "PERSON"
    ? [contact.title, contact.firstName, contact.lastName]
        .filter(Boolean)
        .join(" ")
    : (contact.legalName ?? "Unnamed organisation");
}
function addressLabel(address: {
  addressLine1: string;
  addressLine2: string | null;
  locality: string | null;
  townCity: string;
  county: string | null;
  postcode: string;
}) {
  return [
    address.addressLine1,
    address.addressLine2,
    address.locality,
    address.townCity,
    address.county,
    address.postcode,
  ]
    .filter(Boolean)
    .join(", ");
}

function pageNumber(value: string | string[] | undefined) {
  const number = typeof value === "string" ? Number(value) : 1;
  return Number.isSafeInteger(number) && number > 0 ? number : 1;
}

export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string; contactId: string }>;
  searchParams: Promise<{
    error?: string | string[];
    voided?: string;
    created?: string;
    leadPage?: string | string[];
    instructionPage?: string | string[];
  }>;
}) {
  const { workspaceSlug, contactId } = await params;
  // A mistyped address is "not found", not an error.
  if (!isUuid(contactId)) notFound();
  const listPath = `/dashboard/w/${workspaceSlug}/contacts`;
  const path = `${listPath}/${contactId}`;
  const query = await searchParams;
  const showVoided = query.voided === "1";
  const leadPage = pageNumber(query.leadPage);
  const instructionPage = pageNumber(query.instructionPage);
  const {
    user,
    data: [contact, context, branches, propertiesWithUs],
  } = await requireMfaUserWith(path, { workspaceSlug }, (user) =>
    Promise.all([
      getContact({ authSubject: user.id, workspaceSlug, contactId }),
      getWorkspaceAccessContext(user.id, workspaceSlug),
      getWorkspaceBranches(user.id, workspaceSlug),
      getPropertiesWithUsCount({
        authSubject: user.id,
        workspaceSlug,
        contactId,
      }),
    ]),
  );
  if (!context || !branches) redirect("/access-denied");
  if (!contact) notFound();
  const kind = contact.kind === "PERSON" ? "person" : "organisation";
  const activeAddresses = contact.addresses;
  const addressByKind = (addressKind: string) =>
    activeAddresses.find(({ kind }) => kind === addressKind);
  const mapAddress = (address: (typeof activeAddresses)[number] | undefined) =>
    address
      ? {
          id: address.id,
          addressLine1: address.addressLine1,
          addressLine2: address.addressLine2 ?? "",
          locality: address.locality ?? "",
          townCity: address.townCity,
          county: address.county ?? "",
          postcode: address.postcode,
        }
      : undefined;
  const initial: InitialContact = {
    title: contact.title ?? "",
    firstName: contact.firstName ?? "",
    middleNames: contact.middleNames ?? "",
    lastName: contact.lastName ?? "",
    preferredName: contact.preferredName ?? "",
    organisationType: contact.organisationType?.toLowerCase(),
    legalName: contact.legalName ?? "",
    tradingName: contact.tradingName ?? "",
    registrationNumber: contact.registrationNumber ?? "",
    vatNumber: contact.vatNumber ?? "",
    emails: contact.contactPoints
      .filter(({ kind: pointKind }) => pointKind === "EMAIL")
      .map((point) => ({
        id: point.id,
        label: point.label ?? "",
        value: point.value,
        isPreferred: point.isPreferred,
      })),
    telephones: contact.contactPoints
      .filter(({ kind: pointKind }) => pointKind === "TELEPHONE")
      .map((point) => ({
        id: point.id,
        label: point.label ?? "",
        value: point.value,
        isPreferred: point.isPreferred,
      })),
    individualAddress: mapAddress(addressByKind("INDIVIDUAL")),
    registeredAddress: mapAddress(addressByKind("REGISTERED")),
    correspondenceAddress: mapAddress(addressByKind("CORRESPONDENCE")),
    preferredCommunication:
      contact.preferredCommunicationChannel?.toLowerCase(),
    doNotEmail: contact.doNotEmail,
    doNotTelephone: contact.doNotTelephone,
    doNotSms: contact.doNotSms,
    doNotWhatsApp: contact.doNotWhatsApp,
    doNotPost: contact.doNotPost,
    branchId: contact.branchLinks.find(({ isPrimary }) => isPrimary)?.branchId,
  };
  const canEdit =
    context.permissions.has("contact.update") && contact.status === "ACTIVE";
  const canArchive =
    context.permissions.has("contact.archive") && contact.status !== "MERGED";
  const activeBranches = toActiveBranchOptions(branches);
  const preferredChannel = contact.preferredCommunicationChannel
    ? sentence(contact.preferredCommunicationChannel)
    : null;
  const archiveFailed = query.error === "archive";
  const ownsProperty = query.error === "owns_property";
  const canManageLinks =
    context.permissions.has("contact.sensitive.manage") &&
    contact.status === "ACTIVE";
  const linkedPeople = contact.organisationLinks.map((link) => ({
    linkId: link.id,
    personId: link.personContact.id,
    name: displayName({
      kind: "PERSON",
      legalName: null,
      ...link.personContact,
    }),
    reference: link.personContact.reference,
    relationshipLabel: link.relationshipLabel ?? "",
    isPrimary: link.isPrimary,
    preferredContact:
      link.personContact.contactPoints.find(({ kind }) => kind === "EMAIL")
        ?.value ??
      link.personContact.contactPoints[0]?.value ??
      null,
    updateAction: updatePersonLinkAction.bind(
      null,
      workspaceSlug,
      contactId,
      link.id,
    ),
    endAction: endPersonLinkAction.bind(
      null,
      workspaceSlug,
      contactId,
      link.id,
    ),
  }));

  const primaryBranch = contact.branchLinks.find(({ isPrimary }) => isPrimary)
    ?.branch.name;
  const otherBranches = contact.branchLinks
    .filter(({ isPrimary }) => !isPrimary)
    .map(({ branch }) => branch.name);
  const emailPoints = contact.contactPoints.filter(
    ({ kind: pointKind }) => pointKind === "EMAIL",
  );
  const telephonePoints = contact.contactPoints.filter(
    ({ kind: pointKind }) => pointKind === "TELEPHONE",
  );
  const doNotUse =
    [
      contact.doNotEmail && "Email",
      contact.doNotTelephone && "Telephone",
      contact.doNotSms && "SMS",
      contact.doNotWhatsApp && "WhatsApp",
      contact.doNotPost && "Post",
    ]
      .filter(Boolean)
      .join(", ") || null;
  const linkClass = "text-primary underline-offset-4 hover:underline";
  const contactDetails = uniqueLabels([
    ...emailPoints.map((point) => ({
      label: pointLabel(point.label, "Email", point.isPreferred),
      value: (
        <a className={linkClass} href={`mailto:${point.value}`}>
          {point.value}
        </a>
      ),
    })),
    ...telephonePoints.map((point) => ({
      label: pointLabel(point.label, "Telephone", point.isPreferred),
      value: (
        <a className={linkClass} href={`tel:${point.value}`}>
          {point.value}
        </a>
      ),
    })),
    ...activeAddresses.map((address) => ({
      label: `${sentence(address.kind)} address`,
      value: addressLabel(address),
    })),
    { label: "Responsible branch", value: primaryBranch },
    { label: "Also visible to", value: otherBranches.join(", ") },
    {
      label: "Properties with us",
      value: propertiesWithUs !== null ? String(propertiesWithUs) : null,
    },
    { label: "Preferred contact", value: preferredChannel },
    { label: "Do not use", value: doNotUse },
  ]);
  const identityDetails: KeyDetail[] =
    kind === "person"
      ? [
          { label: "Title", value: contact.title },
          { label: "First name", value: contact.firstName },
          { label: "Middle names", value: contact.middleNames },
          { label: "Surname", value: contact.lastName },
          { label: "Known as", value: contact.preferredName },
        ]
      : [
          { label: "Legal name", value: contact.legalName },
          { label: "Trading name", value: contact.tradingName },
          {
            label: "Organisation type",
            value: contact.organisationType
              ? sentence(contact.organisationType)
              : null,
          },
          { label: "Registration number", value: contact.registrationNumber },
          { label: "VAT number", value: contact.vatNumber },
        ];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit"
        render={<Link href={listPath} />}
        nativeButton={false}
      >
        <ArrowLeft aria-hidden="true" />
        Back to contacts
      </Button>
      {query.created === "yes" && (
        <div
          className="rounded-lg bg-success-soft p-4 text-sm text-success"
          role="status"
        >
          Contact created. Add addresses and preferences with Edit contact.
        </div>
      )}
      {archiveFailed && (
        <div
          className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          The contact status could not be changed. Check your access and try
          again.
        </div>
      )}
      {ownsProperty && (
        <div
          className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          This contact is the current owner of a property, so they cannot be
          archived yet. End their ownership first, then archive them.
        </div>
      )}
      {query.error === "on_instruction" && (
        <div
          className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          This contact is a landlord on a current instruction, so they cannot be
          archived yet. Remove them from the instruction or end it first.
        </div>
      )}
      {query.error === "has_open_enquiry" && (
        <div
          className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          This contact is linked to an open landlord lead, so they cannot be
          archived yet. Start its instruction, or close it as lost or postponed,
          first.
        </div>
      )}
      <RecordHeader
        avatar={initials(contact)}
        title={displayName(contact)}
        subtitle={[`Contact ${contact.reference}`, primaryBranch]
          .filter(Boolean)
          .join(" · ")}
        badges={
          <>
            <Badge variant="secondary">
              {kind === "person" ? "Person" : "Organisation"}
            </Badge>
            {contact.status === "ARCHIVED" && (
              <StatusBadge label="Archived" tone="inactive" />
            )}
          </>
        }
        actions={
          <>
            {canEdit && (
              <ContactEditor
                action={updateContactAction.bind(
                  null,
                  workspaceSlug,
                  contactId,
                  kind,
                )}
                branches={activeBranches}
                initial={initial}
                kind={kind}
                canManageIdentity={context.permissions.has(
                  "contact.sensitive.manage",
                )}
              />
            )}
            {canArchive && (
              <ContactArchiveControl
                action={changeContactArchiveAction.bind(
                  null,
                  workspaceSlug,
                  contactId,
                  contact.status === "ARCHIVED",
                )}
                archived={contact.status === "ARCHIVED"}
              />
            )}
          </>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
          {kind === "organisation" ? (
            <SectionCard title="People">
              <OrganisationPeople
                basePath={listPath}
                canManage={canManageLinks}
                createAction={createAndLinkPersonAction.bind(
                  null,
                  workspaceSlug,
                  contactId,
                )}
                linkAction={linkPersonAction.bind(
                  null,
                  workspaceSlug,
                  contactId,
                )}
                people={linkedPeople}
                search={searchPeopleAction.bind(null, workspaceSlug)}
              />
            </SectionCard>
          ) : (
            <SectionCard title="Organisations">
              {contact.personLinks.length ? (
                <ul className="grid divide-y">
                  {contact.personLinks.map((link) => (
                    <li
                      key={link.id}
                      className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <Building2
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <Link
                          href={`${listPath}/${link.organisationContact.id}`}
                          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {link.organisationContact.legalName ??
                            "Unnamed organisation"}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {[
                            link.relationshipLabel || "Linked person",
                            link.isPrimary && "Main contact",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Not linked to any organisation. Link people from the
                  organisation&apos;s record.
                </p>
              )}
            </SectionCard>
          )}
          {context.permissions.has("property.read") && (
            <SectionCard title="Properties">
              <Suspense fallback={<SectionSkeleton />}>
                <ContactProperties
                  authSubject={user.id}
                  workspaceSlug={workspaceSlug}
                  contactId={contactId}
                />
              </Suspense>
            </SectionCard>
          )}
          {(context.permissions.has("enquiry.read") ||
            context.permissions.has("instruction.read")) && (
            <Suspense fallback={null}>
              <ContactLandlordHistorySections
                authSubject={user.id}
                workspaceSlug={workspaceSlug}
                contactId={contactId}
                path={path}
                leadPage={leadPage}
                instructionPage={instructionPage}
                showLeads={context.permissions.has("enquiry.read")}
                showInstructions={context.permissions.has("instruction.read")}
                showVoided={showVoided}
              />
            </Suspense>
          )}
          {kind === "person" && context.permissions.has("applicant.read") && (
            <Suspense fallback={null}>
              <ContactApplicants
                authSubject={user.id}
                workspaceSlug={workspaceSlug}
                contactId={contactId}
              />
            </Suspense>
          )}
          <SectionCard title="Notes">
            <Suspense fallback={<SectionSkeleton />}>
              <ContactNoteList
                authSubject={user.id}
                workspaceSlug={workspaceSlug}
                contactId={contactId}
                path={path}
                showVoided={showVoided}
                canAdd={
                  context.permissions.has("contact.note.create") &&
                  contact.status !== "MERGED"
                }
                canSeeVoided={context.permissions.has("contact.note.manage")}
              />
            </Suspense>
          </SectionCard>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
          <SectionCard title="Contact details">
            <KeyDetails items={contactDetails} />
          </SectionCard>
          <SectionCard
            title={
              kind === "person" ? "Person details" : "Organisation details"
            }
          >
            <KeyDetails items={identityDetails} />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

/** "LIMITED_COMPANY" as "Limited company". */
function sentence(code: string) {
  const words = code.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Two details may share a label (two work emails); number the later ones. */
function uniqueLabels(items: KeyDetail[]) {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const count = (seen.get(item.label) ?? 0) + 1;
    seen.set(item.label, count);
    return count === 1 ? item : { ...item, label: `${item.label} (${count})` };
  });
}

function initials(contact: {
  kind: string;
  firstName: string | null;
  lastName: string | null;
  legalName: string | null;
}) {
  const parts =
    contact.kind === "PERSON"
      ? [contact.firstName, contact.lastName]
      : (contact.legalName ?? "").split(/\s+/);
  return (
    parts
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part![0])
      .join("")
      .toUpperCase() || "?"
  );
}

function pointLabel(
  label: string | null,
  fallback: string,
  preferred: boolean,
) {
  return `${label ?? fallback}${preferred ? " · Preferred" : ""}`;
}

type ContactSectionProps = {
  authSubject: string;
  workspaceSlug: string;
  contactId: string;
};

async function ContactProperties(props: ContactSectionProps) {
  const { authSubject, workspaceSlug, contactId } = props;
  const properties = await listPropertiesForContact({
    authSubject,
    workspaceSlug,
    contactId,
  });

  return properties.length ? (
    <ul className="grid divide-y">
      {properties.map((owned) => (
        <li
          key={owned.ownershipId}
          className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
        >
          <Home
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <Link
              href={`/dashboard/w/${workspaceSlug}/properties/${owned.propertyId}`}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {owned.addressLine}
            </Link>
            <p className="text-xs text-muted-foreground">
              {[
                owned.postcode,
                owned.reference,
                owned.current
                  ? owned.isLead
                    ? "Current owner · Lead landlord"
                    : "Current owner"
                  : "Former owner",
              ].join(" · ")}
            </p>
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted-foreground">
      Not recorded as the owner of any property you can see.
    </p>
  );
}

/**
 * The households this person is looking for a home with. Shown only when
 * there is one, so landlords' pages are not given an empty section.
 */
async function ContactApplicants(props: ContactSectionProps) {
  const { authSubject, workspaceSlug, contactId } = props;
  const applicants = await listApplicants({
    authSubject,
    workspaceSlug,
    contactId,
    status: "all",
    take: 10,
  });
  if (!applicants?.items.length) return null;
  return (
    <SectionCard title="Looking to rent">
      <ul className="grid divide-y">
        {applicants.items.map((applicant) => (
          <li
            key={applicant.id}
            className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
          >
            <KeyRound
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <Link
                href={`/dashboard/w/${workspaceSlug}/applicants/${applicant.id}`}
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Applicant {applicant.reference}
              </Link>
              <p className="text-xs text-muted-foreground">
                {[
                  applicant.name,
                  APPLICANT_STATUS_LABELS[applicant.status],
                  `${applicant.openEnquiries} open ${applicant.openEnquiries === 1 ? "enquiry" : "enquiries"}`,
                  applicant.branch.name,
                ].join(" · ")}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

type ContactLandlordHistoryProps = ContactSectionProps & {
  path: string;
  leadPage: number;
  instructionPage: number;
  showLeads: boolean;
  showInstructions: boolean;
  showVoided: boolean;
};

function historyHref(
  path: string,
  pages: { leadPage: number; instructionPage: number; showVoided: boolean },
) {
  const parameters = new URLSearchParams();
  if (pages.leadPage > 1) {
    parameters.set("leadPage", String(pages.leadPage));
  }
  if (pages.instructionPage > 1) {
    parameters.set("instructionPage", String(pages.instructionPage));
  }
  if (pages.showVoided) {
    parameters.set("voided", "1");
  }
  const query = parameters.toString();
  return query ? `${path}?${query}` : path;
}

function HistoryPagination({
  page,
  hasPrevious,
  hasNext,
  previousHref,
  nextHref,
}: {
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
  previousHref: string;
  nextHref: string;
}) {
  if (!hasPrevious && !hasNext) {
    return null;
  }
  return (
    <nav
      className="flex items-center justify-between gap-3"
      aria-label="History pages"
    >
      <span className="text-xs text-muted-foreground">Page {page}</span>
      <div className="flex gap-2">
        {hasPrevious && (
          <Button
            size="sm"
            variant="outline"
            render={<Link href={previousHref} />}
            nativeButton={false}
          >
            Previous
          </Button>
        )}
        {hasNext && (
          <Button
            size="sm"
            variant="outline"
            render={<Link href={nextHref} />}
            nativeButton={false}
          >
            Next
          </Button>
        )}
      </div>
    </nav>
  );
}

async function ContactLandlordHistorySections(
  props: ContactLandlordHistoryProps,
) {
  const {
    authSubject,
    workspaceSlug,
    contactId,
    path,
    leadPage,
    instructionPage,
    showLeads,
    showInstructions,
    showVoided,
  } = props;
  const history = await getContactLandlordHistory({
    authSubject,
    workspaceSlug,
    contactId,
    leadPage,
    instructionPage,
  });
  if (!history) {
    return null;
  }
  const commonPages = { leadPage, instructionPage, showVoided };
  return (
    <>
      {showLeads && history.leads && (
        <SectionCard title="Landlord leads">
          {history.leads.items.length ? (
            <ul className="grid divide-y">
              {history.leads.items.map((lead) => (
                <li
                  key={lead.id}
                  className="flex gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <Inbox
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <Link
                      href={`/dashboard/w/${workspaceSlug}/enquiries/${lead.id}`}
                      className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {lead.address}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {[
                        lead.postcode,
                        lead.reference,
                        ENQUIRY_STAGE_LABELS[lead.stage],
                        lead.branch,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No visible landlord leads.
            </p>
          )}
          <HistoryPagination
            page={history.leads.page}
            hasPrevious={history.leads.hasPrevious}
            hasNext={history.leads.hasNext}
            previousHref={historyHref(path, {
              ...commonPages,
              leadPage: Math.max(leadPage - 1, 1),
            })}
            nextHref={historyHref(path, {
              ...commonPages,
              leadPage: leadPage + 1,
            })}
          />
        </SectionCard>
      )}
      {showInstructions && history.instructions && (
        <SectionCard title="Instructions">
          {history.instructions.items.length ? (
            <ul className="grid divide-y">
              {history.instructions.items.map((instruction) => (
                <li
                  key={instruction.id}
                  className="flex gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <ClipboardList
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <Link
                      href={`/dashboard/w/${workspaceSlug}/instructions/${instruction.id}`}
                      className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {instruction.property}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {[
                        instruction.postcode,
                        instruction.reference,
                        JOURNEY_STAGE_LABELS[instruction.journeyStage],
                        instruction.currentParty
                          ? "Current landlord"
                          : "Former landlord",
                        instruction.current ? null : "Ended",
                        instruction.branch,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No visible instructions.
            </p>
          )}
          <HistoryPagination
            page={history.instructions.page}
            hasPrevious={history.instructions.hasPrevious}
            hasNext={history.instructions.hasNext}
            previousHref={historyHref(path, {
              ...commonPages,
              instructionPage: Math.max(instructionPage - 1, 1),
            })}
            nextHref={historyHref(path, {
              ...commonPages,
              instructionPage: instructionPage + 1,
            })}
          />
        </SectionCard>
      )}
    </>
  );
}

type ContactNoteListProps = ContactSectionProps & {
  path: string;
  showVoided: boolean;
  canAdd: boolean;
  canSeeVoided: boolean;
};

async function ContactNoteList(props: ContactNoteListProps) {
  const {
    authSubject,
    workspaceSlug,
    contactId,
    path,
    showVoided,
    canAdd,
    canSeeVoided,
  } = props;
  const notes = await listContactNotes({
    authSubject,
    workspaceSlug,
    contactId,
    includeVoided: showVoided,
  });

  return (
    <ContactNotes
      addAction={addContactNoteAction.bind(null, workspaceSlug, contactId)}
      canAdd={canAdd}
      canSeeVoided={canSeeVoided}
      showVoided={showVoided}
      toggleHref={showVoided ? path : `${path}?voided=1`}
      notes={(notes ?? []).map((note) => ({
        id: note.id,
        body: note.body,
        occurredAt: note.occurredAt.toISOString(),
        authorName: note.authorName,
        branchName: note.branchName,
        agencyWide: note.agencyWide,
        edited: note.edited,
        voided: note.voided,
        voidReason: note.voidReason,
        voidedByName: note.voidedByName,
        canManage: note.canManage,
        editAction: note.canManage
          ? editContactNoteAction.bind(null, workspaceSlug, contactId, note.id)
          : null,
        voidAction: note.canManage
          ? voidContactNoteAction.bind(null, workspaceSlug, contactId, note.id)
          : null,
      }))}
    />
  );
}

function SectionSkeleton() {
  return (
    <div className="grid gap-3" aria-busy="true">
      {[1, 2].map((item) => (
        <div key={item} className="h-12 animate-pulse rounded bg-muted" />
      ))}
    </div>
  );
}
