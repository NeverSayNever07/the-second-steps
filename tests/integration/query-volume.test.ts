import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDashboardSummary } from "@/core/actions/application/dashboard-summary";
import { getTeamWorkload } from "@/core/actions/application/team-workload";
import { listContactPage } from "@/core/contacts/application/contacts";
import {
  getContactLandlordHistory,
  listLandlords,
} from "@/core/contacts/application/landlords";
import { listEnquiryPage } from "@/core/enquiries/application/enquiries";
import { getInstructionAttention } from "@/core/instructions/application/instruction-attention";
import { listInstructions } from "@/core/instructions/application/instruction-records";
import { startInstruction } from "@/core/instructions/application/instructions";
import type { TermsInput } from "@/core/instructions/domain/instruction";
import { listPropertyPage } from "@/core/properties/application/property-list";
import { searchWorkspace } from "@/core/workspace/application/workspace-search";

/*
 * Chunk 9A: how the main reads behave at a realistic agency size, with
 * fictional data. It is slow to seed, so it only runs on request:
 *   RUN_PERF=1 npm run test:integration -- tests/integration/query-volume.test.ts
 * It prints a timing table and fails only on a gross regression.
 */
const RUN = process.env.RUN_PERF === "1";

const CONTACTS = 6_000;
const PROPERTIES = 3_000;
const LEADS = 3_000;
const INSTRUCTIONS = 300;
const RUNS = 5;
const SEEDED = {
  contacts: 6_000,
  properties: 3_000,
  leads: 3_000,
  instructions: 300,
  seconds: 0,
};
/**
 * A ceiling for regressions, not a target. With JIT off every read measured
 * under 70ms locally on 2026-10-20; before that one search took 1.2s.
 */
const CEILING_MS = 300;

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function code(index: number) {
  let value = index;
  let out = "";
  for (let digit = 0; digit < 8; digit += 1) {
    out = ALPHABET[value % 32] + out;
    value = Math.floor(value / 32);
  }
  return out;
}

const FIRST = [
  "Olivia",
  "Jack",
  "Amelia",
  "Harry",
  "Isla",
  "Noah",
  "Ava",
  "Leo",
  "Mia",
  "Oscar",
];
const LAST = [
  "Smith",
  "Jones",
  "Taylor",
  "Brown",
  "Williams",
  "Wilson",
  "Johnson",
  "Davies",
  "Patel",
  "Wright",
  "Evans",
  "Thomas",
];
const STREETS = [
  "High Street",
  "Station Road",
  "Church Lane",
  "Mill Lane",
  "Park Road",
  "Victoria Road",
  "Green Lane",
  "Manor Road",
];
const AREAS = ["M1", "M14", "M20", "M21", "LS2", "SW1A", "OX2", "OX4"];
const postcodeFor = (index: number) =>
  `${AREAS[index % AREAS.length]} ${(index % 9) + 1}${"ABDEFGHJ"[index % 8]}${"LNPQRSTU"[(index >> 3) % 8]}`;

const TERMS: TermsInput = {
  service: "fully_managed",
  askingRent: "1250",
  rentPeriod: "month",
  feeKind: "percentage",
  feeValue: "12",
  feeFrequency: "",
  feeVat: "exclusive",
  depositOffering: "standard",
  deposit: "1442.30",
  holdingDeposit: "",
  charges: [],
};

const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
// This file empties tables before seeding, so when it runs it must only ever
// touch the disposable local test database, however Vitest was started.
if (RUN) {
  const runtimeUrl = process.env.DATABASE_URL;
  if (!runtimeUrl || !adminUrl) {
    throw new Error("The volume test requires isolated database URLs.");
  }
  for (const value of [runtimeUrl, adminUrl]) {
    const url = new URL(value);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/zayto_test") {
      throw new Error("Refusing to run the volume test outside zayto_test.");
    }
  }
}
const workspaceSlug = "volume-agency";
const ids = {
  workspace: randomUUID(),
  branches: [randomUUID(), randomUUID(), randomUUID()],
  source: randomUUID(),
};
const users = {
  owner: { role: "workspace_owner", scope: "workspace", branch: null },
  negotiatorA: { role: "negotiator", scope: "named_branches", branch: 0 },
} as const;
type UserName = keyof typeof users;
const auth = { owner: randomUUID(), negotiatorA: randomUUID() };
const memberships = { owner: randomUUID(), negotiatorA: randomUUID() };
const as = (name: UserName) => ({ authSubject: auth[name], workspaceSlug });

