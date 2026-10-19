import "server-only";

import { withVerifiedIdentity } from "@/core/access/data/database-context";
import { hasPermission } from "@/core/access/domain/role";
import { resolveContactActor } from "@/core/contacts/application/contact-actor";
import {
  ActionStatus,
  AppraisalStatus,
  EnquiryStage,
  EnquiryTaskStatus,
} from "@/core/db/generated/enums";
import type { EnquiryActorInput } from "@/core/enquiries/application/enquiry-shared";
import { parseDateOnly, ukToday } from "@/core/enquiries/domain/enquiry";
import { STALE_AFTER_DAYS } from "./dashboard-summary";

const OPEN_STAGES = [
  EnquiryStage.NEW_ENQUIRY,
  EnquiryStage.APPRAISAL_BOOKED,
  EnquiryStage.APPRAISAL_COMPLETED,
];

export type WorkloadCounts = {
  openLeads: number;
  waitingLeads: number;
  leadsWithoutNextAction: number;
  overdueActions: number;
};

export type TeamWorkload = {
  /** Keyed by membership id; leads with nobody looking after them are in `unassigned`. */
  byMembership: Record<string, WorkloadCounts>;
  unassigned: WorkloadCounts;
};

const empty = (): WorkloadCounts => ({
  openLeads: 0,
  waitingLeads: 0,
  leadsWithoutNextAction: 0,
  overdueActions: 0,
});

/**
 * Open and stale leads, leads with no next action and overdue actions for each
 * colleague, limited to the records the signed-in user can see. Only roles that
 * work landlord leads may ask; others get null.
 */
export async function getTeamWorkload(
  input: EnquiryActorInput & { now?: Date },
): Promise<TeamWorkload | null> {
  const now = input.now ?? new Date();
  const today = parseDateOnly(ukToday(now))!;
  const staleBefore = new Date(now.getTime() - STALE_AFTER_DAYS * 86_400_000);
  return withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (
        !actor ||
        !hasPermission(actor.roles, "enquiry.read") ||
        !hasPermission(actor.roles, "enquiry.update")
      ) {
        return null;
      }
      const open = {
        workspaceId: actor.workspaceId,
        stage: { in: OPEN_STAGES },
      };
      const [leads, waiting, noNext, overdueTasks, overdueActions] =
        await Promise.all([
          transaction.enquiry.groupBy({
            by: ["leadMembershipId"],
            where: open,
            _count: { _all: true },
          }),
          transaction.enquiry.groupBy({
            by: ["leadMembershipId"],
            where: { ...open, stageChangedAt: { lte: staleBefore } },
            _count: { _all: true },
          }),
          transaction.enquiry.groupBy({
            by: ["leadMembershipId"],
            where: {
              ...open,
              tasks: { none: { status: EnquiryTaskStatus.OPEN } },
              // A scheduled appraisal is itself the lead's next step.
              appraisals: { none: { status: AppraisalStatus.SCHEDULED } },
            },
            _count: { _all: true },
          }),
          transaction.enquiryTask.groupBy({
            by: ["assignedMembershipId"],
            where: {
              workspaceId: actor.workspaceId,
              status: EnquiryTaskStatus.OPEN,
              dueOn: { lt: today },
            },
            _count: { _all: true },
          }),
          hasPermission(actor.roles, "action.read")
            ? transaction.action.groupBy({
                by: ["assignedMembershipId"],
                where: {
                  workspaceId: actor.workspaceId,
                  status: ActionStatus.OPEN,
                  dueOn: { lt: today },
                },
                _count: { _all: true },
              })
            : [],
        ]);

      const result: TeamWorkload = { byMembership: {}, unassigned: empty() };
      const counts = (membershipId: string | null) =>
        membershipId
          ? (result.byMembership[membershipId] ??= empty())
          : result.unassigned;
      for (const row of leads) {
        counts(row.leadMembershipId).openLeads += row._count._all;
      }
      for (const row of waiting) {
        counts(row.leadMembershipId).waitingLeads += row._count._all;
      }
      for (const row of noNext) {
        counts(row.leadMembershipId).leadsWithoutNextAction += row._count._all;
      }
      for (const row of [...overdueTasks, ...overdueActions]) {
        counts(row.assignedMembershipId).overdueActions += row._count._all;
      }
      return result;
    },
  );
}
