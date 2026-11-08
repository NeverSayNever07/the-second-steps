import Link from "next/link";
import { redirect } from "next/navigation";
import { InstructionsWorklist } from "@/components/instructions/instructions-worklist";
import { ListPageHeader } from "@/components/records/list-page-header";
import { Button } from "@/components/ui/button";
import { OptionSelect } from "@/components/ui/option-select";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { requireMfaUserWith } from "@/core/auth/mfa";
import { listEnquiryAssignees } from "@/core/enquiries/application/enquiries";
import {
  listInstructions,
  type InstructionListState,
} from "@/core/instructions/application/instruction-records";
import { JOURNEY_STAGES } from "@/core/instructions/domain/instruction";
import { JOURNEY_STAGE_LABELS } from "@/core/instructions/domain/instruction-labels";
import { isUuid } from "@/core/properties/domain/ids";
import { getWorkspaceBranches } from "@/core/workspace/application/workspace-branches";

function pageNumber(value: string | string[] | undefined) {
  const number = typeof value === "string" ? Number(value) : 1;
  return Number.isSafeInteger(number) && number > 0 ? number : 1;
}

export default async function InstructionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{
    branch?: string | string[];
    assigned?: string | string[];
    stage?: string | string[];
    state?: string | string[];
    page?: string | string[];
  }>;
}) {
  const { workspaceSlug } = await params;
  const path = `/dashboard/w/${workspaceSlug}/instructions`;
  const search = await searchParams;
  const branchId = isUuid(search.branch) ? search.branch : "";
  const assignedId = isUuid(search.assigned) ? search.assigned : "";
  const journeyStage = JOURNEY_STAGES.find((stage) => stage === search.stage);
  const state = ["current", "ended", "all"].find(
    (value): value is InstructionListState => value === search.state,
  );
  const selectedState = state ?? "current";
  const page = pageNumber(search.page);
  const {
    data: [result, context, branches, assignees],
  } = await requireMfaUserWith(path, { workspaceSlug }, (user) =>
    Promise.all([
      listInstructions({
        authSubject: user.id,
        workspaceSlug,
        branchId: branchId || undefined,
        assignedMembershipId: assignedId || undefined,
        journeyStage,
        state: selectedState,
        page,
      }),
      getWorkspaceAccessContext(user.id, workspaceSlug),
      getWorkspaceBranches(user.id, workspaceSlug),
      listEnquiryAssignees({ authSubject: user.id, workspaceSlug }),
    ]),
  );
  if (!context || !branches || !context.permissions.has("instruction.read")) {
    redirect("/access-denied");
  }

  const safeParameters = new URLSearchParams();
  if (branchId) {
    safeParameters.set("branch", branchId);
  }
  if (assignedId) {
    safeParameters.set("assigned", assignedId);
  }
  if (journeyStage) {
    safeParameters.set("stage", journeyStage);
  }
  if (selectedState !== "current") {
    safeParameters.set("state", selectedState);
  }
  const safeFilters = safeParameters.toString();
  const isFiltering = Boolean(
    branchId || assignedId || journeyStage || selectedState !== "current",
  );

  return (
    <div className="grid gap-6">
      <ListPageHeader
        title="Instructions"
        summary="Current instruction work and onboarding in one place."
      />

      <form className="flex flex-wrap items-center gap-2">
        <div>
          <label className="sr-only" htmlFor="instruction-state">
            Status
          </label>
          <OptionSelect
            className="w-48"
            id="instruction-state"
            name="state"
            defaultValue={selectedState}
            options={[
              { value: "current", label: "Current" },
              { value: "ended", label: "Ended" },
              { value: "all", label: "Current and ended" },
            ]}
          />
        </div>
        <div>
          <label className="sr-only" htmlFor="instruction-stage">
            Stage
          </label>
          <OptionSelect
            className="w-48"
            id="instruction-stage"
            name="stage"
            defaultValue={journeyStage ?? ""}
            placeholder="All stages"
            options={[
              { value: "", label: "All stages" },
              ...JOURNEY_STAGES.map((value) => ({
                value,
                label: JOURNEY_STAGE_LABELS[value],
              })),
            ]}
          />
        </div>
        <div>
          <label className="sr-only" htmlFor="instruction-branch">
            Branch
          </label>
          <OptionSelect
            className="w-48"
            id="instruction-branch"
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
          <label className="sr-only" htmlFor="instruction-assigned">
            Lead staff
          </label>
          <OptionSelect
            className="w-48"
            id="instruction-assigned"
            name="assigned"
            defaultValue={assignedId}
            placeholder="Anyone"
            options={[
              { value: "", label: "Anyone" },
              ...assignees.map(({ membershipId, name }) => ({
                value: membershipId,
                label: name,
              })),
            ]}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="outline">
            Apply
          </Button>
          {isFiltering && (
            <Button
              render={<Link href={path} />}
              nativeButton={false}
              variant="ghost"
            >
              Clear filters
            </Button>
          )}
        </div>
      </form>

      <InstructionsWorklist
        key={`${safeFilters}:${page}`}
        initialState={{
          status: "ready",
          message: "",
          query: "",
          result,
        }}
        isFiltering={isFiltering}
        path={path}
        safeFilters={safeFilters}
        workspaceSlug={workspaceSlug}
      />
    </div>
  );
}
