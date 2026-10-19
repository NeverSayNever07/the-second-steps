import { Plus, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LandlordsWorklist } from "@/components/contacts/landlords-worklist";
import { Button } from "@/components/ui/button";
import { OptionSelect } from "@/components/ui/option-select";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { requireMfaUserWith } from "@/core/auth/mfa";
import {
  listLandlords,
  type LandlordContactState,
  type LandlordRelationshipState,
} from "@/core/contacts/application/landlords";
import { isUuid } from "@/core/properties/domain/ids";
import { getWorkspaceBranches } from "@/core/workspace/application/workspace-branches";

function pageNumber(value: string | string[] | undefined) {
  const number = typeof value === "string" ? Number(value) : 1;
  return Number.isSafeInteger(number) && number > 0 ? number : 1;
}

export default async function LandlordsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{
    kind?: string | string[];
    branch?: string | string[];
    relationship?: string | string[];
    contactState?: string | string[];
    page?: string | string[];
  }>;
}) {
  const { workspaceSlug } = await params;
  const path = `/dashboard/w/${workspaceSlug}/landlords`;
  const contactsPath = `/dashboard/w/${workspaceSlug}/contacts`;
  const search = await searchParams;
  const kind = ["person", "organisation"].find(
    (value): value is "person" | "organisation" => value === search.kind,
  );
  const branchId = isUuid(search.branch) ? search.branch : "";
  const relationship = ["current", "former", "all"].find(
    (value): value is LandlordRelationshipState =>
      value === search.relationship,
  );
  const selectedRelationship = relationship ?? "current";
  const contactState = ["active", "archived", "all"].find(
    (value): value is LandlordContactState => value === search.contactState,
  );
  const selectedContactState = contactState ?? "active";
  const page = pageNumber(search.page);
  const {
    data: [result, context, branches],
  } = await requireMfaUserWith(path, { workspaceSlug }, (user) =>
    Promise.all([
      listLandlords({
        authSubject: user.id,
        workspaceSlug,
        kind,
        branchId: branchId || undefined,
        relationship: selectedRelationship,
        contactState: selectedContactState,
        page,
      }),
      getWorkspaceAccessContext(user.id, workspaceSlug),
      getWorkspaceBranches(user.id, workspaceSlug),
    ]),
  );
  const canReadLandlords =
    context?.permissions.has("contact.read") &&
    context.permissions.has("property.read") &&
    context.permissions.has("enquiry.read") &&
    context.permissions.has("instruction.read");
  if (!context || !branches || !canReadLandlords) {
    redirect("/access-denied");
  }

  const safeParameters = new URLSearchParams();
  if (kind) {
    safeParameters.set("kind", kind);
  }
  if (branchId) {
    safeParameters.set("branch", branchId);
  }
  if (selectedRelationship !== "current") {
    safeParameters.set("relationship", selectedRelationship);
  }
  if (selectedContactState !== "active") {
    safeParameters.set("contactState", selectedContactState);
  }
  const safeFilters = safeParameters.toString();
  const isFiltering = Boolean(
    kind ||
    branchId ||
    selectedRelationship !== "current" ||
    selectedContactState !== "active",
  );
  const canCreateLead = context.permissions.has("enquiry.create");

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Users
              aria-hidden="true"
              className="size-6 text-muted-foreground"
            />
            <h1 className="text-2xl font-semibold tracking-tight">Landlords</h1>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Current and former landlords, with their visible leads, instructions
            and managed properties.
          </p>
        </div>
        {canCreateLead && (
          <Button
            render={
              <Link href={`/dashboard/w/${workspaceSlug}/enquiries/new`} />
            }
            nativeButton={false}
          >
            <Plus aria-hidden="true" />
            New landlord lead
          </Button>
        )}
      </div>

      <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-[auto_auto_auto_auto_auto] xl:items-end">
        <div className="grid gap-2">
          <label
            className="text-sm font-medium"
            htmlFor="landlord-relationship"
          >
            Relationship
          </label>
          <OptionSelect
            className="w-48"
            id="landlord-relationship"
            name="relationship"
            defaultValue={selectedRelationship}
            options={[
              { value: "current", label: "Current" },
              { value: "former", label: "Former" },
              { value: "all", label: "Current and former" },
            ]}
          />
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="landlord-kind">
            Type
          </label>
          <OptionSelect
            className="w-48"
            id="landlord-kind"
            name="kind"
            defaultValue={kind ?? ""}
            placeholder="People and organisations"
            options={[
              { value: "", label: "People and organisations" },
              { value: "person", label: "People" },
              { value: "organisation", label: "Organisations" },
            ]}
          />
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="landlord-branch">
            Authorised branch
          </label>
          <OptionSelect
            className="w-48"
            id="landlord-branch"
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
          <label className="text-sm font-medium" htmlFor="landlord-status">
            Contact status
          </label>
          <OptionSelect
            className="w-48"
            id="landlord-status"
            name="contactState"
            defaultValue={selectedContactState}
            options={[
              { value: "active", label: "Active" },
              { value: "archived", label: "Archived" },
              { value: "all", label: "Active and archived" },
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

      <LandlordsWorklist
        key={`${safeFilters}:${page}`}
        contactsPath={contactsPath}
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
