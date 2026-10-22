import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getApplicantAttention } from "@/core/applicants/application/applicant-attention";
import {
  matchingApplicantsForListing,
  suggestedListingsForApplicant,
} from "@/core/applicants/application/applicant-matching";
import {
  getApplicant,
  listApplicants,
} from "@/core/applicants/application/applicant-views";
import {
  addApplicantMember,
  assignApplicant,
  changeApplicantStatus,
  createApplicant,
  listLettingsReasons,
  removeApplicantMember,
  saveRequirements,
} from "@/core/applicants/application/applicants";
import {
  addLettingsReason,
  updateLettingsReason,
} from "@/core/applicants/application/lettings-reasons";
import {
  assignEnquiry,
  listPropertyEnquiries,
  moveEnquiry,
  registerPropertyEnquiry,
} from "@/core/applicants/application/property-enquiries";
import {
  addWorkItem,
  listWorkItems,
} from "@/core/actions/application/work-items";
import {
  prepareListing,
  withdrawListing,
} from "@/core/listings/application/listings";

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
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl: false });
const workspaceSlug = "applicants-app";
const otherSlug = "applicants-other";

const ids = {
  workspace: randomUUID(),
  other: randomUUID(),
  branchA: randomUUID(),
  branchB: randomUUID(),
  branchOther: randomUUID(),
  source: randomUUID(),
  person: randomUUID(),
  propertyA: randomUUID(),
  propertyArchived: randomUUID(),
  propertyOther: randomUUID(),
  lead: randomUUID(),
};

type UserSpec = {
  role: string;
  branch: "branchA" | "branchB" | null;
  workspace: "workspace" | "other";
};

const users = {
  owner: { role: "workspace_owner", branch: null, workspace: "workspace" },
  managerA: {
    role: "branch_manager",
    branch: "branchA",
    workspace: "workspace",
  },
  negotiatorA: {
    role: "negotiator",
    branch: "branchA",
    workspace: "workspace",
  },
  propertyManagerA: {
    role: "property_manager",
    branch: "branchA",
    workspace: "workspace",
  },
  negotiatorB: {
    role: "negotiator",
    branch: "branchB",
    workspace: "workspace",
  },
  accountsA: { role: "accounts", branch: "branchA", workspace: "workspace" },
  readOnlyA: { role: "read_only", branch: "branchA", workspace: "workspace" },
  otherOwner: { role: "workspace_owner", branch: null, workspace: "other" },
} satisfies Record<string, UserSpec>;
type UserName = keyof typeof users;

const auth = Object.fromEntries(
  Object.keys(users).map((name) => [name, randomUUID()]),
) as Record<UserName, string>;
const memberships = Object.fromEntries(
  Object.keys(users).map((name) => [name, randomUUID()]),
) as Record<UserName, string>;

// One person who belongs to both workspaces, as a Branch A negotiator here
// and as the other workspace's owner.
const dual = {
  auth: randomUUID(),
  here: randomUUID(),
  there: randomUUID(),
};

const as = (name: UserName) => ({
  authSubject: auth[name],
  workspaceSlug: users[name].workspace === "other" ? otherSlug : workspaceSlug,
});

async function addMembership(
  client: PoolClient,
  input: {
    id: string;
    identityId: string;
    workspaceId: string;
    role: string;
    branchId: string | null;
  },
) {
  await client.query(
    `INSERT INTO "memberships"
      ("id", "workspace_id", "user_identity_id", "scope_mode", "updated_at")
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::membership_scope_mode,
       CURRENT_TIMESTAMP)`,
    [
      input.id,
      input.workspaceId,
      input.identityId,
      input.branchId ? "named_branches" : "workspace",
    ],
  );
  await client.query(
    `INSERT INTO "membership_roles" ("workspace_id", "membership_id", "role_code")
     VALUES ($1::uuid, $2::uuid, $3::membership_role_code)`,
    [input.workspaceId, input.id, input.role],
  );
  if (input.branchId) {
    await client.query(
      `INSERT INTO "membership_branch_access"
        ("workspace_id", "membership_id", "branch_id")
       VALUES ($1::uuid, $2::uuid, $3::uuid)`,
      [input.workspaceId, input.id, input.branchId],
    );
  }
}

async function addIdentity(client: PoolClient, authSubject: string) {
  const identityId = randomUUID();
  await client.query(
    `INSERT INTO "user_identities" ("id", "first_name", "updated_at")
     VALUES ($1::uuid, 'Test', CURRENT_TIMESTAMP)`,
    [identityId],
  );
  await client.query(
    `INSERT INTO "authentication_provider_links"
      ("user_identity_id", "provider", "provider_subject")
     VALUES ($1::uuid, 'supabase', $2::uuid)`,
    [identityId, authSubject],
  );
  return identityId;
}

