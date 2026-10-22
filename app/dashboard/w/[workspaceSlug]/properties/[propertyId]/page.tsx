import {
  ArrowLeft,
  Bath,
  BedDouble,
  Building2,
  Car,
  GitBranch,
  Home,
  Pencil,
  ReceiptText,
  Ruler,
  Sofa,
  StickyNote,
  Trees,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ContactNotes } from "@/components/contacts/contact-notes";
import { ManageOwners } from "@/components/properties/manage-owners";
import {
  complianceAttention,
  ComplianceSnapshot,
} from "@/components/properties/compliance-snapshot";
import { ListingStateBadge } from "@/components/listings/listing-state-badge";
import { PropertyCompliance } from "@/components/properties/property-compliance";
import { PropertyArchiveControl } from "@/components/properties/property-archive-control";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  currentTab,
  RecordTabs,
  type RecordTab,
} from "@/components/ui/record-tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  deriveLettingStatus,
  LETTING_STATUS_DESCRIPTIONS,
  LETTING_STATUS_LABELS,
} from "@/core/properties/domain/letting-status";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { requireMfaUserWith } from "@/core/auth/mfa";
import { listListings } from "@/core/listings/application/listing-list";
import { getPropertyCompliance } from "@/core/compliance/application/property-compliance";
import { ukToday } from "@/core/enquiries/domain/enquiry";
import {
  addressLine,
  getProperty,
} from "@/core/properties/application/properties";
import {
  getInstruction,
  listInstructionsForProperty,
} from "@/core/instructions/application/instruction-records";
import { JOURNEY_STAGE_LABELS } from "@/core/instructions/domain/instruction-labels";
import { LETTING_SERVICE_LABELS } from "@/core/enquiries/domain/enquiry-labels";
import { getPropertyLeadHistory } from "@/core/properties/application/property-lead-history";
import { ENQUIRY_STAGE_LABELS } from "@/core/enquiries/domain/enquiry-labels";
import { listPropertyNotes } from "@/core/properties/application/property-notes";
import { isUuid } from "@/core/properties/domain/ids";
import { PROPERTY_FEATURE_GROUPS } from "@/core/properties/domain/property";
import {
  FLOOR_AREA_UNIT_LABELS,
  FURNISHED_STATUS_LABELS,
  PROPERTY_FEATURE_LABELS,
  PROPERTY_TYPE_LABELS,
} from "@/core/properties/domain/property-labels";
import {
  addOwnerAction,
  addPropertyNoteAction,
  changePropertyArchiveAction,
  editPropertyNoteAction,
  endOwnershipAction,
  quickAddOwnerAction,
  searchOwnerContactsAction,
  setLeadOwnerAction,
  voidPropertyNoteAction,
} from "../actions";
import { recordComplianceAction } from "../compliance-actions";

const dateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC" });

function formatDate(date: Date | null) {
  return date ? dateFormat.format(date) : null;
}

function leadPageHref(path: string, page: number, showVoided: boolean) {
  const parameters = new URLSearchParams({ tab: "leads" });
  if (page > 1) parameters.set("leadPage", String(page));
  if (showVoided) parameters.set("voided", "1");
  return `${path}?${parameters.toString()}`;
}

