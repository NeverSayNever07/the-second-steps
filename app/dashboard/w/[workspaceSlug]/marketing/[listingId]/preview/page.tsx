import { ArrowLeft, Bath, BedDouble, Sofa } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ListingStateBadge,
  NotPublishedNote,
} from "@/components/listings/listing-state-badge";
import { Button } from "@/components/ui/button";
import { requireMfaUserWith } from "@/core/auth/mfa";
import { getListing } from "@/core/listings/application/listings";
import {
  DEPOSIT_OFFERING_LABELS,
  formatPence,
  formatRent,
} from "@/core/instructions/domain/instruction-labels";
import { isUuid } from "@/core/properties/domain/ids";
import {
  FURNISHED_STATUS_LABELS,
  PROPERTY_FEATURE_LABELS,
  PROPERTY_TYPE_LABELS,
} from "@/core/properties/domain/property-labels";

const dateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC" });

/**
 * What an applicant would read, built from the saved version. It is a
 * staff-only preview: it never imitates a named portal and never says the
 * property is advertised.
 */
export default async function ListingPreviewPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; listingId: string }>;
}) {
  const { workspaceSlug, listingId } = await params;
  if (!isUuid(listingId)) notFound();
  const base = `/dashboard/w/${workspaceSlug}`;
  const path = `${base}/marketing/${listingId}/preview`;
  const {
    data: [result],
  } = await requireMfaUserWith(path, { workspaceSlug }, (user) =>
    Promise.all([
      getListing({ authSubject: user.id, workspaceSlug, listingId }),
    ]),
  );
  if (!result.ok) {
    if (result.error === "access_denied") redirect("/access-denied");
    notFound();
  }
  const { listing } = result;
  const { current } = listing;
  const facts = current.facts;
  const address = [
    facts.addressBuilding,
    facts.addressStreet,
    facts.addressLocality,
    facts.townCity,
    facts.postcode,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="grid gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit"
        render={<Link href={`${base}/marketing/${listingId}`} />}
        nativeButton={false}
      >
        <ArrowLeft aria-hidden="true" />
        Back to the listing
      </Button>
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ListingStateBadge state={listing.state} />
          <span className="text-sm text-muted-foreground">
            Staff preview of version {current.versionNo}
          </span>
        </div>
        <NotPublishedNote />
      </div>

      <article className="grid max-w-3xl gap-6 rounded-xl bg-card p-6 shadow-xs ring-1 ring-foreground/10">
        <header className="grid gap-2">
          <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">
            {current.headline || "No headline yet"}
          </h1>
          <p className="text-sm text-muted-foreground">{address}</p>
          <p className="text-xl font-semibold">
            {formatRent({
              askingRentPence: current.rent.advertisedRentPence,
              rentPeriod: current.rent.rentPeriod,
            })}
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <li>{PROPERTY_TYPE_LABELS[facts.propertyType]}</li>
            {facts.bedrooms !== null && (
              <li className="flex items-center gap-1">
                <BedDouble className="size-4" aria-hidden="true" />
                {facts.bedrooms} bedrooms
              </li>
            )}
            {facts.bathrooms !== null && (
              <li className="flex items-center gap-1">
                <Bath className="size-4" aria-hidden="true" />
                {facts.bathrooms} bathrooms
              </li>
            )}
            {facts.furnishedStatus && (
              <li className="flex items-center gap-1">
                <Sofa className="size-4" aria-hidden="true" />
                {FURNISHED_STATUS_LABELS[facts.furnishedStatus]}
              </li>
            )}
          </ul>
        </header>

        {current.summary && <p className="text-base">{current.summary}</p>}

        {current.highlights.length > 0 && (
          <section className="grid gap-2">
            <h2 className="text-base font-semibold">Highlights</h2>
            <ul className="grid list-disc gap-1 pl-5 text-sm">
              {current.highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        )}

        {current.description && (
          <section className="grid gap-2">
            <h2 className="text-base font-semibold">Description</h2>
            <p className="text-sm whitespace-pre-line [overflow-wrap:anywhere]">
              {current.description}
            </p>
          </section>
        )}

        <section className="grid gap-2">
          <h2 className="text-base font-semibold">Availability and costs</h2>
          <dl className="grid gap-2 text-sm">
            <div className="flex flex-wrap gap-2">
              <dt className="text-muted-foreground">Available</dt>
              <dd className="font-medium">
                {[
                  current.availableFrom &&
                    `from ${dateFormat.format(current.availableFrom)}`,
                  current.availabilityNote,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Not stated"}
              </dd>
            </div>
            <div className="flex flex-wrap gap-2">
              <dt className="text-muted-foreground">Deposit</dt>
              <dd className="font-medium">
                {current.rent.depositOffering
                  ? `${DEPOSIT_OFFERING_LABELS[current.rent.depositOffering]}${current.rent.depositPence !== null ? `, ${formatPence(current.rent.depositPence)}` : ""}`
                  : "Not stated"}
                {current.depositNote ? ` · ${current.depositNote}` : ""}
              </dd>
            </div>
            {facts.councilTaxBand && (
              <div className="flex flex-wrap gap-2">
                <dt className="text-muted-foreground">Council tax</dt>
                <dd className="font-medium">Band {facts.councilTaxBand}</dd>
              </div>
            )}
            {listing.epc.rating && (
              <div className="flex flex-wrap gap-2">
                <dt className="text-muted-foreground">EPC rating</dt>
                <dd className="font-medium">{listing.epc.rating}</dd>
              </div>
            )}
          </dl>
        </section>

        {facts.features.length > 0 && (
          <section className="grid gap-2">
            <h2 className="text-base font-semibold">Features</h2>
            <p className="text-sm">
              {facts.features
                .map((feature) => PROPERTY_FEATURE_LABELS[feature])
                .join(", ")}
            </p>
          </section>
        )}

        {(current.materialInformation ||
          current.materialInformationNotApplicable) && (
          <section className="grid gap-2">
            <h2 className="text-base font-semibold">Material information</h2>
            <p className="text-sm whitespace-pre-line [overflow-wrap:anywhere]">
              {current.materialInformationNotApplicable
                ? "None to add for this property."
                : current.materialInformation}
            </p>
          </section>
        )}
      </article>
    </div>
  );
}
