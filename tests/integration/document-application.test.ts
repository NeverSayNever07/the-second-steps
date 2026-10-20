import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  authoriseDocumentUpload,
  downloadDocument,
  uploadDocument,
  type DocumentTarget,
} from "@/core/documents/application/documents";
import { createMemoryDocumentStore } from "../memory-document-store";

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
const workspaceSlug = "documents-app";
const otherSlug = "documents-other";

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

let instructionId = "";

const text = (value: string) => Array.from(value, (c) => c.charCodeAt(0));
const PDF = new Uint8Array(
  text("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"),
);
const PNG = new Uint8Array([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  0,
  0,
  0,
  13,
  ...text("IHDR"),
  ...new Array<number>(17).fill(0),
  0,
  0,
  0,
  0,
  ...text("IEND"),
  0xae,
  0x42,
  0x60,
  0x82,
]);

const evidence = (propertyId: string = ids.propertyA): DocumentTarget => ({
  kind: "compliance_evidence",
  propertyId,
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

async function documentRow(id: string | undefined) {
  const { rows } = await adminPool.query<{
    status: string;
    failure_code: string | null;
    display_name: string;
    sha256: string;
    byte_size: number;
  }>(
    `SELECT "status", "failure_code", "display_name", "sha256", "byte_size"
     FROM "documents" WHERE "id" = $1::uuid`,
    [id],
  );
  return rows[0];
}

async function latestDocumentId() {
  const { rows } = await adminPool.query<{ id: string }>(
    `SELECT "id" FROM "documents" ORDER BY "created_at" DESC LIMIT 1`,
  );
  return rows[0]?.id;
}

async function auditActions(outcome?: string) {
  const { rows } = await adminPool.query<{ action: string; reason: string }>(
    `SELECT "action", COALESCE("metadata"->>'reason', '') AS "reason"
     FROM "audit_events"
     WHERE "target_type" = 'document'
       AND ($1::text IS NULL OR "outcome"::text = $1)
     ORDER BY "created_at"`,
    [outcome ?? null],
  );
  return rows;
}

beforeEach(async () => {
  await seedReferenceData();
  instructionId = await createInstruction();
});

afterAll(async () => {
  await adminPool.end();
  await runtimePool.end();
});

describe("checking an upload before its file is read", () => {
  it("allows operational staff on records in their branch", async () => {
    for (const name of [
      "owner",
      "managerA",
      "negotiatorA",
      "propertyManagerA",
    ] as const) {
      expect(await authoriseDocumentUpload(as(name), evidence())).toEqual({
        ok: true,
      });
      expect(
        await authoriseDocumentUpload(as(name), {
          kind: "instruction_agreement",
          instructionId,
        }),
      ).toEqual({ ok: true });
    }
  });

  it("refuses Accounts and Read Only, and records the refusal", async () => {
    for (const name of ["accountsA", "readOnlyA"] as const) {
      expect(await authoriseDocumentUpload(as(name), evidence())).toEqual({
        ok: false,
        error: "access_denied",
      });
    }
    expect((await auditActions("denied")).length).toBe(2);
  });

  it("does not reveal records outside the member's branch or workspace", async () => {
    expect(
      await authoriseDocumentUpload(as("negotiatorB"), evidence()),
    ).toEqual({
      ok: false,
      error: "record_not_found",
    });
    expect(await authoriseDocumentUpload(as("otherOwner"), evidence())).toEqual(
      {
        ok: false,
        error: "record_not_found",
      },
    );
    expect(
      await authoriseDocumentUpload(
        as("negotiatorA"),
        evidence(ids.propertyOther),
      ),
    ).toEqual({ ok: false, error: "record_not_found" });
    expect(
      await authoriseDocumentUpload(as("negotiatorA"), evidence("not-an-id")),
    ).toEqual({ ok: false, error: "record_not_found" });
  });

  it("refuses an archived property", async () => {
    expect(
      await authoriseDocumentUpload(
        as("negotiatorA"),
        evidence(ids.propertyArchived),
      ),
    ).toEqual({ ok: false, error: "record_closed" });
  });

  it("refuses an unknown sign-in or workspace", async () => {
    expect(
      await authoriseDocumentUpload(
        { authSubject: randomUUID(), workspaceSlug },
        evidence(),
      ),
    ).toEqual({ ok: false, error: "access_denied" });
    expect(
      await authoriseDocumentUpload(
        { authSubject: auth.negotiatorA, workspaceSlug: otherSlug },
        evidence(),
      ),
    ).toEqual({ ok: false, error: "access_denied" });
  });
});

describe("uploading and downloading", () => {
  it("stores a checked file and lets every staff role in scope download it", async () => {
    const { store, objects } = createMemoryDocumentStore();
    const uploaded = await uploadDocument({
      actor: as("negotiatorA"),
      target: evidence(),
      originalName: "C:\\scans\\Gas safety record.PNG",
      bytes: PNG,
      store,
    });
    expect(uploaded).toMatchObject({
      ok: true,
      document: { displayName: "Gas safety record.png", media: "png" },
    });
    if (!uploaded.ok) return;

    const row = await documentRow(uploaded.document.id);
    expect(row).toMatchObject({ status: "stored", byte_size: PNG.length });
    expect([...objects.keys()]).toEqual([
      `${ids.workspace}/${uploaded.document.id}.png`,
    ]);

    for (const name of [
      "owner",
      "managerA",
      "propertyManagerA",
      "accountsA",
      "readOnlyA",
    ] as const) {
      const downloaded = await downloadDocument({
        actor: as(name),
        documentId: uploaded.document.id,
        store,
      });
      expect(downloaded.ok).toBe(true);
      if (downloaded.ok) expect(downloaded.bytes).toEqual(PNG);
    }
    const audit = await auditActions("succeeded");
    expect(audit.filter((e) => e.action === "document.upload")).toHaveLength(1);
    expect(audit.filter((e) => e.action === "document.download")).toHaveLength(
      5,
    );
  });

  it("never serves a file across a branch or workspace", async () => {
    const { store } = createMemoryDocumentStore();
    const uploaded = await uploadDocument({
      actor: as("negotiatorA"),
      target: evidence(),
      originalName: "evidence.png",
      bytes: PNG,
      store,
    });
    if (!uploaded.ok) throw new Error("upload failed");
    const documentId = uploaded.document.id;

    for (const actor of [
      as("negotiatorB"),
      as("otherOwner"),
      // The same person, asking through their other workspace.
      { authSubject: dual.auth, workspaceSlug: otherSlug },
    ]) {
      expect(await downloadDocument({ actor, documentId, store })).toEqual({
        ok: false,
        error: "document_not_found",
      });
    }
    // Through the workspace that holds it, the same person can download.
    const here = await downloadDocument({
      actor: { authSubject: dual.auth, workspaceSlug },
      documentId,
      store,
    });
    expect(here.ok).toBe(true);
    expect(
      (await auditActions("denied")).filter(
        (e) => e.action === "document.download",
      ),
    ).toHaveLength(3);
  });

  it("accepts only PDFs as agreements, and refuses encrypted ones", async () => {
    const { store, objects } = createMemoryDocumentStore();
    const target: DocumentTarget = {
      kind: "instruction_agreement",
      instructionId,
    };
    expect(
      await uploadDocument({
        actor: as("propertyManagerA"),
        target,
        originalName: "terms.png",
        bytes: PNG,
        store,
      }),
    ).toEqual({ ok: false, error: "type_not_allowed" });
    expect(
      await uploadDocument({
        actor: as("propertyManagerA"),
        target,
        originalName: "terms.pdf",
        bytes: new Uint8Array(
          text("%PDF-1.7\ntrailer\n<< /Encrypt 5 0 R >>\n%%EOF\n"),
        ),
        store,
      }),
    ).toEqual({ ok: false, error: "encrypted_pdf" });
    expect(objects.size).toBe(0);
    expect(await latestDocumentId()).toBeUndefined();

    const uploaded = await uploadDocument({
      actor: as("propertyManagerA"),
      target,
      originalName: "Signed terms.pdf",
      bytes: PDF,
      store,
    });
    expect(uploaded.ok).toBe(true);
  });

  it("refuses an upload by a role that cannot work on the record", async () => {
    const { store, objects } = createMemoryDocumentStore();
    expect(
      await uploadDocument({
        actor: as("accountsA"),
        target: evidence(),
        originalName: "evidence.png",
        bytes: PNG,
        store,
      }),
    ).toEqual({ ok: false, error: "access_denied" });
    expect(objects.size).toBe(0);
    expect(await latestDocumentId()).toBeUndefined();
  });
});

describe("failures", () => {
  it("marks the upload failed and stores nothing when the store refuses", async () => {
    const { store, objects, switches } = createMemoryDocumentStore();
    switches.failPut = true;
    expect(
      await uploadDocument({
        actor: as("negotiatorA"),
        target: evidence(),
        originalName: "evidence.png",
        bytes: PNG,
        store,
      }),
    ).toEqual({ ok: false, error: "storage_unavailable" });
    const id = await latestDocumentId();
    expect(await documentRow(id)).toMatchObject({
      status: "failed",
      failure_code: "storage_failed",
    });
    expect(objects.size).toBe(0);
  });

  it("removes the file when the record that uses it cannot be saved", async () => {
    const { store, objects } = createMemoryDocumentStore();
    expect(
      await uploadDocument({
        actor: as("negotiatorA"),
        target: evidence(),
        originalName: "evidence.png",
        bytes: PNG,
        store,
        attach: async () => {
          throw new Error("the business record failed");
        },
      }),
    ).toEqual({ ok: false, error: "storage_unavailable" });
    const id = await latestDocumentId();
    expect(await documentRow(id)).toMatchObject({
      status: "failed",
      failure_code: "link_failed",
    });
    expect(objects.size).toBe(0);
  });

  it("refuses a file altered or lost in storage before sending anything", async () => {
    const { store, objects, switches } = createMemoryDocumentStore();
    const uploaded = await uploadDocument({
      actor: as("negotiatorA"),
      target: evidence(),
      originalName: "evidence.png",
      bytes: PNG,
      store,
    });
    if (!uploaded.ok) throw new Error("upload failed");
    const key = [...objects.keys()][0];
    const documentId = uploaded.document.id;

    const altered = new Uint8Array(PNG);
    altered[20] = 0xff;
    objects.set(key, altered);
    expect(
      await downloadDocument({ actor: as("negotiatorA"), documentId, store }),
    ).toEqual({ ok: false, error: "integrity_mismatch" });

    objects.set(key, PNG.subarray(0, PNG.length - 1));
    expect(
      await downloadDocument({ actor: as("negotiatorA"), documentId, store }),
    ).toEqual({ ok: false, error: "integrity_mismatch" });

    switches.failGet = true;
    expect(
      await downloadDocument({ actor: as("negotiatorA"), documentId, store }),
    ).toEqual({ ok: false, error: "storage_unavailable" });

    const failed = await auditActions("failed");
    expect(failed.map((e) => e.action)).toEqual([
      "document.integrity_mismatch",
      "document.integrity_mismatch",
      "document.download",
    ]);
  });

  it("serves only stored files", async () => {
    const { store, switches } = createMemoryDocumentStore();
    switches.failPut = true;
    await uploadDocument({
      actor: as("negotiatorA"),
      target: evidence(),
      originalName: "evidence.png",
      bytes: PNG,
      store,
    });
    const failedId = await latestDocumentId();
    expect(
      await downloadDocument({
        actor: as("negotiatorA"),
        documentId: failedId,
        store,
      }),
    ).toEqual({ ok: false, error: "document_not_found" });
    expect(
      await downloadDocument({
        actor: as("negotiatorA"),
        documentId: "../../etc/passwd",
        store,
      }),
    ).toEqual({ ok: false, error: "document_not_found" });
  });

  it("cleans up a colleague's upload abandoned for over an hour", async () => {
    const { store, objects } = createMemoryDocumentStore();
    // A pending row and its file, left behind by a stopped upload.
    const abandonedId = await asManagerA(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO "documents" ("workspace_id", "kind", "property_id",
          "display_name", "media_type", "byte_size", "sha256",
          "uploaded_by_membership_id")
         VALUES ($1::uuid, 'compliance_evidence', $2::uuid, 'Left.png', 'png',
           $3, $4, $5::uuid)
         RETURNING "id"`,
        [
          ids.workspace,
          ids.propertyA,
          PNG.length,
          "c".repeat(64),
          memberships.managerA,
        ],
      );
      return rows[0].id;
    });
    const abandonedKey = `${ids.workspace}/${abandonedId}.png`;
    objects.set(abandonedKey, PNG);

    // Not yet an hour old: left alone.
    await uploadDocument({
      actor: as("negotiatorA"),
      target: evidence(),
      originalName: "first.png",
      bytes: PNG,
      store,
    });
    expect((await documentRow(abandonedId)).status).toBe("pending");
    expect(objects.has(abandonedKey)).toBe(true);

    const client = await adminPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL session_replication_role = replica");
      await client.query(
        `UPDATE "documents" SET "created_at" = now() - interval '2 hours'
         WHERE "id" = $1::uuid`,
        [abandonedId],
      );
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    await uploadDocument({
      actor: as("negotiatorA"),
      target: evidence(),
      originalName: "second.png",
      bytes: PNG,
      store,
    });
    expect(await documentRow(abandonedId)).toMatchObject({
      status: "failed",
      failure_code: "abandoned",
    });
    expect(objects.has(abandonedKey)).toBe(false);
    // The two new uploads are untouched.
    expect(objects.size).toBe(2);
  });
});
