import {
  ArrowLeft,
  Building2,
  Bell,
  ChevronDown,
  ClipboardList,
  ContactRound,
  FileText,
  Home,
  Inbox,
  Megaphone,
  Plus,
  Search,
  Settings,
  User,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/ui/option-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import styles from "./look-and-feel-lab.module.css";

// A proposal, not the product: six looks for the same three screens, drawn
// with the real shadcn components. Names and figures are fictional.

export const DIRECTIONS = [
  {
    id: "d1",
    number: "1",
    name: "Crisp Slate",
    strapline: "Compact white fields, clear lines, one confident blue",
    nav: "side",
    hero: "flat",
    underline: false,
    traits: [
      "Fields 32px tall, 6px corners, white fill",
      "Blue on a cool grey canvas with white surfaces",
      "Dark navy side navigation",
      "Record header stays flat; a facts strip gives the focus",
    ],
  },
  {
    id: "d2",
    number: "2",
    name: "Ink and Teal",
    strapline: "A deep teal band gives every record a clear focal point",
    nav: "side",
    hero: "band",
    underline: false,
    traits: [
      "Fields 32px tall, 4px corners",
      "Teal accent, near-white canvas, strong dark ink",
      "Very dark teal side navigation",
      "Solid teal band across the top of a record",
    ],
  },
  {
    id: "d3",
    number: "3",
    name: "Warm Paper",
    strapline: "Warm neutrals and a terracotta accent, with a light navigation",
    nav: "side",
    hero: "tint",
    underline: false,
    traits: [
      "Fields 34px tall, 8px corners, white fill",
      "Cream canvas, terracotta accent",
      "Light side navigation with a warm active pill",
      "Soft sand panel across the top of a record",
    ],
  },
  {
    id: "d4",
    number: "4",
    name: "Bold Blue",
    strapline: "A blue navigation, a blue record band and underlined fields",
    nav: "side",
    hero: "band",
    underline: true,
    traits: [
      "Underlined fields with no box or fill",
      "White canvas, strong royal blue",
      "Blue side navigation",
      "Solid blue band across the top of a record",
    ],
  },
  {
    id: "d5",
    number: "5",
    name: "Graphite",
    strapline: "Near-monochrome, square and dense, with a top navigation bar",
    nav: "top",
    hero: "band",
    underline: false,
    traits: [
      "Fields 30px tall, 3px corners",
      "Black and white with grey, no colour accent",
      "Navigation across the top, more room for the page",
      "Black band across the top of a record",
    ],
  },
  {
    id: "d6",
    number: "6",
    name: "Forest",
    strapline: "Green with mint tints, a light navigation and soft panels",
    nav: "side",
    hero: "tint",
    underline: false,
    traits: [
      "Fields 34px tall, 10px corners, white fill",
      "Green accent on a pale green canvas",
      "Light side navigation with a green active pill",
      "Mint panel across the top of a record",
    ],
  },
] as const;

type Direction = (typeof DIRECTIONS)[number];
export type ScreenId = "list" | "record" | "form";

export const SCREENS: { id: ScreenId; label: string }[] = [
  { id: "list", label: "List page" },
  { id: "record", label: "Record page" },
  { id: "form", label: "Form" },
];

// --- Navigation ---

const NAV: { label: string; icon: LucideIcon; key: string }[] = [
  { label: "Dashboard", icon: Home, key: "dashboard" },
  { label: "Landlord leads", icon: Inbox, key: "leads" },
  { label: "Instructions", icon: ClipboardList, key: "instructions" },
  { label: "Properties", icon: Building2, key: "properties" },
  { label: "Marketing", icon: Megaphone, key: "marketing" },
];

function activeKey(screen: ScreenId) {
  return screen === "record" ? "properties" : "leads";
}

export function Navigation({
  direction,
  screen,
  active: activeOverride,
}: {
  direction: Direction;
  screen: ScreenId;
  active?: string;
}) {
  const active = activeOverride ?? activeKey(screen);
  const item = (label: string, Icon: LucideIcon, on: boolean) => (
    <span
      key={label}
      className={`${styles.navItem} ${on ? styles.navItemActive : ""}`}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {label}
    </span>
  );
  const top = direction.nav === "top";
  return (
    <nav className={styles.nav} aria-label="Example navigation">
      <span
        className={`flex items-center gap-2 px-2.5 py-2 text-sm font-semibold ${top ? "pr-4" : ""}`}
      >
        <span
          aria-hidden="true"
          className="inline-flex size-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground"
        >
          Z
        </span>
        Zayto
      </span>
      {!top && <span className={styles.navLabel}>Workspace</span>}
      {NAV.map(({ label, icon, key }) => item(label, icon, key === active))}
      {top ? (
        <>
          {item("Contacts", ContactRound, false)}
          <ChevronDown aria-hidden="true" className="-ml-1 size-3.5" />
        </>
      ) : (
        <>
          <span className={styles.navItem}>
            <ContactRound aria-hidden="true" className="size-4 shrink-0" />
            <span className="flex-1">Contacts</span>
            <ChevronDown aria-hidden="true" className="size-3.5" />
          </span>
          <div className={styles.navSub}>
            {["All contacts", "Landlords", "Applicants"].map((label) => (
              <span key={label} className={styles.navItem}>
                {label}
              </span>
            ))}
          </div>
          <span className={styles.navLabel}>Admin</span>
        </>
      )}
      {item("Settings", Settings, false)}
    </nav>
  );
}

// --- Shared page pieces ---

export const LEADS = [
  [
    "Priya Nair",
    "14 Elmwood Road, M20 4AB",
    "Appraisal booked",
    "Website",
    "Didsbury",
    "Chase paperwork",
    "Tue 10 Nov",
  ],
  [
    "Tom Whitfield",
    "3 Quarry Lane, SK8 2PL",
    "New",
    "Referral",
    "Cheadle",
    "No next action",
    "",
  ],
  [
    "Hana Okoye",
    "27 Birch Court, M14 6TT",
    "Contacted",
    "Phone",
    "Didsbury",
    "Call back",
    "Mon 9 Nov",
  ],
  [
    "Ellis & Co Lettings",
    "Flat 2, 8 Mill Street, M4 1BQ",
    "Appraisal booked",
    "Portal",
    "City",
    "Send terms",
    "Wed 11 Nov",
  ],
  [
    "Marcus Bell",
    "61 Ash Grove, M21 9LX",
    "Won",
    "Website",
    "Didsbury",
    "Start instruction",
    "Thu 12 Nov",
  ],
  [
    "Sofia Lindgren",
    "5 Harbour View, M50 3QE",
    "Postponed",
    "Referral",
    "City",
    "Review in January",
    "5 Jan",
  ],
] as const;

export function stageVariant(stage: string) {
  if (stage === "Won") return "success" as const;
  if (stage === "Postponed") return "warning" as const;
  if (stage === "Appraisal booked") return "info" as const;
  return "secondary" as const;
}

export const STAGES = [
  { value: "", label: "Open and won" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
];
export const BRANCHES = [
  { value: "", label: "All branches" },
  { value: "didsbury", label: "Didsbury" },
  { value: "city", label: "City" },
];

export function SearchField() {
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-64">
      <Search
        aria-hidden="true"
        className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        className="pl-8"
        placeholder="Search leads"
        aria-label="Search leads"
      />
    </div>
  );
}

// --- Screen 1: a list page ---

function ListScreen() {
  return (
    <div className="grid gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold tracking-tight">
            Landlord leads
          </h2>
          <span className="text-sm text-muted-foreground">24 open</span>
        </div>
        <Button>
          <Plus aria-hidden="true" />
          New landlord lead
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SearchField />
        <OptionSelect
          className="w-40"
          options={STAGES}
          defaultValue=""
          placeholder="Stage"
        />
        <OptionSelect
          className="w-36"
          options={BRANCHES}
          defaultValue=""
          placeholder="Branch"
        />
        <label className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
          <input type="checkbox" className="accent-primary" />
          No next action
        </label>
        <Button variant="outline">Apply</Button>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Landlord</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Next action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {LEADS.map(
              ([name, address, stage, source, branch, action, due]) => (
                <TableRow key={name}>
                  <TableCell>
                    <span className="font-medium text-primary">{name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {address}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={stageVariant(stage)}>{stage}</Badge>
                  </TableCell>
                  <TableCell>{source}</TableCell>
                  <TableCell>{branch}</TableCell>
                  <TableCell>
                    {due ? (
                      <>
                        {action}
                        <span className="block text-xs text-muted-foreground">
                          {due}
                        </span>
                      </>
                    ) : (
                      <span className="font-medium text-warning">{action}</span>
                    )}
                  </TableCell>
                </TableRow>
              ),
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// --- Screen 2: a record page ---

const FACTS = [
  ["Type", "Terraced house"],
  ["Bedrooms", "3"],
  ["Asking rent", "£1,450 pcm"],
  ["Branch", "Didsbury"],
  ["Status", "Ready to market"],
];

function RecordScreen({ direction }: { direction: Direction }) {
  const banded = direction.hero !== "flat";
  return (
    <div className="grid gap-5 p-5">
      <span className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground">
        <ArrowLeft aria-hidden="true" className="size-3.5" />
        Back to properties
      </span>
      <div
        className={`flex flex-wrap items-center justify-between gap-4 ${banded ? `${styles.heroBand} p-5` : ""}`}
      >
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className={`inline-flex size-12 shrink-0 items-center justify-center rounded-full ${banded ? "bg-white/15" : "bg-accent text-primary"}`}
          >
            <Building2 className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">
              14 Elmwood Road, Manchester M20 4AB
            </h2>
            <p
              className={`text-xs ${banded ? styles.heroMuted : "text-muted-foreground"}`}
            >
              Property PRP-4K7M2 · Owned by Priya Nair
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant={banded ? "secondary" : "outline"}>Edit</Button>
          <Button variant={banded ? "secondary" : "default"}>
            Start instruction
          </Button>
        </div>
      </div>
      <div className={styles.facts}>
        {FACTS.map(([label, value]) => (
          <div key={label} className="px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-0.5 text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-1 border-b text-sm">
        {["Overview", "Compliance", "Documents", "History"].map(
          (tab, index) => (
            <span
              key={tab}
              className={`-mb-px border-b-2 px-3 py-2 font-medium ${index === 0 ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
            >
              {tab}
            </span>
          ),
        )}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="grid content-start gap-3">
          <h3 className="text-sm font-semibold">Current instruction</h3>
          <dl className="grid grid-cols-2 content-start gap-x-6 gap-y-3 text-sm">
            {[
              ["Reference", "INS-WP32T6JU"],
              ["Service", "Tenant find"],
              ["Fee", "8% + VAT"],
              ["Agreed", "2 Nov 2026"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="grid content-start gap-3">
          <h3 className="text-sm font-semibold">Compliance</h3>
          <ul className="divide-y rounded-lg border bg-card text-sm">
            {[
              ["Gas safety", "Valid to 14 Mar 2027", "success"],
              ["EPC", "Rating C, valid to 2031", "success"],
              ["Electrical (EICR)", "Expires in 21 days", "warning"],
              ["Smoke and CO alarms", "Not recorded", "destructive"],
            ].map(([label, detail, tone]) => (
              <li
                key={label}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <span>
                  <span className="font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {detail}
                  </span>
                </span>
                <Badge variant={tone as "success" | "warning" | "destructive"}>
                  {tone === "success"
                    ? "OK"
                    : tone === "warning"
                      ? "Due soon"
                      : "Missing"}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

// --- Screen 3: a form ---

export function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={`grid content-start gap-1.5 ${wide ? "md:col-span-2" : ""}`}
    >
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function FormScreen() {
  return (
    <div className="grid gap-6 p-5">
      <div>
        <p className="text-xs text-muted-foreground">Landlord leads</p>
        <h2 className="text-lg font-semibold tracking-tight">
          New landlord lead
        </h2>
      </div>
      <section className="grid gap-3">
        <h3 className="border-b pb-2 text-sm font-semibold">Landlord</h3>
        <div className="grid gap-x-4 gap-y-3 md:grid-cols-2">
          <Field label="First name">
            <Input defaultValue="Priya" />
          </Field>
          <Field label="Last name">
            <Input defaultValue="Nair" />
          </Field>
          <Field label="Email">
            <Input type="email" placeholder="name@example.com" />
          </Field>
          <Field label="Telephone">
            <Input type="tel" placeholder="07…" />
          </Field>
        </div>
      </section>
      <section className="grid gap-3">
        <h3 className="border-b pb-2 text-sm font-semibold">Property</h3>
        <div className="grid gap-x-4 gap-y-3 md:grid-cols-2">
          <Field label="Address" wide>
            <Input placeholder="Start typing an address" />
          </Field>
          <Field label="Postcode">
            <Input placeholder="M20 4AB" />
          </Field>
          <Field label="Bedrooms">
            <OptionSelect
              options={[
                { value: "1", label: "1" },
                { value: "2", label: "2" },
                { value: "3", label: "3" },
              ]}
              defaultValue="3"
            />
          </Field>
        </div>
      </section>
      <section className="grid gap-3">
        <h3 className="border-b pb-2 text-sm font-semibold">Lead</h3>
        <div className="grid gap-x-4 gap-y-3 md:grid-cols-2">
          <Field label="Source">
            <OptionSelect
              options={[
                { value: "web", label: "Website" },
                { value: "ref", label: "Referral" },
              ]}
              defaultValue="web"
            />
          </Field>
          <Field label="Branch">
            <OptionSelect options={BRANCHES.slice(1)} defaultValue="didsbury" />
          </Field>
          <Field label="Notes" wide>
            <Textarea placeholder="Anything the team should know" />
          </Field>
        </div>
      </section>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="outline">Cancel</Button>
        <Button>Save landlord lead</Button>
      </div>
    </div>
  );
}

// --- One framed example ---

export function ExampleFrame({
  direction,
  screen,
}: {
  direction: Direction;
  screen: ScreenId;
}) {
  const classes = [
    styles.frame,
    styles.scope,
    styles[direction.id],
    direction.nav === "top" ? styles.topnav : "",
    direction.underline ? styles.underline : "",
  ].join(" ");
  return (
    <div className={classes}>
      <Navigation direction={direction} screen={screen} />
      <div className="min-w-0 bg-background">
        <div className="flex items-center justify-end gap-3 border-b px-5 py-2 text-muted-foreground">
          <Bell aria-hidden="true" className="size-4" />
          <User aria-hidden="true" className="size-4" />
        </div>
        {screen === "list" && <ListScreen />}
        {screen === "record" && <RecordScreen direction={direction} />}
        {screen === "form" && <FormScreen />}
      </div>
    </div>
  );
}

// --- The page ---

function href(direction: string, screen: ScreenId) {
  return `/design-lab/look-and-feel?d=${direction}&s=${screen}`;
}

export function LookAndFeelLab({
  directionId,
  screen,
  compare,
}: {
  directionId: string;
  screen: ScreenId;
  compare: boolean;
}) {
  const direction =
    DIRECTIONS.find((item) => item.id === directionId) ?? DIRECTIONS[0];
  const pill = (on: boolean) =>
    `rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted"}`;
  return (
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-8">
      <div className="mx-auto grid max-w-[96rem] gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/design-lab"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Design lab
            </Link>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Look and feel options
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Six proposals for the field style, colour, page headers and
              navigation, drawn with the real shadcn components. Nothing in the
              live app has changed. Dashboards are not included. Names and
              figures are made up. Use the theme buttons to check dark mode.
            </p>
          </div>
          <ThemeToggle />
        </header>

        <div className="flex flex-wrap gap-2" aria-label="Screens">
          {SCREENS.map(({ id, label }) => (
            <Link
              key={id}
              href={`${href(direction.id, id)}${compare ? "&compare=1" : ""}`}
              className={pill(screen === id)}
            >
              {label}
            </Link>
          ))}
          <span className="mx-1 w-px bg-border" aria-hidden="true" />
          <Link
            href={`${href(direction.id, screen)}${compare ? "" : "&compare=1"}`}
            className={pill(compare)}
          >
            {compare ? "Showing all six" : "Compare all six"}
          </Link>
        </div>

        {compare ? (
          <div className="grid gap-8 2xl:grid-cols-2">
            {DIRECTIONS.map((item) => (
              <section key={item.id} className="grid gap-2">
                <h2 className="text-sm font-semibold">
                  {item.number}. {item.name}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {item.strapline}
                  </span>
                </h2>
                <ExampleFrame direction={item} screen={screen} />
              </section>
            ))}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2" aria-label="Directions">
              {DIRECTIONS.map((item) => (
                <Link
                  key={item.id}
                  href={href(item.id, screen)}
                  className={pill(item.id === direction.id)}
                >
                  {item.number}. {item.name}
                </Link>
              ))}
            </div>
            <section className="grid gap-1">
              <h2 className="text-base font-semibold">
                {direction.number}. {direction.name}
              </h2>
              <p className="text-sm text-muted-foreground">
                {direction.strapline}
              </p>
              <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                {direction.traits.map((trait) => (
                  <li key={trait} className="flex gap-2">
                    <FileText
                      aria-hidden="true"
                      className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                    />
                    {trait}
                  </li>
                ))}
              </ul>
            </section>
            <ExampleFrame direction={direction} screen={screen} />
          </>
        )}
        <p className="text-xs text-muted-foreground">
          Tell me which parts you like from which direction (for example the
          fields from 1, the record header from 2, the navigation from 5) and I
          will combine them into the next round.
        </p>
      </div>
    </main>
  );
}
