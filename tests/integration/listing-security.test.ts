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
        ($1::uuid, 'listings-a', 'Documents A', 'agency', CURRENT_TIMESTAMP),
        ($2::uuid, 'listings-b', 'Documents B', 'agency', CURRENT_TIMESTAMP)`,
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

const markContentReady = (
  client: PoolClient,
  actor: Actor,
  listingId: string,
  versionNo = 1,
) =>
  changeState(client, actor, listingId, {
    kind: "marked_content_ready",
    from: "draft",
    to: "content_ready",
    versionNo,
    epcPosition: "not_assessed",
  });

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

async function events(listingId: string) {
  const { rows } = await adminPool.query<{ kind: string; reason: string }>(
    `SELECT "kind"::text AS "kind", COALESCE("reason", '') AS "reason"
     FROM "listing_events" WHERE "listing_id" = $1::uuid
     ORDER BY "recorded_at", "id"`,
    [listingId],
  );
  return rows;
}

async function returnToOnboarding(actor: Actor, instructionId: string) {
  await committed(actor, async (client) => {
    await client.query(
      `INSERT INTO "instruction_journey_history" ("workspace_id",
        "instruction_id", "from_stage", "to_stage", "reason",
        "changed_by_membership_id")
       VALUES ($1::uuid, $2::uuid, 'ready_to_market', 'onboarding',
         'Fees changed', $3::uuid)`,
      [actor.workspaceId, instructionId, actor.membershipId],
    );
    await client.query(
      `UPDATE "instructions" SET "journey_stage" = 'onboarding',
         "updated_at" = now()
       WHERE "id" = $1::uuid`,
      [instructionId],
    );
  });
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

/** Gives the property an EPC that Applies and is commissioned (awaiting evidence). */
async function commissionedEpc(propertyId: string) {
  const item = await asAdmin(
    `INSERT INTO "property_compliance_items" ("workspace_id", "property_id",
      "area", "requirement_id", "created_by_membership_id")
     SELECT $1::uuid, $2::uuid, 'epc_mees', r."id", $3::uuid
     FROM "compliance_requirements" AS r WHERE r."area" = 'epc_mees'
     RETURNING "id"`,
    [ids.workspaceA, propertyId, ids.managerA1],
  );
  const itemId = item.rows[0].id as string;
  await asAdmin(
    `INSERT INTO "property_compliance_assessments" ("workspace_id", "item_id",
      "applicability", "recorded_by_membership_id", "recorded_at")
     VALUES ($1::uuid, $2::uuid, 'applies', $3::uuid, clock_timestamp())`,
    [ids.workspaceA, itemId, ids.managerA1],
  );
  await asAdmin(
    `INSERT INTO "property_compliance_status_events" ("workspace_id",
      "item_id", "status", "recorded_by_membership_id", "recorded_at")
     VALUES ($1::uuid, $2::uuid, 'awaiting_evidence', $3::uuid,
       clock_timestamp())`,
    [ids.workspaceA, itemId, ids.managerA1],
  );
  return itemId;
}

/** The database's message when work in a rolled-back transaction is refused. */
async function errorMessage(
  actor: Actor,
  work: (client: PoolClient) => Promise<unknown>,
) {
  let message = "";
  await asActor(actor, async (client) => {
    await work(client).catch((error: { message?: string }) => {
      message = error.message ?? "";
    });
  });
  return message;
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

describe("preparing a listing", () => {
  it("lets Account Owner, Branch Manager and Negotiator prepare one in their branch", async () => {
    for (const actor of [
      actors.ownerA,
      actors.managerA1,
      actors.negotiatorA1,
    ]) {
      await asActor(actor, async (client) => {
        await prepareListing(client, actor, instructions.a1);
      });
    }
  });

  it("refuses Property Manager, Accounts, Read Only, suspended members and other branches", async () => {
    for (const actor of [
      actors.propertyManagerA1,
      actors.accountsA1,
      actors.readOnlyA1,
      actors.suspendedA1,
      actors.negotiatorA2,
    ]) {
      await asActor(actor, async (client) => {
        await refused(client, "42501", () =>
          prepareListing(client, actor, instructions.a1),
        );
      });
    }
    await asActor(actors.ownerB, async (client) => {
      await refused(client, "42501", () =>
        prepareListing(client, actors.ownerB, instructions.a1),
      );
    });
  });

  it("needs a Ready to market instruction and takes its property from it", async () => {
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", () =>
        prepareListing(client, actors.managerA1, instructions.a1Ended),
      );
      const { propertyId } = await prepareListing(
        client,
        actors.managerA1,
        instructions.a1,
        ids.propertyA2,
      );
      expect(propertyId).toBe(ids.propertyA1);
    });
  });

  it("keeps one current listing per instruction", async () => {
    await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    await asActor(actors.negotiatorA1, async (client) => {
      await refused(client, "23505", () =>
        prepareListing(client, actors.negotiatorA1, instructions.a1),
      );
    });
  });

  it("refuses a listing without its first version at commit", async () => {
    expect(
      await commitCode(actors.managerA1, (client) =>
        client.query(
          `INSERT INTO "listings" ("workspace_id", "instruction_id",
            "property_id", "created_by_membership_id")
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid)`,
          [ids.workspaceA, instructions.a1, ids.propertyA1, ids.managerA1],
        ),
      ),
    ).toBe("23514");
  });
});

describe("listing content", () => {
  it("numbers versions itself and copies the rent from the latest terms", async () => {
    await asAdmin(
      `UPDATE "instruction_terms_versions"
       SET "asking_rent_pence" = 145000, "rent_period" = 'month'
       WHERE "instruction_id" = $1::uuid`,
      [instructions.a1],
    );
    await asActor(actors.negotiatorA1, async (client) => {
      const { id } = await prepareListing(
        client,
        actors.negotiatorA1,
        instructions.a1,
      );
      expect(
        await saveVersion(client, actors.negotiatorA1, id, { rent: 1 }),
      ).toBe(2);
      const { rows } = await client.query<{
        version_no: number;
        advertised_rent_pence: number;
        rent_period: string;
      }>(
        `SELECT "version_no", "advertised_rent_pence", "rent_period"::text
         FROM "listing_content_versions" WHERE "listing_id" = $1::uuid
         ORDER BY "version_no"`,
        [id],
      );
      expect(rows).toEqual([
        { version_no: 1, advertised_rent_pence: 145000, rent_period: "month" },
        { version_no: 2, advertised_rent_pence: 145000, rent_period: "month" },
      ]);
    });
  });

  it("refuses Property Manager and Read Only, and never changes or deletes history", async () => {
    const { id } = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    for (const actor of [actors.propertyManagerA1, actors.readOnlyA1]) {
      await asActor(actor, async (client) => {
        await refused(client, "42501", () => saveVersion(client, actor, id));
      });
    }
    await asActor(actors.ownerA, async (client) => {
      for (const table of ["listing_content_versions", "listing_events"]) {
        await refused(client, "42501", () =>
          client.query(`UPDATE "${table}" SET "workspace_id" = "workspace_id"`),
        );
        await refused(client, "42501", () =>
          client.query(`DELETE FROM "${table}"`),
        );
      }
      await refused(client, "42501", () =>
        client.query(`DELETE FROM "listings"`),
      );
      await refused(client, "42501", () =>
        client.query(
          `UPDATE "listings" SET "created_by_membership_id" = $1::uuid`,
          [ids.ownerA],
        ),
      );
    });
  });

  it("shows listings, versions and events only within branch and workspace", async () => {
    await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    const count = async (actor: Actor, table: string) => {
      let total = 0;
      await asActor(actor, async (client) => {
        const { rows } = await client.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM "${table}"`,
        );
        total = rows[0].n;
      });
      return total;
    };
    for (const table of [
      "listings",
      "listing_content_versions",
      "listing_events",
    ]) {
      for (const actor of [
        actors.ownerA,
        actors.negotiatorA1,
        actors.propertyManagerA1,
        actors.accountsA1,
        actors.readOnlyA1,
      ]) {
        expect(await count(actor, table), table).toBeGreaterThan(0);
      }
      for (const actor of [
        actors.negotiatorA2,
        actors.suspendedA1,
        actors.ownerB,
      ]) {
        expect(await count(actor, table), table).toBe(0);
      }
    }
  });
});

