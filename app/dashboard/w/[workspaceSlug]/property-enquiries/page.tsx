import { Handshake } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createEnquiryAction,
  moveEnquiryAction,
} from "@/app/dashboard/w/[workspaceSlug]/applicants/actions";
import { findApplicantsForEnquiryAction } from "@/app/dashboard/w/[workspaceSlug]/applicants/search-actions";
import { EnquiryMoveControls } from "@/components/applicants/enquiry-move-controls";
import { NewEnquiryDialog } from "@/components/applicants/new-enquiry-dialog";
import { ListPageHeader } from "@/components/records/list-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OptionSelect } from "@/components/ui/option-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { listLettingsReasons } from "@/core/applicants/application/applicants";
import {
  listPropertyEnquiries,
  type EnquirySummary,
} from "@/core/applicants/application/property-enquiries";
import {
  ENQUIRY_STAGE_LABELS,
  ENQUIRY_STAGES,
  isEnquiryStage,
  type PropertyEnquiryStageCode,
} from "@/core/applicants/domain/applicant";
import { requireMfaUserWith } from "@/core/auth/mfa";
import { listEnquirySettings } from "@/core/enquiries/application/enquiry-lists";
import { listListings } from "@/core/listings/application/listing-list";
import { isUuid } from "@/core/properties/domain/ids";
import { getWorkspaceBranches } from "@/core/workspace/application/workspace-branches";

const PAGE_SIZE = 25;
const OPEN_STAGES = ENQUIRY_STAGES.filter(
  (stage): stage is Exclude<PropertyEnquiryStageCode, "closed"> =>
    stage !== "closed",
);
const DAY = 86_400_000;
const WAITING_WARNING_DAYS = 4;
const WAITING_ALERT_DAYS = 7;

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  dateStyle: "medium",
});

function stageVariant(stage: PropertyEnquiryStageCode) {
  if (stage === "closed") return "secondary" as const;
  if (stage === "viewing_arranged") return "info" as const;
  return "default" as const;
}

function pageNumber(value: string | string[] | undefined) {
  const number = typeof value === "string" ? Number(value) : 1;
  return Number.isSafeInteger(number) && number > 0 ? number : 1;
}

function Waiting({
  enquiry,
  now = new Date(),
}: {
  enquiry: EnquirySummary;
  now?: Date;
}) {
  if (enquiry.stage === "closed") return null;
  const days = Math.floor(
    (now.getTime() - enquiry.stageChangedAt.getTime()) / DAY,
  );
  if (days < WAITING_WARNING_DAYS) return null;
  return (
    <Badge variant={days >= WAITING_ALERT_DAYS ? "destructive" : "warning"}>
      {days}d
    </Badge>
  );
}

