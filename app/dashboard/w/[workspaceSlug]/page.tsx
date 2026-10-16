import { ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { ActionsRail } from "@/components/actions/actions-rail";
import {
  DashboardTabs,
  parseDashboardTab,
  type DashboardTab,
} from "@/components/dashboard/dashboard-tabs";
import { OverviewTab } from "@/components/dashboard/overview-tab";
import { PipelineTab } from "@/components/dashboard/pipeline-tab";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { getDashboardSummary } from "@/core/actions/application/dashboard-summary";
import { getActionFormOptions } from "@/core/actions/application/form-options";
import { listWorkItems } from "@/core/actions/application/work-items";
import { requireMfaUserWith } from "@/core/auth/mfa";
import {
  listEnquiries,
  listEnquiryAssignees,
} from "@/core/enquiries/application/enquiries";
import { listEnquirySettings } from "@/core/enquiries/application/enquiry-lists";
import type { EnquiryActorInput } from "@/core/enquiries/application/enquiry-shared";
import { OPEN_STAGES, ukToday } from "@/core/enquiries/domain/enquiry";

/** Only the selected tab's own data is loaded. */
async function loadTabData(tab: DashboardTab, actor: EnquiryActorInput) {
  if (tab === "pipeline") {
    const [leads, settings, assignees] = await Promise.all([
      listEnquiries({ ...actor, stages: [...OPEN_STAGES], take: 100 }),
      listEnquirySettings(actor),
      listEnquiryAssignees(actor),
    ]);
    return { summary: null, pipeline: { leads, settings, assignees } };
  }
  return { summary: await getDashboardSummary(actor), pipeline: null };
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
    data: [context, workItems, formOptions, tabData],
  } = await requireMfaUserWith(path, { workspaceSlug }, (user) => {
    const actor = { authSubject: user.id, workspaceSlug };
    return Promise.all([
      getWorkspaceAccessContext(user.id, workspaceSlug),
      listWorkItems(actor),
      getActionFormOptions(actor),
      loadTabData(tab, actor),
    ]);
  });
  if (!context) redirect("/access-denied");
  const { summary, pipeline } = tabData;
  if (tab === "overview" && !summary) redirect("/access-denied");

  return (
    <div className="grid gap-8">
      <header>
        <p className="text-sm text-muted-foreground">Overview</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Needs attention
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your actions, and how landlord leads are getting on.
        </p>
      </header>
      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="order-2 grid gap-6 xl:order-1">
          <DashboardTabs current={tab} workspacePath={path} />
          {summary && <OverviewTab summary={summary} workspacePath={path} />}
          {pipeline && (
            <PipelineTab
              leads={pipeline.leads}
              workspaceSlug={workspaceSlug}
              today={ukToday()}
              canWork={context.permissions.has("enquiry.update")}
              assignees={pipeline.assignees}
              reasons={
                pipeline.settings?.outcomeReasons.filter(
                  ({ status }) => status === "active",
                ) ?? []
              }
            />
          )}
        </div>
        <div className="order-1 xl:sticky xl:top-6 xl:order-2">
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
