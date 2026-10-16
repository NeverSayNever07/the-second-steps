import { Building2, Plus, Search } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OptionSelect } from "@/components/ui/option-select";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { requireMfaUserWith } from "@/core/auth/mfa";
import { listProperties } from "@/core/properties/application/properties";
import { SEARCH_TEXT_MAX, isUuid } from "@/core/properties/domain/ids";
import { PROPERTY_TYPE_LABELS } from "@/core/properties/domain/property-labels";
import { getWorkspaceBranches } from "@/core/workspace/application/workspace-branches";

export default async function PropertiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{
    q?: string | string[];
    branch?: string | string[];
    archived?: string | string[];
  }>;
}) {
  const { workspaceSlug } = await params;
  const path = `/dashboard/w/${workspaceSlug}/properties`;
  const search = await searchParams;
  const query =
    typeof search.q === "string" ? search.q.slice(0, SEARCH_TEXT_MAX) : "";
  const branchId = isUuid(search.branch) ? search.branch : "";
  const includeArchived = search.archived === "yes";
  const {
    data: [properties, context, branches],
  } = await requireMfaUserWith(path, { workspaceSlug }, (user) =>
    Promise.all([
      listProperties({
        authSubject: user.id,
        workspaceSlug,
        query,
        branchId: branchId || undefined,
        includeArchived,
      }),
      getWorkspaceAccessContext(user.id, workspaceSlug),
      getWorkspaceBranches(user.id, workspaceSlug),
    ]),
  );
  if (!context || !branches || !context.permissions.has("property.read")) {
    redirect("/access-denied");
  }
  const canCreate = context.permissions.has("property.create");
  const filtering = Boolean(query || branchId || includeArchived);

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Properties</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Every property the agency manages or is working with, with its
            owners and responsible branch.
          </p>
        </div>
        {canCreate && (
          <Button render={<Link href={`${path}/new`} />} nativeButton={false}>
            <Plus aria-hidden="true" />
            New property
          </Button>
        )}
      </div>
      <form className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-end">
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="q">
            Search properties
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="pl-9"
              id="q"
              name="q"
              defaultValue={query}
              placeholder="Address, postcode, reference or owner"
            />
          </div>
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="branch">
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
        <label className="flex items-center gap-2 text-sm md:h-9">
          <input
            type="checkbox"
            name="archived"
            value="yes"
            defaultChecked={includeArchived}
          />
          Include archived
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
      {properties.length === 0 ? (
        <Card>
          <CardContent className="grid justify-items-center gap-3 py-12 text-center">
            <Building2
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <p className="font-medium">
                {filtering ? "No properties found" : "No properties yet"}
              </p>
              <p className="text-sm text-muted-foreground">
                {filtering
                  ? "Try changing the search or filters."
                  : canCreate
                    ? "Add the first property to get started."
                    : "Properties in your branches will appear here."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid divide-y overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 md:hidden">
            {properties.map((property) => (
              <Link
                key={property.id}
                href={`${path}/${property.id}`}
                className="p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium [overflow-wrap:anywhere]">
                      {property.addressLine}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {property.postcode} ·{" "}
                      {property.leadLandlord?.name ?? "No lead landlord"}
                    </p>
                  </div>
                  {property.archived ? (
                    <StatusBadge label="Archived" tone="inactive" />
                  ) : (
                    <Badge variant="secondary">
                      {PROPERTY_TYPE_LABELS[property.propertyType]}
                    </Badge>
                  )}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {property.branchName} · {property.reference}
                </p>
              </Link>
            ))}
          </div>
          <Card className="hidden py-0 md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Address</TableHead>
                    <TableHead>Lead landlord</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Beds</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Last updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {properties.map((property) => (
                    <TableRow
                      key={property.id}
                      className="group relative cursor-pointer hover:bg-muted"
                    >
                      <TableCell className="font-medium">
                        <Link
                          className="text-primary group-hover:underline after:absolute after:inset-0"
                          href={`${path}/${property.id}`}
                        >
                          {property.addressLine}
                        </Link>
                        <p className="text-xs font-normal text-muted-foreground">
                          {property.postcode} · {property.reference}
                        </p>
                      </TableCell>
                      <TableCell>
                        {property.leadLandlord?.name ?? "Not recorded"}
                      </TableCell>
                      <TableCell>
                        {property.archived ? (
                          <StatusBadge label="Archived" tone="inactive" />
                        ) : (
                          <Badge
                            variant="secondary"
                            className="group-hover:bg-card"
                          >
                            {PROPERTY_TYPE_LABELS[property.propertyType]}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{property.bedrooms ?? "–"}</TableCell>
                      <TableCell>{property.branchName}</TableCell>
                      <TableCell>
                        {new Intl.DateTimeFormat("en-GB").format(
                          property.updatedAt,
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
