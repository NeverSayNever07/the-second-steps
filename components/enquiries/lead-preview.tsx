"use client";

import { ArrowRight, Check, Mail, Phone, X } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import {
  addEnquiryTaskAction,
  completeEnquiryTaskAction,
  type EnquiryActionState,
} from "@/app/dashboard/w/[workspaceSlug]/enquiries/actions";
import type { EnquirySearchState } from "@/app/dashboard/w/[workspaceSlug]/enquiries/search-actions";
import { AddEnquiryTask } from "@/components/enquiries/enquiry-task-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isOpenStage, isOverdue } from "@/core/enquiries/domain/enquiry";
import { ENQUIRY_STAGE_LABELS } from "@/core/enquiries/domain/enquiry-labels";

export type PreviewLead = EnquirySearchState["result"]["items"][number];

export type PreviewAssignee = {
  membershipId: string;
  name: string;
  /** Null when the person works in every branch. */
  branchIds: string[] | null;
};

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  dateStyle: "medium",
});
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * A lead at a glance beside the list (ADR-039): contact, next action, who
 * looks after it and the latest summary, with the next action's controls. It
 * shows what the record page already shows, to the same people, and uses the
 * same actions for Done and Add next action.
 */
export function LeadPreview({
  lead,
  workspaceSlug,
  canWork,
  assignees,
  currentMembershipId,
  onChanged,
  onClose,
}: {
  lead: PreviewLead;
  workspaceSlug: string;
  canWork: boolean;
  assignees: PreviewAssignee[];
  currentMembershipId: string;
  /**
   * Called after something is saved, with a sentence saying what happened.
   * The list shows it and refreshes, since the lead may leave the view.
   */
  onChanged: (message: string) => void;
  onClose: () => void;
}) {
  const base = `/dashboard/w/${workspaceSlug}/enquiries`;
  const [pending, startTransition] = useTransition();
  const open = isOpenStage(lead.stage);
  const next = lead.nextAction;
  const overdue = next ? isOverdue(next.dueOn) : false;
  const colleagues = assignees.filter(
    (person) =>
      person.branchIds === null || person.branchIds.includes(lead.branch.id),
  );

  function done() {
    if (!next || next.kind !== "task") return;
    startTransition(async () => {
      await completeEnquiryTaskAction(workspaceSlug, lead.id, next.id);
      onChanged(`Marked "${next.title}" done for ${lead.enquirerName}.`);
    });
  }

  return (
    <aside
      aria-label={`Preview of ${lead.enquirerName}`}
      className="grid min-w-0 content-start gap-4 rounded-xl bg-card p-4 shadow-xs ring-1 ring-foreground/10 lg:sticky lg:top-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight [overflow-wrap:anywhere]">
            {lead.enquirerName}
          </h2>
          <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {[lead.address, lead.postcode].filter(Boolean).join(", ") ||
              "Address not recorded"}
          </p>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Close preview"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </Button>
      </div>

      {lead.telephone || lead.email ? (
        <div className="flex flex-wrap gap-2">
          {lead.telephone && (
            <Button
              size="sm"
              variant="outline"
              render={
                <a href={`tel:${lead.telephone.replace(/[^\d+]/g, "")}`} />
              }
              nativeButton={false}
            >
              <Phone aria-hidden="true" />
              {lead.telephone}
            </Button>
          )}
          {lead.email && (
            <Button
              size="sm"
              variant="outline"
              render={<a href={`mailto:${encodeURIComponent(lead.email)}`} />}
              nativeButton={false}
            >
              <Mail aria-hidden="true" />
              Email
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No telephone or email recorded.
        </p>
      )}

      <div className="grid gap-2 rounded-lg bg-muted p-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Next action
        </p>
        {next ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 text-sm">
              <span className="block font-medium [overflow-wrap:anywhere]">
                {next.title}
              </span>
              <span
                className={
                  overdue
                    ? "text-xs font-medium text-destructive"
                    : "text-xs text-muted-foreground"
                }
              >
                {next.kind === "appraisal"
                  ? dateTimeFormat.format(next.dueOn)
                  : `Due ${dateFormat.format(next.dueOn)}`}
                {overdue ? " · Overdue" : ""}
              </span>
            </p>
            {canWork && next.kind === "task" && (
              <Button size="sm" disabled={pending} onClick={done}>
                <Check aria-hidden="true" />
                {pending ? "Saving…" : "Done"}
              </Button>
            )}
          </div>
        ) : open ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-warning">No next action</p>
            {canWork && (
              <AddEnquiryTask
                action={async (
                  previous: EnquiryActionState,
                  data: FormData,
                ) => {
                  const result = await addEnquiryTaskAction(
                    workspaceSlug,
                    lead.id,
                    previous,
                    data,
                  );
                  if (result.status === "saved") {
                    onChanged(`Next action added for ${lead.enquirerName}.`);
                  }
                  return result;
                }}
                assignees={colleagues}
                currentMembershipId={currentMembershipId}
              />
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {lead.stage === "won"
              ? "Carries on as the instruction. Nothing to do here."
              : "Closed. Nothing to do here."}
          </p>
        )}
      </div>

      <dl className="grid gap-2 text-sm">
        {[
          ["Stage", ENQUIRY_STAGE_LABELS[lead.stage]],
          ["Looked after by", lead.lead?.name ?? "Nobody yet"],
          ["Source", lead.leadSource?.name ?? "Not recorded"],
          ["Branch", lead.branch.name],
          ["Reference", lead.reference],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium [overflow-wrap:anywhere]">
              {label === "Stage" ? (
                <Badge variant="secondary">{value}</Badge>
              ) : (
                value
              )}
            </dd>
          </div>
        ))}
      </dl>

      {lead.summary && (
        <p className="border-t pt-3 text-sm">
          <span className="block text-xs text-muted-foreground">Summary</span>
          <span className="[overflow-wrap:anywhere]">{lead.summary}</span>
        </p>
      )}

      <Button
        variant="outline"
        className="w-full"
        render={<Link href={`${base}/${lead.id}`} />}
        nativeButton={false}
      >
        Open full record
        <ArrowRight aria-hidden="true" />
      </Button>
    </aside>
  );
}