export default async function PropertyEnquiriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{
    stage?: string | string[];
    branch?: string | string[];
    page?: string | string[];
  }>;
}) {
  const { workspaceSlug } = await params;
  const base = `/dashboard/w/${workspaceSlug}`;
  const path = `${base}/property-enquiries`;
  const search = await searchParams;
  const stage =
    typeof search.stage === "string" &&
    (search.stage === "open" ||
      search.stage === "all" ||
      isEnquiryStage(search.stage))
      ? search.stage
      : "open";
  const branchId = isUuid(search.branch) ? search.branch : "";
  const page = pageNumber(search.page);
  const {
    data: [result, context, reasons, branches, listings, settings],
  } = await requireMfaUserWith(path, { workspaceSlug }, (user) => {
    const actor = { authSubject: user.id, workspaceSlug };
    return Promise.all([
      listPropertyEnquiries({
        ...actor,
        stage,
        branchId: branchId || undefined,
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
      getWorkspaceAccessContext(user.id, workspaceSlug),
      listLettingsReasons(actor),
      getWorkspaceBranches(user.id, workspaceSlug),
      listListings({ ...actor, state: "ready_to_advertise", take: 100 }),
      listEnquirySettings(actor),
    ]);
  });
  if (
    !result ||
    !context ||
    !branches ||
    !context.permissions.has("applicant.read")
  ) {
    redirect("/access-denied");
  }
  const canWork = context.permissions.has("applicant.manage");
  const closeReasons = (reasons ?? [])
    .filter(
      (reason) =>
        reason.appliesTo === "property_enquiry" && reason.status === "active",
    )
    .map(({ id, name }) => ({ id, name }));
  const isFiltering = stage !== "open" || Boolean(branchId);
  const hasNext = page * PAGE_SIZE < result.total;
  const pageHref = (target: number) => {
    const parameters = new URLSearchParams();
    if (stage !== "open") parameters.set("stage", stage);
    if (branchId) parameters.set("branch", branchId);
    if (target > 1) parameters.set("page", String(target));
    const query = parameters.toString();
    return query ? `${path}?${query}` : path;
  };

  const controls = (enquiry: EnquirySummary) => {
    if (!canWork || enquiry.stage === "closed") return null;
    const index = OPEN_STAGES.findIndex((value) => value === enquiry.stage);
    const previous = index > 0 ? OPEN_STAGES[index - 1] : null;
    const next =
      index >= 0 && index < OPEN_STAGES.length - 1
        ? OPEN_STAGES[index + 1]
        : null;
    const bind = (to: string) =>
      moveEnquiryAction.bind(null, workspaceSlug, enquiry.id, to);
    return (
      <EnquiryMoveControls
        applicantName={enquiry.applicant.name}
        closeReasons={closeReasons}
        previous={
          previous
            ? { label: ENQUIRY_STAGE_LABELS[previous], action: bind(previous) }
            : null
        }
        next={
          next
            ? { label: ENQUIRY_STAGE_LABELS[next], action: bind(next) }
            : null
        }
        close={bind("closed")}
      />
    );
  };

  return (
    <div className="grid gap-6">
      <ListPageHeader
        title="Property enquiries"
        summary="Applicants interested in homes that are Ready to advertise. Nothing here is sent outside Zayto."
        action={
          canWork ? (
            <NewEnquiryDialog
              action={createEnquiryAction.bind(null, workspaceSlug)}
              find={findApplicantsForEnquiryAction.bind(null, workspaceSlug)}
              homes={(listings ?? []).map((listing) => ({
                id: listing.id,
                label: `${listing.property.address}${listing.property.postcode ? `, ${listing.property.postcode}` : ""}`,
              }))}
              sources={(settings?.leadSources ?? []).filter(
                ({ status }) => status === "active",
              )}
              applicantsPath={`${base}/applicants`}
            />
          ) : null
        }
      />

      <form className="flex flex-wrap items-center gap-2">
        <div>
          <label className="sr-only" htmlFor="enquiry-stage">
            Stage
          </label>
          <OptionSelect
            className="w-48"
            id="enquiry-stage"
            name="stage"
            defaultValue={stage}
            options={[
              { value: "open", label: "All open" },
              ...ENQUIRY_STAGES.map((value) => ({
                value,
                label: ENQUIRY_STAGE_LABELS[value],
              })),
              { value: "all", label: "Everything" },
            ]}
          />
        </div>
        <div>
          <label className="sr-only" htmlFor="enquiry-branch">
            Branch
          </label>
          <OptionSelect
            className="w-48"
            id="enquiry-branch"
            name="branch"
            defaultValue={branchId}
            placeholder="All branches"
            options={[
              { value: "", label: "All branches" },
              ...branches.map(({ id, name }) => ({ value: id, label: name })),
            ]}
          />
        </div>
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
      </form>

      {result.items.length === 0 ? (
        <Card>
          <CardContent className="grid justify-items-center gap-3 py-12 text-center">
            <Handshake
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <p className="font-medium">
                {isFiltering
                  ? "No property enquiries found"
                  : "No open property enquiries"}
              </p>
              <p className="text-sm text-muted-foreground">
                {isFiltering
                  ? "Try changing the filters."
                  : "Use New enquiry when an applicant asks about a home."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid divide-y overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 md:hidden">
            {result.items.map((enquiry) => (
              <div key={enquiry.id} className="grid gap-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      className="font-medium text-primary [overflow-wrap:anywhere] hover:underline"
                      href={`${base}/applicants/${enquiry.applicant.id}?tab=enquiries`}
                    >
                      {enquiry.applicant.name}
                    </Link>
                    <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                      {enquiry.property.address}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Waiting enquiry={enquiry} />
                    <Badge variant={stageVariant(enquiry.stage)}>
                      {ENQUIRY_STAGE_LABELS[enquiry.stage]}
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {enquiry.branch.name}
                  {enquiry.source ? ` · ${enquiry.source}` : ""}
                  {enquiry.assignee
                    ? ` · ${enquiry.assignee.name}`
                    : " · Not assigned"}
                </p>
                {enquiry.closure && (
                  <p className="text-xs">
                    Closed
                    {enquiry.closure.reason
                      ? `: ${enquiry.closure.reason}`
                      : ""}
                  </p>
                )}
                {enquiry.notice && (
                  <p className="text-xs font-medium text-warning">
                    {enquiry.notice}
                  </p>
                )}
                {controls(enquiry)}
              </div>
            ))}
          </div>
          <Card className="hidden py-0 md:block">
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Applicant</TableHead>
                    <TableHead>Home</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Owner</TableHead>
                    {canWork && <TableHead>Update</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.items.map((enquiry) => (
                    <TableRow key={enquiry.id}>
                      <TableCell className="font-medium">
                        <Link
                          className="text-primary hover:underline"
                          href={`${base}/applicants/${enquiry.applicant.id}?tab=enquiries`}
                        >
                          {enquiry.applicant.name}
                        </Link>
                        <p className="text-xs font-normal text-muted-foreground">
                          {enquiry.applicant.reference} · Since{" "}
                          {dateFormat.format(enquiry.createdAt)}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Link
                          className="hover:text-primary hover:underline"
                          href={`${base}/marketing/${enquiry.listing.id}?tab=enquiries`}
                        >
                          {enquiry.property.address}
                        </Link>
                        {enquiry.notice && (
                          <p className="text-xs font-medium text-warning">
                            {enquiry.notice}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Badge variant={stageVariant(enquiry.stage)}>
                            {ENQUIRY_STAGE_LABELS[enquiry.stage]}
                          </Badge>
                          <Waiting enquiry={enquiry} />
                        </div>
                        {enquiry.closure && (
                          <p className="mt-1 text-xs">
                            {enquiry.closure.reason ?? "Closed"}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>{enquiry.source ?? "Not recorded"}</TableCell>
                      <TableCell>{enquiry.branch.name}</TableCell>
                      <TableCell>
                        {enquiry.assignee?.name ?? "Not assigned"}
                      </TableCell>
                      {canWork && <TableCell>{controls(enquiry)}</TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {(page > 1 || hasNext) && (
        <nav
          aria-label="Property enquiry pages"
          className="flex items-center justify-between gap-4"
        >
          <p className="text-sm text-muted-foreground">
            Page {page} · {result.total} in total
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Button
                render={<Link href={pageHref(page - 1)} />}
                nativeButton={false}
                variant="outline"
              >
                Previous
              </Button>
            )}
            {hasNext && (
              <Button
                render={<Link href={pageHref(page + 1)} />}
                nativeButton={false}
                variant="outline"
              >
                Next
              </Button>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
