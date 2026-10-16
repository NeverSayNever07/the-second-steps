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
import { createEnquiry } from "@/core/enquiries/application/enquiries";
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
