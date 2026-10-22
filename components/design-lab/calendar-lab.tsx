"use client";

import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Home,
  Inbox,
  Megaphone,
  Move,
  Plus,
  RotateCcw,
  Users,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type DragEvent, type FormEvent } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/ui/option-select";
import { cn } from "cn";
import { FilterChips } from "./dashboards/shared";

/* Sample data only: every name, address and appointment is fictional. */

type CalendarView = "day" | "week" | "month";
type CalendarScope = "mine" | "branch";
type BranchId = "all" | "main" | "riverside";
type PersonId = "all" | "olivia" | "ben" | "priya" | "ruby";

type DiaryEntry = {
  id: string;
  kind: "appraisal" | "action";
  date: string;
  time: string;
  title: string;
  detail: string;
  personId: Exclude<PersonId, "all">;
  branchId: Exclude<BranchId, "all">;
  sourceLabel: string;
};

type Person = {
  id: Exclude<PersonId, "all">;
  name: string;
  initials: string;
  branchId: Exclude<BranchId, "all">;
};

const SAMPLE_TODAY = "2026-10-22";
const DAY_MS = 24 * 60 * 60 * 1000;

const VIEWS: readonly { id: CalendarView; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

const SCOPES: readonly { id: CalendarScope; label: string }[] = [
  { id: "mine", label: "My calendar" },
  { id: "branch", label: "Branch calendar" },
];

const BRANCHES: readonly { value: BranchId; label: string }[] = [
  { value: "all", label: "All permitted branches" },
  { value: "main", label: "Oakfield Main Branch" },
  { value: "riverside", label: "Riverside Branch" },
];

const PEOPLE: readonly Person[] = [
  { id: "olivia", name: "Olivia Hart", initials: "OH", branchId: "main" },
  { id: "ben", name: "Ben Carter", initials: "BC", branchId: "main" },
  { id: "priya", name: "Priya Nair", initials: "PN", branchId: "main" },
  { id: "ruby", name: "Ruby Clarke", initials: "RC", branchId: "riverside" },
];

const INITIAL_ENTRIES: DiaryEntry[] = [
  {
    id: "appraisal-1",
    kind: "appraisal",
    date: "2026-10-19",
    time: "09:30",
    title: "Appraisal · Dev Patel",
    detail: "12 Hall Gardens, Cambridge",
    personId: "olivia",
    branchId: "main",
    sourceLabel: "Landlord lead LL-1042",
  },
  {
    id: "action-1",
    kind: "action",
    date: "2026-10-19",
    time: "14:00",
    title: "Call photographer",
    detail: "8 Willow Lane, Cambridge",
    personId: "ben",
    branchId: "main",
    sourceLabel: "General action",
  },
  {
    id: "appraisal-2",
    kind: "appraisal",
    date: "2026-10-20",
    time: "11:00",
    title: "Appraisal · Sarah Bennett",
    detail: "44 Mill Road, Cambridge",
    personId: "priya",
    branchId: "main",
    sourceLabel: "Landlord lead LL-1047",
  },
  {
    id: "action-2",
    kind: "action",
    date: "2026-10-21",
    time: "10:00",
    title: "Send valuation follow-up",
    detail: "Landlord lead LL-1039",
    personId: "olivia",
    branchId: "main",
    sourceLabel: "Lead next action",
  },
  {
    id: "appraisal-3",
    kind: "appraisal",
    date: SAMPLE_TODAY,
    time: "09:00",
    title: "Appraisal · Michael Owen",
    detail: "6 Orchard Close, Cambridge",
    personId: "ben",
    branchId: "main",
    sourceLabel: "Landlord lead LL-1051",
  },
  {
    id: "appraisal-4",
    kind: "appraisal",
    date: SAMPLE_TODAY,
    time: "11:30",
    title: "Appraisal · Hannah Cole",
    detail: "31 Victoria Street, Cambridge",
    personId: "olivia",
    branchId: "main",
    sourceLabel: "Landlord lead LL-1054",
  },
  {
    id: "action-3",
    kind: "action",
    date: SAMPLE_TODAY,
    time: "15:00",
    title: "Review listing photographs",
    detail: "18 Brookside, Cambridge",
    personId: "olivia",
    branchId: "main",
    sourceLabel: "General action",
  },
  {
    id: "action-4",
    kind: "action",
    date: "2026-10-23",
    time: "10:00",
    title: "Confirm EPC appointment",
    detail: "Property P-0281",
    personId: "priya",
    branchId: "main",
    sourceLabel: "General action",
  },
  {
    id: "appraisal-5",
    kind: "appraisal",
    date: "2026-10-23",
    time: "13:30",
    title: "Appraisal · James Wilson",
    detail: "5 Riverside Walk, Ely",
    personId: "ruby",
    branchId: "riverside",
    sourceLabel: "Landlord lead LL-1057",
  },
  {
    id: "action-5",
    kind: "action",
    date: "2026-10-26",
    time: "09:00",
    title: "Prepare appraisal comparables",
    detail: "Landlord lead LL-1060",
    personId: "olivia",
    branchId: "main",
    sourceLabel: "Lead next action",
  },
  {
    id: "appraisal-6",
    kind: "appraisal",
    date: "2026-10-29",
    time: "16:00",
    title: "Appraisal · Aisha Khan",
    detail: "72 Station Road, Cambridge",
    personId: "olivia",
    branchId: "main",
    sourceLabel: "Landlord lead LL-1064",
  },
  {
    id: "action-6",
    kind: "action",
    date: "2026-10-30",
    time: "12:00",
    title: "Call landlord about terms",
    detail: "Instruction I-0218",
    personId: "ruby",
    branchId: "riverside",
    sourceLabel: "General action",
  },
];

const DASHBOARD_TABS = [
  { label: "Home", icon: Home },
  { label: "Calendar", icon: CalendarClock },
  { label: "Landlords & instructions", icon: Inbox },
  { label: "Marketing & applicants", icon: Megaphone },
  { label: "Pre-tenancy", icon: ClipboardCheck },
  { label: "Management", icon: Wrench },
] as const;

const dayHeadingFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
});
const longDayFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const monthFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});
const shortMonthFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});