describe("changing a listing's state", () => {
  it("needs an event, by a reviewer, for an allowed move", async () => {
    const { id } = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    await asActor(actors.negotiatorA1, async (client) => {
      await refused(client, "23514", () =>
        client.query(
          `UPDATE "listings" SET "state" = 'content_ready'
           WHERE "id" = $1::uuid`,
          [id],
        ),
      );
      // Draft cannot jump to Ready to advertise: the event shape refuses it.
      await refused(client, "23514", () =>
        changeState(client, actors.negotiatorA1, id, {
          kind: "marked_ready_to_advertise",
          from: "draft",
          to: "ready_to_advertise",
          versionNo: 1,
          epcPosition: "evidence_reviewed",
          mediaFingerprint: "",
        }),
      );
      await markContentReady(client, actors.negotiatorA1, id);
    });
    for (const actor of [actors.propertyManagerA1, actors.readOnlyA1]) {
      await asActor(actor, async (client) => {
        await refused(client, "42501", () =>
          markContentReady(client, actor, id),
        );
      });
    }
  });

  it("refuses an event that claims a state the listing is not in", async () => {
    const { id } = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", () =>
        changeState(client, actors.managerA1, id, {
          kind: "returned_to_draft",
          from: "content_ready",
          to: "draft",
          reason: "Wrong",
        }),
      );
    });
  });

  it("only reviews the current version, and an edit must go back to Draft", async () => {
    const { id } = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    await committed(actors.managerA1, (client) =>
      saveVersion(client, actors.managerA1, id),
    );
    // Reviewing version 1 when version 2 exists fails at commit.
    expect(
      await commitCode(actors.managerA1, (client) =>
        markContentReady(client, actors.managerA1, id, 1),
      ),
    ).toBe("23514");
    expect(
      await commitCode(actors.managerA1, (client) =>
        markContentReady(client, actors.managerA1, id, 2),
      ),
    ).toBeNull();

    // Saving a new version on a reviewed listing without going back fails.
    expect(
      await commitCode(actors.negotiatorA1, (client) =>
        saveVersion(client, actors.negotiatorA1, id),
      ),
    ).toBe("23514");
    expect(
      await commitCode(actors.negotiatorA1, async (client) => {
        const versionNo = await saveVersion(client, actors.negotiatorA1, id);
        await changeState(client, actors.negotiatorA1, id, {
          kind: "edited_after_review",
          from: "content_ready",
          to: "draft",
          versionNo,
        });
      }),
    ).toBeNull();
    expect(await listingState(id)).toBe("draft");
  });

  it("cannot reach Ready to advertise before listing media exists, even with good EPC evidence", async () => {
    const { id } = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    await committed(actors.managerA1, (client) =>
      markContentReady(client, actors.managerA1, id),
    );
    // A commissioned EPC satisfies the EPC rule, so only the media rule is left.
    await commissionedEpc(ids.propertyA1);
    const message = await errorMessage(actors.managerA1, (client) =>
      changeState(client, actors.managerA1, id, {
        kind: "marked_ready_to_advertise",
        from: "content_ready",
        to: "ready_to_advertise",
        versionNo: 1,
        epcPosition: "commissioned_awaiting",
        mediaFingerprint: "",
      }),
    );
    expect(message).toContain("minimum media");
  });

  it("withdraws with a reason, finally, and then allows a new listing", async () => {
    const { id } = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", () =>
        changeState(client, actors.managerA1, id, {
          kind: "withdrawn",
          from: "draft",
          to: "withdrawn",
        }),
      );
    });
    await committed(actors.managerA1, (client) =>
      changeState(client, actors.managerA1, id, {
        kind: "withdrawn",
        from: "draft",
        to: "withdrawn",
        reason: "Landlord wants to wait",
      }),
    );
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", () =>
        saveVersion(client, actors.managerA1, id),
      );
      await prepareListing(client, actors.managerA1, instructions.a1);
    });
  });
});

