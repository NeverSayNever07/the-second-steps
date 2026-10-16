"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  cancelWorkItemAction,
  handOverWorkItemAction,
  snoozeWorkItemAction,
  type WorkItemResult,
} from "@/app/dashboard/w/[workspaceSlug]/work-item-actions";
import { Badge } from "@/components/ui/badge";
import { cn } from "cn";
import type { ActionFormOptions } from "@/core/actions/application/form-options";
import type { WorkItem } from "@/core/actions/application/work-items";
import { AddActionDialog } from "./add-action-dialog";
import { FinishActionDialog } from "./finish-action-dialog";
import { KIND_LABELS, dueLabel } from "./work-item-format";
import { WorkItemMenu } from "./work-item-menu";

type Filter = "all" | "overdue" | "today";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Today" },
];

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

  const overdueCount = items.filter(({ overdue }) => overdue).length;
  const todayCount = items.filter(({ dueOn }) => dueOn === today).length;
  const counts: Record<Filter, number> = {
    all: items.length,
    overdue: overdueCount,
    today: todayCount,
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
    <section aria-labelledby="actions-heading" className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="actions-heading" className="text-base font-semibold">
            Actions
          </h2>
          <p className="text-xs text-muted-foreground">
            Your work, most overdue first.
          </p>
        </div>
        {options && (
          <AddActionDialog
            workspaceSlug={workspaceSlug}
            options={options}
            today={today}
          />
        )}
      </div>
      <div className="flex gap-1.5" role="group" aria-label="Filter actions">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-muted",
            )}
          >
            {label} {counts[value]}
          </button>
        ))}
      </div>
      <div aria-live="polite" className="min-h-4 text-xs">
        {notice && <p className="text-success">{notice}</p>}
        {error && (
          <p className="text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {items.length === 0
            ? "Nothing to do. Add an action to get started."
            : "Nothing matches this filter."}
        </p>
      ) : (
        <ul className="grid divide-y rounded-xl border bg-card">
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
            return (
              <li key={`${item.source}-${item.id}`} className="flex gap-3 p-3">
                {options && (
                  <button
                    type="button"
                    aria-label={`Finish ${item.title}`}
                    disabled={pending}
                    onClick={() => setFinishing(item)}
                    className="group mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-muted-foreground/50 hover:border-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
                  >
                    <Check
                      aria-hidden="true"
                      className="size-3.5 text-primary opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                    />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium">
                    {item.title}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
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
                    {item.kind && <span>{KIND_LABELS[item.kind]}</span>}
                    {link && (
                      <Link
                        href={link.href}
                        className="max-w-full truncate text-foreground hover:text-primary hover:underline"
                      >
                        {link.label}
                      </Link>
                    )}
                    {!mine && <span>For {item.assignee.name}</span>}
                  </div>
                </div>
                {options && (
                  <WorkItemMenu
                    item={item}
                    options={options}
                    today={today}
                    disabled={pending}
                    onSnooze={(dueOn) =>
                      run("Snoozed.", () =>
                        snoozeWorkItemAction(
                          workspaceSlug,
                          { source: item.source, id: item.id },
                          dueOn,
                        ),
                      )
                    }
                    onHandOver={(membershipId) =>
                      run("Handed over.", () =>
                        handOverWorkItemAction(
                          workspaceSlug,
                          { source: item.source, id: item.id },
                          membershipId,
                        ),
                      )
                    }
                    onCancel={() =>
                      run("Cancelled.", () =>
                        cancelWorkItemAction(workspaceSlug, {
                          source: item.source,
                          id: item.id,
                        }),
                      )
                    }
                  />
                )}
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
    </section>
  );
}
