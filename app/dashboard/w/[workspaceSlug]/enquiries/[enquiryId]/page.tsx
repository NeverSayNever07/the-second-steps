import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Handshake,
  History,
  Inbox,
  ListTodo,
  Pencil,
  Plus,
  XCircle,
} from "lucide-react";
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
  updateScheduledAppraisalAction,
} from "../actions";
import { AppraisalControls } from "@/components/enquiries/appraisal-controls";
import { EnquiryStageActions } from "@/components/enquiries/enquiry-stage-actions";
import {
  AddEnquiryTask,
  TaskCloseButtons,
} from "@/components/enquiries/enquiry-task-controls";
import { OtherInstructions } from "@/components/instructions/other-instructions";
import { JourneyBar } from "@/components/records/journey-bar";
import {
  KeyDetails,
  NextStepPanel,
  SectionCard,
  Timeline,
  type TimelineEntry,
} from "@/components/records/record-cards";
import { RecordHeader } from "@/components/records/record-header";
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
  isOpenStage,
  isOverdue,
  ukDateTimeField,
  type AppraisalStatusCode,
  type EnquiryStageCode,
  type LettingServiceCode,
} from "@/core/enquiries/domain/enquiry";
import {
  APPRAISAL_STATUS_LABELS,
  ENQUIRY_STAGE_LABELS,
  LETTING_SERVICE_LABELS,
} from "@/core/enquiries/domain/enquiry-labels";
import { deriveLeadJourney } from "@/core/enquiries/domain/lead-journey";
import {
  findInstructionForEnquiry,
  listInstructionsForProperty,
} from "@/core/instructions/application/instruction-records";
import { isUuid } from "@/core/properties/domain/ids";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  dateStyle: "medium",
});
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
    created?: string | string[];
  }>;
}) {
  const { workspaceSlug, enquiryId } = await params;
  if (!isUuid(enquiryId)) notFound();
  const base = `/dashboard/w/${workspaceSlug}`;
  const listPath = `${base}/enquiries`;
  const path = `${listPath}/${enquiryId}`;
  const {
    user,
    data: [enquiry, context, settings, allAssignees, instruction],
  } = await requireMfaUserWith(path, { workspaceSlug }, (user) =>
    Promise.all([
      getEnquiry({ authSubject: user.id, workspaceSlug, enquiryId }),
      getWorkspaceAccessContext(user.id, workspaceSlug),
      listEnquirySettings({ authSubject: user.id, workspaceSlug }),
      listEnquiryAssignees({ authSubject: user.id, workspaceSlug }),
      findInstructionForEnquiry({
        authSubject: user.id,
        workspaceSlug,
        enquiryId,
      }),
    ]),
  );
  if (!context || !settings || !context.permissions.has("enquiry.read")) {
    redirect("/access-denied");
  }
  if (!enquiry) notFound();
  // Other instructions on this property, so a returning landlord's lead reads
  // as one story with the earlier instruction (ADR-035). The instruction made
  // from this lead is shown elsewhere.
  const otherInstructions = enquiry.propertyId
    ? (
        await listInstructionsForProperty({
          authSubject: user.id,
          workspaceSlug,
          propertyId: enquiry.propertyId,
        })
      ).filter((item) => item.id !== instruction?.id)
    : [];
  const query = await searchParams;
  const stage = enquiry.stage.toLowerCase() as EnquiryStageCode;
  const canUpdate = context.permissions.has("enquiry.update");
  const canReopen =
    context.permissions.has("enquiry.reopen") &&
    (stage === "lost" || stage === "postponed");
  const assignees = allAssignees.filter(
    ({ branchIds }) =>
      branchIds === null || branchIds.includes(enquiry.responsibleBranchId),
  );
  const openTasks = enquiry.tasks.filter(({ status }) => status === "OPEN");
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
  const latestCompleted = enquiry.appraisals.findLast(
    ({ status }) => status === "COMPLETED",
  );
  const assignedTo = enquiry.leadMembership
    ? staffName(enquiry.leadMembership.userIdentity)
    : null;
  const journey = deriveLeadJourney(stage);
  const linkClass = "text-primary underline-offset-4 hover:underline";

  // Names come from the colleagues already listed for this page, so someone
  // who has left the agency is shown without a name.
  const nameOf = (membershipId: string | null) =>
    allAssignees.find((item) => item.membershipId === membershipId)?.name;
  /** A timeline line that reads well with or without a name in front. */
  const by = (membershipId: string | null, text: string) => {
    const who = nameOf(membershipId);
    return who
      ? { who, text }
      : { text: text.charAt(0).toUpperCase() + text.slice(1) };
  };
  const timeline: TimelineEntry[] = [
    {
      key: "created",
      at: enquiry.createdAt,
      icon: Inbox,
      timed: true,
      ...by(enquiry.createdByMembershipId, "added the landlord lead"),
    },
    ...enquiry.stageHistory.map((item): TimelineEntry => {
      const from = item.fromStage.toLowerCase() as EnquiryStageCode;
      const to = item.toStage.toLowerCase() as EnquiryStageCode;
      return {
        key: `stage-${item.id}`,
        at: item.createdAt,
        icon: History,
        timed: true,
        note: item.reason ?? undefined,
        ...by(
          item.changedByMembershipId,
          `moved it from ${ENQUIRY_STAGE_LABELS[from]} to ${ENQUIRY_STAGE_LABELS[to]}`,
        ),
      };
    }),
    ...enquiry.tasks.flatMap((task): TimelineEntry[] => [
      {
        key: `task-added-${task.id}`,
        at: task.createdAt,
        icon: ListTodo,
        timed: true,
        ...by(
          task.createdByMembershipId,
          `added the next action "${task.title}"`,
        ),
      },
      ...(task.closedAt
        ? [
            {
              key: `task-closed-${task.id}`,
              at: task.closedAt,
              icon: task.status === "DONE" ? CheckCircle2 : XCircle,
              timed: true,
              ...by(
                task.closedByMembershipId,
                `${task.status === "DONE" ? "finished" : "cancelled"} "${task.title}"`,
              ),
            },
          ]
        : []),
    ]),
  ];

  const addTask = canUpdate && isOpenStage(stage) && (
    <AddEnquiryTask
      action={addEnquiryTaskAction.bind(null, workspaceSlug, enquiryId)}
      assignees={assignees}
      currentMembershipId={context.membership.id}
    />
  );
  const earliestTask = openTasks[0];
  const taskLine = earliestTask
    ? ` Next action: "${earliestTask.title}", due ${dateFormat.format(earliestTask.dueOn)}.`
    : "";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
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
      {query.created === "yes" && (
        <div
          className="rounded-lg bg-success-soft p-4 text-sm text-success"
          role="status"
        >
          Landlord lead created. Next step: book an appraisal or add a next
          action.
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
      <RecordHeader
        avatar={<Inbox className="size-5" />}
        title={enquiry.enquirerName}
        subtitle={[
          `Landlord lead ${enquiry.reference}`,
          address || "Property address not recorded",
          enquiry.responsibleBranch.name,
          assignedTo ? `Looked after by ${assignedTo}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        badges={
          <Badge variant={stageVariant(stage)}>
            {ENQUIRY_STAGE_LABELS[stage]}
          </Badge>
        }
        actions={
          <>
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
            {(canCloseFrom(stage) || canReopen) && (
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
                canReopen={canReopen}
                reasons={settings.outcomeReasons.filter(
                  ({ status }) => status === "active",
                )}
              />
            )}
          </>
        }
      >
        {journey && <JourneyBar steps={journey} />}
      </RecordHeader>

      {stage === "new_enquiry" && (
        <NextStepPanel
          title="Book the appraisal"
          description={`No appraisal is booked yet.${taskLine || " There is no next action either."}`}
          action={
            canUpdate && (
              <Button
                render={<Link href={`${path}/book-appraisal`} />}
                nativeButton={false}
              >
                <Plus aria-hidden="true" />
                Book appraisal
              </Button>
            )
          }
        />
      )}
      {stage === "appraisal_booked" && (
        <NextStepPanel
          title="Record the appraisal outcome"
          description={
            latestScheduled
              ? `The appraisal is booked for ${dateTimeFormat.format(latestScheduled.scheduledAt)}.${taskLine}`
              : undefined
          }
          action={
            canUpdate &&
            latestScheduled && (
              <AppraisalControls
                editAction={updateScheduledAppraisalAction.bind(
                  null,
                  workspaceSlug,
                  enquiryId,
                  latestScheduled.id,
                )}
                completeAction={completeAppraisalAction.bind(
                  null,
                  workspaceSlug,
                  enquiryId,
                  latestScheduled.id,
                )}
                finishAction={finishAppraisalAction.bind(
                  null,
                  workspaceSlug,
                  enquiryId,
                  latestScheduled.id,
                )}
                booking={{
                  scheduledAt: ukDateTimeField(latestScheduled.scheduledAt),
                  assignedMembershipId: latestScheduled.assignedMembershipId,
                  notes: latestScheduled.bookingNotes ?? "",
                }}
                assignees={assignees.map(({ membershipId, name }) => ({
                  membershipId,
                  name,
                }))}
              />
            )
          }
        />
      )}
      {stage === "appraisal_completed" && (
        <NextStepPanel
          title="Start the instruction"
          description={`The appraisal is complete${
            latestCompleted?.recommendedService
              ? ` and recommends ${LETTING_SERVICE_LABELS[latestCompleted.recommendedService.toLowerCase() as LettingServiceCode]}`
              : ""
          }.${taskLine}`}
          action={
            context.permissions.has("instruction.manage") &&
            canUpdate && (
              <Button
                render={<Link href={`${path}/start-instruction`} />}
                nativeButton={false}
              >
                <Handshake aria-hidden="true" />
                Start instruction
              </Button>
            )
          }
        />
      )}
      {stage === "won" && (
        <NextStepPanel
          title="This lead is won"
          description={
            instruction
              ? `Instruction ${instruction.reference} was started from this lead. The work carries on there.`
              : "An instruction was started from this lead."
          }
          action={
            instruction && (
              <Button
                render={
                  <Link href={`${base}/instructions/${instruction.id}`} />
                }
                nativeButton={false}
              >
                View instruction
                <ArrowRight aria-hidden="true" />
              </Button>
            )
          }
        />
      )}
      {(stage === "lost" || stage === "postponed") && (
        <NextStepPanel
          title={
            stage === "lost" ? "This lead is lost" : "This lead is postponed"
          }
          description={
            [
              enquiry.outcomeReason?.name,
              enquiry.outcomeNote,
              enquiry.followUpOn
                ? `Follow up on ${dateFormat.format(enquiry.followUpOn)}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined
          }
        />
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
          <OtherInstructions items={otherInstructions} workspacePath={base} />

          <SectionCard title="Next actions" action={addTask}>
            {openTasks.length ? (
              <ul className="grid divide-y">
                {openTasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium [overflow-wrap:anywhere]">
                        {task.title}
                      </p>
                      <p
                        className={`text-xs ${isOverdue(task.dueOn) ? "font-medium text-destructive" : "text-muted-foreground"}`}
                      >
                        Due {dateFormat.format(task.dueOn)}
                        {isOverdue(task.dueOn) && " · Overdue"}
                        {nameOf(task.assignedMembershipId)
                          ? ` · ${nameOf(task.assignedMembershipId)}`
                          : ""}
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
              <p className="text-sm text-muted-foreground">
                {!isOpenStage(stage)
                  ? "No open next actions."
                  : latestScheduled
                    ? "Nothing else is planned before the appraisal."
                    : "No open next action. Add one so this landlord lead is not forgotten."}
              </p>
            )}
          </SectionCard>

          <SectionCard title="Appraisals">
            {enquiry.appraisals.length ? (
              <ul className="grid divide-y">
                {enquiry.appraisals.map((appraisal) => {
                  const status =
                    appraisal.status.toLowerCase() as AppraisalStatusCode;
                  const service =
                    appraisal.recommendedService?.toLowerCase() as
                      LettingServiceCode | undefined;
                  return (
                    <li
                      key={appraisal.id}
                      className="grid gap-2 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">
                            {dateTimeFormat.format(appraisal.scheduledAt)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {[
                              nameOf(appraisal.assignedMembershipId),
                              service
                                ? LETTING_SERVICE_LABELS[service]
                                : status === "completed"
                                  ? "Recommendation not recorded"
                                  : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <Badge variant={appraisalVariant(status)}>
                          {APPRAISAL_STATUS_LABELS[status]}
                        </Badge>
                      </div>
                      {status === "completed" && (
                        <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                          {appraisal.expectedMonthlyRentPence
                            ? `Expected rent £${(appraisal.expectedMonthlyRentPence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2 })} pcm`
                            : "Expected rent not recorded"}
                          {appraisal.notes ? ` · ${appraisal.notes}` : ""}
                        </p>
                      )}
                      {appraisal.bookingNotes && (
                        <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                          Appointment note: {appraisal.bookingNotes}
                        </p>
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
          </SectionCard>

          <SectionCard title="Timeline">
            <Timeline entries={timeline} />
          </SectionCard>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
          <SectionCard title="Lead details">
            <KeyDetails
              items={[
                {
                  label: "Landlord",
                  value:
                    enquiry.contactId &&
                    context.permissions.has("contact.read") ? (
                      <Link
                        className={linkClass}
                        href={`${base}/contacts/${enquiry.contactId}`}
                      >
                        {enquiry.enquirerName}
                      </Link>
                    ) : (
                      enquiry.enquirerName
                    ),
                },
                {
                  label: "Telephone",
                  value: enquiry.enquirerTelephone ? (
                    <a
                      className={linkClass}
                      href={`tel:${enquiry.enquirerTelephone}`}
                    >
                      {enquiry.enquirerTelephone}
                    </a>
                  ) : null,
                },
                {
                  label: "Email",
                  value: enquiry.enquirerEmail ? (
                    <a
                      className={linkClass}
                      href={`mailto:${enquiry.enquirerEmail}`}
                    >
                      {enquiry.enquirerEmail}
                    </a>
                  ) : null,
                },
                {
                  label: "Property",
                  value:
                    address &&
                    enquiry.propertyId &&
                    context.permissions.has("property.read") ? (
                      <Link
                        className={linkClass}
                        href={`${base}/properties/${enquiry.propertyId}`}
                      >
                        {address}
                      </Link>
                    ) : (
                      address
                    ),
                },
                { label: "Branch", value: enquiry.responsibleBranch.name },
                {
                  label: "Looked after by",
                  value: assignedTo ?? "Nobody yet",
                },
                { label: "Source", value: enquiry.leadSource?.name },
                {
                  label: "Created",
                  value: dateTimeFormat.format(enquiry.createdAt),
                },
              ]}
            />
          </SectionCard>
          {enquiry.summary && (
            <SectionCard title="Summary">
              <p className="text-sm whitespace-pre-line [overflow-wrap:anywhere]">
                {enquiry.summary}
              </p>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
