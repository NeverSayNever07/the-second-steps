import type { ActionKindCode } from "@/core/actions/domain/action";

export const KIND_LABELS: Record<ActionKindCode, string> = {
  call: "Call",
  email: "Email",
  send: "Send",
  chase: "Chase",
  other: "Other",
};

export const KIND_OPTIONS = (
  ["call", "email", "send", "chase", "other"] as const
).map((value) => ({ value, label: KIND_LABELS[value] }));

const MS_PER_DAY = 86_400_000;

function dayNumber(date: string) {
  return Math.round(new Date(`${date}T00:00:00Z`).getTime() / MS_PER_DAY);
}

/** Moves a "YYYY-MM-DD" date by whole days. */
export function addDays(date: string, days: number) {
  return new Date((dayNumber(date) + days) * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

const shortDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
});

export function dueLabel(dueOn: string, today: string) {
  const days = dayNumber(dueOn) - dayNumber(today);
  if (days < 0) {
    return {
      text: days === -1 ? "Overdue 1 day" : `Overdue ${-days} days`,
      tone: "overdue" as const,
    };
  }
  if (days === 0) return { text: "Today", tone: "today" as const };
  if (days === 1) return { text: "Tomorrow", tone: "later" as const };
  return {
    text: shortDate.format(new Date(`${dueOn}T00:00:00Z`)),
    tone: "later" as const,
  };
}

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour: "2-digit",
  minute: "2-digit",
});
const clockWithDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const ukDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The UK clock time of a planned moment, with the day when it is not today. */
export function plannedLabel(plannedFor: Date, today: string) {
  return ukDay.format(plannedFor) === today
    ? clock.format(plannedFor)
    : clockWithDay.format(plannedFor);
}

/** The whole UK clock hour (0 to 23) of a moment. */
export function ukHourOf(moment: Date) {
  return Number(clock.format(moment).slice(0, 2)) % 24;
}

/** Working hours offered when planning an action into today. */
export const PLAN_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] as const;

export function hourLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}