describe("following the instruction", () => {
  it("takes a reviewed listing back to Draft when the instruction returns to Onboarding", async () => {
    const { id } = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    await committed(actors.managerA1, (client) =>
      markContentReady(client, actors.managerA1, id),
    );
    // A Property Manager cannot prepare listings but can work the instruction.
    await returnToOnboarding(actors.propertyManagerA1, instructions.a1);
    expect(await listingState(id)).toBe("draft");
    expect((await events(id)).at(-1)).toEqual({
      kind: "instruction_returned",
      reason: "Fees changed",
    });
  });

  it("leaves a draft alone when the instruction returns to Onboarding", async () => {
    const { id } = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    await returnToOnboarding(actors.managerA1, instructions.a1);
    expect(await listingState(id)).toBe("draft");
    expect((await events(id)).map((event) => event.kind)).not.toContain(
      "instruction_returned",
    );
  });

  it("withdraws the current listing when the instruction ends", async () => {
    const { id } = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    await endReadyInstruction(actors.propertyManagerA1, instructions.a1);
    expect(await listingState(id)).toBe("withdrawn");
    expect((await events(id)).at(-1)).toEqual({
      kind: "instruction_ended",
      reason: "Landlord is selling",
    });
  });

  it("refuses an instruction-driven event when the instruction did not change", async () => {
    const { id } = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    expect(
      await commitCode(actors.propertyManagerA1, (client) =>
        changeState(client, actors.propertyManagerA1, id, {
          kind: "instruction_ended",
          from: "draft",
          to: "withdrawn",
          reason: "Pretend",
        }),
      ),
    ).toBe("23514");
    await asActor(actors.propertyManagerA1, async (client) => {
      await refused(client, "42501", () =>
        changeState(client, actors.propertyManagerA1, id, {
          kind: "withdrawn",
          from: "draft",
          to: "withdrawn",
          reason: "Not allowed",
        }),
      );
    });
    expect(await listingState(id)).toBe("draft");
  });
});

