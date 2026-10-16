import { expect, test, type Page } from "@playwright/test";

const WORKSPACE = "/dashboard/w/oakfield-lettings-demo";

test.describe.configure({ mode: "serial" });

async function signInAsOwner(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Sandbox user").click();
  await page.getByRole("option").filter({ hasText: "Olivia Hart" }).click();
  await page.getByRole("button", { name: "Sign in as selected user" }).click();
  await expect(page).toHaveURL(new RegExp(`${WORKSPACE}$`), {
    timeout: 10_000,
  });
}

test("an action can be added, snoozed and finished from the Overview", async ({
  page,
}) => {
  await signInAsOwner(page);
  const title = `E2E check ${Date.now()}`;
  const row = page.getByRole("listitem").filter({ hasText: title });

  await expect(page.getByRole("heading", { name: "Actions" })).toBeVisible();
  await page.getByRole("button", { name: "Add action" }).click();
  await page.getByLabel("What needs doing?").fill(title);
  await page.getByRole("button", { name: "Add action" }).last().click();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row.getByText("Today", { exact: true })).toBeVisible();

  await row.getByRole("button", { name: /More actions/ }).click();
  await page.getByRole("button", { name: "Snooze…" }).click();
  await page.getByRole("button", { name: "Tomorrow" }).click();
  await expect(row.getByText("Tomorrow", { exact: true })).toBeVisible({
    timeout: 10_000,
  });

  await row.getByRole("button", { name: /^Finish / }).click();
  await expect(
    page.getByRole("heading", { name: "What happens next?" }),
  ).toBeVisible();
  await page.getByLabel("Nothing more to do").check();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(row).toHaveCount(0, { timeout: 10_000 });
});

test("the Overview actions list fits a phone in dark mode", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsOwner(page);
  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("heading", { name: "Actions" })).toBeVisible();
  await page.getByRole("button", { name: "Add action" }).click();
  await expect(
    page.getByRole("heading", { name: "Add an action" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
