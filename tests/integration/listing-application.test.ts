import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { uploadDocument } from "@/core/documents/application/documents";
import {
  attachListingMedia,
  moveListingMedia,
  removeListingMedia,
  setListingMediaCaption,
} from "@/core/listings/application/listing-media";
import {
  confirmContentReady,
  confirmReadyToAdvertise,
  getCurrentListingForInstruction,
  getListing,
  prepareListing,
  returnListingToDraft,
  saveListingDraft,
  withdrawListing,
} from "@/core/listings/application/listings";
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
const workspaceSlug = "listings-app";
const otherSlug = "listings-other";

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

const COMPLETE = {
  headline: "Bright two-bed flat",
  summary: "Close to the station.",
  description: "A bright flat with a balcony and a lift.",
  highlights: ["Balcony", "Lift"],
  availableFrom: "2026-12-01",
  materialInformation: "A service charge applies.",
};

async function prepared(name: UserName = "managerA") {
  const result = await prepareListing({ ...as(name), instructionId });
  if (!result.ok) throw new Error(`prepare failed: ${result.error}`);
  return result.listingId;
}

async function view(listingId: string, name: UserName = "managerA") {
  const result = await getListing({ ...as(name), listingId });
  if (!result.ok) throw new Error(`view failed: ${result.error}`);
  return result.listing;
}

beforeEach(async () => {
  await seedReferenceData();
  instructionId = await readyInstruction();
});

afterAll(async () => {
  await adminPool.end();
  await runtimePool.end();
});

describe("preparing a listing", () => {
  it("pre-fills from the property and terms, never copying private notes or fees", async () => {
    const listingId = await prepared();
    const listing = await view(listingId);
    expect(listing.state).toBe("draft");
    expect(listing.current.versionNo).toBe(1);
    expect(listing.current.rent).toMatchObject({
      advertisedRentPence: 145000,
      rentPeriod: "month",
      depositOffering: "standard",
      depositPence: 167300,
    });
    expect(listing.current.facts).toMatchObject({ bedrooms: 2, bathrooms: 1 });
    const stored = JSON.stringify(listing.current);
    expect(stored).not.toContain("difficult");
    expect(stored).not.toContain("1200");
    expect(listing.drift).toEqual([]);
    expect(
      await getCurrentListingForInstruction({
        ...as("readOnlyA"),
        instructionId,
      }),
    ).toEqual({ id: listingId, state: "draft" });
  });

  it("opens the current listing instead of creating a second one", async () => {
    const first = await prepareListing({ ...as("managerA"), instructionId });
    const second = await prepareListing({
      ...as("negotiatorA"),
      instructionId,
    });
    expect(first).toMatchObject({ ok: true, created: true });
    expect(second).toMatchObject({
      ok: true,
      created: false,
      listingId: first.ok ? first.listingId : "",
    });
  });

  it("refuses roles that cannot prepare, and hides other branches and workspaces", async () => {
    for (const name of [
      "propertyManagerA",
      "accountsA",
      "readOnlyA",
    ] as const) {
      expect(await prepareListing({ ...as(name), instructionId })).toEqual({
        ok: false,
        error: "access_denied",
      });
    }
    for (const name of ["negotiatorB", "otherOwner"] as const) {
      expect(
        await prepareListing({ ...as(name), instructionId }),
      ).toMatchObject({ ok: false });
    }
    expect(
      await prepareListing({ ...as("managerA"), instructionId: "nonsense" }),
    ).toEqual({ ok: false, error: "instruction_not_found" });
  });

  it("refuses an instruction that is not Ready to market", async () => {
    await asAdmin(
      `UPDATE "instructions" SET "journey_stage" = 'onboarding'
       WHERE "id" = $1::uuid`,
      [instructionId],
    );
    expect(await prepareListing({ ...as("managerA"), instructionId })).toEqual({
      ok: false,
      error: "instruction_not_ready",
    });
  });
});

