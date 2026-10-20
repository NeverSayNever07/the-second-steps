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

test("properties list is reachable from the navigation", async ({ page }) => {
  await signInAsOwner(page);
  await page.getByRole("link", { name: "Properties" }).click();
  await expect(
    page.getByRole("heading", { name: "Properties", exact: true }),
  ).toBeVisible();
  const search = page.getByLabel("Search properties");
  await expect(search).toBeVisible();
  await search.fill("zzqxj");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("No properties found")).toBeVisible();
  expect(page.url()).not.toContain("zzqxj");
  await page.getByLabel("Status").click();
  await page.getByRole("option", { name: "Archived", exact: true }).click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page).toHaveURL(/state=archived/);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/properties$/);
  await expect(page.getByLabel("Search properties")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "New property" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/properties-list-desktop.png",
    fullPage: true,
  });
});

test("new property form shows every section and finds owners without saving", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto(`${WORKSPACE}/properties/new`);
  await expect(
    page.getByRole("heading", { name: "New property" }),
  ).toBeVisible();
  for (const heading of [
    "Address",
    "Property details",
    "Features",
    "Responsible branch",
    "Owners",
    "Notes",
  ]) {
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  }
  await page
    .getByLabel("Street", { exact: true })
    .fill("10 Browser Test Street");
  await page.getByLabel("Town or city", { exact: true }).fill("London");
  await page.getByLabel("Postcode", { exact: true }).fill("sw1a1aa");

  const branch = page.getByLabel("Branch", { exact: true });
  await branch.click();
  await page.getByRole("option").first().click();

  await page.getByLabel("Find an existing contact").fill("Eleanor");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: "Add as owner" }).first().click();
  await expect(page.getByLabel("Lead landlord")).toBeChecked();

  await page.getByRole("button", { name: "Add a new contact" }).click();
  await expect(
    page.getByRole("heading", { name: "Add a new owner" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "Add a new owner" }),
  ).toBeHidden();

  await page.screenshot({
    path: "test-results/property-new-desktop.png",
    fullPage: true,
  });
});

test("new property form is usable on mobile and in dark mode", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsOwner(page);
  await page.goto(`${WORKSPACE}/properties/new`);
  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(
    page.getByRole("button", { name: "Create property" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({
    path: "test-results/property-new-mobile-dark.png",
    fullPage: true,
  });
});

test("contact record has a Properties section", async ({ page }) => {
  await signInAsOwner(page);
  await page.getByRole("link", { name: "Contacts" }).click();
  await page.getByRole("link", { name: "Eleanor Price" }).click();
  await expect(
    page.getByRole("heading", { name: "Properties", exact: true }),
  ).toBeVisible();
});
