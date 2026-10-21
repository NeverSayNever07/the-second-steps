import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  attachComplianceEvidence,
  getPropertyCompliance,
  recordApplicability,
  recordEvidenceStatus,
  recordEvidenceWithoutFile,
} from "@/core/compliance/application/property-compliance";
import { getComplianceAttention } from "@/core/compliance/application/compliance-attention";
import { uploadDocument } from "@/core/documents/application/documents";
import { ukToday } from "@/core/enquiries/domain/enquiry";
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
const workspaceSlug = "compliance-app";
const otherSlug = "compliance-other";

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

const text = (value: string) => Array.from(value, (c) => c.charCodeAt(0));
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

const FACTS = { eventOn: "2026-01-10", expiresOn: "2027-01-09" };

async function uploadGas(
  name: UserName,
  propertyId: string = ids.propertyA,
  facts = FACTS,
) {
  const { store } = createMemoryDocumentStore();
  return uploadDocument({
    actor: as(name),
    target: { kind: "compliance_evidence", propertyId },
    originalName: "Gas safety record.png",
    bytes: PNG,
    store,
    attach: attachComplianceEvidence({
      propertyId,
      area: "gas_safety",
      facts,
    }),
  });
}

async function auditActions(outcome?: string) {
  const { rows } = await adminPool.query<{
    action: string;
    reason: string;
    metadata: string;
  }>(
    `SELECT "action", COALESCE("metadata"->>'reason', '') AS "reason",
       "metadata"::text AS "metadata"
     FROM "audit_events"
     WHERE "action" LIKE 'compliance.%'
       AND ($1::text IS NULL OR "outcome"::text = $1)
     ORDER BY "created_at"`,
    [outcome ?? null],
  );
  return rows;
}

async function appliesGas() {
  const result = await recordApplicability({
    ...as("managerA"),
    propertyId: ids.propertyA,
    area: "gas_safety",
    applicability: "applies",
  });
  expect(result.ok).toBe(true);
}

async function gasView(name: UserName) {
  const result = await getPropertyCompliance({
    ...as(name),
    propertyId: ids.propertyA,
  });
  if (!result.ok) throw new Error("view failed");
  return result.view.areas.find((area) => area.area === "gas_safety")!;
}

beforeEach(seedReferenceData);

afterAll(async () => {
  await adminPool.end();
  await runtimePool.end();
});