describe("starting a new listing from the previous advert (ADR-035)", () => {
  it("copies the advert text but not the available date, and never changes the earlier listing", async () => {
    const first = await prepared();
    await saveListingDraft({
      ...as("managerA"),
      listingId: first,
      baseVersionNo: 1,
      content: COMPLETE,
    });
    await withdrawListing({
      ...as("managerA"),
      listingId: first,
      reason: "Tenant found elsewhere",
    });
    const earlier = await view(first);

    const second = await prepareListing({
      ...as("managerA"),
      instructionId,
      startFromPrevious: true,
    });
    if (!second.ok) throw new Error("prepare failed");
    expect(second).toMatchObject({ created: true });
    expect(second.listingId).not.toBe(first);
    const fresh = await view(second.listingId);
    expect(fresh.state).toBe("draft");
    expect(fresh.current.versionNo).toBe(1);
    expect(fresh.current).toMatchObject({
      headline: COMPLETE.headline,
      summary: COMPLETE.summary,
      description: COMPLETE.description,
      highlights: COMPLETE.highlights,
      materialInformation: COMPLETE.materialInformation,
      availableFrom: null,
    });
    // The earlier listing is exactly as it was.
    const after = await view(first);
    expect(after.state).toBe("withdrawn");
    expect(after.current.versionNo).toBe(earlier.current.versionNo);
    expect(after.current.headline).toBe(COMPLETE.headline);
  });

  it("starts empty without the option, and copies nothing when there is no earlier listing", async () => {
    const empty = await prepareListing({
      ...as("managerA"),
      instructionId,
      startFromPrevious: true,
    });
    if (!empty.ok) throw new Error("prepare failed");
    expect((await view(empty.listingId)).current).toMatchObject({
      headline: "",
      description: "",
    });

    await withdrawListing({
      ...as("managerA"),
      listingId: empty.listingId,
      reason: "Paused",
    });
    await saveListingDraft({
      ...as("managerA"),
      listingId: empty.listingId,
      baseVersionNo: 1,
      content: COMPLETE,
    }).catch(() => undefined);
    const plain = await prepareListing({ ...as("managerA"), instructionId });
    if (!plain.ok) throw new Error("prepare failed");
    expect((await view(plain.listingId)).current.headline).toBe("");
  });
});

describe("working on the content", () => {
  it("saves drafts as new versions and refuses a stale save", async () => {
    const listingId = await prepared();
    expect(
      await saveListingDraft({
        ...as("negotiatorA"),
        listingId,
        baseVersionNo: 1,
        content: COMPLETE,
      }),
    ).toEqual({ ok: true, versionNo: 2 });
    expect(
      await saveListingDraft({
        ...as("managerA"),
        listingId,
        baseVersionNo: 1,
        content: { headline: "Someone else's change" },
      }),
    ).toEqual({ ok: false, error: "version_conflict" });
    const listing = await view(listingId, "readOnlyA");
    expect(listing.current.headline).toBe("Bright two-bed flat");
    expect(listing.versions.map((item) => item.versionNo)).toEqual([2, 1]);
  });

  it("explains invalid content field by field", async () => {
    const listingId = await prepared();
    const result = await saveListingDraft({
      ...as("managerA"),
      listingId,
      baseVersionNo: 1,
      content: { headline: "x".repeat(200), availableFrom: "next week" },
    });
    expect(result).toMatchObject({
      ok: false,
      error: "invalid_input",
      fieldErrors: {
        headline: expect.any(String),
        availableFrom: expect.any(String),
      },
    });
  });

  it("refuses Property Manager and Read Only", async () => {
    const listingId = await prepared();
    for (const name of ["propertyManagerA", "readOnlyA"] as const) {
      expect(
        await saveListingDraft({
          ...as(name),
          listingId,
          baseVersionNo: 1,
          content: COMPLETE,
        }),
      ).toEqual({ ok: false, error: "access_denied" });
    }
  });
});