const contactIds = Array.from({ length: CONTACTS }, () => randomUUID());
const propertyIds = Array.from({ length: PROPERTIES }, () => randomUUID());
const leadIds = Array.from({ length: LEADS }, () => randomUUID());
const appraisalIds = Array.from({ length: LEADS }, () => randomUUID());
const branchOf = (index: number) => ids.branches[index % 3];
// Leads cycle new, booked, completed; every third lead is completed.
const STAGES = ["new_enquiry", "appraisal_booked", "appraisal_completed"];

async function seed(pool: Pool) {
  const client = await pool.connect();
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
       VALUES ($1::uuid, $2, 'Volume Agency', 'agency', CURRENT_TIMESTAMP)`,
      [ids.workspace, workspaceSlug],
    );
    await client.query(
      `INSERT INTO "branches" ("id", "workspace_id", "name", "updated_at")
       SELECT id, $1::uuid, 'Branch ' || n, CURRENT_TIMESTAMP
       FROM unnest($2::uuid[]) WITH ORDINALITY AS b(id, n)`,
      [ids.workspace, ids.branches],
    );
    for (const name of Object.keys(users) as UserName[]) {
      const user = users[name];
      const identity = randomUUID();
      await client.query(
        `INSERT INTO "user_identities" ("id", "first_name", "last_name", "updated_at")
         VALUES ($1::uuid, $2, 'Tester', CURRENT_TIMESTAMP)`,
        [identity, name],
      );
      await client.query(
        `INSERT INTO "authentication_provider_links"
          ("user_identity_id", "provider", "provider_subject")
         VALUES ($1::uuid, 'supabase', $2::uuid)`,
        [identity, auth[name]],
      );
      await client.query(
        `INSERT INTO "memberships"
          ("id", "workspace_id", "user_identity_id", "scope_mode", "updated_at")
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::membership_scope_mode, CURRENT_TIMESTAMP)`,
        [memberships[name], ids.workspace, identity, user.scope],
      );
      await client.query(
        `INSERT INTO "membership_roles" ("workspace_id", "membership_id", "role_code")
         VALUES ($1::uuid, $2::uuid, $3::membership_role_code)`,
        [ids.workspace, memberships[name], user.role],
      );
      if (user.branch !== null) {
        await client.query(
          `INSERT INTO "membership_branch_access"
            ("workspace_id", "membership_id", "branch_id")
           VALUES ($1::uuid, $2::uuid, $3::uuid)`,
          [ids.workspace, memberships[name], ids.branches[user.branch]],
        );
      }
    }
    await client.query(
      "SELECT set_config('app.workspace_id', $1, true), set_config('app.membership_id', $2, true), set_config('app.membership_scope_mode', 'workspace', true)",
      [ids.workspace, memberships.owner],
    );

    await client.query(
      `INSERT INTO "contacts" ("id", "workspace_id", "kind", "reference",
        "first_name", "last_name", "status", "created_by_membership_id", "updated_at")
       SELECT id, $1::uuid, 'person', ref, first, last, 'active', $2::uuid,
         CURRENT_TIMESTAMP - (n || ' minutes')::interval
       FROM unnest($3::uuid[], $4::text[], $5::text[], $6::text[])
         WITH ORDINALITY AS c(id, ref, first, last, n)`,
      [
        ids.workspace,
        memberships.owner,
        contactIds,
        contactIds.map((_, i) => `PER-${code(i)}`),
        contactIds.map((_, i) => FIRST[i % FIRST.length]),
        contactIds.map((_, i) => LAST[(i * 7) % LAST.length]),
      ],
    );
    await client.query(
      `INSERT INTO "contact_branch_links" ("workspace_id", "contact_id",
        "branch_id", "is_primary", "created_by_membership_id", "updated_at")
       SELECT $1::uuid, contact, branch, true, $2::uuid, CURRENT_TIMESTAMP
       FROM unnest($3::uuid[], $4::uuid[]) AS l(contact, branch)`,
      [
        ids.workspace,
        memberships.owner,
        contactIds,
        contactIds.map((_, i) => branchOf(i)),
      ],
    );
    await client.query(
      `INSERT INTO "contact_points" ("workspace_id", "contact_id", "kind",
        "value", "normalized_value", "is_preferred", "updated_at")
       SELECT $1::uuid, contact, 'email', email, email, true, CURRENT_TIMESTAMP
       FROM unnest($2::uuid[], $3::text[]) AS p(contact, email)`,
      [
        ids.workspace,
        contactIds,
        contactIds.map((_, i) => `person${i}@example.test`),
      ],
    );
    await client.query(
      `INSERT INTO "properties" ("id", "workspace_id", "reference",
        "responsible_branch_id", "address_building", "address_street",
        "town_city", "postcode", "normalized_address_key", "property_type",
        "created_by_membership_id", "updated_at")
       SELECT id, $1::uuid, ref, branch, building, street, 'Manchester',
         postcode, ref, 'flat', $2::uuid,
         CURRENT_TIMESTAMP - (n || ' minutes')::interval
       FROM unnest($3::uuid[], $4::text[], $5::uuid[], $6::text[], $7::text[], $8::text[])
         WITH ORDINALITY AS p(id, ref, branch, building, street, postcode, n)`,
      [
        ids.workspace,
        memberships.owner,
        propertyIds,
        propertyIds.map((_, i) => `PRP-${code(i)}`),
        propertyIds.map((_, i) => branchOf(i)),
        propertyIds.map((_, i) => String((i % 120) + 1)),
        propertyIds.map((_, i) => STREETS[i % STREETS.length]),
        propertyIds.map((_, i) => postcodeFor(i)),
      ],
    );
    // Property i is owned by contact i, in the same branch.
    await client.query(
      `INSERT INTO "property_ownerships" ("workspace_id", "property_id",
        "contact_id", "is_lead", "created_by_membership_id", "updated_at")
       SELECT $1::uuid, property, contact, true, $2::uuid, CURRENT_TIMESTAMP
       FROM unnest($3::uuid[], $4::uuid[]) AS o(property, contact)`,
      [
        ids.workspace,
        memberships.owner,
        propertyIds,
        propertyIds.map((_, i) => contactIds[i]),
      ],
    );
    await client.query(
      `INSERT INTO "lead_sources" ("id", "workspace_id", "name", "updated_at")
       VALUES ($1::uuid, $2::uuid, 'Rightmove', CURRENT_TIMESTAMP)`,
      [ids.source, ids.workspace],
    );
    // Lead i concerns property i and its owner. Branch A leads belong to the
    // negotiator; the rest to the owner.
    await client.query(
      `INSERT INTO "landlord_enquiries" ("id", "workspace_id", "reference",
        "responsible_branch_id", "stage", "enquirer_name", "enquirer_telephone",
        "postcode", "contact_id", "property_id", "lead_source_id",
        "lead_membership_id", "created_by_membership_id", "updated_at")
       SELECT id, $1::uuid, ref, branch, stage::enquiry_stage, name,
         '07700 900111', postcode, contact, property, $2::uuid, lead,
         $3::uuid, CURRENT_TIMESTAMP - (n || ' minutes')::interval
       FROM unnest($4::uuid[], $5::text[], $6::uuid[], $7::text[], $8::text[],
         $9::text[], $10::uuid[], $11::uuid[], $12::uuid[])
         WITH ORDINALITY AS e(id, ref, branch, stage, name, postcode, contact, property, lead, n)`,
      [
        ids.workspace,
        ids.source,
        memberships.owner,
        leadIds,
        leadIds.map((_, i) => `ENQ-${code(i)}`),
        leadIds.map((_, i) => branchOf(i)),
        leadIds.map((_, i) => STAGES[i % 3]),
        leadIds.map(
          (_, i) => `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
        ),
        leadIds.map((_, i) => postcodeFor(i)),
        leadIds.map((_, i) => contactIds[i]),
        leadIds.map((_, i) => propertyIds[i]),
        leadIds.map((_, i) =>
          i % 3 === 0 ? memberships.negotiatorA : memberships.owner,
        ),
      ],
    );
    // Booked leads have a future appraisal; completed leads a past one.
    const appraised = leadIds
      .map((id, i) => ({ id, i, stage: STAGES[i % 3] }))
      .filter(({ stage }) => stage !== "new_enquiry");
    await client.query(
      `INSERT INTO "appraisals" ("id", "workspace_id", "enquiry_id",
        "scheduled_at", "assigned_membership_id", "status", "completed_at",
        "expected_monthly_rent_pence", "recommended_service", "fee_kind",
        "fee_value", "fee_vat", "created_by_membership_id", "updated_at")
       SELECT appraisal, $1::uuid, lead,
         CASE WHEN done THEN CURRENT_TIMESTAMP - interval '3 days'
              ELSE CURRENT_TIMESTAMP + interval '3 days' END,
         assignee,
         CASE WHEN done THEN 'completed' ELSE 'scheduled' END::appraisal_status,
         CASE WHEN done THEN CURRENT_TIMESTAMP - interval '2 days' END,
         CASE WHEN done THEN 125000 END,
         CASE WHEN done THEN 'fully_managed' END::letting_service_type,
         CASE WHEN done THEN 'percentage' END::fee_kind,
         CASE WHEN done THEN 1200 END,
         CASE WHEN done THEN 'exclusive' END::vat_treatment,
         $2::uuid, CURRENT_TIMESTAMP
       FROM unnest($3::uuid[], $4::uuid[], $5::boolean[], $6::uuid[])
         AS a(appraisal, lead, done, assignee)`,
      [
        ids.workspace,
        memberships.owner,
        appraised.map(({ i }) => appraisalIds[i]),
        appraised.map(({ id }) => id),
        appraised.map(({ stage }) => stage === "appraisal_completed"),
        appraised.map(({ i }) =>
          i % 3 === 0 ? memberships.negotiatorA : memberships.owner,
        ),
      ],
    );
    const newLeads = leadIds.filter((_, i) => STAGES[i % 3] === "new_enquiry");
    await client.query(
      `INSERT INTO "enquiry_tasks" ("workspace_id", "enquiry_id", "title",
        "due_on", "assigned_membership_id", "created_by_membership_id", "updated_at")
       SELECT $1::uuid, lead, 'Call the landlord', CURRENT_DATE, $2::uuid,
         $2::uuid, CURRENT_TIMESTAMP
       FROM unnest($3::uuid[]) AS t(lead)`,
      [ids.workspace, memberships.owner, newLeads],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  // Instructions go through the real service so every rule is respected.
  const completed = leadIds
    .map((id, i) => ({ id, i }))
    .filter(({ i }) => STAGES[i % 3] === "appraisal_completed")
    .slice(0, INSTRUCTIONS);
  for (const { id, i } of completed) {
    const result = await startInstruction({
      ...as("owner"),
      enquiryId: id,
      leadMembershipId: memberships.owner,
      appraisalId: appraisalIds[i],
      parties: [{ contactId: contactIds[i], isMain: true }],
      terms: TERMS,
    });
    if (!result.ok) throw new Error(`Instruction ${i} failed: ${result.error}`);
  }
}

