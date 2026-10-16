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

async function runtimePrivileges(table: string) {
  const { rows } = await adminPool.query<{
    canSelect: boolean;
    canInsert: boolean;
    canUpdate: boolean;
    canDelete: boolean;
  }>(
    `SELECT
       has_table_privilege('zayto_app', $1, 'SELECT') AS "canSelect",
       has_table_privilege('zayto_app', $1, 'INSERT') AS "canInsert",
       has_table_privilege('zayto_app', $1, 'UPDATE') AS "canUpdate",
       has_table_privilege('zayto_app', $1, 'DELETE') AS "canDelete"`,
    [`public.${table}`],
  );
  return rows[0];
}

describe("database privileges", () => {
  it("lets the app add to the audit log but never change or remove entries", async () => {
    expect(await runtimePrivileges("audit_events")).toEqual({
      canSelect: true,
      canInsert: true,
      canUpdate: false,
      canDelete: false,
    });
  });
});

describe("links between workspace tables", () => {
  it("always include workspace_id, so no row can point into another workspace", async () => {
    const { rows } = await adminPool.query<{ constraint: string }>(`
      SELECT con.conname AS "constraint"
      FROM pg_constraint con
      JOIN pg_namespace n ON n.oid = con.connamespace
      JOIN pg_attribute child_ws
        ON child_ws.attrelid = con.conrelid AND child_ws.attname = 'workspace_id'
      JOIN pg_attribute parent_ws
        ON parent_ws.attrelid = con.confrelid AND parent_ws.attname = 'workspace_id'
      WHERE con.contype = 'f'
        AND n.nspname = 'public'
        AND NOT (child_ws.attnum = ANY (con.conkey))
      ORDER BY con.conname
    `);

    expect(rows.map(({ constraint }) => constraint)).toEqual([]);
  });
});
