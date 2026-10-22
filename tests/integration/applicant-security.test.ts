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
  propertyManagerA1: randomUUID(),
  negotiatorA2: randomUUID(),
  readOnlyA1: randomUUID(),
  accountsA1: randomUUID(),
  suspendedA1: randomUUID(),
  ownerB: randomUUID(),
  personA1: randomUUID(),
  personA2: randomUUID(),
  personB: randomUUID(),
  propertyA1: randomUUID(),
  propertyA1Ended: randomUUID(),
  propertyA1Archived: randomUUID(),
  propertyA2: randomUUID(),
  propertyB: randomUUID(),
  enquiryA1: randomUUID(),
  enquiryA1Ended: randomUUID(),
  enquiryA2: randomUUID(),
  enquiryB: randomUUID(),
  sourceA: randomUUID(),
  sourceB: randomUUID(),
};

type Actor = {
  workspaceId: string;
  membershipId: string;
  scope: "workspace" | "named_branches";
  branchIds?: readonly string[];
};

const inBranch = (
  membershipId: string,
  branchId: string,
  workspaceId = ids.workspaceA,
): Actor => ({
  workspaceId,
  membershipId,
  scope: "named_branches",
  branchIds: [branchId],
});

const actors = {
  ownerA: {
    workspaceId: ids.workspaceA,
    membershipId: ids.ownerA,
    scope: "workspace",
  },
  managerA1: inBranch(ids.managerA1, ids.branchA1),
  negotiatorA1: inBranch(ids.negotiatorA1, ids.branchA1),
  propertyManagerA1: inBranch(ids.propertyManagerA1, ids.branchA1),
  negotiatorA2: inBranch(ids.negotiatorA2, ids.branchA2),
  readOnlyA1: inBranch(ids.readOnlyA1, ids.branchA1),
  accountsA1: inBranch(ids.accountsA1, ids.branchA1),
  suspendedA1: inBranch(ids.suspendedA1, ids.branchA1),
  ownerB: {
    workspaceId: ids.workspaceB,
    membershipId: ids.ownerB,
    scope: "workspace",
  },
} satisfies Record<string, Actor>;

