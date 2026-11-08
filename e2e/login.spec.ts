import { expect, test } from "@playwright/test";

test("the home page redirects to login", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page).toHaveTitle("Login | Zayto");
});

test("login form offers development-only sandbox personas", async ({
  page,
}) => {
  const response = await page.goto("/login");
  await expect(page).toHaveTitle("Login | Zayto");

  const headers = response?.headers() ?? {};
  expect(headers["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["x-powered-by"]).toBeUndefined();

  const sandboxUser = page.getByLabel("Sandbox user");
  await expect(sandboxUser).toBeVisible();
  await sandboxUser.click();
  await expect(
    page.getByRole("option").filter({ hasText: "· owner@zayto.local" }),
  ).toContainText("Account Owner");
  await expect(
    page
      .getByRole("option")
      .filter({ hasText: "· branch.manager@zayto.local" }),
  ).toContainText("Branch Manager");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Sign in as selected user" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Continue with Google (coming next)" }),
  ).toBeDisabled();
  await expect(page.getByText(/Development sandbox only/)).toBeVisible();
});

test("keyboard users see a blue focus outline on the persona dropdown", async ({
  page,
}) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  const sandboxUser = page.getByLabel("Sandbox user");
  const submit = page.getByRole("button", { name: "Sign in as selected user" });

  await submit.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(sandboxUser).toBeFocused();
  await expect(sandboxUser).toHaveCSS("border-color", "rgb(27, 79, 179)");
});
