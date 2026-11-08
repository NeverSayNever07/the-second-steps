import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { EnquirySummary } from "@/core/applicants/application/property-enquiries";
import type { SuggestedListing } from "@/core/applicants/application/applicant-matching";
import { ENQUIRY_STAGE_LABELS } from "@/core/applicants/domain/applicant";
import type { Requirements } from "@/core/applicants/domain/requirements";
import { REQUIREMENT_NOTES_HINT } from "@/core/applicants/domain/requirements";
import {
  formatPence,
  formatRent,
} from "@/core/instructions/domain/instruction-labels";
import { RENT_PERIOD_LABELS } from "@/core/instructions/domain/instruction-labels";
import {
  FURNISHED_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
} from "@/core/properties/domain/property-labels";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  dateStyle: "medium",
});
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  dateStyle: "medium",
  timeStyle: "short",
});

const dateOnly = (value: string | null) =>
  value ? dateFormat.format(new Date(`${value}T12:00:00Z`)) : null;

export function SectionHeading({ title }: { title: string }) {
  return <h2 className="text-base font-semibold">{title}</h2>;
}

function range(
  low: number | null,
  high: number | null,
  format: (value: number) => string,
) {
  if (low !== null && high !== null) {
    return low === high ? format(low) : `${format(low)} to ${format(high)}`;
  }
  if (low !== null) return `From ${format(low)}`;
  if (high !== null) return `Up to ${format(high)}`;
  return null;
}

/** What the household is looking for, as flat label/value rows. */
export function RequirementsList({
  requirements,
}: {
  requirements: Requirements;
}) {
  const rent = range(
    requirements.minRentPence,
    requirements.maxRentPence,
    formatPence,
  );
  const bedrooms = range(
    requirements.minBedrooms,
    requirements.maxBedrooms,
    String,
  );
  const moveFrom = dateOnly(requirements.moveFrom);
  const moveBy = dateOnly(requirements.moveBy);
  const rows: [string, string | null][] = [
    ["Areas", requirements.areas.join(", ") || null],
    [
      "Rent",
      rent ? `${rent} ${RENT_PERIOD_LABELS[requirements.rentPeriod]}` : null,
    ],
    ["Bedrooms", bedrooms],
    [
      "Property types",
      requirements.propertyTypes
        .map((type) => PROPERTY_TYPE_LABELS[type])
        .join(", ") || null,
    ],
    [
      "Furnishing",
      requirements.furnished
        ? FURNISHED_STATUS_LABELS[requirements.furnished]
        : null,
    ],
    [
      "Moving",
      moveFrom && moveBy
        ? `${moveFrom} to ${moveBy}`
        : moveFrom
          ? `From ${moveFrom}`
          : moveBy
            ? `By ${moveBy}`
            : null,
    ],
    [
      "Household size",
      requirements.householdSize ? String(requirements.householdSize) : null,
    ],
    ["Pets", requirements.hasPets ? "Yes" : "No"],
    ["Notes", requirements.notes || null],
  ];
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 text-sm font-medium [overflow-wrap:anywhere]">
            {value ?? (
              <span className="font-normal text-muted-foreground">
                Not recorded
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function RequirementsHint() {
  return (
    <p className="text-xs text-muted-foreground">
      {REQUIREMENT_NOTES_HINT} Pets and household size are shown for information
      and never rule a home out.
    </p>
  );
}

function stageVariant(stage: EnquirySummary["stage"]) {
  if (stage === "closed") return "secondary" as const;
  if (stage === "viewing_arranged") return "info" as const;
  return "default" as const;
}

export function EnquiryList({
  enquiries,
  base,
}: {
  enquiries: EnquirySummary[];
  base: string;
}) {
  if (enquiries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No property enquiries yet.
      </p>
    );
  }
  return (
    <ul className="grid divide-y rounded-lg border">
      {enquiries.map((enquiry) => (
        <li key={enquiry.id} className="grid gap-1 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <Link
              className="min-w-0 font-medium text-primary underline-offset-4 [overflow-wrap:anywhere] hover:underline"
              href={`${base}/marketing/${enquiry.listing.id}`}
            >
              {enquiry.property.address}
            </Link>
            <Badge variant={stageVariant(enquiry.stage)}>
              {ENQUIRY_STAGE_LABELS[enquiry.stage]}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {enquiry.branch.name} · Since {dateFormat.format(enquiry.createdAt)}
            {enquiry.assignee ? ` · ${enquiry.assignee.name}` : ""}
          </p>
          {enquiry.closure && (
            <p className="text-sm">
              Closed
              {enquiry.closure.reason ? `: ${enquiry.closure.reason}` : ""}
              {enquiry.closure.note ? ` (${enquiry.closure.note})` : ""}
            </p>
          )}
          {enquiry.notice && (
            <p className="text-sm font-medium text-warning">{enquiry.notice}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

export function SuggestedHomes({
  items,
  hasRequirements,
  base,
}: {
  items: SuggestedListing[];
  hasRequirements: boolean;
  base: string;
}) {
  if (!hasRequirements) {
    return (
      <p className="text-sm text-muted-foreground">
        Save the household&apos;s requirements to see homes that fit. Nothing is
        suggested without them.
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No Ready to advertise homes fit these requirements right now.
      </p>
    );
  }
  return (
    <ul className="grid divide-y rounded-lg border">
      {items.map(({ listing, alreadyEnquired }) => (
        <li key={listing.id} className="grid gap-1 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <Link
              className="min-w-0 font-medium text-primary underline-offset-4 [overflow-wrap:anywhere] hover:underline"
              href={`${base}/marketing/${listing.id}`}
            >
              {listing.address}
            </Link>
            {alreadyEnquired && <Badge variant="secondary">Enquiry open</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {listing.bedrooms !== null ? `${listing.bedrooms} bed · ` : ""}
            {formatRent({
              askingRentPence: listing.rentPence,
              rentPeriod: listing.rentPeriod,
            })}
            {listing.availableFrom
              ? ` · Available ${dateOnly(listing.availableFrom)}`
              : ""}
          </p>
          <p className="text-xs text-muted-foreground">{listing.branch.name}</p>
        </li>
      ))}
    </ul>
  );
}

export function formatWhen(date: Date) {
  return dateTimeFormat.format(date);
}
