import { describe, expect, it } from "vitest";
import type { WorkItem } from "@/core/actions/application/work-items";
import type { ComplianceAttentionItem } from "@/core/compliance/application/compliance-attention";
import {
  buildDay,
  complianceBadge,
  groupDay,
  waitingEnquiries,
} from "./your-day-model";

const TODAY = "2026-11-16";

function item(overrides: Partial<WorkItem> & { id: string }): WorkItem {
  return {
    source: "action",
    title: `Job ${overrides.id}`,
    kind: "call",
    dueOn: TODAY,
    overdue: false,
    plannedFor: null,
    assignee: { membershipId: "me", name: "Olivia Hart" },
    createdAt: new Date("2026-11-10T09:00:00Z"),
    branchId: "branch",
    reach: { telephone: null, email: null },
    enquiry: null,
    contact: null,
    property: null,
    applicant: null,
    propertyEnquiryId: null,
    ...overrides,
  };
}

function compliance(
  kind: ComplianceAttentionItem["kind"],
  days: number | null,
  property = "p1",
): ComplianceAttentionItem {
  return {
    propertyId: property,
    property: "15 Lime Tree Road",
    area: "gas_safety",
    kind,
    expiresOn: days === null ? null : "2026-10-21",
    days,
  };
}

const none = { appraisals: [], compliance: [], enquiries: [] };

describe("sorting work into groups", () => {
  it("puts overdue work in Now, most overdue first, and due-today work in Today", () => {
    const jobs = buildDay({
      today: TODAY,
      ...none,
      items: [
        item({ id: "late-2", dueOn: "2026-11-14", overdue: true }),
        item({ id: "late-5", dueOn: "2026-11-11", overdue: true }),
        item({ id: "now" }),
      ],
    });
    const groups = groupDay(jobs);
    expect(groups.now.map((job) => job.key)).toEqual([
      "action-action-late-5",
      "action-action-late-2",
    ]);
    expect(groups.now.every((job) => job.urgent)).toBe(true);
    expect(groups.now[0].badge).toEqual({
      text: "Overdue 5 days",
      variant: "destructive",
    });
    expect(groups.today.map((job) => job.key)).toEqual(["action-action-now"]);
  });

  it("puts the next seven days in This week and the rest in Later", () => {
    const groups = groupDay(
      buildDay({
        today: TODAY,
        ...none,
        items: [
          item({ id: "d8", dueOn: "2026-11-24" }),
          item({ id: "d7", dueOn: "2026-11-23" }),
          item({ id: "d1", dueOn: "2026-11-17" }),
        ],
      }),
    );
    expect(groups.week.map((job) => job.key)).toEqual([
      "action-action-d1",
      "action-action-d7",
    ]);
    expect(groups.later.map((job) => job.key)).toEqual(["action-action-d8"]);
  });

  it("orders Today by the clock first: appraisals and planned work, then the rest", () => {
    const groups = groupDay(
      buildDay({
        today: TODAY,
        items: [
          item({ id: "plain" }),
          item({
            id: "planned",
            plannedFor: new Date("2026-11-16T15:00:00Z"),
          }),
        ],
        appraisals: [
          {
            id: "ap1",
            scheduledAt: new Date("2026-11-16T10:00:00Z"),
            enquiry: { id: "e1", reference: "ENQ-1", name: "Joan Pryce" },
          },
        ],
        compliance: [],
        enquiries: [],
      }),
    );
    expect(groups.today.map((job) => job.key)).toEqual([
      "appraisal-ap1",
      "action-action-planned",
      "action-action-plain",
    ]);
    expect(groups.today[1].badge.variant).toBe("info");
  });

  it("keeps overdue work in Now even when it is planned for today", () => {
    const [job] = buildDay({
      today: TODAY,
      ...none,
      items: [
        item({
          id: "x",
          dueOn: "2026-11-15",
          overdue: true,
          plannedFor: new Date("2026-11-16T15:00:00Z"),
        }),
      ],
    });
    expect(job.group).toBe("now");
  });
});

