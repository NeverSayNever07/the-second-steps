import "server-only";

import { withVerifiedIdentity } from "@/core/access/data/database-context";
import { hasPermission } from "@/core/access/domain/role";
import { resolveContactActor } from "@/core/contacts/application/contact-actor";
import {
  AppraisalStatus,
  EnquiryStage,
  EnquiryTaskStatus,
  ActionStatus,
} from "@/core/db/generated/enums";
import { stageCode } from "@/core/enquiries/application/enquiries";
import {
  staffName,
  type EnquiryActorInput,
} from "@/core/enquiries/application/enquiry-shared";
import {
  OPEN_STAGES,
  parseDateOnly,
  ukDayBounds,
  ukToday,
  type EnquiryStageCode,
} from "@/core/enquiries/domain/enquiry";

/** A lead waits this many days in one stage before it is flagged. */
export const STALE_AFTER_DAYS = 7;
const RECENT_LEAD_DAYS = 30;
const LIST_LIMIT = 10;
const ACTIVITY_LIMIT = 6;

const OPEN_DB_STAGES = [
  EnquiryStage.NEW_ENQUIRY,
  EnquiryStage.APPRAISAL_BOOKED,
  EnquiryStage.APPRAISAL_COMPLETED,
];

export type LeadRef = {
  id: string;
  reference: string;
  name: string;
  stage: EnquiryStageCode;
  /** When it reached its current stage. */
  since: Date;
};

type LeadList = { count: number; items: LeadRef[] };

export type DashboardSummary = {
  today: string;
  headline: {
    openLeads: number;
    /** Leads created since Monday (UK time). */
    newLeadsThisWeek: number;
    appraisalsThisWeek: number;
    /** Scheduled or completed appraisals today, for every colleague. */
    appraisalsToday: number;
    wonThisMonth: number;
    /** Leads created in the last 30 days, and how many have had an appraisal booked. */
    recentLeads: { total: number; reachedAppraisal: number };
    /** The signed-in user's open actions due before today. */
    overdueActions: number;
    leadsWithoutNextAction: number;
  };
  attention: {
    noNextAction: LeadList;
    noLeadPerson: LeadList;
    waitingInStage: LeadList;
  };
  todaysAppraisals: {
    id: string;
    scheduledAt: Date;
    enquiry: { id: string; reference: string; name: string };
  }[];
  /** Open leads per stage, in pipeline order. */
  pipeline: { stage: EnquiryStageCode; count: number }[];
  recentActivity: {
    id: string;
    at: Date;
    by: string;
    toStage: EnquiryStageCode;
    enquiry: { id: string; reference: string; name: string };
  }[];
};

/** UK midnight at the start of a "YYYY-MM-DD" day. */
function ukDayStart(date: string) {
  return ukDayBounds(new Date(`${date}T12:00:00.000Z`)).start;
}

