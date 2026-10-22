import {
  parseDateOnly,
  parseUkDateTime,
} from "@/core/enquiries/domain/enquiry";

export const CALENDAR_VIEWS = ["day", "week", "month"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];
export type CalendarScope = "mine" | "branch";

export type CalendarRange = {
  from: string;
  to: string;
  start: Date;
  end: Date;
};

function dateAtNoon(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

export function addCalendarDays(value: string, days: number): string {
  const date = dateAtNoon(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function parseCalendarView(value: unknown): CalendarView {
  return typeof value === "string" &&
    CALENDAR_VIEWS.includes(value as CalendarView)
    ? (value as CalendarView)
    : "week";
}

export function parseCalendarScope(value: unknown): CalendarScope {
  return value === "branch" ? "branch" : "mine";
}

export function parseCalendarDate(value: unknown, fallback: string): string {
  return typeof value === "string" && parseDateOnly(value) ? value : fallback;
}

/** The visible UK calendar range, capped at the six weeks needed by a month. */
export function calendarRange(
  anchor: string,
  view: CalendarView,
): CalendarRange {
  const anchorDate = dateAtNoon(anchor);
  let from = anchor;
  let days = 1;

  if (view === "week") {
    const mondayOffset = (anchorDate.getUTCDay() + 6) % 7;
    from = addCalendarDays(anchor, -mondayOffset);
    days = 7;
  }

  if (view === "month") {
    const first = `${anchor.slice(0, 8)}01`;
    const firstDate = dateAtNoon(first);
    const mondayOffset = (firstDate.getUTCDay() + 6) % 7;
    from = addCalendarDays(first, -mondayOffset);
    days = 42;
  }

  const to = addCalendarDays(from, days - 1);
  const start = parseUkDateTime(`${from}T00:00`);
  const end = parseUkDateTime(`${addCalendarDays(to, 1)}T00:00`);
  if (!start || !end) {
    throw new Error("A checked calendar date did not form a UK date range.");
  }
  return { from, to, start, end };
}
