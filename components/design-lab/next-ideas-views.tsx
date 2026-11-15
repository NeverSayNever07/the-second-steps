"use client";

import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarClock,
  Check,
  ClipboardList,
  FileText,
  Inbox,
  Mail,
  Megaphone,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldAlert,
  UserRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Three design ideas drawn with fictional data (proposals, not the product).
// Everything here lives in the browser only: nothing is saved or sent.

// --- 1. The journey bar ---

type Step = {
  id: string;
  label: string;
  state: "done" | "current" | "ahead";
  caption: string;
  detail: string;
};

const JOURNEY: Step[] = [
  {
    id: "lead",
    label: "Lead",
    state: "done",
    caption: "2 Oct",
    detail:
      "Landlord lead from Rightmove, looked after by Olivia Hart. Won on 17 October.",
  },
  {
    id: "appraisal",
    label: "Appraisal",
    state: "done",
    caption: "9 Oct",
    detail:
      "Appraised by Priya Shah. Recommended rent £1,450 to £1,550 a month.",
  },
  {
    id: "instruction",
    label: "Instruction",
    state: "done",
    caption: "17 Oct",
    detail:
      "Fully managed at 12% of the rent. Signed agreement and ownership check on file.",
  },
  {
    id: "listing",
    label: "Listing",
    state: "current",
    caption: "In progress",
    detail:
      "The advert is a draft: description and 14 photos are in, the floorplan and available date are not.",
  },
  {
    id: "enquiries",
    label: "Enquiries",
    state: "ahead",
    caption: "3 fit",
    detail:
      "Three active applicants already fit this home. They can be told once it is Ready to advertise.",
  },
  {
    id: "viewings",
    label: "Viewings",
    state: "ahead",
    caption: "",
    detail: "Viewings open once there are enquiries.",
  },
  {
    id: "let",
    label: "Let",
    state: "ahead",
    caption: "",
    detail: "An accepted offer and a tenancy come later in the roadmap.",
  },
];

const CHECKLIST = [
  { label: "Headline and description", done: true },
  { label: "Photos (14)", done: true },
  { label: "Floorplan", done: false },
  { label: "Available date", done: false },
  { label: "EPC evidence reviewed", done: false },
];

const TIMELINE: {
  icon: LucideIcon;
  who: string;
  what: string;
  when: string;
  note?: string;
}[] = [
  {
    icon: Megaphone,
    who: "Olivia Hart",
    what: "added 14 photos to the listing",
    when: "Today, 10:12",
  },
  {
    icon: MessageSquare,
    who: "Ben Carter",
    what: "added a note",
    when: "Yesterday, 16:40",
    note: "Landlord is happy for viewings on weekday evenings. Keys are with the Main Branch.",
  },
  {
    icon: ShieldAlert,
    who: "Zayto",
    what: "flagged the gas safety record as expired",
    when: "21 Oct",
  },
  {
    icon: FileText,
    who: "Olivia Hart",
    what: "uploaded the signed landlord agreement",
    when: "17 Oct",
  },
  {
    icon: ClipboardList,
    who: "Olivia Hart",
    what: "started the instruction (fully managed)",
    when: "17 Oct",
  },
  {
    icon: CalendarClock,
    who: "Priya Shah",
    what: "completed the appraisal",
    when: "9 Oct",
  },
];

const KEY_DETAILS = [
  ["Type", "Terraced house"],
  ["Bedrooms", "4"],
  ["Bathrooms", "2"],
  ["Furnishing", "Furnished"],
  ["Council tax", "Band D"],
  ["Agreed rent", "£1,500 a month"],
];

