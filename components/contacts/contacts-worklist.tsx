"use client";

import { ContactRound, Search } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import {
  searchContactsAction,
  type ContactSearchState,
} from "@/app/dashboard/w/[workspaceSlug]/contacts/search-actions";
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

type ContactRow = ContactSearchState["result"]["items"][number];

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

function StatusOrKind({ contact }: { contact: ContactRow }) {
  if (contact.status === "archived") {
    return <StatusBadge label="Archived" tone="inactive" />;
  }
  if (contact.status === "merged") {
    return <StatusBadge label="Merged" tone="inactive" />;
  }
  return (
    <Badge variant="secondary" className="group-hover:bg-card">
      {contact.kind === "person" ? "Person" : "Organisation"}
    </Badge>
  );
}

export function ContactsWorklist({
  initialState,
  isFiltering,
  path,
  safeFilters,
  workspaceSlug,
}: {
  initialState: ContactSearchState;
  isFiltering: boolean;
  path: string;
  safeFilters: string;
  workspaceSlug: string;
}) {
  const search = searchContactsAction.bind(null, workspaceSlug);
  const [state, formAction, isPending] = useActionState(search, initialState);
  const { result } = state;
  const isSearchActive = Boolean(state.query);
  const hasCriteria = isFiltering || isSearchActive;
  const previousPage = Math.max(result.page - 1, 1);
  const nextPage = result.page + 1;
  const filters = new URLSearchParams(safeFilters);
  const kind = filters.get("kind") ?? "";
  const branch = filters.get("branch") ?? "";
  const contactState = filters.get("state") ?? "active";

  return (
    <div className="grid gap-6">
      <form
        action={formAction}
        className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
        id="contact-search"
      >
        {kind && <input type="hidden" name="kind" value={kind} />}
        {branch && <input type="hidden" name="branch" value={branch} />}
        <input type="hidden" name="state" value={contactState} />
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="contact-query">
            Search contacts
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="pl-9"
              defaultValue={state.query}
              id="contact-query"
              name="query"
              placeholder="Name, reference, email or telephone"
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
            <ContactRound
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <p className="font-medium">No contacts found</p>
              <p className="text-sm text-muted-foreground">
                {hasCriteria
                  ? "Try changing the search or filters."
                  : "Add the first contact."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid divide-y overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 md:hidden">
            {result.items.map((contact) => (
              <Link
                key={contact.id}
                href={`${path}/${contact.id}`}
                className="p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium [overflow-wrap:anywhere]">
                      {contact.name}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                      {contact.preferredContact ?? "Not recorded"}
                    </p>
                  </div>
                  <StatusOrKind contact={contact} />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {contact.primaryBranch ?? "No branch"} · {contact.reference}
                </p>
              </Link>
            ))}
          </div>
          <Card className="hidden py-0 md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Preferred contact</TableHead>
                    <TableHead>Primary branch</TableHead>
                    <TableHead>Last updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.items.map((contact) => (
                    <TableRow
                      key={contact.id}
                      className="group relative cursor-pointer hover:bg-muted"
                    >
                      <TableCell className="font-medium">
                        <Link
                          className="text-primary group-hover:underline after:absolute after:inset-0"
                          href={`${path}/${contact.id}`}
                        >
                          {contact.name}
                        </Link>
                        <p className="text-xs font-normal text-muted-foreground">
                          {contact.reference}
                        </p>
                      </TableCell>
                      <TableCell>
                        <StatusOrKind contact={contact} />
                      </TableCell>
                      <TableCell>
                        {contact.preferredContact ?? "Not recorded"}
                      </TableCell>
                      <TableCell>
                        {contact.primaryBranch ?? "Not recorded"}
                      </TableCell>
                      <TableCell>
                        {new Intl.DateTimeFormat("en-GB").format(
                          contact.updatedAt,
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
          aria-label="Contact pages"
          className="flex items-center justify-between gap-4"
        >
          <p className="text-sm text-muted-foreground">Page {result.page}</p>
          <div className="flex gap-2">
            {isSearchActive ? (
              <>
                <Button
                  type="submit"
                  form="contact-search"
                  name="page"
                  value={previousPage}
                  variant="outline"
                  disabled={!result.hasPrevious || isPending}
                >
                  Previous
                </Button>
                <Button
                  type="submit"
                  form="contact-search"
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
