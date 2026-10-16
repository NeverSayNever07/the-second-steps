import { ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { ActionsRail } from "@/components/actions/actions-rail";
import { OverviewTab } from "@/components/dashboard/overview-tab";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { getDashboardSummary } from "@/core/actions/application/dashboard-summary";
import { getActionFormOptions } from "@/core/actions/application/form-options";
import { listWorkItems } from "@/core/actions/application/work-items";
import { requireMfaUser } from "@/core/auth/mfa";
import { ukToday } from "@/core/enquiries/domain/enquiry";

export default async function WorkspaceDashboardPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const path = `/dashboard/w/${workspaceSlug}`;
  const user = await requireMfaUser(path, { workspaceSlug });
  const actor = { authSubject: user.id, workspaceSlug };
  const [context, summary, workItems, formOptions] = await Promise.all([
    getWorkspaceAccessContext(user.id, workspaceSlug),
    getDashboardSummary(actor),
    listWorkItems(actor),
    getActionFormOptions(actor),
  ]);
  if (!context || !summary) redirect("/access-denied");

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
        <div className="order-2 xl:order-1">
          <OverviewTab summary={summary} workspacePath={path} />
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
