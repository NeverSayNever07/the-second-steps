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
  UserCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  addPartyAction,
  searchLandlordContactsAction,
  approveExceptionAction,
  changeMainContactAction,
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
  EndInstructionButton,
  ExceptionButton,
  LeadStaffButton,
  MakeMainButton,
  ManageTermsButton,
  MarkReadyButton,
  OwnershipCheckButton,
  RemoveLandlordButton,
  ReturnToOnboardingButton,
} from "@/components/instructions/instruction-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { requireMfaUserWith } from "@/core/auth/mfa";
import { listEnquiryAssignees } from "@/core/enquiries/application/enquiries";
import { LETTING_SERVICE_LABELS } from "@/core/enquiries/domain/enquiry-labels";
import { ukToday } from "@/core/enquiries/domain/enquiry";
import { getInstruction } from "@/core/instructions/application/instruction-records";
import {
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
  searchParams: Promise<{ started?: string | string[] }>;
}) {
  const { workspaceSlug, instructionId } = await params;
  if (!isUuid(instructionId)) notFound();
  const base = `/dashboard/w/${workspaceSlug}`;
  const path = `${base}/instructions/${instructionId}`;
  const {
    data: [record, context, allStaff],
  } = await requireMfaUserWith(path, { workspaceSlug }, (user) => {
    const actor = { authSubject: user.id, workspaceSlug };
    return Promise.all([
      getInstruction({ ...actor, instructionId }),
      getWorkspaceAccessContext(user.id, workspaceSlug),
      listEnquiryAssignees(actor),
    ]);
  });
  if (!context || !context.permissions.has("instruction.read")) {
    redirect("/access-denied");
  }
  if (!record) notFound();
  const query = await searchParams;
  const today = ukToday();
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
                {can.manage && stage === "onboarding" && (
                  <MarkReadyButton
                    action={markReadyAction.bind(
                      null,
                      workspaceSlug,
                      instructionId,
                    )}
                    disabled={!record.checklistComplete}
                  />
                )}
                {can.manage && stage === "ready_to_market" && (
                  <ReturnToOnboardingButton
                    action={returnToOnboardingAction.bind(
                      null,
                      workspaceSlug,
                      instructionId,
                    )}
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
          </section>

          <section className="grid gap-4" aria-labelledby="agreement">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="agreement" className="text-base font-semibold">
                  Agreement
                </h2>
                <p className="text-sm text-muted-foreground">
                  Signing happens outside Zayto. No signed copy is stored here
                  yet.
                </p>
              </div>
              {can.manage && (
                <AgreementButton
                  action={recordAgreementAction.bind(
                    null,
                    workspaceSlug,
                    instructionId,
                  )}
                  current={record.agreement.status}
                  today={today}
                />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <Badge
                variant={
                  record.agreement.status === "signed" ? "success" : "secondary"
                }
              >
                {record.agreement.status
                  ? AGREEMENT_STATUS_LABELS[record.agreement.status]
                  : "Not prepared"}
              </Badge>
              {record.agreement.signedOn && (
                <span className="text-sm text-muted-foreground">
                  Signed {day(record.agreement.signedOn)}
                </span>
              )}
              {can.approveExceptions &&
                record.agreement.status !== "signed" &&
                !record.exceptions.some(
                  (item) => item.kind === "agreement",
                ) && (
                  <ExceptionButton
                    action={approveExceptionAction.bind(
                      null,
                      workspaceSlug,
                      instructionId,
                    )}
                    kind="agreement"
                  />
                )}
            </div>
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
                  The agency&apos;s own conclusion. Zayto holds no evidence file
                  yet.
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
          </section>

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
        </div>
      </div>
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