function calendarDate(value: string): Date {
  return new Date(`${value}T12:00:00Z`);
}

function displayCalendarDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "Choose a date";
  }
  return longDayFormat.format(calendarDate(value));
}

function calendarDateText(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function shiftDays(value: string, days: number): string {
  const date = calendarDate(value);
  return calendarDateText(new Date(date.getTime() + days * DAY_MS));
}

function shiftMonths(value: string, months: number): string {
  const date = calendarDate(value);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  return calendarDateText(date);
}

function startOfWeek(value: string): string {
  const date = calendarDate(value);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return shiftDays(value, -daysSinceMonday);
}

function datesFrom(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => shiftDays(start, index));
}

function datesForView(view: CalendarView, selectedDate: string): string[] {
  if (view === "day") {
    return [selectedDate];
  }
  if (view === "week") {
    return datesFrom(startOfWeek(selectedDate), 7);
  }

  const date = calendarDate(selectedDate);
  const firstOfMonth = calendarDateText(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12)),
  );
  return datesFrom(startOfWeek(firstOfMonth), 42);
}

function periodLabel(view: CalendarView, dates: readonly string[]): string {
  if (view === "day") {
    return longDayFormat.format(calendarDate(dates[0]));
  }
  if (view === "month") {
    return monthFormat.format(calendarDate(dates[15]));
  }
  const firstDate = calendarDate(dates[0]);
  const lastDate = calendarDate(dates[dates.length - 1]);
  const first = shortMonthFormat.format(calendarDate(dates[0]));
  const last = shortMonthFormat.format(calendarDate(dates[dates.length - 1]));
  if (firstDate.getUTCFullYear() === lastDate.getUTCFullYear()) {
    return `${first}–${last} ${firstDate.getUTCFullYear()}`;
  }
  return `${first} ${firstDate.getUTCFullYear()}–${last} ${lastDate.getUTCFullYear()}`;
}

function personById(id: Exclude<PersonId, "all">): Person {
  return PEOPLE.find((person) => person.id === id) ?? PEOPLE[0];
}

function isBranchId(value: string): value is BranchId {
  return BRANCHES.some((branch) => branch.value === value);
}

