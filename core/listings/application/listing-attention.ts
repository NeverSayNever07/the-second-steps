import "server-only";

import { withVerifiedIdentity } from "@/core/access/data/database-context";
import { hasPermission } from "@/core/access/domain/role";
import { resolveContactActor } from "@/core/contacts/application/contact-actor";
import {
  InstructionJourneyStage,
  ListingState,
} from "@/core/db/generated/enums";
import type { EnquiryActorInput } from "@/core/enquiries/application/enquiry-shared";
import { addressLine } from "@/core/properties/application/properties";

const WAITING_LIST_LIMIT = 5;

export type ListingAwaiting = {
  id: string;
  reference: string;
  property: string;
};

export type ListingAttention = {
  draft: number;
  contentReady: number;
  readyToAdvertise: number;
  /** Ready to market instructions with no listing started yet. */
  awaitingListing: { count: number; items: ListingAwaiting[] };
};

/**
 * Where the current listings stand, for the dashboard. Nothing here is
 * published: Ready to advertise is an internal stage. Returns null when the
 * viewer may not read listings. Counts only include what the viewer's branch
 * access lets them see.
 */
export async function getListingAttention(
  input: EnquiryActorInput,
): Promise<ListingAttention | null> {
  return withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor || !hasPermission(actor.roles, "listing.read")) return null;

      const workspaceId = actor.workspaceId;
      const count = (state: ListingState) =>
        transaction.listing.count({ where: { workspaceId, state } });
      const waiting = {
        workspaceId,
        endedOn: null,
        journeyStage: InstructionJourneyStage.READY_TO_MARKET,
        listings: { none: { state: { not: ListingState.WITHDRAWN } } },
      };
      const [draft, contentReady, readyToAdvertise, awaitingCount, awaiting] =
        await Promise.all([
          count(ListingState.DRAFT),
          count(ListingState.CONTENT_READY),
          count(ListingState.READY_TO_ADVERTISE),
          transaction.instruction.count({ where: waiting }),
          transaction.instruction.findMany({
            where: waiting,
            select: {
              id: true,
              reference: true,
              property: {
                select: {
                  addressBuilding: true,
                  addressStreet: true,
                  townCity: true,
                },
              },
            },
            orderBy: [{ journeyChangedAt: "asc" }, { id: "asc" }],
            take: WAITING_LIST_LIMIT,
          }),
        ]);
      return {
        draft,
        contentReady,
        readyToAdvertise,
        awaitingListing: {
          count: awaitingCount,
          items: awaiting.map((row) => ({
            id: row.id,
            reference: row.reference,
            property: addressLine(row.property),
          })),
        },
      };
    },
  );
}
