import { AlertTriangle, Check, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";

// The shared pieces of a record page (ADR-039): every block is a white card
// on the grey canvas, details are plain label and value rows that leave out
// what is not recorded, one panel names the next step, and one timeline shows
// what has happened. Build record pages from these, not from one-off markup.

/** The one card surface used across record pages. */
export const CARD = "min-w-0 rounded-xl border bg-card text-card-foreground";

export function SectionCard({
  title,
  action,
  children,
  className,
}: {
  title: string;
  /** A small control beside the title, such as Add or Edit. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cn(CARD, "grid content-start gap-4 p-4 md:p-5", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export type KeyDetail = { label: string; value: ReactNode };

/**
 * Label and value rows. Rows with nothing recorded are left out; `more` says
 * how many, as one link to where they are added.
 */
export function KeyDetails({
  items,
  more,
}: {
  items: KeyDetail[];
  more?: ReactNode;
}) {
  const shown = items.filter(
    ({ value }) => value !== null && value !== undefined && value !== "",
  );
  return (
    <div className="grid gap-3">
      {shown.length > 0 ? (
        <dl className="grid gap-3">
          {shown.map(({ label, value }) => (
            <div key={label} className="flex justify-between gap-4 text-sm">
              <dt className="shrink-0 text-muted-foreground">{label}</dt>
              <dd className="min-w-0 text-right font-medium [overflow-wrap:anywhere]">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
      )}
      {more}
    </div>
  );
}

/** How many of these details have nothing recorded. */
export function missingDetails(items: KeyDetail[]) {
  return items.filter(
    ({ value }) => value === null || value === undefined || value === "",
  ).length;
}

/** The one thing to do next, with the page's single primary button. */
export function NextStepPanel({
  title,
  description,
  checklist = [],
  action,
}: {
  title: string;
  description?: string;
  checklist?: { label: string; met: boolean }[];
  action?: ReactNode;
}) {
  const done = checklist.filter((item) => item.met).length;
  return (
    <section
      aria-label="Next step"
      className={cn(CARD, "grid content-start gap-3 p-4 md:p-5")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">
            Next step
          </p>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      {checklist.length > 0 && (
        <>
          <div
            className="flex h-1.5 gap-0.5 overflow-hidden rounded-full"
            role="img"
            aria-label={`${done} of ${checklist.length} in place`}
          >
            {checklist.map((item) => (
              <span
                key={item.label}
                className={cn("flex-1", item.met ? "bg-primary" : "bg-muted")}
              />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            {checklist.map((item) => (
              <li
                key={item.label}
                className={cn(
                  "flex items-center gap-1.5",
                  item.met ? "text-muted-foreground" : "font-medium",
                )}
              >
                {item.met ? (
                  <Check aria-hidden="true" className="size-3.5 text-success" />
                ) : (
                  <span
                    aria-hidden="true"
                    className="size-3 rounded-full border-2 border-input"
                  />
                )}
                {item.label}
                <span className="sr-only">
                  {item.met ? " (in place)" : " (still needed)"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** What needs attention on this record: red for overdue, amber for coming up. */
export function AttentionPanel({
  tone = "destructive",
  items,
  action,
}: {
  tone?: "destructive" | "warning";
  items: string[];
  action?: ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <section
      aria-label="Needs attention"
      className={cn(
        "grid min-w-0 content-start gap-2 rounded-xl border p-4 md:p-5",
        tone === "destructive"
          ? "border-destructive/30 bg-destructive-soft"
          : "border-warning/30 bg-warning-soft",
      )}
    >
      <h2
        className={cn(
          "flex items-center gap-2 text-sm font-semibold",
          tone === "destructive" ? "text-destructive" : "text-warning",
        )}
      >
        <AlertTriangle aria-hidden="true" className="size-4" />
        Needs attention
      </h2>
      <ul className="grid gap-1 text-sm">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {action}
    </section>
  );
}

export type TimelineEntry = {
  key: string;
  at: Date;
  icon: LucideIcon;
  /** Who did it, when that is recorded. */
  who?: string;
  text: string;
  /** A note's own words, shown in a quiet box. */
  note?: string;
  /** Show the time as well as the day (a note has a real moment). */
  timed?: boolean;
};

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const momentFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Rows shown before the rest folds away. */
const TIMELINE_ROWS = 8;

function TimelineRows({ entries }: { entries: TimelineEntry[] }) {
  return (
    <>
      {entries.map((entry, index) => (
        <li key={entry.key} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <entry.icon aria-hidden="true" className="size-3.5" />
            </span>
            {index < entries.length - 1 && (
              <span aria-hidden="true" className="w-px flex-1 bg-border" />
            )}
          </div>
          <div className="min-w-0 pb-5">
            <p className="text-sm [overflow-wrap:anywhere]">
              {entry.who && <span className="font-medium">{entry.who} </span>}
              {entry.text}
            </p>
            <p className="text-xs text-muted-foreground">
              {(entry.timed ? momentFormat : dayFormat).format(entry.at)}
            </p>
            {entry.note && (
              <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-line [overflow-wrap:anywhere]">
                {entry.note}
              </p>
            )}
          </div>
        </li>
      ))}
    </>
  );
}

/** What has happened on a record, newest first. */
export function Timeline({
  entries,
  empty = "Nothing has happened here yet.",
}: {
  entries: TimelineEntry[];
  empty?: string;
}) {
  const ordered = [...entries].sort((a, b) => b.at.getTime() - a.at.getTime());
  if (ordered.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  const first = ordered.slice(0, TIMELINE_ROWS);
  const rest = ordered.slice(TIMELINE_ROWS);
  return (
    <div className="grid">
      <ol className="grid">
        <TimelineRows entries={first} />
      </ol>
      {rest.length > 0 && (
        <details>
          <summary className="w-fit cursor-pointer text-sm text-primary underline-offset-4 hover:underline">
            Show {rest.length} earlier
          </summary>
          <ol className="mt-4 grid">
            <TimelineRows entries={rest} />
          </ol>
        </details>
      )}
    </div>
  );
}
