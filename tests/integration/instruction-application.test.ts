import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPropertyLeadHistory } from "@/core/properties/application/property-lead-history";
import { closeEnquiry } from "@/core/enquiries/application/enquiries";
import {
  archiveContact,
  listContacts,
} from "@/core/contacts/application/contacts";
import {
  getContactLandlordHistory,
  getPropertiesWithUsCount,
  listLandlords,
} from "@/core/contacts/application/landlords";
import { archiveProperty } from "@/core/properties/application/properties";
import { getInstructionAttention } from "@/core/instructions/application/instruction-attention";
import { searchWorkspace } from "@/core/workspace/application/workspace-search";
import { listPropertyPage } from "@/core/properties/application/property-list";
import { transferPropertyBranch } from "@/core/properties/application/property-ownership";
import { uploadDocument } from "@/core/documents/application/documents";
import { createMemoryDocumentStore } from "../memory-document-store";
import {
  addInstructionParty,
  approveInstructionException,
  attachAgreementDraft,
  changeInstructionMainContact,
  completeInstructionAgreement,
  discardInstructionAgreementDraft,
  endInstruction,
  markInstructionReadyToMarket,
  recordInstructionAgreement,
  recordInstructionOwnershipCheck,
  removeInstructionParty,
  replaceInstructionTerms,
  returnInstructionToOnboarding,
  setInstructionLeadStaff,
  startInstruction,
} from "@/core/instructions/application/instructions";
import {
  findInstructionForEnquiry,
  getInstruction,
  getStartInstructionReview,
  listInstructions,
  listInstructionsForProperty,
} from "@/core/instructions/application/instruction-records";
import type { TermsInput } from "@/core/instructions/domain/instruction";
import { ukToday } from "@/core/enquiries/domain/enquiry";

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
const workspaceSlug = "instruction-app";
const otherSlug = "instruction-other";
const ids = {
  workspace: randomUUID(),
  other: randomUUID(),
  branchA: randomUUID(),
  branchB: randomUUID(),
  branchOther: randomUUID(),
  source: randomUUID(),
  lostReason: randomUUID(),
  personA: randomUUID(),
  personB: randomUUID(),
  personC: randomUUID(),
  archived: randomUUID(),
  propertyA: randomUUID(),
  propertyA2: randomUUID(),
  propertyB: randomUUID(),
  leadA: randomUUID(),
  leadA2: randomUUID(),
  leadNew: randomUUID(),
  leadB: randomUUID(),
  appraisalA: randomUUID(),
};

const users = {
  owner: { role: "workspace_owner", workspaceScope: true, branches: [] },
  managerA: {
    role: "branch_manager",
    workspaceScope: false,
    branches: ["branchA"],
  },
  negotiatorA: {
    role: "negotiator",
    workspaceScope: false,
    branches: ["branchA"],
  },
  negotiatorA2: {
    role: "negotiator",
    workspaceScope: false,
    branches: ["branchA"],
  },
  propertyManagerA: {
    role: "property_manager",
    workspaceScope: false,
    branches: ["branchA"],
  },
  negotiatorB: {
    role: "negotiator",
    workspaceScope: false,
    branches: ["branchB"],
  },
  accountsA: { role: "accounts", workspaceScope: false, branches: ["branchA"] },
  readOnlyA: {
    role: "read_only",
    workspaceScope: false,
    branches: ["branchA"],
  },
  otherOwner: {
    role: "workspace_owner",
    workspaceScope: true,
    branches: [],
    workspace: "other",
  },
} as const;
type UserName = keyof typeof users;
const auth = Object.fromEntries(
  Object.keys(users).map((name) => [name, randomUUID()]),
) as Record<UserName, string>;
const memberships = Object.fromEntries(
  Object.keys(users).map((name) => [name, randomUUID()]),
) as Record<UserName, string>;

const as = (name: UserName) => ({
  authSubject: auth[name],
  workspaceSlug: name === "otherOwner" ? otherSlug : workspaceSlug,
});

