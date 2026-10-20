"use client";

import {
  ArrowRight,
  Building2,
  ClipboardCheck,
  Home,
  Inbox,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import {
  AvailabilityBadge,
  KpiTile,
  Segments,
  SectionHeading,
  TODAY_LABEL,
  type Availability,
} from "./shared";

/* Sample data only: every name, address and figure is fictional. */

type AreaId = "home" | "landlords" | "marketing" | "pre-tenancy" | "management";

type Area = {
  id: AreaId;
  label: string;
  short: string;
  icon: LucideIcon;
  availability: Availability;
};

const AREAS: Area[] = [
  {
    id: "home",
    label: "Home",
    short: "Headline numbers and your day",
    icon: Home,
    availability: "now",
  },
  {
    id: "landlords",
    label: "Landlords & instructions",
    short: "Leads, appraisals, onboarding",
    icon: Inbox,
    availability: "now",
  },
  {
    id: "marketing",
    label: "Marketing & applicants",
    short: "Listings, enquiries, viewings, offers",
    icon: Building2,
    availability: "phase2",
  },
  {
    id: "pre-tenancy",
    label: "Pre-tenancy",
    short: "Referencing, contracts, move-in",
    icon: ClipboardCheck,
    availability: "phase3",
  },
  {
    id: "management",
    label: "Management",
    short: "Tenancies, rent, compliance, repairs",
    icon: Wrench,
    availability: "phase4",
  },
];

const areaById = (id: AreaId) => AREAS.find((area) => area.id === id)!;

/* ---------- small shared pieces ---------- */

function Panel({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count?: number;
  tone?: "destructive" | "warning";
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-2 rounded-xl bg-card p-4 shadow-xs ring-1 ring-foreground/10"
    >
      <SectionHeading title={title} count={count} tone={tone} />
      {children}
    </section>
  );
}

function Rows({
  rows,
}: {
  rows: { title: string; note: string; aside?: string }[];
}) {
  return (
    <ul className="divide-y">
      {rows.map((row) => (
        <li
          key={row.title}
          className="flex items-center justify-between gap-3 py-2 text-sm"
        >
          <span className="min-w-0">
            <span className="block truncate font-medium">{row.title}</span>
            <span className="block text-xs text-muted-foreground">
              {row.note}
            </span>
          </span>
          {row.aside && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {row.aside}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function AreaHeader({ area }: { area: Area }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-lg font-semibold tracking-tight">{area.label}</h2>
      <AvailabilityBadge value={area.availability} />
    </div>
  );
}

/* ---------- the dashboards ---------- */

type Figure = {
  label: string;
  value: string;
  tone?: "warning" | "destructive";
};

const HOME_CARDS: { id: AreaId; figures: Figure[] }[] = [
  {
    id: "landlords",
    figures: [
      { label: "Open leads", value: "14" },
      { label: "In onboarding", value: "6" },
      { label: "Stalled 7 days", value: "2", tone: "warning" },
    ],
  },
  {
    id: "marketing",
    figures: [
      { label: "Live listings", value: "23" },
      { label: "Viewings today", value: "5" },
      { label: "Offers to review", value: "3" },
    ],
  },
  {
    id: "pre-tenancy",
    figures: [
      { label: "Referencing", value: "7" },
      { label: "Move-ins this week", value: "4" },
      { label: "Blocked", value: "2", tone: "destructive" },
    ],
  },
  {
    id: "management",
    figures: [
      { label: "Tenancies managed", value: "118" },
      { label: "Rent overdue", value: "6", tone: "destructive" },
      { label: "Certificates due (30d)", value: "9", tone: "warning" },
    ],
  },
];

const INITIAL_ACTIONS = [
  { id: "a1", title: "Send fee guide to Dev Patel", note: "Overdue 2 days" },
  { id: "a2", title: "Chase landlord for gas certificate", note: "Today" },
  { id: "a3", title: "Call plumber about 12 Hall Gardens", note: "Today" },
  { id: "a4", title: "Email the inventory clerk", note: "Tomorrow" },
];

function HomeDashboard({ open }: { open: (id: AreaId) => void }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  return (
    <div className="grid gap-5">
      <p className="text-sm text-muted-foreground">
        Three numbers per area with a button into each, then your own day. Your
        actions and schedule stay in view on the right, as they do today.
      </p>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="grid min-w-0 gap-5">
          <div className="grid gap-4 md:grid-cols-2">
            {HOME_CARDS.map(({ id, figures }) => {
              const area = areaById(id);
              const Icon = area.icon;
              return (
                <section
                  key={id}
                  aria-label={area.label}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 rounded-xl bg-card p-4 shadow-xs ring-1 ring-foreground/10"
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      aria-hidden="true"
                      className="size-4 text-muted-foreground"
                    />
                    <h3 className="text-sm font-semibold">{area.label}</h3>
                    <span className="ml-auto">
                      <AvailabilityBadge value={area.availability} />
                    </span>
                  </div>
                  <dl className="grid grid-cols-3 gap-2">
                    {figures.map((figure) => (
                      <div key={figure.label} className="min-w-0">
                        <dt className="text-xs leading-tight text-muted-foreground">
                          {figure.label}
                        </dt>
                        <dd
                          className={cn(
                            "text-2xl font-semibold tabular-nums",
                            figure.tone === "warning" && "text-warning",
                            figure.tone === "destructive" && "text-destructive",
                          )}
                        >
                          {figure.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    onClick={() => open(id)}
                  >
                    Open {area.label}
                    <ArrowRight aria-hidden="true" />
                  </Button>
                </section>
              );
            })}
          </div>
          <Panel title="My leads and instructions" count={3}>
            <Rows
              rows={[
                {
                  title: "5 Orchard Close",
                  note: "Instruction · onboarding",
                  aside: "Last change 8 days ago",
                },
                {
                  title: "Hawthorne Property Holdings Ltd",
                  note: "Lead · appraisal booked",
                  aside: "Thu 22 Oct",
                },
                {
                  title: "Dev Patel",
                  note: "Lead · new enquiry",
                  aside: "No next action",
                },
              ]}
            />
          </Panel>
        </div>
        <div className="grid min-w-0 gap-5">
          <Panel title="My actions" count={INITIAL_ACTIONS.length - done.size}>
            <ul className="divide-y">
              {INITIAL_ACTIONS.map((action) => {
                const finished = done.has(action.id);
                return (
                  <li key={action.id} className="flex items-center gap-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Finish ${action.title}`}
                      checked={finished}
                      onChange={() =>
                        setDone((previous) => {
                          const next = new Set(previous);
                          if (finished) next.delete(action.id);
                          else next.add(action.id);
                          return next;
                        })
                      }
                      className="size-4"
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-sm font-medium",
                          finished && "text-muted-foreground line-through",
                        )}
                      >
                        {action.title}
                      </span>
                      <span
                        className={cn(
                          "block text-xs",
                          action.note.startsWith("Overdue")
                            ? "text-destructive"
                            : "text-muted-foreground",
                        )}
                      >
                        {action.note}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>
          <Panel title="Today's schedule" count={3}>
            <ul className="divide-y">
              {[
                ["09:30", "Appraisal", "14 Bridge Street, Oakfield"],
                ["12:00", "Viewing", "Flat 4, 12 Station Road"],
                ["15:30", "Call", "Eleanor Price, about terms"],
              ].map(([time, kind, where]) => (
                <li key={time} className="flex gap-3 py-2 text-sm">
                  <span className="w-12 shrink-0 font-medium tabular-nums">
                    {time}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{kind}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {where}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function LandlordsDashboard() {
  return (
    <div className="grid gap-5">
      <p className="text-sm text-muted-foreground">
        Where leads become instructions. This is most of today&apos;s Overview,
        moved out of the way so Home can stay calm.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <KpiTile label="Open leads" value="14" note="3 new this week" />
        <KpiTile label="Appraisals this week" value="5" note="2 today" />
        <KpiTile label="In onboarding" value="6" />
        <KpiTile label="Ready to market" value="9" tone="success" />
        <KpiTile label="Stalled 7 days" value="2" tone="warning" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Lead pipeline">
          <ul className="grid gap-3 pt-1">
            {[
              ["New enquiry", 5, 14],
              ["Appraisal booked", 6, 14],
              ["Appraisal completed", 3, 14],
            ].map(([stage, count, total]) => (
              <li key={String(stage)} className="grid gap-1">
                <span className="flex justify-between text-sm">
                  <span>{stage}</span>
                  <span className="font-medium tabular-nums">{count}</span>
                </span>
                <Segments
                  filled={Math.round((Number(count) / Number(total)) * 12)}
                  label={`${stage}: ${count} of ${total}`}
                />
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Onboarding that has gone quiet" count={2} tone="warning">
          <Rows
            rows={[
              {
                title: "5 Orchard Close",
                note: "INS-4K2M9Q",
                aside: "Last change 8 days ago",
              },
              {
                title: "Flat 2, 12 Station Road",
                note: "INS-7H3RT2",
                aside: "Last change 11 days ago",
              },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}

type FutureArea = {
  intro: string;
  kpis: {
    label: string;
    value: string;
    tone?: "warning" | "destructive" | "success";
  }[];
  listTitle: string;
  tone?: "warning" | "destructive";
  rows: { title: string; note: string; aside?: string }[];
  segments: { label: string; filled: number }[];
  segmentsTitle: string;
};

const FUTURE: Record<"marketing" | "pre-tenancy" | "management", FutureArea> = {
  marketing: {
    intro:
      "Roadmap Phase 2. Getting a property let: listings, applicant enquiries, viewings and offers.",
    kpis: [
      { label: "Live listings", value: "23" },
      { label: "New enquiries", value: "17", tone: "success" },
      { label: "Viewings today", value: "5" },
      { label: "Offers to review", value: "3", tone: "warning" },
    ],
    segmentsTitle: "Applicants by stage",
    segments: [
      { label: "Enquiry", filled: 9 },
      { label: "Viewing booked", filled: 6 },
      { label: "Offer made", filled: 3 },
    ],
    listTitle: "Viewings today",
    rows: [
      { title: "Flat 4, 12 Station Road", note: "Priya Nair", aside: "10:00" },
      { title: "5 Orchard Close", note: "Ruby Clarke", aside: "12:30" },
      { title: "14 Bridge Street", note: "Priya Nair", aside: "16:00" },
    ],
  },
  "pre-tenancy": {
    intro:
      "Roadmap Phase 3. From accepted offer to keys: referencing, contracts, payments and move-in.",
    kpis: [
      { label: "Referencing", value: "7" },
      { label: "Contracts to sign", value: "3", tone: "warning" },
      { label: "Move-ins this week", value: "4" },
      { label: "Blocked", value: "2", tone: "destructive" },
    ],
    segmentsTitle: "Progress to move-in",
    segments: [
      { label: "Referencing", filled: 7 },
      { label: "Contract", filled: 5 },
      { label: "Ready to move in", filled: 4 },
    ],
    listTitle: "Blocked move-ins",
    tone: "destructive",
    rows: [
      {
        title: "Flat 2, 12 Station Road",
        note: "Guarantor reference outstanding",
        aside: "Move-in Mon",
      },
      {
        title: "9 Mill Lane",
        note: "Holding deposit not received",
        aside: "Move-in Wed",
      },
    ],
  },
  management: {
    intro:
      "Roadmap Phase 4. Looking after let properties: rent, compliance, maintenance and renewals.",
    kpis: [
      { label: "Tenancies managed", value: "118" },
      { label: "Rent overdue", value: "6", tone: "destructive" },
      { label: "Certificates due (30d)", value: "9", tone: "warning" },
      { label: "Open repairs", value: "12" },
    ],
    segmentsTitle: "Repairs by status",
    segments: [
      { label: "Reported", filled: 4 },
      { label: "Contractor booked", filled: 5 },
      { label: "Awaiting approval", filled: 3 },
    ],
    listTitle: "Rent overdue",
    tone: "destructive",
    rows: [
      { title: "3 Cedar Court", note: "Amelia Shaw", aside: "9 days" },
      { title: "21 Park Road", note: "Olivia Hart", aside: "5 days" },
      { title: "Flat 7, Elm House", note: "Ruby Clarke", aside: "3 days" },
    ],
  },
};

function FutureDashboard({ id }: { id: keyof typeof FUTURE }) {
  const data = FUTURE[id];
  return (
    <div className="grid gap-5">
      <p className="text-sm text-muted-foreground">{data.intro}</p>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {data.kpis.map((kpi) => (
          <KpiTile
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            tone={kpi.tone}
          />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={data.segmentsTitle}>
          <ul className="grid gap-3 pt-1">
            {data.segments.map((segment) => (
              <li key={segment.label} className="grid gap-1">
                <span className="text-sm">{segment.label}</span>
                <Segments
                  filled={segment.filled}
                  label={`${segment.label}: ${segment.filled} of 12`}
                />
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title={data.listTitle} count={data.rows.length} tone={data.tone}>
          <Rows rows={data.rows} />
        </Panel>
      </div>
    </div>
  );
}

function renderArea(id: AreaId, open: (id: AreaId) => void) {
  switch (id) {
    case "home":
      return <HomeDashboard open={open} />;
    case "landlords":
      return <LandlordsDashboard />;
    default:
      return <FutureDashboard id={id} />;
  }
}

function TabsNav({
  current,
  onSelect,
}: {
  current: AreaId;
  onSelect: (id: AreaId) => void;
}) {
  return (
    <nav
      aria-label="Dashboards"
      className="flex gap-1 overflow-x-auto border-b px-3 pt-2"
    >
      {AREAS.map((area) => {
        const active = area.id === current;
        return (
          <button
            key={area.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onSelect(area.id)}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {area.label}
          </button>
        );
      })}
    </nav>
  );
}

export function StructureLab() {
  const [current, setCurrent] = useState<AreaId>("home");
  const area = areaById(current);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="mr-auto">
            <p className="text-sm font-semibold">Dashboard structure</p>
            <p className="text-xs text-muted-foreground">
              Mock-up with sample data, dated {TODAY_LABEL}. Click through each
              tab, and try light, dark and a narrow window.
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

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:py-8">
        <div className="grid gap-2 rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground">
          <p>
            <span className="font-semibold">Chosen direction:</span> one
            Dashboard page with tabs across the top. Home holds headline numbers
            for each area plus your own day; each area has its own tab.
          </p>
          <p className="text-xs">
            Each person only sees the tabs their role may use, and an area with
            no modules built yet is shown as a clearly labelled placeholder. On
            a phone the tabs scroll sideways.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl bg-background ring-1 ring-foreground/15">
          <TabsNav current={current} onSelect={setCurrent} />
          <div className="min-w-0 p-4 sm:p-6">
            <div className="grid gap-5">
              <div className="grid gap-1">
                <AreaHeader area={area} />
                <p className="text-sm text-muted-foreground">{area.short}</p>
              </div>
              {renderArea(current, setCurrent)}
              <p className="text-xs text-muted-foreground">
                Web address would be{" "}
                <span className="font-mono">
                  /dashboard/w/oakfield?tab={current}
                </span>
                .
              </p>
            </div>
          </div>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="info">Mock-up</Badge>
          Nothing here reads real records. Figures for Marketing, Pre-tenancy
          and Management are invented to show the layout.
        </p>
      </div>
    </main>
  );
}
