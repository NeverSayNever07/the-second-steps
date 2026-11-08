"use client";

import { Search, Users } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import {
  searchApplicantsAction,
  type ApplicantSearchState,
} from "@/app/dashboard/w/[workspaceSlug]/applicants/search-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  APPLICANT_STATUS_LABELS,
  type ApplicantStatusCode,
} from "@/core/applicants/domain/applicant";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
});

function statusVariant(status: ApplicantStatusCode) {
  if (status === "active") return "success" as const;
  if (status === "on_hold") return "warning" as const;
  return "secondary" as const;
}

function pageHref(path: string, filters: string, page: number) {
  const parameters = new URLSearchParams(filters);
  if (page === 1) parameters.delete("page");
  else parameters.set("page", String(page));
  const query = parameters.toString();
  return query ? `${path}?${query}` : path;
}

export function ApplicantsWorklist({
  initialState,
  isFiltering,
  path,
  safeFilters,
  workspaceSlug,
}: {
  initialState: ApplicantSearchState;
  isFiltering: boolean;
  path: string;
  safeFilters: string;
  workspaceSlug: string;
}) {
  const search = searchApplicantsAction.bind(null, workspaceSlug);
  const [state, formAction, isPending] = useActionState(search, initialState);
  const { result } = state;
  const applicants = result.items;
  const isSearchActive = Boolean(state.query);
  const hasCriteria = isFiltering || isSearchActive;
  const previousPage = Math.max(result.page - 1, 1);
  const nextPage = result.page + 1;
  const filters = new URLSearchParams(safeFilters);

  return (
    <div className="grid gap-6">
      <form
        action={formAction}
        className="flex items-center gap-2"
        id="applicant-search"
      >
        {(["status", "branch", "owner", "noAction"] as const).map((name) => {
          const value = filters.get(name);
          return value ? (
            <input key={name} type="hidden" name={name} value={value} />
          ) : null;
        })}
        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor="applicant-query">
            Search applicants
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="pl-9"
              defaultValue={state.query}
              id="applicant-query"
              aria-describedby="applicant-query-hint"
              name="query"
              placeholder="Name or reference"
            />
          </div>
          <p className="sr-only" id="applicant-query-hint">
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

      {applicants.length === 0 ? (
        <Card>
          <CardContent className="grid justify-items-center gap-3 py-12 text-center">
            <Users
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <p className="font-medium">
                {hasCriteria ? "No applicants found" : "No applicants yet"}
              </p>
              <p className="text-sm text-muted-foreground">
                {hasCriteria
                  ? "Try changing the search or filters."
                  : "Applicants in your branches will appear here."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid divide-y overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 md:hidden">
            {applicants.map((applicant) => (
              <Link
                key={applicant.id}
                href={`${path}/${applicant.id}`}
                className="grid gap-3 p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium [overflow-wrap:anywhere]">
                      {applicant.name}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {applicant.openEnquiries === 1
                        ? "1 open property enquiry"
                        : `${applicant.openEnquiries} open property enquiries`}
                    </p>
                  </div>
                  <Badge variant={statusVariant(applicant.status)}>
                    {APPLICANT_STATUS_LABELS[applicant.status]}
                  </Badge>
                </div>
                <p
                  className={`text-xs ${applicant.nextAction ? "text-muted-foreground" : "font-medium text-warning"}`}
                >
                  {applicant.nextAction
                    ? `${applicant.nextAction.title} · ${dateFormat.format(applicant.nextAction.dueOn)}`
                    : "No next action"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {applicant.branch.name} · {applicant.reference}
                </p>
              </Link>
            ))}
          </div>
          <Card className="hidden py-0 md:block">
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Applicant</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Property enquiries</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Next action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {applicants.map((applicant) => (
                    <TableRow
                      key={applicant.id}
                      className="group relative cursor-pointer hover:bg-muted"
                    >
                      <TableCell className="font-medium">
                        <Link
                          className="text-primary group-hover:underline after:absolute after:inset-0"
                          href={`${path}/${applicant.id}`}
                        >
                          {applicant.name}
                        </Link>
                        <p className="text-xs font-normal text-muted-foreground">
                          {applicant.reference}
                          {applicant.hasRequirements
                            ? ""
                            : " · No requirements yet"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={statusVariant(applicant.status)}
                          className="group-hover:bg-card"
                        >
                          {APPLICANT_STATUS_LABELS[applicant.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>{applicant.openEnquiries} open</TableCell>
                      <TableCell>{applicant.branch.name}</TableCell>
                      <TableCell>
                        {applicant.owner?.name ?? "Not assigned"}
                      </TableCell>
                      <TableCell>
                        {applicant.nextAction ? (
                          <span>
                            {applicant.nextAction.title}
                            <span className="block text-xs text-muted-foreground">
                              {dateFormat.format(applicant.nextAction.dueOn)}
                            </span>
                          </span>
                        ) : (
                          <span className="font-medium text-warning">
                            No next action
                          </span>
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
          aria-label="Applicant pages"
          className="flex items-center justify-between gap-4"
        >
          <p className="text-sm text-muted-foreground">Page {result.page}</p>
          <div className="flex gap-2">
            {isSearchActive ? (
              <>
                <Button
                  type="submit"
                  form="applicant-search"
                  name="page"
                  value={previousPage}
                  variant="outline"
                  disabled={!result.hasPrevious || isPending}
                >
                  Previous
                </Button>
                <Button
                  type="submit"
                  form="applicant-search"
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
