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

const SHA = "a".repeat(64);

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
        ($1::uuid, 'documents-a', 'Documents A', 'agency', CURRENT_TIMESTAMP),
        ($2::uuid, 'documents-b', 'Documents B', 'agency', CURRENT_TIMESTAMP)`,
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

async function endInstruction(actor: Actor, instructionId: string) {
  await committed(actor, async (client) => {
    await client.query(
      `INSERT INTO "instruction_journey_history" ("workspace_id",
        "instruction_id", "from_stage", "to_stage", "reason",
        "changed_by_membership_id")
       VALUES ($1::uuid, $2::uuid, 'onboarding', 'withdrawn',
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

type DocumentInput = {
  kind?: "instruction_agreement" | "compliance_evidence";
  instructionId?: string | null;
  propertyId?: string | null;
  media?: "pdf" | "jpeg" | "png";
  status?: string;
  uploader?: string;
  workspaceId?: string;
  displayName?: string;
};

async function insertDocument(
  client: PoolClient,
  actor: Actor,
  input: DocumentInput = {},
) {
  const kind = input.kind ?? "instruction_agreement";
  const isAgreement = kind === "instruction_agreement";
  const result = await client.query<{ id: string }>(
    `INSERT INTO "documents" ("workspace_id", "kind", "instruction_id",
      "property_id", "display_name", "media_type", "byte_size", "sha256",
      "status", "uploaded_by_membership_id")
     VALUES ($1::uuid, $2::document_kind, $3::uuid, $4::uuid, $5,
       $6::document_media, 1024, $7, $8::document_status, $9::uuid)
     RETURNING "id"`,
    [
      input.workspaceId ?? actor.workspaceId,
      kind,
      input.instructionId === undefined
        ? isAgreement
          ? instructions.a1
          : null
        : input.instructionId,
      input.propertyId === undefined
        ? isAgreement
          ? null
          : ids.propertyA1
        : input.propertyId,
      input.displayName ?? "Signed terms.pdf",
      input.media ?? "pdf",
      SHA,
      input.status ?? "pending",
      input.uploader ?? actor.membershipId,
    ],
  );
  return result.rows[0].id;
}

function setStatus(
  client: PoolClient,
  documentId: string,
  changes: {
    status: string;
    failureCode?: string | null;
    removalReason?: string | null;
    removedBy?: string | null;
  },
) {
  return client.query(
    `UPDATE "documents"
     SET "status" = $2::document_status, "failure_code" = $3,
       "removal_reason" = $4, "removed_by_membership_id" = $5::uuid
     WHERE "id" = $1::uuid`,
    [
      documentId,
      changes.status,
      changes.failureCode ?? null,
      changes.removalReason ?? null,
      changes.removedBy ?? null,
    ],
  );
}

async function visibleDocumentIds(actor: Actor) {
  let found: string[] = [];
  await asActor(actor, async (client) => {
    const result = await client.query<{ id: string }>(
      `SELECT "id" FROM "documents" ORDER BY "id"`,
    );
    found = result.rows.map((row) => row.id);
  });
  return found;
}

/** Makes a pending document look more than an hour old. */
async function backdate(documentId: string) {
  const client = await adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query(
      `UPDATE "documents" SET "created_at" = now() - interval '2 hours'
       WHERE "id" = $1::uuid`,
      [documentId],
    );
    await client.query("COMMIT");
  } finally {
    client.release();
  }
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
  await endInstruction(actors.managerA1, instructions.a1Ended);
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
}

beforeEach(seed);

afterAll(async () => {
  await runtimePool.end();
  await adminPool.end();
});

