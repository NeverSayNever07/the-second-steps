import {
  dueLabel,
  plannedLabel,
  ukDateOf,
} from "@/components/actions/work-item-format";
import type { TodaysSchedule } from "@/core/actions/application/schedule";
import type { WorkItem } from "@/core/actions/application/work-items";
import type { ComplianceAttentionItem } from "@/core/compliance/application/compliance-attention";
import { daysUntil } from "@/core/compliance/domain/compliance";

// Your day (ADR-039): one ordered list of what needs the signed-in person,
// made by sorting reads the dashboard already makes. This file only sorts and
// labels; every read it is given was already limited to what the person may
// see, and it adds nothing of its own. Zayto draws attention to compliance
// dates staff entered; it never decides what the law requires.

export type DayGroup = "now" | "today" | "week" | "later";

export const DAY_GROUPS: readonly DayGroup[] = [
  "now",
  "today",
  "week",
  "later",
];

export const DAY_GROUP_LABELS: Record<DayGroup, string> = {
  now: "Now",
  today: "Today",
  week: "This week",
  later: "Later",
};

/** Work due within this many days (after today) is "This week". */
export const WEEK_DAYS = 7;
/** A new property enquiry waiting this long moves up to Now. */
export const ENQUIRY_ALERT_DAYS = 7;
const ENQUIRY_WARNING_DAYS = 4;
const MS_PER_DAY = 86_400_000;

export type BadgeVariant = "destructive" | "warning" | "info" | "secondary";

type Base = {
  key: string;
  group: DayGroup;
  /** Shown with a red edge: something is overdue or expired. */
  urgent: boolean;
  /** Order inside the group; lower comes first, then `tie`. */
  rank: number;
  tie: number;
  badge: { text: string; variant: BadgeVariant };
};

export type DayJob = Base &
  (
    | { type: "action"; item: WorkItem }
    | {
        type: "appraisal";
        id: string;
        at: Date;
        enquiry: { id: string; name: string };
      }
    | { type: "compliance"; item: ComplianceAttentionItem }
    | {
        type: "enquiry";
        id: string;
        applicant: { id: string; name: string };
        address: string;
        days: number;
      }
  );

export type WaitingEnquiry = {
  id: string;
  applicant: { id: string; name: string };
  address: string;
  days: number;
};

export type DayInput = {
  today: string;
  items: WorkItem[];
  appraisals: TodaysSchedule["appraisals"];
  compliance: ComplianceAttentionItem[];
  enquiries: WaitingEnquiry[];
};

const dateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC" });
const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour: "2-digit",
  minute: "2-digit",
});

/** What a compliance item says, in words that state dates and nothing more. */
export function complianceBadge(item: ComplianceAttentionItem): {
  text: string;
  variant: "destructive" | "warning";
} {
  const date = item.expiresOn
    ? ` ${dateFormat.format(new Date(`${item.expiresOn}T00:00:00Z`))}`
    : "";
  switch (item.kind) {
    case "critical":
      return { text: `Critical: expired${date}`, variant: "destructive" };
    case "expired":
      return { text: `Expired${date}`, variant: "destructive" };
    case "action_required":
      return { text: "Action required", variant: "destructive" };
    default: {
      const days = item.days ?? 0;
      return {
        text:
          days === 0
            ? "Due today"
            : `Due in ${days} ${days === 1 ? "day" : "days"}`,
        variant: "warning",
      };
    }
  }
}

function actionJob(item: WorkItem, today: string): DayJob {
  const days = daysUntil(item.dueOn, today);
  const plannedToday =
    item.plannedFor !== null && ukDateOf(item.plannedFor) === today;
  const due = dueLabel(item.dueOn, today);
  const base = {
    key: `action-${item.source}-${item.id}`,
    type: "action" as const,
    item,
  };
  if (item.overdue || days < 0) {
    return {
      ...base,
      group: "now",
      urgent: true,
      rank: 2,
      tie: days,
      badge: { text: due.text, variant: "destructive" },
    };
  }
  const badge = item.plannedFor
    ? {
        text: `Planned ${plannedLabel(item.plannedFor, today)}`,
        variant: "info" as const,
      }
    : {
        text: due.text,
        variant:
          due.tone === "today" ? ("warning" as const) : ("secondary" as const),
      };
  if (plannedToday || days === 0) {
    return {
      ...base,
      group: "today",
      urgent: false,
      rank: plannedToday ? 0 : 1,
      tie: plannedToday ? item.plannedFor!.getTime() : item.createdAt.getTime(),
      badge,
    };
  }
  return {
    ...base,
    group: days <= WEEK_DAYS ? "week" : "later",
    urgent: false,
    rank: days <= WEEK_DAYS ? 0 : 1,
    tie: days,
    badge,
  };
}

