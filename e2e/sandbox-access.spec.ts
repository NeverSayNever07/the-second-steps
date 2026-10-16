import { createHmac, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";
import {
  getSupabasePublicEnvironment,
  getSupabaseSecretKey,
} from "@/core/auth/env";
import { databaseSsl, databaseUrl } from "@/core/db/connection";

const PERSONAS = [
  {
    email: "owner@zayto.local",
    expectedUrl: /\/dashboard\/w\/oakfield-lettings-demo$/,
    expectedHeading: "Needs attention",
    deniedUrl: "/platform",
  },
  {
    email: "branch.manager@zayto.local",
    expectedUrl: /\/dashboard\/w\/oakfield-lettings-demo$/,
    expectedHeading: "Needs attention",
    deniedUrl: "/platform",
  },
  {
    email: "platform.owner@zayto.local",
    expectedUrl: /\/platform$/,
    expectedHeading: "Platform overview",
    deniedUrl: "/dashboard/w/oakfield-lettings-demo",
  },
  {
    email: "dual.owner@zayto.local",
    expectedUrl: /\/dashboard$/,
    expectedHeading: "Where would you like to work?",
    deniedUrl: null,
  },
  {
    email: "no.access@zayto.local",
    expectedUrl: /\/dashboard$/,
    expectedHeading: "Access has not been granted",
    deniedUrl: "/dashboard/w/oakfield-lettings-demo",
  },
] as const;
const RUN_AUTH_MUTATION_E2E = process.env.RUN_AUTH_MUTATION_E2E === "true";
const RUN_PLATFORM_USER_MUTATION_E2E =
  process.env.RUN_PLATFORM_USER_MUTATION_E2E === "true";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function createSupabaseTestAdminClient() {
  const { url } = getSupabasePublicEnvironment();

  return createClient(url, getSupabaseSecretKey(), {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function decodeBase32(value: string) {
  let bits = "";
  for (const character of value.replace(/=+$/g, "").toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("Unexpected TOTP secret format.");
    bits += index.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function currentTotp(secret: string) {
  const counter = Math.floor(Date.now() / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret))
    .update(buffer)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return (binary % 1_000_000).toString().padStart(6, "0");
}

async function deleteTestFactors(email: string) {
  const supabase = createSupabaseTestAdminClient();
  const { data: users, error: usersError } =
    await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) throw usersError;

  const user = users.users.find(
    (candidate) => candidate.email?.toLowerCase() === email,
  );
  if (!user) return;

  const { data: factors, error: factorsError } =
    await supabase.auth.admin.mfa.listFactors({ userId: user.id });
  if (factorsError) throw factorsError;

  for (const factor of factors.factors) {
    const { error } = await supabase.auth.admin.mfa.deleteFactor({
      userId: user.id,
      id: factor.id,
    });
    if (error) throw error;
  }
}

async function authSubjectFor(email: string) {
  const supabase = createSupabaseTestAdminClient();
  const { data: users, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw error;

  const user = users.users.find(
    (candidate) => candidate.email?.toLowerCase() === email,
  );
  if (!user) throw new Error(`Sandbox identity ${email} was not found.`);
  return user.id;
}

async function setZaytoMfaAudience(enabled: boolean) {
  const authSubject = await authSubjectFor("platform.owner@zayto.local");
  const pool = new Pool({
    connectionString: databaseUrl(),
    ssl: databaseSsl(),
  });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.auth_subject', $1, true)", [
      authSubject,
    ]);
    const identity = await client.query<{ user_identity_id: string }>(
      `SELECT "user_identity_id"
       FROM "authentication_provider_links"
       WHERE "provider" = 'supabase' AND "provider_subject" = $1::uuid`,
      [authSubject],
    );
    const userIdentityId = identity.rows[0]?.user_identity_id;
    if (!userIdentityId)
      throw new Error("Platform test identity was not linked.");

    await client.query("SELECT set_config('app.user_identity_id', $1, true)", [
      userIdentityId,
    ]);
    const platformRole = await client.query(
      `SELECT 1
       FROM "platform_role_assignments"
       WHERE "user_identity_id" = $1::uuid
         AND "role_code" = 'platform_owner'
         AND "status" = 'active'`,
      [userIdentityId],
    );
    if (platformRole.rowCount !== 1) {
      throw new Error(
        "Platform test identity is not an active Platform Owner.",
      );
    }
    await client.query("SELECT set_config('app.platform_owner', 'true', true)");

    const updated = await client.query(
      `UPDATE "feature_flags"
       SET "global_enabled" = false,
           "zayto_users_enabled" = $1,
           "updated_at" = CURRENT_TIMESTAMP
       WHERE "key" = 'staff_mfa' AND "status" = 'active'`,
      [enabled],
    );
    if (updated.rowCount !== 1)
      throw new Error("Staff MFA flag was not found.");

    await client.query(
      `INSERT INTO "audit_events" (
         "actor_user_identity_id", "action", "outcome", "target_type",
         "target_id", "request_id", "metadata"
       ) VALUES ($1::uuid, 'feature_flag.test_control', 'succeeded',
         'feature_flag', 'staff_mfa', $2, $3::jsonb)`,
      [
        userIdentityId,
        randomUUID(),
        JSON.stringify({ zaytoUsersEnabled: enabled }),
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function restoreSandboxName(firstName: string, lastName: string) {
  const authSubject = await authSubjectFor("platform.owner@zayto.local");
  const pool = new Pool({
    connectionString: databaseUrl(),
    ssl: databaseSsl(),
  });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.auth_subject', $1, true)", [
      authSubject,
    ]);
    const identity = await client.query<{ user_identity_id: string }>(
      `SELECT "user_identity_id"
       FROM "authentication_provider_links"
       WHERE "provider" = 'supabase' AND "provider_subject" = $1::uuid`,
      [authSubject],
    );
    const actorIdentityId = identity.rows[0]?.user_identity_id;
    if (!actorIdentityId)
      throw new Error("Platform test identity was not linked.");

    await client.query("SELECT set_config('app.user_identity_id', $1, true)", [
      actorIdentityId,
    ]);
    const platformRole = await client.query(
      `SELECT 1
       FROM "platform_role_assignments"
       WHERE "user_identity_id" = $1::uuid
         AND "role_code" = 'platform_owner'
         AND "status" = 'active'`,
      [actorIdentityId],
    );
    if (platformRole.rowCount !== 1) {
      throw new Error(
        "Platform test identity is not an active Platform Owner.",
      );
    }
    await client.query("SELECT set_config('app.platform_owner', 'true', true)");

    const restored = await client.query<{ id: string }>(
      `UPDATE "user_identities"
       SET "first_name" = $1, "last_name" = $2,
           "updated_at" = CURRENT_TIMESTAMP
       WHERE "primary_email" = 'owner@zayto.local'
       RETURNING "id"`,
      [firstName, lastName],
    );
    const targetId = restored.rows[0]?.id;
    if (!targetId) throw new Error("Sandbox Account Owner was not found.");

    await client.query(
      `INSERT INTO "audit_events" (
         "actor_user_identity_id", "action", "outcome", "target_type",
         "target_id", "request_id", "metadata"
       ) VALUES ($1::uuid, 'user_identity.name.test_restore',
         'succeeded', 'user_identity', $2, $3, $4::jsonb)`,
      [
        actorIdentityId,
        targetId,
        randomUUID(),
        JSON.stringify({
          restoredFirstName: firstName,
          restoredLastName: lastName,
        }),
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function signInAsSandboxUser(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Sandbox user").click();
  await page
    .getByRole("option")
    .filter({ hasText: `· ${email}` })
    .click();
  await page.getByRole("button", { name: "Sign in as selected user" }).click();
  await expect(page).not.toHaveURL(/\/login(?:[/?]|$)/, { timeout: 10_000 });
}

async function completeMfa(page: Page) {
  const secret = await page.getByTestId("totp-secret").textContent();
  if (!secret) throw new Error("TOTP secret was not shown.");

  await page.getByLabel("Six-digit code").fill(currentTotp(secret));
  await page.getByRole("button", { name: "Continue securely" }).click();
}

test.describe("sandbox access personas", () => {
  test.describe.configure({ mode: "serial" });

  for (const persona of PERSONAS) {
    test(`${persona.email} reaches only its authorised context`, async ({
      page,
    }) => {
      await signInAsSandboxUser(page, persona.email);
      await expect(page).toHaveURL(persona.expectedUrl);
      await expect(
        page.getByRole("heading", { name: persona.expectedHeading }),
      ).toBeVisible();

      if (persona.email === "owner@zayto.local") {
        const mainNavigation = page.getByRole("navigation", {
          name: "Main navigation",
        });
        await mainNavigation.getByRole("link", { name: "Settings" }).click();
        await expect(
          page.getByRole("heading", { name: "Settings" }),
        ).toBeVisible();

        const settingsNavigation = page.getByRole("navigation", {
          name: "Settings",
        });
        await expect(
          settingsNavigation.getByRole("link", { name: "Details" }),
        ).toHaveAttribute("aria-current", "page");
        await expect(page.getByText("Letting agency")).toBeVisible();
        await page
          .getByRole("button", { name: "Edit customer details" })
          .click();
        await expect(page.getByLabel("Customer name")).toHaveValue(
          "Oakfield Lettings",
        );
        await page.getByRole("button", { name: "Cancel" }).click();
        await page
          .getByRole("button", { name: "Edit contact details" })
          .click();
        await expect(page.getByLabel("Primary email")).toHaveValue(
          "hello@oakfield.test",
        );
        await page.getByRole("button", { name: "Cancel" }).click();

        await settingsNavigation
          .getByRole("link", { name: "Users & access" })
          .click();
        await expect(
          page.getByRole("heading", { name: "Users & access" }),
        ).toBeVisible();
        await expect(
          page
            .locator("[data-user-row]:visible")
            .filter({ hasText: "Olivia Hart" }),
        ).toBeVisible();
        await expect(
          page
            .locator("[data-user-row]:visible")
            .getByText(/^owner@zayto\.local/),
        ).toBeVisible();
        const ownerUserCard = page
          .locator("[data-user-row]:visible")
          .filter({ hasText: "Olivia Hart" });
        await expect(
          ownerUserCard.getByText("Active", { exact: true }),
        ).toHaveClass(/bg-success-soft/);
        const ownerBadgeRow = ownerUserCard;
        await expect(
          ownerBadgeRow.getByText("All branches", { exact: true }),
        ).toHaveClass(/bg-info-soft/);
        await expect(
          ownerBadgeRow.getByText("Account Owner", { exact: true }),
        ).toHaveClass(/bg-secondary/);
        const staffUserCard = page
          .locator("[data-user-row]:visible")
          .filter({ hasText: "Priya Shah" });
        await staffUserCard.getByRole("button", { name: "Edit" }).click();
        const accessDialog = page.getByRole("dialog");
        await expect(
          accessDialog.getByRole("heading", { name: "Edit Priya Shah" }),
        ).toBeVisible();
        await expect(
          accessDialog.getByRole("radio", { name: "Selected branches" }),
        ).toBeChecked();
        await expect(accessDialog.getByLabel("Main Branch")).toBeChecked();
        await expect(accessDialog.getByLabel("Riverside Branch")).toBeChecked();
        await accessDialog.getByRole("button", { name: "Cancel" }).click();
        await settingsNavigation
          .getByRole("link", { name: "Branches" })
          .click();
        const mainBranchCard = page.locator('[data-slot="card"]').filter({
          has: page.getByRole("heading", {
            name: "Main Branch",
            exact: true,
          }),
        });
        const riversideBranchCard = page.locator('[data-slot="card"]').filter({
          has: page.getByRole("heading", {
            name: "Riverside Branch",
            exact: true,
          }),
        });
        await expect(
          mainBranchCard.getByRole("heading", { name: "Main Branch" }),
        ).toBeVisible();
        await expect(
          mainBranchCard.getByText("Active branch", { exact: true }),
        ).toHaveClass(/bg-success-soft/);
        await expect(
          mainBranchCard.getByText("main@oakfield.test"),
        ).toBeVisible();
        await expect(mainBranchCard.getByText("020 7946 0998")).toBeVisible();
        await expect(
          mainBranchCard.getByRole("heading", { name: "Users with access" }),
        ).toBeVisible();
        await expect(
          mainBranchCard.getByText("Olivia Hart", { exact: true }),
        ).toBeVisible();
        await expect(
          mainBranchCard.getByText("All branches", { exact: true }).first(),
        ).toHaveClass(/bg-info-soft/);
        await expect(
          riversideBranchCard.getByRole("heading", {
            name: "Riverside Branch",
          }),
        ).toBeVisible();
        await expect(
          riversideBranchCard.getByText("Ruby Walker", { exact: true }),
        ).toBeVisible();
        await expect(
          mainBranchCard.getByText("Ruby Walker", { exact: true }),
        ).toHaveCount(0);
        await mainBranchCard
          .getByRole("button", { name: "Edit users" })
          .click();
        const branchUsersDialog = page.getByRole("dialog");
        await expect(
          branchUsersDialog.getByRole("heading", {
            name: "Edit branch users",
          }),
        ).toBeVisible();
        await expect(
          branchUsersDialog.getByText("Olivia Hart", { exact: true }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
      }

      if (persona.email === "branch.manager@zayto.local") {
        await page.goto(
          "/dashboard/w/oakfield-lettings-demo/settings/branches",
        );
        await expect(
          page.getByRole("heading", { name: "Main Branch", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", {
            name: "Riverside Branch",
            exact: true,
          }),
        ).toHaveCount(0);
        await expect(
          page.getByText("Amelia Stone", { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByText("Priya Shah", { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByText("Ruby Walker", { exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: "Edit users" }),
        ).toHaveCount(0);

        await page.goto("/dashboard/w/oakfield-lettings-demo/settings/users");
        await expect(
          page.getByRole("heading", { name: "Users & access" }),
        ).toBeVisible();
        await expect(
          page
            .locator("[data-user-row]:visible")
            .filter({ hasText: "Amelia Stone" }),
        ).toBeVisible();
        await expect(
          page
            .locator("[data-user-row]:visible")
            .filter({ hasText: "Priya Shah" }),
        ).toBeVisible();
        await expect(
          page.getByText("Ruby Walker", { exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: "Edit", exact: true }),
        ).toHaveCount(0);
      }

      if (persona.email === "platform.owner@zayto.local") {
        await page.goto("/platform/feature-flags");
        await expect(
          page.getByRole("heading", { name: "Feature flags" }),
        ).toBeVisible();
      }

      if (persona.email === "dual.owner@zayto.local") {
        await page.setViewportSize({ width: 390, height: 844 });
        const currentOrigin = new URL(page.url()).origin;
        await page
          .context()
          .addCookies([
            { name: "zayto-theme", value: "dark", url: currentOrigin },
          ]);
        await page.goto("/dashboard/w/oakfield-lettings-demo/settings/users");
        const accountOwnerCard = page
          .locator("[data-user-row]:visible")
          .filter({ hasText: "Olivia Hart" });
        await accountOwnerCard.getByRole("button", { name: "Edit" }).click();
        const roleDialog = page.getByRole("dialog");
        await expect(
          roleDialog.getByRole("heading", { name: "Edit Olivia Hart" }),
        ).toBeVisible();
        await expect(page.locator("html")).toHaveClass(/\bdark\b/);
        await expect(
          roleDialog.getByRole("radio", { name: "All branches" }),
        ).toBeChecked();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        await roleDialog.getByRole("button", { name: /Account Owner/ }).click();
        await expect(
          page.getByRole("checkbox", { name: /Account Owner/ }),
        ).toBeChecked();
        await page.keyboard.press("Escape");
        await roleDialog.getByRole("button", { name: "Cancel" }).click();
      }

      if (persona.deniedUrl) {
        await page.goto(persona.deniedUrl);
        await expect(page).toHaveURL(/\/access-denied$/);
        await expect(
          page.getByRole("heading", { name: "Access denied" }),
        ).toBeVisible();
      }
    });
  }

  test("Platform Owner can browse the user and customer directories", async ({
    page,
  }) => {
    await signInAsSandboxUser(page, "platform.owner@zayto.local");

    await page.goto("/platform/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Olivia Hart", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Theo Grant", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Maya Ellis", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Noah Reed", exact: true }),
    ).toBeVisible();

    await page.getByLabel("Search users").fill("Olivia");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/\/platform\/users\?q=Olivia$/);
    await expect(
      page.getByRole("cell", { name: "Olivia Hart", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Theo Grant")).toHaveCount(0);

    await page.getByRole("button", { name: "View Olivia Hart" }).click();
    const userDialog = page.getByRole("dialog");
    await expect(
      userDialog.getByRole("heading", { name: "Olivia Hart" }),
    ).toBeVisible();
    await expect(userDialog.getByText("owner@zayto.local")).toBeVisible();
    await expect(
      userDialog.getByRole("heading", { name: "Zayto account" }),
    ).toBeVisible();
    const nameDetail = userDialog
      .getByText("Name", { exact: true })
      .locator("..");
    await expect(
      nameDetail.getByText("Olivia Hart", { exact: true }),
    ).toBeVisible();
    await userDialog.getByRole("button", { name: "Edit" }).click();
    await expect(userDialog.getByLabel("First name")).toHaveValue("Olivia");
    await expect(userDialog.getByLabel("Last name")).toHaveValue("Hart");
    await userDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(
      userDialog.getByRole("button", { name: "Edit" }),
    ).toBeVisible();
    await expect(userDialog.getByText("Oakfield Lettings")).toBeVisible();
    await expect(userDialog.getByText("Active access")).toBeVisible();
    await expect(userDialog.getByText("Account Owner")).toBeVisible();
    await userDialog.getByRole("button", { name: "Close" }).click();

    await page.goto("/platform/customers");
    await expect(
      page.getByRole("heading", { name: "Customers" }),
    ).toBeVisible();
    await page.getByLabel("Search customers").fill("Oakfield");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/\/platform\/customers\?q=Oakfield$/);
    await page
      .locator("table")
      .getByRole("link", { name: "Oakfield Lettings" })
      .click();

    await expect(
      page.getByRole("heading", { name: "Oakfield Lettings" }),
    ).toBeVisible();
    await expect(
      page.getByText("Oakfield Lettings Limited (Demo)"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Edit customer details" }).click();
    await expect(page.getByLabel("Customer name")).toHaveValue(
      "Oakfield Lettings",
    );
    await expect(page.getByLabel("Legal name")).toHaveValue(
      "Oakfield Lettings Limited (Demo)",
    );
    await page.getByRole("button", { name: "Cancel" }).click();

    const customerNavigation = page.getByRole("navigation", {
      name: "Customer profile",
    });
    await customerNavigation.getByRole("link", { name: "Users" }).click();
    await expect(
      page.getByRole("cell", { name: "Olivia Hart", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "owner@zayto.local", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "All branches", exact: true }).first(),
    ).toBeVisible();
    const customerUsersTable = page.locator("table");
    const priyaUserRow = customerUsersTable
      .getByRole("row")
      .filter({ hasText: "Priya Shah" });
    await expect(
      priyaUserRow.getByText("Main Branch", { exact: true }),
    ).toHaveAttribute("data-variant", "outline");
    await expect(
      priyaUserRow.getByText("Riverside Branch", { exact: true }),
    ).toHaveAttribute("data-variant", "outline");
    const suspendedUserRow = customerUsersTable
      .getByRole("row")
      .filter({ hasText: "Jordan Reed" });
    await expect(
      suspendedUserRow.getByText("Suspended", { exact: true }),
    ).toHaveClass(/bg-warning-soft/);

    await page.setViewportSize({ width: 390, height: 844 });
    const currentOrigin = new URL(page.url()).origin;
    await page
      .context()
      .addCookies([{ name: "zayto-theme", value: "dark", url: currentOrigin }]);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expect(page.locator("table")).toBeHidden();
    await expect(
      page.getByText("Olivia Hart", { exact: true }).first(),
    ).toBeVisible();
    const mobileOwnerCard = page
      .locator('[data-slot="card"]:visible')
      .filter({ hasText: "Olivia Hart" });
    await expect(
      mobileOwnerCard.getByText("Active", { exact: true }),
    ).toHaveClass(/bg-success-soft/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    await page.setViewportSize({ width: 1280, height: 720 });
    await customerNavigation.getByRole("link", { name: "Branches" }).click();
    const branchTable = page.locator("table");
    const mainBranchRow = branchTable
      .getByRole("row")
      .filter({ hasText: "main@oakfield.test" });
    const riversideBranchRow = branchTable
      .getByRole("row")
      .filter({ hasText: "riverside@oakfield.test" });
    await expect(
      mainBranchRow.getByRole("cell", { name: "Main Branch", exact: true }),
    ).toBeVisible();
    await expect(
      mainBranchRow.getByRole("cell", {
        name: "main@oakfield.test",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Users with access" }).last(),
    ).toBeVisible();
    await expect(
      page.getByText("Olivia Hart", { exact: true }).last(),
    ).toBeVisible();
    await expect(
      page.getByText("All branches", { exact: true }).last(),
    ).toBeVisible();
    await expect(
      mainBranchRow.getByText("Priya Shah", { exact: true }),
    ).toBeVisible();
    await expect(
      mainBranchRow.getByText("Ruby Walker", { exact: true }),
    ).toHaveCount(0);
    await expect(
      riversideBranchRow.getByText("Priya Shah", { exact: true }),
    ).toBeVisible();
    await expect(
      riversideBranchRow.getByText("Ruby Walker", { exact: true }),
    ).toBeVisible();

    await customerNavigation
      .getByRole("link", { name: "Feature flags" })
      .click();
    await expect(
      page.getByText("Staff two-step verification", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("radio", { name: /Inherit global setting/i }),
    ).toBeChecked();
    await expect(page.getByText(/^Inherited · global (on|off)$/)).toHaveClass(
      /bg-info-soft/,
    );
  });

  test("Platform Owner can update and restore a sandbox user name", async ({
    page,
  }) => {
    test.skip(
      !RUN_PLATFORM_USER_MUTATION_E2E,
      "Requires explicit approval because it changes shared sandbox user data.",
    );

    const originalFirstName = "Olivia";
    const originalLastName = "Hart";
    const originalName = `${originalFirstName} ${originalLastName}`;
    const editedFirstName = "Olivia-Test";
    const editedName = `${editedFirstName} ${originalLastName}`;

    await signInAsSandboxUser(page, "platform.owner@zayto.local");
    try {
      await page.goto("/platform/users?q=Olivia");
      await page.getByRole("button", { name: `View ${originalName}` }).click();

      const userDialog = page.getByRole("dialog");
      await userDialog.getByRole("button", { name: "Edit" }).click();
      await userDialog.getByLabel("First name").fill(editedFirstName);
      await userDialog.getByLabel("Last name").fill(originalLastName);
      await userDialog.getByRole("button", { name: "Save name" }).click();

      await expect(
        userDialog.getByRole("status").filter({ hasText: "Name saved." }),
      ).toHaveText("Name saved.");
      await expect(
        userDialog.getByRole("heading", { name: editedName }),
      ).toBeVisible();
      const nameDetail = userDialog
        .getByText("Name", { exact: true })
        .locator("..");
      await expect(
        nameDetail.getByText(editedName, { exact: true }),
      ).toBeVisible();
      await expect(
        userDialog.getByRole("button", { name: "Edit" }),
      ).toBeVisible();
    } finally {
      await restoreSandboxName(originalFirstName, originalLastName);
    }
  });

  test("the Zayto testing audience can require MFA independently", async ({
    page,
  }) => {
    test.skip(
      !RUN_AUTH_MUTATION_E2E,
      "Requires explicit approval because it changes shared sandbox Auth factors and feature flags.",
    );
    await deleteTestFactors("platform.owner@zayto.local");
    await setZaytoMfaAudience(true);
    try {
      await signInAsSandboxUser(page, "platform.owner@zayto.local");
      await expect(page).toHaveURL(/\/mfa\?next=/);
      await expect(
        page.getByRole("heading", { name: "Two-step verification" }),
      ).toBeVisible();
      await completeMfa(page);
      await expect(page).toHaveURL(/\/platform$/);
      await expect(
        page.getByRole("heading", { name: "Platform overview" }),
      ).toBeVisible();

      await page.goto("/platform/feature-flags");
      const zaytoAudience = page.getByRole("checkbox", {
        name: /Zayto users/i,
      });
      await expect(zaytoAudience).toBeChecked();
      await zaytoAudience.uncheck();
      await page.getByRole("button", { name: "Save audiences" }).click();
      await expect(page.getByRole("status")).toHaveText(
        "Feature flag settings saved.",
      );
    } finally {
      await setZaytoMfaAudience(false);
      await deleteTestFactors("platform.owner@zayto.local");
    }
  });
});

test("session cookies cannot be read by page scripts", async ({
  page,
  context,
}) => {
  await signInAsSandboxUser(page, "owner@zayto.local");

  const sessionCookies = (await context.cookies()).filter(({ name }) =>
    name.startsWith("sb-"),
  );
  const readableSessionCookies = sessionCookies
    .filter(({ httpOnly }) => !httpOnly)
    .map(({ name }) => name);

  expect(sessionCookies.length).toBeGreaterThan(0);
  expect(readableSessionCookies).toEqual([]);
  expect(await page.evaluate(() => document.cookie)).not.toContain("sb-");
});
