"use client";

import {
  ArrowRight,
  BedDouble,
  Building2,
  CalendarDays,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  FileDown,
  FileSignature,
  GitBranch,
  Megaphone,
  Pencil,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/* Sample data only: every value is fictional. */

const PROPERTY = {
  address: "14 Riverside Mews, Demo Town",
  postcode: "ZZ1 4AB",
  type: "Flat",
  reference: "PRP-DEMO4AB1",
  branch: "Main Branch",
  bedrooms: "2",
  lead: "Hawthorne Property Holdings Ltd",
};

const INSTRUCTION = {
  reference: "INS-DEMO7Q2K",
  service: "Fully managed",
  instructed: "06/10/2026",
  leadStaff: "Olivia Hart",
};

type ChecklistItem = { label: string; met: boolean; tab: string };

const CHECKLIST: ChecklistItem[] = [
  { label: "Lead staff member", met: true, tab: "overview" },
  { label: "Main landlord contact", met: true, tab: "landlords" },
  { label: "Service", met: true, tab: "terms" },
  { label: "Asking rent", met: true, tab: "terms" },
  { label: "Agency fee and VAT", met: true, tab: "terms" },
  { label: "Deposit offered", met: true, tab: "terms" },
  { label: "Signed agreement uploaded", met: false, tab: "landlords" },
  { label: "Ownership check verified", met: false, tab: "landlords" },
];

const TERMS: [string, string][] = [
  ["Service", "Fully managed"],
  ["Asking rent", "£1,450 per month"],
  ["Management fee", "12% of rent, monthly, plus VAT"],
  ["Extra charges", "Tenancy set-up £300 plus VAT"],
  ["Deposit", "Standard deposit, £1,673"],
];

const LANDLORDS = [
  { name: "Hawthorne Property Holdings Ltd", main: true, kind: "Organisation" },
  { name: "Mr Daniel Foster", main: false, kind: "Person" },
];

type ComplianceRow = {
  area: string;
  applicability: string;
  status: string | null;
  tone: "success" | "warning" | "destructive" | "secondary" | "info";
  detail: string;
  expired?: boolean;
};

const COMPLIANCE: ComplianceRow[] = [
  {
    area: "EPC and minimum energy efficiency",
    applicability: "Applies",
    status: "Reviewed",
    tone: "success",
    detail: "Dated 12/03/2024 · expires 11/03/2034 · rating C",
  },
  {
    area: "Gas safety record (CP12)",
    applicability: "Applies",
    status: "Reviewed",
    tone: "success",
    detail: "Dated 02/09/2025 · expires 01/09/2026",
    expired: true,
  },
  {
    area: "Electrical safety (EICR)",
    applicability: "Applies",
    status: "Awaiting evidence",
    tone: "warning",
    detail: "Engineer booked by the landlord",
  },
  {
    area: "Smoke and carbon monoxide alarms",
    applicability: "Not assessed",
    status: null,
    tone: "secondary",
    detail: "",
  },
  {
    area: "Property licensing",
    applicability: "Does not apply",
    status: null,
    tone: "secondary",
    detail: "Not in a selective licensing area (council letter, 2025)",
  },
];

const HISTORY = [
  ["18/10/2026", "Ownership check recorded as Requested", "Sam Carter"],
  ["15/10/2026", "Agreement marked as Sent", "Olivia Hart"],
  ["10/10/2026", "Terms updated (version 2): asking rent", "Olivia Hart"],
  ["06/10/2026", "Instruction started from lead ENQ-DEMO3K", "Olivia Hart"],
];

const PREVIOUS_INSTRUCTIONS = [
  {
    reference: "INS-DEMO1A9F",
    detail: "Let only · Ended 30/06/2025 · Landlord moved back in",
  },
];

const LEADS = [
  { reference: "ENQ-DEMO3K", name: "Daniel Foster", stage: "Instruction won" },
];

const NOTES = [
  {
    author: "Olivia Hart",
    when: "15 Oct 2026, 10:30",
    body: "Landlord will send the signed agreement once the director is back on Friday.",
  },
];

/* ---------- Small building blocks ---------- */

function Pair({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex gap-3">
      <Icon
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 text-sm font-medium [overflow-wrap:anywhere]">
          {value}
        </dd>
      </div>
    </div>
  );
}

function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-base font-semibold">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

function ReadinessBar({ met, total }: { met: number; total: number }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Ready to market checklist</span>
        <span>
          {met} of {total} done
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full bg-primary ${met === total ? "w-full" : "w-3/4"}`}
        />
      </div>
    </div>
  );
}

function ComplianceList({
  compact = false,
  canUpdate = true,
}: {
  compact?: boolean;
  canUpdate?: boolean;
}) {
  return (
    <ul className="grid divide-y border-t">
      {COMPLIANCE.map((row) => (
        <li
          key={row.area}
          className={`flex flex-wrap items-start justify-between gap-3 ${compact ? "py-2.5" : "py-4"}`}
        >
          <div className="min-w-0">
            <p className="text-sm font-medium">{row.area}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge
                variant={row.applicability === "Applies" ? "info" : "secondary"}
              >
                {row.applicability}
              </Badge>
              {row.status && <Badge variant={row.tone}>{row.status}</Badge>}
              {row.expired && <Badge variant="destructive">Expired</Badge>}
            </div>
            {!compact && row.detail && (
              <p className="mt-1.5 text-sm text-muted-foreground">
                {row.detail}
              </p>
            )}
          </div>
          {canUpdate && !compact && (
            <Button size="sm" variant="outline">
              <ClipboardCheck aria-hidden="true" />
              Update
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ---------- Tab contents: instruction ---------- */

function NextStep({ ready }: { ready: boolean }) {
  if (!ready) {
    const missing = CHECKLIST.filter((item) => !item.met);
    return (
      <div className="grid gap-1 rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground">
        <p className="font-medium">Next: {missing[0].label.toLowerCase()}</p>
        <p>
          {missing.length} item{missing.length === 1 ? "" : "s"} left before
          this instruction is Ready to market.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-success-soft px-4 py-3 text-sm">
      <div className="min-w-0">
        <p className="font-medium text-success">Ready to market</p>
        <p className="text-foreground">
          Next: prepare the listing. This only prepares an advert inside Zayto;
          nothing is published.
        </p>
      </div>
      <Button size="sm">
        <Megaphone aria-hidden="true" />
        Prepare listing
      </Button>
    </div>
  );
}

function InstructionOverview({
  ready,
  goTo,
}: {
  ready: boolean;
  goTo: (tab: string) => void;
}) {
  const met = ready ? CHECKLIST.length : CHECKLIST.filter((i) => i.met).length;
  return (
    <div className="grid gap-8">
      <NextStep ready={ready} />
      <section className="grid gap-4">
        <SectionHeading title="Readiness" />
        <ReadinessBar met={met} total={CHECKLIST.length} />
        <ul className="grid gap-2 sm:grid-cols-2">
          {CHECKLIST.map((item) => {
            const isMet = ready || item.met;
            return (
              <li key={item.label} className="flex items-center gap-2 text-sm">
                {isMet ? (
                  <CheckCircle2
                    className="size-4 shrink-0 text-success"
                    aria-hidden="true"
                  />
                ) : (
                  <Circle
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
                <span className={isMet ? "" : "font-medium"}>{item.label}</span>
                {!isMet && (
                  <button
                    type="button"
                    onClick={() => goTo(item.tab)}
                    className="ml-auto text-xs text-primary underline-offset-4 hover:underline"
                  >
                    Go to it
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      <section className="grid gap-4 border-t pt-6">
        <SectionHeading
          title="Key terms"
          action={
            <button
              type="button"
              onClick={() => goTo("terms")}
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              All terms
            </button>
          }
        />
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {TERMS.slice(0, 4).map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="grid gap-3 border-t pt-6">
        <SectionHeading
          title="Property compliance"
          description="For information: it does not affect Ready to market. It will gate Ready to advertise on the listing."
          action={
            <button
              type="button"
              onClick={() => goTo("compliance")}
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              Open compliance
            </button>
          }
        />
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Gas safety record expired on 01/09/2026.
        </p>
        <ComplianceList compact canUpdate={false} />
      </section>
    </div>
  );
}

function InstructionTerms() {
  return (
    <div className="grid gap-6">
      <SectionHeading
        title="Terms"
        description="Version 2, saved 10/10/2026 by Olivia Hart."
        action={
          <Button size="sm" variant="outline">
            <Pencil aria-hidden="true" />
            Edit terms
          </Button>
        }
      />
      <dl className="grid divide-y border-t">
        {TERMS.map(([label, value]) => (
          <div
            key={label}
            className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)]"
          >
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <details>
        <summary className="w-fit cursor-pointer text-sm text-primary underline-offset-4 hover:underline">
          Earlier versions (1)
        </summary>
        <p className="mt-3 border-t py-3 text-sm text-muted-foreground">
          Version 1 · 06/10/2026 · asking rent £1,400 per month
        </p>
      </details>
    </div>
  );
}

function InstructionLandlords() {
  return (
    <div className="grid gap-10">
      <section className="grid gap-4">
        <SectionHeading
          title="Landlords"
          description="Every landlord must sign the agreement."
          action={
            <Button size="sm" variant="outline">
              <UserRound aria-hidden="true" />
              Manage landlords
            </Button>
          }
        />
        <ul className="grid divide-y border-t">
          {LANDLORDS.map((landlord) => (
            <li
              key={landlord.name}
              className="flex flex-wrap items-center gap-2 py-3"
            >
              <span className="text-sm font-medium">{landlord.name}</span>
              <span className="text-xs text-muted-foreground">
                {landlord.kind}
              </span>
              {landlord.main && <Badge variant="secondary">Main contact</Badge>}
            </li>
          ))}
        </ul>
      </section>
      <section className="grid gap-4">
        <SectionHeading
          title="Signed agreement"
          description="Signing happens outside Zayto. Upload the copy every landlord has signed."
          action={
            <Button size="sm">
              <FileSignature aria-hidden="true" />
              Add signed agreement
            </Button>
          }
        />
        <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
          <Badge variant="warning">No signed agreement</Badge>
          <span className="text-muted-foreground">
            Sent 15/10/2026 · Prepared 12/10/2026
          </span>
        </div>
      </section>
      <section className="grid gap-4">
        <SectionHeading
          title="Ownership check"
          action={
            <Button size="sm" variant="outline">
              <ShieldCheck aria-hidden="true" />
              Record check
            </Button>
          }
        />
        <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
          <Badge variant="warning">Requested</Badge>
          <span className="text-muted-foreground">
            18/10/2026 · Land Registry title requested
          </span>
        </div>
      </section>
    </div>
  );
}

function InstructionCompliance() {
  return (
    <div className="grid gap-4">
      <SectionHeading
        title="Property compliance"
        description="The same records as on the property page. Changes here update the property."
      />
      <ComplianceList />
    </div>
  );
}

function InstructionHistory() {
  return (
    <div className="grid gap-4">
      <SectionHeading title="History" />
      <ol className="grid divide-y border-t">
        {HISTORY.map(([when, what, who]) => (
          <li key={what} className="grid gap-0.5 py-3">
            <p className="text-sm font-medium">{what}</p>
            <p className="text-xs text-muted-foreground">
              {when} · {who}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------- Tab contents: property ---------- */

function PropertyOverview({ goTo }: { goTo: (tab: string) => void }) {
  return (
    <div className="grid gap-8">
      <section className="grid gap-4">
        <SectionHeading title="Current instruction" />
        <div className="grid gap-4 rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                <span className="text-primary">{INSTRUCTION.reference}</span> ·{" "}
                {INSTRUCTION.service}
              </p>
              <p className="text-xs text-muted-foreground">
                Instructed {INSTRUCTION.instructed} · {PROPERTY.lead}
              </p>
            </div>
            <Badge variant="info">Onboarding</Badge>
          </div>
          <ReadinessBar met={6} total={8} />
          <p className="text-sm text-muted-foreground">
            Still needed: signed agreement uploaded, ownership check verified.
          </p>
          <Button size="sm" variant="outline" className="w-fit">
            Open instruction
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </section>
      <section className="grid gap-3 border-t pt-6">
        <SectionHeading
          title="Compliance"
          action={
            <button
              type="button"
              onClick={() => goTo("compliance")}
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              Open compliance
            </button>
          }
        />
        <div className="flex flex-wrap gap-2">
          <Badge variant="destructive">1 expired</Badge>
          <Badge variant="warning">1 awaiting evidence</Badge>
          <Badge variant="secondary">1 not assessed</Badge>
          <Badge variant="success">1 reviewed</Badge>
        </div>
      </section>
      <section className="grid gap-3 border-t pt-6">
        <SectionHeading title="Owners" />
        <ul className="grid divide-y border-t">
          {LANDLORDS.map((owner) => (
            <li key={owner.name} className="flex items-center gap-2 py-3">
              <span className="text-sm font-medium">{owner.name}</span>
              {owner.main && <Badge variant="secondary">Lead landlord</Badge>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function PropertyInstructions() {
  return (
    <div className="grid gap-4">
      <SectionHeading
        title="Instructions"
        description="One can be current at a time."
      />
      <ul className="grid divide-y border-t">
        <li className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div>
            <p className="text-sm font-medium text-primary">
              {INSTRUCTION.reference}
            </p>
            <p className="text-xs text-muted-foreground">
              {INSTRUCTION.service} · Instructed {INSTRUCTION.instructed}
            </p>
          </div>
          <Badge variant="info">Onboarding</Badge>
        </li>
        {PREVIOUS_INSTRUCTIONS.map((item) => (
          <li
            key={item.reference}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div>
              <p className="text-sm font-medium text-primary">
                {item.reference}
              </p>
              <p className="text-xs text-muted-foreground">{item.detail}</p>
            </div>
            <Badge variant="secondary">Ended</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PropertyCompliance() {
  return (
    <div className="grid gap-4">
      <SectionHeading
        title="Compliance"
        description="Dates are as entered from the evidence; Zayto does not decide whether the property is compliant."
      />
      <ComplianceList />
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <FileDown className="size-4" aria-hidden="true" />
        Each area keeps its evidence history and downloads.
      </p>
    </div>
  );
}

function PropertyLeads() {
  return (
    <div className="grid gap-4">
      <SectionHeading title="Landlord leads" />
      <ul className="grid divide-y border-t">
        {LEADS.map((lead) => (
          <li
            key={lead.reference}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <p className="text-sm font-medium">
              <span className="text-primary">{lead.reference}</span> ·{" "}
              {lead.name}
            </p>
            <Badge variant="secondary">{lead.stage}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PropertyNotes() {
  return (
    <div className="grid gap-4">
      <SectionHeading title="Notes" />
      <ul className="grid divide-y border-t">
        {NOTES.map((note) => (
          <li key={note.body} className="grid gap-1 py-3">
            <p className="text-sm">{note.body}</p>
            <p className="text-xs text-muted-foreground">
              {note.author} · {note.when}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Profile sidebars ---------- */

function InstructionSidebar({ ready }: { ready: boolean }) {
  return (
    <header className="grid content-start gap-6">
      <div className="flex items-center gap-4 lg:flex-col lg:items-start">
        <span
          aria-hidden="true"
          className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-accent text-primary"
        >
          <FileSignature className="size-6" />
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight">
            {PROPERTY.address}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {INSTRUCTION.reference} · {INSTRUCTION.service}
          </p>
          <div className="mt-2">
            <Badge variant={ready ? "success" : "info"}>
              {ready ? "Ready to market" : "Onboarding"}
            </Badge>
          </div>
        </div>
      </div>
      <dl className="grid gap-5 border-t pt-6">
        <Pair label="Property" value={PROPERTY.address} icon={Building2} />
        <Pair label="Main landlord" value={PROPERTY.lead} icon={UserRound} />
        <Pair
          label="Lead staff member"
          value={INSTRUCTION.leadStaff}
          icon={UserRound}
        />
        <Pair label="Branch" value={PROPERTY.branch} icon={GitBranch} />
        <Pair
          label="Instructed"
          value={INSTRUCTION.instructed}
          icon={CalendarDays}
        />
      </dl>
    </header>
  );
}

function PropertySidebar() {
  return (
    <header className="grid content-start gap-6">
      <div className="flex items-center gap-4 lg:flex-col lg:items-start">
        <span
          aria-hidden="true"
          className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-accent text-primary"
        >
          <Building2 className="size-6" />
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight">
            {PROPERTY.address}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {PROPERTY.postcode}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{PROPERTY.type}</Badge>
            <span className="text-xs text-muted-foreground">
              {PROPERTY.reference}
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm">Manage owners</Button>
        <Button size="sm" variant="outline">
          Edit property
        </Button>
      </div>
      <dl className="grid gap-5 border-t pt-6">
        <Pair label="Lead landlord" value={PROPERTY.lead} icon={UserRound} />
        <Pair
          label="Responsible branch"
          value={PROPERTY.branch}
          icon={GitBranch}
        />
        <Pair label="Bedrooms" value={PROPERTY.bedrooms} icon={BedDouble} />
      </dl>
    </header>
  );
}

/* ---------- Tab layouts ---------- */

type Tab = { id: string; label: string; badge?: string };

function TopTabs({
  tabs,
  current,
  onChange,
}: {
  tabs: Tab[];
  current: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Record sections"
      className="flex gap-1 overflow-x-auto border-b"
    >
      {tabs.map((tab) => {
        const isCurrent = tab.id === current;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isCurrent}
            onClick={() => onChange(tab.id)}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
              isCurrent
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.badge && <Badge variant="destructive">{tab.badge}</Badge>}
          </button>
        );
      })}
    </div>
  );
}

function SideTabs({
  tabs,
  current,
  onChange,
}: {
  tabs: Tab[];
  current: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Record sections"
      aria-orientation="vertical"
      className="flex gap-1 overflow-x-auto border-b pb-2 lg:flex-col lg:overflow-visible lg:border-b-0 lg:pb-0"
    >
      {tabs.map((tab) => {
        const isCurrent = tab.id === current;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isCurrent}
            onClick={() => onChange(tab.id)}
            className={`flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
              isCurrent
                ? "bg-accent text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.badge && <Badge variant="destructive">{tab.badge}</Badge>}
          </button>
        );
      })}
    </div>
  );
}

