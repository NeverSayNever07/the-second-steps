import "server-only";

import { withVerifiedIdentity } from "@/core/access/data/database-context";
import { hasPermission } from "@/core/access/domain/role";
import { resolveContactActor } from "@/core/contacts/application/contact-actor";
import { addressLine } from "@/core/properties/application/properties";
import { isUuid } from "@/core/properties/domain/ids";
import { isListingState, type ListingStateCode } from "../domain/listing";
import type { RentPeriodCode } from "@/core/instructions/domain/instruction";

// The Marketing worklist and a property's listings. Everything is limited to
// what the viewer's branch access lets them see (row-level security).

export type ListingListInput = {
  authSubject: string;
  workspaceSlug: string;
  /** One state, "current" for everything not withdrawn, or "all". */
  state?: ListingStateCode | "current" | "all";
  propertyId?: string;
  take?: number;
};

export type ListingListItem = {
  id: string;
  state: ListingStateCode;
  stateChangedAt: Date;
  property: { id: string; address: string; postcode: string };
  instruction: { id: string; reference: string };
  branch: string;
  headline: string;
  advertisedRentPence: number | null;
  rentPeriod: RentPeriodCode | null;
  versionNo: number;
};

const MAX_TAKE = 100;

export async function listListings(
  input: ListingListInput,
): Promise<ListingListItem[] | null> {
  const state = input.state ?? "current";
  if (state !== "current" && state !== "all" && !isListingState(state)) {
    return [];
  }
  return withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor || !hasPermission(actor.roles, "listing.read")) return null;
      const rows = await transaction.listing.findMany({
        where: {
          workspaceId: actor.workspaceId,
          ...(state === "all"
            ? {}
            : state === "current"
              ? { state: { not: "WITHDRAWN" as const } }
              : { state: state.toUpperCase() as "DRAFT" }),
          ...(isUuid(input.propertyId) ? { propertyId: input.propertyId } : {}),
        },
        orderBy: [{ stateChangedAt: "desc" }, { id: "asc" }],
        take: Math.min(Math.max(input.take ?? 50, 1), MAX_TAKE),
        select: {
          id: true,
          state: true,
          stateChangedAt: true,
          property: {
            select: {
              id: true,
              addressBuilding: true,
              addressStreet: true,
              townCity: true,
              postcode: true,
            },
          },
          instruction: {
            select: {
              id: true,
              reference: true,
              responsibleBranch: { select: { name: true } },
            },
          },
          versions: {
            orderBy: { versionNo: "desc" },
            take: 1,
            select: {
              versionNo: true,
              headline: true,
              advertisedRentPence: true,
              rentPeriod: true,
            },
          },
        },
      });
      return rows.flatMap((row): ListingListItem[] => {
        const version = row.versions[0];
        if (!version) return [];
        return [
          {
            id: row.id,
            state: row.state.toLowerCase() as ListingStateCode,
            stateChangedAt: row.stateChangedAt,
            property: {
              id: row.property.id,
              address: addressLine(row.property),
              postcode: row.property.postcode,
            },
            instruction: {
              id: row.instruction.id,
              reference: row.instruction.reference,
            },
            branch: row.instruction.responsibleBranch.name,
            headline: version.headline,
            advertisedRentPence: version.advertisedRentPence,
            rentPeriod: version.rentPeriod
              ? (version.rentPeriod.toLowerCase() as RentPeriodCode)
              : null,
            versionNo: version.versionNo,
          },
        ];
      });
    },
  );
}
