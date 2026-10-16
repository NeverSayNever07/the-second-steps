import Link from "next/link";
import {
  assignEnquiryLeadAction,
  closeEnquiryAction,
  reopenEnquiryAction,
} from "@/app/dashboard/w/[workspaceSlug]/enquiries/actions";
import { dueLabel } from "@/components/actions/work-item-format";
import { EnquiryStageActions } from "@/components/enquiries/enquiry-stage-actions";
import { Badge } from "@/components/ui/badge";
import type { listEnquiries } from "@/core/enquiries/application/enquiries";
import { OPEN_STAGES } from "@/core/enquiries/domain/enquiry";
import { ENQUIRY_STAGE_LABELS } from "@/core/enquiries/domain/enquiry-labels";
import { LeadAssign } from "./lead-assign";

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
}) {
  const leadsPath = `/dashboard/w/${workspaceSlug}/enquiries`;
  return (
    <div className="grid gap-8">
      {OPEN_STAGES.map((stage) => {
        const inStage = leads.filter((lead) => lead.stage === stage);
        return (
          <section
            key={stage}
            aria-labelledby={`stage-${stage}`}
            className="grid gap-3"
          >
            <h2 id={`stage-${stage}`} className="text-base font-semibold">
              {ENQUIRY_STAGE_LABELS[stage]}{" "}
              <span className="font-normal text-muted-foreground">
                {inStage.length}
              </span>
            </h2>
            {inStage.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No landlord leads at this stage.
              </p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {inStage.map((lead) => {
                  const due = lead.nextAction
                    ? dueLabel(
                        lead.nextAction.dueOn.toISOString().slice(0, 10),
                        today,
                      )
                    : null;
                  return (
                    <li
                      key={lead.id}
                      className="grid min-w-0 content-between gap-3 rounded-xl border bg-card p-4"
                    >
                      <div className="grid min-w-0 gap-1.5">
                        <Link
                          href={`${leadsPath}/${lead.id}`}
                          className="truncate font-medium hover:text-primary hover:underline"
                        >
                          {lead.enquirerName}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {[lead.address, lead.postcode]
                            .filter(Boolean)
                            .join(", ") || "No address yet"}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          {lead.lead ? (
                            <span className="text-muted-foreground">
                              {lead.lead.name}
                            </span>
                          ) : (
                            <Badge variant="warning">Nobody assigned</Badge>
                          )}
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
                        </div>
                        {lead.appraisal && (
                          <p className="text-xs text-muted-foreground">
                            Appraisal{" "}
                            {appraisalFormat.format(lead.appraisal.scheduledAt)}
                          </p>
                        )}
                      </div>
                      {canWork && (
                        <div className="flex flex-wrap gap-2">
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
                          <EnquiryStageActions
                            compact
                            canClose
                            canWin={stage === "appraisal_completed"}
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
          </section>
        );
      })}
    </div>
  );
}
