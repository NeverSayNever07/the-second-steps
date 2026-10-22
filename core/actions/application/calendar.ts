import "server-only";

import { withVerifiedIdentity } from "@/core/access/data/database-context";
import { hasPermission } from "@/core/access/domain/role";
import { hasBranchAccess } from "@/core/access/domain/scope";
import { resolveContactActor } from "@/core/contacts/application/contact-actor";
import {
  ActionStatus,
  AppraisalStatus,
  EnquiryTaskStatus,
} from "@/core/db/generated/enums";
import {
  staffName,
  type EnquiryActorInput,
} from "@/core/enquiries/application/enquiry-shared";
import type { CalendarRange, CalendarScope } from "../domain/calendar";

export type CalendarEntry = {
  source: "appraisal" | "lead_task" | "action";
  id: string;
  startsAt: Date;
  title: string;
  detail: string;
  assignee: { membershipId: string; name: string };
  branchId: string;
  href: string;
  canMove: boolean;
  enquiryId: string | null;
};

export type StaffCalendar = {
  entries: CalendarEntry[];
  branches: { id: string; name: string }[];
  people: { membershipId: string; name: string }[];
  currentMembershipId: string;
};

const IDENTITY_SELECT = {
  firstName: true,
  lastName: true,
  primaryEmail: true,
} as const;

