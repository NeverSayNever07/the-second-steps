import {
  ArrowLeft,
  Building2,
  CalendarClock,
  Mail,
  Phone,
  Tag,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ApplicantStatusControls } from "@/components/applicants/applicant-status-controls";
import {
  EnquiryList,
  formatWhen,
  RequirementsHint,
  RequirementsList,
  SectionHeading,
  SuggestedHomes,
} from "@/components/applicants/applicant-views";
import { EditRequirements } from "@/components/applicants/edit-requirements";
import { RecordHeader } from "@/components/records/record-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  currentTab,
  RecordTabs,
  type RecordTab,
} from "@/components/ui/record-tabs";
import { suggestedListingsForApplicant } from "@/core/applicants/application/applicant-matching";
import { getApplicant } from "@/core/applicants/application/applicant-views";
import { listLettingsReasons } from "@/core/applicants/application/applicants";
import {
  APPLICANT_STATUS_LABELS,
  type ApplicantStatusCode,
} from "@/core/applicants/domain/applicant";
import { requireMfaUserWith } from "@/core/auth/mfa";
import { isUuid } from "@/core/properties/domain/ids";
import {
  changeApplicantStatusAction,
  saveApplicantRequirementsAction,
} from "../actions";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  dateStyle: "medium",
});

function initials(name: string) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

function statusVariant(status: ApplicantStatusCode) {
  if (status === "active") return "success" as const;
  if (status === "on_hold") return "warning" as const;
  return "secondary" as const;
}