describe("the EPC rule for Ready to advertise", () => {
  async function epcItem() {
    const item = await asAdmin(
      `INSERT INTO "property_compliance_items" ("workspace_id", "property_id",
        "area", "requirement_id", "created_by_membership_id")
       SELECT $1::uuid, $2::uuid, 'epc_mees', r."id", $3::uuid
       FROM "compliance_requirements" AS r WHERE r."area" = 'epc_mees'
       RETURNING "id"`,
      [ids.workspaceA, ids.propertyA1, ids.managerA1],
    );
    return item.rows[0].id as string;
  }
  const assess = (item: string, applicability: string, reason: string | null) =>
    asAdmin(
      `INSERT INTO "property_compliance_assessments" ("workspace_id",
        "item_id", "applicability", "reason", "recorded_by_membership_id",
        "recorded_at")
       VALUES ($1::uuid, $2::uuid, $3::compliance_applicability, $4, $5::uuid,
         clock_timestamp())`,
      [ids.workspaceA, item, applicability, reason, ids.managerA1],
    );
  async function evidence(
    item: string,
    rating: string | null,
    expiresOn: string | null,
  ) {
    const row = await asAdmin(
      `INSERT INTO "property_compliance_evidence" ("workspace_id", "item_id",
        "event_on", "expires_on", "epc_rating", "recorded_by_membership_id")
       VALUES ($1::uuid, $2::uuid, DATE '2015-01-01', $3::date, $4, $5::uuid)
       RETURNING "id"`,
      [ids.workspaceA, item, expiresOn, rating, ids.managerA1],
    );
    return row.rows[0].id as string;
  }
  const status = (item: string, value: string, evidenceId: string | null) =>
    asAdmin(
      `INSERT INTO "property_compliance_status_events" ("workspace_id",
        "item_id", "status", "evidence_id", "note",
        "recorded_by_membership_id", "recorded_at")
       VALUES ($1::uuid, $2::uuid, $3::compliance_evidence_status, $4::uuid,
         'Note', $5::uuid, clock_timestamp())`,
      [ids.workspaceA, item, value, evidenceId, ids.managerA1],
    );
  async function allows() {
    let result = false;
    await asActor(actors.managerA1, async (client) => {
      const { rows } = await client.query<{ ok: boolean }>(
        `SELECT public.listing_epc_allows_advertising($1::uuid, $2::uuid) AS ok`,
        [ids.workspaceA, ids.propertyA1],
      );
      result = rows[0].ok;
    });
    return result;
  }

  it("blocks until the EPC position is assessed", async () => {
    expect(await allows()).toBe(false);
    const item = await epcItem();
    expect(await allows()).toBe(false);
    await assess(item, "needs_specialist_review", "Unsure");
    expect(await allows()).toBe(false);
    await assess(item, "does_not_apply", "Listed building exemption");
    expect(await allows()).toBe(true);
  });

  it("allows reviewed unexpired evidence or a commissioned EPC, and blocks the rest", async () => {
    const item = await epcItem();
    await assess(item, "applies", null);
    expect(await allows()).toBe(false);
    await status(item, "awaiting_evidence", null);
    expect(await allows()).toBe(true);
    const good = await evidence(item, "C", "2099-01-01");
    await status(item, "reviewed", good);
    expect(await allows()).toBe(true);
    await status(item, "action_required", good);
    expect(await allows()).toBe(false);
    const expired = await evidence(item, "C", "2020-01-01");
    await status(item, "reviewed", expired);
    expect(await allows()).toBe(false);
  });

  it("blocks reviewed evidence with no energy rating", async () => {
    const item = await epcItem();
    await assess(item, "applies", null);
    const unrated = await evidence(item, null, "2099-01-01");
    await status(item, "reviewed", unrated);
    expect(await allows()).toBe(false);
    const rated = await evidence(item, "B", "2099-01-01");
    await status(item, "reviewed", rated);
    expect(await allows()).toBe(true);
  });

  it("blocks a rating of F or G unless Does not apply is recorded with a reason", async () => {
    const item = await epcItem();
    await assess(item, "applies", null);
    for (const rating of ["F", "G"]) {
      const rated = await evidence(item, rating, "2099-01-01");
      await status(item, "reviewed", rated);
      expect(await allows(), rating).toBe(false);
    }
    await assess(item, "does_not_apply", "Valid exemption registered");
    expect(await allows()).toBe(true);
  });
});

