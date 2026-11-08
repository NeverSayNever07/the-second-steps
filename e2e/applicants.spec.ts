import { expect, test, type Page } from "@playwright/test";

const WORKSPACE = "/dashboard/w/oakfield-lettings-demo";

test.describe.configure({ mode: "serial" });

async function signInAsOwner(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Sandbox user").click();
  await page.getByRole("option").filter({ hasText: "Olivia Hart" }).click();
  await page.getByRole("button", { name: "Sign in as selected user" }).click();
  await expect(page).toHaveURL(new RegExp(`${WORKSPACE}$`), {
    timeout: 30_000,
  });
}

// These only look: applicants are permanent history in the shared test data, so
// creating and changing one is checked in the application tests.

test("Applicants is under Contacts in the menu and shows the list with its filters", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.getByRole("button", { name: "Contacts" }).click();
  await page.getByRole("link", { name: "Applicants", exact: true }).click();
  await expect(page).toHaveURL(/\/applicants$/);
  await expect(
    page.getByRole("heading", { name: "Applicants", level: 1 }),
  ).toBeVisible();
  await expect(page.getByLabel("Status")).toBeVisible();
  await expect(page.getByLabel("Branch")).toBeVisible();
  await expect(page.getByLabel("Search applicants")).toBeVisible();
  await page.screenshot({
    path: "test-results/applicants-list.png",
    fullPage: true,
  });
});

test("an applicant that does not exist shows the not-found screen", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto(
    `${WORKSPACE}/applicants/00000000-0000-4000-8000-000000000000`,
  );
  await expect(page.getByText("Applicant not found")).toBeVisible();
});

test("the Applicants list fits a phone in dark mode", async ({ page }) => {
  await signInAsOwner(page);
  await page.getByRole("button", { name: "Dark theme" }).click();
  await page.goto(`${WORKSPACE}/applicants`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Applicants", level: 1 }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
