import { expect, test, type Page } from "@playwright/test";

const WORKSPACE = "/dashboard/w/oakfield-lettings-demo";

async function signInAsOwner(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Sandbox user").click();
  await page.getByRole("option").filter({ hasText: "Olivia Hart" }).click();
  await page.getByRole("button", { name: "Sign in as selected user" }).click();
  await expect(page).toHaveURL(new RegExp(`${WORKSPACE}$`), {
    timeout: 10_000,
  });
}

test("the top-bar search finds a contact and opens its record", async ({
  page,
}) => {
  await signInAsOwner(page);
  const search = page.getByLabel("Search the workspace");
  await search.fill("E");
  await expect(
    page.getByRole("region", { name: "Search results" }),
  ).toHaveCount(0);
  const results = page.getByRole("region", { name: "Search results" });
  await expect(async () => {
    await search.fill("Eleanor");
    await expect(results.getByText("Contacts and landlords")).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 15_000 });
  expect(page.url()).not.toContain("Eleanor");
  await results.getByRole("link", { name: /Eleanor Price/ }).click();
  await expect(
    page.getByRole("heading", { name: /Eleanor Price/ }),
  ).toBeVisible();
  await expect(search).toHaveValue("");
});

test("the top-bar search finds a property by postcode and reports no matches", async ({
  page,
}) => {
  await signInAsOwner(page);
  const search = page.getByLabel("Search the workspace");
  const results = page.getByRole("region", { name: "Search results" });
  // Typing before the page has finished loading its interactive code is lost,
  // so the first search is retried until it takes.
  await expect(async () => {
    await search.fill("OX4 2HF");
    await expect(results.getByText("5 Orchard Close")).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 15_000 });
  await search.fill("zzqxj");
  await expect(results.getByText("No matches for this search.")).toBeVisible();
});

test("the search works on a phone in dark mode", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await signInAsOwner(page);
  await expect(page.getByLabel("Search the workspace")).toBeHidden();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByLabel("Search the workspace").fill("Eleanor");
  const results = page.getByRole("region", { name: "Search results" });
  await expect(
    results.getByRole("link", { name: /Eleanor Price/ }),
  ).toBeVisible();
  const box = await results.boundingBox();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({
    path: "test-results/workspace-search-phone-dark.png",
  });
});