describe("reviewing", () => {
  it("names what is missing, then confirms Content ready once complete", async () => {
    const listingId = await prepared();
    const refused = await confirmContentReady({
      ...as("negotiatorA"),
      listingId,
      versionNo: 1,
    });
    expect(refused).toMatchObject({ ok: false, error: "not_ready" });
    if (!refused.ok) {
      expect(
        refused.checklist?.filter((item) => !item.met).map((item) => item.code),
      ).toEqual([
        "headline",
        "summary",
        "description",
        "availability",
        "material_information",
      ]);
    }

    await saveListingDraft({
      ...as("negotiatorA"),
      listingId,
      baseVersionNo: 1,
      content: COMPLETE,
    });
    // Negotiators may review (owner decision 2026-10-21).
    expect(
      await confirmContentReady({
        ...as("negotiatorA"),
        listingId,
        versionNo: 2,
      }),
    ).toEqual({ ok: true });
    const listing = await view(listingId);
    expect(listing.state).toBe("content_ready");
    expect(listing.events[0]).toMatchObject({
      kind: "marked_content_ready",
      versionNo: 2,
      epcPosition: "not_assessed",
    });
    // Ready to advertise is out of reach: no EPC evidence and no media yet.
    expect(
      listing.advertiseChecklist
        .filter((item) => !item.met)
        .map((item) => item.code),
    ).toEqual(["epc", "photos", "main_image", "floorplan"]);
  });

  it("takes an edited listing back to Draft", async () => {
    const listingId = await prepared();
    await saveListingDraft({
      ...as("managerA"),
      listingId,
      baseVersionNo: 1,
      content: COMPLETE,
    });
    await confirmContentReady({ ...as("managerA"), listingId, versionNo: 2 });
    await saveListingDraft({
      ...as("managerA"),
      listingId,
      baseVersionNo: 2,
      content: { ...COMPLETE, headline: "Now with parking" },
    });
    const listing = await view(listingId);
    expect(listing.state).toBe("draft");
    expect(listing.events[0].kind).toBe("edited_after_review");
  });

  it("blocks a review while the property or terms have changed, until a new version is saved", async () => {
    const listingId = await prepared();
    await saveListingDraft({
      ...as("managerA"),
      listingId,
      baseVersionNo: 1,
      content: COMPLETE,
    });
    await asAdmin(
      `UPDATE "properties" SET "bedrooms" = 3 WHERE "id" = $1::uuid`,
      [ids.propertyA],
    );
    const listing = await view(listingId);
    expect(listing.drift.map((item) => item.field)).toEqual(["rooms"]);
    expect(
      await confirmContentReady({ ...as("managerA"), listingId, versionNo: 2 }),
    ).toMatchObject({ ok: false, error: "not_ready" });

    // Saving takes in the change.
    await saveListingDraft({
      ...as("managerA"),
      listingId,
      baseVersionNo: 2,
      content: COMPLETE,
    });
    expect((await view(listingId)).drift).toEqual([]);
    expect(
      await confirmContentReady({ ...as("managerA"), listingId, versionNo: 3 }),
    ).toEqual({ ok: true });
  });

  it("refuses a review of an out-of-date version", async () => {
    const listingId = await prepared();
    await saveListingDraft({
      ...as("managerA"),
      listingId,
      baseVersionNo: 1,
      content: COMPLETE,
    });
    expect(
      await confirmContentReady({ ...as("managerA"), listingId, versionNo: 1 }),
    ).toEqual({ ok: false, error: "version_conflict" });
  });

  it("returns to Draft with a reason, and withdraws for good", async () => {
    const listingId = await prepared();
    await saveListingDraft({
      ...as("managerA"),
      listingId,
      baseVersionNo: 1,
      content: COMPLETE,
    });
    await confirmContentReady({ ...as("managerA"), listingId, versionNo: 2 });
    expect(
      await returnListingToDraft({ ...as("managerA"), listingId, reason: " " }),
    ).toEqual({ ok: false, error: "invalid_input" });
    expect(
      await returnListingToDraft({
        ...as("managerA"),
        listingId,
        reason: "Photos to be retaken",
      }),
    ).toEqual({ ok: true });
    expect(
      await withdrawListing({
        ...as("managerA"),
        listingId,
        reason: "Landlord paused letting",
      }),
    ).toEqual({ ok: true });
    expect((await view(listingId)).state).toBe("withdrawn");
    expect(
      await saveListingDraft({
        ...as("managerA"),
        listingId,
        baseVersionNo: 2,
        content: COMPLETE,
      }),
    ).toEqual({ ok: false, error: "invalid_state" });
    // A fresh attempt is a new listing.
    expect(
      await prepareListing({ ...as("managerA"), instructionId }),
    ).toMatchObject({ ok: true, created: true });
  });

  it("refuses reviews by Property Manager and Read Only", async () => {
    const listingId = await prepared();
    for (const name of ["propertyManagerA", "readOnlyA"] as const) {
      expect(
        await confirmContentReady({ ...as(name), listingId, versionNo: 1 }),
      ).toEqual({ ok: false, error: "access_denied" });
      expect(
        await withdrawListing({ ...as(name), listingId, reason: "No" }),
      ).toEqual({ ok: false, error: "access_denied" });
    }
  });
});

