import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
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
import { Avatar, Panel } from "./panel";
import { relativeTime } from "./relative-time";

// Rows are compact throughout the dashboard.
const ROW = "px-3 py-1.5";

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

type Alert = {
  key: string;
  text: string;
  leads?: LeadRef[];
  more?: number;
  button: { label: string; href: string };
};

/**
 * Landlords & instructions: headline numbers, what needs attention, and recent
 * activity. The instruction onboarding panel is passed in so it sits in the
 * same grid.
 */
export function LandlordsOverview({
  summary,
  workspacePath,
  instructionPanel,
  now = new Date(),
}: {
  summary: DashboardSummary;
  workspacePath: string;
  instructionPanel?: ReactNode;
  now?: Date;
}) {
  const { headline, attention, recentActivity } = summary;
  const leadsPath = `${workspacePath}/enquiries`;
  const boardHref = `${workspacePath}?tab=landlords#lead-board`;
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
      label: "No next action",
      value: String(headline.leadsWithoutNextAction),
      note: "landlord leads",
      tone: headline.leadsWithoutNextAction > 0 ? "text-warning" : "",
    },
  ];

  const alerts: Alert[] = [];
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
          : { label: many, href: boardHref },
    });
  }

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
        </Panel>

        {instructionPanel}

        <Panel title="Recent activity" className="lg:col-span-2">
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
    </div>
  );
}
