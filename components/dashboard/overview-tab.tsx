import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FileText,
  Home,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  DashboardSummary,
  LeadRef,
} from "@/core/actions/application/dashboard-summary";
import { STALE_AFTER_DAYS } from "@/core/actions/application/dashboard-summary";
import { ENQUIRY_STAGE_LABELS } from "@/core/enquiries/domain/enquiry-labels";
import { cn } from "cn";
import { Avatar, Panel, Segments } from "./panel";
import { relativeTime } from "./relative-time";

// Moments are shown in UK time.
const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour: "2-digit",
  minute: "2-digit",
});

// Rows are compact throughout the dashboard.
const ROW = "px-3 py-1.5";

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

// Placeholders for modules that are not built yet. They show no figures.
const PREVIEW_ALERTS = [
  {
    key: "certificates",
    text: "Certificates nearing expiry",
    where: "Compliance, Phase 4",
    action: "Book engineer",
  },
  {
    key: "rent",
    text: "Rent running late",
    where: "Rent, Phase 4",
    action: "Send reminder",
  },
] as const;

const PREVIEW_TILES = [
  { icon: Building2, label: "Viewings today", phase: "Phase 2" },
  { icon: FileText, label: "Applications to progress", phase: "Phase 3" },
  {
    icon: AlertTriangle,
    label: "Certificates expiring (30 days)",
    phase: "Phase 4",
  },
  { icon: Home, label: "Rent overdue", phase: "Phase 4" },
] as const;

type Alert = {
  key: string;
  text: string;
  leads?: LeadRef[];
  more?: number;
  button: { label: string; href: string };
};

