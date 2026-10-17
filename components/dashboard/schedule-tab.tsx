import { FileText } from "lucide-react";
import Link from "next/link";
import {
  PLAN_HOURS,
  dueLabel,
  hourLabel,
  plannedLabel,
  ukHourOf,
} from "@/components/actions/work-item-format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TodaysSchedule } from "@/core/actions/application/schedule";
import type { WorkItem } from "@/core/actions/application/work-items";
import { Panel } from "./panel";
import { PlanPopover, UnplanButton } from "./schedule-controls";

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
});
const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour: "2-digit",
  minute: "2-digit",
});

type Entry =
  | { kind: "appraisal"; at: Date; id: string; name: string; href: string }
  | { kind: "action"; at: Date; item: WorkItem };

/** Today by the hour: appraisals are fixed, actions can be planned into free time. */
export function ScheduleTab({
  schedule,
  workspaceSlug,
  canPlan,
}: {
  schedule: TodaysSchedule;
  workspaceSlug: string;
  canPlan: boolean;
}) {
  const base = `/dashboard/w/${workspaceSlug}`;
  const entries: Entry[] = [
    ...schedule.appraisals.map((appraisal): Entry => ({
      kind: "appraisal",
      at: appraisal.scheduledAt,
      id: appraisal.id,
      name: appraisal.enquiry.name,
      href: `${base}/enquiries/${appraisal.enquiry.id}`,
    })),
    ...schedule.planned.map((item): Entry => ({
      kind: "action",
      at: item.plannedFor!,
      item,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  const inHour = (hour: number) =>
    entries.filter((entry) => ukHourOf(entry.at) === hour);
  const outside = entries.filter((entry) => {
    const hour = ukHourOf(entry.at);
    return hour < PLAN_HOURS[0] || hour > PLAN_HOURS[PLAN_HOURS.length - 1];
  });

  const renderEntry = (entry: Entry) =>
    entry.kind === "appraisal" ? (
      <li
        key={`a-${entry.id}`}
        className="flex items-center gap-2 rounded-lg bg-info-soft p-2"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-info">
            {timeFormat.format(entry.at)} · Appraisal
          </p>
          <p className="truncate text-xs text-muted-foreground">{entry.name}</p>
        </div>
        <Button
          size="xs"
          render={<Link href={entry.href} />}
          nativeButton={false}
        >
          <FileText aria-hidden="true" />
          Outcome
        </Button>
      </li>
    ) : (
      <li
        key={`w-${entry.item.id}`}
        className="flex items-center gap-2 rounded-lg bg-card p-2 ring-1 ring-foreground/10"
      >
        <span className="text-xs font-semibold tabular-nums text-muted-foreground">
          {plannedLabel(entry.at, schedule.today)}
        </span>
        <p className="min-w-0 flex-1 truncate text-sm">{entry.item.title}</p>
        {canPlan && (
          <UnplanButton
            workspaceSlug={workspaceSlug}
            item={{ source: entry.item.source, id: entry.item.id }}
            title={entry.item.title}
          />
        )}
      </li>
    );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <Panel
        title={dayFormat.format(new Date(`${schedule.today}T00:00:00Z`))}
        right={
          <span className="text-xs text-muted-foreground">
            Plan work from the list below or the Actions list
          </span>
        }
      >
        <ol className="grid gap-1 p-2">
          {PLAN_HOURS.map((hour) => {
            const here = inHour(hour);
            return (
              <li
                key={hour}
                className="grid grid-cols-[3rem_minmax(0,1fr)] gap-2"
              >
                <span className="pt-2 text-xs font-semibold tabular-nums text-muted-foreground">
                  {hourLabel(hour)}
                </span>
                {here.length ? (
                  <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
                    {here.map(renderEntry)}
                  </ul>
                ) : (
                  <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
                    Free
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {outside.length > 0 && (
          <div className="grid gap-1 p-2 pt-0">
            <p className="text-xs font-medium text-muted-foreground">
              Outside {hourLabel(PLAN_HOURS[0])} to{" "}
              {hourLabel(PLAN_HOURS[PLAN_HOURS.length - 1])}
            </p>
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
              {outside.map(renderEntry)}
            </ul>
          </div>
        )}
      </Panel>

      <Panel
        title="Waiting to be planned"
        right={<Badge variant="secondary">{schedule.unplanned.length}</Badge>}
      >
        {schedule.unplanned.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            Everything on your list has a time, or you have nothing open.
          </p>
        ) : (
          <ul className="divide-y">
            {schedule.unplanned.map((item) => {
              const due = dueLabel(item.dueOn, schedule.today);
              return (
                <li
                  key={`${item.source}-${item.id}`}
                  className="flex items-center gap-2 px-3 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
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
                      {item.enquiry && <span>{item.enquiry.name}</span>}
                    </p>
                  </div>
                  {canPlan && (
                    <PlanPopover
                      workspaceSlug={workspaceSlug}
                      item={{ source: item.source, id: item.id }}
                      title={item.title}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
