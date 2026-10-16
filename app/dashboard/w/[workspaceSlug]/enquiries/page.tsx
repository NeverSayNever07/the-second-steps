import { CalendarClock, Inbox, Plus, Search } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
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
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { requireMfaUserWith } from "@/core/auth/mfa";
import {
  listEnquiries,
  listEnquiryAssignees,
} from "@/core/enquiries/application/enquiries";
import {
  ENQUIRY_STAGES,
  isOverdue,
  type EnquiryStageCode,
} from "@/core/enquiries/domain/enquiry";
import { ENQUIRY_STAGE_LABELS } from "@/core/enquiries/domain/enquiry-labels";
import { isUuid, SEARCH_TEXT_MAX } from "@/core/properties/domain/ids";
import { getWorkspaceBranches } from "@/core/workspace/application/workspace-branches";

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

export default async function EnquiriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{
    q?: string | string[];
    branch?: string | string[];
    assigned?: string | string[];
    stage?: string | string[];
    closed?: string | string[];
    created?: string | string[];
  }>;
}) {
  const { workspaceSlug } = await params;
  const path = `/dashboard/w/${workspaceSlug}/enquiries`;
  const search = await searchParams;
  const query =
    typeof search.q === "string" ? search.q.slice(0, SEARCH_TEXT_MAX) : "";
  const branchId = isUuid(search.branch) ? search.branch : "";
  const assignedId = isUuid(search.assigned) ? search.assigned : "";
  const stage =
    typeof search.stage === "string" &&
    ENQUIRY_STAGES.includes(search.stage as EnquiryStageCode)
      ? (search.stage as EnquiryStageCode)
      : "";
  const includeClosed = search.closed === "yes";
  const stages = stage
    ? [stage]
    : includeClosed
      ? [...ENQUIRY_STAGES]
      : undefined;
  const {
    data: [enquiries, context, branches, assignees],
  } = await requireMfaUserWith(path, { workspaceSlug }, (user) =>
    Promise.all([
      listEnquiries({
        authSubject: user.id,
        workspaceSlug,
        query,
        branchId: branchId || undefined,
        assignedMembershipId: assignedId || undefined,
        stages,
      }),
      getWorkspaceAccessContext(user.id, workspaceSlug),
      getWorkspaceBranches(user.id, workspaceSlug),
      listEnquiryAssignees({ authSubject: user.id, workspaceSlug }),
    ]),
  );
  if (!context || !branches || !context.permissions.has("enquiry.read")) {
    redirect("/access-denied");
  }
  const canCreate = context.permissions.has("enquiry.create");
  const filtering = Boolean(
    query || branchId || assignedId || stage || includeClosed,
  );
  const created = isUuid(search.created) ? search.created : "";

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Landlord leads
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Landlord leads, appraisal progress and the next action needed.
          </p>
        </div>
        {canCreate && (
          <Button render={<Link href={`${path}/new`} />} nativeButton={false}>
            <Plus aria-hidden="true" />
            Quick landlord lead
          </Button>
        )}
      </div>
      {created && (
        <div
          className="rounded-lg bg-success-soft p-4 text-sm text-success"
          role="status"
        >
          Landlord lead saved. It is ready for the next action.
        </div>
      )}
      <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto_auto] xl:items-end">
        <div className="grid gap-2 md:col-span-2 xl:col-span-1">
          <label className="text-sm font-medium" htmlFor="q">
            Search landlord leads
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
              placeholder="Landlord, address, postcode or reference"
            />
          </div>
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="stage">
            Stage
          </label>
          <OptionSelect
            className="w-48"
            id="stage"
            name="stage"
            defaultValue={stage}
            placeholder="Open and won"
            options={[
              { value: "", label: "Open and won" },
              ...ENQUIRY_STAGES.map((value) => ({
                value,
                label: ENQUIRY_STAGE_LABELS[value],
              })),
            ]}
          />
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="branch">
            Branch
          </label>
          <OptionSelect
            className="w-48"
            id="branch"
            name="branch"
            defaultValue={branchId}
            placeholder="All branches"
            options={[
              { value: "", label: "All branches" },
              ...branches.map(({ id, name }) => ({ value: id, label: name })),
            ]}
          />
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="assigned">
            Assigned
          </label>
          <OptionSelect
            className="w-48"
            id="assigned"
            name="assigned"
            defaultValue={assignedId}
            placeholder="Anyone"
            options={[
              { value: "", label: "Anyone" },
              ...assignees.map(({ membershipId, name }) => ({
                value: membershipId,
                label: name,
              })),
            ]}
          />
        </div>
        <label className="flex items-center gap-2 text-sm xl:h-9">
          <input
            type="checkbox"
            name="closed"
            value="yes"
            defaultChecked={includeClosed}
          />
          Include lost and postponed
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
      {enquiries.length === 0 ? (
        <Card>
          <CardContent className="grid justify-items-center gap-3 py-12 text-center">
            <Inbox
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <p className="font-medium">
                {filtering
                  ? "No landlord leads found"
                  : "No landlord leads yet"}
              </p>
              <p className="text-sm text-muted-foreground">
                {filtering
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
    </div>
  );
}
