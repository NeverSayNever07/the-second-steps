"use client";

import { CheckCircle2, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  cancelWorkItemAction,
  handOverWorkItemAction,
  planWorkItemAction,
  snoozeWorkItemAction,
  type WorkItemResult,
} from "@/app/dashboard/w/[workspaceSlug]/work-item-actions";
import { PlanPopover } from "@/components/dashboard/schedule-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ActionFormOptions } from "@/core/actions/application/form-options";
import type { WorkItem } from "@/core/actions/application/work-items";
import { AddActionDialog } from "./add-action-dialog";
import { FinishActionDialog } from "./finish-action-dialog";
import { KIND_LABELS, dueLabel, plannedLabel } from "./work-item-format";
import { WorkItemMenu } from "./work-item-menu";

type Filter = "all" | "overdue" | "today";

/** Email for "email" and "send" work, otherwise a call; falls back to what exists. */
function contactLink(item: WorkItem) {
  const { telephone, email } = item.reach;
  const wantsEmail = item.kind === "email" || item.kind === "send";
  const useEmail = email && (wantsEmail || !telephone);
  if (useEmail) {
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

/**
 * The signed-in user's open work in due order, most overdue first. Without
 * `options` (a role that cannot change actions) the list is read-only.
 */
export function ActionsRail({
  workspaceSlug,
  items,
  today,
  options,
  currentMembershipId,
}: {
  workspaceSlug: string;
  items: WorkItem[];
  today: string;
  options: ActionFormOptions | null;
  currentMembershipId: string;
}) {
  const base = `/dashboard/w/${workspaceSlug}`;
  const [filter, setFilter] = useState<Filter>("all");
  const [finishing, setFinishing] = useState<WorkItem | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const counts: Record<Filter, number> = {
    all: items.length,
    overdue: items.filter(({ overdue }) => overdue).length,
    today: items.filter(({ dueOn }) => dueOn === today).length,
  };
  const shown = items.filter(
    (item) =>
      filter === "all" ||
      (filter === "overdue" ? item.overdue : item.dueOn === today),
  );

  function run(message: string, call: () => Promise<WorkItemResult>) {
    setNotice("");
    setError("");
    startTransition(async () => {
      const result = await call();
      if (result.ok) setNotice(message);
      else setError(result.message);
    });
  }

  return (
    <aside
      aria-labelledby="actions-heading"
      className="min-w-0 rounded-xl bg-card shadow-xs ring-1 ring-foreground/10 xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto"
    >
      <div className="sticky top-0 z-[1] grid gap-2 border-b bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 id="actions-heading" className="text-sm font-semibold">
            Actions
          </h2>
          <Badge variant="secondary" className="tabular-nums">
            {items.length}
          </Badge>
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
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Show"
        >
          {(
            [
              ["all", "All"],
              ["overdue", "Overdue"],
              ["today", "Today"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={filter === value ? "default" : "outline"}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
              {value !== "all" && (
                <span className="tabular-nums opacity-70">{counts[value]}</span>
              )}
            </Button>
          ))}
        </div>
        <div aria-live="polite" className="min-h-4 text-xs empty:hidden">
          {notice && <p className="text-success">{notice}</p>}
          {error && (
            <p className="text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          {items.length === 0
            ? "Nothing to do. Add an action to get started."
            : "Nothing here."}
        </p>
      ) : (
        <ul className="divide-y">
          {shown.map((item) => {
            const due = dueLabel(item.dueOn, today);
            const link = item.enquiry
              ? {
                  href: `${base}/enquiries/${item.enquiry.id}`,
                  label: item.enquiry.name,
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
            return (
              <li
                key={`${item.source}-${item.id}`}
                className={"flex items-start gap-2 px-3 py-2"}
              >
                {options && (
                  <Button
                    variant="outline"
                    size="icon-xs"
                    aria-label={`Finish ${item.title}`}
                    disabled={pending}
                    onClick={() => setFinishing(item)}
                    className="mt-0.5 rounded-full"
                  >
                    <CheckCircle2 aria-hidden="true" />
                  </Button>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
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
                  </p>
                  <div className="mt-0.5">
                    {item.plannedFor ? (
                      <Badge variant="info">
                        Planned {plannedLabel(item.plannedFor, today)}
                      </Badge>
                    ) : (
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
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center">
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
                  {options && !item.plannedFor && (
                    <PlanPopover
                      workspaceSlug={workspaceSlug}
                      item={itemRef}
                      title={item.title}
                    />
                  )}
                  {options && (
                    <WorkItemMenu
                      item={item}
                      options={options}
                      today={today}
                      disabled={pending}
                      onPlan={(hour) =>
                        run(
                          hour === null ? "Removed from plan." : "Planned.",
                          () =>
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
                          handOverWorkItemAction(
                            workspaceSlug,
                            itemRef,
                            membershipId,
                          ),
                        )
                      }
                      onCancel={() =>
                        run("Cancelled.", () =>
                          cancelWorkItemAction(workspaceSlug, itemRef),
                        )
                      }
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
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
    </aside>
  );
}
