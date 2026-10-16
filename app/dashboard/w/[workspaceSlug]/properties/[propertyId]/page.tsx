import {
  ArrowLeft,
  Bath,
  BedDouble,
  Building2,
  Car,
  GitBranch,
  Home,
  ReceiptText,
  Ruler,
  Sofa,
  StickyNote,
  Trees,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ContactNotes } from "@/components/contacts/contact-notes";
import { ManageOwners } from "@/components/properties/manage-owners";
import { PropertyArchiveControl } from "@/components/properties/property-archive-control";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { requireMfaUserWith } from "@/core/auth/mfa";
import {
  addressLine,
  getProperty,
} from "@/core/properties/application/properties";
import { listPropertyNotes } from "@/core/properties/application/property-notes";
import { isUuid } from "@/core/properties/domain/ids";
import { PROPERTY_FEATURE_GROUPS } from "@/core/properties/domain/property";
import {
  FLOOR_AREA_UNIT_LABELS,
  FURNISHED_STATUS_LABELS,
  PROPERTY_FEATURE_LABELS,
  PROPERTY_TYPE_LABELS,
} from "@/core/properties/domain/property-labels";
import {
  addOwnerAction,
  addPropertyNoteAction,
  changePropertyArchiveAction,
  editPropertyNoteAction,
  endOwnershipAction,
  quickAddOwnerAction,
  searchOwnerContactsAction,
  setLeadOwnerAction,
  voidPropertyNoteAction,
} from "../actions";

const dateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC" });

function formatDate(date: Date | null) {
  return date ? dateFormat.format(date) : null;
}

