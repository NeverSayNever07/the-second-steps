import Link from "next/link";
import { redirect } from "next/navigation";
import { toActiveBranchOptions } from "@/core/workspace/domain/branch-option";
import { createContactAction } from "./actions";
import { NewContactDialog } from "@/components/contacts/new-contact-dialog";
import { ContactsWorklist } from "@/components/contacts/contacts-worklist";
import { ListPageHeader } from "@/components/records/list-page-header";
import { Button } from "@/components/ui/button";
import { OptionSelect } from "@/components/ui/option-select";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { requireMfaUserWith } from "@/core/auth/mfa";
import {
  listContactPage,
  type ContactListState,
} from "@/core/contacts/application/contacts";
import { isUuid } from "@/core/properties/domain/ids";
import { getWorkspaceBranches } from "@/core/workspace/application/workspace-branches";

function pageNumber(value: string | string[] | undefined) {
  const number = typeof value === "string" ? Number(value) : 1;
  return Number.isSafeInteger(number) && number > 0 ? number : 1;
}

export default async function ContactsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{
    kind?: string | string[];
    branch?: string | string[];
    state?: string | string[];
    page?: string | string[];
    new?: string | string[];
  }>;
}) {
  const { workspaceSlug } = await params;
  const path = `/dashboard/w/${workspaceSlug}/contacts`;
  const search = await searchParams;
  const kind = ["person", "organisation"].find(
    (value): value is "person" | "organisation" => value === search.kind,
  );
  const branchId = isUuid(search.branch) ? search.branch : "";
  const state = ["active", "archived", "merged", "all"].find(
    (value): value is ContactListState => value === search.state,
  );
  const selectedState = state ?? "active";
  const page = pageNumber(search.page);
  const {
    data: [result, context, branches],
  } = await requireMfaUserWith(path, { workspaceSlug }, (user) =>
    Promise.all([
      listContactPage({
        authSubject: user.id,
        workspaceSlug,
        kind,
        branchId: branchId || undefined,
        state: selectedState,
        page,
      }),
      getWorkspaceAccessContext(user.id, workspaceSlug),
      getWorkspaceBranches(user.id, workspaceSlug),
    ]),
  );
  if (!result || !context || !branches) redirect("/access-denied");
  const canCreate = context.permissions.has("contact.create");

  const safeParameters = new URLSearchParams();
  if (kind) safeParameters.set("kind", kind);
  if (branchId) safeParameters.set("branch", branchId);
  if (selectedState !== "active") safeParameters.set("state", selectedState);
  const safeFilters = safeParameters.toString();
  const isFiltering = Boolean(kind || branchId || selectedState !== "active");

  return (
    <div className="grid gap-6">
      <ListPageHeader
        title="Contacts"
        summary="People and organisations shared across the agency."
        action={
          canCreate && (
            <NewContactDialog
              defaultOpen={Boolean(search.new)}
              defaultKind={
                search.new === "organisation" ? "organisation" : "person"
              }
              personAction={createContactAction.bind(
                null,
                workspaceSlug,
                "person",
              )}
              organisationAction={createContactAction.bind(
                null,
                workspaceSlug,
                "organisation",
              )}
              branches={toActiveBranchOptions(branches)}
            />
          )
        }
      />

      <form className="flex flex-wrap items-center gap-2">
        <div>
          <label className="sr-only" htmlFor="kind">
            Type
          </label>
          <OptionSelect
            className="w-48"
            id="kind"
            name="kind"
            placeholder="All contacts"
            defaultValue={kind ?? ""}
            options={[
              { value: "", label: "All contacts" },
              { value: "person", label: "People" },
              { value: "organisation", label: "Organisations" },
            ]}
          />
        </div>
        <div>
          <label className="sr-only" htmlFor="contact-branch">
            Authorised branch
          </label>
          <OptionSelect
            className="w-48"
            id="contact-branch"
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
          <label className="sr-only" htmlFor="contact-state">
            Status
          </label>
          <OptionSelect
            className="w-48"
            id="contact-state"
            name="state"
            defaultValue={selectedState}
            options={[
              { value: "active", label: "Active" },
              { value: "archived", label: "Archived" },
              { value: "merged", label: "Merged" },
              { value: "all", label: "All statuses" },
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

      <ContactsWorklist
        key={`${safeFilters}:${page}`}
        initialState={{ status: "ready", message: "", query: "", result }}
        isFiltering={isFiltering}
        path={path}
        safeFilters={safeFilters}
        workspaceSlug={workspaceSlug}
      />
    </div>
  );
}
