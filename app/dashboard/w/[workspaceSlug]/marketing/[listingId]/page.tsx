import {
  ArrowLeft,
  Building2,
  Eye,
  Handshake,
  Megaphone,
  PoundSterling,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ConfirmStageButton,
  ReturnToDraftButton,
  WithdrawListingButton,
} from "@/components/listings/listing-actions";
import {
  ListingContentForm,
  type ListingFormValues,
} from "@/components/listings/listing-content-form";
import {
  ListingMediaManager,
  type ListingMediaItem,
} from "@/components/listings/listing-media-manager";
import {
  ListingStateBadge,
  NotPublishedNote,
} from "@/components/listings/listing-state-badge";
import {
  Checklist,
  DriftPanel,
  EpcPositionView,
  ListingHistory,
  SourcedFacts,
  Warnings,
} from "@/components/listings/listing-views";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  currentTab,
  RecordTabs,
  type RecordTab,
} from "@/components/ui/record-tabs";
import { requireMfaUserWith } from "@/core/auth/mfa";
import { getListing } from "@/core/listings/application/listings";
import { isChecklistMet } from "@/core/listings/domain/listing-readiness";
import { formatRent } from "@/core/instructions/domain/instruction-labels";
import { isUuid } from "@/core/properties/domain/ids";
import {
  confirmContentReadyAction,
  confirmReadyToAdvertiseAction,
  moveListingMediaAction,
  removeListingMediaAction,
  returnListingToDraftAction,
  saveListingDraftAction,
  setListingMediaCaptionAction,
  withdrawListingAction,
} from "../actions";

const TABS: RecordTab[] = [
  { id: "content", label: "Content" },
  { id: "media", label: "Media" },
  { id: "readiness", label: "Readiness" },
  { id: "history", label: "History" },
];

