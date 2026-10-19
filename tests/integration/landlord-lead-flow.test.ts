import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createContact } from "@/core/contacts/application/contacts";
import { reviewAppraisalBookingDuplicates } from "@/core/enquiries/application/appraisals";
import { getDashboardSummary } from "@/core/actions/application/dashboard-summary";
import { getTeamWorkload } from "@/core/actions/application/team-workload";
import { listEnquiries } from "@/core/enquiries/application/enquiries";
import {
  createLandlordLead,
  type CreateLandlordLeadInput,
} from "@/core/enquiries/application/landlord-lead-flow";
import { createProperty } from "@/core/properties/application/properties";
import type { PropertyDetailsInput } from "@/core/properties/domain/property";

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
const workspaceSlug = "lead-flow";
const ids = {
  workspace: randomUUID(),
  branchA: randomUUID(),
  branchB: randomUUID(),
  source: randomUUID(),
};

const users = {
  owner: { role: "workspace_owner", branches: [] },
  negotiatorA: { role: "negotiator", branches: ["branchA"] },
  negotiatorA2: { role: "negotiator", branches: ["branchA"] },
  negotiatorB: { role: "negotiator", branches: ["branchB"] },
  accountsA: { role: "accounts", branches: ["branchA"] },
  readOnlyA: { role: "read_only", branches: ["branchA"] },
} as const;
type UserName = keyof typeof users;
const auth = Object.fromEntries(
  Object.keys(users).map((name) => [name, randomUUID()]),
) as Record<UserName, string>;
const memberships = Object.fromEntries(
  Object.keys(users).map((name) => [name, randomUUID()]),
) as Record<UserName, string>;
const as = (name: UserName) => ({ authSubject: auth[name], workspaceSlug });

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
      users[name].branches.length ? "named_branches" : "workspace",
    ],
  );
  await client.query(
    `INSERT INTO "membership_roles" ("workspace_id", "membership_id", "role_code")
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
      `INSERT INTO "workspaces" ("id", "slug", "display_name", "type", "updated_at")
       VALUES ($1::uuid, $2, 'Lead Flow', 'agency', CURRENT_TIMESTAMP)`,
      [ids.workspace, workspaceSlug],
    );
    await client.query(
      `INSERT INTO "branches" ("id", "workspace_id", "name", "updated_at")
       VALUES ($1::uuid, $3::uuid, 'Branch A', CURRENT_TIMESTAMP),
              ($2::uuid, $3::uuid, 'Branch B', CURRENT_TIMESTAMP)`,
      [ids.branchA, ids.branchB, ids.workspace],
    );
    for (const name of Object.keys(users) as UserName[]) {
      await addUser(client, name);
    }
    await client.query(
      `INSERT INTO "lead_sources" ("id", "workspace_id", "name", "updated_at")
       VALUES ($1::uuid, $2::uuid, 'Rightmove', CURRENT_TIMESTAMP)`,
      [ids.source, ids.workspace],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

beforeEach(seed);
afterAll(async () => {
  await adminPool.end();
});

async function count(sql: string, params: unknown[] = []) {
  const result = await adminPool.query<{ n: string }>(sql, params);
  return Number(result.rows[0].n);
}

const communication = {
  preferred: null,
  doNotEmail: false,
  doNotTelephone: false,
  doNotSms: false,
  doNotWhatsApp: false,
  doNotPost: false,
} as const;

const newContact = (
  overrides: {
    email?: string;
    telephone?: string;
    ownAddress?: boolean;
    firstName?: string;
    lastName?: string;
  } = {},
) => ({
  kind: "person" as const,
  details: {
    title: "",
    firstName: overrides.firstName ?? "Olivia",
    middleNames: "",
    lastName: overrides.lastName ?? "Landlord",
    preferredName: "",
  },
  communication,
  contactPoints: [
    {
      kind: "email" as const,
      label: "",
      value: overrides.email ?? "olivia@example.com",
      isPreferred: true,
    },
    {
      kind: "telephone" as const,
      label: "",
      value: overrides.telephone ?? "07700 900123",
      isPreferred: false,
    },
  ],
  addresses: overrides.ownAddress
    ? [
        {
          kind: "individual" as const,
          addressLine1: "4 Elm Close",
          addressLine2: "",
          locality: "",
          townCity: "Leeds",
          county: "",
          postcode: "LS1 4AB",
          countryCode: "GB",
        },
      ]
    : [],
});

const propertyDetails = (street = "High Street"): PropertyDetailsInput => ({
  addressBuilding: "Flat 2",
  addressStreet: street,
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
});

const inOneWeek = () => new Date(Date.now() + 7 * 86_400_000);

function lead(
  by: UserName,
  overrides: Partial<CreateLandlordLeadInput> = {},
): CreateLandlordLeadInput {
  return {
    ...as(by),
    branchId: ids.branchA,
    leadSourceId: ids.source,
    leadMembershipId: memberships.negotiatorA,
    summary: "Wants full management",
    contact: { kind: "new", contact: newContact(), reviewedDuplicateIds: [] },
    property: {
      kind: "new",
      property: propertyDetails(),
      reviewedDuplicateIds: [],
    },
    next: {
      kind: "appraisal",
      scheduledAt: inOneWeek(),
      assignedMembershipId: memberships.negotiatorA,
    },
    ...overrides,
  };
}

const totals = async () => ({
  leads: await count(`SELECT count(*) AS n FROM "landlord_enquiries"`),
  contacts: await count(`SELECT count(*) AS n FROM "contacts"`),
  properties: await count(`SELECT count(*) AS n FROM "properties"`),
  appraisals: await count(`SELECT count(*) AS n FROM "appraisals"`),
  tasks: await count(`SELECT count(*) AS n FROM "enquiry_tasks"`),
});

describe("creating a landlord lead in one step", () => {
  it("saves the landlord, the property, the lead and the booked appraisal together", async () => {
    const result = await createLandlordLead(lead("negotiatorA"));
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("setup failed");
    expect(await totals()).toEqual({
      leads: 1,
      contacts: 1,
      properties: 1,
      appraisals: 1,
      tasks: 0,
    });
    const row = await adminPool.query(
      `SELECT "stage", "contact_id", "property_id", "enquirer_name",
        "enquirer_email", "enquirer_telephone", "address_street", "postcode",
        "lead_source_id", "summary"
       FROM "landlord_enquiries" WHERE "id" = $1::uuid`,
      [result.enquiryId],
    );
    expect(row.rows[0]).toMatchObject({
      stage: "appraisal_booked",
      contact_id: result.contactId,
      property_id: result.propertyId,
      enquirer_name: "Olivia Landlord",
      enquirer_email: "olivia@example.com",
      enquirer_telephone: "+447700900123",
      address_street: "High Street",
      postcode: "SW1A 1AA",
      lead_source_id: ids.source,
      summary: "Wants full management",
    });
    // The landlord is the property's lead owner.
    expect(
      await count(
        `SELECT count(*) AS n FROM "property_ownerships"
         WHERE "property_id" = $1::uuid AND "contact_id" = $2::uuid
           AND "is_lead" AND "ended_at" IS NULL`,
        [result.propertyId, result.contactId],
      ),
    ).toBe(1);
    // Booking moved the lead through its stage history, as any booking does.
    expect(
      await count(
        `SELECT count(*) AS n FROM "enquiry_stage_history"
         WHERE "enquiry_id" = $1::uuid AND "to_stage" = 'appraisal_booked'`,
        [result.enquiryId],
      ),
    ).toBe(1);
    // It shows up in the lead list.
    const list = await listEnquiries(as("negotiatorA"));
    expect(list).toHaveLength(1);
  });

  it("can be saved early: the lead, landlord and property without an appraisal", async () => {
    const result = await createLandlordLead(
      lead("negotiatorA", { next: { kind: "none" } }),
    );
    expect(result).toMatchObject({ ok: true });
    expect(await totals()).toEqual({
      leads: 1,
      contacts: 1,
      properties: 1,
      appraisals: 0,
      tasks: 0,
    });
    expect(
      await count(
        `SELECT count(*) AS n FROM "landlord_enquiries"
         WHERE "stage" = 'new_enquiry' AND "contact_id" IS NOT NULL
           AND "property_id" IS NOT NULL`,
      ),
    ).toBe(1);
  });

  it("caps a maximum-length person's generated lead name at 200 characters", async () => {
    const firstName = "F".repeat(100);
    const lastName = "S".repeat(100);
    const result = await createLandlordLead(
      lead("negotiatorA", {
        contact: {
          kind: "new",
          contact: newContact({ firstName, lastName }),
          reviewedDuplicateIds: [],
        },
        next: { kind: "none" },
      }),
    );

    expect(result).toMatchObject({ ok: true });
    const saved = await adminPool.query<{ enquirer_name: string }>(
      `SELECT "enquirer_name" FROM "landlord_enquiries"`,
    );
    expect(saved.rows[0]?.enquirer_name).toBe(
      `${firstName} ${lastName.slice(0, 99)}`,
    );
  });

  it("can start with a next action instead of an appraisal", async () => {
    const result = await createLandlordLead(
      lead("negotiatorA", {
        next: {
          kind: "task",
          title: "Call the landlord back",
          dueOn: "2026-12-01",
          assignedMembershipId: memberships.negotiatorA,
        },
      }),
    );
    expect(result).toMatchObject({ ok: true });
    expect(await totals()).toMatchObject({ leads: 1, appraisals: 0, tasks: 1 });
  });

  it("links an existing landlord and property instead of creating new ones", async () => {
    const contact = await createContact({
      ...as("negotiatorA"),
      ...newContact(),
      branchId: ids.branchA,
    });
    const property = await createProperty({
      ...as("negotiatorA"),
      branchId: ids.branchA,
      details: propertyDetails("Mill Lane"),
      owners: [],
    });
    if (!contact.ok || !property.ok) throw new Error("setup failed");
    const before = await totals();
    const result = await createLandlordLead(
      lead("negotiatorA", {
        contact: { kind: "existing", contactId: contact.contactId },
        property: { kind: "existing", propertyId: property.propertyId },
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      contactId: contact.contactId,
      propertyId: property.propertyId,
    });
    const after = await totals();
    expect(after.contacts).toBe(before.contacts);
    expect(after.properties).toBe(before.properties);
    expect(after.leads).toBe(before.leads + 1);
    // The existing property gains the landlord as an owner.
    expect(
      await count(
        `SELECT count(*) AS n FROM "property_ownerships"
         WHERE "property_id" = $1::uuid AND "contact_id" = $2::uuid
           AND "ended_at" IS NULL`,
        [property.propertyId, contact.contactId],
      ),
    ).toBe(1);
  });

  it("keeps the landlord's own address separate from the rental property", async () => {
    const result = await createLandlordLead(
      lead("negotiatorA", {
        contact: {
          kind: "new",
          contact: newContact({ ownAddress: true }),
          reviewedDuplicateIds: [],
        },
        next: { kind: "none" },
      }),
    );
    expect(result).toMatchObject({ ok: true });
    const addresses = await adminPool.query(
      `SELECT "address_line_1", "postcode" FROM "contact_addresses"`,
    );
    expect(addresses.rows).toEqual([
      { address_line_1: "4 Elm Close", postcode: "LS14AB" },
    ]);
    const lead_ = await adminPool.query(
      `SELECT "address_street", "postcode" FROM "landlord_enquiries"`,
    );
    expect(lead_.rows).toEqual([
      { address_street: "High Street", postcode: "SW1A 1AA" },
    ]);
  });
});

describe("a booked appraisal is the lead's next action", () => {
  it("is shown as the next action and is never flagged as missing one", async () => {
    // A lead with a booked appraisal and no other action...
    const booked = await createLandlordLead(lead("negotiatorA"));
    // ...and a lead saved early, which still needs a next action.
    const early = await createLandlordLead(
      lead("negotiatorA", {
        contact: {
          kind: "new",
          contact: newContact({
            email: "second@example.com",
            telephone: "07700 900456",
          }),
          reviewedDuplicateIds: [],
        },
        property: {
          kind: "new",
          property: { ...propertyDetails("Mill Lane"), postcode: "EC1A 1BB" },
          reviewedDuplicateIds: [],
        },
        next: { kind: "none" },
      }),
    );
    if (!booked.ok || !early.ok) throw new Error("setup failed");

    const list = await listEnquiries(as("negotiatorA"));
    const nextOf = (id: string) =>
      list.find((item) => item.id === id)?.nextAction;
    expect(nextOf(booked.enquiryId)).toMatchObject({ title: "Appraisal" });
    expect(nextOf(early.enquiryId)).toBeNull();

    const summary = await getDashboardSummary(as("negotiatorA"));
    expect(
      summary?.attention.noNextAction.items.map((item) => item.id),
    ).toEqual([early.enquiryId]);
    expect(summary?.headline.leadsWithoutNextAction).toBe(1);
  });

  it("is counted the same way in the team workload", async () => {
    const booked = await createLandlordLead(lead("negotiatorA"));
    const early = await createLandlordLead(
      lead("negotiatorA", {
        contact: {
          kind: "new",
          contact: newContact({
            email: "second@example.com",
            telephone: "07700 900456",
          }),
          reviewedDuplicateIds: [],
        },
        property: {
          kind: "new",
          property: { ...propertyDetails("Mill Lane"), postcode: "EC1A 1BB" },
          reviewedDuplicateIds: [],
        },
        next: { kind: "none" },
      }),
    );
    if (!booked.ok || !early.ok) throw new Error("setup failed");
    const workload = await getTeamWorkload(as("negotiatorA"));
    expect(workload?.byMembership[memberships.negotiatorA]).toMatchObject({
      openLeads: 2,
      leadsWithoutNextAction: 1,
    });
  });
});

describe("duplicates", () => {
  async function existingDuplicates() {
    const contact = await createContact({
      ...as("negotiatorA"),
      ...newContact(),
      branchId: ids.branchA,
    });
    const property = await createProperty({
      ...as("negotiatorA"),
      branchId: ids.branchA,
      details: propertyDetails(),
      owners: [],
    });
    if (!contact.ok || !property.ok) throw new Error("setup failed");
    return { contact, property };
  }

  it("refuses unreviewed duplicates and saves nothing", async () => {
    await existingDuplicates();
    const before = await totals();
    await expect(createLandlordLead(lead("negotiatorA"))).resolves.toEqual({
      ok: false,
      error: "duplicate_review_required",
    });
    expect(await totals()).toEqual(before);

    // The background check finds the same records the save would refuse.
    const found = await reviewAppraisalBookingDuplicates({
      ...as("negotiatorA"),
      contact: newContact(),
      property: propertyDetails(),
    });
    expect(found.contactMatches?.length).toBeGreaterThan(0);
    expect(found.propertyMatches.length).toBeGreaterThan(0);
  });

  it("leaves no half-made landlord behind when the property duplicate is unreviewed", async () => {
    const { contact } = await existingDuplicates();
    const before = await totals();
    // The contact is reviewed (a new one is chosen), the property is not.
    await expect(
      createLandlordLead(
        lead("negotiatorA", {
          contact: {
            kind: "new",
            contact: newContact(),
            reviewedDuplicateIds: [contact.contactId],
          },
        }),
      ),
    ).resolves.toEqual({ ok: false, error: "duplicate_review_required" });
    expect(await totals()).toEqual(before);
  });

  it("goes ahead once the duplicates have been reviewed and a new record is chosen", async () => {
    const { contact, property } = await existingDuplicates();
    const result = await createLandlordLead(
      lead("negotiatorA", {
        contact: {
          kind: "new",
          contact: newContact(),
          reviewedDuplicateIds: [contact.contactId],
        },
        property: {
          kind: "new",
          property: propertyDetails(),
          reviewedDuplicateIds: [property.propertyId],
        },
      }),
    );
    expect(result).toMatchObject({ ok: true });
    expect(await totals()).toMatchObject({
      leads: 1,
      contacts: 2,
      properties: 2,
    });
  });
});

describe("refusals save nothing", () => {
  it("refuses people who may not create or book", async () => {
    for (const by of ["accountsA", "readOnlyA"] as const) {
      await expect(createLandlordLead(lead(by))).resolves.toEqual({
        ok: false,
        error: "access_denied",
      });
    }
    // Another branch's people cannot create into this branch.
    await expect(createLandlordLead(lead("negotiatorB"))).resolves.toEqual({
      ok: false,
      error: "access_denied",
    });
    expect(await totals()).toEqual({
      leads: 0,
      contacts: 0,
      properties: 0,
      appraisals: 0,
      tasks: 0,
    });
  });

  it("refuses bad input, an unsuitable assignee and an unreasonable time before writing", async () => {
    const attempts: Partial<CreateLandlordLeadInput>[] = [
      { branchId: "nope" },
      {
        next: {
          kind: "appraisal",
          scheduledAt: new Date("2001-01-01T09:00:00Z"),
          assignedMembershipId: memberships.negotiatorA,
        },
      },
      {
        next: {
          kind: "appraisal",
          scheduledAt: inOneWeek(),
          assignedMembershipId: memberships.negotiatorB,
        },
      },
      {
        next: {
          kind: "appraisal",
          scheduledAt: inOneWeek(),
          assignedMembershipId: "nope",
        },
      },
      { leadSourceId: randomUUID() },
      { leadMembershipId: memberships.negotiatorB },
    ];
    for (const attempt of attempts) {
      const result = await createLandlordLead(lead("negotiatorA", attempt));
      expect(result.ok, JSON.stringify(attempt)).toBe(false);
    }
    expect(await totals()).toEqual({
      leads: 0,
      contacts: 0,
      properties: 0,
      appraisals: 0,
      tasks: 0,
    });
  });

  it("rolls back the landlord and property if the lead cannot be saved", async () => {
    // A task with a bad date fails after the landlord and property were made.
    const result = await createLandlordLead(
      lead("negotiatorA", {
        next: {
          kind: "task",
          title: "Call",
          dueOn: "not-a-date",
          assignedMembershipId: memberships.negotiatorA,
        },
      }),
    );
    expect(result).toEqual({ ok: false, error: "invalid_input" });
    expect(await totals()).toEqual({
      leads: 0,
      contacts: 0,
      properties: 0,
      appraisals: 0,
      tasks: 0,
    });
  });
});
