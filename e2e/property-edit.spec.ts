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

async function openFirstPropertyEdit(page: Page) {
  await page.goto(`${WORKSPACE}/properties`);
  const link = page
    .locator('a[href*="/properties/"]')
    .filter({ hasNotText: "New property" })
    .locator("visible=true")
    .first();
  await expect(link).toBeVisible();
  await link.click();
  await page.getByText("Edit property").click();
  await expect(page).toHaveURL(/\/edit$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Edit ");
}

test("Edit property opens pre-filled, without the branch and owners", async ({
  page,
}) => {
  await signInAsOwner(page);
  await openFirstPropertyEdit(page);
  await expect(page.getByLabel("Street", { exact: true })).not.toHaveValue("");
  await expect(page.getByLabel("Postcode", { exact: true })).not.toHaveValue(
    "",
  );
  await expect(
    page.getByRole("heading", { name: "Responsible branch" }),
  ).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Owners" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/property-edit-desktop.png",
    fullPage: true,
  });

  // A blank street is refused and nothing is saved.
  await page.getByLabel("Street", { exact: true }).fill("");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/edit$/);

  await page.getByText("Cancel", { exact: true }).click();
  await expect(page).not.toHaveURL(/\/edit$/);
});

test("a change is saved and shown on the property, then put back", async ({
  page,
}) => {
  await signInAsOwner(page);
  await openFirstPropertyEdit(page);
  await page
    .getByLabel("Internal summary (optional)")
    .fill("Browser test edit");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).not.toHaveURL(/\/edit$/);
  await expect(page.getByText("Browser test edit")).toBeVisible();

  // Put it back, so the shared test data is unchanged.
  await page.getByText("Edit property").click();
  await page.getByLabel("Internal summary (optional)").fill("");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).not.toHaveURL(/\/edit$/);
  await expect(page.getByText("Browser test edit")).toHaveCount(0);
});

test("Edit property fits a phone in dark mode", async ({ page }) => {
  await signInAsOwner(page);
  await page.getByRole("button", { name: "Dark theme" }).click();
  await openFirstPropertyEdit(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Street", { exact: true })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