function addDays(date: string, days: number) {
  const moved = new Date(`${date}T12:00:00.000Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

/** Monday to the following Monday, and the start of the month to the next, in UK time. */
function ukPeriods(today: string) {
  const sinceMonday = (new Date(`${today}T12:00:00.000Z`).getUTCDay() + 6) % 7;
  const monday = addDays(today, -sinceMonday);
  const monthStart = `${today.slice(0, 8)}01`;
  const nextMonth = addDays(`${monthStart}`, 32).slice(0, 8) + "01";
  return {
    week: { from: ukDayStart(monday), to: ukDayStart(addDays(monday, 7)) },
    month: { from: ukDayStart(monthStart), to: ukDayStart(nextMonth) },
  };
}

const LEAD_SELECT = {
  id: true,
  reference: true,
  enquirerName: true,
  stage: true,
  stageChangedAt: true,
} as const;

function leadRef(lead: {
  id: string;
  reference: string;
  enquirerName: string;
  stage: EnquiryStage;
  stageChangedAt: Date;
}): LeadRef {
  return {
    id: lead.id,
    reference: lead.reference,
    name: lead.enquirerName,
    stage: stageCode(lead.stage),
    since: lead.stageChangedAt,
  };
}

/**
 * Headline numbers, alerts, today's appraisals, a pipeline snapshot and recent
 * activity, all from real records the signed-in user is allowed to see. Lead
 * figures need permission to read leads; without it they are zero or empty.
 * Returns null when the user has no access to the workspace.
 */
export async function getDashboardSummary(
  input: EnquiryActorInput & { now?: Date },
): Promise<DashboardSummary | null> {
  const now = input.now ?? new Date();
  const today = ukToday(now);
  const todayDate = parseDateOnly(today)!;
  const { start: dayStart, end: dayEnd } = ukDayBounds(now);
  const { week, month } = ukPeriods(today);
  const staleBefore = new Date(now.getTime() - STALE_AFTER_DAYS * 86_400_000);
  const recentSince = new Date(now.getTime() - RECENT_LEAD_DAYS * 86_400_000);

  return withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor) return null;
      const workspaceId = actor.workspaceId;
      const canReadLeads = hasPermission(actor.roles, "enquiry.read");
      const canReadActions = hasPermission(actor.roles, "action.read");

      const open = { workspaceId, stage: { in: OPEN_DB_STAGES } };
      const noNextAction = {
        ...open,
        tasks: { none: { status: EnquiryTaskStatus.OPEN } },
      };
      const noLeadPerson = { ...open, leadMembershipId: null };
      const waiting = { ...open, stageChangedAt: { lte: staleBefore } };
      const leadList = async (where: object): Promise<LeadList> => {
        const [count, items] = await Promise.all([
          transaction.enquiry.count({ where }),
          transaction.enquiry.findMany({
            where,
            select: LEAD_SELECT,
            orderBy: [{ stageChangedAt: "asc" }, { id: "asc" }],
            take: LIST_LIMIT,
          }),
        ]);
        return { count, items: items.map(leadRef) };
      };
      const emptyList: LeadList = { count: 0, items: [] };
      const lead = <T>(run: () => Promise<T>, empty: T) =>
        canReadLeads ? run() : Promise.resolve(empty);

      const [
        openLeads,
        newLeadsThisWeek,
        appraisalsToday,
        appraisalsThisWeek,
        wonThisMonth,
        recentTotal,
        recentReached,
        overdueTasks,
        overdueActions,
        noNext,
        noPerson,
        waitingList,
        appraisals,
        stages,
        history,
      ] = await Promise.all([
        lead(() => transaction.enquiry.count({ where: open }), 0),
        lead(
          () =>
            transaction.enquiry.count({
              where: {
                workspaceId,
                createdAt: { gte: week.from, lt: week.to },
              },
            }),
          0,
        ),
        lead(
          () =>
            transaction.appraisal.count({
              where: {
                workspaceId,
                status: {
                  in: [AppraisalStatus.SCHEDULED, AppraisalStatus.COMPLETED],
                },
                scheduledAt: { gte: dayStart, lt: dayEnd },
              },
            }),
          0,
        ),
        lead(
          () =>
            transaction.appraisal.count({
              where: {
                workspaceId,
                status: {
                  in: [AppraisalStatus.SCHEDULED, AppraisalStatus.COMPLETED],
                },
                scheduledAt: { gte: week.from, lt: week.to },
              },
            }),
          0,
        ),
        lead(
          () =>
            transaction.enquiry.count({
              where: {
                workspaceId,
                stage: EnquiryStage.WON,
                stageChangedAt: { gte: month.from, lt: month.to },
              },
            }),
          0,
        ),
        lead(
          () =>
            transaction.enquiry.count({
              where: { workspaceId, createdAt: { gte: recentSince } },
            }),
          0,
        ),
        lead(
          () =>
            transaction.enquiry.count({
              where: {
                workspaceId,
                createdAt: { gte: recentSince },
                appraisals: { some: {} },
              },
            }),
          0,
        ),
        lead(
          () =>
            transaction.enquiryTask.count({
              where: {
                workspaceId,
                assignedMembershipId: actor.membershipId,
                status: EnquiryTaskStatus.OPEN,
                dueOn: { lt: todayDate },
              },
            }),
          0,
        ),
        canReadActions
          ? transaction.action.count({
              where: {
                workspaceId,
                assignedMembershipId: actor.membershipId,
                status: ActionStatus.OPEN,
                dueOn: { lt: todayDate },
              },
            })
          : 0,
        lead(() => leadList(noNextAction), emptyList),
        lead(() => leadList(noLeadPerson), emptyList),
        lead(() => leadList(waiting), emptyList),
        lead(
          () =>
            transaction.appraisal.findMany({
              where: {
                workspaceId,
                assignedMembershipId: actor.membershipId,
                status: AppraisalStatus.SCHEDULED,
                scheduledAt: { gte: dayStart, lt: dayEnd },
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
            }),
          [],
        ),
        lead(
          () =>
            transaction.enquiry.groupBy({
              by: ["stage"],
              where: open,
              _count: { _all: true },
            }),
          [],
        ),
        lead(
          () =>
            transaction.enquiryStageHistory.findMany({
              where: { workspaceId },
              select: {
                id: true,
                toStage: true,
                createdAt: true,
                enquiry: {
                  select: { id: true, reference: true, enquirerName: true },
                },
                changedByMembership: {
                  select: {
                    userIdentity: {
                      select: {
                        firstName: true,
                        lastName: true,
                        primaryEmail: true,
                      },
                    },
                  },
                },
              },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: ACTIVITY_LIMIT,
            }),
          [],
        ),
      ]);

      const stageCounts = new Map(
        stages.map((row) => [stageCode(row.stage), row._count._all]),
      );
      return {
        today,
        headline: {
          openLeads,
          newLeadsThisWeek,
          appraisalsToday,
          appraisalsThisWeek,
          wonThisMonth,
          recentLeads: { total: recentTotal, reachedAppraisal: recentReached },
          overdueActions: overdueTasks + overdueActions,
          leadsWithoutNextAction: noNext.count,
        },
        attention: {
          noNextAction: noNext,
          noLeadPerson: noPerson,
          waitingInStage: waitingList,
        },
        todaysAppraisals: appraisals.map((appraisal) => ({
          id: appraisal.id,
          scheduledAt: appraisal.scheduledAt,
          enquiry: {
            id: appraisal.enquiry.id,
            reference: appraisal.enquiry.reference,
            name: appraisal.enquiry.enquirerName,
          },
        })),
        pipeline: OPEN_STAGES.map((stage) => ({
          stage,
          count: stageCounts.get(stage) ?? 0,
        })),
        recentActivity: history.map((row) => ({
          id: row.id,
          at: row.createdAt,
          by: staffName(row.changedByMembership.userIdentity),
          toStage: stageCode(row.toStage),
          enquiry: {
            id: row.enquiry.id,
            reference: row.enquiry.reference,
            name: row.enquiry.enquirerName,
          },
        })),
      };
    },
  );
}
