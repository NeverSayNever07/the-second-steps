import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  addWorkItem,
  cancelWorkItem,
  completeWorkItem,
  handOverWorkItem,
  listWorkItems,
  planWorkItem,
  snoozeWorkItem,
} from "@/core/actions/application/work-items";
import { createContact } from "@/core/contacts/application/contacts";
import { assignEnquiryLead } from "@/core/enquiries/application/enquiry-assign";
import { listEnquirySettings } from "@/core/enquiries/application/enquiry-lists";
import { getTodaysSchedule } from "@/core/actions/application/schedule";
import { getTeamWorkload } from "@/core/actions/application/team-workload";
import {
  ukDayBounds,
  ukInstant,
  ukToday,
} from "@/core/enquiries/domain/enquiry";
import { getDashboardSummary } from "@/core/actions/application/dashboard-summary";
import {
  closeEnquiry,
  createEnquiry,
} from "@/core/enquiries/application/enquiries";
import { db } from "@/core/db/client";

const runtimeUrl = process.env.DATABASE_URL;
const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
if (!runtimeUrl || !adminUrl) {
  throw new Error("Integration tests require isolated database URLs.");
}
for (const value of [runtimeUrl, adminUrl]) {
  const url = new URL(value);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/zayto_test") {
    throw new Error("Refusing to run integration tests outside zayto_test.");
  }
}

const adminPool = new Pool({ connectionString: adminUrl, ssl: false });
const workspaceSlug = "work-item-app";
const ids = {
  workspace: randomUUID(),
  branchA: randomUUID(),
  branchB: randomUUID(),
};

type RoleName =
  | "workspace_owner"
  | "branch_manager"
  | "negotiator"
  | "accounts"
  | "read_only";
const users = {
  owner: { role: "workspace_owner", workspaceScope: true, branches: [] },
  managerA: {
    role: "branch_manager",
    workspaceScope: false,
    branches: ["branchA"],
  },
  negotiatorA: {
    role: "negotiator",
    workspaceScope: false,
    branches: ["branchA"],
  },
  negotiatorA2: {
    role: "negotiator",
    workspaceScope: false,
    branches: ["branchA"],
  },
  negotiatorB: {
    role: "negotiator",
    workspaceScope: false,
    branches: ["branchB"],
  },
  accountsA: { role: "accounts", workspaceScope: false, branches: ["branchA"] },
  readOnlyA: {
    role: "read_only",
    workspaceScope: false,
    branches: ["branchA"],
  },
} as const satisfies Record<
  string,
  {
    role: RoleName;
    workspaceScope: boolean;
    branches: readonly ("branchA" | "branchB")[];
  }
>;
type UserName = keyof typeof users;
const auth = Object.fromEntries(
  Object.keys(users).map((name) => [name, randomUUID()]),
) as Record<UserName, string>;
const memberships = Object.fromEntries(
  Object.keys(users).map((name) => [name, randomUUID()]),
) as Record<UserName, string>;

async function addUser(client: PoolClient, name: UserName) {
  const identityId = randomUUID();
  await client.query(
    `INSERT INTO "user_identities" ("id", "first_name", "updated_at")
     VALUES ($1::uuid, $2, CURRENT_TIMESTAMP)`,
    [identityId, name],
  );
  await client.query(
    `INSERT INTO "authentication_provider_links"
      ("user_identity_id", "provider", "provider_subject")
     VALUES ($1::uuid, 'supabase', $2::uuid)`,
    [identityId, auth[name]],
  );
  await client.query(
    `INSERT INTO "memberships"
      ("id", "workspace_id", "user_identity_id", "scope_mode", "updated_at")
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::membership_scope_mode, CURRENT_TIMESTAMP)`,
    [
      memberships[name],
      ids.workspace,
      identityId,
      users[name].workspaceScope ? "workspace" : "named_branches",
    ],
  );
  await client.query(
    `INSERT INTO "membership_roles"
      ("workspace_id", "membership_id", "role_code")
     VALUES ($1::uuid, $2::uuid, $3::membership_role_code)`,
    [ids.workspace, memberships[name], users[name].role],
  );
  for (const branch of users[name].branches) {
    await client.query(
      `INSERT INTO "membership_branch_access"
        ("workspace_id", "membership_id", "branch_id")
       VALUES ($1::uuid, $2::uuid, $3::uuid)`,
      [ids.workspace, memberships[name], ids[branch]],
    );
  }
}