describe("seeing listings", () => {
  it("lets every staff role in the branch read, and nobody else", async () => {
    const listingId = await prepared();
    for (const name of [
      "owner",
      "negotiatorA",
      "propertyManagerA",
      "accountsA",
      "readOnlyA",
    ] as const) {
      expect((await getListing({ ...as(name), listingId })).ok, name).toBe(
        true,
      );
    }
    for (const name of ["negotiatorB", "otherOwner"] as const) {
      expect(await getListing({ ...as(name), listingId })).toEqual({
        ok: false,
        error: "listing_not_found",
      });
    }
  });

  it("keeps advert text and notes out of the audit trail", async () => {
    const listingId = await prepared();
    await saveListingDraft({
      ...as("managerA"),
      listingId,
      baseVersionNo: 1,
      content: { ...COMPLETE, headline: "Secret headline text" },
    });
    const { rows } = await adminPool.query<{
      action: string;
      metadata: string;
    }>(
      `SELECT "action", COALESCE("metadata"::text, '') AS "metadata"
       FROM "audit_events" WHERE "target_type" = 'listing'`,
    );
    expect(rows.map((row) => row.action)).toEqual(
      expect.arrayContaining(["listing.prepare", "listing.save"]),
    );
    for (const row of rows) {
      expect(row.metadata).not.toContain("Secret headline");
    }
  });
});