describe("review findings (M2)", () => {
  it("refuses a review while the instruction is back in Onboarding", async () => {
    const { id } = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    await returnToOnboarding(actors.managerA1, instructions.a1);
    expect(
      await commitCode(actors.managerA1, (client) =>
        markContentReady(client, actors.managerA1, id),
      ),
    ).toBe("23514");
    expect(await listingState(id)).toBe("draft");
  });

  it("refuses a review of a version based on terms that have since changed", async () => {
    const { id } = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    await asAdmin(
      `INSERT INTO "instruction_terms_versions" ("workspace_id",
        "instruction_id", "service", "created_by_membership_id", "created_at")
       VALUES ($1::uuid, $2::uuid, 'fully_managed', $3::uuid,
         now() + interval '1 second')`,
      [ids.workspaceA, instructions.a1, ids.managerA1],
    );
    expect(
      await errorMessage(actors.managerA1, (client) =>
        markContentReady(client, actors.managerA1, id),
      ),
    ).toContain("terms changed");
    // Saving a new version picks up the new terms, and the review goes through.
    expect(
      await commitCode(actors.managerA1, async (client) => {
        const versionNo = await saveVersion(client, actors.managerA1, id);
        await markContentReady(client, actors.managerA1, id, versionNo);
      }),
    ).toBeNull();
  });

  it("refuses an edit-after-review event that saved nothing", async () => {
    const { id } = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    await committed(actors.managerA1, (client) =>
      markContentReady(client, actors.managerA1, id),
    );
    expect(
      await commitCode(actors.managerA1, (client) =>
        changeState(client, actors.managerA1, id, {
          kind: "edited_after_review",
          from: "content_ready",
          to: "draft",
          versionNo: 999,
        }),
      ),
    ).toBe("23514");
    expect(await listingState(id)).toBe("content_ready");
  });

  it("allows only one created event per listing", async () => {
    const { id } = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23505", () =>
        client.query(
          `INSERT INTO "listing_events" ("workspace_id", "listing_id", "kind",
            "actor_membership_id")
           VALUES ($1::uuid, $2::uuid, 'created', $3::uuid)`,
          [ids.workspaceA, id, ids.managerA1],
        ),
      );
    });
  });

  it("refuses a Property Manager faking a return to Onboarding", async () => {
    const { id } = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    await committed(actors.managerA1, (client) =>
      markContentReady(client, actors.managerA1, id),
    );
    expect(
      await commitCode(actors.propertyManagerA1, (client) =>
        changeState(client, actors.propertyManagerA1, id, {
          kind: "instruction_returned",
          from: "content_ready",
          to: "draft",
          reason: "Pretend",
        }),
      ),
    ).toBe("23514");
    expect(await listingState(id)).toBe("content_ready");
  });

  it("refuses versions, events and state changes from another branch or workspace", async () => {
    const { id } = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    for (const actor of [actors.negotiatorA2, actors.ownerB]) {
      await asActor(actor, async (client) => {
        await refused(client, ["42501", "23503"], () =>
          saveVersion(client, actor, id),
        );
        await refused(client, ["42501", "23503"], () =>
          markContentReady(client, actor, id),
        );
      });
    }
    expect(await listingState(id)).toBe("draft");
  });

  it("refuses an EPC snapshot pointing at another property's evidence", async () => {
    const { id } = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    const otherItem = await commissionedEpc(ids.propertyA1Ended);
    const evidence = await asAdmin(
      `INSERT INTO "property_compliance_evidence" ("workspace_id", "item_id",
        "event_on", "recorded_by_membership_id")
       VALUES ($1::uuid, $2::uuid, DATE '2024-01-01', $3::uuid)
       RETURNING "id"`,
      [ids.workspaceA, otherItem, ids.managerA1],
    );
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", () =>
        client.query(
          `INSERT INTO "listing_events" ("workspace_id", "listing_id", "kind",
            "from_state", "to_state", "version_no", "epc_position",
            "epc_evidence_id", "actor_membership_id")
           VALUES ($1::uuid, $2::uuid, 'marked_content_ready', 'draft',
             'content_ready', 1, 'evidence_reviewed', $3::uuid, $4::uuid)`,
          [ids.workspaceA, id, evidence.rows[0].id, ids.managerA1],
        ),
      );
    });
  });
});