function RecordFrame({
  layout,
  sidebar,
  tabs,
  current,
  onChange,
  children,
}: {
  layout: "top" | "side";
  sidebar: ReactNode;
  tabs: Tab[];
  current: string;
  onChange: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
      {sidebar}
      <div className="min-w-0 lg:border-l lg:pl-10">
        {layout === "top" ? (
          <div className="grid gap-6">
            <TopTabs tabs={tabs} current={current} onChange={onChange} />
            <div role="tabpanel">{children}</div>
          </div>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-8">
            <SideTabs tabs={tabs} current={current} onChange={onChange} />
            <div role="tabpanel" className="min-w-0">
              {children}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const INSTRUCTION_TABS: Tab[] = [
  { id: "overview", label: "Overview" },
  { id: "terms", label: "Terms" },
  { id: "landlords", label: "Landlords & agreement" },
  { id: "compliance", label: "Compliance", badge: "1" },
  { id: "history", label: "History" },
];

const PROPERTY_TABS: Tab[] = [
  { id: "overview", label: "Overview" },
  { id: "instructions", label: "Instructions" },
  { id: "compliance", label: "Compliance", badge: "1" },
  { id: "leads", label: "Leads" },
  { id: "notes", label: "Notes" },
];

function InstructionMock({
  layout,
  ready,
}: {
  layout: "top" | "side";
  ready: boolean;
}) {
  const [tab, setTab] = useState("overview");
  const content: Record<string, ReactNode> = {
    overview: <InstructionOverview ready={ready} goTo={setTab} />,
    terms: <InstructionTerms />,
    landlords: <InstructionLandlords />,
    compliance: <InstructionCompliance />,
    history: <InstructionHistory />,
  };
  return (
    <RecordFrame
      layout={layout}
      sidebar={<InstructionSidebar ready={ready} />}
      tabs={INSTRUCTION_TABS}
      current={tab}
      onChange={setTab}
    >
      {content[tab]}
    </RecordFrame>
  );
}

function PropertyMock({ layout }: { layout: "top" | "side" }) {
  const [tab, setTab] = useState("overview");
  const content: Record<string, ReactNode> = {
    overview: <PropertyOverview goTo={setTab} />,
    instructions: <PropertyInstructions />,
    compliance: <PropertyCompliance />,
    leads: <PropertyLeads />,
    notes: <PropertyNotes />,
  };
  return (
    <RecordFrame
      layout={layout}
      sidebar={<PropertySidebar />}
      tabs={PROPERTY_TABS}
      current={tab}
      onChange={setTab}
    >
      {content[tab]}
    </RecordFrame>
  );
}

/* ---------- The lab page ---------- */

const DESCRIPTIONS = {
  top: "Tabs run across the top of the working area. Familiar and compact; on a phone they scroll sideways.",
  side: "A short section menu sits down the left of the working area, like a settings page. Room for more sections later; on a phone it becomes a row of tabs.",
} as const;

export function RecordPagesLab() {
  const [record, setRecord] = useState<"instruction" | "property">(
    "instruction",
  );
  const [layout, setLayout] = useState<"top" | "side">("top");
  const [ready, setReady] = useState(false);

  const option = (label: string, isCurrent: boolean, onClick: () => void) => (
    <Button
      key={label}
      size="sm"
      variant={isCurrent ? "default" : "outline"}
      onClick={onClick}
      className="shrink-0"
    >
      {label}
    </Button>
  );

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="mr-auto">
            <p className="text-sm font-semibold">Record page options</p>
            <p className="text-xs text-muted-foreground">
              Mock-ups with sample data, for the October workflow review. Try
              light and dark, and a narrow window for a phone.
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
        <div className="flex flex-wrap gap-x-6 gap-y-2 px-4 pb-3">
          <nav aria-label="Record" className="flex gap-2 overflow-x-auto">
            {option("Instruction", record === "instruction", () =>
              setRecord("instruction"),
            )}
            {option("Property", record === "property", () =>
              setRecord("property"),
            )}
          </nav>
          <nav aria-label="Layout" className="flex gap-2 overflow-x-auto">
            {option("A · Top tabs", layout === "top", () => setLayout("top"))}
            {option("B · Side tabs", layout === "side", () =>
              setLayout("side"),
            )}
          </nav>
          {record === "instruction" && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={ready}
                onChange={(event) => setReady(event.target.checked)}
                className="size-4 accent-primary"
              />
              Show as Ready to market
            </label>
          )}
        </div>
      </div>
      <div className="px-4 py-6 sm:py-8 lg:px-8">
        <p className="mb-6 rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground">
          {DESCRIPTIONS[layout]}
        </p>
        {record === "instruction" ? (
          <InstructionMock
            key={`${layout}-${ready}`}
            layout={layout}
            ready={ready}
          />
        ) : (
          <PropertyMock key={layout} layout={layout} />
        )}
      </div>
    </main>
  );
}
