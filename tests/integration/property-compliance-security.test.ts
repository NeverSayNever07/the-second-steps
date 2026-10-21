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
  propertyA1: randomUUID(),
  propertyA1Other: randomUUID(),
  propertyA1Archived: randomUUID(),
  propertyA2: randomUUID(),
  propertyB: randomUUID(),
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

const TABLES = [
  "property_compliance_items",
  "property_compliance_assessments",
  "property_compliance_evidence",
  "property_compliance_status_events",
] as const;

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
        ($1::uuid, 'compliance-a', 'Compliance A', 'agency', CURRENT_TIMESTAMP),
        ($2::uuid, 'compliance-b', 'Compliance B', 'agency', CURRENT_TIMESTAMP)`,
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
    for (const [propertyId, workspaceId, branchId, ref, creator, archived] of [
      [
        ids.propertyA1,
        ids.workspaceA,
        ids.branchA1,
        "PRP-CPAA2222",
        ids.managerA1,
        false,
      ],
      [
        ids.propertyA1Other,
        ids.workspaceA,
        ids.branchA1,
        "PRP-CPBB2222",
        ids.managerA1,
        false,
      ],
      [
        ids.propertyA1Archived,
        ids.workspaceA,
        ids.branchA1,
        "PRP-CPCC2222",
        ids.managerA1,
        true,
      ],
      [
        ids.propertyA2,
        ids.workspaceA,
        ids.branchA2,
        "PRP-CPDD2222",
        ids.negotiatorA2,
        false,
      ],
      [
        ids.propertyB,
        ids.workspaceB,
        ids.branchB,
        "PRP-CPEE2222",
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

// Runs as the admin role, skipping triggers, to set up states the app cannot.
async function asAdmin(sql: string, params: unknown[]) {
  const client = await adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query(sql, params);
    await client.query("COMMIT");
  } finally {
    client.release();
  }
}

type Area =
  | "epc_mees"
  | "gas_safety"
  | "electrical_safety"
  | "smoke_co_alarms"
  | "licensing";

async function createItem(
  client: PoolClient,
  actor: Actor,
  input: {
    propertyId?: string;
    area?: Area;
    createdBy?: string;
    requirementId?: string;
  } = {},
) {
  const result = await client.query<{ id: string }>(
    `INSERT INTO "property_compliance_items" ("workspace_id", "property_id",
      "area", "requirement_id", "created_by_membership_id")
     VALUES ($1::uuid, $2::uuid, $3::compliance_area,
       COALESCE($4::uuid, (SELECT "id" FROM "compliance_requirements"
         WHERE "area" = $3::compliance_area ORDER BY "version" LIMIT 1)),
       $5::uuid)
     RETURNING "id"`,
    [
      actor.workspaceId,
      input.propertyId ?? ids.propertyA1,
      input.area ?? "gas_safety",
      input.requirementId ?? null,
      input.createdBy ?? actor.membershipId,
    ],
  );
  return result.rows[0].id;
}

function assess(
  client: PoolClient,
  actor: Actor,
  itemId: string,
  applicability: string,
  reason: string | null = null,
  recordedBy = actor.membershipId,
) {
  return client.query(
    `INSERT INTO "property_compliance_assessments" ("workspace_id", "item_id",
      "applicability", "reason", "recorded_by_membership_id", "recorded_at")
     VALUES ($1::uuid, $2::uuid, $3::compliance_applicability, $4, $5::uuid,
       '2000-01-01')`,
    [actor.workspaceId, itemId, applicability, reason, recordedBy],
  );
}

/** A compliance file uploaded and stored by the actor. */
async function storedDocument(
  client: PoolClient,
  actor: Actor,
  propertyId = ids.propertyA1,
) {
  const result = await client.query<{ id: string }>(
    `INSERT INTO "documents" ("workspace_id", "kind", "property_id",
      "display_name", "media_type", "byte_size", "sha256",
      "uploaded_by_membership_id")
     VALUES ($1::uuid, 'compliance_evidence', $2::uuid, 'Certificate.pdf',
       'pdf', 1024, $3, $4::uuid)
     RETURNING "id"`,
    [actor.workspaceId, propertyId, "b".repeat(64), actor.membershipId],
  );
  const id = result.rows[0].id;
  await client.query(
    `UPDATE "documents" SET "status" = 'stored' WHERE "id" = $1::uuid`,
    [id],
  );
  return id;
}

async function addEvidence(
  client: PoolClient,
  actor: Actor,
  itemId: string,
  input: {
    documentId?: string | null;
    eventOn?: string;
    expiresOn?: string | null;
    epcRating?: string | null;
    recordedBy?: string;
  } = {},
) {
  const result = await client.query<{ id: string }>(
    `INSERT INTO "property_compliance_evidence" ("workspace_id", "item_id",
      "document_id", "event_on", "expires_on", "epc_rating",
      "recorded_by_membership_id")
     VALUES ($1::uuid, $2::uuid, $3::uuid,
       COALESCE($4::date, public.uk_today() - 1), $5::date, $6, $7::uuid)
     RETURNING "id"`,
    [
      actor.workspaceId,
      itemId,
      input.documentId ?? null,
      input.eventOn ?? null,
      input.expiresOn ?? null,
      input.epcRating ?? null,
      input.recordedBy ?? actor.membershipId,
    ],
  );
  return result.rows[0].id;
}

function recordStatus(
  client: PoolClient,
  actor: Actor,
  itemId: string,
  status: string,
  evidenceId: string | null,
  note: string | null = null,
) {
  return client.query(
    `INSERT INTO "property_compliance_status_events" ("workspace_id",
      "item_id", "status", "evidence_id", "note", "recorded_by_membership_id")
     VALUES ($1::uuid, $2::uuid, $3::compliance_evidence_status, $4::uuid, $5,
       $6::uuid)`,
    [actor.workspaceId, itemId, status, evidenceId, note, actor.membershipId],
  );
}

/** A gas item that Applies, with stored evidence, committed by managerA1. */
async function appliedGasItem(propertyId = ids.propertyA1) {
  return committed(actors.managerA1, async (client) => {
    const itemId = await createItem(client, actors.managerA1, { propertyId });
    await assess(client, actors.managerA1, itemId, "applies");
    const documentId = await storedDocument(
      client,
      actors.managerA1,
      propertyId,
    );
    const evidenceId = await addEvidence(client, actors.managerA1, itemId, {
      documentId,
    });
    return { itemId, documentId, evidenceId };
  });
}

async function visibleCount(actor: Actor, table: string) {
  let count = 0;
  await asActor(actor, async (client) => {
    const result = await client.query<{ count: number }>(
      `SELECT count(*)::int AS "count" FROM "${table}"`,
    );
    count = result.rows[0].count;
  });
  return count;
}

beforeEach(seedReferenceData);

afterAll(async () => {
  await runtimePool.end();
  await adminPool.end();
});

describe("requirement definitions", () => {
  it("lists the five England areas, readable but never changed by the app", async () => {
    await asActor(actors.readOnlyA1, async (client) => {
      const result = await client.query<{ area: string; file: boolean }>(
        `SELECT "area"::text AS "area", "is_file_required" AS "file"
         FROM "compliance_requirements" ORDER BY "area"::text`,
      );
      expect(result.rows).toEqual([
        { area: "electrical_safety", file: true },
        { area: "epc_mees", file: true },
        { area: "gas_safety", file: true },
        { area: "licensing", file: true },
        { area: "smoke_co_alarms", file: false },
      ]);
      await refused(client, "42501", () =>
        client.query(
          `INSERT INTO "compliance_requirements" ("area", "version",
            "jurisdiction", "label", "effective_from", "review_by",
            "source_url", "is_file_required")
           VALUES ('gas_safety', 2, 'england', 'X', current_date,
             current_date, 'https://example.com', false)`,
        ),
      );
      await refused(client, "42501", () =>
        client.query(
          `UPDATE "compliance_requirements" SET "is_file_required" = false`,
        ),
      );
      await refused(client, "42501", () =>
        client.query(`DELETE FROM "compliance_requirements"`),
      );
    });
  });
});

describe("creating compliance items", () => {
  it("lets operational staff create an item on a property in their branch", async () => {
    for (const actor of [
      actors.ownerA,
      actors.managerA1,
      actors.negotiatorA1,
      actors.propertyManagerA1,
    ]) {
      await asActor(actor, async (client) => {
        await createItem(client, actor);
      });
    }
  });

  it("refuses Accounts, Read Only, suspended members and another branch or workspace", async () => {
    for (const actor of [
      actors.accountsA1,
      actors.readOnlyA1,
      actors.suspendedA1,
      actors.negotiatorA2,
    ]) {
      await asActor(actor, async (client) => {
        await refused(client, "42501", () => createItem(client, actor));
      });
    }
    await asActor(actors.ownerB, async (client) => {
      await refused(client, "42501", () =>
        createItem(client, actors.ownerB, { propertyId: ids.propertyA1 }),
      );
      await refused(client, ["42501", "23503"], () =>
        createItem(client, {
          ...actors.ownerB,
          workspaceId: ids.workspaceA,
        }),
      );
    });
  });

  it("records the creator as the current member", async () => {
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "42501", () =>
        createItem(client, actors.managerA1, { createdBy: ids.negotiatorA1 }),
      );
    });
  });

  it("chooses the current requirement version itself, once per property and area", async () => {
    await asActor(actors.managerA1, async (client) => {
      const alarms = await client.query<{ id: string }>(
        `SELECT "id" FROM "compliance_requirements"
         WHERE "area" = 'smoke_co_alarms'`,
      );
      const itemId = await createItem(client, actors.managerA1, {
        area: "gas_safety",
        requirementId: alarms.rows[0].id,
      });
      const result = await client.query<{ area: string }>(
        `SELECT r."area"::text AS "area"
         FROM "property_compliance_items" AS i
         JOIN "compliance_requirements" AS r ON r."id" = i."requirement_id"
         WHERE i."id" = $1::uuid`,
        [itemId],
      );
      expect(result.rows[0].area).toBe("gas_safety");
      await refused(client, "23505", () =>
        createItem(client, actors.managerA1),
      );
    });
  });

  it("refuses an archived property", async () => {
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", () =>
        createItem(client, actors.managerA1, {
          propertyId: ids.propertyA1Archived,
        }),
      );
    });
  });
});

describe("seeing compliance records", () => {
  it("shows every staff role its branch's records, and no one else", async () => {
    await appliedGasItem();
    await committed(actors.managerA1, async (client) => {
      const items = await client.query<{ id: string }>(
        `SELECT "id" FROM "property_compliance_items"`,
      );
      const evidence = await client.query<{ id: string }>(
        `SELECT "id" FROM "property_compliance_evidence"`,
      );
      await recordStatus(
        client,
        actors.managerA1,
        items.rows[0].id,
        "reviewed",
        evidence.rows[0].id,
      );
    });

    for (const actor of [
      actors.ownerA,
      actors.managerA1,
      actors.negotiatorA1,
      actors.propertyManagerA1,
      actors.readOnlyA1,
      actors.accountsA1,
    ]) {
      for (const table of TABLES) {
        expect(await visibleCount(actor, table), table).toBe(1);
      }
    }
    for (const actor of [
      actors.negotiatorA2,
      actors.suspendedA1,
      actors.ownerB,
    ]) {
      for (const table of TABLES) {
        expect(await visibleCount(actor, table), table).toBe(0);
      }
    }
  });

  it("follows the property when it moves branch", async () => {
    await appliedGasItem();
    await asAdmin(
      `UPDATE "properties" SET "responsible_branch_id" = $2::uuid
       WHERE "id" = $1::uuid`,
      [ids.propertyA1, ids.branchA2],
    );
    for (const table of TABLES.slice(0, 3)) {
      expect(await visibleCount(actors.negotiatorA2, table), table).toBe(1);
      expect(await visibleCount(actors.negotiatorA1, table), table).toBe(0);
    }
  });
});

describe("recording applicability", () => {
  it("needs a reason for Does not apply and Needs specialist review", async () => {
    await asActor(actors.negotiatorA1, async (client) => {
      const itemId = await createItem(client, actors.negotiatorA1);
      await assess(client, actors.negotiatorA1, itemId, "applies");
      for (const applicability of [
        "does_not_apply",
        "needs_specialist_review",
      ]) {
        await refused(client, "23514", () =>
          assess(client, actors.negotiatorA1, itemId, applicability),
        );
        await refused(client, "23514", () =>
          assess(client, actors.negotiatorA1, itemId, applicability, "   "),
        );
        await assess(
          client,
          actors.negotiatorA1,
          itemId,
          applicability,
          "No gas supply at the property",
        );
      }
    });
  });

  it("records the current member and the database's time", async () => {
    await asActor(actors.negotiatorA1, async (client) => {
      const itemId = await createItem(client, actors.negotiatorA1);
      await refused(client, "42501", () =>
        assess(
          client,
          actors.negotiatorA1,
          itemId,
          "applies",
          null,
          ids.managerA1,
        ),
      );
      await assess(client, actors.negotiatorA1, itemId, "applies");
      const result = await client.query<{ isNow: boolean }>(
        `SELECT "recorded_at" BETWEEN transaction_timestamp()
           AND clock_timestamp() AS "isNow"
         FROM "property_compliance_assessments"`,
      );
      expect(result.rows).toEqual([{ isNow: true }]);
    });
  });

  it("refuses Accounts, Read Only and another branch", async () => {
    const { itemId } = await appliedGasItem();
    for (const actor of [
      actors.accountsA1,
      actors.readOnlyA1,
      actors.negotiatorA2,
    ]) {
      await asActor(actor, async (client) => {
        await refused(client, "42501", () =>
          assess(client, actor, itemId, "applies"),
        );
      });
    }
  });

  it("refuses new records once the property is archived", async () => {
    const { itemId } = await appliedGasItem();
    await asAdmin(
      `UPDATE "properties" SET "status" = 'archived', "archived_at" = now()
       WHERE "id" = $1::uuid`,
      [ids.propertyA1],
    );
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", () =>
        assess(client, actors.managerA1, itemId, "applies"),
      );
    });
  });
});

describe("adding evidence", () => {
  it("needs a file except for smoke and CO alarms", async () => {
    await asActor(actors.managerA1, async (client) => {
      for (const area of [
        "epc_mees",
        "gas_safety",
        "electrical_safety",
        "licensing",
      ] as const) {
        const itemId = await createItem(client, actors.managerA1, { area });
        await refused(client, "23514", () =>
          addEvidence(client, actors.managerA1, itemId),
        );
        await addEvidence(client, actors.managerA1, itemId, {
          documentId: await storedDocument(client, actors.managerA1),
        });
      }
      const alarms = await createItem(client, actors.managerA1, {
        area: "smoke_co_alarms",
      });
      await addEvidence(client, actors.managerA1, alarms);
    });
  });

  it("uses only the recorder's own stored file on the same property, once", async () => {
    const other = await committed(actors.negotiatorA1, (client) =>
      storedDocument(client, actors.negotiatorA1),
    );
    await asActor(actors.managerA1, async (client) => {
      const itemId = await createItem(client, actors.managerA1);
      await refused(client, "23514", () =>
        addEvidence(client, actors.managerA1, itemId, { documentId: other }),
      );
      const elsewhere = await storedDocument(
        client,
        actors.managerA1,
        ids.propertyA1Other,
      );
      await refused(client, "23514", () =>
        addEvidence(client, actors.managerA1, itemId, {
          documentId: elsewhere,
        }),
      );
      const pending = await client.query<{ id: string }>(
        `INSERT INTO "documents" ("workspace_id", "kind", "property_id",
          "display_name", "media_type", "byte_size", "sha256",
          "uploaded_by_membership_id")
         VALUES ($1::uuid, 'compliance_evidence', $2::uuid, 'Pending.pdf',
           'pdf', 1024, $3, $4::uuid)
         RETURNING "id"`,
        [ids.workspaceA, ids.propertyA1, "c".repeat(64), ids.managerA1],
      );
      await refused(client, "23514", () =>
        addEvidence(client, actors.managerA1, itemId, {
          documentId: pending.rows[0].id,
        }),
      );
      const own = await storedDocument(client, actors.managerA1);
      await addEvidence(client, actors.managerA1, itemId, { documentId: own });
      await refused(client, "23505", () =>
        addEvidence(client, actors.managerA1, itemId, { documentId: own }),
      );
    });
  });

  it("checks the staff-entered dates and EPC rating", async () => {
    await asActor(actors.managerA1, async (client) => {
      const alarms = await createItem(client, actors.managerA1, {
        area: "smoke_co_alarms",
      });
      await refused(client, "23514", () =>
        addEvidence(client, actors.managerA1, alarms, {
          eventOn: "2999-01-01",
        }),
      );
      await refused(client, "23514", () =>
        addEvidence(client, actors.managerA1, alarms, {
          eventOn: "2026-01-10",
          expiresOn: "2026-01-09",
        }),
      );
      await refused(client, "23514", () =>
        addEvidence(client, actors.managerA1, alarms, { epcRating: "C" }),
      );
      const epc = await createItem(client, actors.managerA1, {
        area: "epc_mees",
      });
      await refused(client, "23514", async () =>
        addEvidence(client, actors.managerA1, epc, {
          documentId: await storedDocument(client, actors.managerA1),
          epcRating: "H",
        }),
      );
      await addEvidence(client, actors.managerA1, epc, {
        documentId: await storedDocument(client, actors.managerA1),
        eventOn: "2026-01-10",
        expiresOn: "2036-01-09",
        epcRating: "C",
      });
    });
  });

  it("records the current member and refuses Accounts and Read Only", async () => {
    await asActor(actors.managerA1, async (client) => {
      const alarms = await createItem(client, actors.managerA1, {
        area: "smoke_co_alarms",
      });
      await refused(client, "42501", () =>
        addEvidence(client, actors.managerA1, alarms, {
          recordedBy: ids.negotiatorA1,
        }),
      );
    });
    const { itemId } = await committed(actors.managerA1, async (client) => ({
      itemId: await createItem(client, actors.managerA1, {
        area: "smoke_co_alarms",
      }),
    }));
    for (const actor of [actors.accountsA1, actors.readOnlyA1]) {
      await asActor(actor, async (client) => {
        await refused(client, "42501", () =>
          addEvidence(client, actor, itemId),
        );
      });
    }
  });
});

describe("recording evidence status", () => {
  it("is allowed only while the area currently applies", async () => {
    await asActor(actors.managerA1, async (client) => {
      const itemId = await createItem(client, actors.managerA1, {
        area: "smoke_co_alarms",
      });
      await refused(client, "23514", () =>
        recordStatus(
          client,
          actors.managerA1,
          itemId,
          "awaiting_evidence",
          null,
        ),
      );
      await assess(client, actors.managerA1, itemId, "applies");
      await recordStatus(
        client,
        actors.managerA1,
        itemId,
        "awaiting_evidence",
        null,
      );
      await assess(
        client,
        actors.managerA1,
        itemId,
        "does_not_apply",
        "No gas appliances",
      );
      await refused(client, "23514", () =>
        recordStatus(
          client,
          actors.managerA1,
          itemId,
          "awaiting_evidence",
          null,
        ),
      );
    });
  });

  it("names the evidence relied on, and a note for Action required", async () => {
    const { itemId, evidenceId } = await appliedGasItem();
    await asActor(actors.negotiatorA1, async (client) => {
      await refused(client, "23514", () =>
        recordStatus(client, actors.negotiatorA1, itemId, "reviewed", null),
      );
      await refused(client, "23514", () =>
        recordStatus(
          client,
          actors.negotiatorA1,
          itemId,
          "awaiting_evidence",
          evidenceId,
        ),
      );
      await refused(client, "23514", () =>
        recordStatus(
          client,
          actors.negotiatorA1,
          itemId,
          "action_required",
          evidenceId,
        ),
      );
      await recordStatus(
        client,
        actors.negotiatorA1,
        itemId,
        "action_required",
        evidenceId,
        "Remedial work on the boiler flue",
      );
      // The uploader may also review (owner decision 2).
      await recordStatus(
        client,
        actors.negotiatorA1,
        itemId,
        "reviewed",
        evidenceId,
      );
    });
  });

  it("relies only on evidence from the same area whose file is stored", async () => {
    const gas = await appliedGasItem();
    const other = await appliedGasItem(ids.propertyA1Other);
    await committed(actors.managerA1, (client) =>
      client.query(
        `UPDATE "documents" SET "status" = 'removed',
          "removal_reason" = 'Wrong file',
          "removed_by_membership_id" = $2::uuid
         WHERE "id" = $1::uuid`,
        [other.documentId, ids.managerA1],
      ),
    );
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", () =>
        recordStatus(
          client,
          actors.managerA1,
          gas.itemId,
          "reviewed",
          other.evidenceId,
        ),
      );
      await refused(client, "23514", () =>
        recordStatus(
          client,
          actors.managerA1,
          other.itemId,
          "reviewed",
          other.evidenceId,
        ),
      );
    });
  });

  it("refuses Accounts, Read Only and another workspace", async () => {
    const { itemId, evidenceId } = await appliedGasItem();
    for (const actor of [
      actors.accountsA1,
      actors.readOnlyA1,
      actors.negotiatorA2,
    ]) {
      await asActor(actor, async (client) => {
        await refused(client, "42501", () =>
          recordStatus(client, actor, itemId, "reviewed", evidenceId),
        );
      });
    }
    await asActor(actors.ownerB, async (client) => {
      await refused(client, ["42501", "23503"], () =>
        recordStatus(client, actors.ownerB, itemId, "reviewed", evidenceId),
      );
    });
  });
});

describe("removing compliance files", () => {
  it("allows removal until the evidence has been relied on", async () => {
    const first = await appliedGasItem();
    const second = await committed(actors.managerA1, async (client) => {
      const documentId = await storedDocument(client, actors.managerA1);
      await addEvidence(client, actors.managerA1, first.itemId, {
        documentId,
      });
      return documentId;
    });
    await committed(actors.managerA1, (client) =>
      recordStatus(
        client,
        actors.managerA1,
        first.itemId,
        "reviewed",
        first.evidenceId,
      ),
    );
    await asActor(actors.managerA1, async (client) => {
      const remove = (documentId: string) =>
        client.query(
          `UPDATE "documents" SET "status" = 'removed',
            "removal_reason" = 'Wrong file',
            "removed_by_membership_id" = $2::uuid
           WHERE "id" = $1::uuid`,
          [documentId, ids.managerA1],
        );
      await refused(client, "23514", () => remove(first.documentId));
      await remove(second);
    });
  });
});

describe("writing history in edge cases", () => {
  it("refuses suspended members on every history table", async () => {
    const { itemId, evidenceId } = await appliedGasItem();
    await asActor(actors.suspendedA1, async (client) => {
      await refused(client, "42501", () =>
        assess(client, actors.suspendedA1, itemId, "applies"),
      );
      await refused(client, "42501", () =>
        addEvidence(client, actors.suspendedA1, itemId),
      );
      await refused(client, "42501", () =>
        recordStatus(
          client,
          actors.suspendedA1,
          itemId,
          "reviewed",
          evidenceId,
        ),
      );
    });
  });

  it("moves write access with the property when it changes branch", async () => {
    const { itemId, evidenceId } = await appliedGasItem();
    await asAdmin(
      `UPDATE "properties" SET "responsible_branch_id" = $2::uuid
       WHERE "id" = $1::uuid`,
      [ids.propertyA1, ids.branchA2],
    );
    await asActor(actors.negotiatorA1, async (client) => {
      await refused(client, "42501", () =>
        assess(client, actors.negotiatorA1, itemId, "applies"),
      );
    });
    await asActor(actors.negotiatorA2, async (client) => {
      await assess(client, actors.negotiatorA2, itemId, "applies");
      await recordStatus(
        client,
        actors.negotiatorA2,
        itemId,
        "reviewed",
        evidenceId,
      );
    });
  });

  it("refuses evidence and status once the property is archived", async () => {
    const { itemId, evidenceId } = await appliedGasItem();
    await asAdmin(
      `UPDATE "properties" SET "status" = 'archived', "archived_at" = now()
       WHERE "id" = $1::uuid`,
      [ids.propertyA1],
    );
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", () =>
        addEvidence(client, actors.managerA1, itemId),
      );
      await refused(client, "23514", () =>
        recordStatus(client, actors.managerA1, itemId, "reviewed", evidenceId),
      );
    });
  });
});

describe("compliance history", () => {
  it("can never be changed or deleted by the app", async () => {
    const { itemId, evidenceId } = await appliedGasItem();
    await committed(actors.managerA1, (client) =>
      recordStatus(client, actors.managerA1, itemId, "reviewed", evidenceId),
    );
    await asActor(actors.ownerA, async (client) => {
      for (const table of TABLES) {
        await refused(client, "42501", () =>
          client.query(`UPDATE "${table}" SET "workspace_id" = "workspace_id"`),
        );
        await refused(client, "42501", () =>
          client.query(`DELETE FROM "${table}"`),
        );
      }
    });
  });
});
