import { ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { ActionsRail } from "@/components/actions/actions-rail";
import {
  DashboardTabs,
  availableTabs,
  parseDashboardTab,
  type DashboardTab,
} from "@/components/dashboard/dashboard-tabs";
import { InstructionOnboardingPanel } from "@/components/dashboard/instruction-onboarding-panel";
import { OverviewTab } from "@/components/dashboard/overview-tab";
import { PipelineTab } from "@/components/dashboard/pipeline-tab";
import { DashboardToolbar } from "@/components/dashboard/toolbar";
import { ScheduleTab } from "@/components/dashboard/schedule-tab";
import { TeamTab } from "@/components/dashboard/team-tab";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { getDashboardSummary } from "@/core/actions/application/dashboard-summary";
import { getActionFormOptions } from "@/core/actions/application/form-options";
import { getTodaysSchedule } from "@/core/actions/application/schedule";
import { getTeamWorkload } from "@/core/actions/application/team-workload";
import { getViewerFirstName } from "@/core/actions/application/viewer";
import { listWorkItems } from "@/core/actions/application/work-items";
import { requireMfaUserWith } from "@/core/auth/mfa";
import {
  listEnquiries,
  listEnquiryAssignees,
} from "@/core/enquiries/application/enquiries";
import { listEnquirySettings } from "@/core/enquiries/application/enquiry-lists";
import type { EnquiryActorInput } from "@/core/enquiries/application/enquiry-shared";
import { OPEN_STAGES, ukToday } from "@/core/enquiries/domain/enquiry";
import {
  getInstructionAttention,
  type InstructionAttention,
} from "@/core/instructions/application/instruction-attention";

type TabData = {
  summary?: Awaited<ReturnType<typeof getDashboardSummary>>;
  instructions?: InstructionAttention | null;
  pipeline?: {
    leads: Awaited<ReturnType<typeof listEnquiries>>;
    settings: Awaited<ReturnType<typeof listEnquirySettings>>;
    assignees: Awaited<ReturnType<typeof listEnquiryAssignees>>;
  };
  schedule?: Awaited<ReturnType<typeof getTodaysSchedule>>;
  team?: {
    workload: NonNullable<Awaited<ReturnType<typeof getTeamWorkload>>>;
    people: Awaited<ReturnType<typeof listEnquiryAssignees>>;
  } | null;
};

/** Only the selected tab's own data is loaded. */
async function loadTabData(
  tab: DashboardTab,
  actor: EnquiryActorInput,
): Promise<TabData> {
  switch (tab) {
    case "pipeline": {
      const [leads, settings, assignees] = await Promise.all([
        listEnquiries({ ...actor, stages: [...OPEN_STAGES], take: 100 }),
        listEnquirySettings(actor),
        listEnquiryAssignees(actor),
      ]);
      return { pipeline: { leads, settings, assignees } };
    }
    case "schedule":
      return { schedule: await getTodaysSchedule(actor) };
    case "team": {
      const [workload, people] = await Promise.all([
        getTeamWorkload(actor),
        listEnquiryAssignees(actor),
      ]);
      return { team: workload ? { workload, people } : null };
    }
    default:
      const [summary, instructions] = await Promise.all([
        getDashboardSummary(actor),
        getInstructionAttention(actor),
      ]);
      return { summary, instructions };
  }
}

export default async function WorkspaceDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { workspaceSlug } = await params;
  const tab = parseDashboardTab((await searchParams).tab);
  const path = `/dashboard/w/${workspaceSlug}`;
  // The reads start alongside the sign-in check; the actions list is on every
  // tab and the selected tab adds its own data.
  const {
    data: [context, workItems, formOptions, tabData, firstName],
  } = await requireMfaUserWith(path, { workspaceSlug }, (user) => {
    const actor = { authSubject: user.id, workspaceSlug };
    return Promise.all([
      getWorkspaceAccessContext(user.id, workspaceSlug),
      listWorkItems(actor),
      getActionFormOptions(actor),
      loadTabData(tab, actor),
      getViewerFirstName(actor),
    ]);
  });
  if (!context) redirect("/access-denied");
  const canWorkLeads = context.permissions.has("enquiry.update");
  const tabs = availableTabs(canWorkLeads);
  // A tab this role may not use falls back to the Overview.
  if (parseDashboardTab(tab, tabs) !== tab) redirect(path);
  const { pipeline, summary, instructions, schedule, team } = tabData;
  if (tab === "overview" && !summary) redirect("/access-denied");
  if (tab === "team" && !team) redirect(path);

  const today = ukToday();
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
  const overdue = workItems.filter((item) => item.overdue).length;
  const dueToday = workItems.filter((item) => item.dueOn === today).length;
  const summaryLine = [
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(now),
    `${overdue} overdue`,
    `${dueToday} due today`,
    ...(summary
      ? [
          `${summary.todaysAppraisals.length} ${
            summary.todaysAppraisals.length === 1 ? "appraisal" : "appraisals"
          }`,
        ]
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

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{summaryLine}</p>
        </div>
      </header>
      <DashboardToolbar creates={creates} />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="order-2 grid min-w-0 gap-4 xl:order-1">
          <DashboardTabs current={tab} workspacePath={path} tabs={tabs} />
          {summary && (
            <OverviewTab summary={summary} workspacePath={path} now={now} />
          )}
          {summary && instructions && (
            <InstructionOnboardingPanel
              attention={instructions}
              workspacePath={path}
              now={now}
            />
          )}
          {pipeline && (
            <PipelineTab
              leads={pipeline.leads}
              workspaceSlug={workspaceSlug}
              today={ukToday()}
              canWork={canWorkLeads}
              assignees={pipeline.assignees}
              reasons={
                pipeline.settings?.outcomeReasons.filter(
                  ({ status }) => status === "active",
                ) ?? []
              }
            />
          )}
          {schedule && (
            <ScheduleTab
              schedule={schedule}
              workspaceSlug={workspaceSlug}
              canPlan={formOptions !== null}
            />
          )}
          {team && (
            <TeamTab
              workload={team.workload}
              people={team.people}
              currentMembershipId={context.membership.id}
            />
          )}
        </div>
        <div className="order-1 min-w-0 xl:sticky xl:top-6 xl:order-2">
          <ActionsRail
            workspaceSlug={workspaceSlug}
            items={workItems}
            today={ukToday()}
            options={formOptions}
            currentMembershipId={context.membership.id}
          />
        </div>
      </div>
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