function complianceJob(item: ComplianceAttentionItem): DayJob {
  const badge = complianceBadge(item);
  const base = {
    key: `compliance-${item.propertyId}-${item.area}`,
    type: "compliance" as const,
    item,
    badge,
    tie: item.days ?? 0,
  };
  switch (item.kind) {
    case "critical":
      return { ...base, group: "now", urgent: true, rank: 0 };
    case "expired":
      return { ...base, group: "now", urgent: true, rank: 1 };
    case "action_required":
      return { ...base, group: "now", urgent: true, rank: 4 };
    case "within_7":
      return { ...base, group: "week", urgent: false, rank: 0 };
    default:
      return { ...base, group: "later", urgent: false, rank: 2 };
  }
}

function enquiryJob(enquiry: WaitingEnquiry): DayJob {
  const alert = enquiry.days >= ENQUIRY_ALERT_DAYS;
  return {
    key: `enquiry-${enquiry.id}`,
    type: "enquiry",
    id: enquiry.id,
    applicant: enquiry.applicant,
    address: enquiry.address,
    days: enquiry.days,
    group: alert ? "now" : "today",
    urgent: alert,
    rank: alert ? 3 : 2,
    tie: -enquiry.days,
    badge: {
      text:
        enquiry.days === 0
          ? "New today"
          : `Waiting ${enquiry.days} ${enquiry.days === 1 ? "day" : "days"}`,
      variant: alert
        ? "destructive"
        : enquiry.days >= ENQUIRY_WARNING_DAYS
          ? "warning"
          : "secondary",
    },
  };
}

/** Every job for the person, in group order, most pressing first. */
export function buildDay(input: DayInput): DayJob[] {
  const jobs: DayJob[] = [
    ...input.items.map((item) => actionJob(item, input.today)),
    ...input.appraisals.map((appraisal): DayJob => ({
      key: `appraisal-${appraisal.id}`,
      type: "appraisal",
      id: appraisal.id,
      at: appraisal.scheduledAt,
      enquiry: { id: appraisal.enquiry.id, name: appraisal.enquiry.name },
      group: "today",
      urgent: false,
      rank: 0,
      tie: appraisal.scheduledAt.getTime(),
      badge: {
        text: `${clock.format(appraisal.scheduledAt)} appraisal`,
        variant: "info",
      },
    })),
    ...input.compliance.map(complianceJob),
    ...input.enquiries.map(enquiryJob),
  ];
  return jobs.sort(
    (a, b) =>
      DAY_GROUPS.indexOf(a.group) - DAY_GROUPS.indexOf(b.group) ||
      a.rank - b.rank ||
      a.tie - b.tie ||
      a.key.localeCompare(b.key),
  );
}

export function groupDay(jobs: DayJob[]): Record<DayGroup, DayJob[]> {
  return {
    now: jobs.filter((job) => job.group === "now"),
    today: jobs.filter((job) => job.group === "today"),
    week: jobs.filter((job) => job.group === "week"),
    later: jobs.filter((job) => job.group === "later"),
  };
}

/**
 * New property enquiries waiting on this person: theirs, or with nobody
 * looking after them yet. Longest waiting first.
 */
export function waitingEnquiries(
  enquiries: {
    id: string;
    stage: string;
    stageChangedAt: Date;
    applicant: { id: string; name: string };
    property: { address: string };
    assignee: { membershipId: string } | null;
  }[],
  membershipId: string,
  now: Date,
  limit = 10,
): WaitingEnquiry[] {
  return enquiries
    .filter(
      (enquiry) =>
        enquiry.stage === "new" &&
        (!enquiry.assignee || enquiry.assignee.membershipId === membershipId),
    )
    .map((enquiry) => ({
      id: enquiry.id,
      applicant: { id: enquiry.applicant.id, name: enquiry.applicant.name },
      address: enquiry.property.address,
      days: Math.max(
        Math.floor(
          (now.getTime() - enquiry.stageChangedAt.getTime()) / MS_PER_DAY,
        ),
        0,
      ),
    }))
    .sort((a, b) => b.days - a.days || a.id.localeCompare(b.id))
    .slice(0, limit);
}
