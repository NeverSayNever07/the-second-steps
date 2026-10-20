"use client";

import { CalendarClock, Inbox, Search } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import {
  searchEnquiriesAction,
  type EnquirySearchState,
} from "@/app/dashboard/w/[workspaceSlug]/enquiries/search-actions";
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
  isOverdue,
  type EnquiryStageCode,
} from "@/core/enquiries/domain/enquiry";
import { ENQUIRY_STAGE_LABELS } from "@/core/enquiries/domain/enquiry-labels";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
});
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  dateStyle: "short",
  timeStyle: "short",
});

function stageVariant(stage: EnquiryStageCode) {
  if (stage === "won") return "success" as const;
  if (stage === "lost") return "destructive" as const;
  if (stage === "postponed") return "warning" as const;
  if (stage === "appraisal_booked") return "info" as const;
  return "secondary" as const;
}

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

export function EnquiriesWorklist({
  canCreate,
  initialState,
  isFiltering,
  path,
  safeFilters,
  workspaceSlug,
}: {
  canCreate: boolean;
  initialState: EnquirySearchState;
  isFiltering: boolean;
  path: string;
  safeFilters: string;
  workspaceSlug: string;
}) {
  const search = searchEnquiriesAction.bind(null, workspaceSlug);
  const [state, formAction, isPending] = useActionState(search, initialState);
  const { result } = state;
  const enquiries = result.items;
  const isSearchActive = Boolean(state.query);
  const hasCriteria = isFiltering || isSearchActive;
  const previousPage = Math.max(result.page - 1, 1);
  const nextPage = result.page + 1;
  const filters = new URLSearchParams(safeFilters);
  const branch = filters.get("branch") ?? "";
  const assigned = filters.get("assigned") ?? "";
  const stage = filters.get("stage") ?? "";
  const closed = filters.get("closed") ?? "";

  return (
    <div className="grid gap-6">
      <form
        action={formAction}
        className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
        id="enquiry-search"
      >
        {branch && <input type="hidden" name="branch" value={branch} />}
        {assigned && <input type="hidden" name="assigned" value={assigned} />}
        {stage && <input type="hidden" name="stage" value={stage} />}
        {closed && <input type="hidden" name="closed" value={closed} />}
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="enquiry-query">
            Search landlord leads
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="pl-9"
              defaultValue={state.query}
              id="enquiry-query"
              name="query"
              placeholder="Landlord, address, postcode or reference"
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

      {enquiries.length === 0 ? (
        <Card>
          <CardContent className="grid justify-items-center gap-3 py-12 text-center">
            <Inbox
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <p className="font-medium">
                {hasCriteria
                  ? "No landlord leads found"
                  : "No landlord leads yet"}
              </p>
              <p className="text-sm text-muted-foreground">
                {hasCriteria
                  ? "Try changing the search or filters."
                  : canCreate
                    ? "Capture the first landlord lead to get started."
                    : "Landlord leads in your branches will appear here."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid divide-y overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 md:hidden">
            {enquiries.map((enquiry) => (
              <Link
                key={enquiry.id}
                href={`${path}/${enquiry.id}`}
                className="grid gap-3 p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium [overflow-wrap:anywhere]">
                      {enquiry.enquirerName}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {enquiry.address ||
                        enquiry.postcode ||
                        "Address not recorded"}
                    </p>
                  </div>
                  <Badge variant={stageVariant(enquiry.stage)}>
                    {ENQUIRY_STAGE_LABELS[enquiry.stage]}
                  </Badge>
                </div>
                <p
                  className={`text-xs ${enquiry.nextAction && isOverdue(enquiry.nextAction.dueOn) ? "font-medium text-destructive" : "text-muted-foreground"}`}
                >
                  {enquiry.nextAction
                    ? `${enquiry.nextAction.title} · ${dateFormat.format(enquiry.nextAction.dueOn)}`
                    : "No next action"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {enquiry.branch.name} · {enquiry.reference}
                </p>
              </Link>
            ))}
          </div>
          <Card className="hidden py-0 md:block">
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Landlord</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Lead source</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Appraisal</TableHead>
                    <TableHead>Next action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enquiries.map((enquiry) => (
                    <TableRow
                      key={enquiry.id}
                      className="group relative cursor-pointer hover:bg-muted"
                    >
                      <TableCell className="font-medium">
                        <Link
                          className="text-primary group-hover:underline after:absolute after:inset-0"
                          href={`${path}/${enquiry.id}`}
                        >
                          {enquiry.enquirerName}
                        </Link>
                        <p className="text-xs font-normal text-muted-foreground">
                          {enquiry.address ||
                            enquiry.postcode ||
                            "Address not recorded"}{" "}
                          · {enquiry.reference}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={stageVariant(enquiry.stage)}
                          className="group-hover:bg-card"
                        >
                          {ENQUIRY_STAGE_LABELS[enquiry.stage]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {enquiry.leadSource?.name ?? "Not recorded"}
                      </TableCell>
                      <TableCell>{enquiry.branch.name}</TableCell>
                      <TableCell>
                        {enquiry.appraisal ? (
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarClock
                              className="size-4 text-muted-foreground"
                              aria-hidden="true"
                            />
                            {dateTimeFormat.format(
                              enquiry.appraisal.scheduledAt,
                            )}
                          </span>
                        ) : (
                          "Not booked"
                        )}
                      </TableCell>
                      <TableCell>
                        {enquiry.nextAction ? (
                          <span
                            className={
                              isOverdue(enquiry.nextAction.dueOn)
                                ? "font-medium text-destructive"
                                : ""
                            }
                          >
                            {enquiry.nextAction.title}
                            <span className="block text-xs text-muted-foreground">
                              {dateFormat.format(enquiry.nextAction.dueOn)}
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
          aria-label="Landlord lead pages"
          className="flex items-center justify-between gap-4"
        >
          <p className="text-sm text-muted-foreground">Page {result.page}</p>
          <div className="flex gap-2">
            {isSearchActive ? (
              <>
                <Button
                  type="submit"
                  form="enquiry-search"
                  name="page"
                  value={previousPage}
                  variant="outline"
                  disabled={!result.hasPrevious || isPending}
                >
                  Previous
                </Button>
                <Button
                  type="submit"
                  form="enquiry-search"
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