export function JourneyView() {
  const [selected, setSelected] = useState("listing");
  const [header, setHeader] = useState<"light" | "blue">("light");
  const step = JOURNEY.find(({ id }) => id === selected) ?? JOURNEY[3];
  const done = CHECKLIST.filter((item) => item.done).length;
  const blue = header === "blue";

  return (
    <div className="grid gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Header:</span>
        {(["light", "blue"] as const).map((option) => (
          <Button
            key={option}
            size="xs"
            variant={header === option ? "default" : "outline"}
            aria-pressed={header === option}
            onClick={() => setHeader(option)}
          >
            {option === "light" ? "Light (proposed)" : "Blue box (today)"}
          </Button>
        ))}
      </div>

      <section
        className={`overflow-hidden rounded-xl ${blue ? "" : "border bg-card"}`}
      >
        <header
          className={`flex flex-wrap items-center justify-between gap-4 p-4 md:p-5 ${blue ? "rounded-lg bg-record text-record-foreground" : ""}`}
        >
          <div className="flex min-w-0 items-center gap-4">
            <span
              aria-hidden="true"
              className={`inline-flex size-12 shrink-0 items-center justify-center rounded-lg ${blue ? "bg-record-foreground/15" : "bg-accent text-accent-foreground"}`}
            >
              <Building2 className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">
                15 Lime Tree Road, Manchester
              </h2>
              <p
                className={`text-sm ${blue ? "text-record-muted-foreground" : "text-muted-foreground"}`}
              >
                M14 6WX · Tomasz Kowalski · Main Branch · PRP-DA54N3LB
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant={blue ? "secondary" : "outline"}>
              <Pencil aria-hidden="true" />
              Edit
            </Button>
            <Button variant={blue ? "secondary" : "outline"}>More</Button>
          </div>
        </header>

        {/* The journey: where this home is, and what each stage holds. */}
        <div
          className={`px-4 pt-4 md:px-5 ${blue ? "mt-3 rounded-xl border bg-card" : "border-t"}`}
        >
          <ol className="flex overflow-x-auto pb-1" aria-label="Journey">
            {JOURNEY.map((item, index) => {
              const on = item.id === selected;
              return (
                <li key={item.id} className="relative min-w-24 flex-1">
                  {index > 0 && (
                    <span
                      aria-hidden="true"
                      className={`absolute top-3.5 right-1/2 h-0.5 w-full ${item.state === "ahead" ? "bg-border" : "bg-primary"}`}
                    />
                  )}
                  <button
                    type="button"
                    aria-current={item.state === "current" ? "step" : undefined}
                    aria-pressed={on}
                    onClick={() => setSelected(item.id)}
                    className="group relative grid w-full justify-items-center gap-1.5 rounded-md pb-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className={`relative z-10 inline-flex size-7 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors ${
                        item.state === "done"
                          ? "border-primary bg-primary text-primary-foreground"
                          : item.state === "current"
                            ? "border-primary bg-card text-primary ring-4 ring-primary/15"
                            : "border-border bg-card text-muted-foreground"
                      }`}
                    >
                      {item.state === "done" ? (
                        <Check aria-hidden="true" className="size-3.5" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span
                      className={`text-sm ${item.state === "ahead" ? "text-muted-foreground" : "font-medium"} ${on ? "text-primary" : ""}`}
                    >
                      {item.label}
                    </span>
                    <span className="h-4 text-xs text-muted-foreground">
                      {item.caption}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`h-0.5 w-10 rounded-full ${on ? "bg-primary" : "bg-transparent group-hover:bg-border"}`}
                    />
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="border-t py-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{step.label}:</span>{" "}
            {step.detail}
          </p>
        </div>
      </section>

      {/* One next step, and anything in its way. */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="grid gap-3 rounded-xl border bg-card p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-wide text-primary uppercase">
                Next step
              </p>
              <h3 className="text-lg font-semibold tracking-tight">
                Finish the advert
              </h3>
            </div>
            <Button>
              Open listing
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
          <div
            className="flex h-1.5 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`${done} of ${CHECKLIST.length} done`}
          >
            {CHECKLIST.map((item) => (
              <span
                key={item.label}
                className={`flex-1 ${item.done ? "bg-primary" : ""}`}
              />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            {CHECKLIST.map((item) => (
              <li
                key={item.label}
                className={`flex items-center gap-1.5 ${item.done ? "text-muted-foreground" : "font-medium"}`}
              >
                {item.done ? (
                  <Check aria-hidden="true" className="size-3.5 text-success" />
                ) : (
                  <span
                    aria-hidden="true"
                    className="size-3 rounded-full border-2 border-input"
                  />
                )}
                {item.label}
                <span className="sr-only">
                  {item.done ? " (done)" : " (to do)"}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="grid content-start gap-2 rounded-xl border border-destructive/30 bg-destructive-soft p-4 md:p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle aria-hidden="true" className="size-4" />
            Needs attention
          </p>
          <p className="text-sm">
            The gas safety record on file expired on 21/10/2026.
          </p>
          <Button variant="outline" size="sm" className="w-fit">
            Add newer evidence
          </Button>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {/* One timeline instead of separate history tabs. */}
        <section className="rounded-xl border bg-card p-4 md:p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold">Timeline</h3>
            <Button size="sm" variant="outline">
              <Plus aria-hidden="true" />
              Add note
            </Button>
          </div>
          <ol className="mt-4 grid">
            {TIMELINE.map((entry, index) => (
              <li key={entry.when + entry.what} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <entry.icon aria-hidden="true" className="size-3.5" />
                  </span>
                  {index < TIMELINE.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="w-px flex-1 bg-border"
                    />
                  )}
                </div>
                <div className="min-w-0 pb-5">
                  <p className="text-sm">
                    <span className="font-medium">{entry.who}</span>{" "}
                    {entry.what}
                  </p>
                  <p className="text-xs text-muted-foreground">{entry.when}</p>
                  {entry.note && (
                    <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm">
                      {entry.note}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Only what is known; the gaps are one link, not rows of "Not recorded". */}
        <aside className="grid content-start gap-4 rounded-xl border bg-card p-4 md:p-5">
          <h3 className="text-base font-semibold">Key details</h3>
          <dl className="grid gap-3">
            {KEY_DETAILS.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 text-sm">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          <Button variant="ghost" size="sm" className="w-fit">
            <Plus aria-hidden="true" />
            Add 5 more details
          </Button>
          <div className="border-t pt-4">
            <h3 className="text-base font-semibold">People</h3>
            <ul className="mt-3 grid gap-3 text-sm">
              {[
                ["Tomasz Kowalski", "Landlord · main contact"],
                ["Olivia Hart", "Lead staff member"],
              ].map(([name, role]) => (
                <li key={name} className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="inline-flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
                  >
                    {name
                      .split(" ")
                      .map((part) => part[0])
                      .join("")}
                  </span>
                  <span>
                    <span className="block font-medium">{name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {role}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

// --- 2. Working lists ---

type Lead = {
  id: string;
  name: string;
  address: string;
  stage: "New lead" | "Appraisal booked" | "Appraisal completed" | "Won";
  owner: string;
  phone: string;
  source: string;
  action: string | null;
  due: string;
  overdue: boolean;
  note: string;
};

const ME = "Olivia Hart";

const LEADS: Lead[] = [
  {
    id: "1",
    name: "Marcus Webb",
    address: "42 Elm Road, M20 4AB",
    stage: "New lead",
    owner: "Priya Shah",
    phone: "07700 900301",
    source: "Rightmove",
    action: "Call to arrange a valuation",
    due: "Today",
    overdue: false,
    note: "Inherited a two-bed house and wants to let it out.",
  },
  {
    id: "2",
    name: "Hannah Fox",
    address: "7 Mill Lane, M21 8QP",
    stage: "New lead",
    owner: "Nobody yet",
    phone: "07700 900302",
    source: "Phone call",
    action: null,
    due: "",
    overdue: false,
    note: "Rang about letting her flat while she works abroad.",
  },
  {
    id: "3",
    name: "Dev Patel",
    address: "15 Quay Street, M3 4NB",
    stage: "New lead",
    owner: ME,
    phone: "07700 900303",
    source: "Landlord referral",
    action: "Send fee guide",
    due: "2 days late",
    overdue: true,
    note: "Referred by Gareth Hollis. Comparing two agents.",
  },
  {
    id: "4",
    name: "Tom Ellery",
    address: "28 Orchard Way, M19 2LF",
    stage: "Appraisal booked",
    owner: "Priya Shah",
    phone: "07700 900304",
    source: "OnTheMarket",
    action: "Appraisal",
    due: "Thu, 14:00",
    overdue: false,
    note: "Three-bed semi, currently empty.",
  },
  {
    id: "5",
    name: "Joan Pryce",
    address: "3 Heather Close, WA14 4PQ",
    stage: "Appraisal booked",
    owner: ME,
    phone: "07700 900305",
    source: "Landlord referral",
    action: "Appraisal",
    due: "Fri, 16:30",
    overdue: false,
    note: "Wants a fully managed service.",
  },
  {
    id: "6",
    name: "Grace Okafor",
    address: "3 Park View, M14 5DR",
    stage: "Appraisal completed",
    owner: ME,
    phone: "07700 900306",
    source: "Zoopla",
    action: "Send the terms of business",
    due: "1 day late",
    overdue: true,
    note: "Liked the recommended rent. Ready to go ahead.",
  },
  {
    id: "7",
    name: "Amara Okonkwo",
    address: "Apt 5, The Foundry, M4 6QD",
    stage: "Appraisal completed",
    owner: "Priya Shah",
    phone: "07700 900307",
    source: "Rightmove",
    action: "Chase for a decision",
    due: "Tomorrow",
    overdue: false,
    note: "Deciding between let-only and rent collection.",
  },
  {
    id: "8",
    name: "Ingrid Larsen",
    address: "61 Canal Street, M1 3HE",
    stage: "Won",
    owner: "Ruby Walker",
    phone: "07700 900308",
    source: "Existing landlord",
    action: null,
    due: "",
    overdue: false,
    note: "Instruction started on 19 October.",
  },
];

const VIEWS: {
  id: string;
  label: string;
  match: (lead: Lead) => boolean;
}[] = [
  {
    id: "attention",
    label: "Needs action",
    match: (lead) => lead.stage !== "Won" && (lead.overdue || !lead.action),
  },
  {
    id: "mine",
    label: "Mine",
    match: (lead) => lead.owner === ME && lead.stage !== "Won",
  },
  { id: "open", label: "All open", match: (lead) => lead.stage !== "Won" },
  { id: "won", label: "Won", match: (lead) => lead.stage === "Won" },
];

function leadStageVariant(stage: Lead["stage"]) {
  if (stage === "Won") return "success" as const;
  if (stage === "Appraisal booked") return "info" as const;
  return "secondary" as const;
}

export function ListsView() {
  const [leads, setLeads] = useState(LEADS);
  const [view, setView] = useState("attention");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>("3");
  const current = VIEWS.find(({ id }) => id === view) ?? VIEWS[0];
  const text = query.trim().toLowerCase();
  const rows = leads.filter(
    (lead) =>
      current.match(lead) &&
      (!text ||
        lead.name.toLowerCase().includes(text) ||
        lead.address.toLowerCase().includes(text)),
  );
  const open = leads.find(({ id }) => id === openId) ?? null;
  const finish = (id: string) =>
    setLeads((list) =>
      list.map((lead) =>
        lead.id === id
          ? { ...lead, action: null, due: "", overdue: false }
          : lead,
      ),
    );
  const plan = (id: string, action: string) =>
    setLeads((list) =>
      list.map((lead) =>
        lead.id === id
          ? { ...lead, action, due: "Tomorrow", overdue: false }
          : lead,
      ),
    );

  return (
    <div className="grid gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Landlord leads</h2>
        <Button>
          <Plus aria-hidden="true" />
          New landlord lead
        </Button>
      </div>

      {/* Views with live counts replace the dropdowns and the Apply button. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b">
        <div className="flex gap-1 overflow-x-auto" role="tablist">
          {VIEWS.map((item) => {
            const on = item.id === view;
            const count = leads.filter(item.match).length;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setView(item.id)}
                className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {item.label}
                <span
                  className={`rounded-full px-1.5 text-xs ${on ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="relative mb-2 w-full sm:w-64">
          <Search
            aria-hidden="true"
            className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            className="pl-8"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter as you type"
            aria-label="Filter leads"
          />
        </div>
      </div>

      <div
        className={`grid gap-4 ${open ? "lg:grid-cols-[minmax(0,1fr)_22rem]" : ""}`}
      >
        <ul className="grid content-start divide-y self-start overflow-hidden rounded-xl border bg-card">
          {rows.length === 0 && (
            <li className="p-8 text-center text-sm text-muted-foreground">
              Nothing here. Every lead in this view is up to date.
            </li>
          )}
          {rows.map((lead) => {
            const on = lead.id === openId;
            return (
              <li key={lead.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setOpenId(on ? null : lead.id)}
                  className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-l-2 px-4 py-3 text-left outline-none focus-visible:bg-muted md:grid-cols-[minmax(0,1.3fr)_10rem_minmax(0,1fr)] ${on ? "border-primary bg-accent/50" : "border-transparent hover:bg-muted/60"}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {lead.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {lead.address} · {lead.owner}
                    </span>
                  </span>
                  <span>
                    <Badge variant={leadStageVariant(lead.stage)}>
                      {lead.stage}
                    </Badge>
                  </span>
                  <span className="col-span-2 min-w-0 text-sm md:col-span-1">
                    {lead.action ? (
                      <>
                        <span className="block truncate">{lead.action}</span>
                        <span
                          className={`block text-xs ${lead.overdue ? "font-medium text-destructive" : "text-muted-foreground"}`}
                        >
                          {lead.due}
                        </span>
                      </>
                    ) : lead.stage === "Won" ? (
                      <span className="text-muted-foreground">
                        Instruction started
                      </span>
                    ) : (
                      <span className="font-medium text-warning">
                        No next action
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {/* The preview: work a lead without leaving the list. */}
        {open && (
          <aside
            className="grid content-start gap-4 rounded-xl border bg-card p-4 md:p-5"
            aria-label={`Preview of ${open.name}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold tracking-tight">
                  {open.name}
                </h3>
                <p className="text-sm text-muted-foreground">{open.address}</p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Close preview"
                onClick={() => setOpenId(null)}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline">
                <Phone aria-hidden="true" />
                {open.phone}
              </Button>
              <Button size="sm" variant="outline">
                <Mail aria-hidden="true" />
                Email
              </Button>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Next action
              </p>
              {open.action ? (
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="min-w-0 text-sm">
                    <span className="block font-medium">{open.action}</span>
                    <span
                      className={`text-xs ${open.overdue ? "font-medium text-destructive" : "text-muted-foreground"}`}
                    >
                      {open.due}
                    </span>
                  </p>
                  <Button size="sm" onClick={() => finish(open.id)}>
                    <Check aria-hidden="true" />
                    Done
                  </Button>
                </div>
              ) : open.stage === "Won" ? (
                <p className="mt-1 text-sm">
                  Carries on as the instruction. Nothing to do here.
                </p>
              ) : (
                <div className="mt-1 grid gap-2">
                  <p className="text-sm font-medium">What happens next?</p>
                  <div className="flex flex-wrap gap-1.5">
                    {["Call back", "Send fee guide", "Book appraisal"].map(
                      (choice) => (
                        <Button
                          key={choice}
                          size="xs"
                          variant="outline"
                          onClick={() => plan(open.id, choice)}
                        >
                          {choice}
                        </Button>
                      ),
                    )}
                  </div>
                </div>
              )}
            </div>
            <dl className="grid gap-2 text-sm">
              {[
                ["Stage", open.stage],
                ["Looked after by", open.owner],
                ["Source", open.source],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="border-t pt-3 text-sm">
              <span className="block text-xs text-muted-foreground">
                Latest note
              </span>
              {open.note}
            </p>
            <Button variant="outline" className="w-full">
              Open full record
              <ArrowRight aria-hidden="true" />
            </Button>
          </aside>
        )}
      </div>
    </div>
  );
}

// --- 3. Your day ---

type Job = {
  id: string;
  group: "Now" | "Today" | "This week";
  icon: LucideIcon;
  title: string;
  context: string;
  when: string;
  button: string;
  urgent?: boolean;
};

const JOBS: Job[] = [
  {
    id: "a",
    group: "Now",
    icon: ShieldAlert,
    title: "Gas safety record has expired",
    context: "15 Lime Tree Road · expired 21/10/2026",
    when: "Critical",
    button: "Add evidence",
    urgent: true,
  },
  {
    id: "b",
    group: "Now",
    icon: Phone,
    title: "Send fee guide to Dev Patel",
    context: "Landlord lead · 15 Quay Street",
    when: "2 days late",
    button: "Done",
    urgent: true,
  },
  {
    id: "c",
    group: "Now",
    icon: Inbox,
    title: "Hannah Fox has nobody looking after her",
    context: "Landlord lead · 7 Mill Lane",
    when: "New yesterday",
    button: "Take it",
  },
  {
    id: "d",
    group: "Today",
    icon: CalendarClock,
    title: "Appraisal with Joan Pryce",
    context: "3 Heather Close, Altrincham",
    when: "10:00",
    button: "Open",
  },
  {
    id: "e",
    group: "Today",
    icon: UserRound,
    title: "Priya Nair asked about 6 Albert Mews",
    context: "Property enquiry · new",
    when: "Waiting 1 day",
    button: "Mark contacted",
  },
  {
    id: "f",
    group: "Today",
    icon: Phone,
    title: "Call Marcus Webb to arrange a valuation",
    context: "Landlord lead · 42 Elm Road",
    when: "Due today",
    button: "Done",
  },
  {
    id: "g",
    group: "Today",
    icon: Megaphone,
    title: "Finish the advert for 15 Lime Tree Road",
    context: "Listing · 2 of 5 done",
    when: "Due today",
    button: "Open listing",
  },
  {
    id: "h",
    group: "This week",
    icon: FileText,
    title: "EPC evidence is due",
    context: "88 Kingsway · in 6 days",
    when: "Sat",
    button: "Open",
  },
  {
    id: "i",
    group: "This week",
    icon: Phone,
    title: "Chase Amara Okonkwo for a decision",
    context: "Landlord lead · Apt 5, The Foundry",
    when: "Wed",
    button: "Plan",
  },
];

const FIGURES = [
  ["15", "open leads"],
  ["2", "in onboarding"],
  ["4", "active applicants"],
  ["2", "open enquiries"],
];

const DIARY = [
  ["10:00", "Appraisal · Joan Pryce", "3 Heather Close"],
  ["13:30", "Call · Marcus Webb", "Arrange a valuation"],
  ["16:00", "Appraisal · Tom Ellery", "28 Orchard Way"],
];

export function DayView() {
  const [finished, setFinished] = useState<string[]>([]);
  const left = JOBS.filter(({ id }) => !finished.includes(id));
  const todays = JOBS.filter(({ group }) => group !== "This week");
  const todaysDone = todays.filter(({ id }) => finished.includes(id)).length;

  return (
    <div className="grid gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Good morning, Olivia
          </h2>
          <p className="text-sm text-muted-foreground">
            Monday 16 November · {todays.length - todaysDone} things need you
            today
          </p>
        </div>
        <Button>
          <Plus aria-hidden="true" />
          New
        </Button>
      </div>

      {/* The figures shrink to one quiet strip. */}
      <dl className="flex flex-wrap gap-x-8 gap-y-2 rounded-xl border bg-card px-4 py-3">
        {FIGURES.map(([value, label]) => (
          <div key={label} className="flex items-baseline gap-1.5">
            <dd className="text-lg font-semibold">{value}</dd>
            <dt className="text-sm text-muted-foreground">{label}</dt>
          </div>
        ))}
        <div className="flex items-baseline gap-1.5 text-destructive">
          <dd className="text-lg font-semibold">1</dd>
          <dt className="text-sm">critical compliance issue</dt>
        </div>
      </dl>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="grid content-start gap-5">
          <div className="grid gap-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Today&apos;s progress</span>
              <span>
                {todaysDone} of {todays.length} done
              </span>
            </div>
            <div
              className="flex h-1.5 gap-0.5 overflow-hidden rounded-full"
              role="img"
              aria-label={`${todaysDone} of ${todays.length} done today`}
            >
              {todays.map((job, index) => (
                <span
                  key={job.id}
                  className={`flex-1 ${index < todaysDone ? "bg-success" : "bg-muted"}`}
                />
              ))}
            </div>
          </div>

          {(["Now", "Today", "This week"] as const).map((group) => {
            const jobs = left.filter((job) => job.group === group);
            return (
              <div key={group} className="grid gap-2">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {group}
                </h3>
                {jobs.length === 0 ? (
                  <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
                    All clear.
                  </p>
                ) : (
                  <ul className="grid divide-y overflow-hidden rounded-xl border bg-card">
                    {jobs.map((job) => (
                      <li
                        key={job.id}
                        className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-l-2 px-4 py-3 ${job.urgent ? "border-l-destructive" : "border-l-transparent"}`}
                      >
                        <span
                          className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full ${job.urgent ? "bg-destructive-soft text-destructive" : "bg-muted text-muted-foreground"}`}
                        >
                          <job.icon aria-hidden="true" className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1 basis-48">
                          <span className="block font-medium">{job.title}</span>
                          <span className="block text-xs text-muted-foreground">
                            {job.context}
                          </span>
                        </span>
                        <span
                          className={`text-xs whitespace-nowrap ${job.urgent ? "font-medium text-destructive" : "text-muted-foreground"}`}
                        >
                          {job.when}
                        </span>
                        <Button
                          size="sm"
                          variant={group === "Now" ? "default" : "outline"}
                          onClick={() =>
                            setFinished((list) => [...list, job.id])
                          }
                        >
                          {job.button}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          {finished.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-fit"
              onClick={() => setFinished([])}
            >
              Put the {finished.length} finished back (mock-up only)
            </Button>
          )}
        </section>

        <aside className="grid content-start gap-4 rounded-xl border bg-card p-4 md:p-5">
          <h3 className="text-base font-semibold">Diary</h3>
          <ol className="grid gap-3">
            {DIARY.map(([time, title, place]) => (
              <li key={time} className="flex gap-3 text-sm">
                <span className="w-11 shrink-0 font-medium tabular-nums">
                  {time}
                </span>
                <span className="min-w-0 border-l-2 border-primary pl-3">
                  <span className="block font-medium">{title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {place}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <Button variant="outline" size="sm" className="w-fit">
            Open calendar
          </Button>
        </aside>
      </div>
    </div>
  );
}
