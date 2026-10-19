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

test("landlords can be searched privately and opened on mobile", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.getByRole("link", { name: "Landlords", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Landlords" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.getByLabel("Search landlords").fill("Ingrid Larsen");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.locator("main a:visible").filter({ hasText: "Ingrid Larsen" }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/(?:\?|&)query=/);
  await expect(page).not.toHaveURL(/Ingrid(?:%20|\+)Larsen/);

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(0);

  await page
    .locator("main a:visible")
    .filter({ hasText: "Ingrid Larsen" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ingrid Larsen", exact: true }),
  ).toBeVisible();
  const propertiesWithUs = page
    .getByText("Properties with us", { exact: true })
    .locator("..");
  await expect(propertiesWithUs.getByText("1", { exact: true })).toBeVisible();
});
