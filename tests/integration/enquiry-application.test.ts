import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  archiveContact,
  createContact,
} from "@/core/contacts/application/contacts";
import {
  bookAppraisal,
  cancelAppraisal,
  completeAppraisal,
} from "@/core/enquiries/application/appraisals";
import {
  addEnquiryListItem,
  listEnquirySettings,
  updateEnquiryListItem,
} from "@/core/enquiries/application/enquiry-lists";
import {
  closeEnquiry,
  createEnquiry,
  getEnquiry,
  listEnquiryAssignees,
  listEnquiries,
  reopenEnquiry,
  updateEnquiry,
} from "@/core/enquiries/application/enquiries";
import {
  addEnquiryTask,
  completeEnquiryTask,
  getEnquiryNeedsAttention,
} from "@/core/enquiries/application/enquiry-tasks";
import {
  archiveProperty,
  createProperty,
} from "@/core/properties/application/properties";
import type { PropertyDetailsInput } from "@/core/properties/domain/property";
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
const workspaceSlug = "enquiry-app";
const ids = {
  workspace: randomUUID(),
  branchA: randomUUID(),
  branchB: randomUUID(),
};

type RoleName =
  "workspace_owner" | "branch_manager" | "negotiator" | "accounts";
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
       VALUES ($1::uuid, $2, 'Enquiry App', 'agency', CURRENT_TIMESTAMP)`,
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
const enquirer = {
  name: "Olivia Landlord",
  email: "olivia@example.com",
  telephone: "07700 900123",
  addressBuilding: "Flat 2",
  addressStreet: "10 High Street",
  postcode: "SW1A 1AA",
  summary: "Looking for full management",
};
const communication = {
  preferred: null,
  doNotEmail: false,
  doNotTelephone: false,
  doNotSms: false,
  doNotWhatsApp: false,
  doNotPost: false,
} as const;
const newContact = {
  kind: "person" as const,
  details: {
    title: "",
    firstName: "Olivia",
    middleNames: "",
    lastName: "Landlord",
    preferredName: "",
  },
  communication,
  contactPoints: [
    {
      kind: "email" as const,
      label: "",
      value: "olivia@example.com",
      isPreferred: true,
    },
  ],
  addresses: [],
};
const propertyDetails: PropertyDetailsInput = {
  addressBuilding: "Flat 2",
  addressStreet: "10 High Street",
  addressLocality: "",
  townCity: "London",
  county: "",
  postcode: "SW1A 1AA",
  propertyType: "flat",
  bedrooms: 2,
  bathrooms: 1,
  receptionRooms: null,
  floorArea: null,
  floorAreaUnit: null,
  furnishedStatus: null,
  features: [],
  parkingNotes: "",
  outdoorSpaceNotes: "",
  councilTaxBand: null,
  generalNotes: "",
};

async function makeEnquiry(
  options: {
    by?: UserName;
    branchId?: string;
    leadSourceId?: string | null;
    firstTask?: boolean;
  } = {},
) {
  const result = await createEnquiry({
    ...as(options.by ?? "negotiatorA"),
    branchId: options.branchId ?? ids.branchA,
    enquirer,
    leadSourceId: options.leadSourceId,
    leadMembershipId: memberships.negotiatorA,
    firstTask: options.firstTask
      ? {
          title: "Call landlord",
          dueOn: "2026-10-16",
          assignedMembershipId: memberships.negotiatorA,
        }
      : null,
  });
  if (!result.ok) throw new Error(`Enquiry creation failed: ${result.error}`);
  return result.enquiryId;
}

async function count(sql: string, params: unknown[] = []) {
  const result = await adminPool.query<{ n: string }>(sql, params);
  return Number(result.rows[0].n);
}

beforeEach(seed);
afterAll(async () => {
  await db.$disconnect();
  await adminPool.end();
});

describe("enquiry application layer", () => {
  it("lists only active members who can be assigned enquiry work", async () => {
    const negotiatorAssignees = await listEnquiryAssignees(as("negotiatorA"));
    // Lead workers see colleagues who share a branch (owner decision,
    // 2026-10-16), but not staff who work only in other branches.
    expect(
      negotiatorAssignees.map(({ membershipId }) => membershipId).sort(),
    ).toEqual(
      [
        memberships.owner,
        memberships.managerA,
        memberships.negotiatorA,
        memberships.negotiatorA2,
      ].sort(),
    );

    const assignees = await listEnquiryAssignees(as("owner"));
    expect(assignees.map(({ membershipId }) => membershipId).sort()).toEqual(
      [
        memberships.owner,
        memberships.managerA,
        memberships.negotiatorA,
        memberships.negotiatorA2,
        memberships.negotiatorB,
      ].sort(),
    );
    expect(
      assignees.find(
        ({ membershipId }) => membershipId === memberships.managerA,
      ),
    ).toMatchObject({ branchIds: [ids.branchA] });
    expect(
      assignees.find(({ membershipId }) => membershipId === memberships.owner),
    ).toMatchObject({ branchIds: null });
  });

  it("adds starter lists once and reserves list management for agency admins", async () => {
    const first = await listEnquirySettings(as("negotiatorA"));
    expect(first?.leadSources.map(({ name }) => name)).toContain("Rightmove");
    expect(first?.outcomeReasons.map(({ name }) => name)).toContain(
      "Went with another agent",
    );
    await listEnquirySettings(as("negotiatorA"));
    expect(await count(`SELECT count(*) AS n FROM "lead_sources"`)).toBe(13);

    await expect(
      addEnquiryListItem({
        ...as("negotiatorA"),
        kind: "lead_source",
        name: "Local club",
      }),
    ).resolves.toEqual({ ok: false, error: "access_denied" });
    const added = await addEnquiryListItem({
      ...as("owner"),
      kind: "lead_source",
      name: "  Local   club  ",
    });
    expect(added).toMatchObject({ ok: true });
    if (!added.ok) throw new Error("List item was not added.");
    await expect(
      updateEnquiryListItem({
        ...as("owner"),
        kind: "lead_source",
        itemId: added.itemId,
        name: "Local club referral",
        hidden: true,
        sortOrder: 2,
      }),
    ).resolves.toEqual({ ok: true, itemId: added.itemId });
  });

  it("creates only in scope with eligible assignees and keeps branch lists isolated", async () => {
    const enquiryId = await makeEnquiry({ firstTask: true });
    expect(await getEnquiry({ ...as("negotiatorA"), enquiryId })).toMatchObject(
      {
        id: enquiryId,
        reference: expect.stringMatching(/^ENQ-/),
        leadMembership: { id: memberships.negotiatorA },
        tasks: [{ title: "Call landlord" }],
      },
    );
    await expect(listEnquiries(as("negotiatorB"))).resolves.toEqual([]);
    await expect(
      createEnquiry({
        ...as("negotiatorA"),
        branchId: ids.branchB,
        enquirer,
        firstTask: null,
      }),
    ).resolves.toEqual({ ok: false, error: "access_denied" });
    await expect(
      createEnquiry({
        ...as("accountsA"),
        branchId: ids.branchA,
        enquirer,
        firstTask: null,
      }),
    ).resolves.toEqual({ ok: false, error: "access_denied" });
    await expect(
      createEnquiry({
        ...as("negotiatorA"),
        branchId: ids.branchA,
        enquirer,
        firstTask: {
          title: "Call",
          dueOn: "2026-10-16",
          assignedMembershipId: memberships.accountsA,
        },
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
  });

  it("closes tasks with the enquiry and permits only managers to reopen", async () => {
    const settings = await listEnquirySettings(as("negotiatorA"));
    const lostReason = settings!.outcomeReasons.find(
      ({ appliesTo }) => appliesTo === "lost",
    )!;
    const enquiryId = await makeEnquiry({ firstTask: true });
    await expect(
      closeEnquiry({
        ...as("negotiatorA"),
        enquiryId,
        outcome: "lost",
        outcomeReasonId: lostReason.id,
        outcomeNote: "Chose a competitor",
      }),
    ).resolves.toEqual({ ok: true, enquiryId });
    expect(await getEnquiry({ ...as("managerA"), enquiryId })).toMatchObject({
      stage: "LOST",
      tasks: [{ status: "CANCELLED" }],
      stageHistory: [{ fromStage: "NEW_ENQUIRY", toStage: "LOST" }],
    });
    await expect(
      reopenEnquiry({
        ...as("negotiatorA"),
        enquiryId,
        reason: "Landlord returned",
      }),
    ).resolves.toEqual({ ok: false, error: "access_denied" });
    await expect(
      reopenEnquiry({
        ...as("managerA"),
        enquiryId,
        reason: "Landlord returned",
      }),
    ).resolves.toEqual({ ok: true, enquiryId });
    expect(await getEnquiry({ ...as("managerA"), enquiryId })).toMatchObject({
      stage: "NEW_ENQUIRY",
      tasks: [{ status: "CANCELLED" }],
    });
  });

  it("requires duplicate review and rolls back a contact if property conversion fails", async () => {
    const duplicate = await createContact({
      ...as("managerA"),
      branchId: ids.branchA,
      ...newContact,
    });
    if (!duplicate.ok) throw new Error("Duplicate setup failed.");
    const enquiryId = await makeEnquiry();
    const base = {
      ...as("negotiatorA"),
      enquiryId,
      scheduledAt: new Date("2026-10-20T09:00:00Z"),
      assignedMembershipId: memberships.negotiatorA,
    };
    await expect(
      bookAppraisal({
        ...base,
        contact: { kind: "new", contact: newContact, reviewedDuplicateIds: [] },
        property: {
          kind: "new",
          property: propertyDetails,
          reviewedDuplicateIds: [],
        },
      }),
    ).resolves.toEqual({ ok: false, error: "duplicate_review_required" });

    const before = await count(`SELECT count(*) AS n FROM "contacts"`);
    await expect(
      bookAppraisal({
        ...base,
        contact: {
          kind: "new",
          contact: newContact,
          reviewedDuplicateIds: [duplicate.contactId],
        },
        property: { kind: "existing", propertyId: randomUUID() },
      }),
    ).resolves.toEqual({ ok: false, error: "property_not_found" });
    expect(await count(`SELECT count(*) AS n FROM "contacts"`)).toBe(before);
    expect(await count(`SELECT count(*) AS n FROM "appraisals"`)).toBe(0);
  });

  it("books by atomically creating and linking real records, then completes the appraisal", async () => {
    const settings = await listEnquirySettings(as("negotiatorA"));
    const source = settings!.leadSources[0];
    const enquiryId = await makeEnquiry({ leadSourceId: source.id });
    const booking = await bookAppraisal({
      ...as("negotiatorA"),
      enquiryId,
      scheduledAt: new Date("2026-10-20T09:00:00Z"),
      assignedMembershipId: memberships.negotiatorA,
      contact: { kind: "new", contact: newContact, reviewedDuplicateIds: [] },
      property: {
        kind: "new",
        property: propertyDetails,
        reviewedDuplicateIds: [],
      },
    });
    expect(booking).toMatchObject({ ok: true });
    if (!booking.ok) throw new Error(`Booking failed: ${booking.error}`);
    expect(
      await count(
        `SELECT count(*) AS n FROM "property_ownerships"
         WHERE "property_id" = $1::uuid AND "contact_id" = $2::uuid`,
        [booking.propertyId, booking.contactId],
      ),
    ).toBe(1);
    await expect(
      completeAppraisal({
        ...as("negotiatorA"),
        enquiryId,
        appraisalId: booking.appraisalId,
        outcome: {
          expectedMonthlyRent: "1500",
          recommendedService: "fully_managed",
          feeKind: "percentage",
          feeValue: "12.5",
          feeVat: "inclusive",
          notes: "Good appointment",
        },
      }),
    ).resolves.toEqual({
      ok: true,
      enquiryId,
      appraisalId: booking.appraisalId,
    });
    expect(await getEnquiry({ ...as("negotiatorA"), enquiryId })).toMatchObject(
      {
        stage: "APPRAISAL_COMPLETED",
        appraisals: [
          {
            status: "COMPLETED",
            expectedMonthlyRentPence: 150000,
            feeValue: 1250,
          },
        ],
      },
    );
  });

  it("returns a cancelled appraisal to new enquiry with permanent history", async () => {
    const contact = await createContact({
      ...as("managerA"),
      branchId: ids.branchA,
      ...newContact,
    });
    if (!contact.ok) throw new Error("Contact setup failed.");
    const property = await createProperty({
      ...as("managerA"),
      branchId: ids.branchA,
      details: propertyDetails,
      owners: [{ contactId: contact.contactId, isLead: true, startedOn: "" }],
    });
    if (!property.ok) throw new Error("Property setup failed.");
    const enquiryId = await makeEnquiry();
    const booking = await bookAppraisal({
      ...as("negotiatorA"),
      enquiryId,
      scheduledAt: new Date("2026-10-20T09:00:00Z"),
      assignedMembershipId: memberships.negotiatorA,
      contact: { kind: "existing", contactId: contact.contactId },
      property: { kind: "existing", propertyId: property.propertyId },
    });
    if (!booking.ok) throw new Error(`Booking failed: ${booking.error}`);
    await expect(
      cancelAppraisal({
        ...as("negotiatorA"),
        enquiryId,
        appraisalId: booking.appraisalId,
        reason: "Landlord asked to rearrange",
      }),
    ).resolves.toEqual({
      ok: true,
      enquiryId,
      appraisalId: booking.appraisalId,
    });
    expect(await getEnquiry({ ...as("negotiatorA"), enquiryId })).toMatchObject(
      {
        stage: "NEW_ENQUIRY",
        appraisals: [{ status: "CANCELLED" }],
        stageHistory: [
          { fromStage: "APPRAISAL_BOOKED", toStage: "NEW_ENQUIRY" },
          { fromStage: "NEW_ENQUIRY", toStage: "APPRAISAL_BOOKED" },
        ],
      },
    );
  });

  it("manages next actions and returns only the signed-in user's attention items", async () => {
    const enquiryId = await makeEnquiry();
    const added = await addEnquiryTask({
      ...as("negotiatorA"),
      enquiryId,
      title: "Send terms",
      dueOn: "2026-10-16",
      assignedMembershipId: memberships.negotiatorA,
    });
    expect(added).toMatchObject({ ok: true });
    if (!added.ok) throw new Error("Task setup failed.");
    const attention = await getEnquiryNeedsAttention({
      ...as("negotiatorA"),
      upcomingDays: 31,
      now: new Date("2026-10-16T12:00:00Z"),
    });
    expect(attention.tasks).toMatchObject([
      { id: added.taskId, title: "Send terms" },
    ]);
    await expect(
      completeEnquiryTask({
        ...as("negotiatorA"),
        enquiryId,
        taskId: added.taskId,
      }),
    ).resolves.toEqual({ ok: true, enquiryId, taskId: added.taskId });
    expect(
      (
        await getEnquiryNeedsAttention({
          ...as("negotiatorA"),
          upcomingDays: 31,
          now: new Date("2026-10-16T12:00:00Z"),
        })
      ).tasks,
    ).toEqual([]);
  });
});

describe("Chunk 5 review follow-ups", () => {
  async function linkedRecords(branch: "branchA" | "branchB" = "branchA") {
    const by = branch === "branchA" ? "managerA" : "negotiatorB";
    const contact = await createContact({
      ...as(by),
      branchId: ids[branch],
      ...newContact,
    });
    if (!contact.ok) throw new Error("Contact setup failed.");
    const property = await createProperty({
      ...as(by),
      branchId: ids[branch],
      details: propertyDetails,
      owners: [{ contactId: contact.contactId, isLead: true, startedOn: "" }],
    });
    if (!property.ok) throw new Error("Property setup failed.");
    return { contactId: contact.contactId, propertyId: property.propertyId };
  }

  it("shows a colleague's lead by name, or as a colleague when the role cannot see names", async () => {
    await makeEnquiry();
    const asColleague = await listEnquiries(as("negotiatorA2"));
    expect(asColleague[0]?.lead).toMatchObject({ name: "negotiatorA" });
    // Accounts cannot see staff identities; the list must still load.
    const asAccounts = await listEnquiries(as("accountsA"));
    expect(asAccounts[0]?.lead).toMatchObject({ name: "A colleague" });
  });

  it("refuses every change to another branch's lead", async () => {
    const enquiryId = await makeEnquiry({ firstTask: true });
    const notFound = { ok: false, error: "enquiry_not_found" };
    await expect(
      updateEnquiry({ ...as("negotiatorB"), enquiryId, enquirer }),
    ).resolves.toEqual(notFound);
    await expect(
      closeEnquiry({
        ...as("negotiatorB"),
        enquiryId,
        outcome: "lost",
      }),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      addEnquiryTask({
        ...as("negotiatorB"),
        enquiryId,
        title: "Take over",
        dueOn: "2026-10-16",
        assignedMembershipId: memberships.negotiatorB,
      }),
    ).resolves.toEqual(notFound);
    await expect(
      bookAppraisal({
        ...as("negotiatorB"),
        enquiryId,
        scheduledAt: new Date(Date.now() + 86_400_000),
        assignedMembershipId: memberships.negotiatorB,
        contact: { kind: "new", contact: newContact, reviewedDuplicateIds: [] },
        property: {
          kind: "new",
          property: propertyDetails,
          reviewedDuplicateIds: [],
        },
      }),
    ).resolves.toEqual(notFound);
    expect(await count(`SELECT count(*) AS n FROM "appraisals"`)).toBe(0);
  });

  it("assigns work only to active colleagues who can see the lead's branch", async () => {
    const enquiryId = await makeEnquiry();
    const task = (assignee: UserName) =>
      addEnquiryTask({
        ...as("negotiatorA"),
        enquiryId,
        title: "Call",
        dueOn: "2026-10-16",
        assignedMembershipId: memberships[assignee],
      });
    await expect(task("negotiatorA2")).resolves.toMatchObject({ ok: true });
    await expect(task("negotiatorB")).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
    await adminPool.query(
      `UPDATE "memberships" SET "status" = 'suspended' WHERE "id" = $1::uuid`,
      [memberships.negotiatorA2],
    );
    await expect(task("negotiatorA2")).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
  });

  it("will not book with a real contact or property from another branch", async () => {
    const other = await linkedRecords("branchB");
    const mine = await linkedRecords("branchA");
    const enquiryId = await makeEnquiry();
    const base = {
      ...as("negotiatorA"),
      enquiryId,
      scheduledAt: new Date(Date.now() + 86_400_000),
      assignedMembershipId: memberships.negotiatorA,
    };
    await expect(
      bookAppraisal({
        ...base,
        contact: { kind: "existing", contactId: other.contactId },
        property: { kind: "existing", propertyId: mine.propertyId },
      }),
    ).resolves.toEqual({ ok: false, error: "contact_not_found" });
    await expect(
      bookAppraisal({
        ...base,
        contact: { kind: "existing", contactId: mine.contactId },
        property: { kind: "existing", propertyId: other.propertyId },
      }),
    ).resolves.toEqual({ ok: false, error: "property_not_found" });
    expect(await count(`SELECT count(*) AS n FROM "appraisals"`)).toBe(0);
  });

  it("refuses booking times far in the past or future", async () => {
    const mine = await linkedRecords();
    const enquiryId = await makeEnquiry();
    await expect(
      bookAppraisal({
        ...as("negotiatorA"),
        enquiryId,
        scheduledAt: new Date("2099-01-01T09:00:00Z"),
        assignedMembershipId: memberships.negotiatorA,
        contact: { kind: "existing", contactId: mine.contactId },
        property: { kind: "existing", propertyId: mine.propertyId },
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
  });

  it("explains that a contact or property with an open lead cannot be archived", async () => {
    const mine = await linkedRecords();
    // The contact no longer owns the property but is still on an open lead.
    const contactOnly = await createContact({
      ...as("managerA"),
      branchId: ids.branchA,
      ...newContact,
      contactPoints: [],
    });
    if (!contactOnly.ok) throw new Error("Contact setup failed.");
    const result = await createEnquiry({
      ...as("negotiatorA"),
      branchId: ids.branchA,
      enquirer,
      contactId: contactOnly.contactId,
      propertyId: mine.propertyId,
      firstTask: null,
    });
    expect(result).toMatchObject({ ok: true });
    await expect(
      archiveContact({ ...as("managerA"), contactId: contactOnly.contactId }),
    ).resolves.toEqual({ ok: false, error: "has_open_enquiry" });
    await expect(
      archiveProperty({ ...as("managerA"), propertyId: mine.propertyId }),
    ).resolves.toEqual({ ok: false, error: "has_open_enquiry" });
  });

  it("does not let read-only roles write the starter lists", async () => {
    const settings = await listEnquirySettings(as("accountsA"));
    expect(settings?.leadSources).toEqual([]);
    expect(await count(`SELECT count(*) AS n FROM "lead_sources"`)).toBe(0);
  });

  it("keeps editing a lead whose source was later hidden", async () => {
    const settings = await listEnquirySettings(as("negotiatorA"));
    const source = settings!.leadSources[0];
    const enquiryId = await makeEnquiry({ leadSourceId: source.id });
    await updateEnquiryListItem({
      ...as("owner"),
      kind: "lead_source",
      itemId: source.id,
      name: source.name,
      hidden: true,
      sortOrder: 0,
    });
    await expect(
      updateEnquiry({
        ...as("negotiatorA"),
        enquiryId,
        enquirer: { ...enquirer, summary: "Updated" },
        leadSourceId: source.id,
        leadMembershipId: memberships.negotiatorA,
      }),
    ).resolves.toEqual({ ok: true, enquiryId });
  });

  it("closes a cancelled appraisal's next actions", async () => {
    const mine = await linkedRecords();
    const enquiryId = await makeEnquiry();
    const booking = await bookAppraisal({
      ...as("negotiatorA"),
      enquiryId,
      scheduledAt: new Date(Date.now() + 86_400_000),
      assignedMembershipId: memberships.negotiatorA,
      contact: { kind: "existing", contactId: mine.contactId },
      property: { kind: "existing", propertyId: mine.propertyId },
    });
    if (!booking.ok) throw new Error(`Booking failed: ${booking.error}`);
    const task = await addEnquiryTask({
      ...as("negotiatorA"),
      enquiryId,
      appraisalId: booking.appraisalId,
      title: "Confirm access",
      dueOn: "2026-10-16",
      assignedMembershipId: memberships.negotiatorA,
    });
    expect(task).toMatchObject({ ok: true });
    await cancelAppraisal({
      ...as("negotiatorA"),
      enquiryId,
      appraisalId: booking.appraisalId,
      reason: "Landlord cancelled",
    });
    expect(await getEnquiry({ ...as("negotiatorA"), enquiryId })).toMatchObject(
      { tasks: [{ title: "Confirm access", status: "CANCELLED" }] },
    );
  });
});
