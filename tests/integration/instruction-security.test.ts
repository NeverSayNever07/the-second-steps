import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

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

const runtimePool = new Pool({ connectionString: runtimeUrl, ssl: false });
const adminPool = new Pool({ connectionString: adminUrl, ssl: false });

const ids = {
  workspaceA: randomUUID(),
  workspaceB: randomUUID(),
  branchA1: randomUUID(),
  branchA2: randomUUID(),
  branchB: randomUUID(),
  ownerA: randomUUID(),
  managerA1: randomUUID(),
  negotiatorA1: randomUUID(),
  negotiatorA2: randomUUID(),
  managerA2: randomUUID(),
  propertyManagerA1: randomUUID(),
  adminA: randomUUID(),
  readOnlyA1: randomUUID(),
  accountsA1: randomUUID(),
  suspendedA1: randomUUID(),
  ownerB: randomUUID(),
  personA1: randomUUID(),
  personA1b: randomUUID(),
  spareA1: randomUUID(),
  personA2: randomUUID(),
  archivedA1: randomUUID(),
  personB: randomUUID(),
  propertyA1: randomUUID(),
  propertyA1b: randomUUID(),
  propertyA2: randomUUID(),
  propertyB: randomUUID(),
  sourceA: randomUUID(),
  sourceB: randomUUID(),
  // Appraisal completed, for property A1.
  enquiryA1: randomUUID(),
  // A second completed lead for the same property.
  enquiryA1b: randomUUID(),
  // Appraisal completed, for property A1b (its only lead).
  enquiryA1c: randomUUID(),
  // Still a new lead, for property A1.
  enquiryNewA1: randomUUID(),
  enquiryA2: randomUUID(),
  enquiryB: randomUUID(),
  appraisalA1: randomUUID(),
  appraisalA1b: randomUUID(),
};

type Actor = {
  workspaceId: string;
  membershipId: string;
  scope: "workspace" | "named_branches";
  branchIds?: readonly string[];
};

const a1 = (membershipId: string): Actor => ({
  workspaceId: ids.workspaceA,
  membershipId,
  scope: "named_branches",
  branchIds: [ids.branchA1],
});

