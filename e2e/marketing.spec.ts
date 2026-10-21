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

// These only look: listings are permanent history in the shared test data, so
// creating and changing one is checked by hand and in the database tests.

test("Marketing is in the menu and lists listings with a not-published note", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.getByRole("link", { name: "Marketing", exact: true }).click();
  await expect(page).toHaveURL(/\/marketing$/);
  await expect(
    page.getByRole("heading", { name: "Listings", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("note")).toContainText("Not published");
  const stages = page.getByRole("navigation", { name: "Listing stage" });
  for (const name of [
    "All current",
    "Draft",
    "Content ready",
    "Ready to advertise",
    "Withdrawn",
  ]) {
    await expect(stages.getByText(name, { exact: true })).toBeVisible();
  }
  await page.goto(`${WORKSPACE}/marketing?state=withdrawn`);
  await expect(
    page.getByRole("heading", { name: "Listings", level: 1 }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/marketing-worklist.png",
    fullPage: true,
  });
});

test("a Ready to market instruction offers to prepare a listing, and says nothing is published", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto(`${WORKSPACE}/instructions`);
  await page
    .locator("tr", { hasText: "INS-WP32T6JU" })
    .getByRole("link")
    .first()
    .click();
  await expect(
    page.getByText("Nothing is published", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Create listing (soon)")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Prepare listing|Open listing/ }),
  ).toBeVisible();
});

test("the Marketing worklist fits a phone in dark mode", async ({ page }) => {
  await signInAsOwner(page);
  await page.getByRole("button", { name: "Dark theme" }).click();
  await page.goto(`${WORKSPACE}/marketing`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Listings", level: 1 }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
