import {
  AlertTriangle,
  Bell,
  Building2,
  Check,
  ChevronDown,
  CircleAlert,
  FileText,
  Home,
  House,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import styles from "./design-lab.module.css";

const SELECTED_STYLE = [
  ["Shell", "Layered panels"],
  ["Fields", "Soft filled"],
  ["Cards", "Floating"],
  ["Table", "Clean rows"],
] as const;

const DIRECTIONS = [
  {
    id: "cobalt",
    number: "01",
    name: "Cobalt Blue",
    strapline: "Clear, confident and familiar",
    description:
      "A crisp commercial blue with a charcoal shell and cool neutral working surfaces.",
    traits: SELECTED_STYLE,
    className: styles.cobalt,
  },
  {
    id: "navy",
    number: "02",
    name: "Deep Navy",
    strapline: "Established, composed and dependable",
    description:
      "A darker blue direction with steel-grey neutrals for a traditional, trusted business tone.",
    traits: SELECTED_STYLE,
    className: styles.navy,
  },
  {
    id: "aubergine",
    number: "03",
    name: "Aubergine",
    strapline: "Premium, warm and relationship-led",
    description:
      "The original plum direction, pairing warm neutrals with a distinctive but restrained primary colour.",
    traits: SELECTED_STYLE,
    className: styles.aubergine,
  },
  {
    id: "forest",
    number: "04",
    name: "Forest Green",
    strapline: "Grounded, trustworthy and calm",
    description:
      "A mature green palette with natural grey surfaces and a steady operational character.",
    traits: SELECTED_STYLE,
    className: styles.evergreen,
  },
  {
    id: "petrol",
    number: "05",
    name: "Petrol Blue",
    strapline: "Modern, calm and approachable",
    description:
      "A blue-green primary with misted surfaces that feels contemporary without becoming playful.",
    traits: SELECTED_STYLE,
    className: styles.ocean,
  },
  {
    id: "burgundy",
    number: "06",
    name: "Burgundy",
    strapline: "Assured, warm and distinctive",
    description:
      "A restrained wine-red brand colour balanced by pale stone and rose-grey surfaces.",
    traits: SELECTED_STYLE,
    className: styles.burgundy,
  },
  {
    id: "indigo",
    number: "07",
    name: "Soft Indigo",
    strapline: "Digital, polished and precise",
    description:
      "An indigo-led SaaS palette with soft lavender accents and cool graphite navigation.",
    traits: SELECTED_STYLE,
    className: styles.graphite,
  },
  {
    id: "bronze",
    number: "08",
    name: "Warm Bronze",
    strapline: "Established, warm and understated",
    description:
      "An earthy bronze accent with warm stone surfaces for a quieter premium direction.",
    traits: SELECTED_STYLE,
    className: styles.bronze,
  },
] as const;

const STATUSES = [
  ["Active", "success"],
  ["Pending", "warning"],
  ["Draft", "secondary"],
  ["Referencing", "info"],
  ["Let Agreed", "default"],
  ["Tenancy Live", "success"],
  ["Arrears", "destructive"],
  ["Expired", "outline"],
  ["Failed / Issue", "destructive"],
] as const;

const PROPERTIES = [
  {
    address: "14 Willow Close",
    landlord: "Eleanor Price",
    branch: "Main Branch",
    rent: "£1,450 pcm",
    status: "Tenancy Live",
    variant: "success",
  },
  {
    address: "8 Riverside Mews",
    landlord: "Daniel Foster",
    branch: "Riverside",
    rent: "£1,825 pcm",
    status: "Referencing",
    variant: "info",
  },
  {
    address: "32 Market Square, Flat 4",
    landlord: "Hawthorne Property",
    branch: "Main Branch",
    rent: "£1,200 pcm",
    status: "Let Agreed",
    variant: "default",
  },
] as const;

const PALETTE = [
  ["Primary", styles.swatchPrimary],
  ["Secondary", styles.swatchSecondary],
  ["Accent", styles.swatchAccent],
  ["Success", styles.swatchSuccess],
  ["Warning", styles.swatchWarning],
  ["Danger", styles.swatchDanger],
  ["Surface", styles.swatchSurface],
  ["Neutral", styles.swatchNeutral],
] as const;

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className={styles.sectionHeading}>
      <p>{eyebrow}</p>
      <h3>{title}</h3>
      {description && <span>{description}</span>}
    </div>
  );
}