describe("photos and floorplans (M5)", () => {
  const bytes = (value: string) => Array.from(value, (c) => c.charCodeAt(0));
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
    ...bytes("IHDR"),
    ...new Array<number>(17).fill(0),
    0,
    0,
    0,
    0,
    ...bytes("IEND"),
    0xae,
    0x42,
    0x60,
    0x82,
  ]);
  const PDF = new Uint8Array(
    bytes("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"),
  );

  async function upload(
    listingId: string,
    kind: "listing_photo" | "listing_floorplan",
    store = createMemoryDocumentStore().store,
    name: UserName = "managerA",
  ) {
    return uploadDocument({
      actor: as(name),
      target: { kind, listingId },
      originalName: kind === "listing_photo" ? "Lounge.png" : "Plan.pdf",
      bytes: kind === "listing_photo" ? PNG : PDF,
      store,
      attach: attachListingMedia(listingId),
    });
  }

  async function contentReady() {
    const listingId = await prepared();
    await saveListingDraft({
      ...as("managerA"),
      listingId,
      baseVersionNo: 1,
      content: COMPLETE,
    });
    await confirmContentReady({ ...as("managerA"), listingId, versionNo: 2 });
    return listingId;
  }

  /** The property's EPC: Applies, reviewed evidence rated C. */
  async function goodEpc() {
    const item = await asAdmin(
      `INSERT INTO "property_compliance_items" ("workspace_id", "property_id",
        "area", "requirement_id", "created_by_membership_id")
       SELECT $1::uuid, $2::uuid, 'epc_mees', r."id", $3::uuid
       FROM "compliance_requirements" AS r WHERE r."area" = 'epc_mees'
       RETURNING "id"`,
      [ids.workspace, ids.propertyA, memberships.managerA],
    );
    const itemId = item.rows[0].id as string;
    await asAdmin(
      `INSERT INTO "property_compliance_assessments" ("workspace_id",
        "item_id", "applicability", "recorded_by_membership_id", "recorded_at")
       VALUES ($1::uuid, $2::uuid, 'applies', $3::uuid, clock_timestamp())`,
      [ids.workspace, itemId, memberships.managerA],
    );
    const evidence = await asAdmin(
      `INSERT INTO "property_compliance_evidence" ("workspace_id", "item_id",
        "event_on", "expires_on", "epc_rating", "recorded_by_membership_id")
       VALUES ($1::uuid, $2::uuid, DATE '2024-01-01', DATE '2034-01-01', 'C',
         $3::uuid)
       RETURNING "id"`,
      [ids.workspace, itemId, memberships.managerA],
    );
    await asAdmin(
      `INSERT INTO "property_compliance_status_events" ("workspace_id",
        "item_id", "status", "evidence_id", "recorded_by_membership_id",
        "recorded_at")
       VALUES ($1::uuid, $2::uuid, 'reviewed', $3::uuid, $4::uuid,
         clock_timestamp())`,
      [ids.workspace, itemId, evidence.rows[0].id, memberships.managerA],
    );
  }

  it("uploads photos and floorplans into the listing, in order, photos first", async () => {
    const listingId = await prepared();
    expect((await upload(listingId, "listing_floorplan")).ok).toBe(true);
    expect((await upload(listingId, "listing_photo")).ok).toBe(true);
    expect((await upload(listingId, "listing_photo")).ok).toBe(true);
    const listing = await view(listingId);
    expect(listing.media.map((item) => item.role)).toEqual([
      "photo",
      "photo",
      "floorplan",
    ]);
    expect(listing.media[0].isMainImage).toBe(true);
    expect(listing.media[1].isMainImage).toBe(false);
  });

  it("refuses a PDF as a photo and uploads by roles that cannot prepare", async () => {
    const listingId = await prepared();
    expect(
      await uploadDocument({
        actor: as("managerA"),
        target: { kind: "listing_photo", listingId },
        originalName: "Plan.pdf",
        bytes: PDF,
        store: createMemoryDocumentStore().store,
        attach: attachListingMedia(listingId),
      }),
    ).toMatchObject({ ok: false, error: "type_not_allowed" });
    expect(
      await upload(listingId, "listing_photo", undefined, "readOnlyA"),
    ).toMatchObject({ ok: false, error: "access_denied" });
  });

  it("makes a photo the main image, moves media and sets captions", async () => {
    const listingId = await prepared();
    await upload(listingId, "listing_photo");
    await upload(listingId, "listing_photo");
    await upload(listingId, "listing_photo");
    const before = (await view(listingId)).media;
    const third = before[2];
    expect(
      await moveListingMedia({
        ...as("negotiatorA"),
        listingId,
        mediaId: third.id,
        move: "first",
      }),
    ).toEqual({ ok: true });
    let after = (await view(listingId)).media;
    expect(after.map((item) => item.id)).toEqual([
      third.id,
      before[0].id,
      before[1].id,
    ]);
    expect(after[0].isMainImage).toBe(true);

    await moveListingMedia({
      ...as("negotiatorA"),
      listingId,
      mediaId: third.id,
      move: "down",
    });
    after = (await view(listingId)).media;
    expect(after.map((item) => item.id)).toEqual([
      before[0].id,
      third.id,
      before[1].id,
    ]);

    expect(
      await setListingMediaCaption({
        ...as("negotiatorA"),
        listingId,
        mediaId: third.id,
        caption: "Bright lounge with bay window",
      }),
    ).toEqual({ ok: true });
    expect(
      await setListingMediaCaption({
        ...as("negotiatorA"),
        listingId,
        mediaId: third.id,
        caption: "Line one\nline two",
      }),
    ).toEqual({ ok: false, error: "invalid_input" });
    expect(
      (await view(listingId)).media.find((item) => item.id === third.id)
        ?.caption,
    ).toBe("Bright lounge with bay window");
  });

  it("removes a photo with a reason and deletes its file", async () => {
    const listingId = await prepared();
    const { store, objects } = createMemoryDocumentStore();
    await upload(listingId, "listing_photo", store);
    expect(objects.size).toBe(1);
    const [photo] = (await view(listingId)).media;
    expect(
      await removeListingMedia({
        ...as("managerA"),
        listingId,
        mediaId: photo.id,
        reason: " ",
        store,
      }),
    ).toEqual({ ok: false, error: "invalid_input" });
    expect(
      await removeListingMedia({
        ...as("managerA"),
        listingId,
        mediaId: photo.id,
        reason: "Blurry",
        store,
      }),
    ).toEqual({ ok: true });
    expect((await view(listingId)).media).toEqual([]);
    expect(objects.size).toBe(0);
  });

  it("confirms Ready to advertise with a satisfied EPC and the minimum media, and then freezes the media", async () => {
    await goodEpc();
    const listingId = await contentReady();
    for (let i = 0; i < 4; i += 1) await upload(listingId, "listing_photo");
    await upload(listingId, "listing_floorplan");
    const short = await confirmReadyToAdvertise({
      ...as("negotiatorA"),
      listingId,
      versionNo: 2,
    });
    expect(short).toMatchObject({ ok: false, error: "not_ready" });
    if (!short.ok) {
      expect(
        short.checklist?.filter((item) => !item.met).map((item) => item.code),
      ).toEqual(["photos"]);
    }
    await upload(listingId, "listing_photo");
    expect(
      await confirmReadyToAdvertise({
        ...as("negotiatorA"),
        listingId,
        versionNo: 2,
      }),
    ).toEqual({ ok: true });
    const listing = await view(listingId);
    expect(listing.state).toBe("ready_to_advertise");
    expect(listing.events[0]).toMatchObject({
      kind: "marked_ready_to_advertise",
      epcPosition: "evidence_reviewed",
    });
    // No changes to the media until it goes back to Draft.
    expect(await upload(listingId, "listing_photo")).toMatchObject({
      ok: false,
      error: "record_closed",
    });
    expect(
      await moveListingMedia({
        ...as("managerA"),
        listingId,
        mediaId: listing.media[1].id,
        move: "first",
      }),
    ).toEqual({ ok: false, error: "invalid_state" });
  });

  it("keeps a listing with an unrated EPC from Ready to advertise", async () => {
    await goodEpc();
    await asAdmin(
      `UPDATE "property_compliance_evidence" SET "epc_rating" = NULL`,
    );
    const listingId = await contentReady();
    for (let i = 0; i < 5; i += 1) await upload(listingId, "listing_photo");
    await upload(listingId, "listing_floorplan");
    const result = await confirmReadyToAdvertise({
      ...as("managerA"),
      listingId,
      versionNo: 2,
    });
    expect(result).toMatchObject({ ok: false, error: "not_ready" });
    if (!result.ok) {
      expect(
        result.checklist?.filter((item) => !item.met).map((item) => item.code),
      ).toEqual(["epc"]);
    }
  });

  it("refuses a fourth floorplan before reading the file", async () => {
    const listingId = await prepared();
    for (let i = 0; i < 3; i += 1) {
      expect((await upload(listingId, "listing_floorplan")).ok).toBe(true);
    }
    const { store, objects } = createMemoryDocumentStore();
    expect(await upload(listingId, "listing_floorplan", store)).toMatchObject({
      ok: false,
      error: "media_limit",
    });
    expect(objects.size).toBe(0);
  });

  it("stops Ready to advertise once a photo is removed below the minimum", async () => {
    await goodEpc();
    const listingId = await contentReady();
    const { store } = createMemoryDocumentStore();
    for (let i = 0; i < 5; i += 1)
      await upload(listingId, "listing_photo", store);
    await upload(listingId, "listing_floorplan", store);
    const [photo] = (await view(listingId)).media;
    expect(
      await removeListingMedia({
        ...as("managerA"),
        listingId,
        mediaId: photo.id,
        reason: "Wrong property",
        store,
      }),
    ).toEqual({ ok: true });
    const result = await confirmReadyToAdvertise({
      ...as("negotiatorA"),
      listingId,
      versionNo: 2,
    });
    expect(result).toMatchObject({ ok: false, error: "not_ready" });
    if (!result.ok) {
      expect(
        result.checklist?.filter((item) => !item.met).map((item) => item.code),
      ).toEqual(["photos"]);
    }
  });

  it("changes only the listing's own media, and refuses direction marks in captions", async () => {
    const first = await prepared();
    await upload(first, "listing_photo");
    const [other] = (await view(first)).media;
    await withdrawListing({
      ...as("managerA"),
      listingId: first,
      reason: "Starting again",
    });
    const second = await prepared();
    await upload(second, "listing_photo");
    const [own] = (await view(second)).media;
    const { store, objects } = createMemoryDocumentStore();
    for (const attempt of [
      moveListingMedia({
        ...as("managerA"),
        listingId: second,
        mediaId: other.id,
        move: "first",
      }),
      setListingMediaCaption({
        ...as("managerA"),
        listingId: second,
        mediaId: other.id,
        caption: "Not this one",
      }),
      removeListingMedia({
        ...as("managerA"),
        listingId: second,
        mediaId: other.id,
        reason: "Not this one",
        store,
      }),
    ]) {
      expect(await attempt).toEqual({ ok: false, error: "invalid_input" });
    }
    expect(objects.size).toBe(0);
    expect(
      await setListingMediaCaption({
        ...as("managerA"),
        listingId: second,
        mediaId: own.id,
        caption: "Lounge \u202Egpj.exe",
      }),
    ).toEqual({ ok: false, error: "invalid_input" });
  });
});