async function time(label: string, run: () => Promise<unknown>) {
  await run(); // warm-up
  const samples: number[] = [];
  for (let attempt = 0; attempt < RUNS; attempt += 1) {
    const started = performance.now();
    await run();
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  return {
    label,
    median: Math.round(samples[Math.floor(RUNS / 2)]),
    worst: Math.round(samples[RUNS - 1]),
  };
}

/**
 * The Landlords search written out by hand, explained as the app's own
 * database role with the owner's context, so row security is included.
 */
async function explainLandlordSearch(query: string, jit: boolean) {
  const runtime = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false,
  });
  const client = await runtime.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.workspace_id', $1, true),
              set_config('app.membership_id', $2, true),
              set_config('app.membership_scope_mode', 'workspace', true),
              set_config('app.allowed_branch_ids', '{}', true)`,
      [ids.workspace, memberships.owner],
    );
    await client.query(`SET LOCAL jit = ${jit ? "on" : "off"}`);
    const pattern = `%${query}%`;
    const { rows } = await client.query(
      `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)
       SELECT c.id FROM contacts c
       WHERE c.workspace_id = $1::uuid AND c.status = 'active'
         AND (
           EXISTS (SELECT 1 FROM landlord_enquiries e
                   WHERE e.workspace_id = c.workspace_id AND e.contact_id = c.id
                     AND e.stage IN ('new_enquiry','appraisal_booked','appraisal_completed'))
           OR EXISTS (SELECT 1 FROM property_ownerships o
                      WHERE o.workspace_id = c.workspace_id AND o.contact_id = c.id
                        AND o.ended_at IS NULL)
           OR EXISTS (SELECT 1 FROM instruction_parties p
                      JOIN instructions i ON i.workspace_id = p.workspace_id
                        AND i.id = p.instruction_id
                      WHERE p.workspace_id = c.workspace_id AND p.contact_id = c.id
                        AND p.removed_at IS NULL AND i.ended_on IS NULL)
         )
         AND (
           c.reference ILIKE $2 OR c.first_name ILIKE $2 OR c.last_name ILIKE $2
           OR c.legal_name ILIKE $2 OR c.trading_name ILIKE $2
           OR c.registration_number ILIKE $2
           OR EXISTS (SELECT 1 FROM contact_points cp
                      WHERE cp.workspace_id = c.workspace_id AND cp.contact_id = c.id
                        AND cp.archived_at IS NULL AND cp.value ILIKE $2)
         )
       ORDER BY c.updated_at DESC, c.id LIMIT 26`,
      [ids.workspace, pattern],
    );
    await client.query("ROLLBACK");
    return rows.map((row) => row["QUERY PLAN"]).join("\n");
  } finally {
    client.release();
    await runtime.end();
  }
}

describe.skipIf(!RUN)("query volume (Chunk 9A)", () => {
  const pool = new Pool({ connectionString: adminUrl, ssl: false });

  beforeAll(async () => {
    const started = performance.now();
    await seed(pool);
    SEEDED.seconds = Math.round((performance.now() - started) / 1000);
    console.log(
      `Seeded ${CONTACTS} contacts, ${PROPERTIES} properties, ${LEADS} leads, ${INSTRUCTIONS} instructions in ${Math.round((performance.now() - started) / 1000)}s`,
    );
  }, 600_000);

  afterAll(async () => {
    await pool.end();
  });

  it("keeps the main reads well under the ceiling", async () => {
    const results = [];
    for (const who of ["owner", "negotiatorA"] as const) {
      const actor = as(who);
      const tag = who === "owner" ? "all branches" : "one branch";
      results.push(
        await time(`Contacts list, page 1 (${tag})`, () =>
          listContactPage(actor),
        ),
        await time(`Contacts list, page 40 (${tag})`, () =>
          listContactPage({ ...actor, page: 40 }),
        ),
        await time(`Contacts search "smith" (${tag})`, () =>
          listContactPage({ ...actor, query: "smith" }),
        ),
        await time(`Landlords list (${tag})`, () => listLandlords(actor)),
        await time(`Landlords search "olivia smith" (${tag})`, () =>
          listLandlords({ ...actor, query: "olivia smith" }),
        ),
        // A search with no matches is the worst case: nothing stops the scan
        // early, so every row in scope is checked.
        await time(`Contacts search, no match (${tag})`, () =>
          listContactPage({ ...actor, query: "zzqxj" }),
        ),
        await time(`Landlords search, no match (${tag})`, () =>
          listLandlords({ ...actor, query: "zzqxj" }),
        ),
        await time(`Properties search, no match (${tag})`, () =>
          listPropertyPage({ ...actor, query: "zzqxj" }),
        ),
        await time(`Landlord leads search, no match (${tag})`, () =>
          listEnquiryPage({ ...actor, query: "zzqxj" }),
        ),
        await time(`Instructions search, no match (${tag})`, () =>
          listInstructions({ ...actor, query: "zzqxj" }),
        ),
        await time(`Workspace search, no match (${tag})`, () =>
          searchWorkspace({ ...actor, query: "zzqxj" }),
        ),
        await time(`Properties list (${tag})`, () => listPropertyPage(actor)),
        await time(`Properties in onboarding (${tag})`, () =>
          listPropertyPage({ ...actor, instruction: "onboarding" }),
        ),
        await time(`Landlord leads list (${tag})`, () =>
          listEnquiryPage(actor),
        ),
        await time(`Instructions list (${tag})`, () => listInstructions(actor)),
        await time(`Workspace search "smith" (${tag})`, () =>
          searchWorkspace({ ...actor, query: "smith" }),
        ),
        await time(`Workspace search postcode "M14 2" (${tag})`, () =>
          searchWorkspace({ ...actor, query: "M14 2" }),
        ),
        await time(`Dashboard summary (${tag})`, () =>
          getDashboardSummary(actor),
        ),
        await time(`Instruction onboarding panel (${tag})`, () =>
          getInstructionAttention(actor),
        ),
        await time(`Team workload (${tag})`, () => getTeamWorkload(actor)),
        await time(`Contact landlord history (${tag})`, () =>
          getContactLandlordHistory({ ...actor, contactId: contactIds[0] }),
        ),
      );
    }
    // Vitest hides console output from passing tests, so the table is also
    // written to the (git-ignored) test-results folder.
    mkdirSync("test-results", { recursive: true });
    writeFileSync(
      "test-results/query-volume.json",
      JSON.stringify({ seeded: SEEDED, results }, null, 2),
    );
    writeFileSync(
      "test-results/landlords-search-plan.txt",
      [
        "JIT on:",
        await explainLandlordSearch("zzqxj", true),
        "",
        "JIT off:",
        await explainLandlordSearch("zzqxj", false),
      ].join("\n"),
    );
    console.table(results);
    for (const { label, median } of results) {
      expect(median, label).toBeLessThan(CEILING_MS);
    }
  }, 600_000);
});
