"use client";

import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Mail,
  Phone,
  ShieldAlert,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  cancelWorkItemAction,
  handOverWorkItemAction,
  planWorkItemAction,
  snoozeWorkItemAction,
  type WorkItemResult,
} from "@/app/dashboard/w/[workspaceSlug]/work-item-actions";
import { AddActionDialog } from "@/components/actions/add-action-dialog";
import { FinishActionDialog } from "@/components/actions/finish-action-dialog";
import { KIND_LABELS } from "@/components/actions/work-item-format";
import { WorkItemMenu } from "@/components/actions/work-item-menu";
import { PlanPopover } from "@/components/dashboard/schedule-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ActionFormOptions } from "@/core/actions/application/form-options";
import type { WorkItem } from "@/core/actions/application/work-items";
import { COMPLIANCE_AREA_LABELS } from "@/core/compliance/domain/compliance-labels";
import { cn } from "cn";
import {
  DAY_GROUP_LABELS,
  groupDay,
  type DayGroup,
  type DayJob,
} from "./your-day-model";

/** Rows shown in a group before "Show more". */
const GROUP_ROWS = 8;

/** Email for "email" and "send" work, otherwise a call; falls back to what exists. */
function contactLink(item: WorkItem) {
  const { telephone, email } = item.reach;
  const wantsEmail = item.kind === "email" || item.kind === "send";
  if (email && (wantsEmail || !telephone)) {
    return {
      href: `mailto:${encodeURIComponent(email)}`,
      label: `Email about ${item.title}`,
      Icon: Mail,
    };
  }
  if (telephone) {
    return {
      href: `tel:${telephone.replace(/[^\d+]/g, "")}`,
      label: `Call about ${item.title}`,
      Icon: Phone,
    };
  }
  return null;
}

function actionIcon(item: WorkItem): LucideIcon {
  if (item.kind === "email" || item.kind === "send") return Mail;
  if (item.kind === "call" || item.kind === "chase") return Phone;
  return ClipboardList;
}

function iconFor(job: DayJob): LucideIcon {
  switch (job.type) {
    case "action":
      return actionIcon(job.item);
    case "appraisal":
      return CalendarClock;
    case "compliance":
      return ShieldAlert;
    case "enquiry":
      return UserRound;
  }
}

/**
 * The signed-in person's day (ADR-039): what needs them now, today and this
 * week, each with one action, and everything else under Later. Without
 * `options` (a role that cannot change actions) the list is read-only.
 */
