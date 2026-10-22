"use client";

import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Move,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type DragEvent } from "react";
import { moveCalendarEntryAction } from "@/app/dashboard/w/[workspaceSlug]/calendar-actions";
import { AddActionDialog } from "@/components/actions/add-action-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/ui/option-select";
import type { ActionFormOptions } from "@/core/actions/application/form-options";
import type { CalendarEntry } from "@/core/actions/application/calendar";
import {
  addCalendarDays,
  type CalendarScope,
  type CalendarView,
} from "@/core/actions/domain/calendar";
import { cn } from "cn";

type BrowserEntry = Omit<CalendarEntry, "startsAt"> & { startsAt: string };

const VIEWS: readonly { value: CalendarView; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

const SCOPES: readonly { value: CalendarScope; label: string }[] = [
  { value: "mine", label: "My calendar" },
  { value: "branch", label: "Branch calendar" },
];

const dateParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dayFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
});
const rangeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function dateOf(instant: string): string {
  const parts = dateParts.formatToParts(new Date(instant));
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function displayDay(date: string): string {
  return dayFormat.format(new Date(`${date}T12:00:00.000Z`));
}

function hourOf(instant: string): number {
  return Number(timeFormat.format(new Date(instant)).slice(0, 2));
}

function localDateTime(instant: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function CalendarEntryLink({
  entry,
  isMine,
  onMove,
  onDragStart,
}: {
  entry: BrowserEntry;
  isMine: boolean;
  onMove: (entry: BrowserEntry) => void;
  onDragStart: (event: DragEvent, entry: BrowserEntry) => void;
}) {
  return (
    <div
      draggable={entry.canMove}
      onDragStart={(event) => onDragStart(event, entry)}
      className={cn(
        "group flex min-w-0 items-start gap-1 rounded-md border p-1 transition-colors",
        isMine
          ? "border-primary/45 bg-primary/15 hover:bg-primary/20"
          : "border-border bg-muted/60 hover:bg-muted",
      )}
    >
      <Link
        href={entry.href}
        className="min-w-0 flex-1 rounded px-1 py-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="block truncate text-xs font-semibold">
          {timeFormat.format(new Date(entry.startsAt))} · {entry.title}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {entry.detail} · {entry.assignee.name}
        </span>
      </Link>
      {entry.canMove && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Move ${entry.title}`}
          onClick={() => onMove(entry)}
        >
          <Move aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}

export function CalendarTab({
  workspacePath,
  workspaceSlug,
  today,
  anchor,
  view,
  scope,
  from,
  to,
  branchId,
  membershipId,
  currentMembershipId,
  addDateTime,
  entries,
  branches,
  people,
  actionOptions,
}: {
  workspacePath: string;
  workspaceSlug: string;
  today: string;
  anchor: string;
  view: CalendarView;
  scope: CalendarScope;
  from: string;
  to: string;
  branchId?: string;
  membershipId?: string;
  currentMembershipId: string;
  addDateTime?: string;
  entries: BrowserEntry[];
  branches: { id: string; name: string }[];
  people: { membershipId: string; name: string }[];
  actionOptions: ActionFormOptions | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showFullDay, setShowFullDay] = useState(false);
  const [dragged, setDragged] = useState<BrowserEntry | null>(null);
  const [move, setMove] = useState<{
    entry: BrowserEntry;
    proposed: string;
  } | null>(null);
  const [moveError, setMoveError] = useState("");
  const days = useMemo(() => {
    const result: string[] = [];
    let date = from;
    while (date <= to) {
      result.push(date);
      date = addCalendarDays(date, 1);
    }
    return result;
  }, [from, to]);

  function href(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams({
      tab: "calendar",
      view,
      date: anchor,
      scope,
    });
    if (branchId) {
      params.set("branch", branchId);
    }
    if (membershipId) {
      params.set("person", membershipId);
    }
    for (const [key, value] of Object.entries(overrides)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    return `${workspacePath}?${params.toString()}`;
  }

  const step = view === "day" ? 1 : view === "week" ? 7 : 28;
  const heading =
    from === to
      ? rangeFormat.format(new Date(`${from}T12:00:00.000Z`))
      : `${rangeFormat.format(new Date(`${from}T12:00:00.000Z`))} – ${rangeFormat.format(new Date(`${to}T12:00:00.000Z`))}`;
  const dayEntries = entries.filter(
    (entry) => dateOf(entry.startsAt) === anchor,
  );
  const hiddenCount = dayEntries.filter((entry) => {
    const hour = hourOf(entry.startsAt);
    return hour < 7 || hour >= 21;
  }).length;
  const hours = showFullDay
    ? Array.from({ length: 24 }, (_, hour) => hour)
    : Array.from({ length: 14 }, (_, index) => index + 7);

  function onMove(entry: BrowserEntry) {
    setMoveError("");
    setMove({ entry, proposed: localDateTime(entry.startsAt) });
  }

  function onDragStart(event: DragEvent, entry: BrowserEntry) {
    if (!entry.canMove) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    setDragged(entry);
  }

  function onDrop(event: DragEvent, date: string, hour: number) {
    event.preventDefault();
    if (!dragged) {
      return;
    }
    setMoveError("");
    setMove({
      entry: dragged,
      proposed: `${date}T${String(hour).padStart(2, "0")}:00`,
    });
    setDragged(null);
  }

  function confirmMove() {
    if (!move) {
      return;
    }
    setMoveError("");
    startTransition(async () => {
      const result = await moveCalendarEntryAction(
        workspaceSlug,
        {
          source: move.entry.source,
          id: move.entry.id,
          enquiryId: move.entry.enquiryId,
        },
        move.proposed,
      );
      if (!result.ok) {
        setMoveError(result.message);
        return;
      }
      setMove(null);
      router.refresh();
    });
  }

  return (
    <section className="grid min-w-0 gap-4" aria-labelledby="calendar-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="calendar-heading" className="text-xl font-semibold">
            Calendar
          </h2>
          <p className="text-sm text-muted-foreground">{heading}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            render={<Link href={href({ date: today })} />}
          >
            <RotateCcw aria-hidden="true" />
            Today
          </Button>
          {actionOptions && (
            <AddActionDialog
              key={addDateTime ?? `${anchor}T09:00`}
              workspaceSlug={workspaceSlug}
              options={actionOptions}
              today={anchor}
              initialPlannedFor={addDateTime ?? `${anchor}T09:00`}
              triggerLabel="Add timed action"
              initialOpen={Boolean(addDateTime)}
              onOpenChange={(open) => {
                if (!open && addDateTime) {
                  router.replace(href({ add: undefined }));
                }
              }}
            />
          )}
          <Button
            size="sm"
            render={
              <Link href={`${workspacePath}/enquiries?intent=book-appraisal`} />
            }
          >
            <CalendarPlus aria-hidden="true" />
            Book appraisal
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-y py-3">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={`Previous ${view}`}
            render={
              <Link href={href({ date: addCalendarDays(anchor, -step) })} />
            }
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Input
            aria-label="Jump to date"
            type="date"
            value={anchor}
            onChange={(event) =>
              router.push(href({ date: event.target.value }))
            }
            className="w-40"
          />
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={`Next ${view}`}
            render={
              <Link href={href({ date: addCalendarDays(anchor, step) })} />
            }
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex rounded-lg border p-0.5"
            aria-label="Calendar scope"
          >
            {SCOPES.map((item) => (
              <Button
                key={item.value}
                size="sm"
                variant={scope === item.value ? "secondary" : "ghost"}
                render={
                  <Link
                    href={href({
                      scope: item.value,
                      branch: undefined,
                      person: undefined,
                    })}
                    aria-current={scope === item.value ? "page" : undefined}
                  />
                }
              >
                {item.label}
              </Button>
            ))}
          </div>
          <div
            className="flex rounded-lg border p-0.5"
            aria-label="Calendar view"
          >
            {VIEWS.map((item) => (
              <Button
                key={item.value}
                size="sm"
                variant={view === item.value ? "secondary" : "ghost"}
                render={
                  <Link
                    href={href({ view: item.value })}
                    aria-current={view === item.value ? "page" : undefined}
                  />
                }
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {scope === "branch" && (branches.length > 1 || people.length > 1) && (
        <div className="grid gap-3 md:grid-cols-2">
          {branches.length > 1 && (
            <div>
              <Label htmlFor="calendar-branch" className="sr-only">
                Branch
              </Label>
              <OptionSelect
                id="calendar-branch"
                value={branchId ?? "all"}
                onValueChange={(value) =>
                  router.push(
                    href({ branch: value === "all" ? undefined : value }),
                  )
                }
                options={[
                  { value: "all", label: "All permitted branches" },
                  ...branches.map((branch) => ({
                    value: branch.id,
                    label: branch.name,
                  })),
                ]}
              />
            </div>
          )}
          {people.length > 1 && (
            <div>
              <Label htmlFor="calendar-colleague" className="sr-only">
                Colleague
              </Label>
              <OptionSelect
                id="calendar-colleague"
                value={membershipId ?? "all"}
                onValueChange={(value) =>
                  router.push(
                    href({ person: value === "all" ? undefined : value }),
                  )
                }
                options={[
                  { value: "all", label: "All permitted colleagues" },
                  ...people.map((person) => ({
                    value: person.membershipId,
                    label: person.name,
                  })),
                ]}
              />
            </div>
          )}
        </div>
      )}

      {scope === "branch" && (
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-sm border border-primary/45 bg-primary/15"
            />
            Your appointments
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-sm border bg-muted/60"
            />
            Colleagues&apos; appointments
          </span>
        </div>
      )}

      {entries.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Clock3
            aria-hidden="true"
            className="mx-auto mb-2 size-5 text-muted-foreground"
          />
          <p className="font-medium">Nothing scheduled in this range</p>
          <p className="text-sm text-muted-foreground">
            Timed actions and booked appraisals will appear here.
          </p>
        </div>
      )}

      {entries.length > 0 && view === "day" && (
        <div className="overflow-hidden rounded-lg border">
          <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b bg-background px-3 py-2">
            <span className="text-sm text-muted-foreground">
              Showing {showFullDay ? "the full day" : "07:00 to 21:00"}
              {!showFullDay && hiddenCount > 0
                ? ` · ${hiddenCount} outside these hours`
                : ""}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFullDay((value) => !value)}
            >
              {showFullDay ? "Show usual hours" : "Show early and late hours"}
            </Button>
          </div>
          <div className="max-h-[42rem] overflow-y-auto">
            {hours.map((hour) => {
              const atHour = dayEntries.filter(
                (entry) => hourOf(entry.startsAt) === hour,
              );
              const hasAppointments = atHour.length > 0;
              const rowClassName = cn(
                "grid grid-cols-[4.5rem_minmax(0,1fr)] border-b last:border-b-0",
                hasAppointments ? "min-h-16" : "min-h-9",
              );
              const timeClassName = cn(
                "border-r px-3 text-xs text-muted-foreground",
                hasAppointments ? "py-2" : "py-1.5",
              );
              const slotClassName = cn(
                "grid content-start gap-1.5",
                hasAppointments ? "p-1.5" : "p-1",
              );
              return (
                <div key={hour} className={rowClassName}>
                  <time className={timeClassName}>
                    {String(hour).padStart(2, "0")}:00
                  </time>
                  <div
                    className={slotClassName}
                    data-calendar-drop-time={`${anchor}T${String(hour).padStart(2, "0")}:00`}
                    onDragOver={(event) => {
                      if (dragged) {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }
                    }}
                    onDrop={(event) => onDrop(event, anchor, hour)}
                  >
                    {actionOptions && (
                      <Button
                        variant="ghost"
                        size="xs"
                        className="justify-self-start text-muted-foreground"
                        aria-label={`Add timed action at ${String(hour).padStart(2, "0")}:00`}
                        render={
                          <Link
                            href={href({
                              add: `${anchor}T${String(hour).padStart(2, "0")}:00`,
                            })}
                          />
                        }
                      >
                        <CalendarPlus aria-hidden="true" />
                        Add action
                      </Button>
                    )}
                    {atHour.map((entry) => (
                      <CalendarEntryLink
                        key={`${entry.source}-${entry.id}`}
                        entry={entry}
                        isMine={
                          entry.assignee.membershipId === currentMembershipId
                        }
                        onMove={onMove}
                        onDragStart={onDragStart}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {entries.length > 0 && view !== "day" && (
        <>
          <div
            className={cn(
              "hidden overflow-hidden rounded-lg border md:grid",
              view === "week" ? "grid-cols-7" : "grid-cols-7",
            )}
          >
            {days.map((day) => {
              const items = entries.filter(
                (entry) => dateOf(entry.startsAt) === day,
              );
              return (
                <div
                  key={day}
                  className={cn(
                    "min-w-0 border-r border-b p-2 last:border-r-0",
                    view === "month" ? "min-h-32" : "min-h-80",
                  )}
                >
                  <Link
                    href={href({ view: "day", date: day })}
                    className="text-xs font-semibold hover:underline"
                  >
                    {displayDay(day)}
                  </Link>
                  <div className="mt-2 grid gap-1.5">
                    {items.slice(0, view === "month" ? 3 : 20).map((entry) => (
                      <CalendarEntryLink
                        key={`${entry.source}-${entry.id}`}
                        entry={entry}
                        isMine={
                          entry.assignee.membershipId === currentMembershipId
                        }
                        onMove={onMove}
                        onDragStart={onDragStart}
                      />
                    ))}
                    {view === "month" && items.length > 3 && (
                      <Badge variant="secondary">
                        +{items.length - 3} more
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="grid gap-4 md:hidden">
            {days.map((day) => {
              const items = entries.filter(
                (entry) => dateOf(entry.startsAt) === day,
              );
              if (items.length === 0) return null;
              return (
                <section key={day} className="grid gap-2 border-b pb-4">
                  <Link
                    href={href({ view: "day", date: day })}
                    className="text-sm font-semibold hover:underline"
                  >
                    {displayDay(day)}
                  </Link>
                  {items.map((entry) => (
                    <CalendarEntryLink
                      key={`${entry.source}-${entry.id}`}
                      entry={entry}
                      isMine={
                        entry.assignee.membershipId === currentMembershipId
                      }
                      onMove={onMove}
                      onDragStart={onDragStart}
                    />
                  ))}
                </section>
              );
            })}
          </div>
        </>
      )}

      <Dialog
        open={move !== null}
        onOpenChange={(open) => {
          if (!open && !pending) {
            setMove(null);
            setMoveError("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm appointment move</DialogTitle>
            <DialogDescription>
              Review the new time. Nothing changes until you confirm.
            </DialogDescription>
          </DialogHeader>
          {move && (
            <div className="grid gap-4">
              <div className="rounded-lg bg-muted p-3 text-sm">
                <p className="font-medium">{move.entry.title}</p>
                <p className="text-muted-foreground">
                  From {timeFormat.format(new Date(move.entry.startsAt))} on{" "}
                  {displayDay(dateOf(move.entry.startsAt))}
                </p>
              </div>
              <div className="grid gap-1.5">
                <label
                  htmlFor="calendar-move-time"
                  className="text-sm font-medium"
                >
                  New date and time
                </label>
                <DateTimePicker
                  id="calendar-move-time"
                  value={move.proposed}
                  onChange={(proposed) => setMove({ ...move, proposed })}
                  required
                />
              </div>
            </div>
          )}
          {moveError && (
            <p role="alert" className="text-sm text-destructive">
              {moveError}
            </p>
          )}
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={pending} />
              }
            >
              Cancel
            </DialogClose>
            <Button
              type="button"
              onClick={confirmMove}
              disabled={pending || !move?.proposed}
            >
              {pending ? "Moving…" : "Confirm move"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
