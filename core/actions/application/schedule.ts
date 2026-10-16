import "server-only";

import { withVerifiedIdentity } from "@/core/access/data/database-context";
import { hasPermission } from "@/core/access/domain/role";
import { resolveContactActor } from "@/core/contacts/application/contact-actor";
import { AppraisalStatus } from "@/core/db/generated/enums";
import type { EnquiryActorInput } from "@/core/enquiries/application/enquiry-shared";
import { ukDayBounds, ukToday } from "@/core/enquiries/domain/enquiry";
import { listWorkItems, type WorkItem } from "./work-items";

export type TodaysSchedule = {
  today: string;
  /** The signed-in user's scheduled appraisals today: fixed in the day. */
  appraisals: {
    id: string;
    scheduledAt: Date;
    enquiry: { id: string; reference: string; name: string };
  }[];
  /** The user's open actions planned for a time today. */
  planned: WorkItem[];
  /** Open actions with no planned time, in due order (most overdue first). */
  unplanned: WorkItem[];
};

/**
 * The user's day: appraisals fixed in place, actions they have planned into
 * an hour, and the rest still waiting to be planned.
 */
export async function getTodaysSchedule(
  input: EnquiryActorInput & { now?: Date },
): Promise<TodaysSchedule> {
  const now = input.now ?? new Date();
  const { start, end } = ukDayBounds(now);
  const [items, appraisals] = await Promise.all([
    listWorkItems({ ...input, now }),
    withVerifiedIdentity(input.authSubject, async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor || !hasPermission(actor.roles, "enquiry.read")) return [];
      const rows = await transaction.appraisal.findMany({
        where: {
          workspaceId: actor.workspaceId,
          assignedMembershipId: actor.membershipId,
          status: AppraisalStatus.SCHEDULED,
          scheduledAt: { gte: start, lt: end },
        },
        select: {
          id: true,
          scheduledAt: true,
          enquiry: {
            select: { id: true, reference: true, enquirerName: true },
          },
        },
        orderBy: { scheduledAt: "asc" },
        take: 50,
      });
      return rows.map((row) => ({
        id: row.id,
        scheduledAt: row.scheduledAt,
        enquiry: {
          id: row.enquiry.id,
          reference: row.enquiry.reference,
          name: row.enquiry.enquirerName,
        },
      }));
    }),
  ]);
  const isToday = (item: WorkItem) =>
    item.plannedFor !== null &&
    item.plannedFor >= start &&
    item.plannedFor < end;
  return {
    today: ukToday(now),
    appraisals: appraisals ?? [],
    planned: items
      .filter(isToday)
      .sort((a, b) => a.plannedFor!.getTime() - b.plannedFor!.getTime()),
    unplanned: items.filter((item) => item.plannedFor === null),
  };
}