export default async function ApplicantPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string; applicantId: string }>;
  searchParams: Promise<{ tab?: string | string[]; created?: string }>;
}) {
  const { workspaceSlug, applicantId } = await params;
  if (!isUuid(applicantId)) notFound();
  const base = `/dashboard/w/${workspaceSlug}`;
  const path = `${base}/applicants/${applicantId}`;
  const {
    data: [result, suggestions, reasons],
  } = await requireMfaUserWith(path, { workspaceSlug }, (user) => {
    const actor = { authSubject: user.id, workspaceSlug };
    return Promise.all([
      getApplicant({ ...actor, applicantId }),
      suggestedListingsForApplicant({ ...actor, applicantId }),
      listLettingsReasons(actor),
    ]);
  });
  if (!result.ok) {
    if (result.error === "access_denied") redirect("/access-denied");
    notFound();
  }
  const applicant = result.applicant;
  const enquiryCount = applicant.enquiries.filter(
    (enquiry) => enquiry.stage !== "closed",
  ).length;
  const tabs: RecordTab[] = [
    { id: "overview", label: "Overview" },
    { id: "requirements", label: "Requirements" },
    {
      id: "enquiries",
      label: `Property enquiries${enquiryCount ? ` (${enquiryCount})` : ""}`,
    },
    { id: "homes", label: "Suggested homes" },
    { id: "history", label: "History" },
  ];
  const query = await searchParams;
  const tab = currentTab(tabs, query.tab);
  const closeReasons = (reasons ?? [])
    .filter(
      (reason) =>
        reason.appliesTo === "applicant" && reason.status === "active",
    )
    .map(({ id, name }) => ({ id, name }));

  return (
    <div className="grid gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit"
        render={<Link href={`${base}/applicants`} />}
        nativeButton={false}
      >
        <ArrowLeft aria-hidden="true" />
        Back to applicants
      </Button>
      {query.created === "yes" && (
        <div
          className="rounded-lg bg-success-soft p-4 text-sm text-success"
          role="status"
        >
          Applicant created. Next step: add what they are looking for and a next
          action.
        </div>
      )}
      <RecordHeader
        avatar={initials(applicant.lead.name)}
        title={applicant.lead.name}
        subtitle={`Applicant ${applicant.reference}`}
        badges={
          <Badge variant={statusVariant(applicant.status)}>
            {APPLICANT_STATUS_LABELS[applicant.status]}
          </Badge>
        }
        actions={
          <ApplicantStatusControls
            status={applicant.status}
            canManage={applicant.can.manage}
            canReopen={applicant.can.reopen}
            action={changeApplicantStatusAction.bind(
              null,
              workspaceSlug,
              applicantId,
            )}
            closeReasons={closeReasons}
          />
        }
        facts={[
          { label: "Branch", value: applicant.branch.name, icon: Building2 },
          {
            label: "Owner",
            value: applicant.owner?.name ?? "Not assigned",
            icon: UserRound,
          },
          {
            label: "Source",
            value: applicant.source?.name ?? "Not recorded",
            icon: Tag,
          },
          {
            label: "Registered",
            value: dateFormat.format(applicant.createdAt),
            icon: CalendarClock,
          },
        ]}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <header className="order-last grid content-start gap-6 border-t pt-6 lg:order-none lg:col-start-2 lg:row-start-1 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
          <h2 className="text-base font-semibold">Applicant details</h2>
          <dl className="grid gap-5">
            <Detail
              label="Lead contact"
              icon={UserRound}
              value={`${applicant.lead.name} (${applicant.lead.reference})`}
              href={`${base}/contacts/${applicant.lead.id}`}
            />
            {applicant.lead.email && (
              <Detail
                label="Email"
                icon={Mail}
                value={applicant.lead.email}
                href={`mailto:${applicant.lead.email}`}
              />
            )}
            {applicant.lead.telephone && (
              <Detail
                label="Telephone"
                icon={Phone}
                value={applicant.lead.telephone}
                href={`tel:${applicant.lead.telephone}`}
              />
            )}
          </dl>
        </header>

        <div className="grid min-w-0 content-start gap-6 lg:col-start-1 lg:row-start-1">
          <RecordTabs tabs={tabs} current={tab} path={path} />

          {tab === "overview" && (
            <div className="grid gap-8">
              {applicant.closure && (
                <p
                  className="rounded-lg bg-muted px-3 py-2 text-sm"
                  role="status"
                >
                  Closed
                  {applicant.closure.reason
                    ? `: ${applicant.closure.reason}`
                    : ""}
                  {applicant.closure.note ? ` (${applicant.closure.note})` : ""}
                </p>
              )}
              <section className="grid gap-3">
                <SectionHeading title="Next action" />
                {applicant.nextAction ? (
                  <p className="text-sm">
                    {applicant.nextAction.title} · due{" "}
                    {dateFormat.format(applicant.nextAction.dueOn)}
                  </p>
                ) : (
                  <p className="text-sm font-medium text-warning">
                    No next action
                  </p>
                )}
              </section>
              <section className="grid gap-3 border-t pt-6">
                <SectionHeading title="Household" />
                <ul className="grid divide-y rounded-lg border">
                  <li className="grid gap-0.5 p-4">
                    <span className="font-medium">{applicant.lead.name}</span>
                    <span className="text-xs text-muted-foreground">
                      Lead contact
                    </span>
                  </li>
                  {applicant.members.map((member) => (
                    <li key={member.memberId} className="grid gap-0.5 p-4">
                      <Link
                        className="w-fit font-medium text-primary underline-offset-4 hover:underline"
                        href={`${base}/contacts/${member.contact.id}`}
                      >
                        {member.contact.name}
                      </Link>
                      <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                        {[member.contact.email, member.contact.telephone]
                          .filter(Boolean)
                          .join(" · ") || "No contact details"}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="grid gap-3 border-t pt-6">
                <SectionHeading title="Requirements" />
                {applicant.requirements ? (
                  <RequirementsList
                    requirements={applicant.requirements.requirements}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No requirements saved yet.
                  </p>
                )}
              </section>
            </div>
          )}

          {tab === "requirements" && (
            <div className="grid gap-8">
              <section className="grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <SectionHeading title="Current requirements" />
                  {applicant.can.manage && applicant.status !== "closed" && (
                    <EditRequirements
                      action={saveApplicantRequirementsAction.bind(
                        null,
                        workspaceSlug,
                        applicantId,
                      )}
                      current={applicant.requirements?.requirements ?? null}
                      label={
                        applicant.requirements
                          ? "Edit requirements"
                          : "Add requirements"
                      }
                    />
                  )}
                </div>
                {applicant.requirements ? (
                  <RequirementsList
                    requirements={applicant.requirements.requirements}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No requirements saved yet.
                  </p>
                )}
                <RequirementsHint />
              </section>
              {applicant.requirementHistory.length > 1 && (
                <section className="grid gap-3 border-t pt-6">
                  <SectionHeading title="Earlier versions" />
                  <ul className="grid divide-y rounded-lg border">
                    {applicant.requirementHistory.slice(1).map((version) => (
                      <li key={version.versionNo} className="p-4">
                        <p className="mb-3 text-xs text-muted-foreground">
                          Version {version.versionNo} · {version.createdBy} ·{" "}
                          {formatWhen(version.createdAt)}
                        </p>
                        <RequirementsList requirements={version.requirements} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          {tab === "enquiries" && (
            <section className="grid gap-3">
              <SectionHeading title="Property enquiries" />
              <EnquiryList enquiries={applicant.enquiries} base={base} />
            </section>
          )}

          {tab === "homes" && (
            <section className="grid gap-3">
              <SectionHeading title="Homes that fit" />
              <p className="text-xs text-muted-foreground">
                Ready to advertise (inside Zayto only) homes that meet the saved
                requirements. This is a filter in a neutral order, not a
                ranking.
              </p>
              {suggestions.ok ? (
                <SuggestedHomes
                  items={suggestions.items}
                  hasRequirements={suggestions.hasRequirements}
                  base={base}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Suggested homes could not be shown.
                </p>
              )}
            </section>
          )}

          {tab === "history" && (
            <section className="grid gap-3">
              <SectionHeading title="Status history" />
              <ul className="grid divide-y rounded-lg border">
                {applicant.statusHistory.length === 0 ? (
                  <li className="p-4 text-sm text-muted-foreground">
                    No status changes yet.
                  </li>
                ) : (
                  applicant.statusHistory.map((item) => (
                    <li key={item.id} className="grid gap-0.5 p-4">
                      <span className="text-sm font-medium">
                        {APPLICANT_STATUS_LABELS[item.from]} to{" "}
                        {APPLICANT_STATUS_LABELS[item.to]}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {item.by} · {formatWhen(item.at)}
                      </span>
                      {item.note && (
                        <span className="text-sm [overflow-wrap:anywhere]">
                          {item.note}
                        </span>
                      )}
                    </li>
                  ))
                )}
              </ul>
            </section>
          )}
        </div>
      </div>
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
  value: string;
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
          {href ? (
            <Link
              className="text-primary underline-offset-4 hover:underline"
              href={href}
            >
              {value}
            </Link>
          ) : (
            value
          )}
        </dd>
      </div>
    </div>
  );
}