async function addUser(client: PoolClient, name: UserName) {
  const user = users[name];
  const workspaceId = "workspace" in user ? ids.other : ids.workspace;
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
      workspaceId,
      identityId,
      user.workspaceScope ? "workspace" : "named_branches",
    ],
  );
  await client.query(
    `INSERT INTO "membership_roles" ("workspace_id", "membership_id", "role_code")
     VALUES ($1::uuid, $2::uuid, $3::membership_role_code)`,
    [workspaceId, memberships[name], user.role],
  );
  for (const branch of user.branches as readonly ("branchA" | "branchB")[]) {
    await client.query(
      `INSERT INTO "membership_branch_access"
        ("workspace_id", "membership_id", "branch_id")
       VALUES ($1::uuid, $2::uuid, $3::uuid)`,
      [workspaceId, memberships[name], ids[branch]],
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
       VALUES ($1::uuid, $2, 'Instruction App', 'agency', CURRENT_TIMESTAMP),
              ($3::uuid, $4, 'Instruction Other', 'agency', CURRENT_TIMESTAMP)`,
      [ids.workspace, workspaceSlug, ids.other, otherSlug],
    );
    await client.query(
      `INSERT INTO "branches" ("id", "workspace_id", "name", "updated_at")
       VALUES ($1::uuid, $4::uuid, 'Branch A', CURRENT_TIMESTAMP),
              ($2::uuid, $4::uuid, 'Branch B', CURRENT_TIMESTAMP),
              ($3::uuid, $5::uuid, 'Other Branch', CURRENT_TIMESTAMP)`,
      [ids.branchA, ids.branchB, ids.branchOther, ids.workspace, ids.other],
    );
    for (const name of Object.keys(users) as UserName[]) {
      await addUser(client, name);
    }
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [
      ids.workspace,
    ]);
    for (const [contactId, ref, first, archived] of [
      [ids.personA, "PER-JA111111", "Olivia", false],
      [ids.personB, "PER-JA222222", "Peter", false],
      [ids.personC, "PER-JA333333", "Quinn", false],
      [ids.archived, "PER-JA444444", "Old", true],
    ] as const) {
      await client.query(
        `INSERT INTO "contacts" ("id", "workspace_id", "kind", "reference",
          "first_name", "last_name", "status", "archived_at",
          "created_by_membership_id", "updated_at")
         VALUES ($1::uuid, $2::uuid, 'person', $3, $4, 'Landlord',
           $5::contact_status, $6, $7::uuid, CURRENT_TIMESTAMP)`,
        [
          contactId,
          ids.workspace,
          ref,
          first,
          archived ? "archived" : "active",
          archived ? new Date() : null,
          memberships.negotiatorA,
        ],
      );
      await client.query(
        `INSERT INTO "contact_branch_links" ("workspace_id", "contact_id",
          "branch_id", "is_primary", "created_by_membership_id", "updated_at")
         VALUES ($1::uuid, $2::uuid, $3::uuid, true, $4::uuid, CURRENT_TIMESTAMP)`,
        [ids.workspace, contactId, ids.branchA, memberships.negotiatorA],
      );
    }
    for (const [propertyId, branchId, ref] of [
      [ids.propertyA, ids.branchA, "PRP-JAAA2222"],
      [ids.propertyA2, ids.branchA, "PRP-JABB2222"],
      [ids.propertyB, ids.branchB, "PRP-JACC2222"],
    ]) {
      await client.query(
        `INSERT INTO "properties" ("id", "workspace_id", "reference",
          "responsible_branch_id", "address_street", "town_city", "postcode",
          "normalized_address_key", "property_type", "created_by_membership_id", "updated_at")
         VALUES ($1::uuid, $2::uuid, $3, $4::uuid, '1 Test Street', 'London',
           'SW1A 1AA', $3, 'flat', $5::uuid, CURRENT_TIMESTAMP)`,
        [propertyId, ids.workspace, ref, branchId, memberships.negotiatorA],
      );
    }
    await client.query(
      "SELECT set_config('app.membership_id', $1, true), set_config('app.membership_scope_mode', 'workspace', true)",
      [memberships.negotiatorA],
    );
    await client.query(
      `INSERT INTO "property_ownerships" ("workspace_id", "property_id",
        "contact_id", "is_lead", "created_by_membership_id", "updated_at")
       VALUES ($1::uuid, $2::uuid, $3::uuid, true, $4::uuid, CURRENT_TIMESTAMP)`,
      [ids.workspace, ids.propertyA, ids.personA, memberships.negotiatorA],
    );
    await client.query(
      `INSERT INTO "lead_sources" ("id", "workspace_id", "name", "updated_at")
       VALUES ($1::uuid, $2::uuid, 'Rightmove', CURRENT_TIMESTAMP)`,
      [ids.source, ids.workspace],
    );
    await client.query(
      `INSERT INTO "enquiry_outcome_reasons" ("id", "workspace_id", "name",
        "applies_to", "updated_at")
       VALUES ($1::uuid, $2::uuid, 'No longer proceeding', 'lost', CURRENT_TIMESTAMP)`,
      [ids.lostReason, ids.workspace],
    );
    for (const [id, ref, branchId, stage, contactId, propertyId] of [
      [
        ids.leadA,
        "ENQ-JAAA2222",
        ids.branchA,
        "appraisal_completed",
        ids.personA,
        ids.propertyA,
      ],
      [
        ids.leadA2,
        "ENQ-JABB2222",
        ids.branchA,
        "appraisal_completed",
        ids.personB,
        ids.propertyA,
      ],
      [
        ids.leadNew,
        "ENQ-JACC2222",
        ids.branchA,
        "new_enquiry",
        null,
        ids.propertyA2,
      ],
      [
        ids.leadB,
        "ENQ-JADD2222",
        ids.branchB,
        "appraisal_completed",
        ids.personC,
        ids.propertyB,
      ],
    ] as const) {
      await client.query(
        `INSERT INTO "landlord_enquiries" ("id", "workspace_id", "reference",
          "responsible_branch_id", "stage", "enquirer_name", "enquirer_telephone",
          "postcode", "contact_id", "property_id", "lead_source_id",
          "lead_membership_id", "created_by_membership_id", "updated_at")
         VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5::enquiry_stage,
           'Olivia Landlord', '07700 900111', 'SW1A 1AA', $6::uuid, $7::uuid,
           $8::uuid, $9::uuid, $9::uuid, CURRENT_TIMESTAMP)`,
        [
          id,
          ids.workspace,
          ref,
          branchId,
          stage,
          contactId,
          propertyId,
          stage === "new_enquiry" ? null : ids.source,
          memberships.negotiatorA,
        ],
      );
    }
    await client.query(
      `INSERT INTO "enquiry_tasks" ("workspace_id", "enquiry_id", "title",
        "due_on", "assigned_membership_id", "created_by_membership_id", "updated_at")
       VALUES ($1::uuid, $2::uuid, 'Chase decision', CURRENT_DATE,
         $3::uuid, $3::uuid, CURRENT_TIMESTAMP)`,
      [ids.workspace, ids.leadA, memberships.negotiatorA],
    );
    await client.query(
      `INSERT INTO "appraisals" ("id", "workspace_id", "enquiry_id",
        "scheduled_at", "assigned_membership_id", "status", "completed_at",
        "expected_monthly_rent_pence", "recommended_service", "fee_kind",
        "fee_value", "fee_vat", "created_by_membership_id", "updated_at")
       VALUES ($1::uuid, $2::uuid, $3::uuid, CURRENT_TIMESTAMP - interval '2 days',
         $4::uuid, 'completed', CURRENT_TIMESTAMP, 185000, 'fully_managed',
         'percentage', 1200, 'exclusive', $4::uuid, CURRENT_TIMESTAMP)`,
      [ids.appraisalA, ids.workspace, ids.leadA, memberships.negotiatorA],
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

const TERMS: TermsInput = {
  service: "fully_managed",
  askingRent: "1850",
  rentPeriod: "month",
  feeKind: "percentage",
  feeValue: "12",
  feeFrequency: "monthly",
  feeVat: "exclusive",
  depositOffering: "standard",
  deposit: "2134.62",
  holdingDeposit: "",
  charges: [],
};

const INCOMPLETE_TERMS: TermsInput = {
  ...TERMS,
  askingRent: "",
  rentPeriod: "",
  feeKind: "",
  feeValue: "",
  feeVat: "",
  depositOffering: "",
  deposit: "",
};

async function count(sql: string, params: unknown[] = []) {
  const result = await adminPool.query<{ n: string }>(sql, params);
  return Number(result.rows[0].n);
}

async function start(
  by: UserName = "negotiatorA",
  extra: Partial<Parameters<typeof startInstruction>[0]> = {},
) {
  const result = await startInstruction({
    ...as(by),
    enquiryId: ids.leadA,
    leadMembershipId: memberships.negotiatorA,
    appraisalId: ids.appraisalA,
    parties: [{ contactId: ids.personA, isMain: true }],
    terms: TERMS,
    ...extra,
  });
  if (!result.ok) throw new Error(`Start failed: ${result.error}`);
  return result.instructionId;
}

const PDF = new TextEncoder().encode(
  "%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n",
);
const files = createMemoryDocumentStore();

/** Uploads an agreement PDF, which becomes the draft agreement (C2). */
async function uploadAgreement(id: string, by: UserName = "negotiatorA") {
  const result = await uploadDocument({
    actor: as(by),
    target: { kind: "instruction_agreement", instructionId: id },
    originalName: "Signed terms.pdf",
    bytes: PDF,
    store: files.store,
    attach: attachAgreementDraft(id),
  });
  if (!result.ok) throw new Error(`Upload failed: ${result.error}`);
  return result.document.id;
}

/** Uploads and completes a signed agreement for the current terms. */
async function signAgreement(id: string, by: UserName = "negotiatorA") {
  const documentId = await uploadAgreement(id, by);
  await expect(
    completeInstructionAgreement({
      ...as(by),
      instructionId: id,
      documentId,
      signaturesConfirmed: true,
      signedOn: ukToday(),
    }),
  ).resolves.toMatchObject({ ok: true });
  return documentId;
}

/** Signed agreement and verified ownership, so the checklist is complete. */
async function completeEvidence(id: string, by: UserName = "negotiatorA") {
  await signAgreement(id, by);
  await expect(
    recordInstructionOwnershipCheck({
      ...as(by),
      instructionId: id,
      status: "verified",
      checkedOn: ukToday(),
      method: "Land Registry title checked",
    }),
  ).resolves.toMatchObject({ ok: true });
}

describe("starting an instruction", () => {
  it("shows the review pre-filled from the lead, and writes nothing", async () => {
    const review = await getStartInstructionReview({
      ...as("negotiatorA"),
      enquiryId: ids.leadA,
    });
    expect(review).toMatchObject({
      enquiry: { reference: "ENQ-JAAA2222", stage: "appraisal_completed" },
      property: { reference: "PRP-JAAA2222" },
      branch: { name: "Branch A" },
      landlord: { name: "Olivia Landlord" },
      owners: [{ name: "Olivia Landlord", isLead: true }],
      leadStaff: { membershipId: memberships.negotiatorA },
      appraisalId: ids.appraisalA,
      suggestedTerms: {
        service: "fully_managed",
        askingRentPence: 185000,
        rentPeriod: "month",
        feeKind: "percentage",
        feeValue: 1200,
        feeVat: "exclusive",
      },
      existingInstruction: null,
      blocker: null,
    });
    expect(await count(`SELECT count(*) AS n FROM "instructions"`)).toBe(0);
    // Not for a lead that has not completed its appraisal.
    expect(
      await getStartInstructionReview({
        ...as("negotiatorA"),
        enquiryId: ids.leadNew,
      }),
    ).toBeNull();
  });

  it("wins the lead, closes its work, and creates the instruction with landlords and terms in one go", async () => {
    const id = await start();
    expect(
      await count(
        `SELECT count(*) AS n FROM "landlord_enquiries"
         WHERE "id" = $1::uuid AND "stage" = 'won'`,
        [ids.leadA],
      ),
    ).toBe(1);
    expect(
      await count(
        `SELECT count(*) AS n FROM "enquiry_tasks"
         WHERE "enquiry_id" = $1::uuid AND "status" = 'open'`,
        [ids.leadA],
      ),
    ).toBe(0);
    const record = await getInstruction({
      ...as("negotiatorA"),
      instructionId: id,
    });
    expect(record).toMatchObject({
      reference: expect.stringMatching(/^INS-/),
      journeyStage: "onboarding",
      current: true,
      property: { reference: "PRP-JAAA2222" },
      enquiry: { reference: "ENQ-JAAA2222" },
      branch: { name: "Branch A" },
      leadStaff: { name: "negotiatorA" },
      parties: [{ contact: { name: "Olivia Landlord" }, isMainContact: true }],
      terms: {
        service: "fully_managed",
        askingRentPence: 185000,
        rentPeriod: "month",
        feeKind: "percentage",
        feeValue: 1200,
        feeVat: "exclusive",
        depositOffering: "standard",
        depositPence: 213462,
        changeReason: null,
      },
      agreement: { status: null },
      ownershipCheck: { status: null },
      checklistComplete: false,
      can: { manage: true, approveExceptions: false },
    });
    expect(
      await findInstructionForEnquiry({
        ...as("negotiatorA"),
        enquiryId: ids.leadA,
      }),
    ).toMatchObject({
      id,
      current: true,
    });
    expect(
      await count(
        `SELECT count(*) AS n FROM "audit_events" WHERE "action" = 'instruction.start' AND "outcome" = 'succeeded'`,
      ),
    ).toBe(1);
  });

  it("can start with incomplete terms, shown as an incomplete checklist", async () => {
    const id = await start("negotiatorA", {
      terms: INCOMPLETE_TERMS,
      leadMembershipId: null,
    });
    const record = await getInstruction({
      ...as("negotiatorA"),
      instructionId: id,
    });
    expect(
      record?.checklist
        .filter((item) => !item.met)
        .map((item) => item.code)
        .sort(),
    ).toEqual(
      [
        "agreement",
        "asking_rent",
        "deposit",
        "fee",
        "lead_staff",
        "ownership_check",
      ].sort(),
    );
  });

  it("is refused for the wrong people, the wrong lead, bad input, and a second instruction", async () => {
    const attempt = (by: UserName, extra: Record<string, unknown> = {}) =>
      startInstruction({
        ...as(by),
        enquiryId: ids.leadA,
        parties: [{ contactId: ids.personA, isMain: true }],
        terms: TERMS,
        ...extra,
      });
    for (const by of ["accountsA", "readOnlyA"] as const) {
      await expect(attempt(by)).resolves.toEqual({
        ok: false,
        error: "access_denied",
      });
    }
    await expect(attempt("negotiatorB")).resolves.toEqual({
      ok: false,
      error: "enquiry_not_found",
    });
    await expect(attempt("otherOwner")).resolves.toEqual({
      ok: false,
      error: "enquiry_not_found",
    });
    await expect(
      attempt("negotiatorA", { enquiryId: ids.leadNew }),
    ).resolves.toEqual({
      ok: false,
      error: "invalid_state",
    });
    for (const bad of [
      { parties: [] },
      { parties: [{ contactId: ids.personA, isMain: false }] },
      {
        parties: [
          { contactId: ids.personA, isMain: true },
          { contactId: ids.personB, isMain: true },
        ],
      },
      {
        parties: [
          { contactId: ids.personA, isMain: true },
          { contactId: ids.personA, isMain: false },
        ],
      },
      { parties: [{ contactId: "nope", isMain: true }] },
      { terms: { ...TERMS, service: "" } },
      { instructedOn: "2999-01-01" },
      { leadMembershipId: "nope" },
    ]) {
      await expect(attempt("negotiatorA", bad)).resolves.toEqual({
        ok: false,
        error: "invalid_input",
      });
    }
    await expect(
      attempt("negotiatorA", {
        parties: [{ contactId: ids.archived, isMain: true }],
      }),
    ).resolves.toEqual({ ok: false, error: "contact_not_found" });
    // A lead staff member from another branch, a view-only role, or a stranger.
    for (const lead of [
      memberships.negotiatorB,
      memberships.readOnlyA,
      memberships.accountsA,
    ]) {
      await expect(
        attempt("negotiatorA", { leadMembershipId: lead }),
      ).resolves.toEqual({
        ok: false,
        error: "invalid_input",
      });
    }
    // Nothing was saved by any refusal.
    expect(await count(`SELECT count(*) AS n FROM "instructions"`)).toBe(0);
    expect(
      await count(
        `SELECT count(*) AS n FROM "landlord_enquiries" WHERE "stage" = 'won'`,
      ),
    ).toBe(0);

    const first = await start();
    await expect(
      attempt("negotiatorA", {
        enquiryId: ids.leadA2,
        parties: [{ contactId: ids.personB, isMain: true }],
      }),
    ).resolves.toEqual({ ok: false, error: "instruction_exists" });
    const review = await getStartInstructionReview({
      ...as("negotiatorA"),
      enquiryId: ids.leadA2,
    });
    expect(review?.existingInstruction).toMatchObject({ id: first });
    await expect(attempt("negotiatorA")).resolves.toMatchObject({ ok: false });
  });

  it("rolls everything back if any part fails", async () => {
    await expect(
      startInstruction({
        ...as("negotiatorA"),
        enquiryId: ids.leadA,
        parties: [{ contactId: ids.personA, isMain: true }],
        terms: TERMS,
        appraisalId: randomUUID(),
      }),
    ).resolves.toEqual({ ok: false, error: "appraisal_not_found" });
    expect(await count(`SELECT count(*) AS n FROM "instructions"`)).toBe(0);
    expect(
      await count(
        `SELECT count(*) AS n FROM "landlord_enquiries" WHERE "stage" = 'won'`,
      ),
    ).toBe(0);
    expect(
      await count(
        `SELECT count(*) AS n FROM "enquiry_tasks" WHERE "status" = 'open'`,
      ),
    ).toBe(1);
  });

  it("shows nothing about another branch's or agency's instructions", async () => {
    const id = await start();
    for (const by of ["negotiatorB", "otherOwner"] as const) {
      expect(await getInstruction({ ...as(by), instructionId: id })).toBeNull();
      expect(
        await listInstructionsForProperty({
          ...as(by),
          propertyId: ids.propertyA,
        }),
      ).toEqual([]);
      expect(
        await findInstructionForEnquiry({ ...as(by), enquiryId: ids.leadA }),
      ).toBeNull();
    }
    // Every role in the branch can see it, but only some can change it.
    for (const [by, manage] of [
      ["owner", true],
      ["managerA", true],
      ["propertyManagerA", true],
      ["accountsA", false],
      ["readOnlyA", false],
    ] as const) {
      const record = await getInstruction({ ...as(by), instructionId: id });
      expect(record?.can.manage, by).toBe(manage);
    }
    expect(
      (await getInstruction({ ...as("managerA"), instructionId: id }))?.can
        .approveExceptions,
    ).toBe(true);
    expect(
      (await getInstruction({ ...as("propertyManagerA"), instructionId: id }))
        ?.can.approveExceptions,
    ).toBe(false);
  });
});

describe("listing instructions", () => {
  it("finds visible instructions by their connected records and applies worklist filters", async () => {
    const id = await start();
    const record = await getInstruction({
      ...as("negotiatorA"),
      instructionId: id,
    });
    expect(record).not.toBeNull();

    for (const query of [
      record!.reference,
      "PRP-JAAA2222",
      "Test Street",
      "SW1A 1AA",
      "Olivia",
      "PER-JA111111",
    ]) {
      const result = await listInstructions({
        ...as("negotiatorA"),
        query,
      });
      expect(
        result.items.map((item) => item.id),
        query,
      ).toEqual([id]);
    }

    await expect(
      listInstructions({
        ...as("negotiatorA"),
        branchId: ids.branchA,
        assignedMembershipId: memberships.negotiatorA,
        journeyStage: "onboarding",
      }),
    ).resolves.toMatchObject({
      page: 1,
      hasPrevious: false,
      hasNext: false,
      items: [
        {
          id,
          mainLandlord: "Olivia Landlord",
          service: "fully_managed",
          branch: { id: ids.branchA },
          leadStaff: { membershipId: memberships.negotiatorA },
        },
      ],
    });
    expect(
      (await listInstructions({ ...as("negotiatorA"), page: 2 })).items,
    ).toEqual([]);
  });

  it("needs every typed name word to match the same landlord", async () => {
    const id = await start();
    const found = await listInstructions({
      ...as("negotiatorA"),
      query: "Olivia Landlord",
    });
    expect(found.items.map((item) => item.id)).toEqual([id]);
    const wrongSurname = await listInstructions({
      ...as("negotiatorA"),
      query: "Olivia Nobody",
    });
    expect(wrongSurname.items).toEqual([]);
  });

  it("keeps other branches and agencies hidden and separates current from ended work", async () => {
    const id = await start();
    for (const by of ["negotiatorB", "otherOwner"] as const) {
      expect((await listInstructions(as(by))).items).toEqual([]);
    }
    expect((await listInstructions(as("readOnlyA"))).items[0]?.id).toBe(id);

    await expect(
      endInstruction({
        ...as("negotiatorA"),
        instructionId: id,
        reason: "Owner withdrew",
      }),
    ).resolves.toMatchObject({ ok: true });
    expect((await listInstructions(as("negotiatorA"))).items).toEqual([]);
    expect(
      (
        await listInstructions({
          ...as("negotiatorA"),
          state: "ended",
        })
      ).items,
    ).toMatchObject([{ id, current: false, journeyStage: "withdrawn" }]);
    expect(
      (await listInstructions({ ...as("negotiatorA"), state: "all" })).items,
    ).toHaveLength(1);
  });
});

describe("listing properties with their current instruction", () => {
  it("summarises the current instruction and filters by it", async () => {
    const mine = { ...as("negotiatorA"), query: "PRP-JAAA2222" };
    const before = await listPropertyPage(mine);
    expect(before?.items).toMatchObject([{ instruction: null }]);
    await expect(
      listPropertyPage({ ...mine, instruction: "none" }),
    ).resolves.toMatchObject({ items: [{ addressLine: expect.any(String) }] });
    await expect(
      listPropertyPage({ ...mine, instruction: "onboarding" }),
    ).resolves.toMatchObject({ items: [] });

    const id = await start();
    await expect(listPropertyPage(mine)).resolves.toMatchObject({
      hasNext: false,
      items: [
        {
          instruction: {
            id,
            journeyStage: "onboarding",
            service: "fully_managed",
            leadStaff: expect.any(String),
          },
        },
      ],
    });
    await expect(
      listPropertyPage({
        ...as("negotiatorA"),
        instruction: "onboarding",
        assignedMembershipId: memberships.negotiatorA,
      }),
    ).resolves.toMatchObject({ items: [{ instruction: { id } }] });
    for (const instruction of ["ready_to_market", "none"] as const) {
      await expect(
        listPropertyPage({ ...mine, instruction }),
      ).resolves.toMatchObject({ items: [] });
    }
    await expect(listPropertyPage({ ...mine, page: 2 })).resolves.toMatchObject(
      { items: [], hasPrevious: true },
    );
    await expect(
      listPropertyPage({ ...mine, state: "archived" }),
    ).resolves.toMatchObject({ items: [] });
  });

  it("hides other branches and agencies and drops ended instructions", async () => {
    const id = await start();
    const mine = { ...as("negotiatorA"), query: "PRP-JAAA2222" };
    for (const by of ["negotiatorB", "otherOwner"] as const) {
      await expect(
        listPropertyPage({ ...as(by), query: "PRP-JAAA2222" }),
      ).resolves.toMatchObject({ items: [] });
    }
    await expect(
      endInstruction({
        ...as("negotiatorA"),
        instructionId: id,
        reason: "Owner withdrew",
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(listPropertyPage(mine)).resolves.toMatchObject({
      items: [{ instruction: null }],
    });
  });
});

describe("workspace search", () => {
  it("groups visible matches and ignores very short searches", async () => {
    const id = await start();
    const search = (by: UserName, query: string) =>
      searchWorkspace({ ...as(by), query });
    const kinds = async (by: UserName, query: string) =>
      (await search(by, query)).groups.map(({ kind }) => kind);

    expect(await kinds("negotiatorA", "a")).toEqual([]);
    const byReference = await search("negotiatorA", "PRP-JAAA2222");
    expect(byReference.groups.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining(["properties", "instructions"]),
    );
    expect(
      byReference.groups.find(({ kind }) => kind === "instructions")?.items,
    ).toMatchObject([{ id }]);
    expect(await kinds("negotiatorA", "Olivia")).toEqual(
      expect.arrayContaining(["contacts", "instructions"]),
    );
    for (const by of ["negotiatorB", "otherOwner"] as const) {
      expect(await kinds(by, "PRP-JAAA2222"), by).toEqual([]);
      // A lead in their own branch may match; nothing of branch A may.
      expect(await kinds(by, "Olivia"), by).not.toEqual(
        expect.arrayContaining(["contacts"]),
      );
      expect(await kinds(by, "Olivia"), by).not.toEqual(
        expect.arrayContaining(["instructions"]),
      );
    }
  });
});

describe("instruction onboarding attention", () => {
  const days = (count: number) => new Date(Date.now() + count * 86_400_000);

  it("counts current instructions and flags onboarding that has gone quiet for 7 days", async () => {
    const id = await start();
    await expect(
      getInstructionAttention(as("negotiatorA")),
    ).resolves.toMatchObject({
      onboarding: 1,
      readyToMarket: 0,
      stalled: { count: 0, items: [] },
    });
    await expect(
      getInstructionAttention({ ...as("negotiatorA"), now: days(6) }),
    ).resolves.toMatchObject({ stalled: { count: 0 } });
    const quiet = await getInstructionAttention({
      ...as("negotiatorA"),
      now: days(8),
    });
    expect(quiet?.stalled).toMatchObject({
      count: 1,
      items: [{ id, property: expect.stringContaining("Test Street") }],
    });
  });

  it("shows nothing about other branches, agencies or ended instructions", async () => {
    const id = await start();
    for (const by of ["negotiatorB", "otherOwner"] as const) {
      await expect(
        getInstructionAttention({ ...as(by), now: days(8) }),
      ).resolves.toMatchObject({
        onboarding: 0,
        readyToMarket: 0,
        stalled: { count: 0, items: [] },
      });
    }
    await expect(
      endInstruction({
        ...as("negotiatorA"),
        instructionId: id,
        reason: "Owner withdrew",
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      getInstructionAttention({ ...as("negotiatorA"), now: days(8) }),
    ).resolves.toMatchObject({ onboarding: 0, stalled: { count: 0 } });
  });
});

describe("listing landlords", () => {
  it("shows only visible relationship counts when one landlord is shared by two branches", async () => {
    await adminPool.query(
      `INSERT INTO "contact_branch_links" ("workspace_id", "contact_id",
        "branch_id", "is_primary", "created_by_membership_id", "updated_at")
       VALUES ($1::uuid, $2::uuid, $3::uuid, false, $4::uuid, CURRENT_TIMESTAMP)`,
      [ids.workspace, ids.personA, ids.branchB, memberships.owner],
    );
    await adminPool.query(
      `INSERT INTO "contact_points" ("workspace_id", "contact_id", "kind",
        "value", "normalized_value", "is_preferred", "updated_at")
       VALUES ($1::uuid, $2::uuid, 'email', 'olivia@example.test',
        'olivia@example.test', true, CURRENT_TIMESTAMP)`,
      [ids.workspace, ids.personA],
    );
    const instructionA = await start();
    const second = await startInstruction({
      ...as("owner"),
      enquiryId: ids.leadB,
      leadMembershipId: memberships.negotiatorB,
      appraisalId: null,
      parties: [{ contactId: ids.personA, isMain: true }],
      terms: TERMS,
    });
    if (!second.ok) {
      throw new Error(`Second start failed: ${second.error}`);
    }

    expect(instructionA).toBeTruthy();
    expect(second.instructionId).toBeTruthy();
    for (const [by, branchId] of [
      ["negotiatorA", ids.branchA],
      ["negotiatorB", ids.branchB],
    ] as const) {
      const result = await listLandlords({
        ...as(by),
        query: "olivia@example.test",
        branchId,
        kind: "person",
      });
      expect(result.items, by).toMatchObject([
        {
          id: ids.personA,
          name: "Olivia Landlord",
          preferredContact: {
            kind: "email",
            value: "olivia@example.test",
          },
          propertiesWithUs: 1,
          openLeads: 0,
          currentInstructions: 1,
          currentRelationship: true,
        },
      ]);
      expect(
        result.items[0]?.branches.map(({ id }) => id),
        by,
      ).toEqual([branchId]);
      await expect(
        getPropertiesWithUsCount({ ...as(by), contactId: ids.personA }),
      ).resolves.toBe(1);
      expect(result.items[0]?.currentInstructions, by).toBe(1);
      const history = await getContactLandlordHistory({
        ...as(by),
        contactId: ids.personA,
      });
      expect(history?.instructions?.items, by).toMatchObject([
        {
          id: by === "negotiatorA" ? instructionA : second.instructionId,
          current: true,
          currentParty: true,
        },
      ]);
      expect(
        history?.leads?.items.map(({ id }) => id),
        by,
      ).toEqual(by === "negotiatorA" ? [ids.leadA] : []);
    }

    const owner = await listLandlords({
      ...as("owner"),
      query: "PER-JA111111",
    });
    expect(owner.items).toMatchObject([
      {
        id: ids.personA,
        propertiesWithUs: 2,
        currentInstructions: 2,
      },
    ]);
    expect(owner.items[0]?.branches.map(({ id }) => id).sort()).toEqual(
      [ids.branchA, ids.branchB].sort(),
    );
    await expect(
      getPropertiesWithUsCount({ ...as("owner"), contactId: ids.personA }),
    ).resolves.toBe(2);
    const ownerHistory = await getContactLandlordHistory({
      ...as("owner"),
      contactId: ids.personA,
    });
    expect(ownerHistory?.instructions?.items).toHaveLength(2);
    expect(ownerHistory?.leads?.items.map(({ id }) => id)).toEqual([ids.leadA]);
    expect((await listLandlords(as("otherOwner"))).items).toEqual([]);
    await expect(
      getContactLandlordHistory({
        ...as("otherOwner"),
        contactId: ids.personA,
      }),
    ).resolves.toBeNull();
  });

  it("keeps open leads current and closed leads available as former history", async () => {
    const current = await listLandlords({
      ...as("negotiatorA"),
      query: "Peter",
    });
    expect(current.items).toMatchObject([
      {
        id: ids.personB,
        openLeads: 1,
        currentInstructions: 0,
        propertiesWithUs: 0,
        currentRelationship: true,
      },
    ]);

    await expect(
      closeEnquiry({
        ...as("negotiatorA"),
        enquiryId: ids.leadA2,
        outcome: "lost",
        outcomeReasonId: ids.lostReason,
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(
      (
        await listLandlords({
          ...as("negotiatorA"),
          query: "Peter",
        })
      ).items,
    ).toEqual([]);
    expect(
      (
        await listLandlords({
          ...as("negotiatorA"),
          query: "Peter",
          relationship: "former",
        })
      ).items,
    ).toMatchObject([
      { id: ids.personB, openLeads: 0, currentRelationship: false },
    ]);
  });

  it("pages a contact's landlord lead history", async () => {
    const client = await adminPool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT set_config('app.workspace_id', $1, true), set_config('app.membership_id', $2, true), set_config('app.membership_scope_mode', 'workspace', true)",
        [ids.workspace, memberships.negotiatorA],
      );
      for (let index = 0; index < 5; index += 1) {
        await client.query(
          `INSERT INTO "landlord_enquiries" ("id", "workspace_id", "reference",
            "responsible_branch_id", "stage", "enquirer_name", "postcode",
            "contact_id", "property_id", "lead_membership_id",
            "created_by_membership_id", "updated_at")
           VALUES ($1::uuid, $2::uuid, $3, $4::uuid, 'new_enquiry',
             'Peter Owner', 'SW1A 1AA', $5::uuid, $6::uuid, $7::uuid,
             $7::uuid, CURRENT_TIMESTAMP)`,
          [
            randomUUID(),
            ids.workspace,
            `ENQ-PAGETES${String.fromCharCode(65 + index)}`,
            ids.branchA,
            ids.personB,
            ids.propertyA,
            memberships.negotiatorA,
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

    const first = await getContactLandlordHistory({
      ...as("negotiatorA"),
      contactId: ids.personB,
    });
    expect(first?.leads).toMatchObject({
      page: 1,
      hasPrevious: false,
      hasNext: true,
    });
    expect(first?.leads?.items).toHaveLength(5);

    const second = await getContactLandlordHistory({
      ...as("negotiatorA"),
      contactId: ids.personB,
      leadPage: 2,
    });
    expect(second?.leads).toMatchObject({
      page: 2,
      hasPrevious: true,
      hasNext: false,
    });
    expect(second?.leads?.items).toHaveLength(1);
  });

  it("finds contacts by full name for the add landlord picker", async () => {
    const found = await listContacts({
      ...as("negotiatorA"),
      query: "olivia landlord",
      limit: 20,
    });
    expect(found?.map(({ id }) => id)).toEqual([ids.personA]);
    const archived = await listContacts({
      ...as("negotiatorA"),
      query: "Old Landlord",
      limit: 20,
    });
    expect(archived).toEqual([]);
    await expect(
      listContacts({ ...as("otherOwner"), query: "Olivia Landlord" }),
    ).resolves.toEqual([]);
    const landlords = await listLandlords({
      ...as("owner"),
      query: "Olivia Landlord",
    });
    expect(landlords?.items.map(({ id }) => id)).toEqual([ids.personA]);
  });

  it("pages a property's landlord lead history within branch access", async () => {
    const client = await adminPool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT set_config('app.workspace_id', $1, true), set_config('app.membership_id', $2, true), set_config('app.membership_scope_mode', 'workspace', true)",
        [ids.workspace, memberships.negotiatorA],
      );
      for (let index = 0; index < 5; index += 1) {
        await client.query(
          `INSERT INTO "landlord_enquiries" ("id", "workspace_id", "reference",
            "responsible_branch_id", "stage", "enquirer_name", "postcode",
            "contact_id", "property_id", "lead_membership_id",
            "created_by_membership_id", "updated_at")
           VALUES ($1::uuid, $2::uuid, $3, $4::uuid, 'new_enquiry',
             'Peter Owner', 'SW1A 1AA', $5::uuid, $6::uuid, $7::uuid,
             $7::uuid, CURRENT_TIMESTAMP)`,
          [
            randomUUID(),
            ids.workspace,
            `ENQ-PAGEPRP${String.fromCharCode(65 + index)}`,
            ids.branchA,
            ids.personB,
            ids.propertyA,
            memberships.negotiatorA,
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

    const input = { ...as("negotiatorA"), propertyId: ids.propertyA };
    const first = await getPropertyLeadHistory(input);
    expect(first).toMatchObject({
      page: 1,
      hasPrevious: false,
      hasNext: true,
    });
    expect(first?.items).toHaveLength(5);
    const second = await getPropertyLeadHistory({ ...input, page: 2 });
    expect(second).toMatchObject({
      page: 2,
      hasPrevious: true,
      hasNext: false,
    });
    expect(second?.items.length).toBeGreaterThan(0);

    for (const by of ["negotiatorB", "otherOwner"] as const) {
      const hidden = await getPropertyLeadHistory({
        ...as(by),
        propertyId: ids.propertyA,
      });
      // The property itself is hidden, so there is no history to page.
      expect(hidden, by).toBeNull();
    }
    await expect(
      getPropertyLeadHistory({ ...input, propertyId: "not-a-uuid" }),
    ).resolves.toBeNull();
  });
});

describe("changing an instruction", () => {
  it("refuses changes from people who may not make them", async () => {
    const id = await start();
    for (const by of [
      "accountsA",
      "readOnlyA",
      "negotiatorB",
      "otherOwner",
    ] as const) {
      const base = { ...as(by), instructionId: id };
      const results = await Promise.all([
        replaceInstructionTerms({ ...base, terms: TERMS, reason: "Changed" }),
        setInstructionLeadStaff({
          ...base,
          membershipId: memberships.negotiatorA2,
        }),
        addInstructionParty({ ...base, contactId: ids.personB }),
        recordInstructionAgreement({ ...base, status: "sent" }),
        recordInstructionOwnershipCheck({ ...base, status: "in_progress" }),
        approveInstructionException({
          ...base,
          kind: "agreement",
          reason: "Away",
        }),
        markInstructionReadyToMarket(base),
        endInstruction({ ...base, reason: "Gone" }),
      ]);
      for (const result of results) {
        expect(result.ok, by).toBe(false);
      }
    }
    expect(
      await count(`SELECT count(*) AS n FROM "instruction_terms_versions"`),
    ).toBe(1);
  });

  it("replaces whole terms, keeping every version and needing a reason", async () => {
    const id = await start();
    const base = { ...as("negotiatorA"), instructionId: id };
    await expect(
      replaceInstructionTerms({ ...base, terms: TERMS, reason: "No change" }),
    ).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
    await expect(
      replaceInstructionTerms({
        ...base,
        terms: { ...TERMS, askingRent: "1900" },
        reason: " ",
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    await expect(
      replaceInstructionTerms({
        ...base,
        terms: {
          ...TERMS,
          service: "let_only",
          askingRent: "1900",
          charges: [
            { name: "Setup fee", amount: "250", vat: "none" },
            { name: "Inventory", amount: "120", vat: "exclusive" },
          ],
        },
        reason: "Landlord asked for less service",
      }),
    ).resolves.toMatchObject({ ok: true });
    const record = await getInstruction({ ...base });
    expect(record?.terms).toMatchObject({
      service: "let_only",
      askingRentPence: 190000,
      changeReason: "Landlord asked for less service",
      charges: [
        { name: "Inventory", amountPence: 12000, vat: "exclusive" },
        { name: "Setup fee", amountPence: 25000, vat: "none" },
      ],
    });
    expect(record?.termsHistory).toHaveLength(2);
    expect(record?.termsHistory[1]).toMatchObject({
      service: "fully_managed",
      askingRentPence: 185000,
      changeReason: null,
      charges: [],
    });
    // The same terms again, in another order, is no change.
    await expect(
      replaceInstructionTerms({
        ...base,
        terms: {
          ...TERMS,
          service: "let_only",
          askingRent: "1900",
          charges: [
            { name: "Inventory", amount: "120", vat: "exclusive" },
            { name: "Setup fee", amount: "250", vat: "none" },
          ],
        },
        reason: "Again",
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
  });

  it("manages landlords: add, change the main contact, remove with a reason", async () => {
    const id = await start();
    const base = { ...as("negotiatorA"), instructionId: id };
    await expect(
      addInstructionParty({ ...base, contactId: ids.archived }),
    ).resolves.toEqual({
      ok: false,
      error: "contact_not_found",
    });
    await expect(
      addInstructionParty({ ...base, contactId: ids.personA }),
    ).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
    await expect(
      addInstructionParty({ ...base, contactId: ids.personB }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      addInstructionParty({ ...base, contactId: ids.personC, makeMain: true }),
    ).resolves.toMatchObject({
      ok: true,
    });
    let record = await getInstruction(base);
    expect(
      record?.parties.map((party) => [party.contact.name, party.isMainContact]),
    ).toEqual([
      ["Quinn Landlord", true],
      ["Olivia Landlord", false],
      ["Peter Landlord", false],
    ]);
    const olivia = record!.parties.find(
      (party) => party.contact.id === ids.personA,
    )!;
    const quinn = record!.parties.find((party) => party.isMainContact)!;
    await expect(
      changeInstructionMainContact({ ...base, partyId: quinn.id }),
    ).resolves.toEqual({
      ok: false,
      error: "party_not_found",
    });
    await expect(
      changeInstructionMainContact({ ...base, partyId: olivia.id }),
    ).resolves.toMatchObject({ ok: true });
    // The main contact needs a successor to be removed.
    await expect(
      removeInstructionParty({
        ...base,
        partyId: olivia.id,
        reason: "Sold her share",
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    await expect(
      removeInstructionParty({ ...base, partyId: quinn.id, reason: "" }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    await expect(
      removeInstructionParty({
        ...base,
        partyId: olivia.id,
        reason: "Sold her share",
        newMainPartyId: quinn.id,
      }),
    ).resolves.toMatchObject({ ok: true });
    record = await getInstruction(base);
    expect(
      record?.parties.map((party) => [party.contact.name, party.isMainContact]),
    ).toEqual([
      ["Quinn Landlord", true],
      ["Peter Landlord", false],
    ]);
    expect(record?.formerParties).toMatchObject([
      { contact: { name: "Olivia Landlord" }, removedReason: "Sold her share" },
    ]);
    // The last landlord cannot be removed.
    const peter = record!.parties.find((party) => !party.isMainContact)!;
    await removeInstructionParty({
      ...base,
      partyId: peter.id,
      reason: "Not an owner",
    });
    await expect(
      removeInstructionParty({
        ...base,
        partyId: quinn.id,
        reason: "Gone",
        newMainPartyId: quinn.id,
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
  });

  it("records Prepared and Sent with corrections needing a reason, but never Signed", async () => {
    const id = await start();
    const base = { ...as("negotiatorA"), instructionId: id };
    // Signed comes only from a completed agreement upload (C2).
    await expect(
      recordInstructionAgreement({ ...base, status: "signed" }),
    ).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
    await expect(
      recordInstructionAgreement({ ...base, status: "prepared" }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      recordInstructionAgreement({ ...base, status: "sent" }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      recordInstructionAgreement({ ...base, status: "sent" }),
    ).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
    await expect(
      recordInstructionAgreement({
        ...base,
        status: "prepared",
        reason: "Sent to the wrong address",
      }),
    ).resolves.toMatchObject({ ok: true });
    const record = await getInstruction(base);
    expect(record?.agreement.status).toBe("prepared");
    expect(record?.agreement.events.map((event) => event.status)).toEqual([
      "prepared",
      "sent",
      "prepared",
    ]);
  });

  it("records the ownership check; results need a date and method, and corrections a reason", async () => {
    const id = await start();
    const base = { ...as("negotiatorA"), instructionId: id };
    await expect(
      recordInstructionOwnershipCheck({ ...base, status: "verified" }),
    ).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
    await expect(
      recordInstructionOwnershipCheck({
        ...base,
        status: "not_verified",
        checkedOn: ukToday(),
        method: "Title register",
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    await expect(
      recordInstructionOwnershipCheck({ ...base, status: "in_progress" }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      recordInstructionOwnershipCheck({
        ...base,
        status: "verified",
        checkedOn: ukToday(),
        method: "Outside provider confirmed",
        notes: "Provider reference 123",
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      recordInstructionOwnershipCheck({ ...base, status: "in_progress" }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    const record = await getInstruction(base);
    expect(record?.ownershipCheck).toMatchObject({
      status: "verified",
      events: [
        {
          status: "verified",
          method: "Outside provider confirmed",
          notes: "Provider reference 123",
        },
        { status: "in_progress" },
      ],
    });
  });

  it("lets only managers approve an exception, once, and only for the ownership check", async () => {
    const id = await start();
    const base = {
      instructionId: id,
      kind: "ownership_check",
      reason: "Outside provider confirmed ownership",
    };
    // The signed agreement can no longer be excepted (C2).
    await expect(
      approveInstructionException({
        ...as("managerA"),
        ...base,
        kind: "agreement",
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    for (const by of [
      "negotiatorA",
      "propertyManagerA",
      "accountsA",
      "readOnlyA",
      "negotiatorB",
    ] as const) {
      expect(
        (await approveInstructionException({ ...as(by), ...base })).ok,
        by,
      ).toBe(false);
    }
    await expect(
      approveInstructionException({ ...as("managerA"), ...base, kind: "rent" }),
    ).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
    await expect(
      approveInstructionException({ ...as("managerA"), ...base, reason: " " }),
    ).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
    await expect(
      approveInstructionException({ ...as("managerA"), ...base }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      approveInstructionException({ ...as("owner"), ...base }),
    ).resolves.toEqual({
      ok: false,
      error: "invalid_state",
    });
    const record = await getInstruction({
      ...as("managerA"),
      instructionId: id,
    });
    expect(record?.exceptions).toMatchObject([
      { kind: "ownership_check", by: "managerA" },
    ]);
    expect(
      record?.checklist.find((item) => item.code === "ownership_check"),
    ).toMatchObject({ met: true, excepted: true });
  });
});

describe("Ready to market", () => {
  it("is refused until the checklist is complete, and says what is missing", async () => {
    const id = await start("negotiatorA", { terms: INCOMPLETE_TERMS });
    const base = { ...as("negotiatorA"), instructionId: id };
    await expect(markInstructionReadyToMarket(base)).resolves.toEqual({
      ok: false,
      error: "checklist_incomplete",
    });
    const denied = await adminPool.query(
      `SELECT "metadata" FROM "audit_events" WHERE "action" = 'instruction.ready' AND "outcome" = 'denied'`,
    );
    expect(denied.rows[0].metadata.missing).toEqual(
      expect.arrayContaining([
        "asking_rent",
        "fee",
        "deposit",
        "agreement",
        "ownership_check",
      ]),
    );
  });

  it("is marked deliberately, then kept only while the checklist holds, with a warning before it lapses", async () => {
    const id = await start();
    const base = { ...as("negotiatorA"), instructionId: id };
    await completeEvidence(id);
    expect((await getInstruction(base))?.checklistComplete).toBe(true);
    // Nothing moves on its own.
    expect((await getInstruction(base))?.journeyStage).toBe("onboarding");
    await expect(markInstructionReadyToMarket(base)).resolves.toMatchObject({
      ok: true,
    });
    await expect(markInstructionReadyToMarket(base)).resolves.toEqual({
      ok: false,
      error: "invalid_state",
    });
    expect((await getInstruction(base))?.journeyStage).toBe("ready_to_market");

    // A complete replacement keeps it ready.
    await expect(
      replaceInstructionTerms({
        ...base,
        terms: { ...TERMS, askingRent: "1900" },
        reason: "Rent raised",
      }),
    ).resolves.toMatchObject({ ok: true });
    expect((await getInstruction(base))?.journeyStage).toBe("ready_to_market");

    // A change that breaks the checklist warns first and saves nothing.
    const breaking = {
      ...base,
      terms: { ...TERMS, askingRent: "", rentPeriod: "" },
      reason: "Rent under review",
    };
    await expect(replaceInstructionTerms(breaking)).resolves.toEqual({
      ok: false,
      error: "readiness_would_lapse",
    });
    let record = await getInstruction(base);
    expect(record?.journeyStage).toBe("ready_to_market");
    expect(record?.termsHistory).toHaveLength(2);
    // Confirmed: the change and the return to Onboarding are saved together.
    await expect(
      replaceInstructionTerms({ ...breaking, confirmReturnToOnboarding: true }),
    ).resolves.toMatchObject({ ok: true });
    record = await getInstruction(base);
    expect(record).toMatchObject({
      journeyStage: "onboarding",
      checklistComplete: false,
    });
    expect(record?.termsHistory).toHaveLength(3);
    expect(record?.journeyHistory[0]).toMatchObject({
      from: "ready_to_market",
      to: "onboarding",
      reason: "Terms changed: Rent under review",
    });
    // Corrected, then deliberately marked ready again.
    await replaceInstructionTerms({
      ...base,
      terms: TERMS,
      reason: "Rent agreed",
    });
    await expect(markInstructionReadyToMarket(base)).resolves.toMatchObject({
      ok: true,
    });
  });

  it("warns the same way for the lead staff member, agreement and ownership check", async () => {
    const id = await start();
    const base = { ...as("negotiatorA"), instructionId: id };
    await completeEvidence(id);
    await markInstructionReadyToMarket(base);
    await expect(
      setInstructionLeadStaff({ ...base, membershipId: null }),
    ).resolves.toEqual({
      ok: false,
      error: "readiness_would_lapse",
    });
    // A fee change is not covered by the signed agreement (C2).
    await expect(
      replaceInstructionTerms({
        ...base,
        terms: { ...TERMS, feeValue: "15" },
        reason: "Fee renegotiated",
      }),
    ).resolves.toEqual({ ok: false, error: "readiness_would_lapse" });
    // Prepared and Sent no longer affect the checklist.
    await expect(
      recordInstructionAgreement({ ...base, status: "prepared" }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      recordInstructionOwnershipCheck({
        ...base,
        status: "in_progress",
        reason: "Re-checking",
      }),
    ).resolves.toEqual({ ok: false, error: "readiness_would_lapse" });
    expect((await getInstruction(base))?.journeyStage).toBe("ready_to_market");
    await expect(
      setInstructionLeadStaff({
        ...base,
        membershipId: memberships.negotiatorA2,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      setInstructionLeadStaff({
        ...base,
        membershipId: memberships.negotiatorB,
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    await expect(
      setInstructionLeadStaff({
        ...base,
        membershipId: null,
        confirmReturnToOnboarding: true,
      }),
    ).resolves.toMatchObject({ ok: true });
    expect((await getInstruction(base))?.journeyStage).toBe("onboarding");
  });

  it("accepts a manager's exception for the ownership check, but never for the agreement or anything else", async () => {
    const id = await start("negotiatorA", { leadMembershipId: null });
    const base = { ...as("negotiatorA"), instructionId: id };
    await approveInstructionException({
      ...as("managerA"),
      instructionId: id,
      kind: "ownership_check",
      reason: "Provider checked",
    });
    await setInstructionLeadStaff({
      ...base,
      membershipId: memberships.negotiatorA,
    });
    // Still no signed agreement, which can never be bypassed.
    await expect(markInstructionReadyToMarket(base)).resolves.toEqual({
      ok: false,
      error: "checklist_incomplete",
    });
    await signAgreement(id);
    await expect(markInstructionReadyToMarket(base)).resolves.toMatchObject({
      ok: true,
    });
  });

  it("can be sent back to Onboarding with a reason", async () => {
    const id = await start();
    const base = { ...as("negotiatorA"), instructionId: id };
    await completeEvidence(id);
    await markInstructionReadyToMarket(base);
    await expect(
      returnInstructionToOnboarding({ ...base, reason: "" }),
    ).resolves.toEqual({
      ok: false,
      error: "invalid_state",
    });
    await expect(
      returnInstructionToOnboarding({
        ...base,
        reason: "Landlord wants to wait",
      }),
    ).resolves.toMatchObject({ ok: true });
    expect((await getInstruction(base))?.journeyStage).toBe("onboarding");
  });
});

describe("signed agreements", () => {
  it("turns an uploaded PDF into a draft listing the landlords who must sign, then completes it", async () => {
    const id = await start();
    const base = { ...as("negotiatorA"), instructionId: id };
    const documentId = await uploadAgreement(id);
    let record = await getInstruction(base);
    expect(record?.agreement).toMatchObject({
      evidence: "none",
      agreements: [
        {
          state: "draft",
          document: { id: documentId, displayName: "Signed terms.pdf" },
          signatories: [{ id: ids.personA }],
        },
      ],
    });
    expect(record?.agreement.draftId).toBe(record?.agreement.agreements[0].id);
    const complete = { ...base, documentId, signedOn: ukToday() };
    // Every signature must be confirmed, with a real date not in the future.
    await expect(
      completeInstructionAgreement({ ...complete, signaturesConfirmed: false }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    await expect(
      completeInstructionAgreement({
        ...complete,
        signaturesConfirmed: true,
        signedOn: "2999-01-01",
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    await expect(
      completeInstructionAgreement({ ...complete, signaturesConfirmed: true }),
    ).resolves.toMatchObject({ ok: true });
    record = await getInstruction(base);
    expect(record?.agreement).toMatchObject({
      evidence: "current",
      signedOn: ukToday(),
      draftId: null,
      agreements: [{ state: "completed", completedBy: "negotiatorA" }],
    });
    expect(
      record?.checklist.find((item) => item.code === "agreement")?.met,
    ).toBe(true);
  });

  it("refuses Accounts and Read Only, and a draft whose fees changed since upload", async () => {
    const id = await start();
    const base = { ...as("negotiatorA"), instructionId: id };
    const documentId = await uploadAgreement(id);
    const complete = {
      instructionId: id,
      documentId,
      signaturesConfirmed: true,
      signedOn: ukToday(),
    };
    for (const by of ["accountsA", "readOnlyA"] as const) {
      await expect(
        completeInstructionAgreement({ ...as(by), ...complete }),
      ).resolves.toEqual({ ok: false, error: "access_denied" });
    }
    await replaceInstructionTerms({
      ...base,
      terms: { ...TERMS, feeValue: "15" },
      reason: "Fee renegotiated",
    });
    await expect(
      completeInstructionAgreement({ ...base, ...complete }),
    ).resolves.toEqual({ ok: false, error: "agreement_outdated" });
  });

  it("discards a draft and its file with a reason, but never a completed agreement", async () => {
    const id = await start();
    const base = { ...as("negotiatorA"), instructionId: id };
    const draftFile = await uploadAgreement(id);
    expect(files.objects.size).toBeGreaterThan(0);
    const before = files.objects.size;
    await expect(
      discardInstructionAgreementDraft({
        ...base,
        documentId: draftFile,
        reason: " ",
        store: files.store,
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    await expect(
      discardInstructionAgreementDraft({
        ...base,
        documentId: draftFile,
        reason: "Uploaded the wrong file",
        store: files.store,
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(files.objects.size).toBe(before - 1);
    const signedFile = await signAgreement(id);
    await expect(
      discardInstructionAgreementDraft({
        ...base,
        documentId: signedFile,
        reason: "Wrong file",
        store: files.store,
      }),
    ).resolves.toEqual({ ok: false, error: "agreement_not_found" });
    const record = await getInstruction(base);
    expect(record?.agreement.agreements.map((item) => item.state)).toEqual([
      "completed",
      "discarded",
    ]);
    expect(record?.agreement.agreements[1]).toMatchObject({
      discardReason: "Uploaded the wrong file",
      discardedBy: "negotiatorA",
    });
  });

  it("needs an update after a landlord change, which the next agreement supersedes", async () => {
    const id = await start();
    const base = { ...as("negotiatorA"), instructionId: id };
    await completeEvidence(id);
    await markInstructionReadyToMarket(base);
    // A rent change is not material and keeps it ready.
    await expect(
      replaceInstructionTerms({
        ...base,
        terms: { ...TERMS, askingRent: "1900" },
        reason: "Rent raised",
      }),
    ).resolves.toMatchObject({ ok: true });
    const addLandlord = { ...base, contactId: ids.personB };
    await expect(addInstructionParty(addLandlord)).resolves.toEqual({
      ok: false,
      error: "readiness_would_lapse",
    });
    await expect(
      addInstructionParty({ ...addLandlord, confirmReturnToOnboarding: true }),
    ).resolves.toMatchObject({ ok: true });
    let record = await getInstruction(base);
    expect(record).toMatchObject({
      journeyStage: "onboarding",
      agreement: { evidence: "update_required" },
    });
    expect(record?.journeyHistory[0].reason).toBe(
      "Agreement update required. Landlord added",
    );
    await signAgreement(id);
    record = await getInstruction(base);
    expect(record?.agreement.evidence).toBe("current");
    expect(record?.agreement.agreements[0].signatories).toHaveLength(2);
    expect(record?.agreement.agreements.map((item) => item.state)).toEqual([
      "completed",
      "superseded",
    ]);
    await expect(markInstructionReadyToMarket(base)).resolves.toMatchObject({
      ok: true,
    });
  });

  it("refuses a second upload while a draft is waiting, and keeps no file for it", async () => {
    const id = await start();
    await uploadAgreement(id);
    const stored = files.objects.size;
    const result = await uploadDocument({
      actor: as("negotiatorA"),
      target: { kind: "instruction_agreement", instructionId: id },
      originalName: "Another copy.pdf",
      bytes: PDF,
      store: files.store,
      attach: attachAgreementDraft(id),
    });
    expect(result).toEqual({ ok: false, error: "storage_unavailable" });
    expect(files.objects.size).toBe(stored);
  });
});

describe("tampered ids", () => {
  it("are refused cleanly and the refusal is still recorded", async () => {
    const tooLong = "x".repeat(300);
    await expect(
      replaceInstructionTerms({
        ...as("negotiatorA"),
        instructionId: tooLong,
        terms: TERMS,
        reason: "Changed",
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    await expect(
      startInstruction({
        ...as("negotiatorA"),
        enquiryId: tooLong,
        parties: [{ contactId: ids.personA, isMain: true }],
        terms: TERMS,
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    expect(
      await count(
        `SELECT count(*) AS n FROM "audit_events" WHERE "outcome" = 'denied' AND "action" IN ('instruction.terms.change', 'instruction.start')`,
      ),
    ).toBe(2);
  });
});

describe("winning a landlord lead", () => {
  it("is only possible by starting its instruction, never as a plain outcome", async () => {
    const result = await closeEnquiry({
      ...as("negotiatorA"),
      enquiryId: ids.leadA,
      // The type no longer allows it; a crafted request might still try.
      outcome: "won" as "lost",
    });
    expect(result).toEqual({ ok: false, error: "invalid_input" });
    expect(
      await count(
        `SELECT count(*) AS n FROM "landlord_enquiries" WHERE "stage" = 'won'`,
      ),
    ).toBe(0);
  });
});

describe("records on a current instruction", () => {
  it("cannot be archived or moved to another branch, with a plain refusal, until it ends", async () => {
    const id = await start();
    await addInstructionParty({
      ...as("negotiatorA"),
      instructionId: id,
      contactId: ids.personB,
    });
    await expect(
      archiveProperty({ ...as("owner"), propertyId: ids.propertyA }),
    ).resolves.toEqual({ ok: false, error: "has_current_instruction" });
    await expect(
      transferPropertyBranch({
        ...as("owner"),
        propertyId: ids.propertyA,
        toBranchId: ids.branchB,
        reason: "Moving",
      }),
    ).resolves.toEqual({ ok: false, error: "has_current_instruction" });
    await expect(
      archiveContact({ ...as("owner"), contactId: ids.personB }),
    ).resolves.toEqual({ ok: false, error: "on_instruction" });

    await endInstruction({
      ...as("negotiatorA"),
      instructionId: id,
      reason: "Landlord is selling",
    });
    await expect(
      transferPropertyBranch({
        ...as("owner"),
        propertyId: ids.propertyA,
        toBranchId: ids.branchB,
        reason: "Moving",
      }),
    ).resolves.toMatchObject({ ok: true });
  });
});

describe("ending an instruction", () => {
  it("ends it with a reason, withdraws the property, keeps history and frees the property", async () => {
    const id = await start();
    const base = { ...as("negotiatorA"), instructionId: id };
    await expect(endInstruction({ ...base, reason: "" })).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
    await expect(
      endInstruction({ ...base, reason: "Gone", endedOn: "2999-01-01" }),
    ).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
    await expect(
      endInstruction({ ...base, reason: "Gone", endedOn: "1999-01-01" }),
    ).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
    await expect(
      endInstruction({ ...base, reason: "Landlord is selling" }),
    ).resolves.toMatchObject({ ok: true });
    const record = await getInstruction(base);
    expect(record).toMatchObject({
      current: false,
      journeyStage: "withdrawn",
      ended: {
        on: ukToday(),
        reason: "Landlord is selling",
        by: "negotiatorA",
      },
      can: { manage: false, approveExceptions: false },
    });
    expect(record?.journeyHistory[0]).toMatchObject({
      to: "withdrawn",
      reason: "Landlord is selling",
    });
    // Routine edits stop.
    const results = await Promise.all([
      replaceInstructionTerms({
        ...base,
        terms: { ...TERMS, askingRent: "1" },
        reason: "x",
      }),
      addInstructionParty({ ...base, contactId: ids.personB }),
      recordInstructionAgreement({ ...base, status: "sent" }),
      endInstruction({ ...base, reason: "Again" }),
    ]);
    for (const result of results)
      expect(result).toEqual({ ok: false, error: "invalid_state" });

    // The property now lists it as history, and a later appointment is a new instruction.
    const list = await listInstructionsForProperty({
      ...as("negotiatorA"),
      propertyId: ids.propertyA,
    });
    expect(list).toMatchObject([
      {
        id,
        current: false,
        endedReason: "Landlord is selling",
        mainContact: "Olivia Landlord",
      },
    ]);
    const second = await start("negotiatorA", {
      enquiryId: ids.leadA2,
      appraisalId: null,
      parties: [{ contactId: ids.personB, isMain: true }],
    });
    const after = await listInstructionsForProperty({
      ...as("negotiatorA"),
      propertyId: ids.propertyA,
    });
    expect(after.map((item) => [item.id, item.current])).toEqual([
      [second, true],
      [id, false],
    ]);
  });

  it("can end on an earlier valid date", async () => {
    const id = await start("negotiatorA", { instructedOn: "2026-01-05" });
    await expect(
      endInstruction({
        ...as("negotiatorA"),
        instructionId: id,
        reason: "Landlord left",
        endedOn: "2026-03-01",
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(
      (await getInstruction({ ...as("negotiatorA"), instructionId: id }))?.ended
        ?.on,
    ).toBe("2026-03-01");
  });
});
