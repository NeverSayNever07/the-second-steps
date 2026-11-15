import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  FileSignature,
  FileText,
  Handshake,
  History,
  Megaphone,
  UserCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  addPartyAction,
  searchLandlordContactsAction,
  approveExceptionAction,
  changeMainContactAction,
  completeAgreementAction,
  discardAgreementDraftAction,
  endInstructionAction,
  markReadyAction,
  recordAgreementAction,
  recordOwnershipCheckAction,
  removePartyAction,
  replaceTermsAction,
  returnToOnboardingAction,
  setLeadStaffAction,
} from "../actions";
import {
  AddLandlordButton,
  AgreementButton,
  DiscardAgreementDraftButton,
  EndInstructionButton,
  ExceptionButton,
  LeadStaffButton,
  MakeMainButton,
  ManageTermsButton,
  MarkReadyButton,
  OwnershipCheckButton,
  RemoveLandlordButton,
  ReturnToOnboardingButton,
  SignedAgreementButton,
} from "@/components/instructions/instruction-controls";
import { InstructionListings } from "@/components/listings/instruction-listings";
import { OtherInstructions } from "@/components/instructions/other-instructions";
import { ListingStateBadge } from "@/components/listings/listing-state-badge";
import { ComplianceSnapshot } from "@/components/properties/compliance-snapshot";
import { PropertyCompliance } from "@/components/properties/property-compliance";
import { JourneyBar } from "@/components/records/journey-bar";
import {
  CARD,
  KeyDetails,
  NextStepPanel,
  SectionCard,
  Timeline,
  type TimelineEntry,
} from "@/components/records/record-cards";
import { RecordHeader } from "@/components/records/record-header";
import { derivePropertyJourney } from "@/core/properties/domain/property-journey";
import { LISTING_STATE_LABELS } from "@/core/listings/domain/listing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  currentTab,
  RecordTabs,
  type RecordTab,
} from "@/components/ui/record-tabs";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { requireMfaUserWith } from "@/core/auth/mfa";
import { getPropertyCompliance } from "@/core/compliance/application/property-compliance";
import { complianceAttention } from "@/components/properties/compliance-snapshot";
import { listEnquiryAssignees } from "@/core/enquiries/application/enquiries";
import { LETTING_SERVICE_LABELS } from "@/core/enquiries/domain/enquiry-labels";
import { ukToday } from "@/core/enquiries/domain/enquiry";
import {
  getInstruction,
  listInstructionsForProperty,
} from "@/core/instructions/application/instruction-records";
import { listListings } from "@/core/listings/application/listing-list";
import { getCurrentListingForInstruction } from "@/core/listings/application/listings";
import { prepareListingAction } from "../../marketing/actions";
import {
  AGREEMENT_STATE_LABELS,
  AGREEMENT_STATUS_LABELS,
  CHECKLIST_ACTION_HINTS,
  DEPOSIT_OFFERING_LABELS,
  EXCEPTION_KIND_LABELS,
  JOURNEY_STAGE_LABELS,
  OWNERSHIP_CHECK_STATUS_LABELS,
  basisPointsToField,
  formatFee,
  formatPence,
  formatRent,
  penceToField,
  vatPhrase,
} from "@/core/instructions/domain/instruction-labels";
import { isUuid } from "@/core/properties/domain/ids";
import { recordComplianceAction } from "@/app/dashboard/w/[workspaceSlug]/properties/compliance-actions";

const dateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC" });
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  dateStyle: "medium",
  timeStyle: "short",
});
const day = (value: string) =>
  dateFormat.format(new Date(`${value}T00:00:00Z`));

