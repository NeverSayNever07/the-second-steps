import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ClipboardList,
  GitBranch,
  Megaphone,
  MessageSquare,
  Pencil,
  Plus,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ContactNotes } from "@/components/contacts/contact-notes";
import { JourneyBar } from "@/components/records/journey-bar";
import {
  AttentionPanel,
  CARD,
  KeyDetails,
  missingDetails,
  NextStepPanel,
  SectionCard,
  Timeline,
  type KeyDetail,
  type TimelineEntry,
} from "@/components/records/record-cards";
import { RecordHeader } from "@/components/records/record-header";
import { ManageOwners } from "@/components/properties/manage-owners";
import { complianceAttention } from "@/components/properties/compliance-snapshot";
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
import {
  derivePropertyJourney,
  type NextStepTarget,
} from "@/core/properties/domain/property-journey";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { requireMfaUserWith } from "@/core/auth/mfa";
import { listListings } from "@/core/listings/application/listing-list";
import { LISTING_STATE_LABELS } from "@/core/listings/domain/listing";
import { getPropertyCompliance } from "@/core/compliance/application/property-compliance";
import { isCriticalArea } from "@/core/compliance/domain/compliance";
import { COMPLIANCE_AREA_LABELS } from "@/core/compliance/domain/compliance-labels";
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
import { cn } from "cn";
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

