import Link from "next/link";
import { redirect } from "next/navigation";
import { moveEnquiryAction } from "@/app/dashboard/w/[workspaceSlug]/applicants/actions";
import { EnquiryMoveControls } from "@/components/applicants/enquiry-move-controls";
import { ListPageHeader } from "@/components/records/list-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OptionSelect } from "@/components/ui/option-select";
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

function EnquiryCard({
  enquiry,
  base,
  canWork,
  workspaceSlug,
  closeReasons,
  now = new Date(),
}: {
  enquiry: EnquirySummary;
  base: string;
  canWork: boolean;
  workspaceSlug: string;
  closeReasons: { id: string; name: string }[];
  now?: Date;
}) {
  const index = OPEN_STAGES.findIndex((stage) => stage === enquiry.stage);
  const previous = index > 0 ? OPEN_STAGES[index - 1] : null;
  const next =
    index >= 0 && index < OPEN_STAGES.length - 1
      ? OPEN_STAGES[index + 1]
      : null;
  const days = Math.floor(
    (now.getTime() - enquiry.stageChangedAt.getTime()) / DAY,
  );
  const bind = (to: string) =>
    moveEnquiryAction.bind(null, workspaceSlug, enquiry.id, to);
  return (
    <li className="grid gap-2 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Link
            href={`${base}/applicants/${enquiry.applicant.id}`}
            className="block truncate text-sm font-medium hover:text-primary hover:underline"
          >
            {enquiry.applicant.name}
          </Link>
          <Link
            href={`${base}/marketing/${enquiry.listing.id}?tab=enquiries`}
            className="block truncate text-xs text-muted-foreground hover:text-primary hover:underline"
          >
            {enquiry.property.address}
          </Link>
        </div>
        {enquiry.stage !== "closed" && days >= WAITING_WARNING_DAYS && (
          <Badge
            variant={days >= WAITING_ALERT_DAYS ? "destructive" : "warning"}
          >
            {days}d
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {enquiry.branch.name}
        {enquiry.assignee ? ` · ${enquiry.assignee.name}` : " · Not assigned"}
        {` · Since ${dateFormat.format(enquiry.createdAt)}`}
      </p>
      {enquiry.stage === "closed" && enquiry.closure && (
        <p className="text-xs">
          Closed
          {enquiry.closure.reason ? `: ${enquiry.closure.reason}` : ""}
          {enquiry.closure.note ? ` (${enquiry.closure.note})` : ""}
        </p>
      )}
      {enquiry.notice && (
        <p className="text-xs font-medium text-warning">{enquiry.notice}</p>
      )}
      {canWork && enquiry.stage !== "closed" && (
        <EnquiryMoveControls
          applicantName={enquiry.applicant.name}
          closeReasons={closeReasons}
          previous={
            previous
              ? {
                  label: ENQUIRY_STAGE_LABELS[previous],
                  action: bind(previous),
                }
              : null
          }
          next={
            next
              ? { label: ENQUIRY_STAGE_LABELS[next], action: bind(next) }
              : null
          }
          close={bind("closed")}
        />
      )}
    </li>
  );
}

export default async function PropertyEnquiriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{
    view?: string | string[];
    stage?: string | string[];
  }>;
}) {
  const { workspaceSlug } = await params;
  const base = `/dashboard/w/${workspaceSlug}`;
  const path = `${base}/property-enquiries`;
  const search = await searchParams;
  const view = search.view === "list" ? "list" : "board";
  const stage =
    typeof search.stage === "string" && isEnquiryStage(search.stage)
      ? search.stage
      : "all";
  const {
    data: [result, context, reasons],
  } = await requireMfaUserWith(path, { workspaceSlug }, (user) => {
    const actor = { authSubject: user.id, workspaceSlug };
    return Promise.all([
      listPropertyEnquiries({
        ...actor,
        stage: view === "board" ? "open" : stage,
        take: 100,
      }),
      getWorkspaceAccessContext(user.id, workspaceSlug),
      listLettingsReasons(actor),
    ]);
  });
  if (!result || !context || !context.permissions.has("applicant.read")) {
    redirect("/access-denied");
  }
  const canWork = context.permissions.has("applicant.manage");
  const closeReasons = (reasons ?? [])
    .filter(
      (reason) =>
        reason.appliesTo === "property_enquiry" && reason.status === "active",
    )
    .map(({ id, name }) => ({ id, name }));
  const card = (enquiry: EnquirySummary) => (
    <EnquiryCard
      key={enquiry.id}
      enquiry={enquiry}
      base={base}
      canWork={canWork}
      workspaceSlug={workspaceSlug}
      closeReasons={closeReasons}
    />
  );

  return (
    <div className="grid gap-6">
      <ListPageHeader
        title="Property enquiries"
        summary="Applicants interested in homes that are Ready to advertise. Nothing here is sent outside Zayto."
      />
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="inline-flex rounded-lg border p-0.5"
          role="group"
          aria-label="View"
        >
          <Button
            size="sm"
            variant={view === "board" ? "secondary" : "ghost"}
            render={<Link href={path} />}
            nativeButton={false}
          >
            Board
          </Button>
          <Button
            size="sm"
            variant={view === "list" ? "secondary" : "ghost"}
            render={<Link href={`${path}?view=list`} />}
            nativeButton={false}
          >
            List
          </Button>
        </div>
        {view === "list" && (
          <form className="flex items-center gap-2">
            <input type="hidden" name="view" value="list" />
            <label className="sr-only" htmlFor="enquiry-stage">
              Stage
            </label>
            <OptionSelect
              className="w-48"
              id="enquiry-stage"
              name="stage"
              defaultValue={stage === "all" ? "" : stage}
              placeholder="All stages"
              options={[
                { value: "", label: "All stages" },
                ...ENQUIRY_STAGES.map((value) => ({
                  value,
                  label: ENQUIRY_STAGE_LABELS[value],
                })),
              ]}
            />
            <Button type="submit" variant="outline">
              Apply
            </Button>
          </form>
        )}
      </div>

      {view === "board" ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-4">
          {OPEN_STAGES.map((value) => {
            const inStage = result.items.filter(
              (enquiry) => enquiry.stage === value,
            );
            return (
              <section
                key={value}
                aria-labelledby={`stage-${value}`}
                className="rounded-lg border"
              >
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <h2 id={`stage-${value}`} className="text-sm font-semibold">
                    {ENQUIRY_STAGE_LABELS[value]}
                  </h2>
                  <Badge variant="secondary">{inStage.length}</Badge>
                </div>
                {inStage.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground">
                    No enquiries at this stage.
                  </p>
                ) : (
                  <ul className="divide-y">{inStage.map(card)}</ul>
                )}
              </section>
            );
          })}
        </div>
      ) : result.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No enquiries to show.</p>
      ) : (
        <ul className="divide-y rounded-lg border">{result.items.map(card)}</ul>
      )}
      {result.total > result.items.length && (
        <p className="text-sm text-muted-foreground">
          Showing the {result.items.length} most recently changed of{" "}
          {result.total}. Use the stage filter in the list to narrow it down.
        </p>
      )}
    </div>
  );
}
