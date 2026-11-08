import Link from "next/link";
import { redirect } from "next/navigation";
import { NewApplicantDialog } from "@/components/applicants/new-applicant-dialog";
import { ApplicantsWorklist } from "@/components/applicants/applicants-worklist";
import { ListPageHeader } from "@/components/records/list-page-header";
import { Button } from "@/components/ui/button";
import { OptionSelect } from "@/components/ui/option-select";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { loadApplicantPage } from "@/core/applicants/application/applicant-page";
import {
  APPLICANT_STATUSES,
  APPLICANT_STATUS_LABELS,
  isApplicantStatus,
} from "@/core/applicants/domain/applicant";
import { requireMfaUserWith } from "@/core/auth/mfa";
import { listEnquirySettings } from "@/core/enquiries/application/enquiry-lists";
import { toActiveBranchOptions } from "@/core/workspace/domain/branch-option";
import { createApplicantAction } from "./actions";
import { listEnquiryAssignees } from "@/core/enquiries/application/enquiries";
import { isUuid } from "@/core/properties/domain/ids";
import { getWorkspaceBranches } from "@/core/workspace/application/workspace-branches";

function pageNumber(value: string | string[] | undefined) {
  const number = typeof value === "string" ? Number(value) : 1;
  return Number.isSafeInteger(number) && number > 0 ? number : 1;
}

export default async function ApplicantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{
    status?: string | string[];
    branch?: string | string[];
    owner?: string | string[];
    noAction?: string | string[];
    page?: string | string[];
    new?: string | string[];
  }>;
}) {
  const { workspaceSlug } = await params;
  const path = `/dashboard/w/${workspaceSlug}/applicants`;
  const search = await searchParams;
  const status =
    search.status === "all"
      ? "all"
      : isApplicantStatus(search.status)
        ? search.status
        : "";
  const branchId = isUuid(search.branch) ? search.branch : "";
  const ownerId = isUuid(search.owner) ? search.owner : "";
  const noAction = search.noAction === "yes";
  const page = pageNumber(search.page);
  const {
    data: [result, context, branches, owners, settings],
  } = await requireMfaUserWith(path, { workspaceSlug }, (user) =>
    Promise.all([
      loadApplicantPage({
        authSubject: user.id,
        workspaceSlug,
        status,
        branchId,
        ownerMembershipId: ownerId,
        noNextAction: noAction,
        page,
      }),
      getWorkspaceAccessContext(user.id, workspaceSlug),
      getWorkspaceBranches(user.id, workspaceSlug),
      listEnquiryAssignees({ authSubject: user.id, workspaceSlug }),
      listEnquirySettings({ authSubject: user.id, workspaceSlug }),
    ]),
  );
  if (
    !result ||
    !context ||
    !branches ||
    !context.permissions.has("applicant.read")
  ) {
    redirect("/access-denied");
  }
  const safeParameters = new URLSearchParams();
  if (status) safeParameters.set("status", status);
  if (branchId) safeParameters.set("branch", branchId);
  if (ownerId) safeParameters.set("owner", ownerId);
  if (noAction) safeParameters.set("noAction", "yes");
  const safeFilters = safeParameters.toString();
  const filtering = safeFilters.length > 0;

  return (
    <div className="grid gap-6">
      <ListPageHeader
        title="Applicants"
        summary="People and households looking for a home to rent."
        action={
          context.permissions.has("applicant.manage") && settings ? (
            <NewApplicantDialog
              defaultOpen={search.new === "1"}
              action={createApplicantAction.bind(null, workspaceSlug)}
              branches={toActiveBranchOptions(branches)}
              leadSources={settings.leadSources.filter(
                ({ status }) => status === "active",
              )}
              assignees={owners}
              currentMembershipId={context.membership.id}
            />
          ) : null
        }
      />
      <form className="flex flex-wrap items-center gap-2">
        <div>
          <label className="sr-only" htmlFor="status">
            Status
          </label>
          <OptionSelect
            className="w-48"
            id="status"
            name="status"
            defaultValue={status}
            placeholder="Active and on hold"
            options={[
              { value: "", label: "Active and on hold" },
              ...APPLICANT_STATUSES.map((value) => ({
                value,
                label: APPLICANT_STATUS_LABELS[value],
              })),
              { value: "all", label: "All, including closed" },
            ]}
          />
        </div>
        <div>
          <label className="sr-only" htmlFor="branch">
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
        <div>
          <label className="sr-only" htmlFor="owner">
            Owner
          </label>
          <OptionSelect
            className="w-48"
            id="owner"
            name="owner"
            defaultValue={ownerId}
            placeholder="Anyone"
            options={[
              { value: "", label: "Anyone" },
              ...(owners ?? []).map(({ membershipId, name }) => ({
                value: membershipId,
                label: name,
              })),
            ]}
          />
        </div>
        <label className="flex items-center gap-2 text-sm xl:h-9">
          <input
            type="checkbox"
            name="noAction"
            value="yes"
            defaultChecked={noAction}
          />
          No next action
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
      <ApplicantsWorklist
        key={`${safeFilters}:${page}`}
        initialState={{ status: "ready", message: "", query: "", result }}
        isFiltering={filtering}
        path={path}
        safeFilters={safeFilters}
        workspaceSlug={workspaceSlug}
      />
    </div>
  );
}
