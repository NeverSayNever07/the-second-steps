import {
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  GitBranch,
  Inbox,
  Mail,
  MapPin,
  Phone,
  Pencil,
  Plus,
  StickyNote,
  UserCheck,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  addEnquiryTaskAction,
  cancelEnquiryTaskAction,
  closeEnquiryAction,
  completeAppraisalAction,
  completeEnquiryTaskAction,
  finishAppraisalAction,
  reopenEnquiryAction,
} from "../actions";
import { AppraisalControls } from "@/components/enquiries/appraisal-controls";
import { EnquiryStageActions } from "@/components/enquiries/enquiry-stage-actions";
import {
  AddEnquiryTask,
  TaskCloseButtons,
} from "@/components/enquiries/enquiry-task-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { requireMfaUserWith } from "@/core/auth/mfa";
import { listEnquirySettings } from "@/core/enquiries/application/enquiry-lists";
import {
  getEnquiry,
  listEnquiryAssignees,
} from "@/core/enquiries/application/enquiries";
import { staffName } from "@/core/enquiries/application/enquiry-shared";
import {
  canCloseFrom,
  canWinFrom,
  isOpenStage,
  isOverdue,
  type AppraisalStatusCode,
  type EnquiryStageCode,
  type LettingServiceCode,
} from "@/core/enquiries/domain/enquiry";
import {
  APPRAISAL_STATUS_LABELS,
  ENQUIRY_STAGE_LABELS,
  LETTING_SERVICE_LABELS,
} from "@/core/enquiries/domain/enquiry-labels";
import { isUuid } from "@/core/properties/domain/ids";

const dateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC" });
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  dateStyle: "medium",
  timeStyle: "short",
});

function stageVariant(stage: EnquiryStageCode) {
  if (stage === "won") return "success" as const;
  if (stage === "lost") return "destructive" as const;
  if (stage === "postponed") return "warning" as const;
  if (stage === "appraisal_booked") return "info" as const;
  return "secondary" as const;
}

function appraisalVariant(status: AppraisalStatusCode) {
  if (status === "completed") return "success" as const;
  if (status === "scheduled") return "info" as const;
  return "secondary" as const;
}

