import { AlertTriangle, CalendarDays, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import type {
  DashboardSummary,
  LeadRef,
} from "@/core/actions/application/dashboard-summary";
import { STALE_AFTER_DAYS } from "@/core/actions/application/dashboard-summary";
import { ENQUIRY_STAGE_LABELS } from "@/core/enquiries/domain/enquiry-labels";

// Moments are shown in UK time.
const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour: "2-digit",
  minute: "2-digit",
});
const dayTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function Heading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-base font-semibold">
      {children}
    </h2>
  );
}

/** Headline numbers, alerts, today's appraisals, pipeline and recent activity. */
export function OverviewTab({
  summary,
  workspacePath,
}: {
  summary: DashboardSummary;
  workspacePath: string;
}) {
  const { headline, attention, todaysAppraisals, pipeline, recentActivity } =
    summary;
  const leadsPath = `${workspacePath}/enquiries`;
  const { total, reachedAppraisal } = headline.recentLeads;
  const stats = [
    { label: "Open leads", value: String(headline.openLeads) },
    {
      label: "Appraisals this week",
      value: String(headline.appraisalsThisWeek),
    },
    { label: "Won this month", value: String(headline.wonThisMonth) },
    {
      label: "Reached an appraisal",
      value: total ? `${reachedAppraisal} of ${total}` : "No new leads",
      note: total ? "of leads from the last 30 days" : "in the last 30 days",
    },
    {
      label: "Your overdue actions",
      value: String(headline.overdueActions),
      warn: headline.overdueActions > 0,
    },
    {
      label: "Leads with no next action",
      value: String(headline.leadsWithoutNextAction),
      warn: headline.leadsWithoutNextAction > 0,
    },
  ];

  const alerts: {
    key: string;
    text: string;
    leads?: LeadRef[];
    more?: number;
    href?: string;
  }[] = [];
  if (headline.overdueActions > 0) {
    alerts.push({
      key: "overdue",
      text: `${plural(headline.overdueActions, "action is", "actions are")} overdue`,
      href: "#actions-heading",
    });
  }
  const groups = [
    {
      key: "none",
      list: attention.noNextAction,
      text: (n: number) =>
        `${plural(n, "landlord lead has", "landlord leads have")} no next action`,
    },
    {
      key: "person",
      list: attention.noLeadPerson,
      text: (n: number) =>
        `${plural(n, "landlord lead has", "landlord leads have")} nobody looking after ${n === 1 ? "it" : "them"}`,
    },
    {
      key: "waiting",
      list: attention.waitingInStage,
      text: (n: number) =>
        `${plural(n, "landlord lead has", "landlord leads have")} waited ${STALE_AFTER_DAYS} days or more in the same stage`,
    },
  ];
  for (const { key, list, text } of groups) {
    if (list.count > 0) {
      alerts.push({
        key,
        text: text(list.count),
        leads: list.items.slice(0, 3),
        more: list.count - Math.min(list.items.length, 3),
      });
    }
  }

  const biggest = Math.max(1, ...pipeline.map(({ count }) => count));

  return (
    <div className="grid gap-8">
      <section aria-label="Headline numbers">
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {stats.map(({ label, value, note, warn }) => (
            <div key={label} className="min-w-0 rounded-xl border bg-card p-4">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd
                className={`mt-1 text-2xl font-semibold ${warn ? "text-destructive" : ""}`}
              >
                {value}
              </dd>
              {note && (
                <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
              )}
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="attention-heading" className="grid gap-3">
        <Heading id="attention-heading">Alerts</Heading>
        {alerts.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 aria-hidden="true" className="size-4 text-success" />
            Nothing needs attention right now.
          </p>
        ) : (
          <ul className="grid divide-y rounded-xl border bg-card">
            {alerts.map((alert) => (
              <li key={alert.key} className="flex gap-3 p-3">
                <AlertTriangle
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-warning"
                />
                <div className="min-w-0 text-sm">
                  {alert.href ? (
                    <a
                      href={alert.href}
                      className="font-medium hover:underline"
                    >
                      {alert.text}
                    </a>
                  ) : (
                    <p className="font-medium">{alert.text}</p>
                  )}
                  {alert.leads && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {alert.leads.map((lead, index) => (
                        <span key={lead.id}>
                          {index > 0 && ", "}
                          <Link
                            href={`${leadsPath}/${lead.id}`}
                            className="text-foreground hover:text-primary hover:underline"
                          >
                            {lead.name}
                          </Link>
                        </span>
                      ))}
                      {alert.more ? ` and ${alert.more} more` : ""}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="appraisals-heading" className="grid gap-3">
        <Heading id="appraisals-heading">Your appraisals today</Heading>
        {todaysAppraisals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No appraisals assigned to you today.
          </p>
        ) : (
          <ul className="grid divide-y rounded-xl border bg-card">
            {todaysAppraisals.map((appraisal) => (
              <li key={appraisal.id} className="flex items-center gap-3 p-3">
                <CalendarDays
                  aria-hidden="true"
                  className="size-4 shrink-0 text-info"
                />
                <span className="w-14 shrink-0 text-sm font-medium tabular-nums">
                  {timeFormat.format(appraisal.scheduledAt)}
                </span>
                <Link
                  href={`${leadsPath}/${appraisal.enquiry.id}`}
                  className="min-w-0 truncate text-sm hover:text-primary hover:underline"
                >
                  {appraisal.enquiry.name}
                </Link>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {appraisal.enquiry.reference}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="pipeline-heading" className="grid gap-3">
        <Heading id="pipeline-heading">Open leads by stage</Heading>
        <ul className="grid gap-2">
          {pipeline.map(({ stage, count }) => (
            <li key={stage}>
              <Link
                href={`${leadsPath}?stage=${stage}`}
                className="group grid grid-cols-[minmax(0,9rem)_1fr_2rem] items-center gap-3 text-sm"
              >
                <span className="truncate group-hover:text-primary">
                  {ENQUIRY_STAGE_LABELS[stage]}
                </span>
                <span
                  aria-hidden="true"
                  className="h-2 overflow-hidden rounded-full bg-muted"
                >
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${(count / biggest) * 100}%` }}
                  />
                </span>
                <span className="text-right font-medium tabular-nums">
                  {count}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="activity-heading" className="grid gap-3">
        <Heading id="activity-heading">Recent activity</Heading>
        {recentActivity.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No landlord lead has changed stage yet.
          </p>
        ) : (
          <ul className="grid divide-y rounded-xl border bg-card">
            {recentActivity.map((entry) => (
              <li key={entry.id} className="p-3 text-sm">
                <p>
                  <span className="font-medium">{entry.by}</span> moved{" "}
                  <Link
                    href={`${leadsPath}/${entry.enquiry.id}`}
                    className="font-medium hover:text-primary hover:underline"
                  >
                    {entry.enquiry.name}
                  </Link>{" "}
                  to {ENQUIRY_STAGE_LABELS[entry.toStage].toLowerCase()}
                </p>
                <p className="text-xs text-muted-foreground">
                  {dayTimeFormat.format(entry.at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
