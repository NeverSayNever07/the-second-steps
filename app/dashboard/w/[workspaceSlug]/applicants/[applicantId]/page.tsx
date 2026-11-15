import {
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  History,
  Home,
  UserPlus,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ApplicantStatusControls } from "@/components/applicants/applicant-status-controls";
import {
  EnquiryList,
  formatWhen,
  RequirementsHint,
  RequirementsList,
  SuggestedHomes,
} from "@/components/applicants/applicant-views";
import {
  AddHouseholdMember,
  ChangeApplicantOwner,
  RemoveHouseholdMember,
} from "@/components/applicants/household-controls";
import { EditRequirements } from "@/components/applicants/edit-requirements";
import {
  KeyDetails,
  NextStepPanel,
  SectionCard,
  Timeline,
  type TimelineEntry,
} from "@/components/records/record-cards";
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
import { listEnquiryAssignees } from "@/core/enquiries/application/enquiries";
import { isUuid } from "@/core/properties/domain/ids";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { listEnquirySettings } from "@/core/enquiries/application/enquiry-lists";
import { listListings } from "@/core/listings/application/listing-list";
import { AddEnquiryTask } from "@/components/enquiries/enquiry-task-controls";
import { NewEnquiryDialog } from "@/components/applicants/new-enquiry-dialog";
import {
  addApplicantMemberAction,
  addApplicantNextActionAction,
  assignApplicantAction,
  changeApplicantStatusAction,
  createEnquiryAction,
  registerEnquiryAction,
  removeApplicantMemberAction,
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
  const query = await searchParams;
  // The homes and sources are only needed by Record enquiry on its own tab.
  const onEnquiriesTab = query.tab === "enquiries";
  const {
    data: [
      result,
      suggestions,
      reasons,
      allOwners,
      context,
      readyListings,
      settings,
    ],
  } = await requireMfaUserWith(path, { workspaceSlug }, (user) => {
    const actor = { authSubject: user.id, workspaceSlug };
    return Promise.all([
      getApplicant({ ...actor, applicantId }),
      suggestedListingsForApplicant({ ...actor, applicantId }),
      listLettingsReasons(actor),
      listEnquiryAssignees(actor),
      getWorkspaceAccessContext(user.id, workspaceSlug),
      onEnquiriesTab
        ? listListings({ ...actor, state: "ready_to_advertise", take: 100 })
        : null,
      onEnquiriesTab ? listEnquirySettings(actor) : null,
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
  const tab = currentTab(tabs, query.tab);
  const owners = (allOwners ?? []).filter(
    ({ branchIds }) =>
      branchIds === null || branchIds.includes(applicant.branch.id),
  );
  const canEdit = applicant.can.manage && applicant.status !== "closed";
  const canAddAction =
    canEdit && Boolean(context?.permissions.has("action.manage"));
  const closeReasons = (reasons ?? [])
    .filter(
      (reason) =>
        reason.appliesTo === "applicant" && reason.status === "active",
    )
    .map(({ id, name }) => ({ id, name }));

  // What has happened, with who did it, from the record already loaded.
  const timeline: TimelineEntry[] = [
    {
      key: "registered",
      at: applicant.createdAt,
      icon: UserRound,
      text: "Registered as an applicant",
    },
    ...applicant.statusHistory.map((item): TimelineEntry => ({
      key: `status-${item.id}`,
      at: item.at,
      icon: History,
      who: item.by,
      text: `changed the status from ${APPLICANT_STATUS_LABELS[item.from]} to ${APPLICANT_STATUS_LABELS[item.to]}`,
      note: item.note ?? undefined,
      timed: true,
    })),
    ...applicant.requirementHistory.map((version): TimelineEntry => ({
      key: `requirements-${version.versionNo}`,
      at: version.createdAt,
      icon: ClipboardList,
      who: version.createdBy,
      text:
        version.versionNo === 1
          ? "saved what they are looking for"
          : "updated what they are looking for",
      timed: true,
    })),
    ...applicant.members.map((member): TimelineEntry => ({
      key: `member-${member.memberId}`,
      at: member.addedAt,
      icon: UserPlus,
      text: `${member.contact.name} joined the household`,
    })),
    ...applicant.enquiries.map((enquiry): TimelineEntry => ({
      key: `enquiry-${enquiry.id}`,
      at: enquiry.createdAt,
      icon: Home,
      text: `Enquired about ${enquiry.property.address}`,
    })),
  ];

  const addAction = canAddAction && context && (
    <AddEnquiryTask
      action={addApplicantNextActionAction.bind(
        null,
        workspaceSlug,
        applicantId,
      )}
      assignees={owners}
      currentMembershipId={context.membership.id}
      description="Give this applicant a clear owner and due date."
    />
  );
  const linkClass = "text-primary underline-offset-4 hover:underline";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
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
        subtitle={[
          `Applicant ${applicant.reference}`,
          applicant.branch.name,
          applicant.owner ? `Looked after by ${applicant.owner.name}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        badges={
          <Badge variant={statusVariant(applicant.status)}>
            {APPLICANT_STATUS_LABELS[applicant.status]}
          </Badge>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <ChangeApplicantOwner
                action={assignApplicantAction.bind(
                  null,
                  workspaceSlug,
                  applicantId,
                )}
                assignees={owners}
                currentMembershipId={applicant.owner?.membershipId ?? null}
              />
            )}
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
          </div>
        }
      />

      <RecordTabs tabs={tabs} current={tab} path={path} />

      {tab === "overview" && (
        <>
          {applicant.status === "closed" ? (
            <NextStepPanel
              title="This applicant is closed"
              description={
                applicant.closure
                  ? `${applicant.closure.reason ?? "Closed"}${applicant.closure.note ? ` (${applicant.closure.note})` : ""}`
                  : undefined
              }
            />
          ) : !applicant.requirements ? (
            <NextStepPanel
              title="Add what they are looking for"
              description="Homes can only be suggested once their requirements are saved."
              action={
                <Button
                  render={<Link href={`${path}?tab=requirements`} />}
                  nativeButton={false}
                >
                  Open requirements
                  <ArrowRight aria-hidden="true" />
                </Button>
              }
            />
          ) : applicant.nextAction ? (
            <NextStepPanel
              title={applicant.nextAction.title}
              description={`Due ${dateFormat.format(applicant.nextAction.dueOn)}. Finish it from Your day on the dashboard.`}
              action={addAction}
            />
          ) : (
            <NextStepPanel
              title="Add a next action"
              description="No next action. Give this applicant a clear owner and due date."
              action={addAction}
            />
          )}

          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
              <SectionCard
                title="Requirements"
                action={
                  <Link href={`${path}?tab=requirements`} className={linkClass}>
                    <span className="text-sm">All requirements</span>
                  </Link>
                }
              >
                {applicant.requirements ? (
                  <RequirementsList
                    requirements={applicant.requirements.requirements}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No requirements saved yet.
                  </p>
                )}
              </SectionCard>
              <SectionCard title="Timeline">
                <Timeline entries={timeline} />
              </SectionCard>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
              <SectionCard title="Applicant details">
                <KeyDetails
                  items={[
                    {
                      label: "Lead contact",
                      value: (
                        <Link
                          className={linkClass}
                          href={`${base}/contacts/${applicant.lead.id}`}
                        >
                          {applicant.lead.name}
                        </Link>
                      ),
                    },
                    {
                      label: "Email",
                      value: applicant.lead.email ? (
                        <a
                          className={linkClass}
                          href={`mailto:${applicant.lead.email}`}
                        >
                          {applicant.lead.email}
                        </a>
                      ) : null,
                    },
                    {
                      label: "Telephone",
                      value: applicant.lead.telephone ? (
                        <a
                          className={linkClass}
                          href={`tel:${applicant.lead.telephone}`}
                        >
                          {applicant.lead.telephone}
                        </a>
                      ) : null,
                    },
                    { label: "Branch", value: applicant.branch.name },
                    {
                      label: "Looked after by",
                      value: applicant.owner?.name ?? "Nobody yet",
                    },
                    { label: "Source", value: applicant.source?.name },
                    {
                      label: "Registered",
                      value: dateFormat.format(applicant.createdAt),
                    },
                  ]}
                />
              </SectionCard>

              <SectionCard
                title="Household"
                action={
                  canEdit && (
                    <AddHouseholdMember
                      action={addApplicantMemberAction.bind(
                        null,
                        workspaceSlug,
                        applicantId,
                      )}
                    />
                  )
                }
              >
                <ul className="grid divide-y">
                  <li className="grid gap-0.5 pb-3">
                    <span className="text-sm font-medium">
                      {applicant.lead.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Lead contact
                    </span>
                  </li>
                  {applicant.members.map((member) => (
                    <li
                      key={member.memberId}
                      className="flex flex-wrap items-center justify-between gap-2 py-3 last:pb-0"
                    >
                      <div className="grid gap-0.5">
                        <Link
                          className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline"
                          href={`${base}/contacts/${member.contact.id}`}
                        >
                          {member.contact.name}
                        </Link>
                        <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                          {[member.contact.email, member.contact.telephone]
                            .filter(Boolean)
                            .join(" · ") || "No contact details"}
                        </span>
                      </div>
                      {canEdit && (
                        <RemoveHouseholdMember
                          name={member.contact.name}
                          action={removeApplicantMemberAction.bind(
                            null,
                            workspaceSlug,
                            applicantId,
                            member.memberId,
                          )}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </SectionCard>
            </div>
          </div>
        </>
      )}

      {tab === "requirements" && (
        <>
          <SectionCard
            title="Current requirements"
            action={
              canEdit && (
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
              )
            }
          >
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
          </SectionCard>
          {applicant.requirementHistory.length > 1 && (
            <SectionCard title="Earlier versions">
              <ul className="grid divide-y">
                {applicant.requirementHistory.slice(1).map((version) => (
                  <li
                    key={version.versionNo}
                    className="py-4 first:pt-0 last:pb-0"
                  >
                    <p className="mb-3 text-xs text-muted-foreground">
                      Version {version.versionNo} · {version.createdBy} ·{" "}
                      {formatWhen(version.createdAt)}
                    </p>
                    <RequirementsList requirements={version.requirements} />
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </>
      )}

      {tab === "enquiries" && (
        <SectionCard
          title="Property enquiries"
          action={
            canEdit && (
              <NewEnquiryDialog
                action={createEnquiryAction.bind(null, workspaceSlug)}
                applicant={{
                  id: applicantId,
                  name: applicant.lead.name,
                  reference: applicant.reference,
                }}
                homes={(readyListings ?? []).map((listing) => ({
                  id: listing.id,
                  label: `${listing.property.address}${listing.property.postcode ? `, ${listing.property.postcode}` : ""}`,
                }))}
                sources={(settings?.leadSources ?? []).filter(
                  ({ status }) => status === "active",
                )}
                applicantsPath={`${base}/applicants`}
              />
            )
          }
        >
          <EnquiryList enquiries={applicant.enquiries} base={base} />
        </SectionCard>
      )}

      {tab === "homes" && (
        <SectionCard title="Homes that fit">
          <p className="text-xs text-muted-foreground">
            Ready to advertise (inside Zayto only) homes that meet the saved
            requirements. This is a filter in a neutral order, not a ranking.
          </p>
          {suggestions.ok ? (
            <SuggestedHomes
              items={suggestions.items}
              hasRequirements={suggestions.hasRequirements}
              base={base}
              applicantName={applicant.lead.name}
              registerFor={
                canEdit
                  ? (listingId) =>
                      registerEnquiryAction.bind(
                        null,
                        workspaceSlug,
                        applicantId,
                        listingId,
                      )
                  : undefined
              }
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Suggested homes could not be shown.
            </p>
          )}
        </SectionCard>
      )}

      {tab === "history" && (
        <SectionCard title="Status history">
          {applicant.statusHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No status changes yet.
            </p>
          ) : (
            <Timeline
              entries={timeline.filter(({ key }) => key.startsWith("status-"))}
            />
          )}
        </SectionCard>
      )}
    </div>
  );
}
