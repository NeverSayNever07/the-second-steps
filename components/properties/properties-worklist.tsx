"use client";

import { Building2, Search } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import {
  searchPropertiesAction,
  type PropertySearchState,
} from "@/app/dashboard/w/[workspaceSlug]/properties/search-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LETTING_SERVICE_LABELS } from "@/core/enquiries/domain/enquiry-labels";
import {
  formatRent,
  JOURNEY_STAGE_LABELS,
} from "@/core/instructions/domain/instruction-labels";
import { PROPERTY_TYPE_LABELS } from "@/core/properties/domain/property-labels";

type PropertyRow = PropertySearchState["result"]["items"][number];

function pageHref(path: string, filters: string, page: number) {
  const parameters = new URLSearchParams(filters);
  if (page === 1) {
    parameters.delete("page");
  } else {
    parameters.set("page", String(page));
  }
  const query = parameters.toString();
  return query ? `${path}?${query}` : path;
}

function InstructionSummary({ property }: { property: PropertyRow }) {
  const { instruction } = property;
  if (!instruction) {
    return (
      <span className="text-muted-foreground">No current instruction</span>
    );
  }
  return (
    <div className="grid gap-1">
      <Badge variant="secondary" className="w-fit group-hover:bg-card">
        {JOURNEY_STAGE_LABELS[instruction.journeyStage]}
      </Badge>
      <span className="text-sm">
        {instruction.service
          ? LETTING_SERVICE_LABELS[instruction.service]
          : "Service not set"}
        {" · "}
        {formatRent({
          askingRentPence: instruction.askingRentPence,
          rentPeriod: instruction.rentPeriod,
        })}
      </span>
    </div>
  );
}

export function PropertiesWorklist({
  canSeeInstructions,
  initialState,
  isFiltering,
  path,
  safeFilters,
  workspaceSlug,
}: {
  canSeeInstructions: boolean;
  initialState: PropertySearchState;
  isFiltering: boolean;
  path: string;
  safeFilters: string;
  workspaceSlug: string;
}) {
  const search = searchPropertiesAction.bind(null, workspaceSlug);
  const [state, formAction, isPending] = useActionState(search, initialState);
  const { result } = state;
  const isSearchActive = Boolean(state.query);
  const hasCriteria = isFiltering || isSearchActive;
  const previousPage = Math.max(result.page - 1, 1);
  const nextPage = result.page + 1;
  const filters = new URLSearchParams(safeFilters);
  const branch = filters.get("branch") ?? "";
  const assigned = filters.get("assigned") ?? "";
  const instruction = filters.get("instruction") ?? "any";
  const propertyState = filters.get("state") ?? "active";

  return (
    <div className="grid gap-6">
      <form
        action={formAction}
        className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
        id="property-search"
      >
        {branch && <input type="hidden" name="branch" value={branch} />}
        {assigned && <input type="hidden" name="assigned" value={assigned} />}
        <input type="hidden" name="instruction" value={instruction} />
        <input type="hidden" name="state" value={propertyState} />
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="property-query">
            Search properties
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="pl-9"
              defaultValue={state.query}
              id="property-query"
              name="query"
              placeholder="Address, postcode, reference or owner"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Search words stay on this page and are not added to the web address.
          </p>
        </div>
        <Button
          type="submit"
          name="page"
          value="1"
          variant="outline"
          disabled={isPending}
        >
          {isPending ? "Searching…" : "Search"}
        </Button>
      </form>

      {state.status === "error" && (
        <div
          className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          {state.message}
        </div>
      )}

      {result.items.length === 0 ? (
        <Card>
          <CardContent className="grid justify-items-center gap-3 py-12 text-center">
            <Building2
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <p className="font-medium">
                {hasCriteria ? "No properties found" : "No properties yet"}
              </p>
              <p className="text-sm text-muted-foreground">
                {hasCriteria
                  ? "Try changing the search or filters."
                  : "Properties in your branches will appear here."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid divide-y overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 md:hidden">
            {result.items.map((property) => (
              <Link
                key={property.id}
                href={`${path}/${property.id}`}
                className="grid gap-3 p-4 transition-colors hover:bg-muted/50"
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
                {canSeeInstructions && (
                  <InstructionSummary property={property} />
                )}
                <p className="text-xs text-muted-foreground">
                  {property.branchName}
                  {property.instruction?.leadStaff
                    ? ` · ${property.instruction.leadStaff}`
                    : ""}
                  {" · "}
                  {property.reference}
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
                    {canSeeInstructions && (
                      <>
                        <TableHead>Current instruction</TableHead>
                        <TableHead>Lead staff</TableHead>
                      </>
                    )}
                    <TableHead>Branch</TableHead>
                    <TableHead>Last updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.items.map((property) => (
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
                      {canSeeInstructions && (
                        <>
                          <TableCell>
                            <InstructionSummary property={property} />
                          </TableCell>
                          <TableCell>
                            {property.instruction?.leadStaff ?? "–"}
                          </TableCell>
                        </>
                      )}
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

      {(result.hasPrevious || result.hasNext) && (
        <nav
          aria-label="Property pages"
          className="flex items-center justify-between gap-4"
        >
          <p className="text-sm text-muted-foreground">Page {result.page}</p>
          <div className="flex gap-2">
            {isSearchActive ? (
              <>
                <Button
                  type="submit"
                  form="property-search"
                  name="page"
                  value={previousPage}
                  variant="outline"
                  disabled={!result.hasPrevious || isPending}
                >
                  Previous
                </Button>
                <Button
                  type="submit"
                  form="property-search"
                  name="page"
                  value={nextPage}
                  variant="outline"
                  disabled={!result.hasNext || isPending}
                >
                  Next
                </Button>
              </>
            ) : (
              <>
                {result.hasPrevious ? (
                  <Button
                    variant="outline"
                    render={
                      <Link href={pageHref(path, safeFilters, previousPage)} />
                    }
                    nativeButton={false}
                  >
                    Previous
                  </Button>
                ) : (
                  <Button variant="outline" disabled>
                    Previous
                  </Button>
                )}
                {result.hasNext ? (
                  <Button
                    variant="outline"
                    render={
                      <Link href={pageHref(path, safeFilters, nextPage)} />
                    }
                    nativeButton={false}
                  >
                    Next
                  </Button>
                ) : (
                  <Button variant="outline" disabled>
                    Next
                  </Button>
                )}
              </>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