/** A calendar day as a moment in the middle of that day, for ordering. */
function dayMoment(day: string) {
  return new Date(`${day}T12:00:00Z`);
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
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
    created?: string | string[];
  }>;
}) {
  const { workspaceSlug, propertyId } = await params;
  if (!isUuid(propertyId)) notFound();
  const base = `/dashboard/w/${workspaceSlug}`;
  const listPath = `${base}/properties`;
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
  // listings the status and the journey do not guess whether one exists.
  const canReadListings = context.permissions.has("listing.read");
  const activeInstruction = instructions.find((item) => item.current) ?? null;
  const currentListing = !canReadListings
    ? undefined
    : (propertyListings.find(
        (item) =>
          item.instruction.id === activeInstruction?.id &&
          item.state !== "withdrawn",
      ) ?? null);
  const lettingStatus = deriveLettingStatus({
    currentInstruction: activeInstruction,
    hasEndedInstruction: instructions.some((item) => !item.current),
    listingState:
      currentListing === undefined
        ? undefined
        : (currentListing?.state ?? null),
  });
  const journey = derivePropertyJourney({
    leads: leadHistory
      ? leadHistory.items.map(({ id, stage }) => ({ id, stage }))
      : null,
    instruction: currentInstruction
      ? {
          id: currentInstruction.id,
          journeyStage: currentInstruction.journeyStage,
          instructedOn: currentInstruction.instructedOn,
          checklist: currentInstruction.checklist.map(({ label, met }) => ({
            label,
            met,
          })),
          checklistComplete: currentInstruction.checklistComplete,
        }
      : null,
    listing:
      currentListing === undefined
        ? undefined
        : currentListing
          ? { id: currentListing.id, state: currentListing.state }
          : null,
    archived: property.archived,
  });
  const targetHref = (target: NextStepTarget) =>
    target.kind === "lead"
      ? `${base}/enquiries/${target.leadId}`
      : target.kind === "instruction"
        ? `${base}/instructions/${target.instructionId}`
        : `${base}/marketing/${target.listingId}${target.tab ? `?tab=${target.tab}` : ""}`;

  const details = property.details;
  const currentOwners = property.ownerships.filter(({ endedAt }) => !endedAt);
  const formerOwners = property.ownerships.filter(({ endedAt }) => endedAt);
  const lead = currentOwners.find(({ isLead }) => isLead);
  const contactsPath = `${base}/contacts`;
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

  // Dates entered from the evidence; Zayto states them and decides nothing.
  const overdueCompliance = attention
    ? [
        ...attention.expired.map(
          (area) =>
            `${COMPLIANCE_AREA_LABELS[area.area]}: the date entered for the evidence relied on has passed.${isCriticalArea(area.area) ? " Add newer evidence and review it." : ""}`,
        ),
        ...attention.actionRequired.map(
          (area) =>
            `${COMPLIANCE_AREA_LABELS[area.area]}: a review recorded that action is required.`,
        ),
      ]
    : [];
  const upcomingCompliance =
    attention && overdueCompliance.length === 0
      ? attention.dueSoon.map(
          (area) =>
            `${COMPLIANCE_AREA_LABELS[area.area]}: the date entered is within 60 days.`,
        )
      : [];
  const attentionItems = overdueCompliance.length
    ? overdueCompliance
    : upcomingCompliance;

  const keyDetails: KeyDetail[] = [
    { label: "Address", value: fullAddress },
    { label: "Type", value: PROPERTY_TYPE_LABELS[details.propertyType] },
    { label: "Bedrooms", value: details.bedrooms?.toString() },
    { label: "Bathrooms", value: details.bathrooms?.toString() },
    { label: "Reception rooms", value: details.receptionRooms?.toString() },
    {
      label: "Furnishing",
      value: details.furnishedStatus
        ? FURNISHED_STATUS_LABELS[details.furnishedStatus]
        : null,
    },
    { label: "Floor area", value: floorArea },
    {
      label: "Council tax",
      value: details.councilTaxBand ? `Band ${details.councilTaxBand}` : null,
    },
    { label: "Parking", value: details.parkingNotes },
    { label: "Outdoor space", value: details.outdoorSpaceNotes },
    ...PROPERTY_FEATURE_GROUPS.map((group) => ({
      label: group.label,
      value: group.features
        .filter((feature) => selectedFeatures.has(feature))
        .map((feature) => PROPERTY_FEATURE_LABELS[feature])
        .join(", "),
    })),
    { label: "Internal summary", value: details.generalNotes },
  ];
  // Features count as one detail, however many groups are empty.
  const featureLabels = new Set<string>(
    PROPERTY_FEATURE_GROUPS.map((group) => group.label),
  );
  const missing =
    missingDetails(
      keyDetails.filter(({ label }) => !featureLabels.has(label)),
    ) + (details.features.length === 0 ? 1 : 0);

  // What has happened, from records this page already shows the viewer.
  const timeline: TimelineEntry[] = [
    {
      key: "created",
      at: property.createdAt,
      icon: Building2,
      text: "Property added to Zayto",
    },
    ...instructions.flatMap((item): TimelineEntry[] => [
      {
        key: `instruction-${item.id}`,
        at: dayMoment(item.instructedOn),
        icon: ClipboardList,
        text: `Instruction ${item.reference} started${item.service ? ` (${LETTING_SERVICE_LABELS[item.service].toLowerCase()})` : ""}`,
      },
      ...(item.endedOn
        ? [
            {
              key: `instruction-ended-${item.id}`,
              at: dayMoment(item.endedOn),
              icon: ClipboardList,
              text: `Instruction ${item.reference} ended${item.endedReason ? `: ${item.endedReason}` : ""}`,
            },
          ]
        : []),
    ]),
    ...propertyListings.map((item): TimelineEntry => ({
      key: `listing-${item.id}`,
      at: item.stateChangedAt,
      icon: Megaphone,
      text:
        item.state === "draft"
          ? `Listing for ${item.instruction.reference} last saved as a draft`
          : `Listing for ${item.instruction.reference} became ${LISTING_STATE_LABELS[item.state]}`,
    })),
    ...(notes ?? [])
      .filter((note) => !note.voided)
      .map((note): TimelineEntry => ({
        key: `note-${note.id}`,
        at: note.occurredAt,
        icon: MessageSquare,
        who: note.authorName,
        text: "added a note",
        note: note.body,
        timed: true,
      })),
    ...property.transfers.map((transfer): TimelineEntry => ({
      key: `transfer-${transfer.id}`,
      at: transfer.createdAt,
      icon: GitBranch,
      text: `Moved from ${transfer.fromBranchName} to ${transfer.toBranchName}`,
      note: transfer.reason,
    })),
    ...property.ownerships.flatMap((owner): TimelineEntry[] => [
      ...(owner.startedOn
        ? [
            {
              key: `owner-${owner.id}`,
              at: owner.startedOn,
              icon: UserRound,
              text: `${owner.name} became an owner`,
            },
          ]
        : []),
      ...(owner.endedOn
        ? [
            {
              key: `owner-ended-${owner.id}`,
              at: owner.endedOn,
              icon: UserRound,
              text: `${owner.name} stopped being an owner`,
            },
          ]
        : []),
    ]),
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
        Back to properties
      </Button>
      {query.created === "yes" && (
        <div
          className="rounded-lg bg-success-soft p-4 text-sm text-success"
          role="status"
        >
          Property created. Add features and other details with Edit property.
        </div>
      )}
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
      <RecordHeader
        avatar={<Building2 className="size-5" />}
        title={addressLine(details)}
        subtitle={[
          details.postcode,
          lead?.name,
          property.responsibleBranch.name,
          property.reference,
        ]
          .filter(Boolean)
          .join(" · ")}
        badges={
          <>
            {property.archived && (
              <StatusBadge label="Archived" tone="inactive" />
            )}
            <Badge
              variant={lettingStatus === "ended" ? "secondary" : "info"}
              title={LETTING_STATUS_DESCRIPTIONS[lettingStatus]}
            >
              {LETTING_STATUS_LABELS[lettingStatus]}
            </Badge>
          </>
        }
        actions={
          <>
            {property.can.update && !property.archived && (
              <Button
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
                addOwner={addOwnerAction.bind(null, workspaceSlug, propertyId)}
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
          </>
        }
      >
        <JourneyBar steps={journey.steps} />
      </RecordHeader>

      <RecordTabs tabs={tabs} current={tab} path={path} />

      {tab === "overview" && (
        <>
          <div
            className={cn(
              "grid grid-cols-[minmax(0,1fr)] gap-4",
              attentionItems.length > 0 &&
                "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]",
            )}
          >
            {journey.next ? (
              <NextStepPanel
                title={journey.next.title}
                description={journey.next.description}
                checklist={journey.next.checklist}
                action={
                  <Button
                    render={<Link href={targetHref(journey.next.target)} />}
                    nativeButton={false}
                  >
                    {journey.next.actionLabel}
                    <ArrowRight aria-hidden="true" />
                  </Button>
                }
              />
            ) : (
              <NextStepPanel
                title={
                  property.archived
                    ? "This property is archived"
                    : "Nothing to do right now"
                }
                description={
                  property.archived
                    ? "Reactivate it to work on it again."
                    : activeInstruction
                      ? LETTING_STATUS_DESCRIPTIONS[lettingStatus]
                      : "There is no current instruction. One is started from a landlord lead once its appraisal is completed."
                }
              />
            )}
            <AttentionPanel
              tone={overdueCompliance.length ? "destructive" : "warning"}
              items={attentionItems}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  render={<Link href={`${path}?tab=compliance`} />}
                  nativeButton={false}
                >
                  {overdueCompliance.length
                    ? "Add newer evidence"
                    : "Open compliance"}
                </Button>
              }
            />
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <SectionCard
              title="Timeline"
              action={
                property.can.addNote && (
                  <Button
                    size="sm"
                    variant="outline"
                    render={<Link href={`${path}?tab=notes`} />}
                    nativeButton={false}
                  >
                    <Plus aria-hidden="true" />
                    Add note
                  </Button>
                )
              }
            >
              <Timeline entries={timeline} />
            </SectionCard>

            <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
              <SectionCard title="Key details">
                <KeyDetails
                  items={keyDetails}
                  more={
                    missing > 0 &&
                    property.can.update &&
                    !property.archived && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-fit"
                        render={<Link href={`${path}/edit`} />}
                        nativeButton={false}
                      >
                        <Plus aria-hidden="true" />
                        Add {missing} more{" "}
                        {missing === 1 ? "detail" : "details"}
                      </Button>
                    )
                  }
                />
              </SectionCard>

              <SectionCard title="People">
                {currentOwners.length ? (
                  <ul className="grid gap-3">
                    {currentOwners.map((owner) => (
                      <li key={owner.id} className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
                        >
                          {initials(owner.name)}
                        </span>
                        <span className="min-w-0 text-sm">
                          <Link
                            href={`${contactsPath}/${owner.contactId}`}
                            className="block font-medium underline-offset-4 [overflow-wrap:anywhere] hover:underline"
                          >
                            {owner.name}
                          </Link>
                          <span className="block text-xs text-muted-foreground">
                            {[
                              owner.isLead ? "Lead landlord" : "Owner",
                              owner.startedOn &&
                                `since ${formatDate(owner.startedOn)}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                      </li>
                    ))}
                    {currentInstruction?.leadStaff && (
                      <li className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
                        >
                          {initials(currentInstruction.leadStaff.name)}
                        </span>
                        <span className="min-w-0 text-sm">
                          <span className="block font-medium">
                            {currentInstruction.leadStaff.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            Lead staff member
                          </span>
                        </span>
                      </li>
                    )}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No current owners are recorded.
                  </p>
                )}
                {formerOwners.length > 0 && (
                  <details>
                    <summary className="w-fit cursor-pointer text-sm text-primary underline-offset-4 hover:underline">
                      Former owners ({formerOwners.length})
                    </summary>
                    <ul className="mt-3 grid gap-3">
                      {formerOwners.map((owner) => (
                        <li key={owner.id} className="text-sm">
                          <Link
                            href={`${contactsPath}/${owner.contactId}`}
                            className="font-medium underline-offset-4 hover:underline"
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
              </SectionCard>
            </div>
          </div>
        </>
      )}

      {tab === "instructions" && (
        <>
          <SectionCard title="Instruction">
            <p className="text-sm text-muted-foreground">
              The agency&apos;s appointment for this property. One can be
              current at a time.
            </p>
            {instructions.length ? (
              <ul className="grid divide-y border-t">
                {instructions.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        <Link
                          className="text-primary underline-offset-4 hover:underline"
                          href={`${base}/instructions/${item.id}`}
                        >
                          {item.reference}
                        </Link>
                        {item.service
                          ? ` · ${LETTING_SERVICE_LABELS[item.service]}`
                          : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.current
                          ? `Instructed ${formatDate(dayMoment(item.instructedOn))}`
                          : `Ended ${item.endedOn ? formatDate(dayMoment(item.endedOn)) : ""}${item.endedReason ? ` · ${item.endedReason}` : ""}`}
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
                No instruction yet. One is started from a landlord lead once its
                appraisal is completed.
              </p>
            )}
          </SectionCard>

          {propertyListings.length > 0 && (
            <SectionCard title="Listings">
              <p className="text-sm text-muted-foreground">
                Adverts prepared inside Zayto for this property. None of them is
                published.
              </p>
              <ul className="grid divide-y border-t">
                {propertyListings.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        <Link
                          className="text-primary underline-offset-4 hover:underline"
                          href={`${base}/marketing/${item.id}`}
                        >
                          {item.headline || "No headline yet"}
                        </Link>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.instruction.reference} · version {item.versionNo}
                      </p>
                    </div>
                    <ListingStateBadge state={item.state} />
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </>
      )}

      {tab === "compliance" && compliance.ok && (
        <div className={cn(CARD, "p-4 md:p-5")}>
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
        </div>
      )}

      {tab === "leads" && leadHistory && (
        <SectionCard title="Landlord leads">
          <p className="text-sm text-muted-foreground">
            Enquiries recorded against this property.
          </p>
          {leadHistory.items.length ? (
            <ul className="grid divide-y border-t">
              {leadHistory.items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      <Link
                        className="text-primary underline-offset-4 hover:underline"
                        href={`${base}/enquiries/${item.id}`}
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
        </SectionCard>
      )}

      {tab === "notes" && (
        <SectionCard title="Notes">
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
              showVoided ? `${path}?tab=notes` : `${path}?tab=notes&voided=1`
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
        </SectionCard>
      )}
    </div>
  );
}