/** Headline numbers, alerts, today's appraisals, pipeline and recent activity. */
export function OverviewTab({
  summary,
  workspacePath,
  now = new Date(),
}: {
  summary: DashboardSummary;
  workspacePath: string;
  now?: Date;
}) {
  const { headline, attention, todaysAppraisals, pipeline, recentActivity } =
    summary;
  const leadsPath = `${workspacePath}/enquiries`;
  const pipelineTab = `${workspacePath}?tab=pipeline`;
  const { total, reachedAppraisal } = headline.recentLeads;

  const kpis = [
    {
      label: "Open leads",
      value: String(headline.openLeads),
      note: `${headline.newLeadsThisWeek} new this week`,
    },
    {
      label: "Appraisals this week",
      value: String(headline.appraisalsThisWeek),
      note: `${headline.appraisalsToday} today`,
    },
    {
      label: "Won this month",
      value: String(headline.wonThisMonth),
      note: "instructions, fees to come",
    },
    {
      label: "Lead to appraisal",
      value: total
        ? `${Math.round((reachedAppraisal / total) * 100)}%`
        : "None",
      note: total
        ? `${reachedAppraisal} of ${total}, last 30 days`
        : "no new leads, last 30 days",
    },
    {
      label: "Overdue actions",
      value: String(headline.overdueActions),
      note: "yours",
      tone: headline.overdueActions > 0 ? "text-destructive" : "",
    },
    {
      label: "No next action",
      value: String(headline.leadsWithoutNextAction),
      note: "landlord leads",
      tone: headline.leadsWithoutNextAction > 0 ? "text-warning" : "",
    },
  ];

  const alerts: Alert[] = [];
  if (headline.overdueActions > 0) {
    alerts.push({
      key: "overdue",
      text: `${plural(headline.overdueActions, "action is", "actions are")} overdue`,
      button: { label: "View", href: "#actions-heading" },
    });
  }
  const groups = [
    {
      key: "none",
      list: attention.noNextAction,
      text: (n: number) =>
        `${plural(n, "landlord lead has", "landlord leads have")} no next action`,
      many: "Review",
    },
    {
      key: "person",
      list: attention.noLeadPerson,
      text: (n: number) =>
        `${plural(n, "landlord lead has", "landlord leads have")} nobody looking after ${n === 1 ? "it" : "them"}`,
      many: "Assign",
    },
    {
      key: "waiting",
      list: attention.waitingInStage,
      text: (n: number) =>
        `${plural(n, "landlord lead has", "landlord leads have")} waited ${STALE_AFTER_DAYS} days or more in one stage`,
      many: "Review",
    },
  ];
  for (const { key, list, text, many } of groups) {
    if (list.count === 0) continue;
    const only = list.count === 1 ? list.items[0] : null;
    alerts.push({
      key,
      text: text(list.count),
      leads: list.items.slice(0, 3),
      more: list.count - Math.min(list.items.length, 3),
      button:
        only && key !== "person"
          ? { label: "Open lead", href: `${leadsPath}/${only.id}` }
          : { label: many, href: pipelineTab },
    });
  }

  const biggest = Math.max(1, ...pipeline.map(({ count }) => count));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <ul
        aria-label="Headline numbers"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-6"
      >
        {kpis.map((kpi) => (
          <li
            key={kpi.label}
            className="min-w-0 rounded-xl bg-card px-3 py-2 shadow-xs ring-1 ring-foreground/10"
          >
            <p className="truncate text-xs text-muted-foreground">
              {kpi.label}
            </p>
            <p className={cn("text-xl font-semibold tabular-nums", kpi.tone)}>
              {kpi.value}
            </p>
            <p className="truncate text-xs text-muted-foreground">{kpi.note}</p>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <Panel
          title="Needs attention"
          right={<Badge variant="secondary">{alerts.length}</Badge>}
        >
          {alerts.length === 0 ? (
            <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
              <CheckCircle2
                aria-hidden="true"
                className="size-4 text-success"
              />
              Nothing needs attention right now.
            </p>
          ) : (
            <ul className="divide-y">
              {alerts.map((alert) => (
                <li
                  key={alert.key}
                  className={cn("flex items-center gap-2", ROW)}
                >
                  <AlertTriangle
                    aria-hidden="true"
                    className="size-4 shrink-0 text-warning"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{alert.text}</p>
                    {alert.leads && (
                      <p className="truncate text-xs text-muted-foreground">
                        {alert.leads.map((lead, index) => (
                          <span key={lead.id}>
                            {index > 0 && ", "}
                            <Link
                              href={`${leadsPath}/${lead.id}`}
                              className="hover:text-primary hover:underline"
                            >
                              {lead.name}
                            </Link>
                          </span>
                        ))}
                        {alert.more ? ` and ${alert.more} more` : ""}
                      </p>
                    )}
                  </div>
                  <Button
                    size="xs"
                    variant="outline"
                    render={<Link href={alert.button.href} />}
                    nativeButton={false}
                  >
                    {alert.button.label}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <ul className="divide-y border-t border-dashed">
            {PREVIEW_ALERTS.map((alert) => (
              <li
                key={alert.key}
                className={cn("flex items-center gap-2 opacity-70", ROW)}
              >
                <AlertTriangle
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{alert.text}</p>
                  <p className="text-xs text-muted-foreground">
                    Preview · {alert.where}
                  </p>
                </div>
                <Button size="xs" variant="outline" disabled>
                  {alert.action}
                </Button>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Today's schedule"
          right={
            <Button
              size="xs"
              variant="ghost"
              render={<Link href={`${workspacePath}?tab=schedule`} />}
              nativeButton={false}
            >
              Plan the day
            </Button>
          }
        >
          {todaysAppraisals.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              No appraisals assigned to you today.
            </p>
          ) : (
            <ol className="divide-y">
              {todaysAppraisals.map((appraisal) => (
                <li
                  key={appraisal.id}
                  className={cn("flex items-center gap-3", ROW)}
                >
                  <span className="w-11 shrink-0 text-sm font-semibold tabular-nums">
                    {timeFormat.format(appraisal.scheduledAt)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {appraisal.enquiry.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {appraisal.enquiry.reference}
                    </p>
                  </div>
                  <Button
                    size="xs"
                    render={
                      <Link href={`${leadsPath}/${appraisal.enquiry.id}`} />
                    }
                    nativeButton={false}
                  >
                    <FileText aria-hidden="true" />
                    Outcome
                  </Button>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel
          title="Pipeline"
          right={
            <Button
              size="xs"
              variant="ghost"
              render={<Link href={pipelineTab} />}
              nativeButton={false}
            >
              Open board
            </Button>
          }
        >
          <ul className="grid gap-1 p-2">
            {pipeline.map(({ stage, count }) => (
              <li key={stage} className="px-1 py-1">
                <Link
                  href={`${leadsPath}?stage=${stage}`}
                  className="group grid gap-1"
                >
                  <span className="flex items-center text-sm">
                    <span className="flex-1 group-hover:text-primary">
                      {ENQUIRY_STAGE_LABELS[stage]}
                    </span>
                    <span className="w-6 text-right font-semibold tabular-nums">
                      {count}
                    </span>
                  </span>
                  <Segments
                    filled={count ? Math.max(1, (count / biggest) * 14) : 0}
                    label={`${plural(count, "lead", "leads")} at ${ENQUIRY_STAGE_LABELS[stage]}`}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Recent activity">
          {recentActivity.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              No landlord lead has changed stage yet.
            </p>
          ) : (
            <ul className="divide-y">
              {recentActivity.map((entry) => (
                <li
                  key={entry.id}
                  className={cn("flex items-start gap-2.5", ROW)}
                >
                  <Avatar name={entry.by} className="mt-0.5" />
                  <p className="min-w-0 flex-1 text-sm">
                    <span className="font-medium">{entry.by}</span> moved{" "}
                    <Link
                      href={`${leadsPath}/${entry.enquiry.id}`}
                      className="font-medium hover:text-primary hover:underline"
                    >
                      {entry.enquiry.name}
                    </Link>{" "}
                    to {ENQUIRY_STAGE_LABELS[entry.toStage].toLowerCase()}
                  </p>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {relativeTime(entry.at, now)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Coming with later modules"
        right={<Badge variant="outline">Preview</Badge>}
      >
        <ul className="grid gap-2 p-2 sm:grid-cols-2 2xl:grid-cols-4">
          {PREVIEW_TILES.map((tile) => (
            <li
              key={tile.label}
              className="flex items-center gap-3 rounded-lg border border-dashed p-3"
            >
              <tile.icon
                aria-hidden="true"
                className="size-5 shrink-0 text-muted-foreground"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-muted-foreground">
                  {tile.label}
                </p>
                <p
                  className="text-lg font-semibold text-muted-foreground"
                  aria-label="Not available yet"
                >
                  —
                </p>
              </div>
              <Badge variant="secondary">{tile.phase}</Badge>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