// Instructions created for each test by `seed`.
const instructions = { a1: "", a1Ended: "", a2: "", b: "" };

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function reference() {
  let suffix = "";
  for (let i = 0; i < 8; i += 1) {
    suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `INS-${suffix}`;
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
       VALUES
        ($1::uuid, 'applicants-a', 'Applicants A', 'agency', CURRENT_TIMESTAMP),
        ($2::uuid, 'applicants-b', 'Applicants B', 'agency', CURRENT_TIMESTAMP)`,
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
    const memberships: [string, string, string, string | null, string][] = [
      [ids.ownerA, ids.workspaceA, "workspace_owner", null, "active"],
      [ids.managerA1, ids.workspaceA, "branch_manager", ids.branchA1, "active"],
      [ids.negotiatorA1, ids.workspaceA, "negotiator", ids.branchA1, "active"],
      [
        ids.propertyManagerA1,
        ids.workspaceA,
        "property_manager",
        ids.branchA1,
        "active",
      ],
      [ids.negotiatorA2, ids.workspaceA, "negotiator", ids.branchA2, "active"],
      [ids.readOnlyA1, ids.workspaceA, "read_only", ids.branchA1, "active"],
      [ids.accountsA1, ids.workspaceA, "accounts", ids.branchA1, "active"],
      [
        ids.suspendedA1,
        ids.workspaceA,
        "negotiator",
        ids.branchA1,
        "suspended",
      ],
      [ids.ownerB, ids.workspaceB, "workspace_owner", null, "active"],
    ];
    for (const [id, workspaceId, role, branchId, status] of memberships) {
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
          branchId ? "named_branches" : "workspace",
          status,
        ],
      );
      await client.query(
        `INSERT INTO "membership_roles"
          ("workspace_id", "membership_id", "role_code")
         VALUES ($1::uuid, $2::uuid, $3::membership_role_code)`,
        [workspaceId, id, role],
      );
      if (branchId) {
        await client.query(
          `INSERT INTO "membership_branch_access"
            ("workspace_id", "membership_id", "branch_id")
           VALUES ($1::uuid, $2::uuid, $3::uuid)`,
          [workspaceId, id, branchId],
        );
      }
    }
    for (const [contactId, workspaceId, branchId, creator, ref] of [
      [
        ids.personA1,
        ids.workspaceA,
        ids.branchA1,
        ids.managerA1,
        "PER-DC111111",
      ],
      [
        ids.personA2,
        ids.workspaceA,
        ids.branchA2,
        ids.negotiatorA2,
        "PER-DC222222",
      ],
      [ids.personB, ids.workspaceB, ids.branchB, ids.ownerB, "PER-DC333333"],
    ]) {
      await client.query(
        `INSERT INTO "contacts" ("id", "workspace_id", "kind", "reference",
          "first_name", "last_name", "created_by_membership_id", "updated_at")
         VALUES ($1::uuid, $2::uuid, 'person', $3, 'Alex', 'Example',
           $4::uuid, CURRENT_TIMESTAMP)`,
        [contactId, workspaceId, ref, creator],
      );
      await client.query(
        `INSERT INTO "contact_branch_links" ("workspace_id", "contact_id",
          "branch_id", "is_primary", "created_by_membership_id", "updated_at")
         VALUES ($1::uuid, $2::uuid, $3::uuid, true, $4::uuid,
           CURRENT_TIMESTAMP)`,
        [workspaceId, contactId, branchId, creator],
      );
    }
    for (const [propertyId, workspaceId, branchId, ref, creator, archived] of [
      [
        ids.propertyA1,
        ids.workspaceA,
        ids.branchA1,
        "PRP-DCAA2222",
        ids.managerA1,
        false,
      ],
      [
        ids.propertyA1Ended,
        ids.workspaceA,
        ids.branchA1,
        "PRP-DCBB2222",
        ids.managerA1,
        false,
      ],
      [
        ids.propertyA1Archived,
        ids.workspaceA,
        ids.branchA1,
        "PRP-DCCC2222",
        ids.managerA1,
        true,
      ],
      [
        ids.propertyA2,
        ids.workspaceA,
        ids.branchA2,
        "PRP-DCDD2222",
        ids.negotiatorA2,
        false,
      ],
      [
        ids.propertyB,
        ids.workspaceB,
        ids.branchB,
        "PRP-DCEE2222",
        ids.ownerB,
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
       VALUES ($1::uuid, $2::uuid, 'Rightmove', CURRENT_TIMESTAMP),
              ($3::uuid, $4::uuid, 'Rightmove', CURRENT_TIMESTAMP)`,
      [ids.sourceA, ids.workspaceA, ids.sourceB, ids.workspaceB],
    );
    for (const [
      id,
      workspaceId,
      branchId,
      ref,
      contactId,
      propertyId,
      creator,
    ] of [
      [
        ids.enquiryA1,
        ids.workspaceA,
        ids.branchA1,
        "ENQ-DCAA2222",
        ids.personA1,
        ids.propertyA1,
        ids.managerA1,
      ],
      [
        ids.enquiryA1Ended,
        ids.workspaceA,
        ids.branchA1,
        "ENQ-DCBB2222",
        ids.personA1,
        ids.propertyA1Ended,
        ids.managerA1,
      ],
      [
        ids.enquiryA2,
        ids.workspaceA,
        ids.branchA2,
        "ENQ-DCCC2222",
        ids.personA2,
        ids.propertyA2,
        ids.negotiatorA2,
      ],
      [
        ids.enquiryB,
        ids.workspaceB,
        ids.branchB,
        "ENQ-DCDD2222",
        ids.personB,
        ids.propertyB,
        ids.ownerB,
      ],
    ]) {
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [
        workspaceId,
      ]);
      await client.query(
        `INSERT INTO "landlord_enquiries" ("id", "workspace_id", "reference",
          "responsible_branch_id", "stage", "enquirer_name",
          "enquirer_telephone", "postcode", "contact_id", "property_id",
          "lead_source_id", "created_by_membership_id", "updated_at")
         VALUES ($1::uuid, $2::uuid, $3, $4::uuid, 'appraisal_completed',
           'Pat', '07700 900111', 'SW1A 1AA', $5::uuid, $6::uuid, $8::uuid,
           $7::uuid, CURRENT_TIMESTAMP)`,
        [
          id,
          workspaceId,
          ref,
          branchId,
          contactId,
          propertyId,
          creator,
          workspaceId === ids.workspaceA ? ids.sourceA : ids.sourceB,
        ],
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

// Runs as the runtime role and commits, for set-up later steps build on.
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
  expect(error, "expected the database to refuse").not.toBeNull();
  expect(allowed).toContain(error?.code);
}

/** A won lead, its instruction, a main landlord and terms, committed. */
async function createInstruction(
  actor: Actor,
  input: {
    enquiryId: string;
    propertyId: string;
    branchId: string;
    contactId: string;
  },
) {
  return committed(actor, async (client) => {
    await client.query(
      `INSERT INTO "enquiry_stage_history" ("workspace_id", "enquiry_id",
        "from_stage", "to_stage", "changed_by_membership_id")
       VALUES ($1::uuid, $2::uuid, 'appraisal_completed', 'won', $3::uuid)`,
      [actor.workspaceId, input.enquiryId, actor.membershipId],
    );
    await client.query(
      `UPDATE "landlord_enquiries" SET "stage" = 'won', "updated_at" = now()
       WHERE "id" = $1::uuid`,
      [input.enquiryId],
    );
    const result = await client.query<{ id: string }>(
      `INSERT INTO "instructions" ("workspace_id", "reference", "property_id",
        "enquiry_id", "responsible_branch_id", "instructed_on",
        "created_by_membership_id", "updated_at")
       VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5::uuid, public.uk_today(),
         $6::uuid, CURRENT_TIMESTAMP)
       RETURNING "id"`,
      [
        actor.workspaceId,
        reference(),
        input.propertyId,
        input.enquiryId,
        input.branchId,
        actor.membershipId,
      ],
    );
    const id = result.rows[0].id;
    await client.query(
      `INSERT INTO "instruction_parties" ("workspace_id", "instruction_id",
        "contact_id", "is_main_contact", "added_by_membership_id", "updated_at")
       VALUES ($1::uuid, $2::uuid, $3::uuid, true, $4::uuid, CURRENT_TIMESTAMP)`,
      [actor.workspaceId, id, input.contactId, actor.membershipId],
    );
    await client.query(
      `INSERT INTO "instruction_terms_versions" ("workspace_id",
        "instruction_id", "service", "created_by_membership_id")
       VALUES ($1::uuid, $2::uuid, 'fully_managed', $3::uuid)`,
      [actor.workspaceId, id, actor.membershipId],
    );
    return id;
  });
}

// Runs as the admin role, skipping triggers, to set up states the app
// cannot reach in a test (a Ready to market instruction without the whole
// onboarding checklist, compliance evidence without a file).
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

async function markReady(instructionId: string) {
  await asAdmin(
    `UPDATE "instructions" SET "journey_stage" = 'ready_to_market'
     WHERE "id" = $1::uuid`,
    [instructionId],
  );
}

/** A listing with its first version and created event, in the open transaction. */
async function prepareListing(
  client: PoolClient,
  actor: Actor,
  instructionId: string,
  propertyId: string = ids.propertyA1,
) {
  const listing = await client.query<{ id: string; property_id: string }>(
    `INSERT INTO "listings" ("workspace_id", "instruction_id", "property_id",
      "created_by_membership_id")
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid)
     RETURNING "id", "property_id"`,
    [actor.workspaceId, instructionId, propertyId, actor.membershipId],
  );
  const id = listing.rows[0].id;
  await saveVersion(client, actor, id);
  await client.query(
    `INSERT INTO "listing_events" ("workspace_id", "listing_id", "kind",
      "actor_membership_id")
     VALUES ($1::uuid, $2::uuid, 'created', $3::uuid)`,
    [actor.workspaceId, id, actor.membershipId],
  );
  return { id, propertyId: listing.rows[0].property_id };
}

async function saveVersion(
  client: PoolClient,
  actor: Actor,
  listingId: string,
  input: { rent?: number | null; headline?: string } = {},
) {
  const result = await client.query<{ version_no: number }>(
    `INSERT INTO "listing_content_versions" ("workspace_id", "listing_id",
      "source_terms_version_id", "advertised_rent_pence", "headline",
      "property_facts", "created_by_membership_id")
     VALUES ($1::uuid, $2::uuid, gen_random_uuid(), $3, $4, '{}'::jsonb,
       $5::uuid)
     RETURNING "version_no"`,
    [
      actor.workspaceId,
      listingId,
      input.rent ?? null,
      input.headline ?? "",
      actor.membershipId,
    ],
  );
  const versionNo = result.rows[0].version_no;
  await client.query(
    `INSERT INTO "listing_events" ("workspace_id", "listing_id", "kind",
      "version_no", "actor_membership_id")
     VALUES ($1::uuid, $2::uuid, 'version_saved', $3, $4::uuid)`,
    [actor.workspaceId, listingId, versionNo, actor.membershipId],
  );
  return versionNo;
}

/** An event plus the matching state change, as the services will do it. */
async function changeState(
  client: PoolClient,
  actor: Actor,
  listingId: string,
  change: {
    kind: string;
    from: string;
    to: string;
    versionNo?: number | null;
    reason?: string | null;
    epcPosition?: string | null;
    mediaFingerprint?: string | null;
  },
) {
  await client.query(
    `INSERT INTO "listing_events" ("workspace_id", "listing_id", "kind",
      "from_state", "to_state", "version_no", "reason", "epc_position",
      "media_fingerprint", "actor_membership_id")
     VALUES ($1::uuid, $2::uuid, $3::listing_event_kind, $4::listing_state,
       $5::listing_state, $6, $7, $8::listing_epc_position, $9, $10::uuid)`,
    [
      actor.workspaceId,
      listingId,
      change.kind,
      change.from,
      change.to,
      change.versionNo ?? null,
      change.reason ?? null,
      change.epcPosition ?? null,
      change.mediaFingerprint ?? null,
      actor.membershipId,
    ],
  );
  await client.query(
    `UPDATE "listings" SET "state" = $2::listing_state WHERE "id" = $1::uuid`,
    [listingId, change.to],
  );
}

/** Commits, and returns the error code if the commit (or the work) fails. */
async function commitCode(
  actor: Actor,
  work: (client: PoolClient) => Promise<unknown>,
) {
  const client = await runtimePool.connect();
  try {
    await client.query("BEGIN");
    await setContext(client, actor);
    await work(client);
    await client.query("COMMIT");
    return null;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return (error as { code?: string }).code ?? "unknown";
  } finally {
    client.release();
  }
}

async function listingState(listingId: string) {
  const { rows } = await adminPool.query<{ state: string }>(
    `SELECT "state"::text AS "state" FROM "listings" WHERE "id" = $1::uuid`,
    [listingId],
  );
  return rows[0]?.state;
}

async function endReadyInstruction(actor: Actor, instructionId: string) {
  await committed(actor, async (client) => {
    await client.query(
      `INSERT INTO "instruction_journey_history" ("workspace_id",
        "instruction_id", "from_stage", "to_stage", "reason",
        "changed_by_membership_id")
       VALUES ($1::uuid, $2::uuid, 'ready_to_market', 'withdrawn',
         'Landlord is selling', $3::uuid)`,
      [actor.workspaceId, instructionId, actor.membershipId],
    );
    await client.query(
      `UPDATE "instructions"
       SET "ended_on" = public.uk_today(), "ended_reason" = 'Landlord is selling',
         "journey_stage" = 'withdrawn', "updated_at" = now()
       WHERE "id" = $1::uuid`,
      [instructionId],
    );
  });
}

async function seed() {
  await seedReferenceData();
  instructions.a1 = await createInstruction(actors.managerA1, {
    enquiryId: ids.enquiryA1,
    propertyId: ids.propertyA1,
    branchId: ids.branchA1,
    contactId: ids.personA1,
  });
  instructions.a1Ended = await createInstruction(actors.managerA1, {
    enquiryId: ids.enquiryA1Ended,
    propertyId: ids.propertyA1Ended,
    branchId: ids.branchA1,
    contactId: ids.personA1,
  });
  instructions.a2 = await createInstruction(actors.negotiatorA2, {
    enquiryId: ids.enquiryA2,
    propertyId: ids.propertyA2,
    branchId: ids.branchA2,
    contactId: ids.personA2,
  });
  instructions.b = await createInstruction(actors.ownerB, {
    enquiryId: ids.enquiryB,
    propertyId: ids.propertyB,
    branchId: ids.branchB,
    contactId: ids.personB,
  });
  // a1, a2 and b are Ready to market; a1Ended stays in Onboarding.
  for (const id of [instructions.a1, instructions.a2, instructions.b]) {
    await markReady(id);
  }
}

beforeEach(seed);

afterAll(async () => {
  await runtimePool.end();
  await adminPool.end();
});

// --- Applicants and property enquiries (A2, ADR-036 and ADR-037) ---

function applicantReference() {
  let suffix = "";
  for (let i = 0; i < 8; i += 1) {
    suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `APP-${suffix}`;
}

/** Another contact in branch A1, to be a household member. */
async function extraContact(branchId: string = ids.branchA1) {
  const id = randomUUID();
  await asAdmin(
    `INSERT INTO "contacts" ("id", "workspace_id", "kind", "reference",
      "first_name", "last_name", "created_by_membership_id", "updated_at")
     VALUES ($1::uuid, $2::uuid, 'person', $3, 'Sam', 'Member', $4::uuid,
       CURRENT_TIMESTAMP)`,
    [id, ids.workspaceA, `PER-${applicantReference().slice(4)}`, ids.managerA1],
  );
  await asAdmin(
    `INSERT INTO "contact_branch_links" ("workspace_id", "contact_id",
      "branch_id", "is_primary", "created_by_membership_id", "updated_at")
     VALUES ($1::uuid, $2::uuid, $3::uuid, true, $4::uuid, CURRENT_TIMESTAMP)`,
    [ids.workspaceA, id, branchId, ids.managerA1],
  );
  return id;
}

async function reason(
  kind: "applicant" | "property_enquiry",
  workspaceId: string = ids.workspaceA,
) {
  const row = await asAdmin(
    `INSERT INTO "lettings_outcome_reasons" ("workspace_id", "name", "applies_to")
     VALUES ($1::uuid, $2, $3::lettings_outcome_kind)
     RETURNING "id"`,
    [workspaceId, `Reason ${randomUUID().slice(0, 8)}`, kind],
  );
  return row.rows[0].id as string;
}

async function createApplicant(
  client: PoolClient,
  actor: Actor,
  input: { contactId?: string; branchId?: string } = {},
) {
  const row = await client.query<{ id: string }>(
    `INSERT INTO "applicants" ("workspace_id", "reference", "lead_contact_id",
      "responsible_branch_id", "created_by_membership_id")
     VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5::uuid)
     RETURNING "id"`,
    [
      actor.workspaceId,
      applicantReference(),
      input.contactId ?? ids.personA1,
      input.branchId ?? ids.branchA1,
      actor.membershipId,
    ],
  );
  return row.rows[0].id;
}

async function moveApplicant(
  client: PoolClient,
  actor: Actor,
  applicantId: string,
  from: string,
  to: string,
  closureReasonId: string | null = null,
) {
  await client.query(
    `INSERT INTO "applicant_status_history" ("workspace_id", "applicant_id",
      "from_status", "to_status", "actor_membership_id")
     VALUES ($1::uuid, $2::uuid, $3::applicant_status, $4::applicant_status,
       $5::uuid)`,
    [actor.workspaceId, applicantId, from, to, actor.membershipId],
  );
  await client.query(
    `UPDATE "applicants" SET "status" = $2::applicant_status,
       "closure_reason_id" = $3::uuid
     WHERE "id" = $1::uuid`,
    [applicantId, to, closureReasonId],
  );
}

/** A listing on the instruction, set to Ready to advertise for the test. */
async function readyListing(instructionId: string = instructions.a1) {
  const actor =
    instructionId === instructions.a2 ? actors.negotiatorA2 : actors.managerA1;
  const propertyId =
    instructionId === instructions.a2 ? ids.propertyA2 : ids.propertyA1;
  const { id } = await committed(actor, (client) =>
    prepareListing(client, actor, instructionId, propertyId),
  );
  await asAdmin(
    `UPDATE "listings" SET "state" = 'ready_to_advertise' WHERE "id" = $1::uuid`,
    [id],
  );
  return id;
}

async function registerEnquiry(
  client: PoolClient,
  actor: Actor,
  applicantId: string,
  listingId: string,
) {
  const row = await client.query<{
    id: string;
    property_id: string;
    responsible_branch_id: string;
  }>(
    `INSERT INTO "property_enquiries" ("workspace_id", "applicant_id",
      "listing_id", "property_id", "responsible_branch_id",
      "created_by_membership_id")
     VALUES ($1::uuid, $2::uuid, $3::uuid, gen_random_uuid(),
       gen_random_uuid(), $4::uuid)
     RETURNING "id", "property_id", "responsible_branch_id"`,
    [actor.workspaceId, applicantId, listingId, actor.membershipId],
  );
  return row.rows[0];
}

async function moveEnquiry(
  client: PoolClient,
  actor: Actor,
  enquiryId: string,
  from: string,
  to: string,
  extra: {
    reasonId?: string | null;
    kind?: "staff" | "listing_withdrawn";
    closedByListing?: boolean;
  } = {},
) {
  await client.query(
    `INSERT INTO "property_enquiry_stage_history" ("workspace_id",
      "property_enquiry_id", "from_stage", "to_stage", "kind",
      "actor_membership_id")
     VALUES ($1::uuid, $2::uuid, $3::property_enquiry_stage,
       $4::property_enquiry_stage, $5::property_enquiry_change_kind, $6::uuid)`,
    [
      actor.workspaceId,
      enquiryId,
      from,
      to,
      extra.kind ?? "staff",
      actor.membershipId,
    ],
  );
  await client.query(
    `UPDATE "property_enquiries" SET "stage" = $2::property_enquiry_stage,
       "closure_reason_id" = $3::uuid, "closed_by_listing" = $4
     WHERE "id" = $1::uuid`,
    [enquiryId, to, extra.reasonId ?? null, extra.closedByListing ?? false],
  );
}

async function applicantCount(contactId: string) {
  const { rows } = await adminPool.query<{ n: number }>(
    `SELECT "current_open_applicant_count" AS "n" FROM "contacts"
     WHERE "id" = $1::uuid`,
    [contactId],
  );
  return rows[0].n;
}

async function visibleCount(actor: Actor, table: string, where = "true") {
  let count = -1;
  await asActor(actor, async (client) => {
    const { rows } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS "n" FROM "${table}" WHERE ${where}`,
    );
    count = rows[0].n;
  });
  return count;
}

describe("applicants", () => {
  it("lets the four working roles add an applicant in their branch, and nobody else", async () => {
    for (const actor of [
      actors.ownerA,
      actors.managerA1,
      actors.negotiatorA1,
    ]) {
      await asActor(actor, async (client) => {
        await createApplicant(client, actor);
      });
    }
    for (const actor of [
      actors.propertyManagerA1,
      actors.readOnlyA1,
      actors.accountsA1,
      actors.suspendedA1,
      actors.negotiatorA2,
    ]) {
      await asActor(actor, async (client) => {
        await refused(client, "42501", () => createApplicant(client, actor));
      });
    }
    await asActor(actors.ownerB, async (client) => {
      await refused(client, ["42501", "23503"], () =>
        createApplicant(client, actors.ownerB),
      );
    });
  });

  it("shows applicants to their branch's readers, never to Accounts, other branches or agencies", async () => {
    await committed(actors.managerA1, (client) =>
      createApplicant(client, actors.managerA1),
    );
    expect(await visibleCount(actors.managerA1, "applicants")).toBe(1);
    expect(await visibleCount(actors.readOnlyA1, "applicants")).toBe(1);
    expect(await visibleCount(actors.propertyManagerA1, "applicants")).toBe(1);
    expect(await visibleCount(actors.accountsA1, "applicants")).toBe(0);
    expect(await visibleCount(actors.negotiatorA2, "applicants")).toBe(0);
    expect(await visibleCount(actors.ownerB, "applicants")).toBe(0);
  });

  it("checks the reference, and keeps one open applicant per lead contact", async () => {
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", () =>
        client.query(
          `INSERT INTO "applicants" ("workspace_id", "reference",
            "lead_contact_id", "responsible_branch_id", "created_by_membership_id")
           VALUES ($1::uuid, 'APP-bad', $2::uuid, $3::uuid, $4::uuid)`,
          [ids.workspaceA, ids.personA1, ids.branchA1, ids.managerA1],
        ),
      );
      await createApplicant(client, actors.managerA1);
      await refused(client, "23505", () =>
        createApplicant(client, actors.managerA1),
      );
    });
  });

  it("refuses a new applicant that starts closed or on hold", async () => {
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", () =>
        client.query(
          `INSERT INTO "applicants" ("workspace_id", "reference",
            "lead_contact_id", "responsible_branch_id", "status",
            "created_by_membership_id")
           VALUES ($1::uuid, $2, $3::uuid, $4::uuid, 'on_hold', $5::uuid)`,
          [
            ids.workspaceA,
            applicantReference(),
            ids.personA1,
            ids.branchA1,
            ids.managerA1,
          ],
        ),
      );
    });
  });

  it("changes status only with a history row, closes only with a reason, and only managers reopen", async () => {
    const applicantId = await committed(actors.managerA1, (client) =>
      createApplicant(client, actors.managerA1),
    );
    const closeReason = await reason("applicant");
    await asActor(actors.negotiatorA1, async (client) => {
      await refused(client, "23514", () =>
        client.query(
          `UPDATE "applicants" SET "status" = 'on_hold' WHERE "id" = $1::uuid`,
          [applicantId],
        ),
      );
      await refused(client, "23514", () =>
        moveApplicant(
          client,
          actors.negotiatorA1,
          applicantId,
          "active",
          "closed",
        ),
      );
    });
    expect(
      await commitCode(actors.negotiatorA1, (client) =>
        moveApplicant(
          client,
          actors.negotiatorA1,
          applicantId,
          "active",
          "closed",
          closeReason,
        ),
      ),
    ).toBeNull();
    expect(await applicantCount(ids.personA1)).toBe(0);
    expect(
      await commitCode(actors.negotiatorA1, (client) =>
        moveApplicant(
          client,
          actors.negotiatorA1,
          applicantId,
          "closed",
          "active",
        ),
      ),
    ).toBe("42501");
    expect(
      await commitCode(actors.managerA1, (client) =>
        moveApplicant(
          client,
          actors.managerA1,
          applicantId,
          "closed",
          "active",
        ),
      ),
    ).toBeNull();
    const { rows } = await adminPool.query(
      `SELECT "status"::text AS "status", "closure_reason_id"
       FROM "applicants" WHERE "id" = $1::uuid`,
      [applicantId],
    );
    expect(rows[0]).toEqual({ status: "active", closure_reason_id: null });
    expect(await applicantCount(ids.personA1)).toBe(1);
  });

  it("refuses a reason meant for enquiries when closing an applicant", async () => {
    const applicantId = await committed(actors.managerA1, (client) =>
      createApplicant(client, actors.managerA1),
    );
    const wrong = await reason("property_enquiry");
    expect(
      await commitCode(actors.managerA1, (client) =>
        moveApplicant(
          client,
          actors.managerA1,
          applicantId,
          "active",
          "closed",
          wrong,
        ),
      ),
    ).toBe("23514");
  });

  it("keeps household members: never the lead, ended once, and counted while open", async () => {
    const memberContact = await extraContact();
    const applicantId = await committed(actors.managerA1, (client) =>
      createApplicant(client, actors.managerA1),
    );
    expect(await applicantCount(ids.personA1)).toBe(1);
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", () =>
        client.query(
          `INSERT INTO "applicant_members" ("workspace_id", "applicant_id",
            "contact_id", "added_by_membership_id")
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid)`,
          [ids.workspaceA, applicantId, ids.personA1, ids.managerA1],
        ),
      );
    });
    const memberId = await committed(actors.managerA1, async (client) => {
      const row = await client.query<{ id: string }>(
        `INSERT INTO "applicant_members" ("workspace_id", "applicant_id",
          "contact_id", "added_by_membership_id")
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid) RETURNING "id"`,
        [ids.workspaceA, applicantId, memberContact, ids.managerA1],
      );
      return row.rows[0].id;
    });
    expect(await applicantCount(memberContact)).toBe(1);
    await committed(actors.managerA1, (client) =>
      client.query(
        `UPDATE "applicant_members" SET "ended_at" = now() WHERE "id" = $1::uuid`,
        [memberId],
      ),
    );
    expect(await applicantCount(memberContact)).toBe(0);
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", () =>
        client.query(
          `UPDATE "applicant_members" SET "ended_at" = NULL WHERE "id" = $1::uuid`,
          [memberId],
        ),
      );
      await refused(client, "42501", () =>
        client.query(
          `UPDATE "applicant_members" SET "contact_id" = $2::uuid
           WHERE "id" = $1::uuid`,
          [memberId, ids.personA1],
        ),
      );
    });
  });

  it("keeps the open-applicant count for the database alone", async () => {
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", () =>
        client.query(
          `UPDATE "contacts" SET "current_open_applicant_count" = 5
           WHERE "id" = $1::uuid`,
          [ids.personA1],
        ),
      );
    });
  });

  it("numbers requirement versions, never changes them, and refuses impossible ranges", async () => {
    const applicantId = await committed(actors.managerA1, (client) =>
      createApplicant(client, actors.managerA1),
    );
    const add = (client: PoolClient, min = 100000, max = 150000) =>
      client.query<{ version_no: number }>(
        `INSERT INTO "applicant_requirement_versions" ("workspace_id",
          "applicant_id", "areas", "min_rent_pence", "max_rent_pence",
          "property_types", "created_by_membership_id")
         VALUES ($1::uuid, $2::uuid, ARRAY['M20', 'Didsbury'], $3, $4,
           ARRAY['flat']::property_type[], $5::uuid)
         RETURNING "version_no"`,
        [ids.workspaceA, applicantId, min, max, ids.managerA1],
      );
    await committed(actors.managerA1, async (client) => {
      expect((await add(client)).rows[0].version_no).toBe(1);
      expect((await add(client)).rows[0].version_no).toBe(2);
    });
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", () => add(client, 200000, 100000));
      await refused(client, "42501", () =>
        client.query(
          `UPDATE "applicant_requirement_versions" SET "max_rent_pence" = 1
           WHERE "applicant_id" = $1::uuid`,
          [applicantId],
        ),
      );
      await refused(client, "23514", () =>
        client.query(
          `INSERT INTO "applicant_requirement_versions" ("workspace_id",
            "applicant_id", "areas", "created_by_membership_id")
           VALUES ($1::uuid, $2::uuid, ARRAY['  '], $3::uuid)`,
          [ids.workspaceA, applicantId, ids.managerA1],
        ),
      );
    });
    // Read Only sees the requirements but cannot add any.
    expect(
      await visibleCount(actors.readOnlyA1, "applicant_requirement_versions"),
    ).toBe(2);
    await asActor(actors.readOnlyA1, async (client) => {
      await refused(client, "42501", () =>
        client.query(
          `INSERT INTO "applicant_requirement_versions" ("workspace_id",
            "applicant_id", "created_by_membership_id")
           VALUES ($1::uuid, $2::uuid, $3::uuid)`,
          [ids.workspaceA, applicantId, ids.readOnlyA1],
        ),
      );
    });
  });

  it("never lets the app delete applicant records", async () => {
    await committed(actors.managerA1, (client) =>
      createApplicant(client, actors.managerA1),
    );
    await asActor(actors.ownerA, async (client) => {
      for (const table of [
        "applicants",
        "applicant_status_history",
        "applicant_members",
        "applicant_requirement_versions",
        "property_enquiries",
        "property_enquiry_stage_history",
        "lettings_outcome_reasons",
      ]) {
        await refused(client, "42501", () =>
          client.query(`DELETE FROM "${table}"`),
        );
      }
    });
  });
});

describe("property enquiries", () => {
  it("can only be recorded on a Ready to advertise listing, taking its property and branch", async () => {
    const applicantId = await committed(actors.managerA1, (client) =>
      createApplicant(client, actors.managerA1),
    );
    const draft = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", () =>
        registerEnquiry(client, actors.managerA1, applicantId, draft.id),
      );
    });
    await asAdmin(
      `UPDATE "listings" SET "state" = 'ready_to_advertise' WHERE "id" = $1::uuid`,
      [draft.id],
    );
    await asActor(actors.negotiatorA1, async (client) => {
      const enquiry = await registerEnquiry(
        client,
        actors.negotiatorA1,
        applicantId,
        draft.id,
      );
      expect(enquiry.property_id).toBe(ids.propertyA1);
      expect(enquiry.responsible_branch_id).toBe(ids.branchA1);
      // One open enquiry per applicant and listing.
      await refused(client, "23505", () =>
        registerEnquiry(client, actors.negotiatorA1, applicantId, draft.id),
      );
    });
  });

  it("refuses roles that cannot work with applicants, and closed applicants", async () => {
    const listingId = await readyListing();
    const applicantId = await committed(actors.managerA1, (client) =>
      createApplicant(client, actors.managerA1),
    );
    for (const actor of [
      actors.propertyManagerA1,
      actors.readOnlyA1,
      actors.accountsA1,
    ]) {
      await asActor(actor, async (client) => {
        await refused(client, "42501", () =>
          registerEnquiry(client, actor, applicantId, listingId),
        );
      });
    }
    const closeReason = await reason("applicant");
    await committed(actors.managerA1, (client) =>
      moveApplicant(
        client,
        actors.managerA1,
        applicantId,
        "active",
        "closed",
        closeReason,
      ),
    );
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", () =>
        registerEnquiry(client, actors.managerA1, applicantId, listingId),
      );
    });
  });

  it("makes an applicant visible to the listing's branch through its enquiry, and only that applicant", async () => {
    const listingA2 = await readyListing(instructions.a2);
    const [withEnquiry] = await committed(actors.ownerA, async (client) => {
      const first = await createApplicant(client, actors.ownerA);
      const other = await extraContact();
      await createApplicant(client, actors.ownerA, { contactId: other });
      await registerEnquiry(client, actors.ownerA, first, listingA2);
      return [first];
    });
    expect(await visibleCount(actors.negotiatorA2, "applicants")).toBe(1);
    expect(
      await visibleCount(
        actors.negotiatorA2,
        "applicants",
        `"id" = '${withEnquiry}'`,
      ),
    ).toBe(1);
    expect(await visibleCount(actors.negotiatorA2, "property_enquiries")).toBe(
      1,
    );
    expect(await visibleCount(actors.negotiatorA1, "property_enquiries")).toBe(
      0,
    );
    expect(await visibleCount(actors.accountsA1, "property_enquiries")).toBe(0);
    // Seeing an applicant through an enquiry does not let you change it.
    await asActor(actors.negotiatorA2, async (client) => {
      const result = await client.query(
        `UPDATE "applicants" SET "lead_membership_id" = NULL
         WHERE "id" = $1::uuid`,
        [withEnquiry],
      );
      expect(result.rowCount).toBe(0);
    });
  });

  it("moves one step at a time with a history row, and closes only with a reason", async () => {
    const listingId = await readyListing();
    const { enquiryId } = await committed(actors.managerA1, async (client) => {
      const applicantId = await createApplicant(client, actors.managerA1);
      const enquiry = await registerEnquiry(
        client,
        actors.managerA1,
        applicantId,
        listingId,
      );
      return { enquiryId: enquiry.id };
    });
    const closeReason = await reason("property_enquiry");
    await asActor(actors.negotiatorA1, async (client) => {
      await refused(client, "23514", () =>
        client.query(
          `UPDATE "property_enquiries" SET "stage" = 'contacted'
           WHERE "id" = $1::uuid`,
          [enquiryId],
        ),
      );
      await refused(client, "23514", () =>
        moveEnquiry(client, actors.negotiatorA1, enquiryId, "new", "viewed"),
      );
      await refused(client, "23514", () =>
        moveEnquiry(client, actors.negotiatorA1, enquiryId, "new", "closed"),
      );
      // A staff member cannot pretend the listing closed it.
      await refused(client, "23514", () =>
        moveEnquiry(client, actors.negotiatorA1, enquiryId, "new", "closed", {
          kind: "listing_withdrawn",
          closedByListing: true,
        }),
      );
    });
    expect(
      await commitCode(actors.negotiatorA1, (client) =>
        moveEnquiry(client, actors.negotiatorA1, enquiryId, "new", "contacted"),
      ),
    ).toBeNull();
    expect(
      await commitCode(actors.negotiatorA1, (client) =>
        moveEnquiry(
          client,
          actors.negotiatorA1,
          enquiryId,
          "contacted",
          "closed",
          {
            reasonId: closeReason,
          },
        ),
      ),
    ).toBeNull();
    // Reopened back to New while the listing is still Ready to advertise.
    expect(
      await commitCode(actors.negotiatorA1, (client) =>
        moveEnquiry(client, actors.negotiatorA1, enquiryId, "closed", "new"),
      ),
    ).toBeNull();
    const { rows } = await adminPool.query(
      `SELECT "stage"::text AS "stage", "closure_reason_id"
       FROM "property_enquiries" WHERE "id" = $1::uuid`,
      [enquiryId],
    );
    expect(rows[0]).toEqual({ stage: "new", closure_reason_id: null });
    // Property Manager and Read Only can read but not move it.
    for (const actor of [actors.propertyManagerA1, actors.readOnlyA1]) {
      expect(
        await commitCode(actor, (client) =>
          moveEnquiry(client, actor, enquiryId, "new", "contacted"),
        ),
      ).toBe("42501");
    }
  });

  it("closes open enquiries when the listing is withdrawn, and they cannot be reopened", async () => {
    const listingId = await readyListing();
    const { enquiryId } = await committed(actors.managerA1, async (client) => {
      const applicantId = await createApplicant(client, actors.managerA1);
      const enquiry = await registerEnquiry(
        client,
        actors.managerA1,
        applicantId,
        listingId,
      );
      return { enquiryId: enquiry.id };
    });
    expect(
      await commitCode(actors.managerA1, (client) =>
        changeState(client, actors.managerA1, listingId, {
          kind: "withdrawn",
          from: "ready_to_advertise",
          to: "withdrawn",
          reason: "Landlord paused",
        }),
      ),
    ).toBeNull();
    const { rows } = await adminPool.query(
      `SELECT "stage"::text AS "stage", "closed_by_listing", "closure_note"
       FROM "property_enquiries" WHERE "id" = $1::uuid`,
      [enquiryId],
    );
    expect(rows[0]).toEqual({
      stage: "closed",
      closed_by_listing: true,
      closure_note: "Home no longer available",
    });
    const history = await adminPool.query(
      `SELECT "kind"::text AS "kind", "to_stage"::text AS "to_stage"
       FROM "property_enquiry_stage_history"
       WHERE "property_enquiry_id" = $1::uuid`,
      [enquiryId],
    );
    expect(history.rows).toEqual([
      { kind: "listing_withdrawn", to_stage: "closed" },
    ]);
    expect(
      await commitCode(actors.managerA1, (client) =>
        moveEnquiry(client, actors.managerA1, enquiryId, "closed", "new"),
      ),
    ).toBe("23514");
  });

  it("closes them too when a Property Manager ends the instruction, without letting them do anything else", async () => {
    const listingId = await readyListing();
    const { enquiryId } = await committed(actors.managerA1, async (client) => {
      const applicantId = await createApplicant(client, actors.managerA1);
      const enquiry = await registerEnquiry(
        client,
        actors.managerA1,
        applicantId,
        listingId,
      );
      return { enquiryId: enquiry.id };
    });
    // Before any withdrawal, a Property Manager cannot close it themselves.
    expect(
      await commitCode(actors.propertyManagerA1, (client) =>
        moveEnquiry(
          client,
          actors.propertyManagerA1,
          enquiryId,
          "new",
          "closed",
          {
            kind: "listing_withdrawn",
            closedByListing: true,
          },
        ),
      ),
    ).not.toBeNull();
    await endReadyInstruction(actors.propertyManagerA1, instructions.a1);
    expect(await listingState(listingId)).toBe("withdrawn");
    const { rows } = await adminPool.query(
      `SELECT "stage"::text AS "stage", "closed_by_listing"
       FROM "property_enquiries" WHERE "id" = $1::uuid`,
      [enquiryId],
    );
    expect(rows[0]).toEqual({ stage: "closed", closed_by_listing: true });
  });
});

describe("actions linked to applicants and enquiries", () => {
  it("links an action to an open applicant and its own enquiry, never another's, and never swaps the link", async () => {
    const listingId = await readyListing();
    const setUp = await committed(actors.managerA1, async (client) => {
      const first = await createApplicant(client, actors.managerA1);
      const otherContact = await extraContact();
      const second = await createApplicant(client, actors.managerA1, {
        contactId: otherContact,
      });
      const enquiry = await registerEnquiry(
        client,
        actors.managerA1,
        first,
        listingId,
      );
      return { first, second, enquiryId: enquiry.id };
    });
    const addAction = (
      client: PoolClient,
      applicantId: string | null,
      enquiryId: string | null,
    ) =>
      client.query<{ id: string }>(
        `INSERT INTO "actions" ("workspace_id", "responsible_branch_id", "title",
          "due_on", "assigned_membership_id", "applicant_id",
          "property_enquiry_id", "created_by_membership_id", "updated_at")
         VALUES ($1::uuid, $2::uuid, 'Call the applicant', public.uk_today(),
           $3::uuid, $4::uuid, $5::uuid, $3::uuid, CURRENT_TIMESTAMP)
         RETURNING "id"`,
        [ids.workspaceA, ids.branchA1, ids.managerA1, applicantId, enquiryId],
      );
    await asActor(actors.managerA1, async (client) => {
      const action = await addAction(client, setUp.first, setUp.enquiryId);
      await refused(client, "42501", () =>
        addAction(client, setUp.second, setUp.enquiryId),
      );
      // Refused by the link check (which runs first) or the table rule.
      await refused(client, ["23514", "42501"], () =>
        addAction(client, null, setUp.enquiryId),
      );
      await refused(client, "23514", () =>
        client.query(
          `UPDATE "actions" SET "applicant_id" = $2::uuid WHERE "id" = $1::uuid`,
          [action.rows[0].id, setUp.second],
        ),
      );
    });
  });
});

describe("review follow-ups (A2)", () => {
  const archive = (client: PoolClient, contactId: string) =>
    client.query(
      `UPDATE "contacts" SET "status" = 'archived', "archived_at" = now()
       WHERE "id" = $1::uuid`,
      [contactId],
    );

  it("refuses to archive a contact who leads an open applicant", async () => {
    const contactId = await extraContact();
    // With nothing linked, the same change is allowed.
    await asActor(actors.managerA1, async (client) => {
      await archive(client, contactId);
    });
    await committed(actors.managerA1, (client) =>
      createApplicant(client, actors.managerA1, { contactId }),
    );
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", () => archive(client, contactId));
    });
  });

  it("keeps the count right when a member is ended while the applicant is being closed", async () => {
    // The member also leads another open applicant, so their count starts at 2.
    const member = await extraContact();
    const closeReason = await reason("applicant");
    const { applicantId, memberId } = await committed(
      actors.managerA1,
      async (client) => {
        const applicant = await createApplicant(client, actors.managerA1);
        await createApplicant(client, actors.managerA1, { contactId: member });
        const row = await client.query<{ id: string }>(
          `INSERT INTO "applicant_members" ("workspace_id", "applicant_id",
            "contact_id", "added_by_membership_id")
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid) RETURNING "id"`,
          [ids.workspaceA, applicant, member, ids.managerA1],
        );
        return { applicantId: applicant, memberId: row.rows[0].id };
      },
    );
    expect(await applicantCount(member)).toBe(2);

    const first = await runtimePool.connect();
    const second = await runtimePool.connect();
    try {
      for (const client of [first, second]) {
        await client.query("BEGIN");
        await client.query("SET LOCAL lock_timeout = '10s'");
        await setContext(client, actors.managerA1);
      }
      await first.query(
        `UPDATE "applicant_members" SET "ended_at" = now() WHERE "id" = $1::uuid`,
        [memberId],
      );
      // The close waits for the member change, then counts what is left.
      const closing = moveApplicant(
        second,
        actors.managerA1,
        applicantId,
        "active",
        "closed",
        closeReason,
      );
      await first.query("COMMIT");
      await closing;
      await second.query("COMMIT");
    } finally {
      for (const client of [first, second]) {
        await client.query("ROLLBACK").catch(() => undefined);
        client.release();
      }
    }
    expect(await applicantCount(member)).toBe(1);
    expect(await applicantCount(ids.personA1)).toBe(0);
  });

  it("reopens an enquiry only for an open applicant on a Ready to advertise listing", async () => {
    const listingId = await readyListing();
    const enquiryReason = await reason("property_enquiry");
    const applicantReason = await reason("applicant");
    const { applicantId, enquiryId } = await committed(
      actors.managerA1,
      async (client) => {
        const applicant = await createApplicant(client, actors.managerA1);
        const enquiry = await registerEnquiry(
          client,
          actors.managerA1,
          applicant,
          listingId,
        );
        return { applicantId: applicant, enquiryId: enquiry.id };
      },
    );
    await committed(actors.managerA1, (client) =>
      moveEnquiry(client, actors.managerA1, enquiryId, "new", "closed", {
        reasonId: enquiryReason,
      }),
    );
    // Listing back in preparation: no reopening.
    await asAdmin(
      `UPDATE "listings" SET "state" = 'draft' WHERE "id" = $1::uuid`,
      [listingId],
    );
    expect(
      await commitCode(actors.managerA1, (client) =>
        moveEnquiry(client, actors.managerA1, enquiryId, "closed", "new"),
      ),
    ).toBe("23514");
    await asAdmin(
      `UPDATE "listings" SET "state" = 'ready_to_advertise' WHERE "id" = $1::uuid`,
      [listingId],
    );
    // Closed applicant: no reopening either.
    await committed(actors.managerA1, (client) =>
      moveApplicant(
        client,
        actors.managerA1,
        applicantId,
        "active",
        "closed",
        applicantReason,
      ),
    );
    expect(
      await commitCode(actors.managerA1, (client) =>
        moveEnquiry(client, actors.managerA1, enquiryId, "closed", "new"),
      ),
    ).toBe("23514");
  });

  it("never lets a closure be rewritten after closing", async () => {
    const listingId = await readyListing();
    const enquiryReason = await reason("property_enquiry");
    const otherEnquiryReason = await reason("property_enquiry");
    const applicantReason = await reason("applicant");
    const otherApplicantReason = await reason("applicant");
    const { applicantId, enquiryId } = await committed(
      actors.managerA1,
      async (client) => {
        const applicant = await createApplicant(client, actors.managerA1);
        const enquiry = await registerEnquiry(
          client,
          actors.managerA1,
          applicant,
          listingId,
        );
        return { applicantId: applicant, enquiryId: enquiry.id };
      },
    );
    await committed(actors.managerA1, async (client) => {
      await moveEnquiry(client, actors.managerA1, enquiryId, "new", "closed", {
        reasonId: enquiryReason,
      });
    });
    await committed(actors.managerA1, (client) =>
      moveApplicant(
        client,
        actors.managerA1,
        applicantId,
        "active",
        "closed",
        applicantReason,
      ),
    );
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", () =>
        client.query(
          `UPDATE "applicants" SET "closure_reason_id" = $2::uuid
           WHERE "id" = $1::uuid`,
          [applicantId, otherApplicantReason],
        ),
      );
      await refused(client, "23514", () =>
        client.query(
          `UPDATE "applicants" SET "closure_note" = 'Rewritten'
           WHERE "id" = $1::uuid`,
          [applicantId],
        ),
      );
      await refused(client, "23514", () =>
        client.query(
          `UPDATE "property_enquiries" SET "closure_reason_id" = $2::uuid
           WHERE "id" = $1::uuid`,
          [enquiryId, otherEnquiryReason],
        ),
      );
      await refused(client, "23514", () =>
        client.query(
          `UPDATE "property_enquiries" SET "closure_note" = 'Rewritten'
           WHERE "id" = $1::uuid`,
          [enquiryId],
        ),
      );
    });
  });
});