export default async function ListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string; listingId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { workspaceSlug, listingId } = await params;
  if (!isUuid(listingId)) notFound();
  const base = `/dashboard/w/${workspaceSlug}`;
  const path = `${base}/marketing/${listingId}`;
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
  const listing = result.listing;
  const tab = currentTab(TABS, (await searchParams).tab);
  const state = listing.state;
  const isWithdrawn = state === "withdrawn";
  const canEdit = listing.can.prepare && !isWithdrawn;
  const current = listing.current;

  const values: ListingFormValues = {
    headline: current.headline,
    summary: current.summary,
    description: current.description,
    highlights: current.highlights,
    availableFrom: current.availableFrom
      ? current.availableFrom.toISOString().slice(0, 10)
      : "",
    availabilityNote: current.availabilityNote,
    depositNote: current.depositNote,
    materialInformation: current.materialInformation,
    materialInformationNotApplicable: current.materialInformationNotApplicable,
    notApplicable: current.notApplicable,
  };
  const contentMet = isChecklistMet(listing.contentChecklist);
  const advertiseMet = isChecklistMet(listing.advertiseChecklist);
  const canChangeMedia =
    listing.can.prepare && (state === "draft" || state === "content_ready");
  const mediaItems: ListingMediaItem[] = listing.media.map((item) => ({
    ...item,
    captionAction: setListingMediaCaptionAction.bind(
      null,
      workspaceSlug,
      listingId,
      item.id,
    ),
    removeAction: removeListingMediaAction.bind(
      null,
      workspaceSlug,
      listingId,
      item.id,
    ),
  }));
  const lockedNote = isWithdrawn
    ? "This listing was withdrawn, so its media is kept as it was."
    : state === "ready_to_advertise"
      ? "Return the listing to Draft before changing its photos and floorplans."
      : !listing.can.prepare
        ? "You can view the media but not change it."
        : null;

  return (
    <div className="grid gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit"
        render={<Link href={`${base}/marketing`} />}
        nativeButton={false}
      >
        <ArrowLeft aria-hidden="true" />
        Back to marketing
      </Button>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <header className="grid content-start gap-6">
          <div className="flex items-center gap-4 lg:flex-col lg:items-start">
            <span
              aria-hidden="true"
              className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-accent text-primary"
            >
              <Megaphone className="size-6" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">
                {listing.property.address}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Listing for {listing.instruction.reference}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <ListingStateBadge state={state} />
                <Badge variant="outline">Version {current.versionNo}</Badge>
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            render={<Link href={`${path}/preview`} />}
            nativeButton={false}
          >
            <Eye aria-hidden="true" />
            Staff preview
          </Button>
          <dl className="grid gap-5 border-t pt-6">
            <Detail
              label="Property"
              icon={Building2}
              value={`${listing.property.address} (${listing.property.reference})`}
              href={`${base}/properties/${listing.property.id}`}
            />
            <Detail
              label="Instruction"
              icon={Handshake}
              value={listing.instruction.reference}
              href={`${base}/instructions/${listing.instruction.id}`}
            />
            <Detail
              label="Advertised rent"
              icon={PoundSterling}
              value={formatRent({
                askingRentPence: current.rent.advertisedRentPence,
                rentPeriod: current.rent.rentPeriod,
              })}
            />
          </dl>
        </header>

        <div className="grid min-w-0 content-start gap-6 lg:border-l lg:pl-10">
          <NotPublishedNote />
          <RecordTabs tabs={TABS} current={tab} path={path} />

          {tab === "content" && (
            <div className="grid gap-8">
              {isWithdrawn && (
                <p
                  className="rounded-lg bg-muted px-3 py-2 text-sm"
                  role="status"
                >
                  This listing was withdrawn and is kept as history. Prepare a
                  new listing from the instruction if it is needed again.
                </p>
              )}
              <DriftPanel drift={listing.drift} />
              <SourcedFacts listing={listing} />
              <ListingContentForm
                action={saveListingDraftAction.bind(
                  null,
                  workspaceSlug,
                  listingId,
                  current.versionNo,
                )}
                values={values}
                versionNo={current.versionNo}
                canEdit={canEdit}
              />
            </div>
          )}

          {tab === "media" && (
            <ListingMediaManager
              workspaceSlug={workspaceSlug}
              listingId={listingId}
              items={mediaItems}
              canEdit={canChangeMedia}
              lockedNote={lockedNote}
              moveAction={moveListingMediaAction.bind(
                null,
                workspaceSlug,
                listingId,
              )}
            />
          )}

          {tab === "readiness" && (
            <div className="grid gap-8">
              <Checklist
                title="Content ready"
                description="Everything the advert needs before a reviewer confirms it. This does not publish anything."
                items={listing.contentChecklist}
              />
              {state === "draft" && listing.can.review && (
                <div className="grid gap-2">
                  <ConfirmStageButton
                    label="Confirm Content ready"
                    action={confirmContentReadyAction.bind(
                      null,
                      workspaceSlug,
                      listingId,
                      current.versionNo,
                    )}
                    disabled={!contentMet}
                  />
                  <p className="text-xs text-muted-foreground">
                    Confirms version {current.versionNo}. Any later edit takes
                    it back to Draft.
                  </p>
                </div>
              )}
              {state === "content_ready" && (
                <p className="rounded-lg bg-info-soft px-3 py-2 text-sm text-info">
                  Content ready on version {current.versionNo}.
                </p>
              )}
              {state === "ready_to_advertise" && (
                <p className="rounded-lg bg-info-soft px-3 py-2 text-sm text-info">
                  Ready to advertise on version {current.versionNo}. This is
                  internal only: nothing has been sent to any website or portal.
                </p>
              )}
              <EpcPositionView
                epc={listing.epc}
                complianceHref={`${base}/properties/${listing.property.id}?tab=compliance`}
              />
              <Warnings warnings={listing.warnings} />
              <Checklist
                title="Ready to advertise"
                description="The EPC position and at least 5 photos and 1 floorplan. This stage stays inside Zayto: nothing is published."
                items={listing.advertiseChecklist}
              />
              {state === "content_ready" && listing.can.review && (
                <div className="grid gap-2">
                  <ConfirmStageButton
                    label="Confirm Ready to advertise"
                    action={confirmReadyToAdvertiseAction.bind(
                      null,
                      workspaceSlug,
                      listingId,
                      current.versionNo,
                    )}
                    disabled={!advertiseMet}
                  />
                  <p className="text-xs text-muted-foreground">
                    Internal only. Changing the photos or floorplans afterwards
                    needs the listing returned to Draft first.
                  </p>
                </div>
              )}
              {!isWithdrawn && listing.can.review && (
                <div className="flex flex-wrap items-center gap-2 border-t pt-6">
                  {(state === "content_ready" ||
                    state === "ready_to_advertise") && (
                    <ReturnToDraftButton
                      action={returnListingToDraftAction.bind(
                        null,
                        workspaceSlug,
                        listingId,
                      )}
                    />
                  )}
                  <WithdrawListingButton
                    action={withdrawListingAction.bind(
                      null,
                      workspaceSlug,
                      listingId,
                    )}
                  />
                </div>
              )}
            </div>
          )}

          {tab === "history" && <ListingHistory events={listing.events} />}
        </div>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  icon: Icon,
  href,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  href?: string;
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
          {href ? (
            <Link
              className="text-primary underline-offset-4 hover:underline"
              href={href}
            >
              {value}
            </Link>
          ) : (
            value
          )}
        </dd>
      </div>
    </div>
  );
}
