import { Handshake } from "lucide-react";
import Link from "next/link";
import {
  assignEnquiryLeadAction,
  closeEnquiryAction,
  reopenEnquiryAction,
} from "@/app/dashboard/w/[workspaceSlug]/enquiries/actions";
import { dueLabel } from "@/components/actions/work-item-format";
import { EnquiryStageActions } from "@/components/enquiries/enquiry-stage-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { listEnquiries } from "@/core/enquiries/application/enquiries";
import { OPEN_STAGES } from "@/core/enquiries/domain/enquiry";
import { ENQUIRY_STAGE_LABELS } from "@/core/enquiries/domain/enquiry-labels";
import { cn } from "cn";
import { LeadAssign } from "./lead-assign";
import { Avatar, Panel } from "./panel";

type Lead = Awaited<ReturnType<typeof listEnquiries>>[number];

// Appraisal times are real moments, shown in UK time.
const appraisalFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const WAITING_WARNING_DAYS = 4;
const WAITING_ALERT_DAYS = 7;

/**
 * Open landlord leads by stage. A lead moves on through its appraisal (book,
 * then complete) on its own page; the board assigns and records outcomes.
 */
export function PipelineTab({
  leads,
  workspaceSlug,
  today,
  canWork,
  assignees,
  reasons,
  now = new Date(),
}: {
  leads: Lead[];
  workspaceSlug: string;
  today: string;
  canWork: boolean;
  assignees: readonly {
    membershipId: string;
    name: string;
    branchIds: readonly string[] | null;
  }[];
  reasons: readonly {
    id: string;
    name: string;
    appliesTo: "lost" | "postponed" | "both";
  }[];
  now?: Date;
}) {
  const leadsPath = `/dashboard/w/${workspaceSlug}/enquiries`;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 2xl:grid-cols-3">
      {OPEN_STAGES.map((stage) => {
        const inStage = leads.filter((lead) => lead.stage === stage);
        return (
          <Panel
            key={stage}
            title={ENQUIRY_STAGE_LABELS[stage]}
            right={<Badge variant="secondary">{inStage.length}</Badge>}
          >
            {inStage.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                No landlord leads at this stage.
              </p>
            ) : (
              <ul className="divide-y">
                {inStage.map((lead) => {
                  const days = Math.floor(
                    (now.getTime() - lead.stageChangedAt.getTime()) /
                      86_400_000,
                  );
                  const due = lead.nextAction
                    ? dueLabel(
                        lead.nextAction.dueOn.toISOString().slice(0, 10),
                        today,
                      )
                    : null;
                  return (
                    <li key={lead.id} className="grid gap-2 px-3 py-1.5">
                      <div className="flex items-start gap-2">
                        {lead.lead ? (
                          <Avatar name={lead.lead.name} className="mt-0.5" />
                        ) : (
                          <Badge variant="warning" className="mt-0.5">
                            Nobody
                          </Badge>
                        )}
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`${leadsPath}/${lead.id}`}
                            className="block truncate text-sm font-medium hover:text-primary hover:underline"
                          >
                            {lead.enquirerName}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">
                            {[lead.address, lead.postcode]
                              .filter(Boolean)
                              .join(", ") || "No address yet"}
                          </p>
                        </div>
                        {days >= WAITING_WARNING_DAYS && (
                          <Badge
                            variant={
                              days >= WAITING_ALERT_DAYS
                                ? "destructive"
                                : "warning"
                            }
                          >
                            {days}d
                          </Badge>
                        )}
                      </div>
                      <div
                        className={cn(
                          "flex flex-wrap items-center gap-1.5 text-xs",
                          "pl-8",
                        )}
                      >
                        {lead.nextAction && due ? (
                          <>
                            <Badge
                              variant={
                                due.tone === "overdue"
                                  ? "destructive"
                                  : due.tone === "today"
                                    ? "warning"
                                    : "secondary"
                              }
                            >
                              {due.text}
                            </Badge>
                            <span className="truncate text-muted-foreground">
                              {lead.nextAction.title}
                            </span>
                          </>
                        ) : (
                          <Badge variant="warning">No next action</Badge>
                        )}
                        {lead.appraisal && (
                          <span className="text-muted-foreground">
                            Appraisal{" "}
                            {appraisalFormat.format(lead.appraisal.scheduledAt)}
                          </span>
                        )}
                      </div>
                      {canWork && (
                        <div className="flex flex-wrap gap-1.5 pl-8">
                          <LeadAssign
                            leadName={lead.enquirerName}
                            currentMembershipId={
                              lead.lead?.membershipId ?? null
                            }
                            people={assignees.filter(
                              ({ branchIds }) =>
                                branchIds === null ||
                                branchIds.includes(lead.branch.id),
                            )}
                            onAssign={assignEnquiryLeadAction.bind(
                              null,
                              workspaceSlug,
                              lead.id,
                            )}
                          />
                          {stage === "appraisal_completed" && (
                            <Button
                              size="xs"
                              render={
                                <Link
                                  href={`/dashboard/w/${workspaceSlug}/enquiries/${lead.id}/start-instruction`}
                                />
                              }
                              nativeButton={false}
                            >
                              <Handshake aria-hidden="true" />
                              Start instruction
                            </Button>
                          )}
                          <EnquiryStageActions
                            compact
                            canClose
                            canReopen={false}
                            reasons={reasons}
                            closeAction={closeEnquiryAction.bind(
                              null,
                              workspaceSlug,
                              lead.id,
                            )}
                            reopenAction={reopenEnquiryAction.bind(
                              null,
                              workspaceSlug,
                              lead.id,
                            )}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
