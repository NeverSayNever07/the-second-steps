import "server-only";

import { withVerifiedIdentity } from "@/core/access/data/database-context";
import { hasPermission } from "@/core/access/domain/role";
import { resolveContactActor } from "@/core/contacts/application/contact-actor";
import { InstructionJourneyStage } from "@/core/db/generated/enums";
import type { EnquiryActorInput } from "@/core/enquiries/application/enquiry-shared";
import { addressLine } from "@/core/properties/application/properties";

/**
 * An onboarding instruction with no recorded change for this many days is
 * flagged. Owner decision 2026-10-20; separate from the landlord-lead period.
 */
export const INSTRUCTION_STALE_AFTER_DAYS = 7;
const STALLED_LIST_LIMIT = 5;

export type StalledInstruction = {
  id: string;
  reference: string;
  property: string;
  /** The latest recorded change to the instruction or its onboarding records. */
  lastChangedAt: Date;
};

export type InstructionAttention = {
  onboarding: number;
  readyToMarket: number;
  stalled: { count: number; items: StalledInstruction[] };
};

const latest = { orderBy: { createdAt: "desc" as const }, take: 1 };

/**
 * Current-instruction totals and the onboarding instructions that have not
 * changed for a while. A change is a stage move, new terms, an agreement or
 * ownership-check entry, a landlord added or removed, or an exception.
 * Returns null when the viewer may not read instructions. Counts only include
 * instructions the viewer's branch access lets them see.
 */
export async function getInstructionAttention(
  input: EnquiryActorInput & { now?: Date },
): Promise<InstructionAttention | null> {
  const now = input.now ?? new Date();
  const staleBefore = new Date(
    now.getTime() - INSTRUCTION_STALE_AFTER_DAYS * 86_400_000,
  );
  return withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor || !hasPermission(actor.roles, "instruction.read")) {
        return null;
      }
      const current = { workspaceId: actor.workspaceId, endedOn: null };
      const stalled = {
        ...current,
        journeyStage: InstructionJourneyStage.ONBOARDING,
        journeyChangedAt: { lte: staleBefore },
        termsVersions: { none: { createdAt: { gt: staleBefore } } },
        agreementEvents: { none: { createdAt: { gt: staleBefore } } },
        ownershipChecks: { none: { createdAt: { gt: staleBefore } } },
        exceptions: { none: { createdAt: { gt: staleBefore } } },
        parties: {
          none: {
            OR: [
              { createdAt: { gt: staleBefore } },
              { removedAt: { gt: staleBefore } },
            ],
          },
        },
      };
      const [onboarding, readyToMarket, stalledCount, stalledRows] =
        await Promise.all([
          transaction.instruction.count({
            where: {
              ...current,
              journeyStage: InstructionJourneyStage.ONBOARDING,
            },
          }),
          transaction.instruction.count({
            where: {
              ...current,
              journeyStage: InstructionJourneyStage.READY_TO_MARKET,
            },
          }),
          transaction.instruction.count({ where: stalled }),
          transaction.instruction.findMany({
            where: stalled,
            select: {
              id: true,
              reference: true,
              journeyChangedAt: true,
              property: {
                select: {
                  addressBuilding: true,
                  addressStreet: true,
                  townCity: true,
                },
              },
              termsVersions: { select: { createdAt: true }, ...latest },
              agreementEvents: { select: { createdAt: true }, ...latest },
              ownershipChecks: { select: { createdAt: true }, ...latest },
              exceptions: { select: { createdAt: true }, ...latest },
              parties: { select: { createdAt: true }, ...latest },
            },
            orderBy: [{ journeyChangedAt: "asc" }, { id: "asc" }],
            take: STALLED_LIST_LIMIT,
          }),
        ]);
      return {
        onboarding,
        readyToMarket,
        stalled: {
          count: stalledCount,
          items: stalledRows
            .map((row): StalledInstruction => {
              const moments = [
                row.journeyChangedAt,
                ...[
                  row.termsVersions,
                  row.agreementEvents,
                  row.ownershipChecks,
                  row.exceptions,
                  row.parties,
                ].flatMap((rows) => rows.map(({ createdAt }) => createdAt)),
              ];
              return {
                id: row.id,
                reference: row.reference,
                property: addressLine(row.property),
                lastChangedAt: new Date(
                  Math.max(...moments.map((moment) => moment.getTime())),
                ),
              };
            })
            .sort(
              (a, b) => a.lastChangedAt.getTime() - b.lastChangedAt.getTime(),
            ),
        },
      };
    },
  );
}
