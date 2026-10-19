"use client";

import { Search, Users } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import {
  searchLandlordsAction,
  type LandlordSearchState,
} from "@/app/dashboard/w/[workspaceSlug]/landlords/actions";
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

function branchesLabel(branches: { name: string }[]) {
  return branches.length
    ? branches.map(({ name }) => name).join(", ")
    : "No authorised branch";
}

function relationshipLabel(current: boolean) {
  return current ? "Current landlord" : "Former landlord";
}

export function LandlordsWorklist({
  contactsPath,
  initialState,
  isFiltering,
  path,
  safeFilters,
  workspaceSlug,
}: {
  contactsPath: string;
  initialState: LandlordSearchState;
  isFiltering: boolean;
  path: string;
  safeFilters: string;
  workspaceSlug: string;
}) {
  const search = searchLandlordsAction.bind(null, workspaceSlug);
  const [state, formAction, isPending] = useActionState(search, initialState);
  const { result } = state;
  const isSearchActive = Boolean(state.query);
  const hasCriteria = isFiltering || isSearchActive;
  const previousPage = Math.max(result.page - 1, 1);
  const nextPage = result.page + 1;
  const filters = new URLSearchParams(safeFilters);
  const kind = filters.get("kind") ?? "";
  const branch = filters.get("branch") ?? "";
  const relationship = filters.get("relationship") ?? "current";
  const contactState = filters.get("contactState") ?? "active";

  return (
    <div className="grid gap-6">
      <form
        action={formAction}
        className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
        id="landlord-search"
      >
        {kind && <input type="hidden" name="kind" value={kind} />}
        {branch && <input type="hidden" name="branch" value={branch} />}
        <input type="hidden" name="relationship" value={relationship} />
        <input type="hidden" name="contactState" value={contactState} />
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="landlord-query">
            Search landlords
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="pl-9"
              defaultValue={state.query}
              id="landlord-query"
              name="query"
              placeholder="Name, contact detail or reference"
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
            <Users
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <p className="font-medium">
                {hasCriteria ? "No landlords found" : "No current landlords"}
              </p>
              <p className="text-sm text-muted-foreground">
                {hasCriteria
                  ? "Try changing the search or filters."
                  : "Contacts linked to landlord work will appear here."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid divide-y overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 md:hidden">
            {result.items.map((landlord) => (
              <Link
                key={landlord.id}
                href={`${contactsPath}/${landlord.id}`}
                className="grid gap-3 p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium [overflow-wrap:anywhere]">
                      {landlord.name}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                      {landlord.preferredContact?.value ?? "No contact detail"}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Badge variant="secondary">
                      {landlord.kind === "person" ? "Person" : "Organisation"}
                    </Badge>
                    {landlord.archived && (
                      <StatusBadge label="Archived" tone="inactive" />
                    )}
                  </div>
                </div>
                <dl className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Properties with us
                    </dt>
                    <dd className="font-medium">{landlord.propertiesWithUs}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Open leads
                    </dt>
                    <dd className="font-medium">{landlord.openLeads}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Instructions
                    </dt>
                    <dd className="font-medium">
                      {landlord.currentInstructions}
                    </dd>
                  </div>
                </dl>
                <p className="text-xs text-muted-foreground">
                  {relationshipLabel(landlord.currentRelationship)} ·{" "}
                  {branchesLabel(landlord.branches)} · {landlord.reference}
                </p>
              </Link>
            ))}
          </div>

          <Card className="hidden py-0 md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 z-10 bg-muted">
                      Landlord
                    </TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Preferred contact</TableHead>
                    <TableHead className="text-center">
                      Properties with us
                    </TableHead>
                    <TableHead className="text-center">Open leads</TableHead>
                    <TableHead className="text-center">
                      Current instructions
                    </TableHead>
                    <TableHead>Authorised branches</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.items.map((landlord) => (
                    <TableRow
                      key={landlord.id}
                      className="group relative cursor-pointer hover:bg-muted"
                    >
                      <TableCell className="sticky left-0 z-10 bg-card font-medium group-hover:bg-muted">
                        <Link
                          className="text-primary group-hover:underline after:absolute after:inset-0"
                          href={`${contactsPath}/${landlord.id}`}
                        >
                          {landlord.name}
                        </Link>
                        <p className="text-xs font-normal text-muted-foreground">
                          {relationshipLabel(landlord.currentRelationship)} ·{" "}
                          {landlord.reference}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">
                            {landlord.kind === "person"
                              ? "Person"
                              : "Organisation"}
                          </Badge>
                          {landlord.archived && (
                            <StatusBadge label="Archived" tone="inactive" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {landlord.preferredContact?.value ?? "Not recorded"}
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {landlord.propertiesWithUs}
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {landlord.openLeads}
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {landlord.currentInstructions}
                      </TableCell>
                      <TableCell>{branchesLabel(landlord.branches)}</TableCell>
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
          aria-label="Landlord pages"
          className="flex items-center justify-between gap-4"
        >
          <p className="text-sm text-muted-foreground">Page {result.page}</p>
          <div className="flex gap-2">
            {isSearchActive ? (
              <>
                <Button
                  type="submit"
                  form="landlord-search"
                  name="page"
                  value={previousPage}
                  variant="outline"
                  disabled={!result.hasPrevious || isPending}
                >
                  Previous
                </Button>
                <Button
                  type="submit"
                  form="landlord-search"
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