export default async function PropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string; propertyId: string }>;
  searchParams: Promise<{ error?: string | string[]; voided?: string }>;
}) {
  const { workspaceSlug, propertyId } = await params;
  if (!isUuid(propertyId)) notFound();
  const listPath = `/dashboard/w/${workspaceSlug}/properties`;
  const path = `${listPath}/${propertyId}`;
  const query = await searchParams;
  const showVoided = query.voided === "1";
  const {
    data: [property, context, notes],
  } = await requireMfaUserWith(path, { workspaceSlug }, (user) =>
    Promise.all([
      getProperty({ authSubject: user.id, workspaceSlug, propertyId }),
      getWorkspaceAccessContext(user.id, workspaceSlug),
      listPropertyNotes({
        authSubject: user.id,
        workspaceSlug,
        propertyId,
        includeVoided: showVoided,
      }),
    ]),
  );
  if (!context || !context.permissions.has("property.read")) {
    redirect("/access-denied");
  }
  if (!property) notFound();

  const details = property.details;
  const currentOwners = property.ownerships.filter(({ endedAt }) => !endedAt);
  const formerOwners = property.ownerships.filter(({ endedAt }) => endedAt);
  const lead = currentOwners.find(({ isLead }) => isLead);
  const contactsPath = `/dashboard/w/${workspaceSlug}/contacts`;
  const selectedFeatures = new Set<string>(details.features);
  const floorArea =
    details.floorArea !== null && details.floorAreaUnit
      ? `${details.floorArea.toLocaleString("en-GB")} ${FLOOR_AREA_UNIT_LABELS[details.floorAreaUnit]}`
      : null;
  const fullAddress = [
    details.addressBuilding,
    details.addressStreet,
    details.addressLocality,
    details.townCity,
    details.county,
    details.postcode,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="grid gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit"
        render={<Link href={listPath} />}
        nativeButton={false}
      >
        <ArrowLeft aria-hidden="true" />
        Back to properties
      </Button>
      {query.error === "archive" && (
        <div
          className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          The property status could not be changed. Check your access and try
          again.
        </div>
      )}
      {query.error === "has_open_enquiry" && (
        <div
          className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          This property is linked to an open landlord lead, so it cannot be
          archived yet. Close the lead as won, lost or postponed first.
        </div>
      )}
      {/* Phones: identity, working area, details. Large screens: a profile
          column, the working area, and a details rail that use the width. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-8 lg:grid-cols-[18rem_minmax(0,1fr)] 2xl:grid-cols-[20rem_minmax(0,1fr)_22rem]">
        <header className="grid content-start gap-6 lg:col-start-1 lg:row-start-1">
          <div className="flex items-center gap-4 lg:flex-col lg:items-start">
            <span
              aria-hidden="true"
              className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-accent text-primary"
            >
              <Building2 className="size-6" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">
                {addressLine(details)}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {details.postcode}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  {PROPERTY_TYPE_LABELS[details.propertyType]}
                </Badge>
                {property.archived && (
                  <StatusBadge label="Archived" tone="inactive" />
                )}
                <span className="text-xs text-muted-foreground">
                  {property.reference}
                </span>
              </div>
            </div>
          </div>
          {(property.can.manageOwners || property.can.archive) && (
            <div className="flex flex-wrap gap-2">
              {property.can.manageOwners && (
                <ManageOwners
                  owners={currentOwners.map((owner) => ({
                    ownershipId: owner.id,
                    contactId: owner.contactId,
                    name: owner.name,
                    kind: owner.contactKind,
                    reference: owner.contactReference,
                    isLead: owner.isLead,
                    since: formatDate(owner.startedOn),
                  }))}
                  propertyBranchId={property.responsibleBranch.id}
                  addOwner={addOwnerAction.bind(
                    null,
                    workspaceSlug,
                    propertyId,
                  )}
                  endOwnership={endOwnershipAction.bind(
                    null,
                    workspaceSlug,
                    propertyId,
                  )}
                  setLead={setLeadOwnerAction.bind(
                    null,
                    workspaceSlug,
                    propertyId,
                  )}
                  quickAdd={quickAddOwnerAction.bind(null, workspaceSlug)}
                  search={searchOwnerContactsAction.bind(null, workspaceSlug)}
                />
              )}
              {property.can.archive && (
                <PropertyArchiveControl
                  action={changePropertyArchiveAction.bind(
                    null,
                    workspaceSlug,
                    propertyId,
                    property.archived,
                  )}
                  archived={property.archived}
                />
              )}
            </div>
          )}
          <dl className="grid gap-5 border-t pt-6">
            <Detail
              label="Lead landlord"
              value={lead?.name}
              icon={UserRound}
              keepCase
            />
            <Detail
              label="Responsible branch"
              value={property.responsibleBranch.name}
              icon={GitBranch}
              keepCase
            />
            <Detail
              label="Bedrooms"
              value={details.bedrooms?.toString()}
              icon={BedDouble}
            />
            <Detail
              label="Furnishing"
              value={
                details.furnishedStatus
                  ? FURNISHED_STATUS_LABELS[details.furnishedStatus]
                  : null
              }
              icon={Sofa}
              keepCase
            />
          </dl>
        </header>

        <div className="grid min-w-0 content-start gap-10 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:border-l lg:pl-10">
          <section className="grid gap-4">
            <h2 className="text-base font-semibold">Owners</h2>
            {currentOwners.length ? (
              <ul className="grid divide-y">
                {currentOwners.map((owner) => (
                  <li
                    key={owner.id}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <UserRound
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`${contactsPath}/${owner.contactId}`}
                          className="text-sm font-medium underline-offset-4 hover:underline"
                        >
                          {owner.name}
                        </Link>
                        {owner.isLead && (
                          <Badge variant="secondary">Lead landlord</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {[
                          owner.contactKind === "person"
                            ? "Person"
                            : "Organisation",
                          owner.contactReference,
                          owner.startedOn &&
                            `Owner since ${formatDate(owner.startedOn)}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No current owners are recorded.
              </p>
            )}
            {formerOwners.length > 0 && (
              <details className="group">
                <summary className="w-fit cursor-pointer text-sm text-primary underline-offset-4 hover:underline">
                  Former owners ({formerOwners.length})
                </summary>
                <ul className="mt-3 grid divide-y border-t">
                  {formerOwners.map((owner) => (
                    <li key={owner.id} className="grid gap-1 py-3">
                      <Link
                        href={`${contactsPath}/${owner.contactId}`}
                        className="text-sm font-medium underline-offset-4 hover:underline"
                      >
                        {owner.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {[
                          owner.startedOn &&
                            `From ${formatDate(owner.startedOn)}`,
                          owner.endedOn
                            ? `Until ${formatDate(owner.endedOn)}`
                            : `Ended ${formatDate(owner.endedAt)}`,
                          owner.endReason,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          {property.transfers.length > 0 && (
            <section className="grid gap-4">
              <h2 className="text-base font-semibold">Branch history</h2>
              <ul className="grid divide-y border-t">
                {property.transfers.map((transfer) => (
                  <li key={transfer.id} className="grid gap-1 py-3">
                    <p className="text-sm font-medium">
                      {transfer.fromBranchName} to {transfer.toBranchName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(transfer.createdAt)} · {transfer.reason}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="grid gap-4">
            <h2 className="text-base font-semibold">Notes</h2>
            <ContactNotes
              shareable={false}
              addAction={addPropertyNoteAction.bind(
                null,
                workspaceSlug,
                propertyId,
              )}
              canAdd={property.can.addNote}
              canSeeVoided={property.can.manageNotes}
              showVoided={showVoided}
              toggleHref={showVoided ? path : `${path}?voided=1`}
              notes={(notes ?? []).map((note) => ({
                id: note.id,
                body: note.body,
                occurredAt: note.occurredAt.toISOString(),
                authorName: note.authorName,
                branchName: property.responsibleBranch.name,
                agencyWide: false,
                edited: note.edited,
                voided: note.voided,
                voidReason: note.voidReason,
                voidedByName: note.voidedByName,
                canManage: note.canManage,
                editAction: note.canManage
                  ? editPropertyNoteAction.bind(
                      null,
                      workspaceSlug,
                      propertyId,
                      note.id,
                    )
                  : null,
                voidAction: note.canManage
                  ? voidPropertyNoteAction.bind(
                      null,
                      workspaceSlug,
                      propertyId,
                      note.id,
                    )
                  : null,
              }))}
            />
          </section>
        </div>

        <section className="grid content-start gap-5 border-t pt-6 lg:col-start-1 lg:row-start-2 2xl:col-start-3 2xl:row-start-1 2xl:border-t-0 2xl:border-l 2xl:pt-0 2xl:pl-10">
          <h2 className="text-base font-semibold">Property details</h2>
          <dl className="grid content-start gap-5">
            <Detail label="Address" value={fullAddress} icon={Home} keepCase />
            <Detail
              label="Bathrooms"
              value={details.bathrooms?.toString()}
              icon={Bath}
            />
            <Detail
              label="Reception rooms"
              value={details.receptionRooms?.toString()}
              icon={Sofa}
            />
            <Detail
              label="Floor area"
              value={floorArea}
              icon={Ruler}
              keepCase
            />
            <Detail
              label="Council tax band"
              value={details.councilTaxBand}
              icon={ReceiptText}
              keepCase
            />
            <Detail
              label="Parking"
              value={details.parkingNotes}
              icon={Car}
              keepCase
            />
            <Detail
              label="Outdoor space"
              value={details.outdoorSpaceNotes}
              icon={Trees}
              keepCase
            />
            <Detail
              label="Internal summary"
              value={details.generalNotes}
              icon={StickyNote}
              keepCase
            />
          </dl>
          <div className="grid gap-4 border-t pt-5">
            <h3 className="text-sm font-semibold">Features</h3>
            {details.features.length ? (
              PROPERTY_FEATURE_GROUPS.map((group) => {
                const chosen = group.features.filter((feature) =>
                  selectedFeatures.has(feature),
                );
                if (!chosen.length) return null;
                return (
                  <div key={group.label} className="grid gap-1">
                    <p className="text-xs text-muted-foreground">
                      {group.label}
                    </p>
                    <p className="text-sm font-medium">
                      {chosen
                        .map((feature) => PROPERTY_FEATURE_LABELS[feature])
                        .join(", ")}
                    </p>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">
                No features recorded.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  icon: Icon,
  keepCase = false,
}: {
  label: string;
  value: string | null | undefined;
  icon?: LucideIcon;
  keepCase?: boolean;
}) {
  return (
    <div className="flex gap-3">
      {Icon && (
        <Icon
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      )}
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd
          className={`mt-0.5 text-sm font-medium [overflow-wrap:anywhere] ${
            keepCase ? "" : "capitalize"
          }`}
        >
          {value || "Not recorded"}
        </dd>
      </div>
    </div>
  );
}