describe("uploading documents", () => {
  it("lets operational staff add agreements and compliance evidence in their branch", async () => {
    for (const actor of [
      actors.ownerA,
      actors.managerA1,
      actors.negotiatorA1,
      actors.propertyManagerA1,
    ]) {
      await asActor(actor, async (client) => {
        await insertDocument(client, actor);
        await insertDocument(client, actor, {
          kind: "compliance_evidence",
          media: "png",
          displayName: "Gas safety.png",
        });
      });
    }
  });

  it("refuses Accounts, Read Only and suspended members", async () => {
    for (const actor of [
      actors.accountsA1,
      actors.readOnlyA1,
      actors.suspendedA1,
    ]) {
      await asActor(actor, async (client) => {
        await refused(client, "42501", () => insertDocument(client, actor));
        await refused(client, "42501", () =>
          insertDocument(client, actor, { kind: "compliance_evidence" }),
        );
      });
    }
  });

  it("refuses records in another branch or workspace", async () => {
    await asActor(actors.negotiatorA2, async (client) => {
      await refused(client, "42501", () =>
        insertDocument(client, actors.negotiatorA2),
      );
      await refused(client, "42501", () =>
        insertDocument(client, actors.negotiatorA2, {
          kind: "compliance_evidence",
          propertyId: ids.propertyA1,
        }),
      );
    });
    await asActor(actors.ownerB, async (client) => {
      // Workspace B's context cannot write into workspace A.
      await refused(client, "42501", () =>
        insertDocument(client, actors.ownerB, { workspaceId: ids.workspaceA }),
      );
      // Nor attach its own document to workspace A's instruction.
      await refused(client, ["42501", "23503"], () =>
        insertDocument(client, actors.ownerB),
      );
    });
  });

  it("records the current member as uploader and starts as pending", async () => {
    await asActor(actors.negotiatorA1, async (client) => {
      await refused(client, "42501", () =>
        insertDocument(client, actors.negotiatorA1, {
          uploader: ids.managerA1,
        }),
      );
      await refused(client, "23514", () =>
        insertDocument(client, actors.negotiatorA1, { status: "stored" }),
      );
    });
  });

  it("keeps agreements to PDFs on an instruction and evidence on a property", async () => {
    await asActor(actors.negotiatorA1, async (client) => {
      await refused(client, "23514", () =>
        insertDocument(client, actors.negotiatorA1, {
          media: "jpeg",
          displayName: "terms.jpg",
        }),
      );
      await refused(client, "23514", () =>
        insertDocument(client, actors.negotiatorA1, {
          kind: "instruction_agreement",
          propertyId: ids.propertyA1,
        }),
      );
      await refused(client, "23514", () =>
        insertDocument(client, actors.negotiatorA1, {
          kind: "compliance_evidence",
          instructionId: instructions.a1,
        }),
      );
    });
  });

  it("refuses names that could break a download header", async () => {
    await asActor(actors.negotiatorA1, async (client) => {
      for (const displayName of [
        'bad"name.pdf',
        "bad;name.pdf",
        "a\r\nb.pdf",
      ]) {
        await refused(client, "23514", () =>
          insertDocument(client, actors.negotiatorA1, { displayName }),
        );
      }
    });
  });

  it("refuses an ended instruction or an archived property", async () => {
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", () =>
        insertDocument(client, actors.managerA1, {
          instructionId: instructions.a1Ended,
        }),
      );
      await refused(client, "23514", () =>
        insertDocument(client, actors.managerA1, {
          kind: "compliance_evidence",
          propertyId: ids.propertyA1Archived,
        }),
      );
    });
  });
});

describe("seeing documents", () => {
  it("shows every staff role the documents of records in its scope, and no one else's", async () => {
    const agreementA1 = await committed(actors.negotiatorA1, (client) =>
      insertDocument(client, actors.negotiatorA1),
    );
    const evidenceA1 = await committed(actors.negotiatorA1, (client) =>
      insertDocument(client, actors.negotiatorA1, {
        kind: "compliance_evidence",
      }),
    );
    const agreementA2 = await committed(actors.negotiatorA2, (client) =>
      insertDocument(client, actors.negotiatorA2, {
        instructionId: instructions.a2,
      }),
    );
    const agreementB = await committed(actors.ownerB, (client) =>
      insertDocument(client, actors.ownerB, { instructionId: instructions.b }),
    );
    const branchA1 = [agreementA1, evidenceA1].sort();

    for (const actor of [
      actors.managerA1,
      actors.negotiatorA1,
      actors.propertyManagerA1,
      actors.accountsA1,
      actors.readOnlyA1,
    ]) {
      expect(await visibleDocumentIds(actor)).toEqual(branchA1);
    }
    expect(await visibleDocumentIds(actors.ownerA)).toEqual(
      [...branchA1, agreementA2].sort(),
    );
    expect(await visibleDocumentIds(actors.negotiatorA2)).toEqual([
      agreementA2,
    ]);
    expect(await visibleDocumentIds(actors.ownerB)).toEqual([agreementB]);
    expect(await visibleDocumentIds(actors.suspendedA1)).toEqual([]);
  });
});