describe("listing media (M5)", () => {
  /** A stored listing file uploaded by the actor, in the open transaction. */
  async function storedListingFile(
    client: PoolClient,
    actor: Actor,
    listingId: string,
    kind: "listing_photo" | "listing_floorplan" = "listing_photo",
    media: "jpeg" | "png" | "pdf" = "jpeg",
  ) {
    const row = await client.query<{ id: string }>(
      `INSERT INTO "documents" ("workspace_id", "kind", "listing_id",
        "display_name", "media_type", "byte_size", "sha256",
        "uploaded_by_membership_id")
       VALUES ($1::uuid, $2::document_kind, $3::uuid, 'Photo 1.jpg',
         $4::document_media, 1024, $5, $6::uuid)
       RETURNING "id"`,
      [
        actor.workspaceId,
        kind,
        listingId,
        media,
        "d".repeat(64),
        actor.membershipId,
      ],
    );
    const id = row.rows[0].id;
    await client.query(
      `UPDATE "documents" SET "status" = 'stored' WHERE "id" = $1::uuid`,
      [id],
    );
    return id;
  }

  async function addMedia(
    client: PoolClient,
    actor: Actor,
    listingId: string,
    documentId: string,
    position = 1,
  ) {
    const row = await client.query<{ id: string; role: string }>(
      `INSERT INTO "listing_media" ("workspace_id", "listing_id",
        "document_id", "role", "position", "added_by_membership_id")
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'photo', $4, $5::uuid)
       RETURNING "id", "role"::text AS "role"`,
      [actor.workspaceId, listingId, documentId, position, actor.membershipId],
    );
    return row.rows[0];
  }

  async function addFiles(
    client: PoolClient,
    actor: Actor,
    listingId: string,
    photos: number,
    floorplans: number,
  ) {
    let position = 1;
    for (let i = 0; i < photos; i += 1) {
      const doc = await storedListingFile(client, actor, listingId);
      await addMedia(client, actor, listingId, doc, position++);
    }
    for (let i = 0; i < floorplans; i += 1) {
      const doc = await storedListingFile(
        client,
        actor,
        listingId,
        "listing_floorplan",
        "pdf",
      );
      await addMedia(client, actor, listingId, doc, position++);
    }
  }

  const contentReadyListing = async () => {
    const { id } = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    await committed(actors.managerA1, (client) =>
      markContentReady(client, actors.managerA1, id),
    );
    return id;
  };

  const readyToAdvertise = (client: PoolClient, actor: Actor, id: string) =>
    changeState(client, actor, id, {
      kind: "marked_ready_to_advertise",
      from: "content_ready",
      to: "ready_to_advertise",
      versionNo: 1,
      epcPosition: "commissioned_awaiting",
      mediaFingerprint: "reviewed",
    });

  it("lets preparers add photos and floorplans, and sets the role from the file's kind", async () => {
    const { id } = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    await asActor(actors.negotiatorA1, async (client) => {
      const photo = await storedListingFile(client, actors.negotiatorA1, id);
      expect(
        (await addMedia(client, actors.negotiatorA1, id, photo)).role,
      ).toBe("photo");
      const plan = await storedListingFile(
        client,
        actors.negotiatorA1,
        id,
        "listing_floorplan",
        "pdf",
      );
      expect(
        (await addMedia(client, actors.negotiatorA1, id, plan, 2)).role,
      ).toBe("floorplan");
      // A photo must be an image.
      await refused(client, "23514", () =>
        storedListingFile(
          client,
          actors.negotiatorA1,
          id,
          "listing_photo",
          "pdf",
        ),
      );
    });
  });

  it("refuses Property Manager, Read Only and other branches or workspaces", async () => {
    const { id } = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    for (const actor of [
      actors.propertyManagerA1,
      actors.readOnlyA1,
      actors.accountsA1,
      actors.negotiatorA2,
    ]) {
      await asActor(actor, async (client) => {
        await refused(client, "42501", () =>
          storedListingFile(client, actor, id),
        );
      });
    }
    await asActor(actors.ownerB, async (client) => {
      await refused(client, ["42501", "23503"], () =>
        storedListingFile(client, actors.ownerB, id),
      );
    });
  });

  it("shows listing files only to staff who can see the listing", async () => {
    const { id } = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    await committed(actors.managerA1, async (client) => {
      const doc = await storedListingFile(client, actors.managerA1, id);
      await addMedia(client, actors.managerA1, id, doc);
    });
    const count = async (actor: Actor, table: string) => {
      let total = 0;
      await asActor(actor, async (client) => {
        const { rows } = await client.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM "${table}"`,
        );
        total = rows[0].n;
      });
      return total;
    };
    for (const table of ["documents", "listing_media"]) {
      expect(await count(actors.readOnlyA1, table), table).toBe(1);
      expect(await count(actors.propertyManagerA1, table), table).toBe(1);
      expect(await count(actors.negotiatorA2, table), table).toBe(0);
      expect(await count(actors.ownerB, table), table).toBe(0);
    }
  });

  it("refuses another listing's file and someone else's upload", async () => {
    const first = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    const other = await committed(actors.managerA1, (client) =>
      storedListingFile(client, actors.managerA1, first.id),
    );
    await asActor(actors.negotiatorA1, async (client) => {
      // The file was uploaded by the manager, not this negotiator.
      await refused(client, "23514", () =>
        addMedia(client, actors.negotiatorA1, first.id, other),
      );
    });
  });

  it("keeps the caps of 30 photos and 3 floorplans", async () => {
    const { id } = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    await asActor(actors.managerA1, async (client) => {
      await addFiles(client, actors.managerA1, id, 30, 3);
      const photo = await storedListingFile(client, actors.managerA1, id);
      await refused(client, "23514", () =>
        addMedia(client, actors.managerA1, id, photo, 99),
      );
      const plan = await storedListingFile(
        client,
        actors.managerA1,
        id,
        "listing_floorplan",
        "pdf",
      );
      await refused(client, "23514", () =>
        addMedia(client, actors.managerA1, id, plan, 99),
      );
    });
  });

  it("reaches Ready to advertise with the EPC rule and 5 photos and a floorplan, and not with 4", async () => {
    await commissionedEpc(ids.propertyA1);
    const id = await contentReadyListing();
    await committed(actors.managerA1, (client) =>
      addFiles(client, actors.managerA1, id, 4, 1),
    );
    expect(
      await errorMessage(actors.managerA1, (client) =>
        readyToAdvertise(client, actors.managerA1, id),
      ),
    ).toContain("minimum media");
    await committed(actors.managerA1, async (client) => {
      const doc = await storedListingFile(client, actors.managerA1, id);
      await addMedia(client, actors.managerA1, id, doc, 10);
    });
    expect(
      await commitCode(actors.negotiatorA1, (client) =>
        readyToAdvertise(client, actors.negotiatorA1, id),
      ),
    ).toBeNull();
    expect(await listingState(id)).toBe("ready_to_advertise");
  });

  it("freezes the media while Ready to advertise", async () => {
    await commissionedEpc(ids.propertyA1);
    const id = await contentReadyListing();
    await committed(actors.managerA1, (client) =>
      addFiles(client, actors.managerA1, id, 5, 1),
    );
    await committed(actors.managerA1, (client) =>
      readyToAdvertise(client, actors.managerA1, id),
    );
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", () =>
        storedListingFile(client, actors.managerA1, id),
      );
      await refused(client, "23514", () =>
        client.query(
          `UPDATE "listing_media" SET "position" = "position" + 1
           WHERE "listing_id" = $1::uuid`,
          [id],
        ),
      );
      await refused(client, "23514", () =>
        client.query(
          `UPDATE "listing_media" SET "removed_reason" = 'Blurry'
           WHERE "listing_id" = $1::uuid`,
          [id],
        ),
      );
    });
  });

  it("removes a file only after its media row, and never changes or deletes media", async () => {
    const { id } = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    const doc = await committed(actors.managerA1, async (client) => {
      const file = await storedListingFile(client, actors.managerA1, id);
      await addMedia(client, actors.managerA1, id, file);
      return file;
    });
    const removeFile = (client: PoolClient) =>
      client.query(
        `UPDATE "documents" SET "status" = 'removed',
          "removal_reason" = 'Blurry', "removed_by_membership_id" = $2::uuid
         WHERE "id" = $1::uuid`,
        [doc, ids.managerA1],
      );
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", () => removeFile(client));
      // Only the order, caption and removal are granted to the app.
      await refused(client, "42501", () =>
        client.query(
          `UPDATE "listing_media" SET "document_id" = gen_random_uuid()
           WHERE "listing_id" = $1::uuid`,
          [id],
        ),
      );
      await refused(client, "42501", () =>
        client.query(`DELETE FROM "listing_media"`),
      );
      await client.query(
        `UPDATE "listing_media" SET "removed_reason" = 'Blurry'
         WHERE "listing_id" = $1::uuid`,
        [id],
      );
      await removeFile(client);
      const { rows } = await client.query<{ by: string; removed: boolean }>(
        `SELECT "removed_by_membership_id"::text AS "by",
           "removed_at" IS NOT NULL AS "removed"
         FROM "listing_media" WHERE "listing_id" = $1::uuid`,
        [id],
      );
      expect(rows).toEqual([{ by: ids.managerA1, removed: true }]);
    });
  });

  it("refuses media on a withdrawn listing", async () => {
    const { id } = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    await committed(actors.managerA1, (client) =>
      changeState(client, actors.managerA1, id, {
        kind: "withdrawn",
        from: "draft",
        to: "withdrawn",
        reason: "Not going ahead",
      }),
    );
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", () =>
        storedListingFile(client, actors.managerA1, id),
      );
    });
  });

  it("queues two uploads to the same listing instead of deadlocking", async () => {
    const { id } = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    const first = await runtimePool.connect();
    const second = await runtimePool.connect();
    try {
      for (const client of [first, second]) {
        await client.query("BEGIN");
        await client.query("SET LOCAL lock_timeout = '10s'");
        await setContext(client, actors.managerA1);
      }
      const firstDoc = await storedListingFile(first, actors.managerA1, id);
      // The second upload waits on the first, which then adds its media.
      const secondDoc = storedListingFile(second, actors.managerA1, id);
      await addMedia(first, actors.managerA1, id, firstDoc, 1);
      await first.query("COMMIT");
      await addMedia(second, actors.managerA1, id, await secondDoc, 2);
      await second.query("COMMIT");
    } finally {
      for (const client of [first, second]) {
        await client.query("ROLLBACK").catch(() => undefined);
        client.release();
      }
    }
    const { rows } = await adminPool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "listing_media" WHERE "listing_id" = $1::uuid`,
      [id],
    );
    expect(rows[0].n).toBe(2);
  });

  it("refuses a file uploaded for another listing", async () => {
    const one = await committed(actors.ownerA, (client) =>
      prepareListing(client, actors.ownerA, instructions.a1),
    );
    const two = await committed(actors.ownerA, (client) =>
      prepareListing(client, actors.ownerA, instructions.a2),
    );
    await asActor(actors.ownerA, async (client) => {
      const file = await storedListingFile(client, actors.ownerA, two.id);
      await refused(client, "23514", () =>
        addMedia(client, actors.ownerA, one.id, file),
      );
    });
  });

  it("lets no one without listing.prepare on the branch change media", async () => {
    const { id } = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    await committed(actors.managerA1, async (client) => {
      const doc = await storedListingFile(client, actors.managerA1, id);
      await addMedia(client, actors.managerA1, id, doc);
    });
    for (const actor of [
      actors.propertyManagerA1,
      actors.readOnlyA1,
      actors.accountsA1,
      actors.negotiatorA2,
      actors.ownerB,
    ]) {
      await asActor(actor, async (client) => {
        for (const change of [
          `"caption" = 'Changed'`,
          `"position" = 7`,
          `"removed_reason" = 'Blurry'`,
        ]) {
          const result = await client.query(
            `UPDATE "listing_media" SET ${change} WHERE "listing_id" = $1::uuid`,
            [id],
          );
          expect(result.rowCount, change).toBe(0);
        }
      });
    }
  });

  it("refuses storing a pending file once the listing is Ready to advertise", async () => {
    await commissionedEpc(ids.propertyA1);
    const id = await contentReadyListing();
    await committed(actors.managerA1, (client) =>
      addFiles(client, actors.managerA1, id, 5, 1),
    );
    const pending = await committed(actors.managerA1, async (client) => {
      const row = await client.query<{ id: string }>(
        `INSERT INTO "documents" ("workspace_id", "kind", "listing_id",
          "display_name", "media_type", "byte_size", "sha256",
          "uploaded_by_membership_id")
         VALUES ($1::uuid, 'listing_photo', $2::uuid, 'Late.jpg', 'jpeg', 1024,
           $3, $4::uuid)
         RETURNING "id"`,
        [ids.workspaceA, id, "e".repeat(64), ids.managerA1],
      );
      return row.rows[0].id;
    });
    await committed(actors.managerA1, (client) =>
      readyToAdvertise(client, actors.managerA1, id),
    );
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", () =>
        client.query(
          `UPDATE "documents" SET "status" = 'stored' WHERE "id" = $1::uuid`,
          [pending],
        ),
      );
    });
  });

  it("refuses changes to removed media and to a withdrawn listing's media", async () => {
    const { id } = await committed(actors.managerA1, (client) =>
      prepareListing(client, actors.managerA1, instructions.a1),
    );
    await committed(actors.managerA1, async (client) => {
      for (const position of [1, 2]) {
        const doc = await storedListingFile(client, actors.managerA1, id);
        await addMedia(client, actors.managerA1, id, doc, position);
      }
      await client.query(
        `UPDATE "listing_media" SET "removed_reason" = 'Blurry'
         WHERE "listing_id" = $1::uuid AND "position" = 1`,
        [id],
      );
    });
    await asActor(actors.managerA1, async (client) => {
      for (const change of [
        `"caption" = 'Changed'`,
        `"removed_reason" = NULL`,
      ]) {
        await refused(client, "23514", () =>
          client.query(
            `UPDATE "listing_media" SET ${change}
             WHERE "listing_id" = $1::uuid AND "position" = 1`,
            [id],
          ),
        );
      }
    });
    await committed(actors.managerA1, (client) =>
      changeState(client, actors.managerA1, id, {
        kind: "withdrawn",
        from: "draft",
        to: "withdrawn",
        reason: "Not going ahead",
      }),
    );
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", () =>
        client.query(
          `UPDATE "listing_media" SET "caption" = 'Changed'
           WHERE "listing_id" = $1::uuid AND "position" = 2`,
          [id],
        ),
      );
    });
  });
});