async function seedReferenceData() {
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
       VALUES ($1::uuid, $3, 'Documents App', 'agency', CURRENT_TIMESTAMP),
              ($2::uuid, $4, 'Documents Other', 'agency', CURRENT_TIMESTAMP)`,
      [ids.workspace, ids.other, workspaceSlug, otherSlug],
    );
    await client.query(
      `INSERT INTO "branches" ("id", "workspace_id", "name", "updated_at")
       VALUES ($1::uuid, $4::uuid, 'Branch A', CURRENT_TIMESTAMP),
              ($2::uuid, $4::uuid, 'Branch B', CURRENT_TIMESTAMP),
              ($3::uuid, $5::uuid, 'Other', CURRENT_TIMESTAMP)`,
      [ids.branchA, ids.branchB, ids.branchOther, ids.workspace, ids.other],
    );
    for (const [name, spec] of Object.entries(users) as [
      UserName,
      UserSpec,
    ][]) {
      const identityId = await addIdentity(client, auth[name]);
      await addMembership(client, {
        id: memberships[name],
        identityId,
        workspaceId: spec.workspace === "other" ? ids.other : ids.workspace,
        role: spec.role,
        branchId: spec.branch ? ids[spec.branch] : null,
      });
    }
    const dualIdentity = await addIdentity(client, dual.auth);
    await addMembership(client, {
      id: dual.here,
      identityId: dualIdentity,
      workspaceId: ids.workspace,
      role: "negotiator",
      branchId: ids.branchA,
    });
    await addMembership(client, {
      id: dual.there,
      identityId: dualIdentity,
      workspaceId: ids.other,
      role: "workspace_owner",
      branchId: null,
    });
    await client.query(
      `INSERT INTO "contacts" ("id", "workspace_id", "kind", "reference",
        "first_name", "last_name", "created_by_membership_id", "updated_at")
       VALUES ($1::uuid, $2::uuid, 'person', 'PER-DA111111', 'Alex',
         'Example', $3::uuid, CURRENT_TIMESTAMP)`,
      [ids.person, ids.workspace, memberships.managerA],
    );
    await client.query(
      `INSERT INTO "contact_branch_links" ("workspace_id", "contact_id",
        "branch_id", "is_primary", "created_by_membership_id", "updated_at")
       VALUES ($1::uuid, $2::uuid, $3::uuid, true, $4::uuid, CURRENT_TIMESTAMP)`,
      [ids.workspace, ids.person, ids.branchA, memberships.managerA],
    );
    for (const [propertyId, workspaceId, branchId, ref, creator, archived] of [
      [
        ids.propertyA,
        ids.workspace,
        ids.branchA,
        "PRP-DAAA2222",
        memberships.managerA,
        false,
      ],
      [
        ids.propertyArchived,
        ids.workspace,
        ids.branchA,
        "PRP-DABB2222",
        memberships.managerA,
        true,
      ],
      [
        ids.propertyOther,
        ids.other,
        ids.branchOther,
        "PRP-DACC2222",
        memberships.otherOwner,
        false,
      ],
    ] as const) {
      await client.query(
        `INSERT INTO "properties" ("id", "workspace_id", "reference",
          "responsible_branch_id", "status", "archived_at", "address_street",
          "town_city", "postcode", "normalized_address_key", "property_type",
          "created_by_membership_id", "updated_at")
         VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5::property_status, $6,
           '1 Test Street', 'London', 'SW1A 1AA', $3, 'flat', $7::uuid,
           CURRENT_TIMESTAMP)`,
        [
          propertyId,
          workspaceId,
          ref,
          branchId,
          archived ? "archived" : "active",
          archived ? new Date() : null,
          creator,
        ],
      );
    }
    await client.query(
      `INSERT INTO "lead_sources" ("id", "workspace_id", "name", "updated_at")
       VALUES ($1::uuid, $2::uuid, 'Rightmove', CURRENT_TIMESTAMP)`,
      [ids.source, ids.workspace],
    );
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [
      ids.workspace,
    ]);
    await client.query(
      `INSERT INTO "landlord_enquiries" ("id", "workspace_id", "reference",
        "responsible_branch_id", "stage", "enquirer_name",
        "enquirer_telephone", "postcode", "contact_id", "property_id",
        "lead_source_id", "created_by_membership_id", "updated_at")
       VALUES ($1::uuid, $2::uuid, 'ENQ-DAAA2222', $3::uuid,
         'appraisal_completed', 'Pat', '07700 900111', 'SW1A 1AA', $4::uuid,
         $5::uuid, $6::uuid, $7::uuid, CURRENT_TIMESTAMP)`,
      [
        ids.lead,
        ids.workspace,
        ids.branchA,
        ids.person,
        ids.propertyA,
        ids.source,
        memberships.managerA,
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Runs as the runtime role in Branch A manager's context and commits. */
async function asManagerA<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await runtimePool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.workspace_id', $1, true),
              set_config('app.membership_id', $2, true),
              set_config('app.membership_scope_mode', 'named_branches', true),
              set_config('app.allowed_branch_ids', $3, true)`,
      [ids.workspace, memberships.managerA, `{${ids.branchA}}`],
    );
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function createInstruction() {
  return asManagerA(async (client) => {
    await client.query(
      `INSERT INTO "enquiry_stage_history" ("workspace_id", "enquiry_id",
        "from_stage", "to_stage", "changed_by_membership_id")
       VALUES ($1::uuid, $2::uuid, 'appraisal_completed', 'won', $3::uuid)`,
      [ids.workspace, ids.lead, memberships.managerA],
    );
    await client.query(
      `UPDATE "landlord_enquiries" SET "stage" = 'won', "updated_at" = now()
       WHERE "id" = $1::uuid`,
      [ids.lead],
    );
    const result = await client.query<{ id: string }>(
      `INSERT INTO "instructions" ("workspace_id", "reference", "property_id",
        "enquiry_id", "responsible_branch_id", "instructed_on",
        "created_by_membership_id", "updated_at")
       VALUES ($1::uuid, 'INS-DAAA2222', $2::uuid, $3::uuid, $4::uuid,
         public.uk_today(), $5::uuid, CURRENT_TIMESTAMP)
       RETURNING "id"`,
      [
        ids.workspace,
        ids.propertyA,
        ids.lead,
        ids.branchA,
        memberships.managerA,
      ],
    );
    const id = result.rows[0].id;
    await client.query(
      `INSERT INTO "instruction_parties" ("workspace_id", "instruction_id",
        "contact_id", "is_main_contact", "added_by_membership_id", "updated_at")
       VALUES ($1::uuid, $2::uuid, $3::uuid, true, $4::uuid, CURRENT_TIMESTAMP)`,
      [ids.workspace, id, ids.person, memberships.managerA],
    );
    await client.query(
      `INSERT INTO "instruction_terms_versions" ("workspace_id",
        "instruction_id", "service", "created_by_membership_id")
       VALUES ($1::uuid, $2::uuid, 'fully_managed', $3::uuid)`,
      [ids.workspace, id, memberships.managerA],
    );
    return id;
  });
}

let instructionId = "";

