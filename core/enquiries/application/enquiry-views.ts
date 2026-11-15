import "server-only";

import { withVerifiedIdentity } from "@/core/access/data/database-context";
import { hasPermission } from "@/core/access/domain/role";
import { resolveContactActor } from "@/core/contacts/application/contact-actor";
import type { Prisma } from "@/core/db/generated/client";
import {
  AppraisalStatus,
  EnquiryStage,
  EnquiryTaskStatus,
} from "@/core/db/generated/enums";
import { isUuid } from "@/core/properties/domain/ids";
import { parseDateOnly, ukDayBounds, ukToday } from "../domain/enquiry";
import { ENQUIRY_VIEWS, type EnquiryView } from "../domain/enquiry-views";
import type { EnquiryActorInput } from "./enquiry-shared";

const OPEN_STAGES = [
  EnquiryStage.NEW_ENQUIRY,
  EnquiryStage.APPRAISAL_BOOKED,
  EnquiryStage.APPRAISAL_COMPLETED,
];

/**
 * Each view of the Landlord leads list as a database filter (without the
 * workspace, which the caller adds). The list and the tab counts both use
 * this, so a tab's number is always the number of rows it opens.
 *
 * "Needs action" is an open lead with no next action (a scheduled appraisal
 * counts as one), or whose earliest next action is overdue.
 */
export function enquiryViewWhere(
  view: EnquiryView,
  context: { membershipId: string; now: Date },
): Prisma.EnquiryWhereInput {
  switch (view) {
    case "attention": {
      const today = parseDateOnly(ukToday(context.now))!;
      const { start } = ukDayBounds(context.now);
      return {
        stage: { in: OPEN_STAGES },
        OR: [
          {
            tasks: { none: { status: EnquiryTaskStatus.OPEN } },
            appraisals: { none: { status: AppraisalStatus.SCHEDULED } },
          },
          {
            tasks: {
              some: { status: EnquiryTaskStatus.OPEN, dueOn: { lt: today } },
            },
          },
          {
            appraisals: {
              some: {
                status: AppraisalStatus.SCHEDULED,
                scheduledAt: { lt: start },
              },
            },
          },
        ],
      };
    }
    case "mine":
      return {
        stage: { in: OPEN_STAGES },
        leadMembershipId: context.membershipId,
      };
    case "open":
      return { stage: { in: OPEN_STAGES } };
    case "won":
      return { stage: EnquiryStage.WON };
    case "closed":
      return { stage: { in: [EnquiryStage.LOST, EnquiryStage.POSTPONED] } };
  }
}

/**
 * How many leads each view holds, for the viewer's branches, optionally
 * narrowed to one branch or one colleague. Null when the viewer may not read
 * landlord leads.
 */
export async function getEnquiryViewCounts(
  input: EnquiryActorInput & {
    branchId?: string;
    assignedMembershipId?: string;
    now?: Date;
  },
): Promise<Record<EnquiryView, number> | null> {
  if (
    (input.branchId && !isUuid(input.branchId)) ||
    (input.assignedMembershipId && !isUuid(input.assignedMembershipId))
  ) {
    return Object.fromEntries(ENQUIRY_VIEWS.map((view) => [view, 0])) as Record<
      EnquiryView,
      number
    >;
  }
  const now = input.now ?? new Date();
  return withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor || !hasPermission(actor.roles, "enquiry.read")) return null;
      // One after another: a transaction runs one query at a time.
      const counts = {} as Record<EnquiryView, number>;
      for (const view of ENQUIRY_VIEWS) {
        counts[view] = await transaction.enquiry.count({
          where: {
            workspaceId: actor.workspaceId,
            ...(input.branchId ? { responsibleBranchId: input.branchId } : {}),
            ...(input.assignedMembershipId
              ? { leadMembershipId: input.assignedMembershipId }
              : {}),
            AND: [
              enquiryViewWhere(view, {
                membershipId: actor.membershipId,
                now,
              }),
            ],
          },
        });
      }
      return counts;
    },
  );
}