export default async function EnquiryPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string; enquiryId: string }>;
  searchParams: Promise<{
    error?: string | string[];
    updated?: string | string[];
  }>;
}) {
  const { workspaceSlug, enquiryId } = await params;
  if (!isUuid(enquiryId)) notFound();
  const listPath = `/dashboard/w/${workspaceSlug}/enquiries`;
  const path = `${listPath}/${enquiryId}`;
  const {
    data: [enquiry, context, settings, allAssignees],
  } = await requireMfaUserWith(path, { workspaceSlug }, (user) =>
    Promise.all([
      getEnquiry({ authSubject: user.id, workspaceSlug, enquiryId }),
      getWorkspaceAccessContext(user.id, workspaceSlug),
      listEnquirySettings({ authSubject: user.id, workspaceSlug }),
      listEnquiryAssignees({ authSubject: user.id, workspaceSlug }),
    ]),
  );
  if (!context || !settings || !context.permissions.has("enquiry.read")) {
    redirect("/access-denied");
  }
  if (!enquiry) notFound();
  const query = await searchParams;
  const stage = enquiry.stage.toLowerCase() as EnquiryStageCode;
  const canUpdate = context.permissions.has("enquiry.update");
  const assignees = allAssignees.filter(
    ({ branchIds }) =>
      branchIds === null || branchIds.includes(enquiry.responsibleBranchId),
  );
  const openTasks = enquiry.tasks.filter(({ status }) => status === "OPEN");
  const closedTasks = enquiry.tasks.filter(({ status }) => status !== "OPEN");
  const address = [
    enquiry.addressBuilding,
    enquiry.addressStreet,
    enquiry.postcode,
  ]
    .filter(Boolean)
    .join(", ");
  const latestScheduled = enquiry.appraisals.find(
    ({ status }) => status === "SCHEDULED",
  );
  const assignedTo = enquiry.leadMembership
    ? staffName(enquiry.leadMembership.userIdentity)
    : "Unassigned";

  return (
    <div className="grid gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit"
        render={<Link href={listPath} />}
        nativeButton={false}
      >
        <ArrowLeft aria-hidden="true" />
        Back to landlord leads
      </Button>
      {query.error === "task" && (
        <div
          className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          The next action could not be changed. Refresh the page and try again.
        </div>
      )}
      {query.updated === "yes" && (
        <div
          className="rounded-lg bg-success-soft p-4 text-sm text-success"
          role="status"
        >
          Landlord lead updated.
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-8 lg:grid-cols-[18rem_minmax(0,1fr)] 2xl:grid-cols-[20rem_minmax(0,1fr)_22rem]">
        <header className="grid content-start gap-6 lg:col-start-1 lg:row-start-1">
          <div className="flex items-center gap-4 lg:flex-col lg:items-start">
            <span
              aria-hidden="true"
              className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-accent text-primary"
            >
              <Inbox className="size-6" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">
                {enquiry.enquirerName}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                {address || "Property address not recorded"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant={stageVariant(stage)}>
                  {ENQUIRY_STAGE_LABELS[stage]}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {enquiry.reference}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canUpdate && isOpenStage(stage) && (
              <Button
                variant="outline"
                render={<Link href={`${path}/edit`} />}
                nativeButton={false}
              >
                <Pencil aria-hidden="true" />
                Edit details
              </Button>
            )}
            {(canCloseFrom(stage) ||
              (context.permissions.has("enquiry.reopen") &&
                (stage === "lost" || stage === "postponed"))) && (
              <EnquiryStageActions
                closeAction={closeEnquiryAction.bind(
                  null,
                  workspaceSlug,
                  enquiryId,
                )}
                reopenAction={reopenEnquiryAction.bind(
                  null,
                  workspaceSlug,
                  enquiryId,
                )}
                canClose={canUpdate && canCloseFrom(stage)}
                canWin={canWinFrom(stage)}
                canReopen={
                  context.permissions.has("enquiry.reopen") &&
                  (stage === "lost" || stage === "postponed")
                }
                reasons={settings.outcomeReasons.filter(
                  ({ status }) => status === "active",
                )}
              />
            )}
          </div>
          <dl className="grid gap-5 border-t pt-6">
            <Detail
              label="Telephone"
              value={enquiry.enquirerTelephone}
              icon={Phone}
              href={
                enquiry.enquirerTelephone
                  ? `tel:${enquiry.enquirerTelephone}`
                  : undefined
              }
            />
            <Detail
              label="Email"
              value={enquiry.enquirerEmail}
              icon={Mail}
              href={
                enquiry.enquirerEmail
                  ? `mailto:${enquiry.enquirerEmail}`
                  : undefined
              }
            />
            <Detail label="Assigned to" value={assignedTo} icon={UserCheck} />
            <Detail
              label="Responsible branch"
              value={enquiry.responsibleBranch.name}
              icon={GitBranch}
            />
            <Detail
              label="Lead source"
              value={enquiry.leadSource?.name}
              icon={UserRound}
            />
          </dl>
        </header>

        <div className="grid min-w-0 content-start gap-10 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:border-l lg:pl-10">
          <section className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Next actions</h2>
                <p className="text-sm text-muted-foreground">
                  The earliest open action is shown on the landlord lead list.
                </p>
              </div>
              {canUpdate && isOpenStage(stage) && (
                <AddEnquiryTask
                  action={addEnquiryTaskAction.bind(
                    null,
                    workspaceSlug,
                    enquiryId,
                  )}
                  assignees={assignees}
                  currentMembershipId={context.membership.id}
                />
              )}
            </div>
            {openTasks.length ? (
              <ul className="grid divide-y border-t">
                {openTasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{task.title}</p>
                      <p
                        className={`text-xs ${isOverdue(task.dueOn) ? "font-medium text-destructive" : "text-muted-foreground"}`}
                      >
                        Due {dateFormat.format(task.dueOn)}
                        {isOverdue(task.dueOn) && " · Overdue"}
                      </p>
                    </div>
                    {canUpdate && (
                      <TaskCloseButtons
                        completeAction={completeEnquiryTaskAction.bind(
                          null,
                          workspaceSlug,
                          enquiryId,
                          task.id,
                        )}
                        cancelAction={cancelEnquiryTaskAction.bind(
                          null,
                          workspaceSlug,
                          enquiryId,
                          task.id,
                        )}
                      />
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-lg bg-warning-soft p-4 text-sm text-warning">
                No open next action. Add one so this landlord lead is not
                forgotten.
              </div>
            )}
            {closedTasks.length > 0 && (
              <details>
                <summary className="w-fit cursor-pointer text-sm text-primary">
                  Previous actions ({closedTasks.length})
                </summary>
                <ul className="mt-3 grid divide-y border-t">
                  {closedTasks.map((task) => (
                    <li key={task.id} className="py-3">
                      <p className="text-sm font-medium">{task.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {task.status === "DONE" ? "Done" : "Cancelled"} · Due{" "}
                        {dateFormat.format(task.dueOn)}
                      </p>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          <section className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Appraisals</h2>
                <p className="text-sm text-muted-foreground">
                  Book visits and keep the recommendation with the landlord
                  lead.
                </p>
              </div>
              {canUpdate && stage === "new_enquiry" && (
                <Button
                  size="sm"
                  render={<Link href={`${path}/book-appraisal`} />}
                  nativeButton={false}
                >
                  <Plus aria-hidden="true" />
                  Book appraisal
                </Button>
              )}
            </div>
            {enquiry.appraisals.length ? (
              <ul className="grid divide-y border-t">
                {enquiry.appraisals.map((appraisal) => {
                  const status =
                    appraisal.status.toLowerCase() as AppraisalStatusCode;
                  const service =
                    appraisal.recommendedService?.toLowerCase() as
                      LettingServiceCode | undefined;
                  return (
                    <li key={appraisal.id} className="grid gap-3 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">
                            {dateTimeFormat.format(appraisal.scheduledAt)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {service
                              ? LETTING_SERVICE_LABELS[service]
                              : "Recommendation not recorded"}
                          </p>
                        </div>
                        <Badge variant={appraisalVariant(status)}>
                          {APPRAISAL_STATUS_LABELS[status]}
                        </Badge>
                      </div>
                      {status === "completed" && (
                        <p className="text-sm text-muted-foreground">
                          {appraisal.expectedMonthlyRentPence
                            ? `Expected rent £${(appraisal.expectedMonthlyRentPence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2 })} pcm`
                            : "Expected rent not recorded"}
                          {appraisal.notes ? ` · ${appraisal.notes}` : ""}
                        </p>
                      )}
                      {canUpdate &&
                        latestScheduled?.id === appraisal.id &&
                        stage === "appraisal_booked" && (
                          <AppraisalControls
                            completeAction={completeAppraisalAction.bind(
                              null,
                              workspaceSlug,
                              enquiryId,
                              appraisal.id,
                            )}
                            finishAction={finishAppraisalAction.bind(
                              null,
                              workspaceSlug,
                              enquiryId,
                              appraisal.id,
                            )}
                          />
                        )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No appraisal has been booked.
              </p>
            )}
          </section>

          <section className="grid gap-4">
            <h2 className="text-base font-semibold">Stage history</h2>
            <ol className="grid divide-y border-t">
              {enquiry.stageHistory.length ? (
                enquiry.stageHistory.map((history) => {
                  const from =
                    history.fromStage.toLowerCase() as EnquiryStageCode;
                  const to = history.toStage.toLowerCase() as EnquiryStageCode;
                  return (
                    <li key={history.id} className="grid gap-1 py-3">
                      <p className="text-sm font-medium">
                        {ENQUIRY_STAGE_LABELS[from]} to{" "}
                        {ENQUIRY_STAGE_LABELS[to]}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {dateTimeFormat.format(history.createdAt)}
                        {history.reason ? ` · ${history.reason}` : ""}
                      </p>
                    </li>
                  );
                })
              ) : (
                <li className="py-3 text-sm text-muted-foreground">
                  No stage changes yet.
                </li>
              )}
            </ol>
          </section>
        </div>

        <section className="grid content-start gap-5 border-t pt-6 lg:col-start-1 lg:row-start-2 2xl:col-start-3 2xl:row-start-1 2xl:border-t-0 2xl:border-l 2xl:pt-0 2xl:pl-10">
          <h2 className="text-base font-semibold">Lead details</h2>
          <dl className="grid content-start gap-5">
            <Detail label="Property" value={address} icon={MapPin} />
            <Detail
              label="Created"
              value={dateTimeFormat.format(enquiry.createdAt)}
              icon={CalendarDays}
            />
            <Detail
              label="Stage changed"
              value={dateTimeFormat.format(enquiry.stageChangedAt)}
              icon={Clock3}
            />
            <Detail label="Summary" value={enquiry.summary} icon={StickyNote} />
            {enquiry.outcomeReason && (
              <Detail
                label="Outcome reason"
                value={enquiry.outcomeReason.name}
                icon={CheckCircle2}
              />
            )}
            {enquiry.outcomeNote && (
              <Detail
                label="Outcome note"
                value={enquiry.outcomeNote}
                icon={StickyNote}
              />
            )}
            {enquiry.followUpOn && (
              <Detail
                label="Follow up"
                value={dateFormat.format(enquiry.followUpOn)}
                icon={CalendarClock}
              />
            )}
          </dl>
        </section>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  icon: Icon,
  href,
}: {
  label: string;
  value: string | null | undefined;
  icon: LucideIcon;
  href?: string;
}) {
  return (
    <div className="flex gap-3">
      <Icon
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 text-sm font-medium [overflow-wrap:anywhere]">
          {value && href ? (
            <a
              className="text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
              href={href}
            >
              {value}
            </a>
          ) : (
            value || "Not recorded"
          )}
        </dd>
      </div>
    </div>
  );
}
