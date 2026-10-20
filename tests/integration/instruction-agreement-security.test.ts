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
        ($1::uuid, 'agreements-a', 'Agreements A', 'agency', CURRENT_TIMESTAMP),
        ($2::uuid, 'agreements-b', 'Agreements B', 'agency', CURRENT_TIMESTAMP)`,
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
        "PER-AG111111",
      ],
      [
        ids.personA2,
        ids.workspaceA,
        ids.branchA2,
        ids.negotiatorA2,
        "PER-AG222222",
      ],
      [ids.personB, ids.workspaceB, ids.branchB, ids.ownerB, "PER-AG333333"],
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
        "PRP-AGAA2222",
        ids.managerA1,
        false,
      ],
      [
        ids.propertyA1Ended,
        ids.workspaceA,
        ids.branchA1,
        "PRP-AGBB2222",
        ids.managerA1,
        false,
      ],
      [
        ids.propertyA1Archived,
        ids.workspaceA,
        ids.branchA1,
        "PRP-AGCC2222",
        ids.managerA1,
        true,
      ],
      [
        ids.propertyA2,
        ids.workspaceA,
        ids.branchA2,
        "PRP-AGDD2222",
        ids.negotiatorA2,
        false,
      ],
      [
        ids.propertyB,
        ids.workspaceB,
        ids.branchB,
        "PRP-AGEE2222",
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
        "ENQ-AGAA2222",
        ids.personA1,
        ids.propertyA1,
        ids.managerA1,
      ],
      [
        ids.enquiryA1Ended,
        ids.workspaceA,
        ids.branchA1,
        "ENQ-AGBB2222",
        ids.personA1,
        ids.propertyA1Ended,
        ids.managerA1,
      ],
      [
        ids.enquiryA2,
        ids.workspaceA,
        ids.branchA2,
        "ENQ-AGCC2222",
        ids.personA2,
        ids.propertyA2,
        ids.negotiatorA2,
      ],
      [
        ids.enquiryB,
        ids.workspaceB,
        ids.branchB,
        "ENQ-AGDD2222",
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

/** A stored agreement PDF on the instruction, uploaded by the actor. */
async function storedPdf(
  client: PoolClient,
  actor: Actor,
  instructionId = instructions.a1,
) {
  const id = await insertDocument(client, actor, { instructionId });
  await setStatus(client, id, { status: "stored" });
  return id;
}

async function createDraft(
  client: PoolClient,
  actor: Actor,
  documentId: string,
  instructionId = instructions.a1,
) {
  const result = await client.query<{ id: string }>(
    `INSERT INTO "instruction_agreements" ("workspace_id", "instruction_id",
      "document_id", "created_by_membership_id")
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid)
     RETURNING "id"`,
    [actor.workspaceId, instructionId, documentId, actor.membershipId],
  );
  return result.rows[0].id;
}

function complete(
  client: PoolClient,
  agreementId: string,
  signedOn = "public.uk_today()",
) {
  return client.query(
    `UPDATE "instruction_agreements"
     SET "state" = 'completed', "signed_on" = ${signedOn}
     WHERE "id" = $1::uuid`,
    [agreementId],
  );
}

function discard(client: PoolClient, agreementId: string, reason: string) {
  return client.query(
    `UPDATE "instruction_agreements"
     SET "state" = 'discarded', "discard_reason" = $2
     WHERE "id" = $1::uuid`,
    [agreementId, reason],
  );
}

/** A new terms version; only `fee` is material, `rent` is not. */
function addTerms(
  client: PoolClient,
  actor: Actor,
  terms: { fee?: number; rent?: number } = {},
  instructionId = instructions.a1,
) {
  return client.query(
    `INSERT INTO "instruction_terms_versions" ("workspace_id",
      "instruction_id", "service", "asking_rent_pence", "rent_period",
      "fee_kind", "fee_value", "fee_vat", "change_reason",
      "created_by_membership_id")
     VALUES ($1::uuid, $2::uuid, 'fully_managed', $3, 'month', 'percentage',
       $4, 'exclusive', 'Agreed with the landlord', $5::uuid)`,
    [
      actor.workspaceId,
      instructionId,
      terms.rent ?? 150000,
      terms.fee ?? 1200,
      actor.membershipId,
    ],
  );
}

async function agreementRow(client: PoolClient, agreementId: string) {
  const result = await client.query<{
    state: string;
    terms_version_id: string;
    material_fingerprint: string;
    signatory_contact_ids: string[];
    completed_by_membership_id: string | null;
    supersedes_agreement_id: string | null;
    discarded_by_membership_id: string | null;
    current_fingerprint: string;
    current_terms: string;
  }>(
    `SELECT a."state", a."terms_version_id", a."material_fingerprint",
       a."signatory_contact_ids", a."completed_by_membership_id",
       a."supersedes_agreement_id", a."discarded_by_membership_id",
       public.instruction_material_fingerprint(a."workspace_id",
         a."instruction_id") AS "current_fingerprint",
       (SELECT t."id" FROM "instruction_terms_versions" AS t
        WHERE t."workspace_id" = a."workspace_id"
          AND t."instruction_id" = a."instruction_id"
        ORDER BY t."created_at" DESC, t."id" DESC LIMIT 1) AS "current_terms"
     FROM "instruction_agreements" AS a WHERE a."id" = $1::uuid`,
    [agreementId],
  );
  return result.rows[0];
}

/** Commits a completed agreement on instruction a1 and returns its id. */
function completedAgreement(actor: Actor = actors.negotiatorA1) {
  return committed(actor, async (client) => {
    const id = await createDraft(client, actor, await storedPdf(client, actor));
    await complete(client, id);
    return id;
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

describe("adding an agreement", () => {
  it("lets operational staff add a draft for their own stored PDF in their branch", async () => {
    for (const actor of [
      actors.ownerA,
      actors.managerA1,
      actors.negotiatorA1,
      actors.propertyManagerA1,
    ]) {
      await asActor(actor, async (client) => {
        await createDraft(client, actor, await storedPdf(client, actor));
      });
    }
  });

  it("records what the PDF covers itself, whatever the app sends", async () => {
    await asActor(actors.negotiatorA1, async (client) => {
      const documentId = await storedPdf(client, actors.negotiatorA1);
      const result = await client.query<{ id: string }>(
        `INSERT INTO "instruction_agreements" ("workspace_id",
          "instruction_id", "document_id", "terms_version_id",
          "material_fingerprint", "signatory_contact_ids",
          "created_by_membership_id")
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::uuid[],
           $7::uuid)
         RETURNING "id"`,
        [
          ids.workspaceA,
          instructions.a1,
          documentId,
          randomUUID(),
          "b".repeat(64),
          [ids.personA2],
          ids.negotiatorA1,
        ],
      );
      const row = await agreementRow(client, result.rows[0].id);
      expect(row.state).toBe("draft");
      expect(row.terms_version_id).toBe(row.current_terms);
      expect(row.material_fingerprint).toBe(row.current_fingerprint);
      expect(row.signatory_contact_ids).toEqual([ids.personA1]);
    });
  });

  it("refuses Accounts, Read Only, suspended members and other branches or workspaces", async () => {
    let documentId = "";
    await committed(actors.negotiatorA1, async (client) => {
      documentId = await storedPdf(client, actors.negotiatorA1);
    });
    for (const actor of [
      actors.accountsA1,
      actors.readOnlyA1,
      actors.suspendedA1,
      actors.negotiatorA2,
      actors.ownerB,
    ]) {
      await asActor(actor, async (client) => {
        await refused(client, ["42501", "23514", "23503"], () =>
          client.query(
            `INSERT INTO "instruction_agreements" ("workspace_id",
              "instruction_id", "document_id", "created_by_membership_id")
             VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid)`,
            [ids.workspaceA, instructions.a1, documentId, actor.membershipId],
          ),
        );
      });
    }
  });

  it("needs a stored agreement PDF on the same instruction, uploaded by the same member", async () => {
    await asActor(actors.negotiatorA1, async (client) => {
      const pending = await insertDocument(client, actors.negotiatorA1);
      await refused(client, "23514", () =>
        createDraft(client, actors.negotiatorA1, pending),
      );
      const evidence = await insertDocument(client, actors.negotiatorA1, {
        kind: "compliance_evidence",
      });
      await setStatus(client, evidence, { status: "stored" });
      await refused(client, "23514", () =>
        createDraft(client, actors.negotiatorA1, evidence),
      );
    });
    let colleaguePdf = "";
    await committed(actors.managerA1, async (client) => {
      colleaguePdf = await storedPdf(client, actors.managerA1);
    });
    await asActor(actors.negotiatorA1, async (client) => {
      await refused(client, "23514", () =>
        createDraft(client, actors.negotiatorA1, colleaguePdf),
      );
    });
    await asActor(actors.ownerA, async (client) => {
      const otherInstruction = await storedPdf(
        client,
        actors.ownerA,
        instructions.a2,
      );
      await refused(client, "23514", () =>
        createDraft(client, actors.ownerA, otherInstruction),
      );
    });
  });

  it("keeps one draft per instruction", async () => {
    await asActor(actors.negotiatorA1, async (client) => {
      const first = await storedPdf(client, actors.negotiatorA1);
      await createDraft(client, actors.negotiatorA1, first);
      const second = await storedPdf(client, actors.negotiatorA1);
      await refused(client, "23505", () =>
        createDraft(client, actors.negotiatorA1, second),
      );
    });
  });

  it("refuses an ended instruction", async () => {
    await asActor(actors.managerA1, async (client) => {
      await refused(client, "23514", async () => {
        const pdf = await insertDocument(client, actors.managerA1, {
          instructionId: instructions.a1Ended,
        });
        await createDraft(client, actors.managerA1, pdf, instructions.a1Ended);
      });
    });
  });
});

describe("completing an agreement", () => {
  it("records the current member and supersedes the previous agreement", async () => {
    const first = await completedAgreement(actors.negotiatorA1);
    await asActor(actors.managerA1, async (client) => {
      const second = await createDraft(
        client,
        actors.managerA1,
        await storedPdf(client, actors.managerA1),
      );
      await complete(client, second);
      const row = await agreementRow(client, second);
      expect(row.state).toBe("completed");
      expect(row.completed_by_membership_id).toBe(ids.managerA1);
      expect(row.supersedes_agreement_id).toBe(first);
    });
  });

  it("needs a signed date that is not in the future", async () => {
    await asActor(actors.negotiatorA1, async (client) => {
      const id = await createDraft(
        client,
        actors.negotiatorA1,
        await storedPdf(client, actors.negotiatorA1),
      );
      await refused(client, "23514", () => complete(client, id, "NULL"));
      await refused(client, "23514", () =>
        complete(client, id, "public.uk_today() + 1"),
      );
      await complete(client, id, "public.uk_today() - 3");
    });
  });

  it("is refused after a fee or landlord change, but not after a rent change", async () => {
    // The owner can see a landlord from the other branch to add.
    await asActor(actors.ownerA, async (client) => {
      const id = await createDraft(
        client,
        actors.ownerA,
        await storedPdf(client, actors.ownerA),
      );
      await client.query("SAVEPOINT fee");
      await addTerms(client, actors.ownerA, { fee: 1500 });
      await refused(client, "23514", () => complete(client, id));
      await client.query("ROLLBACK TO SAVEPOINT fee");
      await client.query(
        `INSERT INTO "instruction_parties" ("workspace_id", "instruction_id",
          "contact_id", "added_by_membership_id", "updated_at")
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, CURRENT_TIMESTAMP)`,
        [ids.workspaceA, instructions.a1, ids.personA2, ids.ownerA],
      );
      await refused(client, "23514", () => complete(client, id));
    });
    // Settle the fee first, so the upload and the later rent change share it.
    let id = "";
    await committed(actors.negotiatorA1, async (client) => {
      await addTerms(client, actors.negotiatorA1);
    });
    await committed(actors.negotiatorA1, async (client) => {
      id = await createDraft(
        client,
        actors.negotiatorA1,
        await storedPdf(client, actors.negotiatorA1),
      );
    });
    await asActor(actors.negotiatorA1, async (client) => {
      await addTerms(client, actors.negotiatorA1, { rent: 175000 });
      await complete(client, id);
    });
  });

  it("refuses Accounts, Read Only and other branches", async () => {
    let id = "";
    await committed(actors.negotiatorA1, async (client) => {
      id = await createDraft(
        client,
        actors.negotiatorA1,
        await storedPdf(client, actors.negotiatorA1),
      );
    });
    for (const actor of [
      actors.accountsA1,
      actors.readOnlyA1,
      actors.negotiatorA2,
      actors.ownerB,
    ]) {
      await asActor(actor, async (client) => {
        const result = await complete(client, id);
        expect(result.rowCount).toBe(0);
      });
    }
  });
});

describe("changing an agreement", () => {
  it("never changes a completed agreement or what any agreement covers", async () => {
    const id = await completedAgreement();
    await asActor(actors.negotiatorA1, async (client) => {
      await refused(client, "23514", () => discard(client, id, "Wrong file"));
      await refused(client, "23514", () =>
        complete(client, id, "public.uk_today() - 1"),
      );
      await refused(client, ["23514", "42501"], () =>
        client.query(
          `UPDATE "instruction_agreements"
           SET "material_fingerprint" = $2 WHERE "id" = $1::uuid`,
          [id, "c".repeat(64)],
        ),
      );
      await refused(client, "42501", () =>
        client.query(
          `DELETE FROM "instruction_agreements" WHERE "id" = $1::uuid`,
          [id],
        ),
      );
    });
  });

  it("discards a draft only with a reason, recording who did it", async () => {
    await asActor(actors.negotiatorA1, async (client) => {
      const id = await createDraft(
        client,
        actors.negotiatorA1,
        await storedPdf(client, actors.negotiatorA1),
      );
      await refused(client, "23514", () => discard(client, id, "  "));
      await discard(client, id, "Uploaded the wrong file");
      const row = await agreementRow(client, id);
      expect(row.state).toBe("discarded");
      expect(row.discarded_by_membership_id).toBe(ids.negotiatorA1);
      await refused(client, "23514", () => complete(client, id));
    });
  });

  it("keeps the file of any agreement that is not discarded", async () => {
    await asActor(actors.negotiatorA1, async (client) => {
      const pdf = await storedPdf(client, actors.negotiatorA1);
      const id = await createDraft(client, actors.negotiatorA1, pdf);
      const remove = () =>
        setStatus(client, pdf, {
          status: "removed",
          removalReason: "Wrong file",
          removedBy: ids.negotiatorA1,
        });
      await refused(client, "23514", remove);
      await discard(client, id, "Wrong file");
      await remove();
    });
    const completedId = await completedAgreement();
    await asActor(actors.negotiatorA1, async (client) => {
      const pdf = await client.query<{ document_id: string }>(
        `SELECT "document_id" FROM "instruction_agreements"
         WHERE "id" = $1::uuid`,
        [completedId],
      );
      await refused(client, "23514", () =>
        setStatus(client, pdf.rows[0].document_id, {
          status: "removed",
          removalReason: "Wrong file",
          removedBy: ids.negotiatorA1,
        }),
      );
    });
  });
});

describe("seeing agreements", () => {
  it("shows every staff role the agreements in its scope, and no one else's", async () => {
    const id = await completedAgreement();
    const visible = async (actor: Actor) => {
      let count = 0;
      await asActor(actor, async (client) => {
        const result = await client.query(
          `SELECT 1 FROM "instruction_agreements" WHERE "id" = $1::uuid`,
          [id],
        );
        count = result.rowCount ?? 0;
      });
      return count;
    };
    for (const actor of [
      actors.ownerA,
      actors.managerA1,
      actors.negotiatorA1,
      actors.propertyManagerA1,
      actors.accountsA1,
      actors.readOnlyA1,
    ]) {
      expect(await visible(actor), actor.membershipId).toBe(1);
    }
    for (const actor of [actors.negotiatorA2, actors.ownerB]) {
      expect(await visible(actor), actor.membershipId).toBe(0);
    }
  });
});

describe("the old agreement controls", () => {
  it("refuses a hand-recorded Signed milestone but keeps Prepared and Sent", async () => {
    await asActor(actors.negotiatorA1, async (client) => {
      const event = (status: string, signedOn = "NULL") =>
        client.query(
          `INSERT INTO "instruction_agreement_events" ("workspace_id",
            "instruction_id", "to_status", "signed_on",
            "recorded_by_membership_id")
           VALUES ($1::uuid, $2::uuid, $3::instruction_agreement_status,
             ${signedOn}, $4::uuid)`,
          [ids.workspaceA, instructions.a1, status, ids.negotiatorA1],
        );
      await refused(client, "23514", () =>
        event("signed", "public.uk_today()"),
      );
      await event("prepared");
    });
  });
});
