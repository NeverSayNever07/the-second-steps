import { ArrowLeft, ArrowRight, Eye, Megaphone } from "lucide-react";
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
import {
  FittingApplicants,
  ListingEnquiryList,
} from "@/components/applicants/applicant-views";
import { JourneyBar } from "@/components/records/journey-bar";
import {
  CARD,
  NextStepPanel,
  SectionCard,
} from "@/components/records/record-cards";
import { derivePropertyJourney } from "@/core/properties/domain/property-journey";
import { RecordHeader } from "@/components/records/record-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  currentTab,
  RecordTabs,
  type RecordTab,
} from "@/components/ui/record-tabs";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { matchingApplicantsForListing } from "@/core/applicants/application/applicant-matching";
import { listPropertyEnquiries } from "@/core/applicants/application/property-enquiries";
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
import { registerEnquiryAction } from "../../applicants/actions";

const BASE_TABS: RecordTab[] = [
  { id: "content", label: "Content" },
  { id: "media", label: "Media" },
  { id: "readiness", label: "Readiness" },
];
const HISTORY_TAB: RecordTab = { id: "history", label: "History" };
const ENQUIRIES_TAB: RecordTab = { id: "enquiries", label: "Enquiries" };

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
  const search = await searchParams;
  const {
    data: [result, context, enquiries, fitting],
  } = await requireMfaUserWith(path, { workspaceSlug }, async (user) => {
    const actor = { authSubject: user.id, workspaceSlug };
    const access = await getWorkspaceAccessContext(user.id, workspaceSlug);
    const canSeeApplicants = Boolean(access?.permissions.has("applicant.read"));
    const showEnquiries = canSeeApplicants && search.tab === "enquiries";
    return Promise.all([
      getListing({ ...actor, listingId }),
      Promise.resolve(access),
      showEnquiries
        ? listPropertyEnquiries({ ...actor, listingId, stage: "all" })
        : Promise.resolve(null),
      showEnquiries
        ? matchingApplicantsForListing({ ...actor, listingId })
        : Promise.resolve(null),
    ]);
  });
  if (!result.ok) {
    if (result.error === "access_denied") redirect("/access-denied");
    notFound();
  }
  const listing = result.listing;
  const canSeeApplicants = Boolean(context?.permissions.has("applicant.read"));
  const canRecordEnquiry = Boolean(
    context?.permissions.has("applicant.manage"),
  );
  const TABS = canSeeApplicants
    ? [...BASE_TABS, ENQUIRIES_TAB, HISTORY_TAB]
    : [...BASE_TABS, HISTORY_TAB];
  const tab = currentTab(TABS, search.tab);
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

  // A listing exists only for a Ready to market instruction, so the journey
  // needs nothing more than the listing's own state.
  const journey = derivePropertyJourney({
    leads: null,
    instruction: isWithdrawn
      ? null
      : {
          id: listing.instruction.id,
          journeyStage: "ready_to_market",
          checklist: [],
          checklistComplete: true,
        },
    listing: { id: listingId, state },
    archived: false,
  });
  const linkClass = "text-primary underline-offset-4 hover:underline";
  const nextStep =
    state === "draft"
      ? {
          title: "Finish the advert",
          description: contentMet
            ? "Everything the advert needs is in place. A reviewer can confirm Content ready."
            : "These are needed before a reviewer can confirm Content ready.",
          checklist: listing.contentChecklist,
          label: "Open readiness",
          href: `${path}?tab=readiness`,
        }
      : state === "content_ready"
        ? {
            title: "Check it is Ready to advertise",
            description:
              "Ready to advertise is a stage inside Zayto. Nothing is published.",
            checklist: listing.advertiseChecklist,
            label: "Open readiness",
            href: `${path}?tab=readiness`,
          }
        : state === "ready_to_advertise"
          ? {
              title: "Record enquiries as applicants ask",
              description:
                "The home is Ready to advertise inside Zayto. Nothing has been sent to any website or portal.",
              checklist: [],
              label: "Open enquiries",
              href: canSeeApplicants ? `${path}?tab=enquiries` : null,
            }
          : null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
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
      <RecordHeader
        avatar={<Megaphone className="size-5" />}
        title={listing.property.address}
        subtitle={
          <>
            Listing for{" "}
            <Link
              className={linkClass}
              href={`${base}/instructions/${listing.instruction.id}`}
            >
              {listing.instruction.reference}
            </Link>
            {" · "}
            {formatRent({
              askingRentPence: current.rent.advertisedRentPence,
              rentPeriod: current.rent.rentPeriod,
            })}
            {" · "}
            <Link
              className={linkClass}
              href={`${base}/properties/${listing.property.id}`}
            >
              Property {listing.property.reference}
            </Link>
          </>
        }
        badges={
          <>
            <ListingStateBadge state={state} />
            <Badge variant="outline">Version {current.versionNo}</Badge>
          </>
        }
        actions={
          <Button
            variant="outline"
            render={<Link href={`${path}/preview`} />}
            nativeButton={false}
          >
            <Eye aria-hidden="true" />
            Staff preview
          </Button>
        }
      >
        {!isWithdrawn && <JourneyBar steps={journey.steps} />}
      </RecordHeader>

      <NotPublishedNote />

      {nextStep ? (
        <NextStepPanel
          title={nextStep.title}
          description={nextStep.description}
          // The Readiness tab lists the same items in full just below.
          checklist={
            tab === "readiness"
              ? []
              : nextStep.checklist.map(({ label, met }) => ({ label, met }))
          }
          action={
            nextStep.href &&
            tab !==
              (nextStep.href.endsWith("enquiries")
                ? "enquiries"
                : "readiness") && (
              <Button
                render={<Link href={nextStep.href} />}
                nativeButton={false}
              >
                {nextStep.label}
                <ArrowRight aria-hidden="true" />
              </Button>
            )
          }
        />
      ) : (
        <NextStepPanel
          title="This listing was withdrawn"
          description="It is kept as history. Prepare a new listing from the instruction if it is needed again."
        />
      )}

      <RecordTabs tabs={TABS} current={tab} path={path} />

      {tab === "content" && (
        <div className={`${CARD} grid gap-8 p-4 md:p-5`}>
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
        <div className={`${CARD} p-4 md:p-5`}>
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
        </div>
      )}

      {tab === "readiness" && (
        <div className={`${CARD} grid gap-8 p-4 md:p-5`}>
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
                Confirms version {current.versionNo}. Any later edit takes it
                back to Draft.
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

      {tab === "enquiries" && (
        <>
          <SectionCard title="Enquiries on this home">
            {enquiries ? (
              <ListingEnquiryList enquiries={enquiries.items} base={base} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Enquiries could not be shown.
              </p>
            )}
          </SectionCard>
          <SectionCard title="Applicants whose requirements fit">
            <p className="text-sm text-muted-foreground">
              A filter on what each household asked for, in the order they
              registered. It is not a ranking.
              {fitting?.ok && !fitting.listingReady
                ? " Enquiries can only be recorded once the home is Ready to advertise."
                : ""}
            </p>
            {fitting?.ok ? (
              <FittingApplicants
                items={fitting.items}
                listingReady={fitting.listingReady}
                base={base}
                address={listing.property.address}
                registerFor={
                  canRecordEnquiry
                    ? (applicantId) =>
                        registerEnquiryAction.bind(
                          null,
                          workspaceSlug,
                          applicantId,
                          listingId,
                        )
                    : undefined
                }
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Fitting applicants could not be shown.
              </p>
            )}
          </SectionCard>
        </>
      )}

      {tab === "history" && (
        <div className={`${CARD} p-4 md:p-5`}>
          <ListingHistory events={listing.events} />
        </div>
      )}
    </div>
  );
}