describe("changing documents", () => {
  async function pendingAgreement(actor: Actor = actors.negotiatorA1) {
    return committed(actor, (client) => insertDocument(client, actor));
  }

  it("lets only the uploader complete an upload, with the database's time", async () => {
    const id = await pendingAgreement();
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "42501", () =>
        setStatus(client, id, { status: "stored" }),
      );
    });
    await asActor(actors.negotiatorA1, async (client) => {
      await setStatus(client, id, { status: "stored" });
      const row = await client.query<{ stored: boolean }>(
        `SELECT "stored_at" = transaction_timestamp() AS "stored"
         FROM "documents" WHERE "id" = $1::uuid`,
        [id],
      );
      expect(row.rows[0].stored).toBe(true);
    });
  });

  it("refuses completing an upload once its instruction has ended", async () => {
    const id = await pendingAgreement(actors.managerA1);
    await endInstruction(actors.managerA1, instructions.a1);
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", () =>
        setStatus(client, id, { status: "stored" }),
      );
      // The uploader can still record the failure.
      await setStatus(client, id, {
        status: "failed",
        failureCode: "record_closed",
      });
    });
  });

  it("lets a colleague fail only an upload abandoned for over an hour", async () => {
    const id = await pendingAgreement();
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "42501", () =>
        setStatus(client, id, { status: "failed", failureCode: "abandoned" }),
      );
    });
    await backdate(id);
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "42501", () =>
        setStatus(client, id, {
          status: "failed",
          failureCode: "storage_failed",
        }),
      );
      await setStatus(client, id, {
        status: "failed",
        failureCode: "abandoned",
      });
    });
    await asActor(actors.negotiatorA1, async (client) => {
      await setStatus(client, id, {
        status: "failed",
        failureCode: "storage_failed",
      });
    });
  });

  it("lets a member remove a stored file only as themselves, with a reason", async () => {
    const id = await pendingAgreement();
    await committed(actors.negotiatorA1, (client) =>
      setStatus(client, id, { status: "stored" }),
    );
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "42501", () =>
        setStatus(client, id, {
          status: "removed",
          removalReason: "Wrong file",
          removedBy: ids.negotiatorA1,
        }),
      );
      await refused(client, "23514", () =>
        setStatus(client, id, { status: "removed", removedBy: ids.managerA1 }),
      );
      await setStatus(client, id, {
        status: "removed",
        removalReason: "Wrong file",
        removedBy: ids.managerA1,
      });
    });
  });

  it("refuses every other status change", async () => {
    const stored = await pendingAgreement();
    await committed(actors.negotiatorA1, (client) =>
      setStatus(client, stored, { status: "stored" }),
    );
    const failed = await pendingAgreement();
    await committed(actors.negotiatorA1, (client) =>
      setStatus(client, failed, {
        status: "failed",
        failureCode: "storage_failed",
      }),
    );
    await asActor(actors.negotiatorA1, async (client) => {
      await refused(client, "23514", () =>
        setStatus(client, stored, { status: "pending" }),
      );
      await refused(client, "23514", () =>
        setStatus(client, stored, { status: "stored" }),
      );
      await refused(client, "23514", () =>
        setStatus(client, failed, { status: "stored" }),
      );
      await refused(client, "23514", () =>
        setStatus(client, failed, { status: "pending" }),
      );
    });
  });

  it("never changes file details or deletes a row", async () => {
    const id = await pendingAgreement();
    await asActor(actors.negotiatorA1, async (client) => {
      for (const column of [
        `"display_name" = 'Other.pdf'`,
        `"sha256" = '${"b".repeat(64)}'`,
        `"byte_size" = 2048`,
        `"instruction_id" = '${instructions.a2}'::uuid`,
        `"workspace_id" = '${ids.workspaceB}'::uuid`,
        `"stored_at" = now()`,
      ]) {
        await refused(client, "42501", () =>
          client.query(
            `UPDATE "documents" SET ${column} WHERE "id" = $1::uuid`,
            [id],
          ),
        );
      }
      await refused(client, "42501", () =>
        client.query(`DELETE FROM "documents" WHERE "id" = $1::uuid`, [id]),
      );
    });
  });

  it("does not let Accounts, Read Only or another branch change a document", async () => {
    const id = await pendingAgreement();
    await backdate(id);
    for (const actor of [
      actors.accountsA1,
      actors.readOnlyA1,
      actors.negotiatorA2,
    ]) {
      await asActor(actor, async (client) => {
        const result = await setStatus(client, id, {
          status: "failed",
          failureCode: "abandoned",
        });
        expect(result.rowCount).toBe(0);
      });
    }
  });
});
