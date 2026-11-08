import {
  ArrowLeft,
  BadgeCheck,
  BedDouble,
  Bell,
  Building2,
  CalendarClock,
  Home,
  MapPin,
  Plus,
  PoundSterling,
  Tag,
  User,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import {
  BRANCHES,
  DIRECTIONS,
  Field,
  LEADS,
  Navigation,
  SearchField,
  STAGES,
  stageVariant,
} from "./look-and-feel-lab";
import styles from "./look-and-feel-lab.module.css";

// Round two (a proposal, not the product): the Crisp Slate fields, a coloured
// header box on records, and creating a landlord lead in a short modal that
// then opens the new lead. Names and figures are fictional.

export type RoundTwoView = "list" | "modal" | "created" | "property";
export type FactsVariant = "a" | "b" | "c";
export type Band = "blue" | "navy";

export const VIEWS: { id: RoundTwoView; label: string }[] = [
  { id: "list", label: "1. List page" },
  { id: "modal", label: "2. New lead modal" },
  { id: "created", label: "3. After creating" },
  { id: "property", label: "4. Property record" },
];

export const FACT_VARIANTS: {
  id: FactsVariant;
  label: string;
  note: string;
}[] = [
  {
    id: "a",
    label: "A. Inside the box",
    note: "The key facts sit in a second row inside the coloured box, with icons.",
  },
  {
    id: "b",
    label: "B. Profile column",
    note: "The key facts become an icon list in a left column, the way the contact page works today.",
  },
  {
    id: "c",
    label: "C. Separate tiles",
    note: "Each fact is its own small tile with an icon, spaced apart under the box.",
  },
];

type Fact = { label: string; value: string; icon: LucideIcon };

const PROPERTY_FACTS: Fact[] = [
  { label: "Type", value: "Terraced house", icon: Home },
  { label: "Bedrooms", value: "3", icon: BedDouble },
  { label: "Asking rent", value: "£1,450 pcm", icon: PoundSterling },
  { label: "Branch", value: "Didsbury", icon: MapPin },
  { label: "Status", value: "Ready to market", icon: BadgeCheck },
];

const LEAD_FACTS: Fact[] = [
  { label: "Source", value: "Website", icon: Tag },
  { label: "Property", value: "14 Elmwood Road", icon: Building2 },
  { label: "Branch", value: "Didsbury", icon: MapPin },
  { label: "Owner", value: "Olivia Hart", icon: UserRound },
  { label: "Created", value: "Today, 09:42", icon: CalendarClock },
];

// --- The record header and key facts ---

function FactsInBox({ facts }: { facts: Fact[] }) {
  return (
    <div className={styles.bandFacts}>
      {facts.map(({ label, value, icon: Icon }) => (
        <div key={label} className="flex items-center gap-2.5">
          <Icon aria-hidden="true" className="size-4 shrink-0 opacity-80" />
          <div className="min-w-0">
            <p className={`text-[0.6875rem] ${styles.heroMuted}`}>{label}</p>
            <p className="truncate text-sm font-semibold">{value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function FactsList({ facts }: { facts: Fact[] }) {
  return (
    <dl className="grid content-start gap-4">
      {facts.map(({ label, value, icon: Icon }) => (
        <div key={label} className="flex gap-3">
          <Icon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 text-sm font-medium">{value}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

function FactTiles({ facts }: { facts: Fact[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {facts.map(({ label, value, icon: Icon }) => (
        <div
          key={label}
          className="flex items-center gap-3 rounded-lg border bg-card px-3.5 py-3"
        >
          <span
            aria-hidden="true"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-primary"
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="truncate text-sm font-semibold">{value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function RecordLayout({
  back,
  title,
  subtitle,
  badge,
  actions,
  facts,
  variant,
  banner,
  children,
}: {
  back: string;
  title: string;
  subtitle: string;
  badge?: ReactNode;
  actions: ReactNode;
  facts: Fact[];
  variant: FactsVariant;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const tabs = (
    <div className="flex gap-1 border-b text-sm">
      {["Overview", "Compliance", "Documents", "History"].map((tab, index) => (
        <span
          key={tab}
          className={`-mb-px border-b-2 px-3 py-2 font-medium ${index === 0 ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
        >
          {tab}
        </span>
      ))}
    </div>
  );
  return (
    <div className="grid gap-5 p-5">
      <span className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground">
        <ArrowLeft aria-hidden="true" className="size-3.5" />
        {back}
      </span>
      {banner}
      <div className={`${styles.heroBand} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span
              aria-hidden="true"
              className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-white/15"
            >
              <Building2 className="size-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight">
                  {title}
                </h2>
                {badge}
              </div>
              <p className={`text-xs ${styles.heroMuted}`}>{subtitle}</p>
            </div>
          </div>
          <div className="flex gap-2">{actions}</div>
        </div>
        {variant === "a" && <FactsInBox facts={facts} />}
      </div>
      {variant === "c" && <FactTiles facts={facts} />}
      {variant === "b" ? (
        <div className="grid gap-x-8 gap-y-5 xl:grid-cols-[13rem_minmax(0,1fr)]">
          <FactsList facts={facts} />
          <div className="grid min-w-0 content-start gap-5 xl:border-l xl:pl-8">
            {tabs}
            {children}
          </div>
        </div>
      ) : (
        <>
          {tabs}
          {children}
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid content-start gap-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function PropertyBody() {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Section title="Current instruction">
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
      </Section>
      <Section title="Compliance">
        <ul className="divide-y rounded-lg border bg-card text-sm">
          {[
            ["Gas safety", "Valid to 14 Mar 2027", "success", "OK"],
            ["EPC", "Rating C, valid to 2031", "success", "OK"],
            ["Electrical (EICR)", "Expires in 21 days", "warning", "Due soon"],
            ["Smoke and CO alarms", "Not recorded", "destructive", "Missing"],
          ].map(([label, detail, tone, text]) => (
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
                {text}
              </Badge>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function LeadBody() {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Section title="Landlord">
        <dl className="grid grid-cols-2 content-start gap-x-6 gap-y-3 text-sm">
          {[
            ["Name", "Priya Nair"],
            ["Telephone", "07700 900123"],
            ["Email", "priya.nair@example.com"],
            ["Reference", "LL-8F3K2"],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 font-medium [overflow-wrap:anywhere]">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </Section>
      <Section title="Next action">
        <p className="rounded-md bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
          No next action yet. Book an appraisal or add a task.
        </p>
      </Section>
    </div>
  );
}

// --- The list page and the modal ---

function NewLeadForm() {
  return (
    <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2">
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
      <Field label="Property address" wide>
        <Input placeholder="Start typing an address" />
      </Field>
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
      <Field label="Notes (optional)" wide>
        <Textarea rows={2} placeholder="Anything the team should know" />
      </Field>
    </div>
  );
}

function ListWithModal({
  open,
  createdHref,
  modalClass,
}: {
  open: boolean;
  createdHref: string;
  modalClass: string;
}) {
  return (
    <div className="grid gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold tracking-tight">
            Landlord leads
          </h2>
          <span className="text-sm text-muted-foreground">24 open</span>
        </div>
        <Dialog key={open ? "open" : "closed"} defaultOpen={open}>
          <DialogTrigger render={<Button />}>
            <Plus aria-hidden="true" />
            New landlord lead
          </DialogTrigger>
          <DialogContent
            className={`${modalClass} bg-card text-foreground sm:max-w-xl`}
          >
            <DialogHeader>
              <DialogTitle>New landlord lead</DialogTitle>
              <DialogDescription>
                Just the basics. You can add everything else on the lead
                afterwards.
              </DialogDescription>
            </DialogHeader>
            <NewLeadForm />
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button render={<Link href={createdHref} />} nativeButton={false}>
                Create landlord lead
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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

// --- The page ---

function link(view: RoundTwoView, facts: FactsVariant, band: Band) {
  return `/design-lab/look-and-feel-2?v=${view}&f=${facts}&b=${band}`;
}

export function LookAndFeelRoundTwo({
  view,
  facts,
  band,
}: {
  view: RoundTwoView;
  facts: FactsVariant;
  band: Band;
}) {
  const crisp = DIRECTIONS[0];
  const scopeClass = [
    styles.scope,
    styles.d1,
    band === "navy" ? styles.bandNavy : styles.bandBlue,
  ].join(" ");
  const isRecord = view === "created" || view === "property";
  const pill = (on: boolean) =>
    `rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted"}`;
  const note = FACT_VARIANTS.find((item) => item.id === facts)?.note;

  return (
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-8">
      <div className="mx-auto grid max-w-[96rem] gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/design-lab/look-and-feel"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Round one
            </Link>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Look and feel, round two
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Crisp Slate fields and colours, a coloured box at the top of each
              record, a sidebar, and creating a landlord lead in a short modal
              that then opens the new lead. Names and figures are made up.
            </p>
          </div>
          <ThemeToggle />
        </header>

        <div className="flex flex-wrap gap-2" aria-label="Views">
          {VIEWS.map(({ id, label }) => (
            <Link
              key={id}
              href={link(id, facts, band)}
              className={pill(view === id)}
            >
              {label}
            </Link>
          ))}
        </div>

        {isRecord && (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Key facts:</span>
              {FACT_VARIANTS.map(({ id, label }) => (
                <Link
                  key={id}
                  href={link(view, id, band)}
                  className={pill(facts === id)}
                >
                  {label}
                </Link>
              ))}
              <span className="mx-1 w-px self-stretch bg-border" />
              <span className="text-sm text-muted-foreground">Box colour:</span>
              <Link
                href={link(view, facts, "blue")}
                className={pill(band === "blue")}
              >
                Blue
              </Link>
              <Link
                href={link(view, facts, "navy")}
                className={pill(band === "navy")}
              >
                Deep navy
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">{note}</p>
          </div>
        )}

        <div className={`${styles.frame} ${scopeClass}`}>
          <Navigation
            direction={crisp}
            screen="list"
            active={view === "property" ? "properties" : "leads"}
          />
          <div className="min-w-0 bg-background">
            <div className="flex items-center justify-end gap-3 border-b px-5 py-2 text-muted-foreground">
              <Bell aria-hidden="true" className="size-4" />
              <User aria-hidden="true" className="size-4" />
            </div>
            {(view === "list" || view === "modal") && (
              <ListWithModal
                open={view === "modal"}
                createdHref={link("created", facts, band)}
                modalClass={scopeClass}
              />
            )}
            {view === "created" && (
              <RecordLayout
                back="Back to landlord leads"
                title="Priya Nair"
                subtitle="Landlord lead LL-8F3K2 · 14 Elmwood Road, M20 4AB"
                badge={<Badge variant="secondary">New</Badge>}
                actions={
                  <>
                    <Button variant="secondary">Edit</Button>
                    <Button variant="secondary">Book appraisal</Button>
                  </>
                }
                facts={LEAD_FACTS}
                variant={facts}
                banner={
                  <p
                    className="rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success"
                    role="status"
                  >
                    Landlord lead created. Next step: book an appraisal.
                  </p>
                }
              >
                <LeadBody />
              </RecordLayout>
            )}
            {view === "property" && (
              <RecordLayout
                back="Back to properties"
                title="14 Elmwood Road, Manchester M20 4AB"
                subtitle="Property PRP-4K7M2 · Owned by Priya Nair"
                actions={
                  <>
                    <Button variant="secondary">Edit</Button>
                    <Button variant="secondary">Start instruction</Button>
                  </>
                }
                facts={PROPERTY_FACTS}
                variant={facts}
              >
                <PropertyBody />
              </RecordLayout>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