export function YourDay({
  workspaceSlug,
  jobs,
  today,
  options,
  currentMembershipId,
  moreCompliance,
}: {
  workspaceSlug: string;
  jobs: DayJob[];
  today: string;
  options: ActionFormOptions | null;
  currentMembershipId: string;
  /** Compliance areas needing attention that the short list does not show. */
  moreCompliance: number;
}) {
  const base = `/dashboard/w/${workspaceSlug}`;
  const groups = groupDay(jobs);
  // A long backlog stays scannable: each group shows its first few rows.
  const [expanded, setExpanded] = useState<DayGroup[]>([]);
  const [finishing, setFinishing] = useState<WorkItem | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function run(message: string, call: () => Promise<WorkItemResult>) {
    setNotice("");
    setError("");
    startTransition(async () => {
      const result = await call();
      if (result.ok) setNotice(message);
      else setError(result.message);
    });
  }

  function actionRow(job: DayJob & { type: "action" }, group: DayGroup) {
    const { item } = job;
    const link = item.enquiry
      ? {
          href: `${base}/enquiries/${item.enquiry.id}`,
          label: item.enquiry.name,
        }
      : item.applicant
        ? {
            href: `${base}/applicants/${item.applicant.id}`,
            label: item.applicant.name,
          }
        : item.contact
          ? {
              href: `${base}/contacts/${item.contact.id}`,
              label: item.contact.name,
            }
          : item.property
            ? {
                href: `${base}/properties/${item.property.id}`,
                label: item.property.addressLine,
              }
            : null;
    const mine = item.assignee.membershipId === currentMembershipId;
    const contact = contactLink(item);
    const itemRef = { source: item.source, id: item.id };
    return {
      title: item.title,
      context: (
        <>
          {link && (
            <Link
              href={link.href}
              className="truncate hover:text-primary hover:underline"
            >
              {link.label}
            </Link>
          )}
          {item.kind && <span>{KIND_LABELS[item.kind]}</span>}
          {!mine && <span>For {item.assignee.name}</span>}
        </>
      ),
      actions: (
        <>
          {contact && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={contact.label}
              render={<a href={contact.href} />}
              nativeButton={false}
            >
              <contact.Icon aria-hidden="true" />
            </Button>
          )}
          {options &&
            !item.plannedFor &&
            (group === "now" || group === "today") && (
              <PlanPopover
                workspaceSlug={workspaceSlug}
                item={itemRef}
                title={item.title}
              />
            )}
          {options && (
            <Button
              size="sm"
              variant={group === "now" ? "default" : "outline"}
              aria-label={`Finish ${item.title}`}
              disabled={pending}
              onClick={() => setFinishing(item)}
            >
              <CheckCircle2 aria-hidden="true" />
              Done
            </Button>
          )}
          {options && (
            <WorkItemMenu
              item={item}
              options={options}
              today={today}
              disabled={pending}
              onPlan={(hour) =>
                run(hour === null ? "Removed from plan." : "Planned.", () =>
                  planWorkItemAction(workspaceSlug, itemRef, hour),
                )
              }
              onSnooze={(dueOn) =>
                run("Snoozed.", () =>
                  snoozeWorkItemAction(workspaceSlug, itemRef, dueOn),
                )
              }
              onHandOver={(membershipId) =>
                run("Handed over.", () =>
                  handOverWorkItemAction(workspaceSlug, itemRef, membershipId),
                )
              }
              onCancel={() =>
                run("Cancelled.", () =>
                  cancelWorkItemAction(workspaceSlug, itemRef),
                )
              }
            />
          )}
        </>
      ),
    };
  }

  function rowParts(job: DayJob, group: DayGroup) {
    switch (job.type) {
      case "action":
        return actionRow(job, group);
      case "appraisal":
        return {
          title: `Appraisal with ${job.enquiry.name}`,
          context: <span>Landlord lead</span>,
          actions: (
            <Button
              size="sm"
              variant={group === "now" ? "default" : "outline"}
              render={<Link href={`${base}/enquiries/${job.enquiry.id}`} />}
              nativeButton={false}
            >
              Outcome
            </Button>
          ),
        };
      case "compliance":
        return {
          title: `${COMPLIANCE_AREA_LABELS[job.item.area]}: ${job.item.property}`,
          context: <span>Property compliance</span>,
          actions: (
            <Button
              size="sm"
              variant={group === "now" ? "default" : "outline"}
              render={
                <Link
                  href={`${base}/properties/${job.item.propertyId}?tab=compliance`}
                />
              }
              nativeButton={false}
            >
              Open
            </Button>
          ),
        };
      case "enquiry":
        return {
          title: `${job.applicant.name} asked about ${job.address}`,
          context: <span>Property enquiry · new</span>,
          actions: (
            <Button
              size="sm"
              variant={group === "now" ? "default" : "outline"}
              render={<Link href={`${base}/property-enquiries`} />}
              nativeButton={false}
            >
              Open
            </Button>
          ),
        };
    }
  }

  function renderRow(job: DayJob, group: DayGroup) {
    const Icon = iconFor(job);
    const { title, context, actions } = rowParts(job, group);
    return (
      <li
        key={job.key}
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-2 border-l-2 px-3 py-2.5",
          job.urgent ? "border-l-destructive" : "border-l-transparent",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-full",
            job.urgent
              ? "bg-destructive-soft text-destructive"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1 basis-48">
          <p className="text-sm font-medium [overflow-wrap:anywhere]">
            {title}
          </p>
          <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            {context}
          </p>
        </div>
        <Badge variant={job.badge.variant} className="whitespace-nowrap">
          {job.badge.text}
        </Badge>
        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      </li>
    );
  }

  const shown = groups.now.length + groups.today.length + groups.week.length;

  return (
    <section
      aria-labelledby="your-day-heading"
      className="grid min-w-0 content-start gap-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="your-day-heading" className="text-base font-semibold">
          Your day
        </h2>
        {options && (
          <span className="ml-auto">
            <AddActionDialog
              workspaceSlug={workspaceSlug}
              options={options}
              today={today}
            />
          </span>
        )}
      </div>
      <div aria-live="polite" className="text-sm empty:hidden">
        {notice && <p className="text-success">{notice}</p>}
        {error && (
          <p className="text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
      {shown === 0 && (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Nothing needs you right now.
          {options ? " Add an action to plan ahead." : ""}
        </p>
      )}
      {(["now", "today", "week"] as const).map((group) => {
        if (groups[group].length === 0) return null;
        const all = expanded.includes(group);
        const hidden = groups[group].length - GROUP_ROWS;
        return (
          <div key={group} className="grid gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {DAY_GROUP_LABELS[group]}
            </h3>
            <ul className="grid divide-y overflow-hidden rounded-xl bg-card shadow-xs ring-1 ring-foreground/10">
              {(all ? groups[group] : groups[group].slice(0, GROUP_ROWS)).map(
                (job) => renderRow(job, group),
              )}
            </ul>
            {hidden > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="w-fit"
                aria-expanded={all}
                onClick={() =>
                  setExpanded((list) =>
                    all ? list.filter((g) => g !== group) : [...list, group],
                  )
                }
              >
                {all ? "Show fewer" : `Show ${hidden} more`}
              </Button>
            )}
            {group === "now" && moreCompliance > 0 && (
              <p className="text-xs text-muted-foreground">
                and {moreCompliance} more compliance{" "}
                {moreCompliance === 1 ? "date" : "dates"} to look at. Open a
                property to see its compliance.
              </p>
            )}
          </div>
        );
      })}
      {groups.later.length > 0 && (
        <details className="group grid gap-2">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <ChevronRight
              aria-hidden="true"
              className="size-3.5 transition-transform group-open:rotate-90"
            />
            Later ({groups.later.length})
          </summary>
          <ul className="grid divide-y overflow-hidden rounded-xl bg-card shadow-xs ring-1 ring-foreground/10">
            {groups.later.map((job) => renderRow(job, "later"))}
          </ul>
        </details>
      )}
      {finishing && options && (
        <FinishActionDialog
          workspaceSlug={workspaceSlug}
          item={finishing}
          options={options}
          today={today}
          onClose={() => setFinishing(null)}
          onFinished={(message) => {
            setFinishing(null);
            setNotice(message);
            setError("");
          }}
        />
      )}
    </section>
  );
}