describe("compliance in the day", () => {
  it("shows critical and expired first, then work, and only the 7 day window this week", () => {
    const groups = groupDay(
      buildDay({
        today: TODAY,
        appraisals: [],
        enquiries: [],
        items: [item({ id: "late", dueOn: "2026-11-15", overdue: true })],
        compliance: [
          compliance("action_required", null, "p3"),
          compliance("expired", -3, "p2"),
          compliance("critical", -26, "p1"),
          compliance("within_7", 5, "p4"),
          compliance("within_30", 20, "p5"),
          compliance("within_60", 50, "p6"),
        ],
      }),
    );
    expect(groups.now.map((job) => job.key)).toEqual([
      "compliance-p1-gas_safety",
      "compliance-p2-gas_safety",
      "action-action-late",
      "compliance-p3-gas_safety",
    ]);
    expect(groups.week.map((job) => job.key)).toEqual([
      "compliance-p4-gas_safety",
    ]);
    expect(groups.later.map((job) => job.key)).toEqual([
      "compliance-p5-gas_safety",
      "compliance-p6-gas_safety",
    ]);
  });

  it("states dates and never says anything is or is not compliant", () => {
    expect(complianceBadge(compliance("critical", -26))).toEqual({
      text: "Critical: expired 21/10/2026",
      variant: "destructive",
    });
    expect(complianceBadge(compliance("within_7", 1))).toEqual({
      text: "Due in 1 day",
      variant: "warning",
    });
    expect(complianceBadge(compliance("within_7", 0)).text).toBe("Due today");
    expect(complianceBadge(compliance("action_required", null)).text).toBe(
      "Action required",
    );
  });
});

describe("waiting property enquiries", () => {
  const now = new Date("2026-11-16T12:00:00Z");
  const row = (
    id: string,
    daysAgo: number,
    assignee: string | null,
    stage = "new",
  ) => ({
    id,
    stage,
    stageChangedAt: new Date(now.getTime() - daysAgo * 86_400_000),
    applicant: { id: `a-${id}`, name: `Applicant ${id}` },
    property: { address: "6 Albert Mews" },
    assignee: assignee ? { membershipId: assignee, name: assignee } : null,
  });

  it("keeps new enquiries that are mine or unassigned, longest waiting first", () => {
    const list = waitingEnquiries(
      [
        row("a", 1, "me"),
        row("b", 9, null),
        row("c", 3, "someone-else"),
        row("d", 2, "me", "contacted"),
      ],
      "me",
      now,
    );
    expect(list.map((entry) => [entry.id, entry.days])).toEqual([
      ["b", 9],
      ["a", 1],
    ]);
  });

  it("moves a week-old enquiry up to Now and leaves a fresh one in Today", () => {
    const groups = groupDay(
      buildDay({
        today: TODAY,
        items: [],
        appraisals: [],
        compliance: [],
        enquiries: waitingEnquiries(
          [row("old", 8, "me"), row("new", 0, "me")],
          "me",
          now,
        ),
      }),
    );
    expect(groups.now.map((job) => job.key)).toEqual(["enquiry-old"]);
    expect(groups.now[0].badge).toEqual({
      text: "Waiting 8 days",
      variant: "destructive",
    });
    expect(groups.today.map((job) => job.key)).toEqual(["enquiry-new"]);
    expect(groups.today[0].badge.text).toBe("New today");
  });

  it("limits the list", () => {
    const many = Array.from({ length: 15 }, (_, index) =>
      row(`e${index}`, index, null),
    );
    expect(waitingEnquiries(many, "me", now)).toHaveLength(10);
    expect(waitingEnquiries(many, "me", now, 3)).toHaveLength(3);
  });
});

describe("an empty day", () => {
  it("has no jobs", () => {
    expect(buildDay({ today: TODAY, items: [], ...none })).toEqual([]);
  });
});
