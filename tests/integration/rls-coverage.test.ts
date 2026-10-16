import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;

if (!adminUrl) {
  throw new Error("Integration tests require isolated database URLs.");
}

const url = new URL(adminUrl);
if (url.hostname !== "127.0.0.1" || url.pathname !== "/zayto_test") {
  throw new Error("Refusing to run integration tests outside zayto_test.");
}

const adminPool = new Pool({ connectionString: adminUrl, ssl: false });

afterAll(async () => {
  await adminPool.end();
});

type TableSecurity = {
  table: string;
  isRlsEnabled: boolean;
  isRlsForced: boolean;
  hasWorkspaceColumn: boolean;
  policyCount: number;
};

async function publicTables(): Promise<TableSecurity[]> {
  const { rows } = await adminPool.query<TableSecurity>(`
    SELECT
      c.relname AS "table",
      c.relrowsecurity AS "isRlsEnabled",
      c.relforcerowsecurity AS "isRlsForced",
      EXISTS (
        SELECT 1 FROM information_schema.columns col
        WHERE col.table_schema = 'public'
          AND col.table_name = c.relname
          AND col.column_name = 'workspace_id'
      ) AS "hasWorkspaceColumn",
      (SELECT count(*)::int FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS "policyCount"
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname <> '_prisma_migrations'
    ORDER BY c.relname
  `);
  return rows;
}

describe("row-level security coverage", () => {
  it("enables and forces row-level security on every application table", async () => {
    const tables = await publicTables();
    const unprotected = tables
      .filter((table) => !table.isRlsEnabled || !table.isRlsForced)
      .map((table) => table.table);

    expect(tables.length).toBeGreaterThan(0);
    expect(unprotected).toEqual([]);
  });

  it("gives every workspace-owned table at least one policy", async () => {
    const tables = await publicTables();
    const workspaceTablesWithoutPolicies = tables
      .filter((table) => table.hasWorkspaceColumn && table.policyCount === 0)
      .map((table) => table.table);

    expect(workspaceTablesWithoutPolicies).toEqual([]);
  });
});
