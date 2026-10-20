import { Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EnquiriesWorklist } from "@/components/enquiries/enquiries-worklist";
import { Button } from "@/components/ui/button";
import { OptionSelect } from "@/components/ui/option-select";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { requireMfaUserWith } from "@/core/auth/mfa";
import {
  listEnquiryAssignees,
  listEnquiryPage,
} from "@/core/enquiries/application/enquiries";
import {
  ENQUIRY_STAGES,
  type EnquiryStageCode,
} from "@/core/enquiries/domain/enquiry";
import { ENQUIRY_STAGE_LABELS } from "@/core/enquiries/domain/enquiry-labels";
import { isUuid } from "@/core/properties/domain/ids";
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
    stage?: string | string[];
    closed?: string | string[];
    created?: string | string[];
    page?: string | string[];
  }>;
}) {
  const { workspaceSlug } = await params;
  const path = `/dashboard/w/${workspaceSlug}/enquiries`;
  const search = await searchParams;
  const branchId = isUuid(search.branch) ? search.branch : "";
  const assignedId = isUuid(search.assigned) ? search.assigned : "";
  const stage =
    typeof search.stage === "string" &&
    ENQUIRY_STAGES.includes(search.stage as EnquiryStageCode)
      ? (search.stage as EnquiryStageCode)
      : "";
  const includeClosed = search.closed === "yes";
  const stages = stage
    ? [stage]
    : includeClosed
      ? [...ENQUIRY_STAGES]
      : undefined;
  const page = pageNumber(search.page);
  const {
    data: [result, context, branches, assignees],
  } = await requireMfaUserWith(path, { workspaceSlug }, (user) =>
    Promise.all([
      listEnquiryPage({
        authSubject: user.id,
        workspaceSlug,
        branchId: branchId || undefined,
        assignedMembershipId: assignedId || undefined,
        stages,
        page,
      }),
      getWorkspaceAccessContext(user.id, workspaceSlug),
      getWorkspaceBranches(user.id, workspaceSlug),
      listEnquiryAssignees({ authSubject: user.id, workspaceSlug }),
    ]),
  );
  if (!context || !branches || !context.permissions.has("enquiry.read")) {
    redirect("/access-denied");
  }
  const canCreate = context.permissions.has("enquiry.create");
  const safeParameters = new URLSearchParams();
  if (stage) safeParameters.set("stage", stage);
  if (branchId) safeParameters.set("branch", branchId);
  if (assignedId) safeParameters.set("assigned", assignedId);
  if (includeClosed) safeParameters.set("closed", "yes");
  const safeFilters = safeParameters.toString();
  const filtering = Boolean(branchId || assignedId || stage || includeClosed);
  const created = isUuid(search.created) ? search.created : "";

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Landlord leads
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Landlord leads, appraisal progress and the next action needed.
          </p>
        </div>
        {canCreate && (
          <Button render={<Link href={`${path}/new`} />} nativeButton={false}>
            <Plus aria-hidden="true" />
            New landlord lead
          </Button>
        )}
      </div>
      {created && (
        <div
          className="rounded-lg bg-success-soft p-4 text-sm text-success"
          role="status"
        >
          Landlord lead saved. It is ready for the next action.
        </div>
      )}
      <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-[auto_auto_auto_auto_auto] xl:items-end">
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="stage">
            Stage
          </label>
          <OptionSelect
            className="w-48"
            id="stage"
            name="stage"
            defaultValue={stage}
            placeholder="Open and won"
            options={[
              { value: "", label: "Open and won" },
              ...ENQUIRY_STAGES.map((value) => ({
                value,
                label: ENQUIRY_STAGE_LABELS[value],
              })),
            ]}
          />
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="branch">
            Branch
          </label>
          <OptionSelect
            className="w-48"
            id="branch"
            name="branch"
            defaultValue={branchId}
            placeholder="All branches"
            options={[
              { value: "", label: "All branches" },
              ...branches.map(({ id, name }) => ({ value: id, label: name })),
            ]}
          />
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="assigned">
            Assigned
          </label>
          <OptionSelect
            className="w-48"
            id="assigned"
            name="assigned"
            defaultValue={assignedId}
            placeholder="Anyone"
            options={[
              { value: "", label: "Anyone" },
              ...(assignees ?? []).map(({ membershipId, name }) => ({
                value: membershipId,
                label: name,
              })),
            ]}
          />
        </div>
        <label className="flex items-center gap-2 text-sm xl:h-9">
          <input
            type="checkbox"
            name="closed"
            value="yes"
            defaultChecked={includeClosed}
          />
          Include lost and postponed
        </label>
        <div className="flex gap-2">
          <Button type="submit" variant="outline">
            Apply
          </Button>
          {filtering && (
            <Button
              variant="ghost"
              render={<Link href={path} />}
              nativeButton={false}
            >
              Clear filters
            </Button>
          )}
        </div>
      </form>
      <EnquiriesWorklist
        key={`${safeFilters}:${page}`}
        canCreate={canCreate}
        initialState={{ status: "ready", message: "", query: "", result }}
        isFiltering={filtering}
        path={path}
        safeFilters={safeFilters}
        workspaceSlug={workspaceSlug}
      />
    </div>
  );
}