describe("the compliance journey", () => {
  it("shows every area as Not assessed before anything is recorded", async () => {
    const result = await getPropertyCompliance({
      ...as("readOnlyA"),
      propertyId: ids.propertyA,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.view).toMatchObject({ canManage: false, isOpen: true });
    expect(result.view.areas.map((area) => area.area)).toEqual([
      "epc_mees",
      "gas_safety",
      "electrical_safety",
      "smoke_co_alarms",
      "licensing",
    ]);
    for (const area of result.view.areas) {
      expect(area).toMatchObject({
        applicability: "not_assessed",
        status: "not_requested",
        evidenceList: [],
      });
    }
    expect(result.view.areas[3].isFileRequired).toBe(false);
  });

  it("goes from assessed to evidence to reviewed, then supersedes old evidence", async () => {
    await appliesGas();
    expect((await uploadGas("negotiatorA")).ok).toBe(true);
    expect(
      (
        await uploadGas("negotiatorA", ids.propertyA, {
          eventOn: "2026-06-01",
          expiresOn: "2027-05-31",
        })
      ).ok,
    ).toBe(true);

    let gas = await gasView("accountsA");
    expect(gas.applicability).toBe("applies");
    expect(gas.evidenceList).toHaveLength(2);
    const [newer, older] = gas.evidenceList;
    expect(newer.eventOn).toBe("2026-06-01");
    expect(newer.documentId).toBeTruthy();

    for (const evidence of [older, newer]) {
      expect(
        await recordEvidenceStatus({
          ...as("negotiatorA"),
          propertyId: ids.propertyA,
          area: "gas_safety",
          status: "reviewed",
          evidenceId: evidence.id,
        }),
      ).toMatchObject({ ok: true });
    }
    gas = await gasView("accountsA");
    expect(gas.status).toBe("reviewed");
    expect(gas.reliedEvidenceId).toBe(newer.id);
    expect(gas.evidenceList.map((row) => row.relation)).toEqual([
      "relied_on",
      "superseded",
    ]);
    expect(gas.isExpired).toBe(false);
  });

  it("records evidence without a file only for smoke and CO alarms", async () => {
    expect(
      await recordEvidenceWithoutFile({
        ...as("managerA"),
        propertyId: ids.propertyA,
        area: "gas_safety",
        facts: FACTS,
      }),
    ).toEqual({ ok: false, error: "file_required" });
    expect(
      await recordEvidenceWithoutFile({
        ...as("managerA"),
        propertyId: ids.propertyA,
        area: "smoke_co_alarms",
        facts: { eventOn: "2026-09-01", notes: "Tested all alarms" },
      }),
    ).toMatchObject({ ok: true });
  });

  it("needs the area to apply, and the evidence to belong to it", async () => {
    expect((await uploadGas("managerA")).ok).toBe(true);
    const status = (area: string, evidenceId: string | null) =>
      recordEvidenceStatus({
        ...as("managerA"),
        propertyId: ids.propertyA,
        area,
        status: evidenceId ? "reviewed" : "awaiting_evidence",
        evidenceId,
      });

    expect(await status("gas_safety", null)).toEqual({
      ok: false,
      error: "not_applicable",
    });
    await appliesGas();
    const evidenceId = (await gasView("managerA")).evidenceList[0].id;
    expect(await status("licensing", evidenceId)).toMatchObject({ ok: false });
    expect(await status("gas_safety", randomUUID())).toEqual({
      ok: false,
      error: "evidence_not_found",
    });
    expect(await status("gas_safety", "not-an-id")).toEqual({
      ok: false,
      error: "invalid_input",
    });
  });

  it("reports Expired from the entered date without changing the status", async () => {
    await appliesGas();
    await uploadGas("managerA", ids.propertyA, {
      eventOn: "2024-01-10",
      expiresOn: "2025-01-09",
    });
    await recordEvidenceStatus({
      ...as("managerA"),
      propertyId: ids.propertyA,
      area: "gas_safety",
      status: "reviewed",
      evidenceId: (await gasView("managerA")).evidenceList[0].id,
    });
    expect(await gasView("managerA")).toMatchObject({
      status: "reviewed",
      isExpired: true,
    });
  });

  it("shows a removed file as File removed", async () => {
    await appliesGas();
    await uploadGas("managerA");
    const documentId = (await gasView("managerA")).evidenceList[0].documentId;
    // The file is removed outside the app, as a cleanup would.
    const client = await adminPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL session_replication_role = replica");
      await client.query(
        `UPDATE "documents" SET "status" = 'removed',
          "removal_reason" = 'Wrong file',
          "removed_by_membership_id" = $2::uuid, "ended_at" = now()
         WHERE "id" = $1::uuid`,
        [documentId, memberships.managerA],
      );
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    expect((await gasView("managerA")).evidenceList[0]).toMatchObject({
      documentId: null,
      isFileRemoved: true,
    });
  });
});

describe("who may record", () => {
  it("lets operational staff record in their branch and refuses Accounts and Read Only", async () => {
    for (const name of [
      "owner",
      "managerA",
      "negotiatorA",
      "propertyManagerA",
    ] as const) {
      const result = await recordApplicability({
        ...as(name),
        propertyId: ids.propertyA,
        area: "licensing",
        applicability: "applies",
      });
      expect(result.ok, name).toBe(true);
    }
    for (const name of ["accountsA", "readOnlyA"] as const) {
      expect(
        await recordApplicability({
          ...as(name),
          propertyId: ids.propertyA,
          area: "licensing",
          applicability: "applies",
        }),
      ).toEqual({ ok: false, error: "access_denied" });
    }
  });

  it("does not reveal properties outside the member's branch or workspace", async () => {
    for (const [actor, propertyId] of [
      [as("negotiatorB"), ids.propertyA],
      [as("otherOwner"), ids.propertyA],
      [as("negotiatorA"), ids.propertyOther],
      [as("negotiatorA"), "not-an-id"],
    ] as const) {
      expect(
        await recordApplicability({
          ...actor,
          propertyId,
          area: "licensing",
          applicability: "applies",
        }),
      ).toEqual({ ok: false, error: "property_not_found" });
      expect(await getPropertyCompliance({ ...actor, propertyId })).toEqual({
        ok: false,
        error: "property_not_found",
      });
    }
  });

  it("refuses an archived property and an unknown area", async () => {
    expect(
      await recordApplicability({
        ...as("managerA"),
        propertyId: ids.propertyArchived,
        area: "licensing",
        applicability: "applies",
      }),
    ).toEqual({ ok: false, error: "property_closed" });
    expect(
      await recordApplicability({
        ...as("managerA"),
        propertyId: ids.propertyA,
        area: "legionella",
        applicability: "applies",
      }),
    ).toEqual({ ok: false, error: "invalid_input" });
  });

  it("refuses an unknown sign-in or a workspace the person is not in", async () => {
    expect(
      await recordApplicability({
        authSubject: randomUUID(),
        workspaceSlug,
        propertyId: ids.propertyA,
        area: "licensing",
        applicability: "applies",
      }),
    ).toEqual({ ok: false, error: "access_denied" });
    expect(
      await getPropertyCompliance({
        authSubject: auth.negotiatorA,
        workspaceSlug: otherSlug,
        propertyId: ids.propertyA,
      }),
    ).toEqual({ ok: false, error: "access_denied" });
  });
});

describe("input checks", () => {
  it("needs a reason for Does not apply and valid evidence facts", async () => {
    expect(
      await recordApplicability({
        ...as("managerA"),
        propertyId: ids.propertyA,
        area: "gas_safety",
        applicability: "does_not_apply",
      }),
    ).toEqual({ ok: false, error: "invalid_input" });
    expect(
      await recordEvidenceWithoutFile({
        ...as("managerA"),
        propertyId: ids.propertyA,
        area: "smoke_co_alarms",
        facts: { eventOn: "2999-01-01" },
      }),
    ).toEqual({ ok: false, error: "invalid_input" });
  });

  it("keeps a failed upload from leaving evidence or a stored file", async () => {
    const result = await uploadGas("managerA", ids.propertyA, {
      eventOn: "2999-01-01",
      expiresOn: "",
    });
    expect(result.ok).toBe(false);
    const { rows } = await adminPool.query<{
      evidence: number;
      stored: number;
    }>(
      `SELECT
        (SELECT count(*)::int FROM "property_compliance_evidence") AS evidence,
        (SELECT count(*)::int FROM "documents" WHERE "status" = 'stored')
          AS stored`,
    );
    expect(rows[0]).toEqual({ evidence: 0, stored: 0 });
  });
});

describe("the audit trail", () => {
  it("records successes and refusals with ids only", async () => {
    await appliesGas();
    await recordApplicability({
      ...as("readOnlyA"),
      propertyId: ids.propertyA,
      area: "gas_safety",
      applicability: "does_not_apply",
      reason: "Secret reason text",
    });
    await uploadGas("managerA");
    const all = await auditActions();
    expect(all.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        "compliance.applicability_record",
        "compliance.evidence_add",
      ]),
    );
    expect((await auditActions("denied")).map((row) => row.reason)).toEqual([
      "access_denied",
    ]);
    for (const row of all) {
      expect(row.metadata).not.toContain("Secret reason text");
      expect(row.metadata).not.toContain("Gas safety record");
    }
  });
});