function Palette() {
  return (
    <section>
      <SectionHeading
        eyebrow="Foundation"
        title="Colour palette"
        description="Core product roles shown on the same surface."
      />
      <div className={styles.paletteGrid}>
        {PALETTE.map(([label, className]) => (
          <div key={label} className={styles.paletteItem}>
            <span className={`${styles.swatch} ${className}`} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Buttons() {
  return (
    <section>
      <SectionHeading eyebrow="Actions" title="Buttons" />
      <div className={styles.buttonRow}>
        <Button type="button">
          <Plus aria-hidden="true" /> New property
        </Button>
        <Button type="button" variant="secondary">
          Secondary
        </Button>
        <Button type="button" variant="outline">
          Outline
        </Button>
        <Button type="button" variant="ghost">
          Ghost
        </Button>
        <Button type="button" variant="destructive">
          Archive
        </Button>
        <Button type="button" disabled>
          Disabled
        </Button>
        <Button type="button" variant="outline" size="icon" aria-label="Search">
          <Search aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="More actions"
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}

function Statuses() {
  return (
    <section>
      <SectionHeading eyebrow="Workflow" title="Badges and status chips" />
      <div className={styles.badgeRow}>
        {STATUSES.map(([label, variant]) => (
          <Badge key={label} variant={variant}>
            {label}
          </Badge>
        ))}
      </div>
    </section>
  );
}

function FormControls({ themeId }: { themeId: string }) {
  const viewName = `view-${themeId}`;
  return (
    <section>
      <SectionHeading
        eyebrow="Data entry"
        title="Form controls"
        description="A realistic property instruction form fragment."
      />
      <div className={styles.formGrid}>
        <div className={styles.field}>
          <Label htmlFor={`address-${themeId}`}>Property address</Label>
          <Input id={`address-${themeId}`} defaultValue="14 Willow Close" />
          <p>Start typing an address or enter it manually.</p>
        </div>
        <div className={styles.field}>
          <Label htmlFor={`service-${themeId}`}>Service</Label>
          <div className={styles.selectWrap}>
            <select id={`service-${themeId}`} defaultValue="managed">
              <option value="managed">Fully managed</option>
              <option value="collection">Rent collection</option>
              <option value="let-only">Let only</option>
            </select>
            <ChevronDown aria-hidden="true" />
          </div>
        </div>
        <div className={styles.field}>
          <Label htmlFor={`available-${themeId}`}>Available from</Label>
          <Input
            id={`available-${themeId}`}
            type="date"
            defaultValue="2026-11-01"
          />
        </div>
        <div className={styles.field}>
          <Label htmlFor={`rent-${themeId}`}>Monthly rent</Label>
          <Input
            id={`rent-${themeId}`}
            aria-invalid="true"
            defaultValue="1450.00"
          />
          <p className={styles.errorText}>Confirm the advertised rent.</p>
        </div>
        <div className={`${styles.field} ${styles.fullField}`}>
          <Label htmlFor={`notes-${themeId}`}>Internal notes</Label>
          <textarea
            id={`notes-${themeId}`}
            rows={3}
            defaultValue="Landlord would prefer a professional couple. Follow up after the appraisal."
          />
        </div>
        <label className={styles.checkControl}>
          <input type="checkbox" defaultChecked />
          Property is ready to market
        </label>
        <fieldset className={styles.segmentedField}>
          <legend>Default view</legend>
          <div className={styles.segmented}>
            <label>
              <input type="radio" name={viewName} defaultChecked />
              <span>Pipeline</span>
            </label>
            <label>
              <input type="radio" name={viewName} />
              <span>List</span>
            </label>
            <label>
              <input type="radio" name={viewName} />
              <span>Map</span>
            </label>
          </div>
        </fieldset>
      </div>
    </section>
  );
}

function SummaryCards() {
  return (
    <section>
      <SectionHeading eyebrow="Records" title="Cards" />
      <div className={styles.cardGrid}>
        <Card>
          <CardHeader>
            <div className={styles.cardIcon}>
              <Users aria-hidden="true" />
            </div>
            <CardTitle>Eleanor Price</CardTitle>
            <CardDescription>Landlord · LL-1842</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className={styles.compactDetails}>
              <div>
                <dt>Properties with us</dt>
                <dd>3</dd>
              </div>
              <div>
                <dt>Next action</dt>
                <dd>Call Friday</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className={styles.cardIcon}>
              <House aria-hidden="true" />
            </div>
            <CardTitle>14 Willow Close</CardTitle>
            <CardDescription>3 bed · Semi-detached</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={styles.cardFooterLine}>
              <strong>£1,450 pcm</strong>
              <Badge variant="success">Tenancy Live</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className={styles.cardIcon}>
              <FileText aria-hidden="true" />
            </div>
            <CardTitle>Amelia Collins</CardTitle>
            <CardDescription>Applicant · APP-0921</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={styles.cardFooterLine}>
              <span>Referencing due today</span>
              <Badge variant="info">Referencing</Badge>
            </div>
          </CardContent>
        </Card>
        <Card className={styles.kpiCard}>
          <CardHeader>
            <CardDescription>Properties on market</CardDescription>
            <CardTitle className={styles.kpiValue}>24</CardTitle>
          </CardHeader>
          <CardContent>
            <p>
              <strong>+4</strong> since last month
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function PropertyTable() {
  return (
    <section>
      <SectionHeading
        eyebrow="Operations"
        title="Property table"
        description="The same sample records at desktop and mobile widths."
      />
      <Card className={styles.desktopTable}>
        <Table>
          <caption className="sr-only">Example managed properties</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Property</TableHead>
              <TableHead>Landlord</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Rent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {PROPERTIES.map((property) => (
              <TableRow key={property.address}>
                <TableCell className="font-medium">
                  {property.address}
                </TableCell>
                <TableCell>{property.landlord}</TableCell>
                <TableCell>{property.branch}</TableCell>
                <TableCell>{property.rent}</TableCell>
                <TableCell>
                  <Badge variant={property.variant}>{property.status}</Badge>
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Actions for ${property.address}`}
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <div className={styles.mobileRecords}>
        {PROPERTIES.map((property) => (
          <Card key={property.address} size="sm">
            <CardHeader>
              <CardTitle>{property.address}</CardTitle>
              <CardDescription>{property.landlord}</CardDescription>
            </CardHeader>
            <CardContent className={styles.mobileRecordMeta}>
              <span>{property.rent}</span>
              <Badge variant={property.variant}>{property.status}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function NavigationPreview() {
  return (
    <section>
      <SectionHeading eyebrow="Wayfinding" title="Navigation" />
      <div className={styles.appPreview}>
        <aside className={styles.previewSidebar}>
          <div className={styles.miniBrand}>
            <span /> Zayto
          </div>
          <p>Oakfield Lettings</p>
          <nav aria-label="Example sidebar">
            <a href="#design-lab-top">
              <Home aria-hidden="true" /> Overview
            </a>
            <a href="#design-lab-top" className={styles.activeNav}>
              <Building2 aria-hidden="true" /> Properties
            </a>
            <a href="#design-lab-top">
              <Users aria-hidden="true" /> Contacts
            </a>
            <a href="#design-lab-top">
              <Settings aria-hidden="true" /> Settings
            </a>
          </nav>
        </aside>
        <div className={styles.previewMain}>
          <header>
            <div>
              <strong>Properties</strong>
              <span>24 managed records</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Notifications"
            >
              <Bell aria-hidden="true" />
            </Button>
            <div className={styles.avatar}>OH</div>
          </header>
          <div className={styles.previewBody}>
            <nav className={styles.tabs} aria-label="Example property sections">
              <a href="#design-lab-top" className={styles.activeTab}>
                Overview
              </a>
              <a href="#design-lab-top">Ownership</a>
              <a href="#design-lab-top">Instruction</a>
              <a href="#design-lab-top">Activity</a>
              <a href="#design-lab-top">Documents</a>
            </nav>
            <div className={styles.previewPlaceholder}>
              <House aria-hidden="true" />
              <span>Property workspace</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeedbackStates() {
  return (
    <section>
      <SectionHeading eyebrow="System feedback" title="States and alerts" />
      <div className={styles.feedbackGrid}>
        <Card className={styles.emptyState}>
          <CardContent>
            <div className={styles.emptyIcon}>
              <House aria-hidden="true" />
            </div>
            <strong>No properties match these filters</strong>
            <p>Clear a filter or add a new property record.</p>
            <Button type="button" variant="outline" size="sm">
              Clear filters
            </Button>
          </CardContent>
        </Card>
        <Card
          className={styles.loadingCard}
          aria-label="Loading property summary"
        >
          <CardContent>
            <span className={styles.skeletonShort} />
            <span className={styles.skeletonLong} />
            <span className={styles.skeletonMedium} />
          </CardContent>
        </Card>
        <div className={styles.alertStack}>
          <div
            className={`${styles.alert} ${styles.successAlert}`}
            role="status"
          >
            <Check aria-hidden="true" />
            <div>
              <strong>Instruction saved</strong>
              <span>The landlord record is up to date.</span>
            </div>
          </div>
          <div
            className={`${styles.alert} ${styles.warningAlert}`}
            role="status"
          >
            <AlertTriangle aria-hidden="true" />
            <div>
              <strong>Gas safety expires soon</strong>
              <span>Renewal is due in 14 days.</span>
            </div>
          </div>
          <div className={`${styles.alert} ${styles.errorAlert}`} role="alert">
            <CircleAlert aria-hidden="true" />
            <div>
              <strong>Payment could not be recorded</strong>
              <span>Check the amount and try again.</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ThemeShowcase({
  direction,
}: {
  direction: (typeof DIRECTIONS)[number];
}) {
  return (
    <article
      id={direction.id}
      className={`${styles.direction} ${direction.className}`}
    >
      <header className={styles.directionHeader}>
        <div className={styles.directionNumber}>{direction.number}</div>
        <div>
          <p>{direction.strapline}</p>
          <h2>{direction.name}</h2>
          {direction.id === "navy" ? (
            <Badge variant="default">Selected direction</Badge>
          ) : null}
          <span>{direction.description}</span>
          <dl className={styles.styleTraits}>
            {direction.traits.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>
      <div className={styles.showcaseBody}>
        <Palette />
        <div className={styles.twoColumn}>
          <Buttons />
          <Statuses />
        </div>
        <FormControls themeId={direction.id} />
        <SummaryCards />
        <PropertyTable />
        <NavigationPreview />
        <FeedbackStates />
      </div>
    </article>
  );
}

export function DesignLab() {
  return (
    <main id="design-lab-top" className={styles.lab}>
      <nav
        aria-label="Design lab pages"
        className="flex flex-wrap gap-x-5 gap-y-1 pb-4 text-sm font-medium"
      >
        <Link href="/dashboard" className="text-primary hover:underline">
          Back to the app
        </Link>
        <Link
          href="/design-lab/dashboards"
          className="text-primary hover:underline"
        >
          Dashboard options
        </Link>
        <Link
          href="/design-lab/dashboard-structure"
          className="text-primary hover:underline"
        >
          Dashboard structure
        </Link>
        <Link
          href="/design-lab/contact"
          className="text-primary hover:underline"
        >
          Contact page options
        </Link>
      </nav>
      <header className={styles.labHeader}>
        <div>
          <Badge variant="info">Internal proof of concept</Badge>
          <h1>Zayto UI Design Lab</h1>
          <p>
            Deep Navy is the selected Zayto direction, using the Aubergine
            component style and Cobalt table. The alternatives remain here as a
            record of the comparison.
          </p>
        </div>
        <div className={styles.reviewNote}>
          <strong>Review lens</strong>
          <span>Brand fit · trust · clarity · accessibility</span>
        </div>
      </header>
      <nav className={styles.jumpNav} aria-label="Colour directions">
        {DIRECTIONS.map((direction) => (
          <a key={direction.id} href={`#${direction.id}`}>
            <span>{direction.number}</span>
            {direction.name}
          </a>
        ))}
      </nav>
      <div className={styles.directionList}>
        {DIRECTIONS.map((direction) => (
          <ThemeShowcase key={direction.id} direction={direction} />
        ))}
      </div>
    </main>
  );
}