export default async function PropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string; propertyId: string }>;
  searchParams: Promise<{
    error?: string | string[];
    voided?: string;
    leadPage?: string | string[];
    tab?: string | string[];
  }>;
}) {
  const { workspaceSlug, propertyId } = await params;
  if (!isUuid(propertyId)) notFound();
  const listPath = `/dashboard/w/${workspaceSlug}/properties`;
  const path = `${listPath}/${propertyId}`;
  const query = await searchParams;
  const showVoided = query.voided === "1";
  const leadPageNumber =
    typeof query.leadPage === "string" ? Number(query.leadPage) : 1;
  const leadPage =
    Number.isSafeInteger(leadPageNumber) && leadPageNumber > 0
      ? leadPageNumber
      : 1;
  const {
    data: [
      property,
      context,
      notes,
      instructions,
      leadHistory,
      compliance,
      currentInstruction,
      propertyListings,
    ],
  } = await requireMfaUserWith(path, { workspaceSlug }, async (user) => {
    const actor = { authSubject: user.id, workspaceSlug };
    const [loaded, access, noteList, instructionList, leads, complianceView] =
      await Promise.all([
        getProperty({ ...actor, propertyId }),
        getWorkspaceAccessContext(user.id, workspaceSlug),
        listPropertyNotes({ ...actor, propertyId, includeVoided: showVoided }),
        listInstructionsForProperty({ ...actor, propertyId }),
        getPropertyLeadHistory({ ...actor, propertyId, page: leadPage }),
        getPropertyCompliance({ ...actor, propertyId }),
      ]);
    // The current instruction's full record, for its readiness at a glance.
    const currentId = instructionList.find((item) => item.current)?.id;
    const currentRecord = currentId
      ? await getInstruction({ ...actor, instructionId: currentId })
      : null;
    const listings = await listListings({
      ...actor,
      state: "all",
      propertyId,
    });
    return [
      loaded,
      access,
      noteList,
      instructionList,
      leads,
      complianceView,
      currentRecord,
      listings ?? [],
    ] as const;
  });
  if (!context || !context.permissions.has("property.read")) {
    redirect("/access-denied");
  }
  if (!property) notFound();

  const attention = compliance.ok ? complianceAttention(compliance.view) : null;
  const needsAttention = attention
    ? attention.expired.length + attention.actionRequired.length
    : 0;
  const tabs: RecordTab[] = [
    { id: "overview", label: "Overview" },
    { id: "instructions", label: "Instructions" },
    ...(compliance.ok
      ? [
          {
            id: "compliance",
            label: "Compliance",
            badge: needsAttention > 0 ? String(needsAttention) : undefined,
          },
        ]
      : []),
    ...(leadHistory ? [{ id: "leads", label: "Leads" }] : []),
    { id: "notes", label: "Notes" },
  ];
  const tab = currentTab(tabs, query.tab);

  // Worked out here, never stored (ADR-035). Without permission to read
  // listings the status does not guess whether one exists.
  const canReadListings = context.permissions.has("listing.read");
  const activeInstruction = instructions.find((item) => item.current) ?? null;
  const lettingStatus = deriveLettingStatus({
    currentInstruction: activeInstruction,
    hasEndedInstruction: instructions.some((item) => !item.current),
    listingState: !canReadListings
      ? undefined
      : (propertyListings.find(
          (item) =>
            item.instruction.id === activeInstruction?.id &&
            item.state !== "withdrawn",
        )?.state ?? null),
  });
  const details = property.details;
  const currentOwners = property.ownerships.filter(({ endedAt }) => !endedAt);
  const formerOwners = property.ownerships.filter(({ endedAt }) => endedAt);
  const lead = currentOwners.find(({ isLead }) => isLead);
  const contactsPath = `/dashboard/w/${workspaceSlug}/contacts`;
  const selectedFeatures = new Set<string>(details.features);
  const floorArea =
    details.floorArea !== null && details.floorAreaUnit
      ? `${details.floorArea.toLocaleString("en-GB")} ${FLOOR_AREA_UNIT_LABELS[details.floorAreaUnit]}`
      : null;
  const fullAddress = [
    details.addressBuilding,
    details.addressStreet,
    details.addressLocality,
    details.townCity,
    details.county,
    details.postcode,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="grid gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit"
        render={<Link href={listPath} />}
        nativeButton={false}
      >
        <ArrowLeft aria-hidden="true" />
        Back to properties
      </Button>
      {query.error === "archive" && (
        <div
          className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          The property status could not be changed. Check your access and try
          again.
        </div>
      )}
      {query.error === "has_current_instruction" && (
        <div
          className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          This property has a current instruction, so it cannot be archived. End
          the instruction first.
        </div>
      )}
      {query.error === "has_open_enquiry" && (
        <div
          className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          This property is linked to an open landlord lead, so it cannot be
          archived yet. Start its instruction, or close it as lost or postponed,
          first.
        </div>
      )}
      {/* Phones: identity, working area, details. Large screens: a profile
          column, the working area, and a details rail that use the width. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-8 lg:grid-cols-[18rem_minmax(0,1fr)] 2xl:grid-cols-[20rem_minmax(0,1fr)_22rem]">
        <header className="grid content-start gap-6 lg:col-start-1 lg:row-start-1">
          <div className="flex items-center gap-4 lg:flex-col lg:items-start">
            <span
              aria-hidden="true"
              className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-accent text-primary"
            >
              <Building2 className="size-6" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">
                {addressLine(details)}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {details.postcode}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  {PROPERTY_TYPE_LABELS[details.propertyType]}
                </Badge>
                {property.archived && (
                  <StatusBadge label="Archived" tone="inactive" />
                )}
                <Badge
                  variant={lettingStatus === "ended" ? "secondary" : "info"}
                  title={LETTING_STATUS_DESCRIPTIONS[lettingStatus]}
                >
                  {LETTING_STATUS_LABELS[lettingStatus]}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {property.reference}
                </span>
              </div>
            </div>
          </div>
          {(property.can.manageOwners ||
            property.can.archive ||
            (property.can.update && !property.archived)) && (
            <div className="flex flex-wrap gap-2">
              {property.can.update && !property.archived && (
                <Button
                  size="sm"
                  variant="outline"
                  render={<Link href={`${path}/edit`} />}
                  nativeButton={false}
                >
                  <Pencil aria-hidden="true" />
                  Edit property
                </Button>
              )}
              {property.can.manageOwners && (
                <ManageOwners
                  owners={currentOwners.map((owner) => ({
                    ownershipId: owner.id,
                    contactId: owner.contactId,
                    name: owner.name,
                    kind: owner.contactKind,
                    reference: owner.contactReference,
                    isLead: owner.isLead,
                    since: formatDate(owner.startedOn),
                  }))}
                  propertyBranchId={property.responsibleBranch.id}
                  addOwner={addOwnerAction.bind(
                    null,
                    workspaceSlug,
                    propertyId,
                  )}
                  endOwnership={endOwnershipAction.bind(
                    null,
                    workspaceSlug,
                    propertyId,
                  )}
                  setLead={setLeadOwnerAction.bind(
                    null,
                    workspaceSlug,
                    propertyId,
                  )}
                  quickAdd={quickAddOwnerAction.bind(null, workspaceSlug)}
                  search={searchOwnerContactsAction.bind(null, workspaceSlug)}
                />
              )}
              {property.can.archive && (
                <PropertyArchiveControl
                  action={changePropertyArchiveAction.bind(
                    null,
                    workspaceSlug,
                    propertyId,
                    property.archived,
                  )}
                  archived={property.archived}
                />
              )}
            </div>
          )}
          <dl className="grid gap-5 border-t pt-6">
            <Detail
              label="Lead landlord"
              value={lead?.name}
              icon={UserRound}
              keepCase
            />
            <Detail
              label="Responsible branch"
              value={property.responsibleBranch.name}
              icon={GitBranch}
              keepCase
            />
            <Detail
              label="Bedrooms"
              value={details.bedrooms?.toString()}
              icon={BedDouble}
            />
            <Detail
              label="Furnishing"
              value={
                details.furnishedStatus
                  ? FURNISHED_STATUS_LABELS[details.furnishedStatus]
                  : null
              }
              icon={Sofa}
              keepCase
            />
          </dl>
        </header>

        <div className="grid min-w-0 content-start gap-10 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:border-l lg:pl-10">
          <RecordTabs tabs={tabs} current={tab} path={path} />

          {tab === "overview" && (
            <>
              <section
                className="grid gap-4"
                aria-labelledby="current-instruction"
              >
                <h2
                  id="current-instruction"
                  className="text-base font-semibold"
                >
                  Current instruction
                </h2>
                {currentInstruction ? (
                  <div className="grid gap-4 rounded-xl border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          <Link
                            className="text-primary underline-offset-4 hover:underline"
                            href={`/dashboard/w/${workspaceSlug}/instructions/${currentInstruction.id}`}
                          >
                            {currentInstruction.reference}
                          </Link>
                          {currentInstruction.terms
                            ? ` · ${LETTING_SERVICE_LABELS[currentInstruction.terms.service]}`
                            : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Instructed{" "}
                          {formatDate(
                            new Date(
                              `${currentInstruction.instructedOn}T00:00:00Z`,
                            ),
                          )}
                        </p>
                      </div>
                      <Badge
                        variant={
                          currentInstruction.journeyStage === "ready_to_market"
                            ? "success"
                            : "info"
                        }
                      >
                        {JOURNEY_STAGE_LABELS[currentInstruction.journeyStage]}
                      </Badge>
                    </div>
                    {currentInstruction.journeyStage === "onboarding" && (
                      <p className="text-sm text-muted-foreground">
                        {currentInstruction.checklistComplete
                          ? "Everything is in place. It can be marked Ready to market."
                          : `Still needed: ${currentInstruction.checklist
                              .filter((item) => !item.met)
                              .map((item) => item.label.toLowerCase())
                              .join(", ")}.`}
                      </p>
                    )}
                    {currentInstruction.journeyStage === "ready_to_market" && (
                      <p className="text-sm text-muted-foreground">
                        {LETTING_STATUS_DESCRIPTIONS[lettingStatus]} Open the
                        instruction or Marketing to continue.
                      </p>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-fit"
                      render={
                        <Link
                          href={`/dashboard/w/${workspaceSlug}/instructions/${currentInstruction.id}`}
                        />
                      }
                      nativeButton={false}
                    >
                      Open instruction
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No current instruction. One is started from a landlord lead
                    once its appraisal is completed.
                    {instructions.length > 0
                      ? " Earlier instructions are on the Instructions tab."
                      : ""}
                  </p>
                )}
              </section>

              {compliance.ok && (
                <section
                  className="grid gap-3 border-t pt-6"
                  aria-labelledby="compliance-summary"
                >
                  <h2
                    id="compliance-summary"
                    className="text-base font-semibold"
                  >
                    Compliance
                  </h2>
                  <ComplianceSnapshot
                    view={compliance.view}
                    href={`${path}?tab=compliance`}
                  />
                </section>
              )}

              <section className="grid gap-4">
                <h2 className="text-base font-semibold">Owners</h2>
                {currentOwners.length ? (
                  <ul className="grid divide-y">
                    {currentOwners.map((owner) => (
                      <li
                        key={owner.id}
                        className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <UserRound
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`${contactsPath}/${owner.contactId}`}
                              className="text-sm font-medium underline-offset-4 hover:underline"
                            >
                              {owner.name}
                            </Link>
                            {owner.isLead && (
                              <Badge variant="secondary">Lead landlord</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {[
                              owner.contactKind === "person"
                                ? "Person"
                                : "Organisation",
                              owner.contactReference,
                              owner.startedOn &&
                                `Owner since ${formatDate(owner.startedOn)}`,
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
                    No current owners are recorded.
                  </p>
                )}
                {formerOwners.length > 0 && (
                  <details className="group">
                    <summary className="w-fit cursor-pointer text-sm text-primary underline-offset-4 hover:underline">
                      Former owners ({formerOwners.length})
                    </summary>
                    <ul className="mt-3 grid divide-y border-t">
                      {formerOwners.map((owner) => (
                        <li key={owner.id} className="grid gap-1 py-3">
                          <Link
                            href={`${contactsPath}/${owner.contactId}`}
                            className="text-sm font-medium underline-offset-4 hover:underline"
                          >
                            {owner.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {[
                              owner.startedOn &&
                                `From ${formatDate(owner.startedOn)}`,
                              owner.endedOn
                                ? `Until ${formatDate(owner.endedOn)}`
                                : `Ended ${formatDate(owner.endedAt)}`,
                              owner.endReason,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
              {property.transfers.length > 0 && (
                <section className="grid gap-4">
                  <h2 className="text-base font-semibold">Branch history</h2>
                  <ul className="grid divide-y border-t">
                    {property.transfers.map((transfer) => (
                      <li key={transfer.id} className="grid gap-1 py-3">
                        <p className="text-sm font-medium">
                          {transfer.fromBranchName} to {transfer.toBranchName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(transfer.createdAt)} · {transfer.reason}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          {tab === "instructions" && (
            <>
              <section className="grid gap-4" aria-labelledby="instruction">
                <div>
                  <h2 id="instruction" className="text-base font-semibold">
                    Instruction
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    The agency&apos;s appointment for this property. One can be
                    current at a time.
                  </p>
                </div>
                {instructions.length ? (
                  <ul className="grid divide-y border-t">
                    {instructions.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            <Link
                              className="text-primary underline-offset-4 hover:underline"
                              href={`/dashboard/w/${workspaceSlug}/instructions/${item.id}`}
                            >
                              {item.reference}
                            </Link>
                            {item.service
                              ? ` · ${LETTING_SERVICE_LABELS[item.service]}`
                              : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.current
                              ? `Instructed ${new Intl.DateTimeFormat("en-GB", { timeZone: "UTC" }).format(new Date(`${item.instructedOn}T00:00:00Z`))}`
                              : `Ended ${item.endedOn ? new Intl.DateTimeFormat("en-GB", { timeZone: "UTC" }).format(new Date(`${item.endedOn}T00:00:00Z`)) : ""}${item.endedReason ? ` · ${item.endedReason}` : ""}`}
                            {item.mainContact ? ` · ${item.mainContact}` : ""}
                          </p>
                        </div>
                        <Badge
                          variant={
                            !item.current
                              ? "secondary"
                              : item.journeyStage === "ready_to_market"
                                ? "success"
                                : "info"
                          }
                        >
                          {item.current
                            ? JOURNEY_STAGE_LABELS[item.journeyStage]
                            : "Ended"}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No instruction yet. One is started from a landlord lead once
                    its appraisal is completed.
                  </p>
                )}
              </section>

              {propertyListings.length > 0 && (
                <section className="grid gap-4" aria-labelledby="listings">
                  <div>
                    <h2 id="listings" className="text-base font-semibold">
                      Listings
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Adverts prepared inside Zayto for this property. None of
                      them is published.
                    </p>
                  </div>
                  <ul className="grid divide-y border-t">
                    {propertyListings.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            <Link
                              className="text-primary underline-offset-4 hover:underline"
                              href={`/dashboard/w/${workspaceSlug}/marketing/${item.id}`}
                            >
                              {item.headline || "No headline yet"}
                            </Link>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.instruction.reference} · version{" "}
                            {item.versionNo}
                          </p>
                        </div>
                        <ListingStateBadge state={item.state} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          {tab === "compliance" && compliance.ok && (
            <PropertyCompliance
              view={compliance.view}
              workspaceSlug={workspaceSlug}
              today={ukToday()}
              updateAction={(area) =>
                recordComplianceAction.bind(
                  null,
                  workspaceSlug,
                  propertyId,
                  area,
                  null,
                )
              }
            />
          )}

          {tab === "leads" && leadHistory && (
            <section className="grid gap-4" aria-labelledby="lead-history">
              <div>
                <h2 id="lead-history" className="text-base font-semibold">
                  Landlord leads
                </h2>
                <p className="text-sm text-muted-foreground">
                  Enquiries recorded against this property.
                </p>
              </div>
              {leadHistory.items.length ? (
                <ul className="grid divide-y border-t">
                  {leadHistory.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          <Link
                            className="text-primary underline-offset-4 hover:underline"
                            href={`/dashboard/w/${workspaceSlug}/enquiries/${item.id}`}
                          >
                            {item.reference}
                          </Link>
                          {` · ${item.enquirerName}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.branch}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {ENQUIRY_STAGE_LABELS[item.stage]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No visible landlord leads.
                </p>
              )}
              {(leadHistory.hasPrevious || leadHistory.hasNext) && (
                <nav
                  className="flex items-center justify-between gap-3"
                  aria-label="Landlord lead pages"
                >
                  <span className="text-xs text-muted-foreground">
                    Page {leadHistory.page}
                  </span>
                  <div className="flex gap-2">
                    {leadHistory.hasPrevious && (
                      <Button
                        size="sm"
                        variant="outline"
                        render={
                          <Link
                            href={leadPageHref(
                              path,
                              leadHistory.page - 1,
                              showVoided,
                            )}
                          />
                        }
                        nativeButton={false}
                      >
                        Previous
                      </Button>
                    )}
                    {leadHistory.hasNext && (
                      <Button
                        size="sm"
                        variant="outline"
                        render={
                          <Link
                            href={leadPageHref(
                              path,
                              leadHistory.page + 1,
                              showVoided,
                            )}
                          />
                        }
                        nativeButton={false}
                      >
                        Next
                      </Button>
                    )}
                  </div>
                </nav>
              )}
            </section>
          )}

          {tab === "notes" && (
            <section className="grid gap-4">
              <h2 className="text-base font-semibold">Notes</h2>
              <ContactNotes
                shareable={false}
                addAction={addPropertyNoteAction.bind(
                  null,
                  workspaceSlug,
                  propertyId,
                )}
                canAdd={property.can.addNote}
                canSeeVoided={property.can.manageNotes}
                showVoided={showVoided}
                toggleHref={
                  showVoided
                    ? `${path}?tab=notes`
                    : `${path}?tab=notes&voided=1`
                }
                notes={(notes ?? []).map((note) => ({
                  id: note.id,
                  body: note.body,
                  occurredAt: note.occurredAt.toISOString(),
                  authorName: note.authorName,
                  branchName: property.responsibleBranch.name,
                  agencyWide: false,
                  edited: note.edited,
                  voided: note.voided,
                  voidReason: note.voidReason,
                  voidedByName: note.voidedByName,
                  canManage: note.canManage,
                  editAction: note.canManage
                    ? editPropertyNoteAction.bind(
                        null,
                        workspaceSlug,
                        propertyId,
                        note.id,
                      )
                    : null,
                  voidAction: note.canManage
                    ? voidPropertyNoteAction.bind(
                        null,
                        workspaceSlug,
                        propertyId,
                        note.id,
                      )
                    : null,
                }))}
              />
            </section>
          )}
        </div>

        <section className="grid content-start gap-5 border-t pt-6 lg:col-start-1 lg:row-start-2 2xl:col-start-3 2xl:row-start-1 2xl:border-t-0 2xl:border-l 2xl:pt-0 2xl:pl-10">
          <h2 className="text-base font-semibold">Property details</h2>
          <dl className="grid content-start gap-5">
            <Detail label="Address" value={fullAddress} icon={Home} keepCase />
            <Detail
              label="Bathrooms"
              value={details.bathrooms?.toString()}
              icon={Bath}
            />
            <Detail
              label="Reception rooms"
              value={details.receptionRooms?.toString()}
              icon={Sofa}
            />
            <Detail
              label="Floor area"
              value={floorArea}
              icon={Ruler}
              keepCase
            />
            <Detail
              label="Council tax band"
              value={details.councilTaxBand}
              icon={ReceiptText}
              keepCase
            />
            <Detail
              label="Parking"
              value={details.parkingNotes}
              icon={Car}
              keepCase
            />
            <Detail
              label="Outdoor space"
              value={details.outdoorSpaceNotes}
              icon={Trees}
              keepCase
            />
            <Detail
              label="Internal summary"
              value={details.generalNotes}
              icon={StickyNote}
              keepCase
            />
          </dl>
          <div className="grid gap-4 border-t pt-5">
            <h3 className="text-sm font-semibold">Features</h3>
            {details.features.length ? (
              PROPERTY_FEATURE_GROUPS.map((group) => {
                const chosen = group.features.filter((feature) =>
                  selectedFeatures.has(feature),
                );
                if (!chosen.length) return null;
                return (
                  <div key={group.label} className="grid gap-1">
                    <p className="text-xs text-muted-foreground">
                      {group.label}
                    </p>
                    <p className="text-sm font-medium">
                      {chosen
                        .map((feature) => PROPERTY_FEATURE_LABELS[feature])
                        .join(", ")}
                    </p>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">
                No features recorded.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  icon: Icon,
  keepCase = false,
}: {
  label: string;
  value: string | null | undefined;
  icon?: LucideIcon;
  keepCase?: boolean;
}) {
  return (
    <div className="flex gap-3">
      {Icon && (
        <Icon
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      )}
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd
          className={`mt-0.5 text-sm font-medium [overflow-wrap:anywhere] ${
            keepCase ? "" : "capitalize"
          }`}
        >
          {value || "Not recorded"}
        </dd>
      </div>
    </div>
  );
}