describe("the compliance attention panel", () => {
  const dayOffset = (offset: number) => {
    const date = new Date(`${ukToday()}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };

  /** Applies, one piece of evidence with the given expiry, then reviewed. */
  async function reviewedWith(area: string, expiresOffset: number) {
    expect(
      await recordApplicability({
        ...as("managerA"),
        propertyId: ids.propertyA,
        area,
        applicability: "applies",
      }),
    ).toMatchObject({ ok: true });
    const { store } = createMemoryDocumentStore();
    const uploaded = await uploadDocument({
      actor: as("managerA"),
      target: { kind: "compliance_evidence", propertyId: ids.propertyA },
      originalName: "Evidence.png",
      bytes: PNG,
      store,
      attach: attachComplianceEvidence({
        propertyId: ids.propertyA,
        area,
        facts: {
          eventOn: dayOffset(-300),
          expiresOn: dayOffset(expiresOffset),
        },
      }),
    });
    expect(uploaded.ok).toBe(true);
    const view = await getPropertyCompliance({
      ...as("managerA"),
      propertyId: ids.propertyA,
    });
    if (!view.ok) throw new Error("view failed");
    const row = view.view.areas.find((item) => item.area === area)!;
    expect(
      await recordEvidenceStatus({
        ...as("managerA"),
        propertyId: ids.propertyA,
        area,
        status: "reviewed",
        evidenceId: row.evidenceList[0].id,
      }),
    ).toMatchObject({ ok: true });
  }

  it("lists expired and upcoming dates, most urgent first, and counts them", async () => {
    await reviewedWith("gas_safety", -3);
    await reviewedWith("epc_mees", -10);
    await reviewedWith("electrical_safety", 5);
    await reviewedWith("licensing", 100);

    const attention = await getComplianceAttention(as("managerA"));
    expect(attention).not.toBeNull();
    expect(attention!.counts).toEqual({
      critical: 1,
      expired: 2,
      actionRequired: 0,
      dueSoon: 1,
    });
    expect(attention!.total).toBe(3);
    expect(attention!.items.map((item) => [item.area, item.kind])).toEqual([
      ["gas_safety", "critical"],
      ["epc_mees", "expired"],
      ["electrical_safety", "within_7"],
    ]);
    expect(attention!.items[0]).toMatchObject({
      propertyId: ids.propertyA,
      days: -3,
    });
    expect(attention!.items[0].property).toContain("Test Street");
  });

  it("flags Action required and stops listing an area that no longer applies", async () => {
    await reviewedWith("gas_safety", 200);
    const view = await getPropertyCompliance({
      ...as("managerA"),
      propertyId: ids.propertyA,
    });
    if (!view.ok) throw new Error("view failed");
    await recordEvidenceStatus({
      ...as("managerA"),
      propertyId: ids.propertyA,
      area: "gas_safety",
      status: "action_required",
      evidenceId: view.view.areas[1].evidenceList[0].id,
      note: "Remedial work outstanding",
    });
    expect(
      (await getComplianceAttention(as("managerA")))!.counts,
    ).toMatchObject({ actionRequired: 1, critical: 0 });

    await recordApplicability({
      ...as("managerA"),
      propertyId: ids.propertyA,
      area: "gas_safety",
      applicability: "does_not_apply",
      reason: "No gas supply",
    });
    expect((await getComplianceAttention(as("managerA")))!.total).toBe(0);
  });

  it("shows each person only their branch, lets every property reader see it, and nobody else", async () => {
    await reviewedWith("gas_safety", -1);
    for (const name of [
      "owner",
      "negotiatorA",
      "accountsA",
      "readOnlyA",
    ] as const) {
      expect((await getComplianceAttention(as(name)))!.total, name).toBe(1);
    }
    expect((await getComplianceAttention(as("negotiatorB")))!.total).toBe(0);
    expect((await getComplianceAttention(as("otherOwner")))!.total).toBe(0);
    expect(
      await getComplianceAttention({
        authSubject: randomUUID(),
        workspaceSlug,
      }),
    ).toBeNull();
  });
});
