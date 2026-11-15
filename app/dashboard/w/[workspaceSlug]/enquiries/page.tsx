import { redirect } from "next/navigation";
import { createLandlordLeadAction } from "./actions";
import { NewLandlordLeadDialog } from "@/components/enquiries/new-landlord-lead-form";
import { EnquiriesWorklist } from "@/components/enquiries/enquiries-worklist";
import { ListPageHeader } from "@/components/records/list-page-header";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { requireMfaUserWith } from "@/core/auth/mfa";
import { listEnquirySettings } from "@/core/enquiries/application/enquiry-lists";
import {
  listEnquiryAssignees,
  listEnquiryPage,
} from "@/core/enquiries/application/enquiries";
import { getEnquiryViewCounts } from "@/core/enquiries/application/enquiry-views";
import {
  ENQUIRY_STAGES,
  type EnquiryStageCode,
} from "@/core/enquiries/domain/enquiry";
import { parseEnquiryView } from "@/core/enquiries/domain/enquiry-views";
import { isUuid } from "@/core/properties/domain/ids";
import { toActiveBranchOptions } from "@/core/workspace/domain/branch-option";
import { getWorkspaceBranches } from "@/core/workspace/application/workspace-branches";

function pageNumber(value: string | string[] | undefined) {
  const number = typeof value === "string" ? Number(value) : 1;
  return Number.isSafeInteger(number) && number > 0 ? number : 1;
}

export default async function EnquiriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{
    branch?: string | string[];
    assigned?: string | string[];
    view?: string | string[];
    stage?: string | string[];
    created?: string | string[];
    new?: string | string[];
    page?: string | string[];
  }>;
}) {
  const { workspaceSlug } = await params;
  const path = `/dashboard/w/${workspaceSlug}/enquiries`;
  const search = await searchParams;
  const branchId = isUuid(search.branch) ? search.branch : "";
  const assignedId = isUuid(search.assigned) ? search.assigned : "";
  // An old address can still name one stage; otherwise a view decides.
  const stage =
    typeof search.stage === "string" &&
    ENQUIRY_STAGES.includes(search.stage as EnquiryStageCode)
      ? (search.stage as EnquiryStageCode)
      : "";
  const view = stage ? null : parseEnquiryView(search.view);
  const page = pageNumber(search.page);
  const {
    data: [result, context, branches, assignees, settings, counts],
  } = await requireMfaUserWith(path, { workspaceSlug }, (user) =>
    Promise.all([
      listEnquiryPage({
        authSubject: user.id,
        workspaceSlug,
        branchId: branchId || undefined,
        assignedMembershipId: assignedId || undefined,
        stages: stage ? [stage] : undefined,
        view: view ?? undefined,
        page,
      }),
      getWorkspaceAccessContext(user.id, workspaceSlug),
      getWorkspaceBranches(user.id, workspaceSlug),
      listEnquiryAssignees({ authSubject: user.id, workspaceSlug }),
      listEnquirySettings({ authSubject: user.id, workspaceSlug }),
      getEnquiryViewCounts({
        authSubject: user.id,
        workspaceSlug,
        branchId: branchId || undefined,
        assignedMembershipId: assignedId || undefined,
      }),
    ]),
  );
  if (!context || !branches || !context.permissions.has("enquiry.read")) {
    redirect("/access-denied");
  }
  const canCreate = context.permissions.has("enquiry.create");
  const created = isUuid(search.created) ? search.created : "";

  return (
    <div className="grid gap-6">
      <ListPageHeader
        title="Landlord leads"
        summary="Appraisal progress and the next action needed."
        action={
          canCreate &&
          settings && (
            <NewLandlordLeadDialog
              defaultOpen={search.new === "1"}
              action={createLandlordLeadAction.bind(null, workspaceSlug)}
              branches={toActiveBranchOptions(branches)}
              leadSources={settings.leadSources.filter(
                ({ status }) => status === "active",
              )}
              assignees={assignees}
              currentMembershipId={context.membership.id}
            />
          )
        }
      />
      {created && (
        <div
          className="rounded-lg bg-success-soft p-4 text-sm text-success"
          role="status"
        >
          Landlord lead saved. It is ready for the next action.
        </div>
      )}
      <EnquiriesWorklist
        key={`${view ?? ""}:${stage}:${branchId}:${assignedId}:${page}`}
        assignedId={assignedId}
        assignees={assignees ?? []}
        branchId={branchId}
        branches={branches.map(({ id, name }) => ({ id, name }))}
        canCreate={canCreate}
        canWork={context.permissions.has("enquiry.update")}
        counts={counts}
        currentMembershipId={context.membership.id}
        initialState={{ status: "ready", message: "", query: "", result }}
        path={path}
        stage={stage}
        view={view}
        workspaceSlug={workspaceSlug}
      />
    </div>
  );
}
