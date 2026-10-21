import { AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  EPC_POSITION_LABELS,
  type EpcSnapshot,
} from "@/core/listings/domain/listing-epc";
import type { ListingEventKind } from "@/core/listings/domain/listing";
import type { DriftItem } from "@/core/listings/domain/listing-drift";
import type {
  ChecklistItem,
  ListingWarning,
} from "@/core/listings/domain/listing-readiness";
import type {
  ListingEventView,
  ListingView,
} from "@/core/listings/application/listings";
import {
  DEPOSIT_OFFERING_LABELS,
  formatPence,
  formatRent,
} from "@/core/instructions/domain/instruction-labels";
import {
  FURNISHED_STATUS_LABELS,
  PROPERTY_FEATURE_LABELS,
  PROPERTY_TYPE_LABELS,
} from "@/core/properties/domain/property-labels";

const dateTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  dateStyle: "medium",
  timeStyle: "short",
});
const dateOnly = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC" });

export function Checklist({
  title,
  items,
  description,
}: {
  title: string;
  items: readonly ChecklistItem[];
  description?: string;
}) {
  return (
    <section className="grid gap-3" aria-label={title}>
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <ul className="grid divide-y border-t">
        {items.map((item) => (
          <li key={item.code} className="flex gap-3 py-3">
            {item.met ? (
              <CheckCircle2
                className="mt-0.5 size-4 shrink-0 text-success"
                aria-hidden="true"
              />
            ) : (
              <Circle
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {item.label}
                <span className="sr-only">
                  {item.met ? " (done)" : " (still needed)"}
                </span>
              </p>
              {!item.met && item.hint && (
                <p className="text-xs text-muted-foreground">{item.hint}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Warnings({
  warnings,
}: {
  warnings: readonly ListingWarning[];
}) {
  if (warnings.length === 0) return null;
  return (
    <section className="grid gap-3" aria-label="Safety and licensing warnings">
      <div>
        <h3 className="text-base font-semibold">Warnings</h3>
        <p className="text-sm text-muted-foreground">
          Gaps in the property&apos;s safety and licensing evidence. They do not
          stop the listing moving forward, but they matter before a tenancy.
        </p>
      </div>
      <ul className="grid divide-y border-t">
        {warnings.map((warning) => (
          <li
            key={`${warning.area}-${warning.message}`}
            className="flex items-start gap-3 py-3 text-sm"
          >
            <AlertTriangle
              className={`mt-0.5 size-4 shrink-0 ${warning.severity === "warning" ? "text-warning" : "text-muted-foreground"}`}
              aria-hidden="true"
            />
            <span>{warning.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EpcPositionView({
  epc,
  complianceHref,
}: {
  epc: EpcSnapshot;
  complianceHref: string;
}) {
  return (
    <section className="grid gap-2" aria-label="EPC position">
      <h3 className="text-base font-semibold">EPC position</h3>
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={
            epc.position === "evidence_reviewed" ||
            epc.position === "commissioned_awaiting" ||
            epc.position === "does_not_apply"
              ? "success"
              : "warning"
          }
        >
          {EPC_POSITION_LABELS[epc.position]}
        </Badge>
        {epc.rating && <Badge variant="secondary">Rating {epc.rating}</Badge>}
        <Link
          href={complianceHref}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Open the property&apos;s compliance
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        {[
          epc.reference,
          epc.eventOn &&
            `Dated ${dateOnly.format(new Date(`${epc.eventOn}T00:00:00Z`))}`,
          epc.expiresOn &&
            `expires ${dateOnly.format(new Date(`${epc.expiresOn}T00:00:00Z`))}`,
          epc.reason,
        ]
          .filter(Boolean)
          .join(" · ") || "No EPC details recorded yet."}
      </p>
    </section>
  );
}

export function DriftPanel({ drift }: { drift: readonly DriftItem[] }) {
  if (drift.length === 0) return null;
  return (
    <section
      className="grid gap-3 rounded-xl bg-warning-soft p-4 text-sm"
      aria-label="Changes since the last save"
      role="status"
    >
      <div>
        <p className="font-semibold">
          The property or agreed terms have changed since this version
        </p>
        <p>
          Saving a draft takes these in. A listing cannot be confirmed until it
          is saved again.
        </p>
      </div>
      <ul className="grid divide-y divide-border/60">
        {drift.map((item) => (
          <li
            key={item.field}
            className="grid gap-1 py-2 sm:grid-cols-[12rem_minmax(0,1fr)]"
          >
            <span className="font-medium">{item.label}</span>
            <span className="[overflow-wrap:anywhere]">
              {item.before} → {item.after}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The figures a listing copies and cannot edit. */
export function SourcedFacts({ listing }: { listing: ListingView }) {
  const { current } = listing;
  const facts = current.facts;
  const rent = current.rent;
  const rows: [string, string][] = [
    [
      "Advertised rent",
      formatRent({
        askingRentPence: rent.advertisedRentPence,
        rentPeriod: rent.rentPeriod,
      }),
    ],
    [
      "Deposit",
      rent.depositOffering
        ? `${DEPOSIT_OFFERING_LABELS[rent.depositOffering]}${rent.depositPence !== null ? `, ${formatPence(rent.depositPence)}` : ""}`
        : "Not decided yet",
    ],
    [
      "Property",
      [
        PROPERTY_TYPE_LABELS[facts.propertyType],
        facts.bedrooms !== null && `${facts.bedrooms} bed`,
        facts.bathrooms !== null && `${facts.bathrooms} bath`,
        facts.receptionRooms !== null && `${facts.receptionRooms} reception`,
        facts.furnishedStatus && FURNISHED_STATUS_LABELS[facts.furnishedStatus],
        facts.councilTaxBand && `Council tax band ${facts.councilTaxBand}`,
      ]
        .filter(Boolean)
        .join(" · "),
    ],
    [
      "Features",
      facts.features.length
        ? facts.features
            .map((feature) => PROPERTY_FEATURE_LABELS[feature])
            .join(", ")
        : "None recorded",
    ],
  ];
  return (
    <section
      className="grid gap-3"
      aria-label="Copied from the property and terms"
    >
      <div>
        <h3 className="text-base font-semibold">Copied from the sources</h3>
        <p className="text-sm text-muted-foreground">
          The rent and deposit come from the instruction&apos;s agreed terms,
          and the property details from the property. Change them there; saving
          a draft takes the latest in.
        </p>
      </div>
      <dl className="grid divide-y border-t">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)]"
          >
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium [overflow-wrap:anywhere]">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const EVENT_LABELS: Record<ListingEventKind, string> = {
  created: "Listing prepared",
  version_saved: "Draft saved",
  marked_content_ready: "Marked Content ready",
  marked_ready_to_advertise: "Marked Ready to advertise",
  returned_to_draft: "Returned to Draft",
  edited_after_review: "Edited after review, returned to Draft",
  withdrawn: "Withdrawn",
  instruction_returned:
    "Returned to Draft: the instruction went back to Onboarding",
  instruction_ended: "Withdrawn: the instruction ended",
};

export function ListingHistory({
  events,
}: {
  events: readonly ListingEventView[];
}) {
  return (
    <section className="grid gap-3" aria-label="History">
      <h3 className="text-base font-semibold">History</h3>
      <ol className="grid divide-y border-t">
        {events.map((event) => (
          <li key={event.id} className="grid gap-0.5 py-3">
            <p className="text-sm font-medium">
              {EVENT_LABELS[event.kind]}
              {event.versionNo !== null ? ` (version ${event.versionNo})` : ""}
            </p>
            <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {dateTime.format(event.at)} by {event.by}
              {event.reason ? ` · ${event.reason}` : ""}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