function isPersonId(value: string): value is PersonId {
  return value === "all" || PEOPLE.some((person) => person.id === value);
}

function isAssignedPersonId(value: string): value is Exclude<PersonId, "all"> {
  return PEOPLE.some((person) => person.id === value);
}

function isEntryKind(value: string): value is DiaryEntry["kind"] {
  return value === "appraisal" || value === "action";
}

function entriesForDate(
  entries: readonly DiaryEntry[],
  date: string,
): DiaryEntry[] {
  return entries
    .filter((entry) => entry.date === date)
    .sort(
      (left, right) =>
        left.time.localeCompare(right.time) || left.id.localeCompare(right.id),
    );
}

function PersonAvatar({ person }: { person: Person }) {
  return (
    <span
      aria-hidden="true"
      title={person.name}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-[0.65rem] font-semibold text-accent-foreground"
    >
      {person.initials}
    </span>
  );
}

function EntryButton({
  entry,
  isSelected,
  onSelect,
  onDragStart,
  compact = false,
}: {
  entry: DiaryEntry;
  isSelected: boolean;
  onSelect: (entry: DiaryEntry) => void;
  onDragStart?: (
    event: DragEvent<HTMLButtonElement>,
    entry: DiaryEntry,
  ) => void;
  compact?: boolean;
}) {
  const person = personById(entry.personId);
  const tone =
    entry.kind === "appraisal"
      ? "bg-info-soft text-info"
      : "bg-card text-foreground ring-1 ring-foreground/10";
  return (
    <button
      type="button"
      draggable={Boolean(onDragStart)}
      aria-pressed={isSelected}
      onClick={() => onSelect(entry)}
      onDragStart={(event) => onDragStart?.(event, entry)}
      className={cn(
        "grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded-lg p-2 text-left transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        tone,
        isSelected && "ring-2 ring-primary",
      )}
    >
      <span className="text-xs font-semibold tabular-nums">{entry.time}</span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold">
          {entry.title}
        </span>
        {!compact && (
          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs opacity-75">
            <PersonAvatar person={person} />
            <span className="truncate">{entry.detail}</span>
          </span>
        )}
      </span>
    </button>
  );
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function hourText(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function entryHour(entry: DiaryEntry): number {
  return Number(entry.time.slice(0, 2));
}

function DayTimeline({
  date,
  entries,
  selectedEntryId,
  onSelect,
  onAdd,
  onRequestMove,
}: {
  date: string;
  entries: readonly DiaryEntry[];
  selectedEntryId: string | null;
  onSelect: (entry: DiaryEntry) => void;
  onAdd: (date: string, time: string) => void;
  onRequestMove: (entryId: string, date: string, time: string) => void;
}) {
  const [showFullDay, setShowFullDay] = useState(false);
  const visibleHours = showFullDay
    ? HOURS
    : HOURS.filter((hour) => hour >= 7 && hour < 21);
  const outsideHoursCount = entries.filter(
    (entry) =>
      entry.date === date && (entryHour(entry) < 7 || entryHour(entry) >= 21),
  ).length;
  const onDragStart = (
    event: DragEvent<HTMLButtonElement>,
    entry: DiaryEntry,
  ) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", entry.id);
  };

  return (
    <div className="max-h-[44rem] overflow-y-auto rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-card/95 px-3 py-2 backdrop-blur">
        <p className="mr-auto text-xs text-muted-foreground">
          {showFullDay ? "Showing the full day" : "Showing 07:00 to 21:00"}
          {!showFullDay && outsideHoursCount > 0
            ? ` · ${outsideHoursCount} outside these hours`
            : ""}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowFullDay((current) => !current)}
        >
          {showFullDay ? "Show usual hours" : "Show early and late hours"}
        </Button>
      </div>
      <ol>
        {visibleHours.map((hour) => {
          const time = hourText(hour);
          const hourEntries = entries.filter(
            (entry) => entry.date === date && entryHour(entry) === hour,
          );
          return (
            <li
              key={hour}
              className="grid min-h-20 grid-cols-[4rem_minmax(0,1fr)] border-b last:border-b-0"
            >
              <span className="border-r px-2 py-2 text-right text-xs font-medium tabular-nums text-muted-foreground">
                {time}
              </span>
              <div
                data-calendar-drop-time={time}
                className="grid min-w-0 content-start gap-2 p-2"
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const entryId = event.dataTransfer.getData("text/plain");
                  if (entryId) {
                    onRequestMove(entryId, date, time);
                  }
                }}
              >
                {hourEntries.map((entry) => (
                  <EntryButton
                    key={entry.id}
                    entry={entry}
                    isSelected={entry.id === selectedEntryId}
                    onSelect={onSelect}
                    onDragStart={onDragStart}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => onAdd(date, time)}
                  className="flex min-h-8 items-center gap-1.5 rounded-lg border border-dashed px-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Plus aria-hidden="true" className="size-3.5" />
                  Add appointment at {time}
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Agenda({
  dates,
  entries,
  selectedEntryId,
  onSelect,
}: {
  dates: readonly string[];
  entries: readonly DiaryEntry[];
  selectedEntryId: string | null;
  onSelect: (entry: DiaryEntry) => void;
}) {
  const populatedDates = dates.filter(
    (date) => entriesForDate(entries, date).length > 0,
  );
  if (populatedDates.length === 0) {
    return (
      <p className="rounded-xl bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground">
        Nothing is planned in this period.
      </p>
    );
  }
  return (
    <ol className="grid gap-5">
      {populatedDates.map((date) => (
        <li key={date} className="grid gap-2">
          <h3 className="border-b pb-2 text-sm font-semibold">
            {longDayFormat.format(calendarDate(date))}
          </h3>
          <ul className="grid gap-2">
            {entriesForDate(entries, date).map((entry) => (
              <li key={entry.id}>
                <EntryButton
                  entry={entry}
                  isSelected={entry.id === selectedEntryId}
                  onSelect={onSelect}
                />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function WeekView({
  dates,
  entries,
  selectedEntryId,
  onSelect,
}: {
  dates: readonly string[];
  entries: readonly DiaryEntry[];
  selectedEntryId: string | null;
  onSelect: (entry: DiaryEntry) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
      <ol className="grid min-w-[58rem] grid-cols-7 divide-x bg-card">
        {dates.map((date) => {
          const dayEntries = entriesForDate(entries, date);
          const isToday = date === SAMPLE_TODAY;
          return (
            <li key={date} className="min-h-96 min-w-0">
              <div
                className={cn(
                  "border-b px-3 py-2",
                  isToday && "bg-primary text-primary-foreground",
                )}
              >
                <p className="text-xs font-medium">
                  {dayHeadingFormat.format(calendarDate(date))}
                </p>
                {isToday && <p className="text-[0.65rem] opacity-80">Today</p>}
              </div>
              <ul className="grid gap-2 p-2">
                {dayEntries.map((entry) => (
                  <li key={entry.id}>
                    <EntryButton
                      entry={entry}
                      isSelected={entry.id === selectedEntryId}
                      onSelect={onSelect}
                    />
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function MonthView({
  dates,
  selectedDate,
  entries,
  selectedEntryId,
  onSelect,
}: {
  dates: readonly string[];
  selectedDate: string;
  entries: readonly DiaryEntry[];
  selectedEntryId: string | null;
  onSelect: (entry: DiaryEntry) => void;
}) {
  const selectedMonth = calendarDate(selectedDate).getUTCMonth();
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
      <div className="min-w-[58rem] bg-card">
        <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-xs font-medium text-muted-foreground">
          {dates.slice(0, 7).map((date) => (
            <span key={date} className="px-2 py-2">
              {new Intl.DateTimeFormat("en-GB", {
                timeZone: "UTC",
                weekday: "short",
              }).format(calendarDate(date))}
            </span>
          ))}
        </div>
        <ol className="grid grid-cols-7">
          {dates.map((date) => {
            const dayEntries = entriesForDate(entries, date);
            const dateValue = calendarDate(date);
            const isOutsideMonth = dateValue.getUTCMonth() !== selectedMonth;
            const visibleEntries = dayEntries.slice(0, 2);
            return (
              <li
                key={date}
                className={cn(
                  "min-h-32 min-w-0 border-r border-b p-2 last:border-r-0",
                  isOutsideMonth && "bg-muted/30 text-muted-foreground",
                )}
              >
                <p
                  className={cn(
                    "mb-2 text-xs font-semibold tabular-nums",
                    date === SAMPLE_TODAY &&
                      "inline-flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground",
                  )}
                >
                  {dateValue.getUTCDate()}
                </p>
                <ul className="grid gap-1">
                  {visibleEntries.map((entry) => (
                    <li key={entry.id}>
                      <EntryButton
                        entry={entry}
                        isSelected={entry.id === selectedEntryId}
                        onSelect={onSelect}
                        compact
                      />
                    </li>
                  ))}
                </ul>
                {dayEntries.length > visibleEntries.length && (
                  <p className="mt-1 text-[0.65rem] text-muted-foreground">
                    +{dayEntries.length - visibleEntries.length} more
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function EntryDetail({
  entry,
  onMove,
}: {
  entry: DiaryEntry | null;
  onMove: (entry: DiaryEntry) => void;
}) {
  if (!entry) {
    return (
      <aside className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
        Select an entry to preview its source details. The first release links
        back to the owning record for any changes.
      </aside>
    );
  }
  const person = personById(entry.personId);
  return (
    <aside
      aria-live="polite"
      className="grid gap-3 rounded-xl bg-card p-4 shadow-xs ring-1 ring-foreground/10"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={entry.kind === "appraisal" ? "info" : "secondary"}>
          {entry.kind === "appraisal" ? "Appraisal" : "Timed action"}
        </Badge>
        <span className="text-xs text-muted-foreground">Read-only mock-up</span>
      </div>
      <div>
        <h3 className="font-semibold">{entry.title}</h3>
        <p className="text-sm text-muted-foreground">{entry.detail}</p>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">When</dt>
          <dd className="font-medium">
            {longDayFormat.format(calendarDate(entry.date))}, {entry.time}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Assigned to</dt>
          <dd className="flex items-center gap-2 font-medium">
            <PersonAvatar person={person} /> {person.name}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Source</dt>
          <dd className="font-medium">{entry.sourceLabel}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onMove(entry)}>
          <Move aria-hidden="true" />
          Move appointment
        </Button>
        <Button size="sm" variant="outline" disabled>
          Open source record
        </Button>
      </div>
    </aside>
  );
}

type AddTarget = { date: string; time: string };
type MoveTarget = { entryId: string; date: string; time: string };

function AddAppointmentDialog({
  target,
  onClose,
  onAdd,
}: {
  target: AddTarget;
  onClose: () => void;
  onAdd: (entry: DiaryEntry) => void;
}) {
  const [kind, setKind] = useState<DiaryEntry["kind"]>("appraisal");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [date, setDate] = useState(target.date);
  const [time, setTime] = useState(target.time);
  const [personId, setPersonId] = useState<Exclude<PersonId, "all">>("olivia");
  const [tried, setTried] = useState(false);
  const isValidSchedule =
    /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time);
  const titleError =
    tried && !title.trim() ? "Give the appointment a title." : null;
  const scheduleError =
    tried && !isValidSchedule ? "Choose a valid date and time." : null;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (!title.trim() || !isValidSchedule) {
      return;
    }
    const person = personById(personId);
    const detailText = detail.trim()
      ? detail.trim()
      : "CRM appointment (fictional)";
    onAdd({
      id: `mock-${Date.now()}`,
      kind,
      date,
      time,
      title:
        kind === "appraisal" ? `Appraisal · ${title.trim()}` : title.trim(),
      detail: detailText,
      personId,
      branchId: person.branchId,
      sourceLabel:
        kind === "appraisal"
          ? "New landlord-lead appraisal"
          : "New general action",
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Add appointment</DialogTitle>
            <DialogDescription>
              Choose the CRM workflow that owns this diary entry. This mock-up
              saves fictional data only.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="calendar-appointment-kind">Type</Label>
            <OptionSelect
              id="calendar-appointment-kind"
              value={kind}
              onValueChange={(value) => {
                if (isEntryKind(value)) {
                  setKind(value);
                }
              }}
              options={[
                { value: "appraisal", label: "Landlord appraisal" },
                { value: "action", label: "Timed action" },
              ]}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="calendar-appointment-title">
              {kind === "appraisal" ? "Landlord or lead" : "What needs doing?"}
            </Label>
            <Input
              id="calendar-appointment-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              autoComplete="off"
              aria-invalid={Boolean(titleError)}
              aria-describedby={
                titleError ? "calendar-appointment-title-error" : undefined
              }
              placeholder={
                kind === "appraisal"
                  ? "e.g. Alex Morgan"
                  : "e.g. Call photographer"
              }
            />
            {titleError && (
              <p
                id="calendar-appointment-title-error"
                className="text-xs text-destructive"
              >
                {titleError}
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="calendar-appointment-detail">
              Related property or record
            </Label>
            <Input
              id="calendar-appointment-detail"
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              maxLength={200}
              autoComplete="off"
              placeholder="Search would replace this field in production"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="calendar-appointment-date">Date</Label>
              <Input
                id="calendar-appointment-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="calendar-appointment-time">Time</Label>
              <Input
                id="calendar-appointment-time"
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                required
              />
            </div>
          </div>
          {scheduleError && (
            <p className="text-xs text-destructive">{scheduleError}</p>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="calendar-appointment-person">Assign to</Label>
            <OptionSelect
              id="calendar-appointment-person"
              value={personId}
              onValueChange={(value) => {
                if (isAssignedPersonId(value)) {
                  setPersonId(value);
                }
              }}
              options={PEOPLE.map((person) => ({
                value: person.id,
                label:
                  person.id === "olivia" ? `${person.name} (you)` : person.name,
              }))}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Add appointment</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MoveAppointmentDialog({
  entry,
  target,
  onClose,
  onConfirm,
}: {
  entry: DiaryEntry;
  target: MoveTarget;
  onClose: () => void;
  onConfirm: (target: MoveTarget) => void;
}) {
  const [date, setDate] = useState(target.date);
  const [time, setTime] = useState(target.time);
  const isValidTarget =
    /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move this appointment?</DialogTitle>
          <DialogDescription>
            Review the new time before changing {entry.title}. Nothing moves
            until you confirm.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="calendar-move-date">New date</Label>
            <Input
              id="calendar-move-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="calendar-move-time">New time</Label>
            <Input
              id="calendar-move-time"
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </div>
        </div>
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          From {displayCalendarDate(entry.date)} at {entry.time}
          <br />
          To {displayCalendarDate(date)} at {time || "Choose a time"}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Keep original time
          </Button>
          <Button
            type="button"
            disabled={!isValidTarget}
            onClick={() => onConfirm({ ...target, date, time })}
          >
            Confirm move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CalendarLab() {
  const [entries, setEntries] = useState<DiaryEntry[]>(INITIAL_ENTRIES);
  const [view, setView] = useState<CalendarView>("week");
  const [scope, setScope] = useState<CalendarScope>("mine");
  const [selectedDate, setSelectedDate] = useState(SAMPLE_TODAY);
  const [branchId, setBranchId] = useState<BranchId>("all");
  const [personId, setPersonId] = useState<PersonId>("all");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const dates = useMemo(
    () => datesForView(view, selectedDate),
    [selectedDate, view],
  );
  const people = PEOPLE.filter(
    (person) => branchId === "all" || person.branchId === branchId,
  );
  const personOptions = [
    { value: "all", label: "All visible colleagues" },
    ...people.map((person) => ({ value: person.id, label: person.name })),
  ];
  const visibleEntries = entries.filter((entry) => {
    if (!dates.includes(entry.date)) {
      return false;
    }
    if (scope === "mine") {
      return entry.personId === "olivia";
    }
    const isInBranch = branchId === "all" || entry.branchId === branchId;
    const isForPerson = personId === "all" || entry.personId === personId;
    return isInBranch && isForPerson;
  });
  const selectedEntry =
    entries.find((entry) => entry.id === selectedEntryId) ?? null;
  const moveEntry = moveTarget
    ? (entries.find((entry) => entry.id === moveTarget.entryId) ?? null)
    : null;

  const onMove = (direction: -1 | 1) => {
    if (view === "day") {
      setSelectedDate(shiftDays(selectedDate, direction));
    } else if (view === "week") {
      setSelectedDate(shiftDays(selectedDate, direction * 7));
    } else {
      setSelectedDate(shiftMonths(selectedDate, direction));
    }
    setSelectedEntryId(null);
  };
  const onScopeChange = (next: CalendarScope) => {
    setScope(next);
    setPersonId("all");
    setSelectedEntryId(null);
  };
  const onBranchChange = (next: string) => {
    if (!isBranchId(next)) {
      return;
    }
    setBranchId(next);
    setPersonId("all");
    setSelectedEntryId(null);
  };
  const onPersonChange = (next: string) => {
    if (!isPersonId(next)) {
      return;
    }
    setPersonId(next);
    setSelectedEntryId(null);
  };
  const onAdd = (entry: DiaryEntry) => {
    setEntries((current) => [...current, entry]);
    setSelectedDate(entry.date);
    setView("day");
    setSelectedEntryId(entry.id);
    if (entry.personId !== "olivia") {
      setScope("branch");
      setBranchId(entry.branchId);
      setPersonId(entry.personId);
    }
    setAddTarget(null);
  };
  const onConfirmMove = (target: MoveTarget) => {
    setEntries((current) =>
      current.map((entry) =>
        entry.id === target.entryId
          ? { ...entry, date: target.date, time: target.time }
          : entry,
      ),
    );
    setSelectedDate(target.date);
    setView("day");
    setSelectedEntryId(target.entryId);
    setMoveTarget(null);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[96rem] flex-wrap items-center gap-3 px-4 py-3">
          <div className="mr-auto">
            <p className="text-sm font-semibold">Staff calendar · CAL-0</p>
            <p className="text-xs text-muted-foreground">
              Fictional design mock-up dated Thursday 22 October 2026
            </p>
          </div>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Back to the app
          </Link>
          <ThemeToggle />
        </div>
      </div>

      <div className="mx-auto grid max-w-[96rem] gap-5 px-4 py-6 sm:py-8">
        <div className="grid gap-2 rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground">
          <p>
            <span className="font-semibold">Confirmed direction:</span> Home
            keeps the compact personal schedule; this full Calendar tab opens on
            My calendar and can show only branch work the viewer may already
            access.
          </p>
          <p className="text-xs">
            Day view starts with 07:00 to 21:00 and expands to the full day when
            needed. Add from any empty slot, or drag an entry to another hour
            and confirm the change. On a phone, select an entry and use Move
            appointment instead. No duration is implied.
          </p>
        </div>

        <section className="overflow-hidden rounded-2xl bg-background ring-1 ring-foreground/15">
          <nav aria-label="Dashboard sections" className="border-b">
            <ul className="flex gap-1 overflow-x-auto px-3 pt-2">
              {DASHBOARD_TABS.map(({ label, icon: Icon }) => {
                const isCurrent = label === "Calendar";
                return (
                  <li key={label}>
                    <button
                      type="button"
                      aria-current={isCurrent ? "page" : undefined}
                      disabled={!isCurrent}
                      className={cn(
                        "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
                        isCurrent
                          ? "border-primary text-foreground"
                          : "border-transparent text-muted-foreground",
                      )}
                    >
                      <Icon aria-hidden="true" className="size-4" />
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="grid gap-5 p-4 sm:p-6">
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  Calendar
                </h1>
                <p className="text-sm text-muted-foreground">
                  Plan your diary and coordinate work across permitted branches.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info">Mock-up · no real records</Badge>
                <Button
                  onClick={() =>
                    setAddTarget({ date: selectedDate, time: "09:00" })
                  }
                >
                  <Plus aria-hidden="true" />
                  Add appointment
                </Button>
              </div>
            </header>

            <div className="grid gap-3 rounded-xl bg-card p-3 shadow-xs ring-1 ring-foreground/10 sm:p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Previous period"
                  onClick={() => onMove(-1)}
                >
                  <ChevronLeft aria-hidden="true" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Next period"
                  onClick={() => onMove(1)}
                >
                  <ChevronRight aria-hidden="true" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedDate(SAMPLE_TODAY);
                    setSelectedEntryId(null);
                  }}
                >
                  <RotateCcw aria-hidden="true" />
                  Today
                </Button>
                <h2 className="min-w-0 flex-1 text-base font-semibold sm:text-lg">
                  {periodLabel(view, dates)}
                </h2>
                <FilterChips
                  label="Calendar view"
                  options={VIEWS}
                  value={view}
                  onChange={(next) => {
                    setView(next);
                    setSelectedEntryId(null);
                  }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <FilterChips
                  label="Calendar scope"
                  options={SCOPES}
                  value={scope}
                  onChange={onScopeChange}
                />
                {scope === "branch" && (
                  <>
                    <div className="grid w-full gap-1 sm:w-52">
                      <Label htmlFor="calendar-branch">Branch</Label>
                      <OptionSelect
                        id="calendar-branch"
                        value={branchId}
                        onValueChange={onBranchChange}
                        options={BRANCHES}
                        className="w-full"
                      />
                    </div>
                    <div className="grid w-full gap-1 sm:w-52">
                      <Label htmlFor="calendar-colleague">Colleague</Label>
                      <OptionSelect
                        id="calendar-colleague"
                        value={personId}
                        onValueChange={onPersonChange}
                        options={personOptions}
                        className="w-full"
                      />
                    </div>
                  </>
                )}
                <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users aria-hidden="true" className="size-4" />
                  {visibleEntries.length} visible{" "}
                  {visibleEntries.length === 1 ? "entry" : "entries"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-info" /> Appraisal
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full border border-foreground/25 bg-card" />
                Timed action
              </span>
              <span>Times are Europe/London</span>
            </div>

            <div className="md:hidden">
              <Agenda
                dates={dates}
                entries={visibleEntries}
                selectedEntryId={selectedEntryId}
                onSelect={(entry) => setSelectedEntryId(entry.id)}
              />
            </div>
            <div className="hidden md:block">
              {view === "week" ? (
                <WeekView
                  dates={dates}
                  entries={visibleEntries}
                  selectedEntryId={selectedEntryId}
                  onSelect={(entry) => setSelectedEntryId(entry.id)}
                />
              ) : view === "month" ? (
                <MonthView
                  dates={dates}
                  selectedDate={selectedDate}
                  entries={visibleEntries}
                  selectedEntryId={selectedEntryId}
                  onSelect={(entry) => setSelectedEntryId(entry.id)}
                />
              ) : (
                <DayTimeline
                  date={selectedDate}
                  entries={visibleEntries}
                  selectedEntryId={selectedEntryId}
                  onSelect={(entry) => setSelectedEntryId(entry.id)}
                  onAdd={(date, time) => setAddTarget({ date, time })}
                  onRequestMove={(entryId, date, time) =>
                    setMoveTarget({ entryId, date, time })
                  }
                />
              )}
            </div>

            <EntryDetail
              entry={selectedEntry}
              onMove={(entry) =>
                setMoveTarget({
                  entryId: entry.id,
                  date: entry.date,
                  time: entry.time,
                })
              }
            />
          </div>
        </section>

        <aside className="grid gap-4 border-t pt-5 text-sm md:grid-cols-3">
          <div>
            <h2 className="font-semibold">What this tests</h2>
            <p className="text-muted-foreground">
              One cross-module calendar, calm desktop density, and an agenda
              that remains usable on a phone.
            </p>
          </div>
          <div>
            <h2 className="font-semibold">Security boundary</h2>
            <p className="text-muted-foreground">
              Branch mode reveals only source records and colleagues already
              visible to the signed-in membership.
            </p>
          </div>
          <div>
            <h2 className="font-semibold">Not designed yet</h2>
            <p className="text-muted-foreground">
              Appointment duration, diary-only events, private Busy entries,
              clash handling, reminders and external sync.
            </p>
          </div>
        </aside>
      </div>
      {addTarget && (
        <AddAppointmentDialog
          key={`${addTarget.date}-${addTarget.time}`}
          target={addTarget}
          onClose={() => setAddTarget(null)}
          onAdd={onAdd}
        />
      )}
      {moveTarget && moveEntry && (
        <MoveAppointmentDialog
          key={`${moveTarget.entryId}-${moveTarget.date}-${moveTarget.time}`}
          entry={moveEntry}
          target={moveTarget}
          onClose={() => setMoveTarget(null)}
          onConfirm={onConfirmMove}
        />
      )}
    </main>
  );
}