async function seed() {
  const client = await adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `TRUNCATE TABLE "audit_events", "workspace_feature_flag_overrides",
        "membership_branch_access", "membership_roles", "memberships",
        "branches", "platform_role_assignments",
        "authentication_provider_links", "workspaces", "user_identities"
       CASCADE`,
    );
    await client.query(
      `INSERT INTO "workspaces"
        ("id", "slug", "display_name", "type", "updated_at")
       VALUES ($1::uuid, $2, 'Work Item App', 'agency', CURRENT_TIMESTAMP)`,
      [ids.workspace, workspaceSlug],
    );
    await client.query(
      `INSERT INTO "branches" ("id", "workspace_id", "name", "updated_at")
       VALUES
        ($1::uuid, $3::uuid, 'Branch A', CURRENT_TIMESTAMP),
        ($2::uuid, $3::uuid, 'Branch B', CURRENT_TIMESTAMP)`,
      [ids.branchA, ids.branchB, ids.workspace],
    );
    for (const name of Object.keys(users) as UserName[]) {
      await addUser(client, name);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

const as = (name: UserName) => ({
  authSubject: auth[name],
  workspaceSlug,
});
async function count(sql: string, params: unknown[] = []) {
  const result = await adminPool.query<{ n: string }>(sql, params);
  return Number(result.rows[0].n);
}

const day = (offset: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

async function addAction(
  by: UserName = "negotiatorA",
  extra: Record<string, unknown> = {},
) {
  const result = await addWorkItem({
    ...as(by),
    title: "Ring the council",
    dueOn: day(0),
    assignedMembershipId: memberships[by],
    branchId: ids.branchA,
    ...extra,
  });
  if (!result.ok) throw new Error(`Action setup failed: ${result.error}`);
  return { source: result.source, id: result.id };
}

async function addLeadWithTask() {
  const lead = await createEnquiry({
    ...as("negotiatorA"),
    branchId: ids.branchA,
    enquirer: {
      name: "Olivia Landlord",
      email: "olivia@example.com",
      telephone: "07700 900123",
      addressBuilding: "Flat 2",
      addressStreet: "10 High Street",
      postcode: "SW1A 1AA",
      summary: "Full management",
    },
    leadMembershipId: memberships.negotiatorA,
    firstTask: {
      title: "Call landlord",
      dueOn: day(-2),
      assignedMembershipId: memberships.negotiatorA,
    },
  });
  if (!lead.ok) throw new Error(`Lead setup failed: ${lead.error}`);
  const task = await adminPool.query<{ id: string }>(
    `SELECT "id" FROM "enquiry_tasks" WHERE "enquiry_id" = $1::uuid`,
    [lead.enquiryId],
  );
  return {
    enquiryId: lead.enquiryId,
    item: { source: "lead_task" as const, id: task.rows[0].id },
  };
}

beforeEach(seed);
afterAll(async () => {
  await db.$disconnect();
  await adminPool.end();
});

describe("work items", () => {
  it("lists lead next actions and general actions together, most overdue first", async () => {
    const lead = await addLeadWithTask();
    const today = await addAction("negotiatorA", { title: "Ring council" });
    await addAction("negotiatorA", {
      title: "Chase quote",
      dueOn: day(-5),
      kind: "chase",
    });
    await addAction("negotiatorA2", { title: "Not mine" });

    const mine = await listWorkItems(as("negotiatorA"));
    expect(mine.map(({ title }) => title)).toEqual([
      "Chase quote",
      "Call landlord",
      "Ring council",
    ]);
    expect(mine[0]).toMatchObject({
      source: "action",
      kind: "chase",
      overdue: true,
    });
    expect(mine[1]).toMatchObject({
      source: "lead_task",
      id: lead.item.id,
      kind: null,
      enquiry: { name: "Olivia Landlord" },
    });
    expect(mine[2]).toMatchObject({ id: today.id, overdue: false });

    const visible = await listWorkItems({
      ...as("managerA"),
      scope: "visible",
    });
    expect(visible).toHaveLength(4);
    // Branch B staff cannot see branch A work.
    expect(
      await listWorkItems({ ...as("negotiatorB"), scope: "visible" }),
    ).toEqual([]);
  });

  it("adds general actions only for people who may, in branches they work in", async () => {
    await expect(
      addWorkItem({
        ...as("readOnlyA"),
        title: "x",
        dueOn: day(0),
        assignedMembershipId: memberships.readOnlyA,
        branchId: ids.branchA,
      }),
    ).resolves.toEqual({ ok: false, error: "access_denied" });
    const base = {
      title: "Ring council",
      dueOn: day(0),
      assignedMembershipId: memberships.negotiatorA,
      branchId: ids.branchA as string | null,
    };
    const rejected = [
      { ...base, branchId: ids.branchB },
      { ...base, assignedMembershipId: memberships.negotiatorB },
      { ...base, assignedMembershipId: memberships.readOnlyA },
      { ...base, title: "   " },
      { ...base, dueOn: "2026-02-30" },
      { ...base, branchId: "not-an-id" },
      { ...base, branchId: null },
    ];
    for (const input of rejected) {
      await expect(
        addWorkItem({ ...as("negotiatorA"), ...input }),
      ).resolves.toEqual({ ok: false, error: "invalid_input" });
    }
    expect(await count(`SELECT count(*) AS n FROM "actions"`)).toBe(0);
    await expect(
      addWorkItem({ ...as("negotiatorA"), ...base }),
    ).resolves.toMatchObject({ ok: true, source: "action" });
  });

  it("links an action to a contact the person can see, and no other", async () => {
    const contact = await createContact({
      ...as("managerA"),
      branchId: ids.branchA,
      kind: "person",
      details: {
        title: "",
        firstName: "Olivia",
        middleNames: "",
        lastName: "Landlord",
        preferredName: "",
      },
      communication: {
        preferred: null,
        doNotEmail: false,
        doNotTelephone: false,
        doNotSms: false,
        doNotWhatsApp: false,
        doNotPost: false,
      },
      contactPoints: [],
      addresses: [],
    });
    if (!contact.ok) throw new Error("Contact setup failed.");
    const linked = await addAction("managerA", {
      contactId: contact.contactId,
    });
    const [item] = await listWorkItems(as("managerA"));
    expect(item).toMatchObject({
      id: linked.id,
      contact: { name: "Olivia Landlord" },
    });
    await expect(
      addWorkItem({
        ...as("negotiatorB"),
        title: "x",
        dueOn: day(0),
        assignedMembershipId: memberships.negotiatorB,
        branchId: ids.branchB,
        contactId: contact.contactId,
      }),
    ).resolves.toEqual({ ok: false, error: "contact_not_found" });
  });

  it("finishes an action and sets the next step in one change", async () => {
    const first = await addAction();
    const finished = await completeWorkItem({
      ...as("negotiatorA"),
      item: first,
      next: {
        title: "Send the letter",
        dueOn: day(3),
        assignedMembershipId: memberships.negotiatorA2,
        kind: "send",
      },
    });
    expect(finished).toMatchObject({ ok: true, nextId: expect.any(String) });
    expect(
      await count(
        `SELECT count(*) AS n FROM "actions" WHERE "status" = 'done'`,
      ),
    ).toBe(1);
    expect(await listWorkItems(as("negotiatorA2"))).toMatchObject([
      { title: "Send the letter", kind: "send" },
    ]);

    // A next step that cannot be saved leaves the original open.
    const other = await addAction();
    await expect(
      completeWorkItem({
        ...as("negotiatorA"),
        item: other,
        next: {
          title: "Send the letter",
          dueOn: day(3),
          assignedMembershipId: memberships.negotiatorB,
        },
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    expect(
      await count(
        `SELECT count(*) AS n FROM "actions" WHERE "id" = $1::uuid AND "status" = 'open'`,
        [other.id],
      ),
    ).toBe(1);
    // A finished item cannot be finished again.
    await expect(
      completeWorkItem({ ...as("negotiatorA"), item: first }),
    ).resolves.toEqual({ ok: false, error: "invalid_state" });
  });

  it("finishes a lead next action and keeps the lead supplied with a next one", async () => {
    const lead = await addLeadWithTask();
    await expect(
      completeWorkItem({
        ...as("negotiatorA"),
        item: lead.item,
        next: {
          title: "Book appraisal",
          dueOn: day(2),
          assignedMembershipId: memberships.negotiatorB,
        },
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    expect(
      await count(
        `SELECT count(*) AS n FROM "enquiry_tasks" WHERE "status" = 'open'`,
      ),
    ).toBe(1);

    await expect(
      completeWorkItem({
        ...as("negotiatorA"),
        item: lead.item,
        next: {
          title: "Book appraisal",
          dueOn: day(2),
          assignedMembershipId: memberships.negotiatorA,
        },
      }),
    ).resolves.toMatchObject({ ok: true, source: "lead_task" });
    expect(await listWorkItems(as("negotiatorA"))).toMatchObject([
      { title: "Book appraisal", enquiry: { id: lead.enquiryId } },
    ]);
  });

  it("snoozes to today or later and clears the planned time", async () => {
    const item = await addAction();
    const plannedFor = `${day(0)}T14:00:00Z`;
    await expect(
      planWorkItem({ ...as("negotiatorA"), item, plannedFor }),
    ).resolves.toMatchObject({ ok: true });
    expect((await listWorkItems(as("negotiatorA")))[0].plannedFor).toEqual(
      new Date(plannedFor),
    );
    for (const bad of ["tomorrow", "2026-10-17", "2026-10-17T10:00", ""]) {
      await expect(
        planWorkItem({ ...as("negotiatorA"), item, plannedFor: bad }),
      ).resolves.toEqual({ ok: false, error: "invalid_input" });
    }
    for (const bad of [day(-1), "2026-02-30", "soon"]) {
      await expect(
        snoozeWorkItem({ ...as("negotiatorA"), item, dueOn: bad }),
      ).resolves.toEqual({ ok: false, error: "invalid_input" });
    }
    await expect(
      snoozeWorkItem({ ...as("negotiatorA"), item, dueOn: day(4) }),
    ).resolves.toMatchObject({ ok: true });
    expect(await listWorkItems(as("negotiatorA"))).toMatchObject([
      { dueOn: day(4), plannedFor: null },
    ]);
    await expect(
      planWorkItem({ ...as("negotiatorA"), item, plannedFor: null }),
    ).resolves.toMatchObject({ ok: true });

    const lead = await addLeadWithTask();
    await expect(
      snoozeWorkItem({ ...as("negotiatorA"), item: lead.item, dueOn: day(1) }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("hands work only to colleagues who can do it, and the giver still sees it", async () => {
    const item = await addAction();
    for (const to of [
      memberships.negotiatorB,
      memberships.readOnlyA,
      memberships.negotiatorA,
      "nope",
    ]) {
      await expect(
        handOverWorkItem({
          ...as("negotiatorA"),
          item,
          assignedMembershipId: to,
        }),
      ).resolves.toEqual({ ok: false, error: "invalid_input" });
    }
    await expect(
      handOverWorkItem({
        ...as("negotiatorA"),
        item,
        assignedMembershipId: memberships.accountsA,
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(await listWorkItems(as("accountsA"))).toHaveLength(1);
    expect(await listWorkItems(as("negotiatorA"))).toEqual([]);
    expect(
      await listWorkItems({ ...as("negotiatorA"), scope: "visible" }),
    ).toHaveLength(1);

    // Accounts cannot work landlord leads, so a lead action cannot go to them.
    const lead = await addLeadWithTask();
    await expect(
      handOverWorkItem({
        ...as("negotiatorA"),
        item: lead.item,
        assignedMembershipId: memberships.accountsA,
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    await expect(
      handOverWorkItem({
        ...as("negotiatorA"),
        item: lead.item,
        assignedMembershipId: memberships.negotiatorA2,
      }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("cancels once, hides other branches' work, and records an audit trail", async () => {
    const item = await addAction();
    await expect(
      cancelWorkItem({ ...as("negotiatorB"), item }),
    ).resolves.toEqual({ ok: false, error: "work_item_not_found" });
    await expect(cancelWorkItem({ ...as("readOnlyA"), item })).resolves.toEqual(
      {
        ok: false,
        error: "access_denied",
      },
    );
    await expect(
      cancelWorkItem({ ...as("managerA"), item }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      cancelWorkItem({ ...as("negotiatorA"), item }),
    ).resolves.toEqual({ ok: false, error: "invalid_state" });
    await expect(
      snoozeWorkItem({ ...as("negotiatorA"), item, dueOn: day(2) }),
    ).resolves.toEqual({ ok: false, error: "invalid_state" });
    await expect(
      cancelWorkItem({
        ...as("negotiatorA"),
        item: { source: "action", id: "not-an-id" },
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    expect(
      await count(
        `SELECT count(*) AS n FROM "audit_events" WHERE "action" = 'action.cancel' AND "outcome" = 'succeeded' AND "target_type" = 'action'`,
      ),
    ).toBe(1);
    expect(
      await count(
        `SELECT count(*) AS n FROM "audit_events" WHERE "action" = 'action.cancel' AND "outcome" = 'denied'`,
      ),
    ).toBe(3);
  });
});

describe("dashboard summary", () => {
  async function addLead(options: {
    by?: UserName;
    branchId?: string;
    withTask?: boolean;
    leadPerson?: boolean;
    name?: string;
  }) {
    const result = await createEnquiry({
      ...as(options.by ?? "negotiatorA"),
      branchId: options.branchId ?? ids.branchA,
      enquirer: {
        name: options.name ?? "Olivia Landlord",
        email: "olivia@example.com",
        telephone: "07700 900123",
        addressBuilding: "Flat 2",
        addressStreet: "10 High Street",
        postcode: "SW1A 1AA",
        summary: "Full management",
      },
      leadMembershipId: options.leadPerson ? memberships.negotiatorA : null,
      firstTask: options.withTask
        ? {
            title: "Call landlord",
            dueOn: day(-1),
            assignedMembershipId: memberships.negotiatorA,
          }
        : null,
    });
    if (!result.ok) throw new Error(`Lead setup failed: ${result.error}`);
    return result.enquiryId;
  }

  async function addAppraisal(enquiryId: string, scheduledAt: Date) {
    await adminPool.query(
      `INSERT INTO "appraisals"
        ("workspace_id", "enquiry_id", "scheduled_at", "assigned_membership_id",
         "created_by_membership_id", "updated_at")
       VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $4::uuid, CURRENT_TIMESTAMP)`,
      [ids.workspace, enquiryId, scheduledAt, memberships.negotiatorA],
    );
  }

  it("counts only real leads and flags the ones that need attention", async () => {
    const bare = await addLead({ name: "No next action" });
    const fine = await addLead({
      withTask: true,
      leadPerson: true,
      name: "All in order",
    });
    await adminPool.query(
      `UPDATE "landlord_enquiries" SET "lead_membership_id" = NULL
       WHERE "id" = $1::uuid`,
      [bare],
    );
    await addAction("negotiatorA", { title: "Overdue", dueOn: day(-3) });
    await addAction("negotiatorA", { title: "Not due yet", dueOn: day(2) });

    const summary = await getDashboardSummary(as("negotiatorA"));
    expect(summary?.headline).toMatchObject({
      openLeads: 2,
      newLeadsThisWeek: 2,
      appraisalsToday: 0,
      // One overdue lead next action and one overdue general action.
      overdueActions: 2,
      leadsWithoutNextAction: 1,
      recentLeads: { total: 2, reachedAppraisal: 0 },
    });
    expect(summary?.attention.noNextAction).toMatchObject({
      count: 1,
      items: [{ id: bare, name: "No next action", stage: "new_enquiry" }],
    });
    expect(summary?.attention.noLeadPerson.items.map(({ id }) => id)).toEqual([
      bare,
    ]);
    expect(summary?.attention.waitingInStage.count).toBe(0);
    // Ten days on, both leads have waited a week or more in their stage.
    const later = await getDashboardSummary({
      ...as("negotiatorA"),
      now: new Date(Date.now() + 10 * 86_400_000),
    });
    expect(
      later?.attention.waitingInStage.items.map(({ id }) => id).sort(),
    ).toEqual([bare, fine].sort());
    expect(summary?.pipeline).toEqual([
      { stage: "new_enquiry", count: 2 },
      { stage: "appraisal_booked", count: 0 },
      { stage: "appraisal_completed", count: 0 },
    ]);
  });

  it("counts appraisals this week, today's own appraisals and recent conversion", async () => {
    const lead = await addLead({ withTask: true, leadPerson: true });
    const other = await addLead({ withTask: true, leadPerson: true });
    const soon = new Date(Date.now() + 5 * 60_000);
    await addAppraisal(lead, soon);
    await addAppraisal(other, new Date(Date.now() - 20 * 86_400_000));

    const summary = await getDashboardSummary(as("negotiatorA"));
    // The appraisal 20 days ago is outside this week.
    expect(summary?.headline.appraisalsThisWeek).toBeLessThanOrEqual(1);
    expect(summary?.headline.recentLeads).toEqual({
      total: 2,
      reachedAppraisal: 2,
    });
    expect(
      summary?.todaysAppraisals.every(({ enquiry }) => enquiry.id === lead),
    ).toBe(true);
    // Colleagues do not see each other's day.
    expect(
      (await getDashboardSummary(as("negotiatorA2")))?.todaysAppraisals,
    ).toEqual([]);
  });

  it("shows recent stage changes with who made them", async () => {
    const lead = await addLead({ withTask: true, leadPerson: true });
    const settings = await listEnquirySettings(as("negotiatorA"));
    const reason = settings?.outcomeReasons.find(
      ({ name }) => name === "Went with another agent",
    );
    const closed = await closeEnquiry({
      ...as("negotiatorA"),
      enquiryId: lead,
      outcome: "lost",
      outcomeReasonId: reason?.id,
    });
    if (!closed.ok) throw new Error(`Close failed: ${closed.error}`);
    const summary = await getDashboardSummary(as("negotiatorA"));
    expect(summary?.recentActivity[0]).toMatchObject({
      by: "negotiatorA",
      toStage: "lost",
      enquiry: { id: lead },
    });
    expect(summary?.headline.openLeads).toBe(0);
  });

  it("limits figures to what the person can see and may read", async () => {
    await addLead({ withTask: true, leadPerson: true });
    await addAction("accountsA", { dueOn: day(-1) });

    // Another branch sees none of it.
    const other = await getDashboardSummary(as("negotiatorB"));
    expect(other?.headline).toMatchObject({
      openLeads: 0,
      leadsWithoutNextAction: 0,
      overdueActions: 0,
      recentLeads: { total: 0, reachedAppraisal: 0 },
    });
    expect(other?.recentActivity).toEqual([]);
    // Workspace-wide staff see everything.
    expect((await getDashboardSummary(as("owner")))?.headline.openLeads).toBe(
      1,
    );
    // Every role may read leads in its branches; overdue actions are its own.
    const accounts = await getDashboardSummary(as("accountsA"));
    expect(accounts?.headline).toMatchObject({
      openLeads: 1,
      overdueActions: 1,
    });
    expect(
      (await getDashboardSummary(as("negotiatorA")))?.headline.overdueActions,
    ).toBe(1);
    // Someone with no access to the workspace gets nothing.
    expect(
      await getDashboardSummary({
        authSubject: randomUUID(),
        workspaceSlug,
      }),
    ).toBeNull();
  });
});

describe("assigning a landlord lead", () => {
  async function newLead() {
    const result = await createEnquiry({
      ...as("negotiatorA"),
      branchId: ids.branchA,
      enquirer: {
        name: "Olivia Landlord",
        email: "olivia@example.com",
        telephone: "07700 900123",
        addressBuilding: "Flat 2",
        addressStreet: "10 High Street",
        postcode: "SW1A 1AA",
        summary: "Full management",
      },
      leadMembershipId: memberships.negotiatorA,
      firstTask: null,
    });
    if (!result.ok) throw new Error(`Lead setup failed: ${result.error}`);
    return result.enquiryId;
  }

  it("hands a lead to a colleague who can work it in its branch", async () => {
    const enquiryId = await newLead();
    await expect(
      assignEnquiryLead({
        ...as("managerA"),
        enquiryId,
        membershipId: memberships.negotiatorA2,
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(
      await count(
        `SELECT count(*) AS n FROM "landlord_enquiries" WHERE "id" = $1::uuid AND "lead_membership_id" = $2::uuid`,
        [enquiryId, memberships.negotiatorA2],
      ),
    ).toBe(1);
    expect(
      await count(
        `SELECT count(*) AS n FROM "audit_events" WHERE "action" = 'enquiry.assign' AND "outcome" = 'succeeded'`,
      ),
    ).toBe(1);
  });

  it("refuses people who cannot work it, the same person, and outsiders", async () => {
    const enquiryId = await newLead();
    for (const membershipId of [
      memberships.negotiatorB,
      memberships.accountsA,
      memberships.readOnlyA,
      memberships.negotiatorA,
      "nope",
    ]) {
      await expect(
        assignEnquiryLead({ ...as("managerA"), enquiryId, membershipId }),
      ).resolves.toEqual({ ok: false, error: "invalid_input" });
    }
    await expect(
      assignEnquiryLead({
        ...as("readOnlyA"),
        enquiryId,
        membershipId: memberships.negotiatorA2,
      }),
    ).resolves.toEqual({ ok: false, error: "access_denied" });
    // Another branch cannot even see the lead.
    await expect(
      assignEnquiryLead({
        ...as("negotiatorB"),
        enquiryId,
        membershipId: memberships.negotiatorB,
      }),
    ).resolves.toEqual({ ok: false, error: "enquiry_not_found" });
  });
});

describe("schedule and team workload", () => {
  async function leadFor(by: UserName, branchId: string, withTask: boolean) {
    const result = await createEnquiry({
      ...as(by),
      branchId,
      enquirer: {
        name: "Olivia Landlord",
        email: "olivia@example.com",
        telephone: "07700 900123",
        addressBuilding: "Flat 2",
        addressStreet: "10 High Street",
        postcode: "SW1A 1AA",
        summary: "Full management",
      },
      leadMembershipId: memberships[by],
      firstTask: withTask
        ? {
            title: "Call landlord",
            dueOn: day(-1),
            assignedMembershipId: memberships[by],
          }
        : null,
    });
    if (!result.ok) throw new Error(`Lead setup failed: ${result.error}`);
    return result.enquiryId;
  }

  it("puts appraisals and planned actions in the day and leaves the rest unplanned", async () => {
    const today = ukToday();
    const first = await addAction("negotiatorA", { title: "Morning call" });
    const second = await addAction("negotiatorA", { title: "Afternoon post" });
    await addAction("negotiatorA", {
      title: "Not planned yet",
      dueOn: day(-2),
    });
    const elsewhere = await addAction("negotiatorA", {
      title: "Planned later",
    });
    const stale = await addAction("negotiatorA", {
      title: "Planned yesterday",
      dueOn: day(-1),
    });
    const at = (hour: number) => ukInstant(today, hour).toISOString();
    for (const [item, hour] of [
      [second, 15],
      [first, 9],
    ] as const) {
      await expect(
        planWorkItem({ ...as("negotiatorA"), item, plannedFor: at(hour) }),
      ).resolves.toMatchObject({ ok: true });
    }
    // Planned on another day: neither in today's plan nor waiting to be planned.
    await expect(
      planWorkItem({
        ...as("negotiatorA"),
        item: elsewhere,
        plannedFor: ukInstant(day(3), 10).toISOString(),
      }),
    ).resolves.toMatchObject({ ok: true });
    // Planned for a day that has gone: waiting to be planned again.
    await expect(
      planWorkItem({
        ...as("negotiatorA"),
        item: stale,
        plannedFor: ukInstant(day(-1), 10).toISOString(),
      }),
    ).resolves.toMatchObject({ ok: true });

    const lead = await leadFor("negotiatorA", ids.branchA, true);
    await adminPool.query(
      `INSERT INTO "appraisals"
        ("workspace_id", "enquiry_id", "scheduled_at", "assigned_membership_id",
         "created_by_membership_id", "updated_at")
       VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $4::uuid, CURRENT_TIMESTAMP)`,
      [
        ids.workspace,
        lead,
        new Date(ukDayBounds().start.getTime() + 12 * 3_600_000),
        memberships.negotiatorA,
      ],
    );

    const schedule = await getTodaysSchedule(as("negotiatorA"));
    expect(schedule.planned.map(({ title }) => title)).toEqual([
      "Morning call",
      "Afternoon post",
    ]);
    expect(schedule.appraisals).toMatchObject([{ enquiry: { id: lead } }]);
    expect(schedule.unplanned.map(({ title }) => title)).toEqual([
      "Not planned yet",
      "Planned yesterday",
      "Call landlord",
    ]);
    // A colleague's day is their own.
    const other = await getTodaysSchedule(as("negotiatorA2"));
    expect([other.planned, other.appraisals, other.unplanned]).toEqual([
      [],
      [],
      [],
    ]);
    // Clearing the plan puts it back in the waiting list.
    await planWorkItem({ ...as("negotiatorA"), item: first, plannedFor: null });
    expect(
      (await getTodaysSchedule(as("negotiatorA"))).unplanned.map(
        ({ title }) => title,
      ),
    ).toContain("Morning call");
  });

  it("counts each colleague's leads and overdue work, only for roles that work leads", async () => {
    await leadFor("negotiatorA", ids.branchA, false);
    await leadFor("negotiatorA", ids.branchA, true);
    await leadFor("negotiatorA2", ids.branchA, true);
    await adminPool.query(
      `UPDATE "landlord_enquiries" SET "lead_membership_id" = NULL
       WHERE "id" = (SELECT "id" FROM "landlord_enquiries" ORDER BY "created_at" DESC LIMIT 1)`,
    );
    await addAction("negotiatorA", { dueOn: day(-4) });

    const workload = await getTeamWorkload(as("managerA"));
    expect(workload?.byMembership[memberships.negotiatorA]).toEqual({
      openLeads: 2,
      waitingLeads: 0,
      leadsWithoutNextAction: 1,
      // One lead next action and one general action, both overdue.
      overdueActions: 2,
    });
    // Their lead was unassigned, but the overdue task on it is still theirs.
    expect(workload?.byMembership[memberships.negotiatorA2]).toEqual({
      openLeads: 0,
      waitingLeads: 0,
      leadsWithoutNextAction: 0,
      overdueActions: 1,
    });
    expect(workload?.unassigned).toMatchObject({ openLeads: 1 });
    // Ten days on, every open lead has waited more than a week.
    const later = await getTeamWorkload({
      ...as("managerA"),
      now: new Date(Date.now() + 10 * 86_400_000),
    });
    expect(later?.byMembership[memberships.negotiatorA]?.waitingLeads).toBe(2);
    // Roles that do not work leads, and other branches, see nothing of it.
    expect(await getTeamWorkload(as("accountsA"))).toBeNull();
    expect(await getTeamWorkload(as("readOnlyA"))).toBeNull();
    const otherBranch = await getTeamWorkload(as("negotiatorB"));
    expect(otherBranch?.byMembership).toEqual({});
    expect(otherBranch?.unassigned.openLeads).toBe(0);
  });
});
