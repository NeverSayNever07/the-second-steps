import { ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { ComingSoonTab } from "@/components/dashboard/coming-soon-tab";
import { CalendarTab } from "@/components/dashboard/calendar-tab";
import {
  DashboardTabs,
  availableTabs,
  dashboardTabHref,
  legacyDashboardTab,
  parseDashboardTab,
  type DashboardTab,
} from "@/components/dashboard/dashboard-tabs";
import { InstructionOnboardingPanel } from "@/components/dashboard/instruction-onboarding-panel";
import { LandlordsOverview } from "@/components/dashboard/landlords-overview";
import {
  getApplicantAttention,
  type ApplicantAttention,
} from "@/core/applicants/application/applicant-attention";
import { listPropertyEnquiries } from "@/core/applicants/application/property-enquiries";
import { MarketingOverview } from "@/components/dashboard/marketing-overview";
import { PipelineTab } from "@/components/dashboard/pipeline-tab";
import { DashboardToolbar } from "@/components/dashboard/toolbar";
import { ScheduleTab } from "@/components/dashboard/schedule-tab";
import { TeamTab } from "@/components/dashboard/team-tab";
import { YourDay } from "@/components/dashboard/your-day";
import {
  YourDayFigures,
  type DayFigure,
} from "@/components/dashboard/your-day-figures";
import {
  buildDay,
  groupDay,
  waitingEnquiries,
} from "@/components/dashboard/your-day-model";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { getDashboardSummary } from "@/core/actions/application/dashboard-summary";
import { getActionFormOptions } from "@/core/actions/application/form-options";
import { getStaffCalendar } from "@/core/actions/application/calendar";
import { getTodaysSchedule } from "@/core/actions/application/schedule";
import { getTeamWorkload } from "@/core/actions/application/team-workload";
import { getViewerFirstName } from "@/core/actions/application/viewer";
import { listWorkItems } from "@/core/actions/application/work-items";
import {
  calendarRange,
  parseCalendarDate,
  parseCalendarScope,
  parseCalendarView,
  type CalendarRange,
  type CalendarScope,
} from "@/core/actions/domain/calendar";
import { requireMfaUserWith } from "@/core/auth/mfa";
import {
  getComplianceAttention,
  type ComplianceAttention,
} from "@/core/compliance/application/compliance-attention";
import {
  listEnquiries,
  listEnquiryAssignees,
} from "@/core/enquiries/application/enquiries";
import { listEnquirySettings } from "@/core/enquiries/application/enquiry-lists";
import type { EnquiryActorInput } from "@/core/enquiries/application/enquiry-shared";
import {
  getListingAttention,
  type ListingAttention,
} from "@/core/listings/application/listing-attention";
import {
  OPEN_STAGES,
  parseUkDateTime,
  ukToday,
} from "@/core/enquiries/domain/enquiry";
import {
  getInstructionAttention,
  type InstructionAttention,
} from "@/core/instructions/application/instruction-attention";

type TabData = {
  summary?: Awaited<ReturnType<typeof getDashboardSummary>>;
  instructions?: InstructionAttention | null;
  compliance?: ComplianceAttention | null;
  listings?: ListingAttention | null;
  applicants?: ApplicantAttention | null;
  /** New property enquiries, for Your day. Null when the viewer may not read them. */
  newEnquiries?: Awaited<ReturnType<typeof listPropertyEnquiries>>;
  calendar?: Awaited<ReturnType<typeof getStaffCalendar>>;
  schedule?: Awaited<ReturnType<typeof getTodaysSchedule>>;
  pipeline?: {
    leads: Awaited<ReturnType<typeof listEnquiries>>;
    settings: Awaited<ReturnType<typeof listEnquirySettings>>;
    assignees: Awaited<ReturnType<typeof listEnquiryAssignees>>;
  };
  team?: {
    workload: NonNullable<Awaited<ReturnType<typeof getTeamWorkload>>>;
    people: Awaited<ReturnType<typeof listEnquiryAssignees>>;
  } | null;
};

type CalendarRequest = {
  range: CalendarRange;
  scope: CalendarScope;
  branchId?: string;
  membershipId?: string;
};

/** Only the selected tab's own data is loaded. */
async function loadTabData(
  tab: DashboardTab,
  actor: EnquiryActorInput,
  canSeeTeam: boolean,
  calendarRequest: CalendarRequest,
): Promise<TabData> {
  switch (tab) {
    case "home": {
      const [
        summary,
        instructions,
        schedule,
        compliance,
        listings,
        applicants,
        newEnquiries,
      ] = await Promise.all([
        getDashboardSummary(actor),
        getInstructionAttention(actor),
        getTodaysSchedule(actor),
        getComplianceAttention(actor),
        getListingAttention(actor),
        getApplicantAttention(actor),
        // Newest first, so read a page and keep the longest waiting.
        listPropertyEnquiries({ ...actor, stage: "new", take: 50 }),
      ]);
      return {
        summary,
        instructions,
        schedule,
        compliance,
        listings,
        applicants,
        newEnquiries,
      };
    }
    case "marketing":
      return {
        listings: await getListingAttention(actor),
        applicants: await getApplicantAttention(actor),
      };
    case "calendar":
      return {
        calendar: await getStaffCalendar({ ...actor, ...calendarRequest }),
      };
    case "landlords": {
      const [summary, instructions, leads, settings, assignees, workload] =
        await Promise.all([
          getDashboardSummary(actor),
          getInstructionAttention(actor),
          listEnquiries({ ...actor, stages: [...OPEN_STAGES], take: 100 }),
          listEnquirySettings(actor),
          listEnquiryAssignees(actor),
          canSeeTeam ? getTeamWorkload(actor) : Promise.resolve(null),
        ]);
      return {
        summary,
        instructions,
        pipeline: { leads, settings, assignees },
        team: workload ? { workload, people: assignees } : null,
      };
    }
    default:
      return {};
  }
}

export default async function WorkspaceDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{
    tab?: string | string[];
    view?: string | string[];
    date?: string | string[];
    scope?: string | string[];
    branch?: string | string[];
    person?: string | string[];
    add?: string | string[];
  }>;
}) {
  const { workspaceSlug } = await params;
  const path = `/dashboard/w/${workspaceSlug}`;
  const query = await searchParams;
  const requestedTab = query.tab;
  // Addresses from before the tabs were reorganised keep working.
  const moved = legacyDashboardTab(requestedTab);
  if (moved) redirect(dashboardTabHref(path, moved));
  const tab = parseDashboardTab(requestedTab);
  const today = ukToday();
  const calendarView = parseCalendarView(query.view);
  const calendarDate = parseCalendarDate(query.date, today);
  const calendarScope = parseCalendarScope(query.scope);
  const range = calendarRange(calendarDate, calendarView);
  const branchId = typeof query.branch === "string" ? query.branch : undefined;
  const membershipId =
    typeof query.person === "string" ? query.person : undefined;
  const requestedAddDateTime =
    typeof query.add === "string" ? query.add : undefined;
  const addDateTime = parseUkDateTime(requestedAddDateTime)
    ? requestedAddDateTime
    : undefined;
  // The reads start alongside the sign-in check; the selected tab loads its
  // own data, and the actions list is only needed on Home.
  const {
    data: [context, workItems, formOptions, tabData, firstName],
  } = await requireMfaUserWith(path, { workspaceSlug }, (user) => {
    const actor = { authSubject: user.id, workspaceSlug };
    return Promise.all([
      getWorkspaceAccessContext(user.id, workspaceSlug),
      tab === "home" ? listWorkItems(actor) : Promise.resolve([]),
      tab === "home" || tab === "calendar"
        ? getActionFormOptions(actor)
        : Promise.resolve(null),
      loadTabData(tab, actor, true, {
        range,
        scope: calendarScope,
        branchId,
        membershipId,
      }),
      getViewerFirstName(actor),
    ]);
  });
  if (!context) redirect("/access-denied");
  const canWorkLeads = context.permissions.has("enquiry.update");
  const canSeeLandlords =
    context.permissions.has("enquiry.read") ||
    context.permissions.has("instruction.read");
  const tabs = availableTabs(canSeeLandlords);
  // A tab this role may not use falls back to Home.
  if (parseDashboardTab(tab, tabs) !== tab) redirect(path);
  const {
    summary,
    instructions,
    compliance,
    schedule,
    pipeline,
    team,
    listings,
    applicants,
    newEnquiries,
    calendar,
  } = tabData;
  if (tab === "landlords" && !summary) redirect("/access-denied");

  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  // Your day: the reads the dashboard already made, sorted into one list.
  const jobs =
    tab === "home"
      ? buildDay({
          today,
          items: workItems,
          appraisals: schedule?.appraisals ?? [],
          compliance: compliance?.items ?? [],
          enquiries: waitingEnquiries(
            newEnquiries?.items ?? [],
            context.membership.id,
            now,
          ),
        })
      : [];
  const dayGroups = groupDay(jobs);
  const dayCounts = [
    dayGroups.now.length > 0 && `${dayGroups.now.length} to deal with now`,
    dayGroups.today.length > 0 && `${dayGroups.today.length} for today`,
  ].filter(Boolean);
  const summaryLine = [
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(now),
    ...(tab === "home"
      ? dayCounts.length > 0
        ? dayCounts
        : ["Nothing needs you right now"]
      : []),
  ].join(" · ");
  const creates = [
    ...(context.permissions.has("enquiry.create")
      ? [{ label: "Landlord lead", href: `${path}/enquiries/new` }]
      : []),
    ...(context.permissions.has("contact.create")
      ? [{ label: "Contact", href: `${path}/contacts/new` }]
      : []),
    ...(context.permissions.has("property.create")
      ? [{ label: "Property", href: `${path}/properties/new` }]
      : []),
  ];

  // The figures strip shows only what this role may read, and each figure
  // leads to the place it counts.
  const dayFigures: DayFigure[] = [
    ...(context.permissions.has("enquiry.read") && summary
      ? [
          {
            label: "open leads",
            value: summary.headline.openLeads,
            href: `${path}/enquiries`,
          },
        ]
      : []),
    ...(instructions
      ? [
          {
            label: "in onboarding",
            value: instructions.onboarding,
            href: `${path}/instructions?stage=onboarding`,
          },
          ...(instructions.stalled.count > 0
            ? [
                {
                  label: "stalled 7 days",
                  value: instructions.stalled.count,
                  tone: "warning" as const,
                  href: dashboardTabHref(path, "landlords"),
                },
              ]
            : []),
        ]
      : []),
    ...(listings
      ? [
          {
            label: "draft listings",
            value: listings.draft,
            href: `${path}/marketing`,
          },
        ]
      : []),
    ...(applicants
      ? [
          {
            label: "active applicants",
            value: applicants.activeApplicants,
            href: `${path}/applicants`,
          },
          {
            label: "open property enquiries",
            value: applicants.openEnquiries,
            href: `${path}/property-enquiries`,
          },
        ]
      : []),
    ...(compliance && compliance.counts.critical > 0
      ? [
          {
            label:
              compliance.counts.critical === 1
                ? "critical compliance issue"
                : "critical compliance issues",
            value: compliance.counts.critical,
            tone: "destructive" as const,
          },
        ]
      : []),
  ];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{summaryLine}</p>
        </div>
        <DashboardToolbar creates={creates} />
      </header>
      <DashboardTabs current={tab} workspacePath={path} tabs={tabs} />
      {tab === "home" && (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
          <YourDayFigures figures={dayFigures} />
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
            <YourDay
              workspaceSlug={workspaceSlug}
              jobs={jobs}
              today={today}
              options={formOptions}
              currentMembershipId={context.membership.id}
              moreCompliance={
                compliance ? compliance.total - compliance.items.length : 0
              }
            />
            {schedule && (
              <div className="min-w-0 xl:sticky xl:top-6">
                <ScheduleTab
                  schedule={schedule}
                  workspaceSlug={workspaceSlug}
                  canPlan={formOptions !== null}
                />
              </div>
            )}
          </div>
        </div>
      )}
      {tab === "calendar" && calendar && (
        <CalendarTab
          workspacePath={path}
          workspaceSlug={workspaceSlug}
          today={today}
          anchor={calendarDate}
          view={calendarView}
          scope={calendarScope}
          from={range.from}
          to={range.to}
          branchId={branchId}
          membershipId={membershipId}
          currentMembershipId={calendar.currentMembershipId}
          addDateTime={addDateTime}
          entries={calendar.entries.map((entry) => ({
            ...entry,
            startsAt: entry.startsAt.toISOString(),
          }))}
          branches={calendar.branches}
          people={calendar.people}
          actionOptions={formOptions}
        />
      )}
      {tab === "landlords" && summary && (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
          <LandlordsOverview
            summary={summary}
            workspacePath={path}
            now={now}
            instructionPanel={
              instructions ? (
                <InstructionOnboardingPanel
                  attention={instructions}
                  workspacePath={path}
                  now={now}
                />
              ) : null
            }
          />
          {pipeline && (
            <div id="lead-board" className="scroll-mt-4">
              <PipelineTab
                leads={pipeline.leads}
                workspaceSlug={workspaceSlug}
                today={today}
                canWork={canWorkLeads}
                assignees={pipeline.assignees}
                reasons={
                  pipeline.settings?.outcomeReasons.filter(
                    ({ status }) => status === "active",
                  ) ?? []
                }
              />
            </div>
          )}
          {team && canWorkLeads && (
            <TeamTab
              workload={team.workload}
              people={team.people}
              currentMembershipId={context.membership.id}
            />
          )}
        </div>
      )}
      {tab === "marketing" && listings && (
        <MarketingOverview
          attention={listings}
          applicants={applicants ?? null}
          workspacePath={path}
        />
      )}
      {((tab === "marketing" && !listings) ||
        tab === "pre-tenancy" ||
        tab === "management") && <ComingSoonTab area={tab} />}
      <div className="flex gap-3 rounded-lg bg-info-soft p-4 text-sm text-info">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-medium">Protected workspace</p>
          <p>
            Workspace membership, role permissions and database isolation are
            active. Records remain limited to your permitted branch scope.
          </p>
        </div>
      </div>
    </div>
  );
}