export default async function InstructionPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string; instructionId: string }>;
  searchParams: Promise<{
    started?: string | string[];
    tab?: string | string[];
    listing?: string | string[];
  }>;
}) {
  const { workspaceSlug, instructionId } = await params;
  if (!isUuid(instructionId)) notFound();
  const base = `/dashboard/w/${workspaceSlug}`;
  const path = `${base}/instructions/${instructionId}`;
  const {
    data: [loadedData, context, allStaff],
  } = await requireMfaUserWith(path, { workspaceSlug }, async (user) => {
    const actor = { authSubject: user.id, workspaceSlug };
    const [loaded, access, staffList] = await Promise.all([
      getInstruction({ ...actor, instructionId }),
      getWorkspaceAccessContext(user.id, workspaceSlug),
      listEnquiryAssignees(actor),
    ]);
    // The property's compliance, which the instruction shows and can update.
    const compliance = loaded
      ? await getPropertyCompliance({
          ...actor,
          propertyId: loaded.property.id,
        })
      : null;
    const [listing, propertyListings, propertyInstructions] = loaded
      ? await Promise.all([
          getCurrentListingForInstruction({ ...actor, instructionId }),
          listListings({
            ...actor,
            state: "all",
            propertyId: loaded.property.id,
          }),
          listInstructionsForProperty({
            ...actor,
            propertyId: loaded.property.id,
          }),
        ])
      : [null, null, []];
    return [
      { loaded, compliance, listing, propertyListings, propertyInstructions },
      access,
      staffList,
    ] as const;
  });
  if (!context || !context.permissions.has("instruction.read")) {
    redirect("/access-denied");
  }
  if (!loadedData.loaded) notFound();
  const record = loadedData.loaded;
  const compliance = loadedData.compliance;
  const currentListing = loadedData.listing;
  // Other instructions on this property, and every listing prepared for this
  // one: the history that survives a new letting (ADR-035).
  const otherInstructions = loadedData.propertyInstructions.filter(
    (item) => item.id !== instructionId,
  );
  const ownListings = (loadedData.propertyListings ?? []).filter(
    (item) => item.instruction.id === instructionId,
  );
  // An earlier advert on this property can be the starting point for a new one.
  const hasEarlierListing = (loadedData.propertyListings ?? []).some(
    (item) => item.state === "withdrawn",
  );
  const query = await searchParams;
  const today = ukToday();
  const attention = compliance?.ok
    ? complianceAttention(compliance.view)
    : null;
  const needsAttention = attention
    ? attention.expired.length + attention.actionRequired.length
    : 0;
  const tabs: RecordTab[] = [
    { id: "overview", label: "Overview" },
    { id: "terms", label: "Terms" },
    { id: "landlords", label: "Landlords & agreement" },
    ...(compliance?.ok
      ? [
          {
            id: "compliance",
            label: "Compliance",
            badge: needsAttention > 0 ? String(needsAttention) : undefined,
          },
        ]
      : []),
    { id: "history", label: "History" },
  ];
  const tab = currentTab(tabs, query.tab);
  const { can } = record;
  const stage = record.journeyStage;
  const staff = allStaff
    .filter(
      ({ branchIds }) =>
        branchIds === null || branchIds.includes(record.branch.id),
    )
    .map(({ membershipId, name }) => ({ membershipId, name }));
  const onInstruction = record.parties.map((party) => party.contact.id);
  const mainContact = record.parties.find((party) => party.isMainContact);
  const draft = record.agreement.agreements.find(
    (item) => item.state === "draft",
  );
  const terms = record.terms;

  // Where the property is on its journey, from this instruction and its
  // listing. Without permission to read listings nothing is guessed.
  const journey = derivePropertyJourney({
    leads: null,
    instruction: record.current
      ? {
          id: record.id,
          journeyStage: stage,
          instructedOn: record.instructedOn,
          checklist: record.checklist.map(({ label, met }) => ({ label, met })),
          checklistComplete: record.checklistComplete,
        }
      : null,
    listing: !context.permissions.has("listing.read")
      ? undefined
      : currentListing
        ? { id: currentListing.id, state: currentListing.state }
        : null,
    archived: false,
  });
  const canPrepare = context.permissions.has("listing.prepare");

  // What has happened on this instruction, with who did it. All of it is on
  // the record this page already loads for the viewer.
  const timeline: TimelineEntry[] = [
    {
      key: "started",
      at: new Date(`${record.instructedOn}T12:00:00Z`),
      icon: Handshake,
      text: "Instruction started",
    },
    ...record.journeyHistory.map((item): TimelineEntry => ({
      key: `journey-${item.id}`,
      at: item.at,
      icon: History,
      who: item.by,
      text: `moved it from ${JOURNEY_STAGE_LABELS[item.from]} to ${JOURNEY_STAGE_LABELS[item.to]}`,
      note: item.reason ?? undefined,
      timed: true,
    })),
    ...record.termsHistory.map((version, index): TimelineEntry => ({
      key: `terms-${version.id}`,
      at: version.createdAt,
      icon: FileText,
      who: version.createdBy,
      text:
        index === record.termsHistory.length - 1
          ? "recorded the terms"
          : "changed the terms",
      note: version.changeReason ?? undefined,
      timed: true,
    })),
    ...record.agreement.events.map((event): TimelineEntry => ({
      key: `agreement-event-${event.id}`,
      at: event.at,
      icon: FileSignature,
      who: event.by,
      text: `recorded the agreement as ${AGREEMENT_STATUS_LABELS[event.status].toLowerCase()}`,
      note: event.reason ?? undefined,
      timed: true,
    })),
    ...record.agreement.agreements.flatMap((item): TimelineEntry[] => [
      {
        key: `agreement-upload-${item.id}`,
        at: item.uploadedAt,
        icon: FileSignature,
        who: item.uploadedBy,
        text: "uploaded an agreement",
        timed: true,
      },
      ...(item.completedAt && item.completedBy
        ? [
            {
              key: `agreement-complete-${item.id}`,
              at: item.completedAt,
              icon: FileSignature,
              who: item.completedBy,
              text: "confirmed the signed agreement",
              timed: true,
            },
          ]
        : []),
      ...(item.discardedAt && item.discardedBy
        ? [
            {
              key: `agreement-discard-${item.id}`,
              at: item.discardedAt,
              icon: FileSignature,
              who: item.discardedBy,
              text: "discarded an agreement draft",
              note: item.discardReason ?? undefined,
              timed: true,
            },
          ]
        : []),
    ]),
    ...record.ownershipCheck.events.map((event): TimelineEntry => ({
      key: `ownership-${event.id}`,
      at: event.at,
      icon: UserCheck,
      who: event.by,
      text: `recorded the ownership check as ${OWNERSHIP_CHECK_STATUS_LABELS[event.status].toLowerCase()}`,
      note: event.reason ?? event.notes ?? undefined,
      timed: true,
    })),
    ...record.exceptions.map((item): TimelineEntry => ({
      key: `exception-${item.id}`,
      at: item.at,
      icon: UserCheck,
      who: item.by,
      text: `approved an exception: ${EXCEPTION_KIND_LABELS[item.kind].toLowerCase()}`,
      note: item.reason,
      timed: true,
    })),
    ...ownListings.map((item): TimelineEntry => ({
      key: `listing-${item.id}`,
      at: item.stateChangedAt,
      icon: Megaphone,
      text:
        item.state === "draft"
          ? "Listing last saved as a draft"
          : `Listing became ${LISTING_STATE_LABELS[item.state]}`,
    })),
    ...(record.ended
      ? [
          {
            key: "ended",
            at: record.ended.at,
            icon: Handshake,
            who: record.ended.by,
            text: "ended the instruction",
            note: record.ended.reason,
            timed: true,
          },
        ]
      : []),
  ];

  const leadStaffValue = (
    <span className="inline-flex flex-wrap items-center justify-end gap-x-2">
      <span>{record.leadStaff?.name ?? "Not chosen yet"}</span>
      {can.manage && (
        <LeadStaffButton
          action={setLeadStaffAction.bind(null, workspaceSlug, instructionId)}
          staff={staff}
          currentId={record.leadStaff?.membershipId ?? ""}
        />
      )}
    </span>
  );
  const linkClass = "text-primary underline-offset-4 hover:underline";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit"
        render={<Link href={`${base}/properties/${record.property.id}`} />}
        nativeButton={false}
      >
        <ArrowLeft aria-hidden="true" />
        Back to property
      </Button>
      {typeof query.listing === "string" && (
        <div
          className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          {query.listing === "instruction_not_ready"
            ? "The listing could not be prepared because the instruction is not Ready to market."
            : query.listing === "access_denied"
              ? "You do not have access to prepare listings."
              : "The listing could not be prepared. Try again."}
        </div>
      )}
      {query.started === "yes" && (
        <div
          className="rounded-lg bg-success-soft p-4 text-sm text-success"
          role="status"
        >
          Instruction started. The landlord lead is now marked Instruction won.
        </div>
      )}
      <RecordHeader
        avatar={<Handshake className="size-5" />}
        title={record.property.addressLine}
        subtitle={[
          record.property.postcode,
          mainContact?.contact.name,
          record.branch.name,
          record.reference,
        ]
          .filter(Boolean)
          .join(" · ")}
        badges={
          <>
            <Badge
              variant={
                stage === "ready_to_market"
                  ? "success"
                  : stage === "withdrawn"
                    ? "secondary"
                    : "info"
              }
            >
              {JOURNEY_STAGE_LABELS[stage]}
            </Badge>
            <Badge variant={record.current ? "success" : "secondary"}>
              {record.current ? "Current" : "Ended"}
            </Badge>
          </>
        }
        actions={
          can.manage ? (
            <EndInstructionButton
              action={endInstructionAction.bind(
                null,
                workspaceSlug,
                instructionId,
                record.property.id,
              )}
              today={today}
              instructedOn={record.instructedOn}
              hasListing={currentListing !== null}
            />
          ) : null
        }
      >
        {record.current && stage !== "withdrawn" && (
          <JourneyBar steps={journey.steps} />
        )}
      </RecordHeader>

      <RecordTabs tabs={tabs} current={tab} path={path} />

      {tab === "overview" && (
        <>
          {!record.current || stage === "withdrawn" ? (
            <NextStepPanel
              title="This instruction has ended"
              description={
                record.ended
                  ? `Ended ${day(record.ended.on)}: ${record.ended.reason}`
                  : "A new instruction starts from a new landlord lead."
              }
            />
          ) : stage === "onboarding" ? (
            <NextStepPanel
              title={
                record.checklistComplete
                  ? "Mark it Ready to market"
                  : "Finish onboarding"
              }
              description={
                record.checklistComplete
                  ? "Everything needed is in place. Mark the instruction Ready to market when you are happy."
                  : `${record.checklist.filter((item) => !item.met).length} still needed before this instruction can be marked Ready to market.`
              }
              action={
                can.manage ? (
                  <MarkReadyButton
                    action={markReadyAction.bind(
                      null,
                      workspaceSlug,
                      instructionId,
                    )}
                    disabled={!record.checklistComplete}
                  />
                ) : null
              }
            />
          ) : currentListing ? (
            <NextStepPanel
              title={journey.next?.title ?? "A listing has been prepared"}
              description={`${journey.next?.description ?? "A listing has been prepared for this instruction."} Nothing is published.`}
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <ListingStateBadge state={currentListing.state} />
                  <Button
                    render={
                      <Link href={`${base}/marketing/${currentListing.id}`} />
                    }
                    nativeButton={false}
                  >
                    <Megaphone aria-hidden="true" />
                    Open listing
                  </Button>
                </div>
              }
            />
          ) : (
            <NextStepPanel
              title="Prepare the listing"
              description="The instruction is Ready to market. This only prepares an advert inside Zayto; nothing is published."
              action={
                canPrepare ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <form
                      action={prepareListingAction.bind(
                        null,
                        workspaceSlug,
                        instructionId,
                        false,
                      )}
                    >
                      <Button type="submit">
                        <Megaphone aria-hidden="true" />
                        Prepare listing
                      </Button>
                    </form>
                    {hasEarlierListing && (
                      <form
                        action={prepareListingAction.bind(
                          null,
                          workspaceSlug,
                          instructionId,
                          true,
                        )}
                      >
                        <Button variant="outline" type="submit">
                          Start from the previous advert
                        </Button>
                      </form>
                    )}
                  </div>
                ) : null
              }
            />
          )}

          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
              {record.current && stage !== "withdrawn" && (
                <SectionCard
                  title={
                    stage === "ready_to_market"
                      ? "Ready to market"
                      : "Ready to market checklist"
                  }
                  action={
                    can.manage &&
                    stage === "ready_to_market" && (
                      <ReturnToOnboardingButton
                        action={returnToOnboardingAction.bind(
                          null,
                          workspaceSlug,
                          instructionId,
                        )}
                        hasListing={currentListing !== null}
                      />
                    )
                  }
                >
                  <p className="text-sm text-muted-foreground">
                    {stage === "ready_to_market"
                      ? "Everything needed is in place. It returns to Onboarding if a change leaves the checklist incomplete."
                      : "Zayto never moves a property on its own: complete the list, then mark it ready."}
                  </p>
                  <ul className="grid divide-y border-t">
                    {record.checklist.map((item) => (
                      <li key={item.code} className="flex gap-3 py-3">
                        {item.met ? (
                          <CheckCircle2
                            className="mt-0.5 size-4 shrink-0 text-success"
                            aria-hidden="true"
                          />
                        ) : (
                          <Circle
                            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {item.label}
                            <span className="sr-only">
                              {item.met ? " (done)" : " (still needed)"}
                            </span>
                          </p>
                          {item.excepted && (
                            <p className="text-xs text-muted-foreground">
                              Accepted through a manager&apos;s exception.
                            </p>
                          )}
                          {!item.met && (
                            <p className="text-xs text-muted-foreground">
                              {CHECKLIST_ACTION_HINTS[item.code]}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              )}

              {compliance?.ok && (
                <SectionCard title="Property compliance">
                  <p className="text-sm text-muted-foreground">
                    For information. It does not affect Ready to market; the
                    listing checks it before Ready to advertise.
                  </p>
                  <ComplianceSnapshot
                    view={compliance.view}
                    href={`${path}?tab=compliance`}
                  />
                </SectionCard>
              )}

              <SectionCard title="Timeline">
                <Timeline entries={timeline} />
              </SectionCard>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
              {terms && (
                <SectionCard
                  title="Key terms"
                  action={
                    <Link href={`${path}?tab=terms`} className={linkClass}>
                      <span className="text-sm">All terms</span>
                    </Link>
                  }
                >
                  <KeyDetails
                    items={[
                      {
                        label: "Service",
                        value: LETTING_SERVICE_LABELS[terms.service],
                      },
                      {
                        label: "Agreed asking rent",
                        value: (
                          <Missing when={terms.askingRentPence === null}>
                            {formatRent(terms)}
                          </Missing>
                        ),
                      },
                      {
                        label: "Agency fee",
                        value: (
                          <Missing when={terms.feeKind === null}>
                            {formatFee(terms)}
                          </Missing>
                        ),
                      },
                      {
                        label: "Deposit offered",
                        value: (
                          <Missing when={terms.depositOffering === null}>
                            {terms.depositOffering
                              ? DEPOSIT_OFFERING_LABELS[terms.depositOffering]
                              : "Not decided yet"}
                          </Missing>
                        ),
                      },
                    ]}
                  />
                </SectionCard>
              )}

              <SectionCard title="Instruction details">
                <KeyDetails
                  items={[
                    {
                      label: "Property",
                      value: (
                        <Link
                          className={linkClass}
                          href={`${base}/properties/${record.property.id}`}
                        >
                          {record.property.addressLine}
                        </Link>
                      ),
                    },
                    {
                      label: "Landlord lead",
                      value: (
                        <Link
                          className={linkClass}
                          href={`${base}/enquiries/${record.enquiry.id}`}
                        >
                          {record.enquiry.reference}
                        </Link>
                      ),
                    },
                    {
                      label: "Main contact",
                      value: mainContact ? (
                        <Link
                          className={linkClass}
                          href={`${base}/contacts/${mainContact.contact.id}`}
                        >
                          {mainContact.contact.name}
                        </Link>
                      ) : null,
                    },
                    { label: "Lead staff member", value: leadStaffValue },
                    { label: "Branch", value: record.branch.name },
                    { label: "Instructed", value: day(record.instructedOn) },
                    {
                      label: "Ended",
                      value: record.ended
                        ? `${day(record.ended.on)} by ${record.ended.by}`
                        : null,
                    },
                    {
                      label: "Reason it ended",
                      value: record.ended?.reason,
                    },
                  ]}
                />
              </SectionCard>
            </div>
          </div>
        </>
      )}

      {tab === "terms" && (
        <SectionCard
          title="Terms"
          action={
            can.manage &&
            terms && (
              <ManageTermsButton
                action={replaceTermsAction.bind(
                  null,
                  workspaceSlug,
                  instructionId,
                )}
                values={{
                  service: terms.service,
                  askingRent: penceToField(terms.askingRentPence),
                  rentPeriod: terms.rentPeriod ?? "month",
                  feeKind: terms.feeKind ?? "",
                  feeValue:
                    terms.feeKind === "percentage"
                      ? basisPointsToField(terms.feeValue)
                      : terms.feeKind === "fixed"
                        ? penceToField(terms.feeValue)
                        : "",
                  feeFrequency: terms.feeFrequency ?? "",
                  feeVat: terms.feeVat ?? "",
                  depositOffering: terms.depositOffering ?? "",
                  deposit: penceToField(terms.depositPence),
                  holdingDeposit: penceToField(terms.holdingDepositPence),
                  charges: terms.charges.map((charge) => ({
                    name: charge.name,
                    amount: penceToField(charge.amountPence),
                    vat: charge.vat,
                  })),
                }}
              />
            )
          }
        >
          <p className="text-sm text-muted-foreground">
            The service, rent, fee and deposit agreed with the landlord.
          </p>
          {terms && (
            <dl className="grid gap-x-8 gap-y-4 border-t pt-4 sm:grid-cols-2">
              <Term
                label="Service"
                value={LETTING_SERVICE_LABELS[terms.service]}
              />
              <Term
                label="Agreed asking rent"
                value={formatRent(terms)}
                missing={terms.askingRentPence === null}
              />
              <Term
                label="Agency fee"
                value={formatFee(terms)}
                missing={terms.feeKind === null}
              />
              <Term
                label="Deposit offered"
                value={
                  terms.depositOffering
                    ? `${DEPOSIT_OFFERING_LABELS[terms.depositOffering]}${terms.depositPence !== null ? `, ${formatPence(terms.depositPence)}` : ""}`
                    : "Not decided yet"
                }
                missing={terms.depositOffering === null}
              />
              {terms.holdingDepositPence !== null && (
                <Term
                  label="Holding deposit"
                  value={formatPence(terms.holdingDepositPence)}
                />
              )}
              {terms.charges.length > 0 && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">
                    Other charges
                  </dt>
                  <dd className="mt-0.5 text-sm font-medium">
                    {terms.charges
                      .map(
                        (charge) =>
                          `${charge.name} ${formatPence(charge.amountPence)} (${vatPhrase(charge.vat)})`,
                      )
                      .join(", ")}
                  </dd>
                </div>
              )}
            </dl>
          )}
          {record.termsHistory.length > 1 && (
            <details>
              <summary className="w-fit cursor-pointer text-sm text-primary">
                Terms history ({record.termsHistory.length} versions)
              </summary>
              <ol className="mt-3 grid divide-y border-t">
                {record.termsHistory.map((version, index) => (
                  <li key={version.id} className="grid gap-1 py-3">
                    <p className="text-sm font-medium">
                      {index === 0
                        ? "Current"
                        : `Version ${record.termsHistory.length - index}`}
                      {" · "}
                      {LETTING_SERVICE_LABELS[version.service]}
                      {" · "}
                      {formatRent(version)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Fee {formatFee(version).replace(/^Not /, "not ")}
                      {version.depositPence !== null
                        ? ` · Deposit ${formatPence(version.depositPence)}`
                        : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {dateTimeFormat.format(version.createdAt)} by{" "}
                      {version.createdBy}
                      {version.changeReason ? ` · ${version.changeReason}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </SectionCard>
      )}

      {tab === "landlords" && (
        <>
          <SectionCard
            title="Landlords"
            action={
              can.manage && (
                <AddLandlordButton
                  action={addPartyAction.bind(
                    null,
                    workspaceSlug,
                    instructionId,
                  )}
                  search={searchLandlordContactsAction.bind(
                    null,
                    workspaceSlug,
                    instructionId,
                  )}
                  onInstruction={onInstruction}
                />
              )
            }
          >
            <p className="text-sm text-muted-foreground">
              Who instructed us. This is separate from who owns the property.
            </p>
            <ul className="grid divide-y border-t">
              {record.parties.map((party) => (
                <li
                  key={party.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium [overflow-wrap:anywhere]">
                      <Link
                        className="text-primary underline-offset-4 hover:underline"
                        href={`${base}/contacts/${party.contact.id}`}
                      >
                        {party.contact.name}
                      </Link>
                      {party.isMainContact && (
                        <Badge variant="info" className="ml-2">
                          Main contact
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {party.contact.reference}
                    </p>
                  </div>
                  {can.manage && (
                    <div className="flex flex-wrap items-center gap-1">
                      {!party.isMainContact && (
                        <MakeMainButton
                          action={changeMainContactAction.bind(
                            null,
                            workspaceSlug,
                            instructionId,
                            party.id,
                          )}
                          name={party.contact.name}
                        />
                      )}
                      {(!party.isMainContact || record.parties.length > 1) && (
                        <RemoveLandlordButton
                          action={removePartyAction.bind(
                            null,
                            workspaceSlug,
                            instructionId,
                            party.id,
                          )}
                          name={party.contact.name}
                          isMain={party.isMainContact}
                          others={record.parties
                            .filter((other) => other.id !== party.id)
                            .map((other) => ({
                              value: other.id,
                              label: other.contact.name,
                            }))}
                        />
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {record.formerParties.length > 0 && (
              <details>
                <summary className="w-fit cursor-pointer text-sm text-primary">
                  Former landlords ({record.formerParties.length})
                </summary>
                <ul className="mt-3 grid divide-y border-t">
                  {record.formerParties.map((party) => (
                    <li key={party.id} className="py-3">
                      <p className="text-sm font-medium">
                        {party.contact.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Removed{" "}
                        {party.removedAt
                          ? dateTimeFormat.format(party.removedAt)
                          : ""}
                        {party.removedReason ? ` · ${party.removedReason}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </SectionCard>

          <SectionCard
            title="Agreement"
            action={
              can.manage && (
                <div className="flex flex-wrap items-center gap-2">
                  <AgreementButton
                    action={recordAgreementAction.bind(
                      null,
                      workspaceSlug,
                      instructionId,
                    )}
                    current={record.agreement.status}
                  />
                  <SignedAgreementButton
                    workspaceSlug={workspaceSlug}
                    instructionId={instructionId}
                    action={completeAgreementAction.bind(
                      null,
                      workspaceSlug,
                      instructionId,
                    )}
                    today={today}
                    landlords={(draft
                      ? draft.signatories.map((item) => item.name)
                      : record.parties.map((party) => party.contact.name)
                    ).sort()}
                    draftDocumentId={draft?.document.id ?? null}
                    hasAgreement={record.agreement.evidence !== "none"}
                  />
                </div>
              )
            }
          >
            <p className="text-sm text-muted-foreground">
              Signing happens outside Zayto. Upload the signed PDF to record it.
            </p>
            <div className="grid gap-1 border-t pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    record.agreement.evidence === "current"
                      ? "success"
                      : record.agreement.evidence === "update_required"
                        ? "warning"
                        : "secondary"
                  }
                >
                  {record.agreement.evidence === "current"
                    ? "Signed agreement"
                    : record.agreement.evidence === "update_required"
                      ? "Agreement update required"
                      : "No signed agreement"}
                </Badge>
                {record.agreement.evidence === "current" &&
                  record.agreement.signedOn && (
                    <span className="text-sm text-muted-foreground">
                      Signed {day(record.agreement.signedOn)}
                    </span>
                  )}
                {draft && <Badge variant="warning">Draft uploaded</Badge>}
                {record.agreement.status && (
                  <span className="text-sm text-muted-foreground">
                    Progress: {AGREEMENT_STATUS_LABELS[record.agreement.status]}
                  </span>
                )}
              </div>
              {record.agreement.evidence === "update_required" && (
                <p className="text-sm text-muted-foreground">
                  The fees or landlords changed since the last signed agreement.
                  Upload a fresh signed copy.
                </p>
              )}
            </div>
            {record.agreement.agreements.length > 0 && (
              <ol className="grid divide-y border-t text-sm">
                {record.agreement.agreements.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <div className="grid gap-0.5">
                      <span className="font-medium">
                        {AGREEMENT_STATE_LABELS[item.state]}
                        {item.signedOn ? ` · signed ${day(item.signedOn)}` : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Uploaded {dateTimeFormat.format(item.uploadedAt)} by{" "}
                        {item.uploadedBy}
                        {item.completedAt && item.completedBy
                          ? ` · completed ${dateTimeFormat.format(item.completedAt)} by ${item.completedBy}`
                          : ""}
                        {item.discardedAt && item.discardedBy
                          ? ` · discarded ${dateTimeFormat.format(item.discardedAt)} by ${item.discardedBy}${item.discardReason ? `: ${item.discardReason}` : ""}`
                          : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Landlords:{" "}
                        {item.signatories
                          .map((person) => person.name)
                          .join(", ")}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {item.state !== "discarded" && (
                        <Button
                          variant="outline"
                          size="sm"
                          render={
                            <a
                              href={`/dashboard/w/${workspaceSlug}/documents/${item.document.id}`}
                            />
                          }
                        >
                          Download
                        </Button>
                      )}
                      {can.manage && item.state === "draft" && (
                        <DiscardAgreementDraftButton
                          action={discardAgreementDraftAction.bind(
                            null,
                            workspaceSlug,
                            instructionId,
                            item.document.id,
                          )}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {record.agreement.events.length > 0 && (
              <ol className="grid divide-y border-t text-sm">
                {record.agreement.events.map((event) => (
                  <li key={event.id} className="py-2">
                    <span className="font-medium">
                      {AGREEMENT_STATUS_LABELS[event.status]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {" · "}
                      {dateTimeFormat.format(event.at)} by {event.by}
                      {event.reason ? ` · ${event.reason}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>

          <SectionCard
            title="Ownership check"
            action={
              can.manage && (
                <OwnershipCheckButton
                  action={recordOwnershipCheckAction.bind(
                    null,
                    workspaceSlug,
                    instructionId,
                  )}
                  current={record.ownershipCheck.status}
                  today={today}
                />
              )
            }
          >
            <p className="text-sm text-muted-foreground">
              The agency&apos;s own conclusion. Zayto holds no evidence file
              yet.
            </p>
            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <Badge
                variant={
                  record.ownershipCheck.status === "verified"
                    ? "success"
                    : record.ownershipCheck.status === "not_verified"
                      ? "warning"
                      : "secondary"
                }
              >
                {record.ownershipCheck.status
                  ? OWNERSHIP_CHECK_STATUS_LABELS[record.ownershipCheck.status]
                  : "Not started"}
              </Badge>
              {can.approveExceptions &&
                record.ownershipCheck.status !== "verified" &&
                !record.exceptions.some(
                  (item) => item.kind === "ownership_check",
                ) && (
                  <ExceptionButton
                    action={approveExceptionAction.bind(
                      null,
                      workspaceSlug,
                      instructionId,
                    )}
                    kind="ownership_check"
                  />
                )}
            </div>
            {record.ownershipCheck.events.length > 0 && (
              <ol className="grid divide-y border-t text-sm">
                {record.ownershipCheck.events.map((event) => (
                  <li key={event.id} className="py-2">
                    <span className="font-medium">
                      {OWNERSHIP_CHECK_STATUS_LABELS[event.status]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {" · "}
                      {event.checkedOn
                        ? `Checked ${day(event.checkedOn)}`
                        : "In progress"}
                      {event.method ? ` · ${event.method}` : ""}
                      {" · "}
                      {dateTimeFormat.format(event.at)} by {event.by}
                      {event.reason ? ` · ${event.reason}` : ""}
                      {event.notes ? ` · ${event.notes}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {record.exceptions.length > 0 && (
              <div className="grid gap-2 border-t pt-4">
                <h3 className="text-sm font-semibold">Manager exceptions</h3>
                <ul className="grid divide-y text-sm">
                  {record.exceptions.map((item) => (
                    <li key={item.id} className="py-2">
                      <span className="font-medium">
                        {EXCEPTION_KIND_LABELS[item.kind]}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {" · "}
                        {dateTimeFormat.format(item.at)} by {item.by} ·{" "}
                        {item.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </SectionCard>
        </>
      )}

      {tab === "compliance" && compliance?.ok && (
        <div className={`${CARD} p-4 md:p-5`}>
          <PropertyCompliance
            view={compliance.view}
            workspaceSlug={workspaceSlug}
            today={today}
            updateAction={(area) =>
              recordComplianceAction.bind(
                null,
                workspaceSlug,
                record.property.id,
                area,
                instructionId,
              )
            }
          />
        </div>
      )}

      {tab === "history" && (
        <>
          <OtherInstructions items={otherInstructions} workspacePath={base} />
          <InstructionListings items={ownListings} workspacePath={base} />
          <SectionCard title="Journey history">
            <Timeline
              entries={timeline.filter(
                ({ key }) =>
                  key === "started" ||
                  key === "ended" ||
                  key.startsWith("journey-"),
              )}
            />
          </SectionCard>
        </>
      )}
    </div>
  );
}

/** A value that still needs deciding is shown in amber. */
function Missing({ when, children }: { when: boolean; children: ReactNode }) {
  return <span className={when ? "text-warning" : undefined}>{children}</span>;
}

function Term({
  label,
  value,
  missing = false,
}: {
  label: string;
  value: string;
  missing?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={`mt-0.5 text-sm font-medium ${missing ? "text-warning" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
