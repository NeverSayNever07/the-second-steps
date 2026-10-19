"use client";

import { ClipboardList, Search } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
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
  searchInstructionsAction,
  type InstructionSearchState,
} from "@/app/dashboard/w/[workspaceSlug]/instructions/actions";
import { LETTING_SERVICE_LABELS } from "@/core/enquiries/domain/enquiry-labels";
import {
  formatRent,
  JOURNEY_STAGE_LABELS,
} from "@/core/instructions/domain/instruction-labels";
import type { JourneyStageCode } from "@/core/instructions/domain/instruction";

function stageVariant(stage: JourneyStageCode) {
  if (stage === "ready_to_market") {
    return "success" as const;
  }
  if (stage === "onboarding") {
    return "warning" as const;
  }
  return "secondary" as const;
}

function dateLabel(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
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

export function InstructionsWorklist({
  initialState,
  isFiltering,
  path,
  safeFilters,
  workspaceSlug,
}: {
  initialState: InstructionSearchState;
  isFiltering: boolean;
  path: string;
  safeFilters: string;
  workspaceSlug: string;
}) {
  const search = searchInstructionsAction.bind(null, workspaceSlug);
  const [state, formAction, isPending] = useActionState(search, initialState);
  const { result } = state;
  const isSearchActive = Boolean(state.query);
  const hasCriteria = isFiltering || isSearchActive;
  const previousPage = Math.max(result.page - 1, 1);
  const nextPage = result.page + 1;
  const filters = new URLSearchParams(safeFilters);
  const branch = filters.get("branch") ?? "";
  const assigned = filters.get("assigned") ?? "";
  const stage = filters.get("stage") ?? "";
  const listState = filters.get("state") ?? "current";

  return (
    <div className="grid gap-6">
      <form
        action={formAction}
        className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
        id="instruction-search"
      >
        {branch && <input type="hidden" name="branch" value={branch} />}
        {assigned && <input type="hidden" name="assigned" value={assigned} />}
        {stage && <input type="hidden" name="stage" value={stage} />}
        <input type="hidden" name="state" value={listState} />
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="instruction-query">
            Search instructions
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="pl-9"
              defaultValue={state.query}
              id="instruction-query"
              name="query"
              placeholder="Property, landlord or reference"
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
            <ClipboardList
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <p className="font-medium">
                {hasCriteria
                  ? "No instructions found"
                  : "No current instructions"}
              </p>
              <p className="text-sm text-muted-foreground">
                {hasCriteria
                  ? "Try changing the search or filters."
                  : "Instructions started from completed landlord leads will appear here."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid divide-y overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 md:hidden">
            {result.items.map((instruction) => (
              <Link
                key={instruction.id}
                href={`${path}/${instruction.id}`}
                className="grid gap-3 p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium [overflow-wrap:anywhere]">
                      {instruction.property.addressLine}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {instruction.property.postcode} · {instruction.reference}
                    </p>
                  </div>
                  <Badge variant={stageVariant(instruction.journeyStage)}>
                    {instruction.current
                      ? JOURNEY_STAGE_LABELS[instruction.journeyStage]
                      : "Ended"}
                  </Badge>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Main landlord
                    </dt>
                    <dd className="font-medium">
                      {instruction.mainLandlord ?? "Not recorded"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Service</dt>
                    <dd className="font-medium">
                      {instruction.service
                        ? LETTING_SERVICE_LABELS[instruction.service]
                        : "Not recorded"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Rent</dt>
                    <dd className="font-medium">
                      {formatRent({
                        askingRentPence: instruction.askingRentPence,
                        rentPeriod: instruction.rentPeriod,
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Lead staff
                    </dt>
                    <dd className="font-medium">
                      {instruction.leadStaff?.name ?? "Not assigned"}
                    </dd>
                  </div>
                </dl>
                <p className="text-xs text-muted-foreground">
                  {instruction.branch.name} · Instructed{" "}
                  {dateLabel(instruction.instructedOn)}
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
                      Property
                    </TableHead>
                    <TableHead>Main landlord</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Service and rent</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Lead staff</TableHead>
                    <TableHead>Instruction date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.items.map((instruction) => (
                    <TableRow
                      key={instruction.id}
                      className="group relative cursor-pointer hover:bg-muted"
                    >
                      <TableCell className="sticky left-0 z-10 bg-card font-medium group-hover:bg-muted">
                        <Link
                          className="text-primary group-hover:underline after:absolute after:inset-0"
                          href={`${path}/${instruction.id}`}
                        >
                          {instruction.property.addressLine}
                        </Link>
                        <p className="text-xs font-normal text-muted-foreground">
                          {instruction.property.postcode} ·{" "}
                          {instruction.reference}
                        </p>
                      </TableCell>
                      <TableCell>
                        {instruction.mainLandlord ?? "Not recorded"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={stageVariant(instruction.journeyStage)}>
                          {instruction.current
                            ? JOURNEY_STAGE_LABELS[instruction.journeyStage]
                            : "Ended"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <p>
                          {instruction.service
                            ? LETTING_SERVICE_LABELS[instruction.service]
                            : "Not recorded"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatRent({
                            askingRentPence: instruction.askingRentPence,
                            rentPeriod: instruction.rentPeriod,
                          })}
                        </p>
                      </TableCell>
                      <TableCell>{instruction.branch.name}</TableCell>
                      <TableCell>
                        {instruction.leadStaff?.name ?? "Not assigned"}
                      </TableCell>
                      <TableCell>
                        {dateLabel(instruction.instructedOn)}
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
          aria-label="Instruction pages"
          className="flex items-center justify-between gap-4"
        >
          <p className="text-sm text-muted-foreground">Page {result.page}</p>
          <div className="flex gap-2">
            {isSearchActive ? (
              <>
                <Button
                  type="submit"
                  form="instruction-search"
                  name="page"
                  value={previousPage}
                  variant="outline"
                  disabled={!result.hasPrevious || isPending}
                >
                  Previous
                </Button>
                <Button
                  type="submit"
                  form="instruction-search"
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
