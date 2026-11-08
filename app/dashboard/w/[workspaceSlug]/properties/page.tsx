import Link from "next/link";
import { redirect } from "next/navigation";
import { toActiveBranchOptions } from "@/core/workspace/domain/branch-option";
import {
  createPropertyAction,
  findDuplicatePropertiesAction,
  quickAddOwnerAction,
  searchOwnerContactsAction,
} from "./actions";
import { NewPropertyDialog } from "@/components/properties/new-property-dialog";
import { PropertiesWorklist } from "@/components/properties/properties-worklist";
import { ListPageHeader } from "@/components/records/list-page-header";
import { Button } from "@/components/ui/button";
import { OptionSelect } from "@/components/ui/option-select";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { requireMfaUserWith } from "@/core/auth/mfa";
import { listEnquiryAssignees } from "@/core/enquiries/application/enquiries";
import {
  listPropertyPage,
  type PropertyInstructionFilter,
  type PropertyListState,
} from "@/core/properties/application/property-list";
import { isUuid } from "@/core/properties/domain/ids";
import { getWorkspaceBranches } from "@/core/workspace/application/workspace-branches";

function pageNumber(value: string | string[] | undefined) {
  const number = typeof value === "string" ? Number(value) : 1;
  return Number.isSafeInteger(number) && number > 0 ? number : 1;
}

export default async function PropertiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{
    branch?: string | string[];
    assigned?: string | string[];
    instruction?: string | string[];
    state?: string | string[];
    page?: string | string[];
    new?: string | string[];
  }>;
}) {
  const { workspaceSlug } = await params;
  const path = `/dashboard/w/${workspaceSlug}/properties`;
  const search = await searchParams;
  const branchId = isUuid(search.branch) ? search.branch : "";
  const assignedId = isUuid(search.assigned) ? search.assigned : "";
  const instruction = ["any", "none", "onboarding", "ready_to_market"].find(
    (value): value is PropertyInstructionFilter => value === search.instruction,
  );
  const selectedInstruction = instruction ?? "any";
  const state = ["active", "archived", "all"].find(
    (value): value is PropertyListState => value === search.state,
  );
  const selectedState = state ?? "active";
  const page = pageNumber(search.page);
  const {
    data: [result, context, branches, assignees],
  } = await requireMfaUserWith(path, { workspaceSlug }, (user) =>
    Promise.all([
      listPropertyPage({
        authSubject: user.id,
        workspaceSlug,
        branchId: branchId || undefined,
        assignedMembershipId: assignedId || undefined,
        instruction: selectedInstruction,
        state: selectedState,
        page,
      }),
      getWorkspaceAccessContext(user.id, workspaceSlug),
      getWorkspaceBranches(user.id, workspaceSlug),
      listEnquiryAssignees({ authSubject: user.id, workspaceSlug }),
    ]),
  );
  if (
    !result ||
    !context ||
    !branches ||
    !context.permissions.has("property.read")
  ) {
    redirect("/access-denied");
  }
  const canCreate = context.permissions.has("property.create");
  const canSeeInstructions = context.permissions.has("instruction.read");

  const safeParameters = new URLSearchParams();
  if (branchId) safeParameters.set("branch", branchId);
  if (assignedId) safeParameters.set("assigned", assignedId);
  if (selectedInstruction !== "any") {
    safeParameters.set("instruction", selectedInstruction);
  }
  if (selectedState !== "active") safeParameters.set("state", selectedState);
  const safeFilters = safeParameters.toString();
  const isFiltering = Boolean(
    branchId ||
    assignedId ||
    selectedInstruction !== "any" ||
    selectedState !== "active",
  );

  return (
    <div className="grid gap-6">
      <ListPageHeader
        title="Properties"
        summary="Every property the agency manages or is working with."
        action={
          canCreate && (
            <NewPropertyDialog
              defaultOpen={Boolean(search.new)}
              action={createPropertyAction.bind(null, workspaceSlug)}
              basePath={path}
              branches={toActiveBranchOptions(branches)}
              checkDuplicates={findDuplicatePropertiesAction.bind(
                null,
                workspaceSlug,
              )}
              quickAdd={quickAddOwnerAction.bind(null, workspaceSlug)}
              searchOwners={searchOwnerContactsAction.bind(null, workspaceSlug)}
            />
          )
        }
      />

      <form className="flex flex-wrap items-center gap-2">
        <div>
          <label className="sr-only" htmlFor="property-state">
            Status
          </label>
          <OptionSelect
            className="w-48"
            id="property-state"
            name="state"
            defaultValue={selectedState}
            options={[
              { value: "active", label: "Active" },
              { value: "archived", label: "Archived" },
              { value: "all", label: "Active and archived" },
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
            placeholder="All branches"
            defaultValue={branchId}
            options={[
              { value: "", label: "All branches" },
              ...branches.map(({ id, name }) => ({ value: id, label: name })),
            ]}
          />
        </div>
        {canSeeInstructions && (
          <>
            <div>
              <label className="sr-only" htmlFor="property-instruction">
                Instruction
              </label>
              <OptionSelect
                className="w-48"
                id="property-instruction"
                name="instruction"
                defaultValue={selectedInstruction}
                options={[
                  { value: "any", label: "Any" },
                  { value: "onboarding", label: "Onboarding" },
                  { value: "ready_to_market", label: "Ready to market" },
                  { value: "none", label: "No current instruction" },
                ]}
              />
            </div>
            <div>
              <label className="sr-only" htmlFor="property-assigned">
                Lead staff
              </label>
              <OptionSelect
                className="w-48"
                id="property-assigned"
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
          </>
        )}
        <div className="flex gap-2">
          <Button type="submit" variant="outline">
            Apply
          </Button>
          {isFiltering && (
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

      <PropertiesWorklist
        key={`${safeFilters}:${page}`}
        canSeeInstructions={canSeeInstructions}
        initialState={{ status: "ready", message: "", query: "", result }}
        isFiltering={isFiltering}
        path={path}
        safeFilters={safeFilters}
        workspaceSlug={workspaceSlug}
      />
    </div>
  );
}
