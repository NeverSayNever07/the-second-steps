import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  Circle,
  FileText,
  GitBranch,
  Handshake,
  History,
  Inbox,
  Megaphone,
  UserCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import { ListingStateBadge } from "@/components/listings/listing-state-badge";
import { ComplianceSnapshot } from "@/components/properties/compliance-snapshot";
import { PropertyCompliance } from "@/components/properties/property-compliance";
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
import { getInstruction } from "@/core/instructions/application/instruction-records";
import { getCurrentListingForInstruction } from "@/core/listings/application/listings";
import type { ListingStateCode } from "@/core/listings/domain/listing";
import { prepareListingAction } from "../../marketing/actions";
import type { ChecklistItemCode } from "@/core/instructions/domain/instruction";
import {
  AGREEMENT_STATE_LABELS,
  AGREEMENT_STATUS_LABELS,
  CHECKLIST_ACTION_HINTS,
  DEPOSIT_OFFERING_LABELS,
  EXCEPTION_KIND_LABELS,
  FEE_VAT_LABELS,
  JOURNEY_STAGE_LABELS,
  OWNERSHIP_CHECK_STATUS_LABELS,
  basisPointsToField,
  formatFee,
  formatPence,
  formatRent,
  penceToField,
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
    const listing = loaded
      ? await getCurrentListingForInstruction({ ...actor, instructionId })
      : null;
    return [{ loaded, compliance, listing }, access, staffList] as const;
  });
  if (!context || !context.permissions.has("instruction.read")) {
    redirect("/access-denied");
  }
  if (!loadedData.loaded) notFound();
  const record = loadedData.loaded;
  const compliance = loadedData.compliance;
  const currentListing = loadedData.listing;
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

  return (
    <div className="grid gap-6">
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
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <header className="grid content-start gap-6">
          <div className="flex items-center gap-4 lg:flex-col lg:items-start">
            <span
              aria-hidden="true"
              className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-accent text-primary"
            >
              <Handshake className="size-6" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">
                {record.property.addressLine}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {record.property.postcode}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
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
                <span className="text-xs text-muted-foreground">
                  {record.reference}
                </span>
              </div>
            </div>
          </div>
          {can.manage && (
            <div className="flex flex-wrap gap-2">
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
            </div>
          )}
          <dl className="grid gap-5 border-t pt-6">
            <Detail
              label="Property"
              icon={Building2}
              value={`${record.property.addressLine} (${record.property.reference})`}
              href={`${base}/properties/${record.property.id}`}
            />
            <Detail
              label="Landlord lead"
              icon={Inbox}
              value={`${record.enquiry.name} (${record.enquiry.reference})`}
              href={`${base}/enquiries/${record.enquiry.id}`}
            />
            <Detail
              label="Main contact"
              icon={Handshake}
              value={mainContact?.contact.name ?? null}
              href={
                mainContact
                  ? `${base}/contacts/${mainContact.contact.id}`
                  : undefined
              }
            />
            <div className="flex gap-3">
              <UserCheck
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">
                  Lead staff member
                </dt>
                <dd className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm font-medium">
                  <span>{record.leadStaff?.name ?? "Not chosen yet"}</span>
                  {can.manage && (
                    <LeadStaffButton
                      action={setLeadStaffAction.bind(
                        null,
                        workspaceSlug,
                        instructionId,
                      )}
                      staff={staff}
                      currentId={record.leadStaff?.membershipId ?? ""}
                    />
                  )}
                </dd>
              </div>
            </div>
            <Detail
              label="Branch"
              icon={GitBranch}
              value={record.branch.name}
            />
            <Detail
              label="Instructed"
              icon={CalendarDays}
              value={day(record.instructedOn)}
            />
            {record.ended && (
              <>
                <Detail
                  label="Ended"
                  icon={CalendarDays}
                  value={`${day(record.ended.on)} by ${record.ended.by}`}
                />
                <Detail
                  label="Reason it ended"
                  icon={FileText}
                  value={record.ended.reason}
                />
              </>
            )}
          </dl>
        </header>

        <div className="grid min-w-0 content-start gap-10 lg:border-l lg:pl-10">
          <RecordTabs tabs={tabs} current={tab} path={path} />

          {tab === "overview" && (
            <>
              <NextStep
                stage={stage}
                current={record.current}
                checklist={record.checklist}
                checklistComplete={record.checklistComplete}
                listing={currentListing}
                prepareListing={
                  context.permissions.has("listing.prepare")
                    ? prepareListingAction.bind(
                        null,
                        workspaceSlug,
                        instructionId,
                      )
                    : null
                }
                listingHref={
                  currentListing
                    ? `${base}/marketing/${currentListing.id}`
                    : null
                }
                markReady={
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

              {record.current && stage !== "withdrawn" && (
                <section className="grid gap-4" aria-labelledby="readiness">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 id="readiness" className="text-base font-semibold">
                        {stage === "ready_to_market"
                          ? "Ready to market"
                          : "Ready to market checklist"}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {stage === "ready_to_market"
                          ? "Everything needed is in place. It returns to Onboarding if a change leaves the checklist incomplete."
                          : "Zayto never moves a property on its own: complete the list, then mark it ready."}
                      </p>
                    </div>
                    {can.manage && stage === "ready_to_market" && (
                      <ReturnToOnboardingButton
                        action={returnToOnboardingAction.bind(
                          null,
                          workspaceSlug,
                          instructionId,
                        )}
                        hasListing={currentListing !== null}
                      />
                    )}
                  </div>
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
                </section>
              )}

              {terms && (
                <section
                  className="grid gap-4 border-t pt-6"
                  aria-labelledby="key-terms"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 id="key-terms" className="text-base font-semibold">
                      Key terms
                    </h2>
                    <Link
                      href={`${path}?tab=terms`}
                      className="text-sm text-primary underline-offset-4 hover:underline"
                    >
                      All terms
                    </Link>
                  </div>
                  <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
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
                          ? DEPOSIT_OFFERING_LABELS[terms.depositOffering]
                          : "Not decided yet"
                      }
                      missing={terms.depositOffering === null}
                    />
                  </dl>
                </section>
              )}

              {compliance?.ok && (
                <section
                  className="grid gap-3 border-t pt-6"
                  aria-labelledby="compliance-summary"
                >
                  <div>
                    <h2
                      id="compliance-summary"
                      className="text-base font-semibold"
                    >
                      Property compliance
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      For information. It does not affect Ready to market; it
                      will gate Ready to advertise once listings exist.
                    </p>
                  </div>
                  <ComplianceSnapshot
                    view={compliance.view}
                    href={`${path}?tab=compliance`}
                  />
                </section>
              )}
            </>
          )}

          {tab === "terms" && (
            <section className="grid gap-4" aria-labelledby="terms">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 id="terms" className="text-base font-semibold">
                    Terms
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    The service, rent, fee and deposit agreed with the landlord.
                  </p>
                </div>
                {can.manage && terms && (
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
                )}
              </div>
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
                              `${charge.name} ${formatPence(charge.amountPence)} (${FEE_VAT_LABELS[charge.vat].toLowerCase()})`,
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
                          Fee {formatFee(version).toLowerCase()}
                          {version.depositPence !== null
                            ? ` · Deposit ${formatPence(version.depositPence)}`
                            : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {dateTimeFormat.format(version.createdAt)} by{" "}
                          {version.createdBy}
                          {version.changeReason
                            ? ` · ${version.changeReason}`
                            : ""}
                        </p>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </section>
          )}

          {tab === "landlords" && (
            <>
              <section className="grid gap-4" aria-labelledby="landlords">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 id="landlords" className="text-base font-semibold">
                      Landlords
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Who instructed us. This is separate from who owns the
                      property.
                    </p>
                  </div>
                  {can.manage && (
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
                  )}
                </div>
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
                          {(!party.isMainContact ||
                            record.parties.length > 1) && (
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
                            {party.removedReason
                              ? ` · ${party.removedReason}`
                              : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>

              <section className="grid gap-4" aria-labelledby="agreement">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 id="agreement" className="text-base font-semibold">
                      Agreement
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Signing happens outside Zayto. Upload the signed PDF to
                      record it.
                    </p>
                  </div>
                  {can.manage && (
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
                  )}
                </div>
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
                        Progress:{" "}
                        {AGREEMENT_STATUS_LABELS[record.agreement.status]}
                      </span>
                    )}
                  </div>
                  {record.agreement.evidence === "update_required" && (
                    <p className="text-sm text-muted-foreground">
                      The fees or landlords changed since the last signed
                      agreement. Upload a fresh signed copy.
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
                            {item.signedOn
                              ? ` · signed ${day(item.signedOn)}`
                              : ""}
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
              </section>

              <section className="grid gap-4" aria-labelledby="ownership">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 id="ownership" className="text-base font-semibold">
                      Ownership check
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      The agency&apos;s own conclusion. Zayto holds no evidence
                      file yet.
                    </p>
                  </div>
                  {can.manage && (
                    <OwnershipCheckButton
                      action={recordOwnershipCheckAction.bind(
                        null,
                        workspaceSlug,
                        instructionId,
                      )}
                      current={record.ownershipCheck.status}
                      today={today}
                    />
                  )}
                </div>
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
                      ? OWNERSHIP_CHECK_STATUS_LABELS[
                          record.ownershipCheck.status
                        ]
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
                    <h3 className="text-sm font-semibold">
                      Manager exceptions
                    </h3>
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
              </section>
            </>
          )}

          {tab === "compliance" && compliance?.ok && (
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
          )}

          {tab === "history" && (
            <section className="grid gap-4" aria-labelledby="journey">
              <h2
                id="journey"
                className="flex items-center gap-2 text-base font-semibold"
              >
                <History
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                Journey history
              </h2>
              <ol className="grid divide-y border-t">
                <li className="grid gap-1 py-3">
                  <p className="text-sm font-medium">Instruction started</p>
                  <p className="text-xs text-muted-foreground">
                    {day(record.instructedOn)}
                  </p>
                </li>
                {[...record.journeyHistory].reverse().map((item) => (
                  <li key={item.id} className="grid gap-1 py-3">
                    <p className="text-sm font-medium">
                      {JOURNEY_STAGE_LABELS[item.from]} to{" "}
                      {JOURNEY_STAGE_LABELS[item.to]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {dateTimeFormat.format(item.at)} by {item.by}
                      {item.reason ? ` · ${item.reason}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function NextStep({
  stage,
  current,
  checklist,
  checklistComplete,
  markReady,
  listing,
  prepareListing,
  listingHref,
}: {
  stage: "onboarding" | "ready_to_market" | "withdrawn";
  current: boolean;
  checklist: readonly {
    code: ChecklistItemCode;
    label: string;
    met: boolean;
  }[];
  checklistComplete: boolean;
  /** The Mark ready button, for people who can manage the instruction. */
  markReady: ReactNode;
  /** The instruction's current listing, if there is one. */
  listing: { id: string; state: ListingStateCode } | null;
  /** Prepares a listing; null for people who may not. */
  prepareListing: (() => Promise<void>) | null;
  listingHref: string | null;
}) {
  if (!current || stage === "withdrawn") return null;

  if (stage === "ready_to_market") {
    return (
      <div className="grid gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-success">Ready to market</p>
            <p>
              {listing
                ? "A listing has been prepared for this instruction."
                : "Next: prepare the listing, the advert for this property."}
            </p>
          </div>
          {listing && listingHref ? (
            <div className="flex flex-wrap items-center gap-2">
              <ListingStateBadge state={listing.state} />
              <Button
                size="sm"
                render={<Link href={listingHref} />}
                nativeButton={false}
              >
                <Megaphone aria-hidden="true" />
                Open listing
              </Button>
            </div>
          ) : prepareListing ? (
            <form action={prepareListing}>
              <Button size="sm" type="submit">
                <Megaphone aria-hidden="true" />
                Prepare listing
              </Button>
            </form>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          This only prepares an advert inside Zayto. Nothing is published.
        </p>
      </div>
    );
  }

  const missing = checklist.filter((item) => !item.met);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground">
      <div className="min-w-0">
        {checklistComplete ? (
          <>
            <p className="font-medium">Everything is in place</p>
            <p>Mark the instruction Ready to market when you are happy.</p>
          </>
        ) : (
          <>
            <p className="font-medium">
              Next: {missing[0]?.label.toLowerCase()}
            </p>
            <p>
              {missing.length} item{missing.length === 1 ? "" : "s"} left before
              this instruction can be marked Ready to market.
            </p>
          </>
        )}
      </div>
      {markReady}
    </div>
  );
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

function Detail({
  label,
  value,
  icon: Icon,
  href,
}: {
  label: string;
  value: string | null | undefined;
  icon: LucideIcon;
  href?: string;
}) {
  return (
    <div className="flex gap-3">
      <Icon
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 text-sm font-medium [overflow-wrap:anywhere]">
          {value && href ? (
            <Link
              className="text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
              href={href}
            >
              {value}
            </Link>
          ) : (
            value || "Not recorded"
          )}
        </dd>
      </div>
    </div>
  );
}
