"use client";

import { CalendarClock, Eye, Inbox, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  searchEnquiriesAction,
  type EnquirySearchState,
} from "@/app/dashboard/w/[workspaceSlug]/enquiries/search-actions";
import {
  LeadPreview,
  type PreviewAssignee,
} from "@/components/enquiries/lead-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OptionSelect } from "@/components/ui/option-select";
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
import {
  DEFAULT_ENQUIRY_VIEW,
  ENQUIRY_VIEW_EMPTY,
  ENQUIRY_VIEW_LABELS,
  ENQUIRY_VIEWS,
  type EnquiryView,
} from "@/core/enquiries/domain/enquiry-views";
import { cn } from "cn";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
});
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  dateStyle: "short",
  timeStyle: "short",
});

/** Wait this long after the last keystroke before filtering. */
const FILTER_DELAY_MS = 300;

function stageVariant(stage: EnquiryStageCode) {
  if (stage === "won") return "success" as const;
  if (stage === "lost") return "destructive" as const;
  if (stage === "postponed") return "warning" as const;
  if (stage === "appraisal_booked") return "info" as const;
  return "secondary" as const;
}

/** True from the width where the preview sits beside the list. */
function useBesideList() {
  const [beside, setBeside] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setBeside(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return beside;
}

export function EnquiriesWorklist({
  assignedId,
  assignees,
  branchId,
  branches,
  canCreate,
  canWork,
  counts,
  currentMembershipId,
  initialState,
  path,
  stage,
  view,
  workspaceSlug,
}: {
  assignedId: string;
  assignees: PreviewAssignee[];
  branchId: string;
  branches: { id: string; name: string }[];
  canCreate: boolean;
  canWork: boolean;
  counts: Record<EnquiryView, number> | null;
  currentMembershipId: string;
  initialState: EnquirySearchState;
  path: string;
  /** An old address can name one stage; then no view is selected. */
  stage: string;
  view: EnquiryView | null;
  workspaceSlug: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beside = useBesideList();
  const search = searchEnquiriesAction.bind(null, workspaceSlug);
  const [state, formAction, isPending] = useActionState(search, initialState);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // What the last change did. It stays when a lead leaves the view, which is
  // how a person knows the change was saved.
  const [notice, setNotice] = useState("");
  const { result } = state;
  const enquiries = result.items;
  const selected = enquiries.find(({ id }) => id === selectedId) ?? null;
  const isSearchActive = Boolean(state.query);
  const previousPage = Math.max(result.page - 1, 1);
  const nextPage = result.page + 1;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /** Addresses for the tabs and filters; they keep the other choices. */
  function hrefWith(changes: {
    view?: EnquiryView;
    branch?: string;
    assigned?: string;
  }) {
    const parameters = new URLSearchParams();
    const nextView = changes.view ?? view;
    if (stage && !changes.view) parameters.set("stage", stage);
    else if (nextView && nextView !== DEFAULT_ENQUIRY_VIEW) {
      parameters.set("view", nextView);
    }
    const nextBranch = changes.branch ?? branchId;
    if (nextBranch) parameters.set("branch", nextBranch);
    const nextAssigned = changes.assigned ?? assignedId;
    if (nextAssigned) parameters.set("assigned", nextAssigned);
    const query = parameters.toString();
    return query ? `${path}?${query}` : path;
  }

  function changed(message: string) {
    setNotice(message);
    router.refresh();
    formRef.current?.requestSubmit();
  }

  function filterSoon() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => formRef.current?.requestSubmit(),
      FILTER_DELAY_MS,
    );
  }

  function open(id: string, href: string) {
    if (beside) setSelectedId((current) => (current === id ? null : id));
    else router.push(href);
  }

  const emptyText = isSearchActive
    ? "Try a different search."
    : stage
      ? "Try another stage."
      : view
        ? ENQUIRY_VIEW_EMPTY[view]
        : "";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b">
        <nav
          aria-label="Lead views"
          className="-mb-px flex max-w-full min-w-0 gap-1 overflow-x-auto"
        >
          {ENQUIRY_VIEWS.map((item) => {
            const on = item === view;
            return (
              <Link
                key={item}
                href={hrefWith({ view: item })}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {ENQUIRY_VIEW_LABELS[item]}
                {counts && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs tabular-nums",
                      on ? "bg-primary text-primary-foreground" : "bg-muted",
                    )}
                  >
                    {counts[item]}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {branches.length > 1 && (
            <div>
              <label className="sr-only" htmlFor="lead-branch">
                Branch
              </label>
              <OptionSelect
                className="w-40"
                id="lead-branch"
                value={branchId}
                placeholder="All branches"
                onValueChange={(next) =>
                  router.push(hrefWith({ branch: next }))
                }
                options={[
                  { value: "", label: "All branches" },
                  ...branches.map(({ id, name }) => ({
                    value: id,
                    label: name,
                  })),
                ]}
              />
            </div>
          )}
          {assignees.length > 1 && (
            <div>
              <label className="sr-only" htmlFor="lead-assigned">
                Looked after by
              </label>
              <OptionSelect
                className="w-40"
                id="lead-assigned"
                value={assignedId}
                placeholder="Anyone"
                onValueChange={(next) =>
                  router.push(hrefWith({ assigned: next }))
                }
                options={[
                  { value: "", label: "Anyone" },
                  ...assignees.map(({ membershipId, name }) => ({
                    value: membershipId,
                    label: name,
                  })),
                ]}
              />
            </div>
          )}
          <form
            ref={formRef}
            action={formAction}
            id="enquiry-search"
            className="relative w-full sm:w-64"
          >
            {view && <input type="hidden" name="view" value={view} />}
            {stage && <input type="hidden" name="stage" value={stage} />}
            {branchId && <input type="hidden" name="branch" value={branchId} />}
            {assignedId && (
              <input type="hidden" name="assigned" value={assignedId} />
            )}
            <label className="sr-only" htmlFor="enquiry-query">
              Search landlord leads
            </label>
            <Search
              aria-hidden="true"
              className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="pl-8"
              defaultValue={state.query}
              id="enquiry-query"
              aria-describedby="enquiry-query-hint"
              name="query"
              autoComplete="off"
              placeholder="Filter as you type"
              onChange={filterSoon}
            />
            <p className="sr-only" id="enquiry-query-hint">
              The list filters as you type. Search words stay on this page and
              are not added to the web address.
            </p>
          </form>
        </div>
      </div>

      {stage && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Showing only</span>
          <Badge variant="secondary">
            {ENQUIRY_STAGE_LABELS[stage as EnquiryStageCode] ?? stage}
          </Badge>
          <Link
            href={path}
            className="text-primary underline-offset-4 hover:underline"
          >
            Show the views again
          </Link>
        </p>
      )}

      <p aria-live="polite" className="sr-only">
        {isPending ? "Filtering" : `${enquiries.length} landlord leads shown`}
      </p>
      <p
        role="status"
        aria-live="polite"
        className="text-sm font-medium text-success empty:hidden"
      >
        {notice}
      </p>

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
                {isSearchActive || stage
                  ? "No landlord leads found"
                  : view === "attention"
                    ? "All up to date"
                    : "No landlord leads here"}
              </p>
              <p className="text-sm text-muted-foreground">
                {emptyText}
                {!isSearchActive && !stage && view === "attention" && (
                  <>
                    {" "}
                    <Link
                      href={hrefWith({ view: "open" })}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      See all open leads
                    </Link>
                    .
                  </>
                )}
                {!isSearchActive && !stage && view === "open" && canCreate
                  ? " Capture the first landlord lead to get started."
                  : ""}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div
          className={cn(
            "grid grid-cols-[minmax(0,1fr)] items-start gap-4",
            selected && "lg:grid-cols-[minmax(0,1fr)_22rem]",
          )}
        >
          <div className="grid min-w-0 gap-4">
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
                      : enquiry.stage === "won"
                        ? "Instruction started"
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
                      <TableHead>Next action</TableHead>
                      <TableHead>Looked after by</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enquiries.map((enquiry) => {
                      const on = enquiry.id === selectedId;
                      const href = `${path}/${enquiry.id}`;
                      return (
                        <TableRow
                          key={enquiry.id}
                          data-state={on ? "selected" : undefined}
                          className={cn(
                            "cursor-pointer hover:bg-muted",
                            on && "bg-accent/50",
                          )}
                          onClick={() => open(enquiry.id, href)}
                        >
                          <TableCell className="font-medium whitespace-normal">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <Link
                                  className="text-primary hover:underline"
                                  href={href}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  {enquiry.enquirerName}
                                </Link>
                                <p className="text-xs font-normal text-muted-foreground">
                                  {enquiry.address ||
                                    enquiry.postcode ||
                                    "Address not recorded"}{" "}
                                  · {enquiry.reference}
                                </p>
                              </div>
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                className="hidden shrink-0 lg:inline-flex"
                                aria-label={`Preview ${enquiry.enquirerName}`}
                                aria-pressed={on}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedId(on ? null : enquiry.id);
                                }}
                              >
                                <Eye aria-hidden="true" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={stageVariant(enquiry.stage)}>
                              {ENQUIRY_STAGE_LABELS[enquiry.stage]}
                            </Badge>
                          </TableCell>
                          <TableCell className="min-w-40 whitespace-normal">
                            {enquiry.nextAction ? (
                              <span
                                className={
                                  isOverdue(enquiry.nextAction.dueOn)
                                    ? "font-medium text-destructive"
                                    : ""
                                }
                              >
                                {enquiry.nextAction.kind === "appraisal" ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <CalendarClock
                                      className="size-4 text-muted-foreground"
                                      aria-hidden="true"
                                    />
                                    Appraisal
                                  </span>
                                ) : (
                                  enquiry.nextAction.title
                                )}
                                <span className="block text-xs font-normal text-muted-foreground">
                                  {enquiry.nextAction.kind === "appraisal"
                                    ? dateTimeFormat.format(
                                        enquiry.nextAction.dueOn,
                                      )
                                    : dateFormat.format(
                                        enquiry.nextAction.dueOn,
                                      )}
                                </span>
                              </span>
                            ) : enquiry.stage === "won" ? (
                              // A won lead carries on as its instruction.
                              <span className="text-muted-foreground">
                                Instruction started
                              </span>
                            ) : enquiry.stage === "lost" ||
                              enquiry.stage === "postponed" ? (
                              <span className="text-muted-foreground">–</span>
                            ) : (
                              <span className="font-medium text-warning">
                                No next action
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            {enquiry.lead?.name ?? (
                              <span className="text-muted-foreground">
                                Nobody yet
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
          {selected && (
            <div className="hidden min-w-0 lg:block">
              <LeadPreview
                key={selected.id}
                lead={selected}
                workspaceSlug={workspaceSlug}
                canWork={canWork}
                assignees={assignees}
                currentMembershipId={currentMembershipId}
                onChanged={changed}
                onClose={() => setSelectedId(null)}
              />
            </div>
          )}
        </div>
      )}

      {(result.hasPrevious || result.hasNext) && (
        <nav
          aria-label="Landlord lead pages"
          className="flex items-center justify-between gap-4"
        >
          <p className="text-sm text-muted-foreground">Page {result.page}</p>
          <div className="flex gap-2">
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
          </div>
        </nav>
      )}
    </div>
  );
}