/** Runs as the admin role, skipping triggers, to set up fixture states. */
async function asAdmin(sql: string, params: unknown[] = []) {
  const client = await adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    const result = await client.query(sql, params);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Ready to market, with an agreed rent and deposit, and a private note on the property. */
async function readyInstruction() {
  const id = await createInstruction();
  await asAdmin(
    `UPDATE "instructions" SET "journey_stage" = 'ready_to_market'
     WHERE "id" = $1::uuid`,
    [id],
  );
  await asAdmin(
    `UPDATE "instruction_terms_versions"
     SET "asking_rent_pence" = 145000, "rent_period" = 'month',
       "deposit_offering" = 'standard', "deposit_pence" = 167300,
       "fee_kind" = 'percentage', "fee_value" = 1200,
       "fee_vat" = 'exclusive'
     WHERE "instruction_id" = $1::uuid`,
    [id],
  );
  await asAdmin(
    `UPDATE "properties" SET "general_notes" = 'Landlord is difficult',
       "bedrooms" = 2, "bathrooms" = 1
     WHERE "id" = $1::uuid`,
    [ids.propertyA],
  );
  return id;
}

async function prepared(name: UserName = "managerA") {
  const result = await prepareListing({ ...as(name), instructionId });
  if (!result.ok) throw new Error(`prepare failed: ${result.error}`);
  return result.listingId;
}

beforeEach(async () => {
  await seedReferenceData();
  instructionId = await readyInstruction();
});

afterAll(async () => {
  await runtimePool.end();
  await adminPool.end();
});

// --- Fixtures for applicants ---

const communication = {
  preferred: null,
  doNotEmail: false,
  doNotTelephone: false,
  doNotSms: false,
  doNotWhatsApp: false,
  doNotPost: false,
} as const;

/** A new person, with an email and a telephone, as the services take it. */
const person = (
  firstName: string,
  lastName: string,
  email: string,
  phone = "",
) => ({
  kind: "new" as const,
  reviewedDuplicateIds: [] as string[],
  contact: {
    kind: "person" as const,
    details: {
      title: "",
      firstName,
      middleNames: "",
      lastName,
      preferredName: "",
    },
    communication,
    contactPoints: [
      { kind: "email" as const, label: "", value: email, isPreferred: true },
      ...(phone
        ? [
            {
              kind: "telephone" as const,
              label: "",
              value: phone,
              isPreferred: false,
            },
          ]
        : []),
    ],
    addresses: [],
  },
});

let counter = 0;
const unique = () => `${(counter += 1)}`;

/** A new applicant in Branch A, led by a freshly made contact. */
async function newApplicant(
  name: UserName = "negotiatorA",
  extra: Partial<Parameters<typeof createApplicant>[0]> = {},
) {
  const n = unique();
  const result = await createApplicant({
    ...as(name),
    branchId: ids.branchA,
    contact: person("Sam", `Seeker${n}`, `sam${n}@example.com`),
    ...extra,
  });
  if (!result.ok) throw new Error(`create failed: ${result.error}`);
  return result;
}

/** A listing in Branch A, set to Ready to advertise for the test. */
async function readyListing() {
  const listingId = await prepared();
  await asAdmin(
    `UPDATE "listings" SET "state" = 'ready_to_advertise' WHERE "id" = $1::uuid`,
    [listingId],
  );
  return listingId;
}

async function viewApplicant(
  applicantId: string,
  name: UserName = "negotiatorA",
) {
  const result = await getApplicant({ ...as(name), applicantId });
  if (!result.ok) throw new Error(`view failed: ${result.error}`);
  return result.applicant;
}

async function applicantReasonId(kind: "applicant" | "property_enquiry") {
  const reasons = await listLettingsReasons(as("managerA"));
  const found = reasons?.find((reason) => reason.appliesTo === kind);
  if (!found) throw new Error("no reason");
  return found.id;
}

async function closeApplicant(
  applicantId: string,
  name: UserName = "negotiatorA",
) {
  return changeApplicantStatus({
    ...as(name),
    applicantId,
    to: "closed",
    reasonId: await applicantReasonId("applicant"),
  });
}

async function openCount(contactId: string) {
  const { rows } = await adminPool.query<{ n: number }>(
    `SELECT "current_open_applicant_count" AS "n" FROM "contacts"
     WHERE "id" = $1::uuid`,
    [contactId],
  );
  return rows[0].n;
}

describe("creating an applicant", () => {
  it("makes a household with its lead, members and first requirements, and links them to the branch", async () => {
    const { applicantId, contactId } = await newApplicant("negotiatorA", {
      members: [person("Jo", "Seeker", "jo@example.com", "07700 900222")],
      requirements: { areas: ["London"], minBedrooms: 2, maxRent: "1500" },
      leadSourceId: ids.source,
      leadMembershipId: memberships.negotiatorA,
    });
    const applicant = await viewApplicant(applicantId);
    expect(applicant).toMatchObject({
      status: "active",
      branch: { id: ids.branchA },
      source: { name: "Rightmove" },
      owner: { membershipId: memberships.negotiatorA },
      lead: { id: contactId },
    });
    expect(applicant.reference).toMatch(/^APP-[2-9A-HJ-NP-Z]{8}$/);
    // A member is shown by name and contact details only.
    expect(applicant.members).toHaveLength(1);
    expect(Object.keys(applicant.members[0].contact).sort()).toEqual([
      "email",
      "id",
      "name",
      "reference",
      "telephone",
    ]);
    expect(applicant.members[0].contact).toMatchObject({
      name: "Jo Seeker",
      email: "jo@example.com",
      telephone: "07700 900222",
    });
    expect(applicant.requirements).toMatchObject({
      versionNo: 1,
      requirements: { areas: ["London"], minBedrooms: 2, maxRentPence: 150000 },
    });
    const links = await adminPool.query(
      `SELECT count(*)::int AS n FROM "contact_branch_links"
       WHERE "contact_id" = $1::uuid AND "branch_id" = $2::uuid
         AND "ended_at" IS NULL`,
      [contactId, ids.branchA],
    );
    expect(links.rows[0].n).toBe(1);
    expect(await openCount(contactId)).toBe(1);
  });

  it("is for the four working roles in their own branch, and nobody else", async () => {
    for (const name of ["owner", "managerA", "negotiatorA"] as const) {
      const n = unique();
      expect(
        await createApplicant({
          ...as(name),
          branchId: ids.branchA,
          contact: person("Pat", `Role${n}`, `role${n}@example.com`),
        }),
      ).toMatchObject({ ok: true });
    }
    for (const name of [
      "propertyManagerA",
      "readOnlyA",
      "accountsA",
      "negotiatorB",
      "otherOwner",
    ] as const) {
      const n = unique();
      expect(
        await createApplicant({
          ...as(name),
          branchId: ids.branchA,
          contact: person("Pat", `Nope${n}`, `nope${n}@example.com`),
        }),
        name,
      ).toMatchObject({
        ok: false,
        // Another agency has no such branch at all.
        error: name === "otherOwner" ? "invalid_input" : "access_denied",
      });
    }
  });

  it("asks for the duplicate review, and refuses a second open applicant for the same lead", async () => {
    const first = await newApplicant();
    // The same email as an existing contact needs a review.
    const lead = await viewApplicant(first.applicantId);
    expect(
      await createApplicant({
        ...as("negotiatorA"),
        branchId: ids.branchA,
        contact: person("Sam", "Again", lead.lead.email ?? ""),
      }),
    ).toMatchObject({ ok: false, error: "duplicate_review_required" });
    // The same existing contact cannot lead two open applicants.
    expect(
      await createApplicant({
        ...as("negotiatorA"),
        branchId: ids.branchA,
        contact: { kind: "existing", contactId: first.contactId },
      }),
    ).toMatchObject({ ok: false, error: "applicant_exists" });
    // Once closed, the same contact can lead a new one.
    expect(await closeApplicant(first.applicantId)).toEqual({ ok: true });
    expect(
      await createApplicant({
        ...as("negotiatorA"),
        branchId: ids.branchA,
        contact: { kind: "existing", contactId: first.contactId },
      }),
    ).toMatchObject({ ok: true });
  });

  it("refuses bad requirements, a hidden lead source and an owner who cannot work here", async () => {
    const n = unique();
    const base = {
      ...as("negotiatorA"),
      branchId: ids.branchA,
      contact: person("Pat", `Bad${n}`, `bad${n}@example.com`),
    };
    expect(
      await createApplicant({
        ...base,
        requirements: { minBedrooms: 5, maxBedrooms: 2 },
      }),
    ).toMatchObject({ ok: false, error: "invalid_input" });
    expect(
      await createApplicant({ ...base, leadSourceId: randomUUID() }),
    ).toMatchObject({ ok: false, error: "invalid_input" });
    // Branch B's negotiator does not work in Branch A; Accounts cannot work with applicants.
    for (const name of ["negotiatorB", "accountsA"] as const) {
      expect(
        await createApplicant({ ...base, leadMembershipId: memberships[name] }),
        name,
      ).toMatchObject({ ok: false, error: "invalid_input" });
    }
    // Nothing was left behind by the refusals.
    const { rows } = await adminPool.query(
      `SELECT count(*)::int AS n FROM "contacts" WHERE "last_name" = $1`,
      [`Bad${n}`],
    );
    expect(rows[0].n).toBe(0);
  });
});

describe("seeing applicants", () => {
  it("shows an applicant to readers in its branch, hides it from Accounts and other branches", async () => {
    const { applicantId } = await newApplicant();
    for (const name of [
      "owner",
      "managerA",
      "negotiatorA",
      "propertyManagerA",
      "readOnlyA",
    ] as const) {
      const applicant = await viewApplicant(applicantId, name);
      expect(applicant.can.manage, name).toBe(
        ["owner", "managerA", "negotiatorA"].includes(name),
      );
    }
    expect(await getApplicant({ ...as("accountsA"), applicantId })).toEqual({
      ok: false,
      error: "access_denied",
    });
    expect(await getApplicant({ ...as("negotiatorB"), applicantId })).toEqual({
      ok: false,
      error: "applicant_not_found",
    });
    expect(await getApplicant({ ...as("otherOwner"), applicantId })).toEqual({
      ok: false,
      error: "applicant_not_found",
    });
    expect(
      await getApplicant({ ...as("owner"), applicantId: "nonsense" }),
    ).toEqual({
      ok: false,
      error: "applicant_not_found",
    });
    expect((await viewApplicant(applicantId, "managerA")).can.reopen).toBe(
      true,
    );
    expect((await viewApplicant(applicantId, "negotiatorA")).can.reopen).toBe(
      false,
    );
  });

  it("lists open applicants by default, and filters by status, name and next action", async () => {
    const a = await newApplicant();
    const b = await newApplicant();
    await closeApplicant(b.applicantId);
    const open = await listApplicants(as("negotiatorA"));
    expect(open?.items.map((item) => item.id)).toEqual([a.applicantId]);
    expect(open?.items[0]).toMatchObject({
      status: "active",
      openEnquiries: 0,
      hasRequirements: false,
      nextAction: null,
    });
    expect(
      (await listApplicants({ ...as("negotiatorA"), status: "all" }))?.total,
    ).toBe(2);
    expect(
      (
        await listApplicants({ ...as("negotiatorA"), status: "closed" })
      )?.items.map((item) => item.id),
    ).toEqual([b.applicantId]);
    // A search matches the lead's names; only the open applicant is listed.
    expect(
      (await listApplicants({ ...as("negotiatorA"), query: "Seeker" }))?.total,
    ).toBe(1);
    expect(
      (await listApplicants({ ...as("negotiatorA"), query: "zzzzzz" }))?.total,
    ).toBe(0);
    expect(
      (await listApplicants({ ...as("negotiatorA"), noNextAction: true }))
        ?.total,
    ).toBe(1);
    // Scope: another branch sees none, and Accounts is refused.
    expect((await listApplicants(as("negotiatorB")))?.total).toBe(0);
    expect(await listApplicants(as("accountsA"))).toBeNull();
    expect((await listApplicants(as("readOnlyA")))?.total).toBe(1);
  });
});

describe("requirements and the household", () => {
  it("saves a new version only when something changed, and never on a closed applicant", async () => {
    const { applicantId } = await newApplicant();
    const save = (
      requirements: Parameters<typeof saveRequirements>[0]["requirements"],
      name: UserName = "negotiatorA",
    ) => saveRequirements({ ...as(name), applicantId, requirements });
    expect(await save({ areas: ["Leeds"], maxRent: "900" })).toEqual({
      ok: true,
      versionNo: 1,
      unchanged: false,
    });
    expect(await save({ areas: ["Leeds"], maxRent: "900" })).toEqual({
      ok: true,
      versionNo: 1,
      unchanged: true,
    });
    expect(await save({ areas: ["Leeds"], maxRent: "950" })).toEqual({
      ok: true,
      versionNo: 2,
      unchanged: false,
    });
    expect(await save({ minRent: "2000", maxRent: "1000" })).toMatchObject({
      ok: false,
      error: "invalid_input",
    });
    const applicant = await viewApplicant(applicantId);
    expect(applicant.requirementHistory.map((item) => item.versionNo)).toEqual([
      2, 1,
    ]);
    expect(applicant.requirements?.requirements.maxRentPence).toBe(95000);
    for (const name of ["propertyManagerA", "readOnlyA"] as const) {
      expect(await save({ areas: ["X"] }, name), name).toMatchObject({
        ok: false,
        error: "access_denied",
      });
    }
    await closeApplicant(applicantId);
    expect(await save({ areas: ["Leeds"], maxRent: "999" })).toMatchObject({
      ok: false,
      error: "applicant_closed",
    });
  });

  it("adds and removes household members, never the lead, and keeps the counts", async () => {
    const { applicantId, contactId } = await newApplicant();
    const added = await addApplicantMember({
      ...as("negotiatorA"),
      applicantId,
      contact: person("Kit", "Member", "kit@example.com"),
    });
    if (!added.ok) throw new Error("add failed");
    const member = (await viewApplicant(applicantId)).members[0];
    expect(await openCount(member.contact.id)).toBe(1);
    // The lead is already in the household.
    expect(
      await addApplicantMember({
        ...as("negotiatorA"),
        applicantId,
        contact: { kind: "existing", contactId },
      }),
    ).toMatchObject({ ok: false, error: "invalid_input" });
    // Nor the same member twice.
    expect(
      await addApplicantMember({
        ...as("negotiatorA"),
        applicantId,
        contact: { kind: "existing", contactId: member.contact.id },
      }),
    ).toMatchObject({ ok: false, error: "invalid_input" });
    expect(
      await removeApplicantMember({
        ...as("negotiatorA"),
        applicantId,
        memberId: added.memberId,
      }),
    ).toEqual({ ok: true });
    expect((await viewApplicant(applicantId)).members).toEqual([]);
    expect(await openCount(member.contact.id)).toBe(0);
    expect(
      await removeApplicantMember({
        ...as("negotiatorA"),
        applicantId,
        memberId: added.memberId,
      }),
    ).toMatchObject({ ok: false, error: "member_not_found" });
    expect(
      await addApplicantMember({
        ...as("readOnlyA"),
        applicantId,
        contact: person("No", "Way", "noway@example.com"),
      }),
    ).toMatchObject({ ok: false, error: "access_denied" });
  });
});

describe("an applicant's status", () => {
  it("goes on hold and back, closes only with an agency reason, and only managers reopen", async () => {
    const { applicantId, contactId } = await newApplicant();
    const change = (to: string, name: UserName = "negotiatorA", extra = {}) =>
      changeApplicantStatus({ ...as(name), applicantId, to, ...extra });
    expect(await change("on_hold")).toEqual({ ok: true });
    expect(await change("active")).toEqual({ ok: true });
    // Closing needs a reason from the agency's list.
    expect(await change("closed")).toMatchObject({
      ok: false,
      error: "invalid_input",
      fieldErrors: { reason: "Choose a reason." },
    });
    expect(
      await change("closed", "negotiatorA", {
        reasonId: await applicantReasonId("property_enquiry"),
      }),
    ).toMatchObject({ ok: false, error: "invalid_input" });
    expect(
      await change("closed", "negotiatorA", {
        reasonId: await applicantReasonId("applicant"),
        note: "Found a flat",
      }),
    ).toEqual({ ok: true });
    expect(await openCount(contactId)).toBe(0);
    const closed = await viewApplicant(applicantId);
    expect(closed.status).toBe("closed");
    expect(closed.closure).toMatchObject({ note: "Found a flat" });
    expect(closed.closure?.reason).toBeTruthy();
    // Moves that are not allowed, and a negotiator cannot reopen.
    expect(await change("on_hold", "managerA")).toMatchObject({
      ok: false,
      error: "invalid_state",
    });
    expect(await change("active", "negotiatorA")).toMatchObject({
      ok: false,
      error: "access_denied",
    });
    expect(await change("active", "managerA")).toEqual({ ok: true });
    const reopened = await viewApplicant(applicantId);
    expect(reopened).toMatchObject({ status: "active", closure: null });
    expect(
      reopened.statusHistory.map((item) => `${item.from}>${item.to}`),
    ).toEqual([
      "active>on_hold",
      "on_hold>active",
      "active>closed",
      "closed>active",
    ]);
    expect(await openCount(contactId)).toBe(1);
    expect(await change("nonsense")).toMatchObject({
      ok: false,
      error: "invalid_input",
    });
  });

  it("will not reopen an applicant whose lead now leads another open one", async () => {
    const first = await newApplicant();
    await closeApplicant(first.applicantId);
    expect(
      await createApplicant({
        ...as("negotiatorA"),
        branchId: ids.branchA,
        contact: { kind: "existing", contactId: first.contactId },
      }),
    ).toMatchObject({ ok: true });
    expect(
      await changeApplicantStatus({
        ...as("managerA"),
        applicantId: first.applicantId,
        to: "active",
      }),
    ).toMatchObject({ ok: false, error: "applicant_exists" });
  });

  it("changes the owner only to someone who can work with applicants in the branch", async () => {
    const { applicantId } = await newApplicant();
    const assign = (membershipId: string | null) =>
      assignApplicant({ ...as("negotiatorA"), applicantId, membershipId });
    expect(await assign(memberships.managerA)).toEqual({ ok: true });
    expect((await viewApplicant(applicantId)).owner?.membershipId).toBe(
      memberships.managerA,
    );
    expect(await assign(null)).toEqual({ ok: true });
    for (const name of [
      "negotiatorB",
      "accountsA",
      "propertyManagerA",
    ] as const) {
      expect(await assign(memberships[name]), name).toMatchObject({
        ok: false,
        error: "invalid_input",
      });
    }
  });
});

describe("the agency's reasons", () => {
  it("adds the starter reasons for staff who work with applicants, and only reads for others", async () => {
    // Read Only goes first: it must not write anything.
    expect((await listLettingsReasons(as("readOnlyA")))?.length).toBe(0);
    const reasons = await listLettingsReasons(as("negotiatorA"));
    expect(reasons?.filter((r) => r.appliesTo === "applicant").length).toBe(5);
    expect(
      reasons?.filter((r) => r.appliesTo === "property_enquiry").length,
    ).toBe(5);
    expect(reasons?.every((r) => r.status === "active")).toBe(true);
    expect((await listLettingsReasons(as("readOnlyA")))?.length).toBe(10);
    expect(await listLettingsReasons(as("accountsA"))).toBeNull();
    // Asking again adds nothing.
    expect((await listLettingsReasons(as("managerA")))?.length).toBe(10);
  });
});

describe("managing the agency's reasons", () => {
  it("adds, renames and hides reasons for those who manage the lists, never deletes, and keeps names unique", async () => {
    await listLettingsReasons(as("owner")); // the starter reasons
    const added = await addLettingsReason({
      ...as("owner"),
      kind: "applicant",
      name: "  Moved   abroad ",
    });
    if (!added.ok) throw new Error("add failed");
    expect(
      await addLettingsReason({
        ...as("owner"),
        kind: "applicant",
        name: "moved abroad",
      }),
    ).toMatchObject({ ok: false, fieldErrors: { name: expect.any(String) } });
    // The same name is fine for the other kind.
    expect(
      await addLettingsReason({
        ...as("owner"),
        kind: "property_enquiry",
        name: "Moved abroad",
      }),
    ).toMatchObject({ ok: true });
    expect(
      await updateLettingsReason({
        ...as("owner"),
        reasonId: added.reasonId,
        name: "Moved overseas",
        hidden: true,
        sortOrder: 9,
      }),
    ).toEqual({ ok: true });
    const reasons = await listLettingsReasons(as("owner"));
    expect(reasons?.find((r) => r.id === added.reasonId)).toMatchObject({
      name: "Moved overseas",
      status: "hidden",
      sortOrder: 9,
    });
    // A hidden reason is no longer offered for closing.
    const { applicantId } = await newApplicant();
    expect(
      await changeApplicantStatus({
        ...as("negotiatorA"),
        applicantId,
        to: "closed",
        reasonId: added.reasonId,
      }),
    ).toMatchObject({ ok: false, error: "invalid_input" });
    for (const name of [
      "managerA",
      "negotiatorA",
      "propertyManagerA",
      "readOnlyA",
      "accountsA",
    ] as const) {
      expect(
        await addLettingsReason({
          ...as(name),
          kind: "applicant",
          name: "Nope",
        }),
        name,
      ).toMatchObject({ ok: false, error: "access_denied" });
    }
    expect(
      await updateLettingsReason({
        ...as("owner"),
        reasonId: randomUUID(),
        name: "X",
        hidden: false,
        sortOrder: 0,
      }),
    ).toMatchObject({ ok: false, error: "list_item_not_found" });
    expect(
      await addLettingsReason({
        ...as("owner"),
        kind: "viewing" as never,
        name: "X",
      }),
    ).toMatchObject({ ok: false, error: "invalid_input" });
  });
});

describe("property enquiries", () => {
  it("needs a Ready to advertise listing, and records the household's interest", async () => {
    const { applicantId } = await newApplicant();
    const draft = await prepared();
    expect(
      await registerPropertyEnquiry({
        ...as("negotiatorA"),
        applicantId,
        listingId: draft,
      }),
    ).toMatchObject({ ok: false, error: "listing_not_ready" });
    await asAdmin(
      `UPDATE "listings" SET "state" = 'ready_to_advertise' WHERE "id" = $1::uuid`,
      [draft],
    );
    const result = await registerPropertyEnquiry({
      ...as("negotiatorA"),
      applicantId,
      listingId: draft,
      leadSourceId: ids.source,
    });
    if (!result.ok) throw new Error(`register failed: ${result.error}`);
    const applicant = await viewApplicant(applicantId);
    expect(applicant.enquiries).toHaveLength(1);
    expect(applicant.enquiries[0]).toMatchObject({
      id: result.enquiryId,
      stage: "new",
      notice: null,
      assignee: { membershipId: memberships.negotiatorA },
      listing: { id: draft, state: "ready_to_advertise" },
      property: { id: ids.propertyA },
      branch: { id: ids.branchA },
    });
    // One open enquiry per applicant and home.
    expect(
      await registerPropertyEnquiry({
        ...as("negotiatorA"),
        applicantId,
        listingId: draft,
      }),
    ).toMatchObject({ ok: false, error: "already_enquired" });
    expect(
      await registerPropertyEnquiry({
        ...as("negotiatorA"),
        applicantId,
        listingId: randomUUID(),
      }),
    ).toMatchObject({ ok: false, error: "listing_not_found" });
  });

  it("is for the working roles on an open applicant, and shares the household with the listing's branch", async () => {
    const listingId = await readyListing();
    const { applicantId, contactId } = await newApplicant("owner", {
      members: [person("Kit", "Share", "kit.share@example.com")],
    });
    for (const name of [
      "propertyManagerA",
      "readOnlyA",
      "accountsA",
      "negotiatorB",
    ] as const) {
      expect(
        await registerPropertyEnquiry({ ...as(name), applicantId, listingId }),
        name,
      ).toMatchObject({ ok: false });
    }
    // The listing's instruction moves to Branch B; the owner (workspace-wide)
    // can still record the enquiry, and the household is shared with Branch B.
    await asAdmin(
      `UPDATE "instructions" SET "responsible_branch_id" = $1::uuid
       WHERE "id" = $2::uuid`,
      [ids.branchB, instructionId],
    );
    expect(
      await registerPropertyEnquiry({ ...as("owner"), applicantId, listingId }),
    ).toMatchObject({ ok: true });
    const links = await adminPool.query(
      `SELECT count(DISTINCT "contact_id")::int AS n FROM "contact_branch_links"
       WHERE "branch_id" = $1::uuid AND "ended_at" IS NULL`,
      [ids.branchB],
    );
    expect(links.rows[0].n).toBe(2);
    // Branch B's negotiator now sees the applicant through the enquiry, but
    // cannot change it, and Branch A's negotiator can no longer see the home.
    expect((await viewApplicant(applicantId, "negotiatorB")).can.manage).toBe(
      false,
    );
    expect(
      await registerPropertyEnquiry({
        ...as("negotiatorA"),
        applicantId,
        listingId,
      }),
    ).toMatchObject({ ok: false });
    expect(contactId).toBeTruthy();
  });

  it("refuses a closed applicant", async () => {
    const listingId = await readyListing();
    const { applicantId } = await newApplicant();
    await closeApplicant(applicantId);
    expect(
      await registerPropertyEnquiry({
        ...as("negotiatorA"),
        applicantId,
        listingId,
      }),
    ).toMatchObject({ ok: false, error: "applicant_closed" });
  });

  it("moves one step at a time, closes with a reason, and reopens only while the home is ready", async () => {
    const listingId = await readyListing();
    const { applicantId } = await newApplicant();
    const registered = await registerPropertyEnquiry({
      ...as("negotiatorA"),
      applicantId,
      listingId,
    });
    if (!registered.ok) throw new Error("register failed");
    const enquiryId = registered.enquiryId;
    const move = (to: string, name: UserName = "negotiatorA", extra = {}) =>
      moveEnquiry({ ...as(name), enquiryId, to, ...extra });
    expect(await move("viewed")).toMatchObject({
      ok: false,
      error: "invalid_state",
    });
    expect(await move("contacted")).toEqual({ ok: true });
    expect(await move("new")).toEqual({ ok: true });
    expect(await move("contacted")).toEqual({ ok: true });
    expect(await move("closed")).toMatchObject({
      ok: false,
      error: "invalid_input",
      fieldErrors: { reason: "Choose a reason." },
    });
    expect(
      await move("closed", "negotiatorA", {
        reasonId: await applicantReasonId("applicant"),
      }),
    ).toMatchObject({ ok: false, error: "invalid_input" });
    for (const name of ["propertyManagerA", "readOnlyA"] as const) {
      expect(await move("new", name), name).toMatchObject({ ok: false });
    }
    expect(
      await move("closed", "negotiatorA", {
        reasonId: await applicantReasonId("property_enquiry"),
        note: "Too small",
      }),
    ).toEqual({ ok: true });
    let enquiry = (await viewApplicant(applicantId)).enquiries[0];
    expect(enquiry).toMatchObject({
      stage: "closed",
      closedByListing: false,
      closure: { note: "Too small" },
      notice: null,
    });
    // Reopen while the home is Ready to advertise.
    expect(await move("new")).toEqual({ ok: true });
    expect((await viewApplicant(applicantId)).enquiries[0].stage).toBe("new");
    // Closed again, and the home goes back to preparation: no reopening.
    await move("closed", "negotiatorA", {
      reasonId: await applicantReasonId("property_enquiry"),
    });
    await asAdmin(
      `UPDATE "listings" SET "state" = 'draft' WHERE "id" = $1::uuid`,
      [listingId],
    );
    expect(await move("new")).toMatchObject({
      ok: false,
      error: "listing_not_ready",
    });
    enquiry = (await viewApplicant(applicantId)).enquiries[0];
    expect(enquiry.stage).toBe("closed");
    const history = await adminPool.query(
      `SELECT count(*)::int AS n FROM "property_enquiry_stage_history"
       WHERE "property_enquiry_id" = $1::uuid`,
      [enquiryId],
    );
    expect(history.rows[0].n).toBe(6);
  });

  it("tells staff when the home is back in preparation, and when it is withdrawn", async () => {
    const listingId = await readyListing();
    const { applicantId } = await newApplicant();
    const registered = await registerPropertyEnquiry({
      ...as("negotiatorA"),
      applicantId,
      listingId,
    });
    if (!registered.ok) throw new Error("register failed");
    await asAdmin(
      `UPDATE "listings" SET "state" = 'draft' WHERE "id" = $1::uuid`,
      [listingId],
    );
    expect((await viewApplicant(applicantId)).enquiries[0].notice).toContain(
      "not ready",
    );
    // Back to Ready to advertise, then withdrawn through the real service.
    await asAdmin(
      `UPDATE "listings" SET "state" = 'ready_to_advertise' WHERE "id" = $1::uuid`,
      [listingId],
    );
    expect(
      await withdrawListing({
        ...as("managerA"),
        listingId,
        reason: "Landlord paused letting",
      }),
    ).toEqual({ ok: true });
    const enquiry = (await viewApplicant(applicantId)).enquiries[0];
    expect(enquiry).toMatchObject({
      stage: "closed",
      closedByListing: true,
      closure: { note: "Home no longer available" },
    });
    expect(enquiry.notice).toContain("Tell the applicant");
    // It cannot be reopened, and staff are counted as having someone to tell.
    expect(
      await moveEnquiry({
        ...as("negotiatorA"),
        enquiryId: registered.enquiryId,
        to: "new",
      }),
    ).toMatchObject({ ok: false, error: "listing_not_ready" });
    expect(await getApplicantAttention(as("negotiatorA"))).toMatchObject({
      openEnquiries: 0,
      toBeTold: 1,
    });
  });

  it("lists enquiries by stage, branch and listing, within what the person can see", async () => {
    const listingId = await readyListing();
    const one = await newApplicant();
    const two = await newApplicant();
    for (const applicantId of [one.applicantId, two.applicantId]) {
      await registerPropertyEnquiry({
        ...as("negotiatorA"),
        applicantId,
        listingId,
      });
    }
    const first = (await viewApplicant(one.applicantId)).enquiries[0];
    await moveEnquiry({
      ...as("negotiatorA"),
      enquiryId: first.id,
      to: "contacted",
    });
    expect((await listPropertyEnquiries(as("negotiatorA")))?.total).toBe(2);
    expect(
      (
        await listPropertyEnquiries({
          ...as("negotiatorA"),
          stage: "contacted",
        })
      )?.items.map((item) => item.id),
    ).toEqual([first.id]);
    expect(
      (await listPropertyEnquiries({ ...as("negotiatorA"), listingId }))?.total,
    ).toBe(2);
    expect(
      (
        await listPropertyEnquiries({
          ...as("negotiatorA"),
          applicantId: two.applicantId,
        })
      )?.total,
    ).toBe(1);
    expect((await listPropertyEnquiries(as("negotiatorB")))?.total).toBe(0);
    expect((await listPropertyEnquiries(as("readOnlyA")))?.total).toBe(2);
    expect(await listPropertyEnquiries(as("accountsA"))).toBeNull();
    expect(
      await assignEnquiry({
        ...as("negotiatorA"),
        enquiryId: first.id,
        membershipId: memberships.managerA,
      }),
    ).toEqual({ ok: true });
    expect(
      await assignEnquiry({
        ...as("negotiatorA"),
        enquiryId: first.id,
        membershipId: memberships.accountsA,
      }),
    ).toMatchObject({ ok: false, error: "invalid_input" });
  });
});

describe("matching", () => {
  it("suggests only Ready to advertise homes that fit, and says when no requirements are saved", async () => {
    const listingId = await readyListing();
    const { applicantId } = await newApplicant();
    expect(
      await suggestedListingsForApplicant({
        ...as("negotiatorA"),
        applicantId,
      }),
    ).toEqual({ ok: true, hasRequirements: false, items: [] });

    const save = (
      requirements: Parameters<typeof saveRequirements>[0]["requirements"],
    ) => saveRequirements({ ...as("negotiatorA"), applicantId, requirements });
    await save({ areas: ["London"], minBedrooms: 2, maxRent: "1500" });
    const fits = await suggestedListingsForApplicant({
      ...as("negotiatorA"),
      applicantId,
    });
    if (!fits.ok) throw new Error("suggest failed");
    expect(fits.items.map((item) => item.listing.id)).toEqual([listingId]);
    expect(fits.items[0]).toMatchObject({
      alreadyEnquired: false,
      listing: { rentPence: 145000, bedrooms: 2, propertyType: "flat" },
    });
    for (const requirements of [
      { areas: ["Leeds"] },
      { maxRent: "1000" },
      { minBedrooms: 3 },
      { propertyTypes: ["detached"] },
      { moveBy: "2020-01-01" },
    ]) {
      await save(requirements);
      const result = await suggestedListingsForApplicant({
        ...as("negotiatorA"),
        applicantId,
      });
      if (!result.ok) throw new Error("suggest failed");
      expect(result.items, JSON.stringify(requirements)).toEqual([]);
    }
    // Pets and household size never exclude anyone.
    await save({ areas: ["London"], hasPets: true, householdSize: 9 });
    expect(
      (
        await suggestedListingsForApplicant({
          ...as("negotiatorA"),
          applicantId,
        })
      ).ok && true,
    ).toBe(true);
    const still = await suggestedListingsForApplicant({
      ...as("negotiatorA"),
      applicantId,
    });
    if (!still.ok) throw new Error("suggest failed");
    expect(still.items).toHaveLength(1);
    // A home that is not Ready to advertise is never suggested.
    await asAdmin(
      `UPDATE "listings" SET "state" = 'content_ready' WHERE "id" = $1::uuid`,
      [listingId],
    );
    const hidden = await suggestedListingsForApplicant({
      ...as("negotiatorA"),
      applicantId,
    });
    if (!hidden.ok) throw new Error("suggest failed");
    expect(hidden.items).toEqual([]);
    expect(
      await suggestedListingsForApplicant({
        ...as("negotiatorB"),
        applicantId,
      }),
    ).toEqual({ ok: false, error: "applicant_not_found" });
    expect(
      await suggestedListingsForApplicant({ ...as("accountsA"), applicantId }),
    ).toEqual({ ok: false, error: "access_denied" });
  });

  it("lists the active households that fit a home, in the order they registered, and marks those already enquiring", async () => {
    const listingId = await readyListing();
    const fitting = await newApplicant("negotiatorA", {
      requirements: { areas: ["London"], minBedrooms: 2 },
    });
    await newApplicant("negotiatorA", { requirements: { areas: ["Leeds"] } });
    await newApplicant("negotiatorA"); // no requirements saved
    const closed = await newApplicant("negotiatorA", {
      requirements: { areas: ["London"] },
    });
    await closeApplicant(closed.applicantId);
    const second = await newApplicant("negotiatorA", {
      requirements: { maxRent: "2000" },
    });
    await registerPropertyEnquiry({
      ...as("negotiatorA"),
      applicantId: second.applicantId,
      listingId,
    });
    const result = await matchingApplicantsForListing({
      ...as("negotiatorA"),
      listingId,
    });
    if (!result.ok) throw new Error("matching failed");
    expect(result.listingReady).toBe(true);
    expect(result.items.map((item) => item.applicantId)).toEqual([
      fitting.applicantId,
      second.applicantId,
    ]);
    expect(result.items.map((item) => item.alreadyEnquired)).toEqual([
      false,
      true,
    ]);
    expect(Object.keys(result.items[0]).sort()).toEqual([
      "alreadyEnquired",
      "applicantId",
      "name",
      "owner",
      "reference",
      "registeredAt",
    ]);
    expect(
      await matchingApplicantsForListing({ ...as("accountsA"), listingId }),
    ).toEqual({ ok: false, error: "access_denied" });
    expect(
      await matchingApplicantsForListing({
        ...as("negotiatorA"),
        listingId: randomUUID(),
      }),
    ).toEqual({ ok: false, error: "listing_not_found" });
    // Another branch sees no applicants to match.
    const other = await matchingApplicantsForListing({
      ...as("negotiatorB"),
      listingId,
    });
    expect(other.ok ? other.items : []).toEqual([]);
  });
});

describe("next actions for applicants and enquiries", () => {
  it("links an action to an applicant and an enquiry, in the applicant's branch, and shows it", async () => {
    const listingId = await readyListing();
    const { applicantId } = await newApplicant();
    const registered = await registerPropertyEnquiry({
      ...as("negotiatorA"),
      applicantId,
      listingId,
    });
    if (!registered.ok) throw new Error("register failed");
    expect(
      await addWorkItem({
        ...as("negotiatorA"),
        title: "Call about a viewing",
        dueOn: "2099-01-01",
        assignedMembershipId: memberships.negotiatorA,
        applicantId,
        propertyEnquiryId: registered.enquiryId,
      }),
    ).toMatchObject({ ok: true, source: "action" });
    const items = await listWorkItems({ ...as("negotiatorA") });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: "Call about a viewing",
      branchId: ids.branchA,
      propertyEnquiryId: registered.enquiryId,
      applicant: { id: applicantId },
    });
    expect(items[0].applicant?.name).toContain("Seeker");
    const applicant = await viewApplicant(applicantId);
    expect(applicant.nextAction).toMatchObject({
      title: "Call about a viewing",
    });
    expect(
      (await listApplicants({ ...as("negotiatorA"), noNextAction: true }))
        ?.total,
    ).toBe(0);
    expect(await getApplicantAttention(as("negotiatorA"))).toMatchObject({
      activeApplicants: 1,
      openEnquiries: 1,
      noNextAction: 0,
    });
    // An enquiry's action must name its applicant, and cannot name another's.
    const other = await newApplicant();
    for (const extra of [
      { propertyEnquiryId: registered.enquiryId },
      {
        applicantId: other.applicantId,
        propertyEnquiryId: registered.enquiryId,
      },
    ]) {
      expect(
        await addWorkItem({
          ...as("negotiatorA"),
          title: "Wrong link",
          dueOn: "2099-01-01",
          assignedMembershipId: memberships.negotiatorA,
          ...extra,
        }),
      ).toMatchObject({ ok: false });
    }
    // A lead's next action cannot name an applicant.
    expect(
      await addWorkItem({
        ...as("negotiatorA"),
        title: "Mixed",
        dueOn: "2099-01-01",
        assignedMembershipId: memberships.negotiatorA,
        enquiryId: ids.lead,
        applicantId,
      }),
    ).toMatchObject({ ok: false });
  });

  it("counts what needs attention, for readers only", async () => {
    await newApplicant();
    expect(await getApplicantAttention(as("readOnlyA"))).toEqual({
      activeApplicants: 1,
      openEnquiries: 0,
      noNextAction: 1,
      toBeTold: 0,
    });
    expect(await getApplicantAttention(as("accountsA"))).toBeNull();
    expect(await getApplicantAttention(as("negotiatorB"))).toEqual({
      activeApplicants: 0,
      openEnquiries: 0,
      noNextAction: 0,
      toBeTold: 0,
    });
  });
});

describe("what is audited", () => {
  it("records applicant work with ids only, and refusals as denied", async () => {
    const { applicantId } = await newApplicant();
    await createApplicant({
      ...as("readOnlyA"),
      branchId: ids.branchA,
      contact: person("Deny", "Me", "deny.me@example.com"),
    });
    const { rows } = await adminPool.query(
      `SELECT "action", "outcome"::text AS "outcome", "target_type", "target_id"::text AS "target_id",
         "metadata"::text AS "metadata"
       FROM "audit_events" WHERE "action" LIKE 'applicant.%'
       ORDER BY "created_at"`,
    );
    expect(rows.map((row) => `${row.action}:${row.outcome}`)).toEqual(
      expect.arrayContaining([
        "applicant.create:succeeded",
        "applicant.create:denied",
      ]),
    );
    const text = JSON.stringify(rows);
    expect(text).toContain(applicantId);
    // No names, emails or telephone numbers reach the audit trail.
    expect(text).not.toMatch(/Seeker|@example\.com|07700/);
  });
});