export async function getStaffCalendar(
  input: EnquiryActorInput & {
    range: CalendarRange;
    scope: CalendarScope;
    branchId?: string;
    membershipId?: string;
  },
): Promise<StaffCalendar | null> {
  return withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor) {
        return null;
      }

      const branches = (
        await transaction.branch.findMany({
          where: { workspaceId: actor.workspaceId, status: "ACTIVE" },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      ).filter(({ id }) => hasBranchAccess(actor.scope, id));
      const branchIds = new Set(branches.map(({ id }) => id));
      const selectedBranchId =
        input.branchId && branchIds.has(input.branchId)
          ? input.branchId
          : undefined;

      const visibleMemberships = await transaction.membership.findMany({
        where: { workspaceId: actor.workspaceId, status: "ACTIVE" },
        select: {
          id: true,
          scopeMode: true,
          branchAccess: { select: { branchId: true } },
          userIdentity: { select: IDENTITY_SELECT },
        },
        orderBy: { createdAt: "asc" },
      });
      const people = visibleMemberships.flatMap((membership) => {
        if (!membership.userIdentity) {
          return [];
        }
        const isVisibleInBranch =
          membership.scopeMode === "WORKSPACE" ||
          membership.branchAccess.some(({ branchId }) =>
            branchIds.has(branchId),
          );
        if (!isVisibleInBranch) {
          return [];
        }
        return [
          {
            membershipId: membership.id,
            name: staffName(membership.userIdentity),
          },
        ];
      });
      const visiblePersonIds = new Set(
        people.map(({ membershipId }) => membershipId),
      );
      const selectedMembershipId =
        input.membershipId && visiblePersonIds.has(input.membershipId)
          ? input.membershipId
          : undefined;
      const assignedMembershipId =
        input.scope === "mine" ? actor.membershipId : selectedMembershipId;
      const branchWhere = selectedBranchId
        ? { responsibleBranchId: selectedBranchId }
        : {};
      const assignedWhere = assignedMembershipId
        ? { assignedMembershipId }
        : {};
      const plannedRange = {
        gte: input.range.start,
        lt: input.range.end,
      };

      const [appraisals, tasks, actions] = await Promise.all([
        hasPermission(actor.roles, "enquiry.read")
          ? transaction.appraisal.findMany({
              where: {
                workspaceId: actor.workspaceId,
                status: AppraisalStatus.SCHEDULED,
                scheduledAt: plannedRange,
                ...assignedWhere,
                enquiry: branchWhere,
              },
              select: {
                id: true,
                scheduledAt: true,
                assignedMembershipId: true,
                assignedMembership: {
                  select: { userIdentity: { select: IDENTITY_SELECT } },
                },
                enquiry: {
                  select: {
                    id: true,
                    reference: true,
                    enquirerName: true,
                    responsibleBranchId: true,
                  },
                },
              },
              orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
              take: 500,
            })
          : [],
        hasPermission(actor.roles, "enquiry.read")
          ? transaction.enquiryTask.findMany({
              where: {
                workspaceId: actor.workspaceId,
                status: EnquiryTaskStatus.OPEN,
                plannedFor: plannedRange,
                ...assignedWhere,
                enquiry: branchWhere,
              },
              select: {
                id: true,
                title: true,
                plannedFor: true,
                assignedMembershipId: true,
                assignedMembership: {
                  select: { userIdentity: { select: IDENTITY_SELECT } },
                },
                enquiry: {
                  select: {
                    id: true,
                    reference: true,
                    enquirerName: true,
                    responsibleBranchId: true,
                  },
                },
              },
              orderBy: [{ plannedFor: "asc" }, { id: "asc" }],
              take: 500,
            })
          : [],
        hasPermission(actor.roles, "action.read")
          ? transaction.action.findMany({
              where: {
                workspaceId: actor.workspaceId,
                status: ActionStatus.OPEN,
                plannedFor: plannedRange,
                ...assignedWhere,
                ...branchWhere,
              },
              select: {
                id: true,
                title: true,
                plannedFor: true,
                responsibleBranchId: true,
                assignedMembershipId: true,
                assignedMembership: {
                  select: { userIdentity: { select: IDENTITY_SELECT } },
                },
              },
              orderBy: [{ plannedFor: "asc" }, { id: "asc" }],
              take: 500,
            })
          : [],
      ]);

      const path = `/dashboard/w/${input.workspaceSlug}`;
      const canMoveAppraisals = hasPermission(actor.roles, "enquiry.update");
      const canMoveActions = hasPermission(actor.roles, "action.manage");
      const entries: CalendarEntry[] = [
        ...appraisals.map((appraisal) => ({
          source: "appraisal" as const,
          id: appraisal.id,
          startsAt: appraisal.scheduledAt,
          title: `Appraisal · ${appraisal.enquiry.enquirerName}`,
          detail: appraisal.enquiry.reference,
          assignee: {
            membershipId: appraisal.assignedMembershipId,
            name: staffName(appraisal.assignedMembership.userIdentity),
          },
          branchId: appraisal.enquiry.responsibleBranchId,
          href: `${path}/enquiries/${appraisal.enquiry.id}`,
          canMove: canMoveAppraisals,
          enquiryId: appraisal.enquiry.id,
        })),
        ...tasks.flatMap((task) =>
          task.plannedFor
            ? [
                {
                  source: "lead_task" as const,
                  id: task.id,
                  startsAt: task.plannedFor,
                  title: task.title,
                  detail: `${task.enquiry.enquirerName} · ${task.enquiry.reference}`,
                  assignee: {
                    membershipId: task.assignedMembershipId,
                    name: staffName(task.assignedMembership.userIdentity),
                  },
                  branchId: task.enquiry.responsibleBranchId,
                  href: `${path}/enquiries/${task.enquiry.id}`,
                  canMove: canMoveAppraisals,
                  enquiryId: task.enquiry.id,
                },
              ]
            : [],
        ),
        ...actions.flatMap((action) =>
          action.plannedFor
            ? [
                {
                  source: "action" as const,
                  id: action.id,
                  startsAt: action.plannedFor,
                  title: action.title,
                  detail: "General action",
                  assignee: {
                    membershipId: action.assignedMembershipId,
                    name: staffName(action.assignedMembership.userIdentity),
                  },
                  branchId: action.responsibleBranchId,
                  href: path,
                  canMove: canMoveActions,
                  enquiryId: null,
                },
              ]
            : [],
        ),
      ];
      entries.sort(
        (a, b) =>
          a.startsAt.getTime() - b.startsAt.getTime() ||
          a.id.localeCompare(b.id),
      );

      return {
        entries,
        branches,
        people,
        currentMembershipId: actor.membershipId,
      };
    },
  );
}