const actors = {
  ownerA: {
    workspaceId: ids.workspaceA,
    membershipId: ids.ownerA,
    scope: "workspace",
  },
  managerA1: a1(ids.managerA1),
  negotiatorA1: a1(ids.negotiatorA1),
  negotiatorA2: {
    workspaceId: ids.workspaceA,
    membershipId: ids.negotiatorA2,
    scope: "named_branches",
    branchIds: [ids.branchA2],
  },
  managerA2: {
    workspaceId: ids.workspaceA,
    membershipId: ids.managerA2,
    scope: "named_branches",
    branchIds: [ids.branchA2],
  },
  propertyManagerA1: a1(ids.propertyManagerA1),
  adminA: {
    workspaceId: ids.workspaceA,
    membershipId: ids.adminA,
    scope: "workspace",
  },
  readOnlyA1: a1(ids.readOnlyA1),
  accountsA1: a1(ids.accountsA1),
  suspendedA1: a1(ids.suspendedA1),
  ownerB: {
    workspaceId: ids.workspaceB,
    membershipId: ids.ownerB,
    scope: "workspace",
  },
} satisfies Record<string, Actor>;

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function reference() {
  let suffix = "";
  for (let i = 0; i < 8; i += 1) {
    suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `INS-${suffix}`;
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
       VALUES
        ($1::uuid, 'instructions-a', 'Instructions A', 'agency', CURRENT_TIMESTAMP),
        ($2::uuid, 'instructions-b', 'Instructions B', 'agency', CURRENT_TIMESTAMP)`,
      [ids.workspaceA, ids.workspaceB],
    );
    await client.query(
      `INSERT INTO "branches" ("id", "workspace_id", "name", "updated_at")
       VALUES
        ($1::uuid, $4::uuid, 'A One', CURRENT_TIMESTAMP),
        ($2::uuid, $4::uuid, 'A Two', CURRENT_TIMESTAMP),
        ($3::uuid, $5::uuid, 'B One', CURRENT_TIMESTAMP)`,
      [ids.branchA1, ids.branchA2, ids.branchB, ids.workspaceA, ids.workspaceB],
    );
    const memberships: [string, string, string, string[] | null, string][] = [
      [ids.ownerA, ids.workspaceA, "workspace_owner", null, "active"],
      [
        ids.managerA1,
        ids.workspaceA,
        "branch_manager",
        [ids.branchA1],
        "active",
      ],
      [
        ids.negotiatorA1,
        ids.workspaceA,
        "negotiator",
        [ids.branchA1],
        "active",
      ],
      [
        ids.negotiatorA2,
        ids.workspaceA,
        "negotiator",
        [ids.branchA2],
        "active",
      ],
      [
        ids.managerA2,
        ids.workspaceA,
        "branch_manager",
        [ids.branchA2],
        "active",
      ],
      [
        ids.propertyManagerA1,
        ids.workspaceA,
        "property_manager",
        [ids.branchA1],
        "active",
      ],
      [ids.adminA, ids.workspaceA, "agency_admin", null, "active"],
      [ids.readOnlyA1, ids.workspaceA, "read_only", [ids.branchA1], "active"],
      [ids.accountsA1, ids.workspaceA, "accounts", [ids.branchA1], "active"],
      [
        ids.suspendedA1,
        ids.workspaceA,
        "negotiator",
        [ids.branchA1],
        "suspended",
      ],
      [ids.ownerB, ids.workspaceB, "workspace_owner", null, "active"],
    ];
    for (const [id, workspaceId, role, branches, status] of memberships) {
      const identityId = randomUUID();
      await client.query(
        `INSERT INTO "user_identities" ("id", "updated_at")
         VALUES ($1::uuid, CURRENT_TIMESTAMP)`,
        [identityId],
      );
      await client.query(
        `INSERT INTO "memberships" ("id", "workspace_id", "user_identity_id",
          "scope_mode", "status", "updated_at")
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::membership_scope_mode,
           $5::membership_status, CURRENT_TIMESTAMP)`,
        [
          id,
          workspaceId,
          identityId,
          branches ? "named_branches" : "workspace",
          status,
        ],
      );
      await client.query(
        `INSERT INTO "membership_roles"
          ("workspace_id", "membership_id", "role_code")
         VALUES ($1::uuid, $2::uuid, $3::membership_role_code)`,
        [workspaceId, id, role],
      );
      for (const branchId of branches ?? []) {
        await client.query(
          `INSERT INTO "membership_branch_access"
            ("workspace_id", "membership_id", "branch_id")
           VALUES ($1::uuid, $2::uuid, $3::uuid)`,
          [workspaceId, id, branchId],
        );
      }
    }
    for (const [contactId, workspaceId, branchId, creator, ref, archived] of [
      [
        ids.personA1,
        ids.workspaceA,
        ids.branchA1,
        ids.managerA1,
        "PER-JN111111",
        false,
      ],
      [
        ids.personA1b,
        ids.workspaceA,
        ids.branchA1,
        ids.managerA1,
        "PER-JN222222",
        false,
      ],
      [
        ids.spareA1,
        ids.workspaceA,
        ids.branchA1,
        ids.managerA1,
        "PER-JN333333",
        false,
      ],
      [
        ids.personA2,
        ids.workspaceA,
        ids.branchA2,
        ids.negotiatorA2,
        "PER-JN444444",
        false,
      ],
      [
        ids.archivedA1,
        ids.workspaceA,
        ids.branchA1,
        ids.managerA1,
        "PER-JN555555",
        true,
      ],
      [
        ids.personB,
        ids.workspaceB,
        ids.branchB,
        ids.ownerB,
        "PER-JN666666",
        false,
      ],
    ] as const) {
      await client.query(
        `INSERT INTO "contacts" ("id", "workspace_id", "kind", "reference",
          "first_name", "last_name", "status", "archived_at",
          "created_by_membership_id", "updated_at")
         VALUES ($1::uuid, $2::uuid, 'person', $3, 'Alex', 'Example',
           $4::contact_status, $5, $6::uuid, CURRENT_TIMESTAMP)`,
        [
          contactId,
          workspaceId,
          ref,
          archived ? "archived" : "active",
          archived ? new Date() : null,
          creator,
        ],
      );
      await client.query(
        `INSERT INTO "contact_branch_links" ("workspace_id", "contact_id",
          "branch_id", "is_primary", "created_by_membership_id", "updated_at")
         VALUES ($1::uuid, $2::uuid, $3::uuid, true, $4::uuid,
           CURRENT_TIMESTAMP)`,
        [workspaceId, contactId, branchId, creator],
      );
    }
    for (const [propertyId, workspaceId, branchId, ref, creator] of [
      [
        ids.propertyA1,
        ids.workspaceA,
        ids.branchA1,
        "PRP-JNAA2222",
        ids.managerA1,
      ],
      [
        ids.propertyA1b,
        ids.workspaceA,
        ids.branchA1,
        "PRP-JNBB2222",
        ids.managerA1,
      ],
      [
        ids.propertyA2,
        ids.workspaceA,
        ids.branchA2,
        "PRP-JNCC2222",
        ids.negotiatorA2,
      ],
      [ids.propertyB, ids.workspaceB, ids.branchB, "PRP-JNDD2222", ids.ownerB],
    ]) {
      await client.query(
        `INSERT INTO "properties" ("id", "workspace_id", "reference",
          "responsible_branch_id", "address_street", "town_city", "postcode",
          "normalized_address_key", "property_type",
          "created_by_membership_id", "updated_at")
         VALUES ($1::uuid, $2::uuid, $3, $4::uuid, '1 Test Street', 'London',
           'SW1A 1AA', $3, 'flat', $5::uuid, CURRENT_TIMESTAMP)`,
        [propertyId, workspaceId, ref, branchId, creator],
      );
    }
    await client.query(
      `INSERT INTO "lead_sources" ("id", "workspace_id", "name", "updated_at")
       VALUES ($1::uuid, $2::uuid, 'Rightmove', CURRENT_TIMESTAMP),
              ($3::uuid, $4::uuid, 'Rightmove', CURRENT_TIMESTAMP)`,
      [ids.sourceA, ids.workspaceA, ids.sourceB, ids.workspaceB],
    );
    for (const [
      id,
      workspaceId,
      branchId,
      ref,
      stage,
      contactId,
      propertyId,
      sourceId,
      creator,
    ] of [
      [
        ids.enquiryA1,
        ids.workspaceA,
        ids.branchA1,
        "ENQ-JNAA2222",
        "appraisal_completed",
        ids.personA1,
        ids.propertyA1,
        ids.sourceA,
        ids.managerA1,
      ],
      [
        ids.enquiryA1b,
        ids.workspaceA,
        ids.branchA1,
        "ENQ-JNBB2222",
        "appraisal_completed",
        ids.personA1b,
        ids.propertyA1,
        ids.sourceA,
        ids.managerA1,
      ],
      [
        ids.enquiryA1c,
        ids.workspaceA,
        ids.branchA1,
        "ENQ-JNCC2222",
        "appraisal_completed",
        ids.personA1,
        ids.propertyA1b,
        ids.sourceA,
        ids.managerA1,
      ],
      [
        ids.enquiryNewA1,
        ids.workspaceA,
        ids.branchA1,
        "ENQ-JNDD2222",
        "new_enquiry",
        null,
        ids.propertyA1,
        null,
        ids.managerA1,
      ],
      [
        ids.enquiryA2,
        ids.workspaceA,
        ids.branchA2,
        "ENQ-JNEE2222",
        "appraisal_completed",
        ids.personA2,
        ids.propertyA2,
        ids.sourceA,
        ids.negotiatorA2,
      ],
      [
        ids.enquiryB,
        ids.workspaceB,
        ids.branchB,
        "ENQ-JNFF2222",
        "appraisal_completed",
        ids.personB,
        ids.propertyB,
        ids.sourceB,
        ids.ownerB,
      ],
    ] as const) {
      // The open-lead counts are kept within the current workspace.
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [
        workspaceId,
      ]);
      await client.query(
        `INSERT INTO "landlord_enquiries" ("id", "workspace_id", "reference",
          "responsible_branch_id", "stage", "enquirer_name",
          "enquirer_telephone", "postcode", "contact_id", "property_id",
          "lead_source_id", "created_by_membership_id", "updated_at")
         VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5::enquiry_stage, 'Pat',
           '07700 900111', 'SW1A 1AA', $6::uuid, $7::uuid, $8::uuid,
           $9::uuid, CURRENT_TIMESTAMP)`,
        [
          id,
          workspaceId,
          ref,
          branchId,
          stage,
          contactId,
          propertyId,
          sourceId,
          creator,
        ],
      );
    }
    for (const [id, enquiryId] of [
      [ids.appraisalA1, ids.enquiryA1],
      [ids.appraisalA1b, ids.enquiryA1b],
    ]) {
      await client.query(
        `INSERT INTO "appraisals" ("id", "workspace_id", "enquiry_id",
          "scheduled_at", "assigned_membership_id", "status", "completed_at",
          "created_by_membership_id", "updated_at")
         VALUES ($1::uuid, $2::uuid, $3::uuid,
           CURRENT_TIMESTAMP - interval '1 day', $4::uuid, 'completed',
           CURRENT_TIMESTAMP, $4::uuid, CURRENT_TIMESTAMP)`,
        [id, ids.workspaceA, enquiryId, ids.managerA1],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function setContext(client: PoolClient, actor: Actor) {
  await client.query(
    `SELECT set_config('app.workspace_id', $1, true),
            set_config('app.membership_id', $2, true),
            set_config('app.membership_scope_mode', $3, true),
            set_config('app.allowed_branch_ids', $4, true)`,
    [
      actor.workspaceId,
      actor.membershipId,
      actor.scope,
      `{${(actor.branchIds ?? []).join(",")}}`,
    ],
  );
}

// Runs as the runtime role in a transaction that is always rolled back.
async function asActor(
  actor: Actor,
  callback: (client: PoolClient) => Promise<void>,
) {
  const client = await runtimePool.connect();
  try {
    await client.query("BEGIN");
    await setContext(client, actor);
    await callback(client);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

// Runs as the runtime role and commits, for set-up that later steps build on
// (each instruction record is limited to one per transaction).
async function committed<T>(
  actor: Actor,
  callback: (client: PoolClient) => Promise<T>,
) {
  const client = await runtimePool.connect();
  try {
    await client.query("BEGIN");
    await setContext(client, actor);
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

/** Runs the checks that otherwise wait for commit. */
async function checkNow(client: PoolClient) {
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  await client.query("SET CONSTRAINTS ALL DEFERRED");
}

async function refused(
  client: PoolClient,
  codes: string | readonly string[],
  callback: () => Promise<unknown>,
) {
  const allowed = typeof codes === "string" ? [codes] : codes;
  await client.query("SAVEPOINT attempt");
  const error = await callback().then(
    () => null,
    (caught: unknown) => caught as { code?: string },
  );
  await client.query("ROLLBACK TO SAVEPOINT attempt");
  await client.query("SET CONSTRAINTS ALL DEFERRED");
  expect(error, "expected the database to refuse").not.toBeNull();
  expect(allowed).toContain(error?.code);
}

async function markLeadWon(
  client: PoolClient,
  actor: Actor,
  enquiryId: string,
) {
  await client.query(
    `INSERT INTO "enquiry_stage_history" ("workspace_id", "enquiry_id",
      "from_stage", "to_stage", "changed_by_membership_id")
     VALUES ($1::uuid, $2::uuid, 'appraisal_completed', 'won', $3::uuid)`,
    [actor.workspaceId, enquiryId, actor.membershipId],
  );
  await client.query(
    `UPDATE "landlord_enquiries" SET "stage" = 'won', "updated_at" = now()
     WHERE "id" = $1::uuid`,
    [enquiryId],
  );
}

async function insertInstruction(
  client: PoolClient,
  actor: Actor,
  input: {
    enquiryId?: string;
    propertyId?: string;
    branchId?: string;
    appraisalId?: string | null;
    lead?: string | null;
    creator?: string;
    workspaceId?: string;
  } = {},
) {
  const result = await client.query<{ id: string }>(
    `INSERT INTO "instructions" ("workspace_id", "reference", "property_id",
      "enquiry_id", "appraisal_id", "responsible_branch_id",
      "lead_membership_id", "instructed_on", "created_by_membership_id",
      "updated_at")
     VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid,
       public.uk_today(), $8::uuid, CURRENT_TIMESTAMP)
     RETURNING "id"`,
    [
      input.workspaceId ?? actor.workspaceId,
      reference(),
      input.propertyId ?? ids.propertyA1,
      input.enquiryId ?? ids.enquiryA1,
      input.appraisalId ?? null,
      input.branchId ?? ids.branchA1,
      input.lead ?? null,
      input.creator ?? actor.membershipId,
    ],
  );
  return result.rows[0].id;
}

function addParty(
  client: PoolClient,
  actor: Actor,
  instructionId: string,
  contactId: string,
  main = false,
) {
  return client.query<{ id: string }>(
    `INSERT INTO "instruction_parties" ("workspace_id", "instruction_id",
      "contact_id", "is_main_contact", "added_by_membership_id", "updated_at")
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, CURRENT_TIMESTAMP)
     RETURNING "id"`,
    [actor.workspaceId, instructionId, contactId, main, actor.membershipId],
  );
}

type Terms = {
  rent?: number | null;
  feeKind?: "percentage" | "fixed" | null;
  feeValue?: number | null;
  feeFrequency?: string | null;
  depositOffering?: string | null;
  deposit?: number | null;
  reason?: string | null;
};

const COMPLETE_TERMS: Terms = {
  rent: 150000,
  feeKind: "percentage",
  feeValue: 1200,
  depositOffering: "standard",
  deposit: 173000,
};

function addTerms(
  client: PoolClient,
  actor: Actor,
  instructionId: string,
  terms: Terms = {},
) {
  const feeKind = terms.feeKind ?? null;
  return client.query<{ id: string }>(
    `INSERT INTO "instruction_terms_versions" ("workspace_id",
      "instruction_id", "service", "asking_rent_pence", "rent_period",
      "fee_kind", "fee_value", "fee_frequency", "fee_vat",
      "deposit_offering", "deposit_pence", "change_reason",
      "created_by_membership_id")
     VALUES ($1::uuid, $2::uuid, 'fully_managed', $3,
       CASE WHEN $3::integer IS NULL THEN NULL ELSE 'month'::rent_period END,
       $4::fee_kind, $5, $6::fee_frequency,
       CASE WHEN $4::fee_kind IS NULL THEN NULL ELSE 'exclusive'::fee_vat_treatment END,
       $7::deposit_offering, $8, $9, $10::uuid)
     RETURNING "id"`,
    [
      actor.workspaceId,
      instructionId,
      terms.rent ?? null,
      feeKind,
      terms.feeValue ?? null,
      terms.feeFrequency ?? null,
      terms.depositOffering ?? null,
      terms.deposit ?? null,
      terms.reason ?? null,
      actor.membershipId,
    ],
  );
}

/** The whole reviewed handover: lead won, instruction, main landlord, terms. */
async function handover(
  client: PoolClient,
  actor: Actor,
  input: {
    enquiryId?: string;
    propertyId?: string;
    contactId?: string;
    lead?: string | null;
  } = {},
) {
  const enquiryId = input.enquiryId ?? ids.enquiryA1;
  await markLeadWon(client, actor, enquiryId);
  const id = await insertInstruction(client, actor, {
    enquiryId,
    propertyId: input.propertyId ?? ids.propertyA1,
    lead: input.lead,
  });
  await addParty(client, actor, id, input.contactId ?? ids.personA1, true);
  await addTerms(client, actor, id);
  await checkNow(client);
  return id;
}

/** Everything Ready to market needs, saved together. */
async function completeChecklist(
  client: PoolClient,
  actor: Actor,
  instructionId: string,
) {
  await client.query(
    `UPDATE "instructions" SET "lead_membership_id" = $2::uuid,
       "updated_at" = now()
     WHERE "id" = $1::uuid`,
    [instructionId, ids.negotiatorA1],
  );
  await addTerms(client, actor, instructionId, {
    ...COMPLETE_TERMS,
    reason: "Agreed with the landlord",
  });
  await client.query(
    `INSERT INTO "instruction_agreement_events" ("workspace_id",
      "instruction_id", "to_status", "signed_on", "recorded_by_membership_id")
     VALUES ($1::uuid, $2::uuid, 'signed', public.uk_today(), $3::uuid)`,
    [actor.workspaceId, instructionId, actor.membershipId],
  );
  await client.query(
    `INSERT INTO "instruction_ownership_checks" ("workspace_id",
      "instruction_id", "status", "checked_on", "method",
      "recorded_by_membership_id")
     VALUES ($1::uuid, $2::uuid, 'verified', public.uk_today(),
       'Land Registry title checked', $3::uuid)`,
    [actor.workspaceId, instructionId, actor.membershipId],
  );
}

async function moveJourney(
  client: PoolClient,
  actor: Actor,
  instructionId: string,
  from: string,
  to: string,
  reason: string | null = null,
) {
  await client.query(
    `INSERT INTO "instruction_journey_history" ("workspace_id",
      "instruction_id", "from_stage", "to_stage", "reason",
      "changed_by_membership_id")
     VALUES ($1::uuid, $2::uuid, $3::instruction_journey_stage,
       $4::instruction_journey_stage, $5, $6::uuid)`,
    [actor.workspaceId, instructionId, from, to, reason, actor.membershipId],
  );
  await client.query(
    `UPDATE "instructions"
     SET "journey_stage" = $2::instruction_journey_stage, "updated_at" = now()
     WHERE "id" = $1::uuid`,
    [instructionId, to],
  );
}

async function endInstruction(
  client: PoolClient,
  actor: Actor,
  instructionId: string,
  from = "onboarding",
  endedOn = "public.uk_today()",
) {
  await client.query(
    `INSERT INTO "instruction_journey_history" ("workspace_id",
      "instruction_id", "from_stage", "to_stage", "reason",
      "changed_by_membership_id")
     VALUES ($1::uuid, $2::uuid, $3::instruction_journey_stage, 'withdrawn',
       'Landlord is selling', $4::uuid)`,
    [actor.workspaceId, instructionId, from, actor.membershipId],
  );
  await client.query(
    `UPDATE "instructions"
     SET "ended_on" = ${endedOn}, "ended_reason" = 'Landlord is selling',
       "journey_stage" = 'withdrawn', "updated_at" = now()
     WHERE "id" = $1::uuid`,
    [instructionId],
  );
}

async function count(client: PoolClient, sql: string, params: unknown[] = []) {
  const result = await client.query<{ n: number }>(
    `SELECT (${sql})::integer AS "n"`,
    params,
  );
  return result.rows[0].n;
}

beforeEach(seed);

afterAll(async () => {
  await runtimePool.end();
  await adminPool.end();
});

describe("instruction visibility", () => {
  it("shows nothing without a verified workspace context", async () => {
    await committed(actors.negotiatorA1, (client) =>
      handover(client, actors.negotiatorA1),
    );
    for (const table of [
      "instructions",
      "instruction_parties",
      "instruction_terms_versions",
    ]) {
      const result = await runtimePool.query(`SELECT "id" FROM "${table}"`);
      expect(result.rows).toHaveLength(0);
    }
  });

  it("keeps each agency's and branch's instructions to itself, and every role in the branch can see them", async () => {
    await committed(actors.negotiatorA1, (client) =>
      handover(client, actors.negotiatorA1),
    );
    for (const [actor, expected] of [
      [actors.ownerA, 1],
      [actors.readOnlyA1, 1],
      [actors.accountsA1, 1],
      [actors.negotiatorA2, 0],
      [actors.ownerB, 0],
    ] as const) {
      await asActor(actor, async (client) => {
        expect(await count(client, `SELECT count(*) FROM "instructions"`)).toBe(
          expected,
        );
        expect(
          await count(client, `SELECT count(*) FROM "instruction_parties"`),
        ).toBe(expected);
        expect(
          await count(
            client,
            `SELECT count(*) FROM "instruction_terms_versions"`,
          ),
        ).toBe(expected);
      });
    }
  });
});

describe("starting an instruction", () => {
  it("hands a won lead over to one instruction and counts it on the property and landlord", async () => {
    await asActor(actors.negotiatorA1, async (client) => {
      await handover(client, actors.negotiatorA1);
      expect(
        await count(
          client,
          `SELECT "current_instruction_count" FROM "properties" WHERE "id" = $1::uuid`,
          [ids.propertyA1],
        ),
      ).toBe(1);
      expect(
        await count(
          client,
          `SELECT "current_instruction_party_count" FROM "contacts" WHERE "id" = $1::uuid`,
          [ids.personA1],
        ),
      ).toBe(1);
    });
  });

  it("refuses other agencies, other branches, Read Only, Accounts and suspended members", async () => {
    for (const actor of [
      actors.ownerB,
      actors.negotiatorA2,
      actors.readOnlyA1,
      actors.accountsA1,
      actors.suspendedA1,
    ]) {
      await asActor(actor, async (client) => {
        await refused(client, "42501", () =>
          insertInstruction(client, actor, { workspaceId: ids.workspaceA }),
        );
      });
    }
  });

  it("only starts from a lead with a completed appraisal for the same property, in the property's branch", async () => {
    await asActor(actors.ownerA, async (client) => {
      await refused(client, "42501", () =>
        insertInstruction(client, actors.ownerA, {
          enquiryId: ids.enquiryNewA1,
        }),
      );
      await refused(client, "42501", () =>
        insertInstruction(client, actors.ownerA, {
          enquiryId: ids.enquiryA1,
          propertyId: ids.propertyA1b,
        }),
      );
      await refused(client, "42501", () =>
        insertInstruction(client, actors.ownerA, { branchId: ids.branchA2 }),
      );
      // The appraisal must belong to the same lead.
      await refused(client, "23514", () =>
        insertInstruction(client, actors.ownerA, {
          appraisalId: ids.appraisalA1b,
        }),
      );
    });
  });

  it("needs the lead won with it, and a lead is won only with its instruction", async () => {
    await asActor(actors.negotiatorA1, async (client) => {
      await refused(client, "23514", async () => {
        await markLeadWon(client, actors.negotiatorA1, ids.enquiryA1);
        await checkNow(client);
      });
      await refused(client, "23514", async () => {
        const id = await insertInstruction(client, actors.negotiatorA1);
        await addParty(client, actors.negotiatorA1, id, ids.personA1, true);
        await addTerms(client, actors.negotiatorA1, id);
        await checkNow(client);
      });
    });
  });

  it("needs a main landlord contact and terms", async () => {
    await asActor(actors.negotiatorA1, async (client) => {
      await refused(client, "23514", async () => {
        await markLeadWon(client, actors.negotiatorA1, ids.enquiryA1);
        const id = await insertInstruction(client, actors.negotiatorA1);
        await addParty(client, actors.negotiatorA1, id, ids.personA1, false);
        await addTerms(client, actors.negotiatorA1, id);
        await checkNow(client);
      });
      await refused(client, "23514", async () => {
        await markLeadWon(client, actors.negotiatorA1, ids.enquiryA1);
        const id = await insertInstruction(client, actors.negotiatorA1);
        await addParty(client, actors.negotiatorA1, id, ids.personA1, true);
        await checkNow(client);
      });
    });
  });

  it("allows one current instruction per property, even when two people try at once", async () => {
    const first = await runtimePool.connect();
    const second = await runtimePool.connect();
    try {
      await first.query("BEGIN");
      await second.query("BEGIN");
      await setContext(first, actors.ownerA);
      await setContext(second, actors.managerA1);
      await handover(first, actors.ownerA);
      const attempt = handover(second, actors.managerA1, {
        enquiryId: ids.enquiryA1b,
        contactId: ids.personA1b,
      }).then(
        () => null,
        (error: { code?: string }) => error,
      );
      // Give the second attempt time to reach the index and wait on it.
      await new Promise((resolve) => setTimeout(resolve, 300));
      await first.query("COMMIT");
      const error = await attempt;
      expect(error?.code).toBe("23505");
    } finally {
      await first.query("ROLLBACK").catch(() => undefined);
      await second.query("ROLLBACK").catch(() => undefined);
      first.release();
      second.release();
    }
  });

  it("allows a new instruction once the current one has ended", async () => {
    const id = await committed(actors.negotiatorA1, (client) =>
      handover(client, actors.negotiatorA1),
    );
    await asActor(actors.negotiatorA1, async (client) => {
      await refused(client, "23505", () =>
        handover(client, actors.negotiatorA1, {
          enquiryId: ids.enquiryA1b,
          contactId: ids.personA1b,
        }),
      );
      await endInstruction(client, actors.negotiatorA1, id);
      await handover(client, actors.negotiatorA1, {
        enquiryId: ids.enquiryA1b,
        contactId: ids.personA1b,
      });
    });
  });

  it("only takes a lead staff member who can work in the branch", async () => {
    await asActor(actors.ownerA, async (client) => {
      for (const lead of [ids.negotiatorA2, ids.readOnlyA1, ids.suspendedA1]) {
        await refused(client, "23514", () =>
          insertInstruction(client, actors.ownerA, { lead }),
        );
      }
    });
  });
});

describe("changing an instruction", () => {
  it("keeps identity, property, lead, branch and date fixed, and history uneditable", async () => {
    const id = await committed(actors.negotiatorA1, (client) =>
      handover(client, actors.negotiatorA1),
    );
    await asActor(actors.ownerA, async (client) => {
      for (const change of [
        `"property_id" = '${ids.propertyA1b}'`,
        `"responsible_branch_id" = '${ids.branchA2}'`,
        `"instructed_on" = "instructed_on" - 1`,
        `"reference" = 'INS-22222222'`,
      ]) {
        await refused(client, "23514", () =>
          client.query(
            `UPDATE "instructions" SET ${change} WHERE "id" = $1::uuid`,
            [id],
          ),
        );
      }
      for (const table of [
        "instruction_terms_versions",
        "instruction_journey_history",
        "instruction_agreement_events",
        "instruction_ownership_checks",
        "instruction_exceptions",
        "instruction_terms_charges",
      ]) {
        await refused(client, "42501", () =>
          client.query(`UPDATE "${table}" SET "created_at" = now()`),
        );
      }
      for (const table of [
        "instructions",
        "instruction_parties",
        "instruction_terms_versions",
      ]) {
        await refused(client, "42501", () =>
          client.query(`DELETE FROM "${table}"`),
        );
      }
      await refused(client, "23514", () =>
        client.query(
          `UPDATE "properties" SET "current_instruction_count" = 0
           WHERE "id" = $1::uuid`,
          [ids.propertyA1],
        ),
      );
    });
  });

  it("refuses changes by other branches, Read Only and Accounts", async () => {
    const id = await committed(actors.negotiatorA1, (client) =>
      handover(client, actors.negotiatorA1),
    );
    for (const actor of [
      actors.negotiatorA2,
      actors.readOnlyA1,
      actors.accountsA1,
    ]) {
      await asActor(actor, async (client) => {
        const update = await client.query(
          `UPDATE "instructions" SET "lead_membership_id" = $2::uuid
           WHERE "id" = $1::uuid`,
          [id, ids.negotiatorA1],
        );
        expect(update.rowCount).toBe(0);
        await refused(client, "42501", () =>
          addTerms(client, actor, id, { reason: "Changed" }),
        );
        await refused(client, "42501", () =>
          addParty(client, actor, id, ids.spareA1),
        );
      });
    }
  });

  it("keeps whole terms versions with a reason for every change", async () => {
    const id = await committed(actors.negotiatorA1, (client) =>
      handover(client, actors.negotiatorA1),
    );
    await asActor(actors.negotiatorA1, async (client) => {
      await refused(client, "23514", () =>
        addTerms(client, actors.negotiatorA1, id, COMPLETE_TERMS),
      );
      for (const bad of [
        { feeKind: "percentage", feeValue: 10001 },
        { feeKind: "fixed", feeValue: 50000 },
        { rent: 0 },
        { depositOffering: "replacement", deposit: 100000 },
      ] as const) {
        await refused(client, "23514", () =>
          addTerms(client, actors.negotiatorA1, id, { ...bad, reason: "Bad" }),
        );
      }
      const version = await addTerms(client, actors.negotiatorA1, id, {
        ...COMPLETE_TERMS,
        reason: "Agreed",
      });
      await client.query(
        `INSERT INTO "instruction_terms_charges" ("workspace_id",
          "terms_version_id", "name", "amount_pence", "vat")
         VALUES ($1::uuid, $2::uuid, 'Setup fee', 25000, 'none')`,
        [ids.workspaceA, version.rows[0].id],
      );
    });
  });

  it("adds charges only together with their terms version", async () => {
    const versionId = await committed(actors.negotiatorA1, async (client) => {
      const id = await handover(client, actors.negotiatorA1);
      const result = await client.query<{ id: string }>(
        `SELECT "id" FROM "instruction_terms_versions"
         WHERE "instruction_id" = $1::uuid`,
        [id],
      );
      return result.rows[0].id;
    });
    await asActor(actors.negotiatorA1, async (client) => {
      await refused(client, "23514", () =>
        client.query(
          `INSERT INTO "instruction_terms_charges" ("workspace_id",
            "terms_version_id", "name", "amount_pence", "vat")
           VALUES ($1::uuid, $2::uuid, 'Late fee', 5000, 'none')`,
          [ids.workspaceA, versionId],
        ),
      );
    });
  });

  it("records agreement and ownership progress, with reasons for corrections", async () => {
    const id = await committed(actors.negotiatorA1, (client) =>
      handover(client, actors.negotiatorA1),
    );
    const agreement = (client: PoolClient, status: string, extra = "") =>
      client.query(
        `INSERT INTO "instruction_agreement_events" ("workspace_id",
          "instruction_id", "to_status", "signed_on", "reason",
          "recorded_by_membership_id")
         VALUES ($1::uuid, $2::uuid, $3::instruction_agreement_status,
           ${extra || "NULL, NULL"}, $4::uuid)`,
        [ids.workspaceA, id, status, ids.negotiatorA1],
      );
    await asActor(actors.negotiatorA1, async (client) => {
      await refused(client, "23514", () => agreement(client, "signed"));
      await refused(client, "23514", () =>
        agreement(client, "signed", "public.uk_today() + 1, NULL"),
      );
      await refused(client, "23514", () =>
        client.query(
          `INSERT INTO "instruction_ownership_checks" ("workspace_id",
            "instruction_id", "status", "recorded_by_membership_id")
           VALUES ($1::uuid, $2::uuid, 'verified', $3::uuid)`,
          [ids.workspaceA, id, ids.negotiatorA1],
        ),
      );
    });
    await committed(actors.negotiatorA1, async (client) => {
      await agreement(client, "sent");
      await client.query(
        `INSERT INTO "instruction_ownership_checks" ("workspace_id",
          "instruction_id", "status", "checked_on", "method",
          "recorded_by_membership_id")
         VALUES ($1::uuid, $2::uuid, 'verified', public.uk_today(),
           'Title register', $3::uuid)`,
        [ids.workspaceA, id, ids.negotiatorA1],
      );
    });
    await asActor(actors.negotiatorA1, async (client) => {
      await refused(client, "23514", () => agreement(client, "prepared"));
      await refused(client, "23514", () =>
        client.query(
          `INSERT INTO "instruction_ownership_checks" ("workspace_id",
            "instruction_id", "status", "recorded_by_membership_id")
           VALUES ($1::uuid, $2::uuid, 'in_progress', $3::uuid)`,
          [ids.workspaceA, id, ids.negotiatorA1],
        ),
      );
      await agreement(client, "prepared", "NULL, 'Sent to the wrong address'");
    });
  });

  it("keeps landlords: one main contact, active contacts only, removal kept", async () => {
    const id = await committed(actors.negotiatorA1, (client) =>
      handover(client, actors.negotiatorA1),
    );
    await asActor(actors.negotiatorA1, async (client) => {
      await refused(client, "42501", () =>
        addParty(client, actors.negotiatorA1, id, ids.archivedA1),
      );
      await refused(client, "23505", () =>
        addParty(client, actors.negotiatorA1, id, ids.spareA1, true),
      );
      // The main contact must be swapped before it can be removed.
      await refused(client, "23514", () =>
        client.query(
          `UPDATE "instruction_parties" SET "removed_reason" = 'Sold share'
           WHERE "instruction_id" = $1::uuid AND "is_main_contact"`,
          [id],
        ),
      );
      const spare = await addParty(
        client,
        actors.negotiatorA1,
        id,
        ids.spareA1,
      );
      await client.query(
        `UPDATE "instruction_parties" SET "is_main_contact" = false
         WHERE "instruction_id" = $1::uuid AND "is_main_contact"`,
        [id],
      );
      await client.query(
        `UPDATE "instruction_parties" SET "is_main_contact" = true
         WHERE "id" = $1::uuid`,
        [spare.rows[0].id],
      );
      await client.query(
        `UPDATE "instruction_parties" SET "removed_reason" = 'Sold share'
         WHERE "instruction_id" = $1::uuid AND "contact_id" = $2::uuid`,
        [id, ids.personA1],
      );
      await checkNow(client);
      const removed = await client.query(
        `SELECT "removed_at", "removed_by_membership_id"
         FROM "instruction_parties"
         WHERE "instruction_id" = $1::uuid AND "contact_id" = $2::uuid`,
        [id, ids.personA1],
      );
      expect(removed.rows[0].removed_at).not.toBeNull();
      expect(removed.rows[0].removed_by_membership_id).toBe(ids.negotiatorA1);
      expect(
        await count(
          client,
          `SELECT "current_instruction_party_count" FROM "contacts" WHERE "id" = $1::uuid`,
          [ids.personA1],
        ),
      ).toBe(0);
      await refused(client, "23514", () =>
        client.query(
          `UPDATE "instruction_parties" SET "is_main_contact" = true
           WHERE "instruction_id" = $1::uuid AND "contact_id" = $2::uuid`,
          [id, ids.personA1],
        ),
      );
    });
  });

  it("changes the journey only with a matching history record", async () => {
    const id = await committed(actors.negotiatorA1, (client) =>
      handover(client, actors.negotiatorA1),
    );
    await committed(actors.negotiatorA1, (client) =>
      completeChecklist(client, actors.negotiatorA1, id),
    );
    await asActor(actors.negotiatorA1, async (client) => {
      await refused(client, "23514", () =>
        client.query(
          `UPDATE "instructions" SET "journey_stage" = 'ready_to_market'
           WHERE "id" = $1::uuid`,
          [id],
        ),
      );
      await refused(client, "23514", async () => {
        await client.query(
          `INSERT INTO "instruction_journey_history" ("workspace_id",
            "instruction_id", "from_stage", "to_stage",
            "changed_by_membership_id")
           VALUES ($1::uuid, $2::uuid, 'onboarding', 'ready_to_market',
             $3::uuid)`,
          [ids.workspaceA, id, ids.negotiatorA1],
        );
        await checkNow(client);
      });
      await moveJourney(
        client,
        actors.negotiatorA1,
        id,
        "onboarding",
        "ready_to_market",
      );
      await checkNow(client);
    });
  });
});

describe("Ready to market", () => {
  it("is refused until the checklist is complete", async () => {
    const id = await committed(actors.negotiatorA1, (client) =>
      handover(client, actors.negotiatorA1),
    );
    await asActor(actors.negotiatorA1, async (client) => {
      await refused(client, "23514", async () => {
        await moveJourney(
          client,
          actors.negotiatorA1,
          id,
          "onboarding",
          "ready_to_market",
        );
        await checkNow(client);
      });
    });
    // Everything but the agreement.
    await committed(actors.negotiatorA1, async (client) => {
      await client.query(
        `UPDATE "instructions" SET "lead_membership_id" = $2::uuid
         WHERE "id" = $1::uuid`,
        [id, ids.negotiatorA1],
      );
      await addTerms(client, actors.negotiatorA1, id, {
        ...COMPLETE_TERMS,
        reason: "Agreed",
      });
      await client.query(
        `INSERT INTO "instruction_ownership_checks" ("workspace_id",
          "instruction_id", "status", "checked_on", "method",
          "recorded_by_membership_id")
         VALUES ($1::uuid, $2::uuid, 'verified', public.uk_today(),
           'Title register', $3::uuid)`,
        [ids.workspaceA, id, ids.negotiatorA1],
      );
    });
    await asActor(actors.negotiatorA1, async (client) => {
      await refused(client, "23514", async () => {
        await moveJourney(
          client,
          actors.negotiatorA1,
          id,
          "onboarding",
          "ready_to_market",
        );
        await checkNow(client);
      });
    });
  });

  it("accepts a manager's exception for the agreement and ownership check only", async () => {
    const id = await committed(actors.negotiatorA1, (client) =>
      handover(client, actors.negotiatorA1, { lead: ids.negotiatorA1 }),
    );
    await committed(actors.negotiatorA1, (client) =>
      addTerms(client, actors.negotiatorA1, id, {
        ...COMPLETE_TERMS,
        reason: "Agreed",
      }),
    );
    const exception = (client: PoolClient, actor: Actor, kind: string) =>
      client.query(
        `INSERT INTO "instruction_exceptions" ("workspace_id",
          "instruction_id", "kind", "reason", "approved_by_membership_id")
         VALUES ($1::uuid, $2::uuid, $3::instruction_exception_kind,
           'Landlord abroad; signing next week', $4::uuid)`,
        [ids.workspaceA, id, kind, actor.membershipId],
      );
    // Not ordinary staff, not view-only roles, not a manager of another branch.
    for (const actor of [
      actors.negotiatorA1,
      actors.propertyManagerA1,
      actors.accountsA1,
      actors.readOnlyA1,
      actors.managerA2,
    ]) {
      await asActor(actor, async (client) => {
        await refused(client, "42501", () =>
          exception(client, actor, "agreement"),
        );
      });
    }
    await asActor(actors.managerA1, async (client) => {
      await exception(client, actors.managerA1, "agreement");
      await exception(client, actors.managerA1, "ownership_check");
      await refused(client, "23505", () =>
        exception(client, actors.managerA1, "agreement"),
      );
      await moveJourney(
        client,
        actors.managerA1,
        id,
        "onboarding",
        "ready_to_market",
      );
      await checkNow(client);
    });
  });

  it("is lost by an incomplete change unless the property moves back to Onboarding", async () => {
    const id = await committed(actors.negotiatorA1, (client) =>
      handover(client, actors.negotiatorA1),
    );
    await committed(actors.negotiatorA1, (client) =>
      completeChecklist(client, actors.negotiatorA1, id),
    );
    await committed(actors.negotiatorA1, (client) =>
      moveJourney(
        client,
        actors.negotiatorA1,
        id,
        "onboarding",
        "ready_to_market",
      ),
    );
    await asActor(actors.negotiatorA1, async (client) => {
      await refused(client, "23514", async () => {
        await addTerms(client, actors.negotiatorA1, id, {
          ...COMPLETE_TERMS,
          rent: null,
          reason: "Rent under review",
        });
        await checkNow(client);
      });
      await refused(client, "23514", async () => {
        await client.query(
          `UPDATE "instructions" SET "lead_membership_id" = NULL
           WHERE "id" = $1::uuid`,
          [id],
        );
        await checkNow(client);
      });
      // A complete replacement keeps it ready.
      await addTerms(client, actors.negotiatorA1, id, {
        ...COMPLETE_TERMS,
        rent: 160000,
        reason: "Rent increased",
      });
      await checkNow(client);
    });
    await asActor(actors.negotiatorA1, async (client) => {
      await addTerms(client, actors.negotiatorA1, id, {
        ...COMPLETE_TERMS,
        rent: null,
        reason: "Rent under review",
      });
      await refused(client, "23514", async () => {
        await moveJourney(
          client,
          actors.negotiatorA1,
          id,
          "ready_to_market",
          "onboarding",
        );
        await checkNow(client);
      });
      await moveJourney(
        client,
        actors.negotiatorA1,
        id,
        "ready_to_market",
        "onboarding",
        "Rent under review",
      );
      await checkNow(client);
    });
  });
});

describe("ending an instruction", () => {
  it("withdraws it, freezes it and releases the property and landlords", async () => {
    const id = await committed(actors.negotiatorA1, (client) =>
      handover(client, actors.negotiatorA1, {
        enquiryId: ids.enquiryA1c,
        propertyId: ids.propertyA1b,
      }),
    );
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", () =>
        client.query(
          `UPDATE "properties" SET "status" = 'archived', "archived_at" = now()
           WHERE "id" = $1::uuid`,
          [ids.propertyA1b],
        ),
      );
      await refused(client, "23514", () =>
        endInstruction(
          client,
          actors.managerA1,
          id,
          "onboarding",
          "public.uk_today() + 1",
        ),
      );
      await refused(client, "23514", () =>
        endInstruction(
          client,
          actors.managerA1,
          id,
          "onboarding",
          "public.uk_today() - 1",
        ),
      );
      await endInstruction(client, actors.managerA1, id);
      await checkNow(client);
      const ended = await client.query(
        `SELECT "journey_stage", "ended_at", "ended_by_membership_id"
         FROM "instructions" WHERE "id" = $1::uuid`,
        [id],
      );
      expect(ended.rows[0]).toMatchObject({
        journey_stage: "withdrawn",
        ended_by_membership_id: ids.managerA1,
      });
      expect(ended.rows[0].ended_at).not.toBeNull();
      expect(
        await count(
          client,
          `SELECT "current_instruction_count" FROM "properties" WHERE "id" = $1::uuid`,
          [ids.propertyA1b],
        ),
      ).toBe(0);
      expect(
        await count(
          client,
          `SELECT "current_instruction_party_count" FROM "contacts" WHERE "id" = $1::uuid`,
          [ids.personA1],
        ),
      ).toBe(0);
      await refused(client, "23514", () =>
        client.query(
          `UPDATE "instructions" SET "lead_membership_id" = $2::uuid
           WHERE "id" = $1::uuid`,
          [id, ids.negotiatorA1],
        ),
      );
      await refused(client, "23514", () =>
        addTerms(client, actors.managerA1, id, { reason: "After the end" }),
      );
      await refused(client, "23514", () =>
        client.query(
          `UPDATE "instruction_parties" SET "removed_reason" = 'Late change'
           WHERE "instruction_id" = $1::uuid`,
          [id],
        ),
      );
      // Released: the property can now be archived.
      await client.query(
        `UPDATE "properties" SET "status" = 'archived', "archived_at" = now()
         WHERE "id" = $1::uuid`,
        [ids.propertyA1b],
      );
    });
  });
});

describe("records linked to a current instruction", () => {
  it("cannot move the property to another branch", async () => {
    await committed(actors.negotiatorA1, (client) =>
      handover(client, actors.negotiatorA1),
    );
    await asActor(actors.ownerA, async (client) => {
      await refused(client, "23514", async () => {
        await client.query(
          `INSERT INTO "property_branch_transfers" ("workspace_id",
            "property_id", "from_branch_id", "to_branch_id", "reason",
            "transferred_by_membership_id")
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'Moving',
             $5::uuid)`,
          [
            ids.workspaceA,
            ids.propertyA1,
            ids.branchA1,
            ids.branchA2,
            ids.ownerA,
          ],
        );
        await client.query(
          `UPDATE "properties" SET "responsible_branch_id" = $2::uuid
           WHERE "id" = $1::uuid`,
          [ids.propertyA1, ids.branchA2],
        );
      });
    });
  });

  it("cannot archive a landlord on it, even unseen, until they are removed", async () => {
    const id = await committed(actors.negotiatorA1, async (client) => {
      const instructionId = await handover(client, actors.negotiatorA1);
      return instructionId;
    });
    await committed(actors.negotiatorA1, (client) =>
      addParty(client, actors.negotiatorA1, id, ids.spareA1),
    );
    const archive = (client: PoolClient) =>
      client.query(
        `UPDATE "contacts" SET "status" = 'archived', "archived_at" = now()
         WHERE "id" = $1::uuid`,
        [ids.spareA1],
      );
    // Someone in another branch who can still see the contact.
    await adminPool.query(
      `INSERT INTO "contact_branch_links" ("workspace_id", "contact_id",
        "branch_id", "is_primary", "created_by_membership_id", "updated_at")
       VALUES ($1::uuid, $2::uuid, $3::uuid, false, $4::uuid,
         CURRENT_TIMESTAMP)`,
      [ids.workspaceA, ids.spareA1, ids.branchA2, ids.negotiatorA2],
    );
    await asActor(actors.managerA2, async (client) => {
      expect(await count(client, `SELECT count(*) FROM "instructions"`)).toBe(
        0,
      );
      await refused(client, "23514", () => archive(client));
    });
    await committed(actors.negotiatorA1, (client) =>
      client.query(
        `UPDATE "instruction_parties" SET "removed_reason" = 'Not a landlord'
         WHERE "instruction_id" = $1::uuid AND "contact_id" = $2::uuid`,
        [id, ids.spareA1],
      ),
    );
    await asActor(actors.managerA1, async (client) => {
      await archive(client);
    });
  });

  it("cannot be fooled by temporary tables standing in for memberships", async () => {
    await asActor(actors.readOnlyA1, async (client) => {
      await client.query(
        `CREATE TEMP TABLE "membership_roles"
         (LIKE public."membership_roles" INCLUDING DEFAULTS)`,
      );
      await client.query(
        `INSERT INTO pg_temp."membership_roles"
          ("workspace_id", "membership_id", "role_code")
         VALUES ($1::uuid, $2::uuid, 'workspace_owner')`,
        [ids.workspaceA, ids.readOnlyA1],
      );
      await refused(client, "42501", () =>
        insertInstruction(client, actors.readOnlyA1),
      );
    });
  });
});

describe("independent review follow-ups", () => {
  async function open(actor: Actor) {
    const client = await runtimePool.connect();
    await client.query("BEGIN");
    await setContext(client, actor);
    return client;
  }

  async function close(...clients: PoolClient[]) {
    for (const client of clients) {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  }

  // Starts a change that is expected to wait on another transaction, and
  // returns once it has had time to start waiting. The outcome is wrapped so
  // that awaiting this does not wait for the change itself.
  async function waiting<T>(change: Promise<T>) {
    const outcome = change.then(
      () => null,
      (error: { code?: string }) => error,
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { outcome };
  }

  async function partyCount(contactId: string) {
    const result = await adminPool.query<{ n: number }>(
      `SELECT "current_instruction_party_count" AS "n" FROM "contacts"
       WHERE "id" = $1::uuid`,
      [contactId],
    );
    return result.rows[0].n;
  }

  it("lets a Property Manager and an Agency Admin do ordinary instruction work", async () => {
    for (const actor of [actors.propertyManagerA1, actors.adminA]) {
      await asActor(actor, async (client) => {
        await handover(client, actor);
      });
    }
  });

  it("records the ending reason as the withdrawal reason", async () => {
    const id = await committed(actors.negotiatorA1, (client) =>
      handover(client, actors.negotiatorA1),
    );
    await asActor(actors.negotiatorA1, async (client) => {
      await refused(client, "23514", async () => {
        await client.query(
          `INSERT INTO "instruction_journey_history" ("workspace_id",
            "instruction_id", "from_stage", "to_stage", "reason",
            "changed_by_membership_id")
           VALUES ($1::uuid, $2::uuid, 'onboarding', 'withdrawn',
             'Something else', $3::uuid)`,
          [ids.workspaceA, id, ids.negotiatorA1],
        );
        await client.query(
          `UPDATE "instructions" SET "ended_on" = public.uk_today(),
             "ended_reason" = 'Landlord is selling',
             "journey_stage" = 'withdrawn'
           WHERE "id" = $1::uuid`,
          [id],
        );
      });
    });
  });

  it("adds nothing to an instruction that another person is ending", async () => {
    const id = await committed(actors.negotiatorA1, (client) =>
      handover(client, actors.negotiatorA1),
    );
    const ender = await open(actors.managerA1);
    const adder = await open(actors.negotiatorA1);
    try {
      await endInstruction(ender, actors.managerA1, id);
      const attempt = await waiting(
        addParty(adder, actors.negotiatorA1, id, ids.spareA1),
      );
      await ender.query("COMMIT");
      expect((await attempt.outcome)?.code).toBe("23514");
      expect(await partyCount(ids.spareA1)).toBe(0);
    } finally {
      await close(ender, adder);
    }
  });

  it("never subtracts a landlord twice when removal and ending meet", async () => {
    const ended = await committed(actors.negotiatorA1, (client) =>
      handover(client, actors.negotiatorA1),
    );
    await committed(actors.negotiatorA1, (client) =>
      addParty(client, actors.negotiatorA1, ended, ids.spareA1),
    );
    await committed(actors.negotiatorA1, async (client) => {
      const other = await handover(client, actors.negotiatorA1, {
        enquiryId: ids.enquiryA1c,
        propertyId: ids.propertyA1b,
      });
      await addParty(client, actors.negotiatorA1, other, ids.spareA1);
    });
    expect(await partyCount(ids.spareA1)).toBe(2);
    const ender = await open(actors.managerA1);
    const remover = await open(actors.negotiatorA1);
    try {
      await endInstruction(ender, actors.managerA1, ended);
      const attempt = await waiting(
        remover.query(
          `UPDATE "instruction_parties" SET "removed_reason" = 'Sold share'
           WHERE "instruction_id" = $1::uuid AND "contact_id" = $2::uuid`,
          [ended, ids.spareA1],
        ),
      );
      await ender.query("COMMIT");
      expect((await attempt.outcome)?.code).toBe("23514");
      // Still a landlord on the other current instruction.
      expect(await partyCount(ids.spareA1)).toBe(1);
    } finally {
      await close(ender, remover);
    }
  });

  it("refuses an instruction for a property moved to another branch meanwhile", async () => {
    const mover = await open(actors.ownerA);
    const starter = await open(actors.negotiatorA1);
    try {
      await mover.query(
        `INSERT INTO "property_branch_transfers" ("workspace_id",
          "property_id", "from_branch_id", "to_branch_id", "reason",
          "transferred_by_membership_id")
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'Moving', $5::uuid)`,
        [
          ids.workspaceA,
          ids.propertyA1,
          ids.branchA1,
          ids.branchA2,
          ids.ownerA,
        ],
      );
      await mover.query(
        `UPDATE "properties" SET "responsible_branch_id" = $2::uuid
         WHERE "id" = $1::uuid`,
        [ids.propertyA1, ids.branchA2],
      );
      const attempt = await waiting(
        insertInstruction(starter, actors.negotiatorA1),
      );
      await mover.query("COMMIT");
      expect((await attempt.outcome)?.code).toBe("42501");
    } finally {
      await close(mover, starter);
    }
  });
});
