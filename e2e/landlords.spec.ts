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
  await page.getByRole("button", { name: "Contacts" }).click();
  await page.getByRole("link", { name: "Landlords", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Landlords" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.getByLabel("Search landlords").fill("Ingrid Larsen");
  await page
    .locator("main")
    .getByRole("button", { name: "Search", exact: true })
    .click();
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
  await expect(
    page.getByRole("heading", { name: "Landlord leads", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Instructions", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("INS-WP32T6JU", { exact: false })).toBeVisible();
  const propertiesWithUs = page
    .getByText("Properties with us", { exact: true })
    .locator("..");
  await expect(propertiesWithUs.getByText("1", { exact: true })).toBeVisible();

  await page.locator('main a[href*="/properties/"]:visible').first().click();
  await expect(
    page.getByRole("heading", { name: "Landlord leads", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(0);
});

test("the add landlord picker searches contacts on the server", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.getByRole("button", { name: "Contacts" }).click();
  await page.getByRole("link", { name: "Landlords", exact: true }).click();
  await page.getByLabel("Search landlords").fill("Ingrid Larsen");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .locator("main a:visible")
    .filter({ hasText: "Ingrid Larsen" })
    .click();
  await page.locator('main a[href*="/instructions/"]:visible').first().click();

  await page.getByRole("button", { name: "Add landlord" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a landlord" });
  await dialog.getByLabel("Find a contact").fill("Ingrid Larsen");
  await dialog.getByLabel("Find a contact").press("Enter");
  await expect(dialog.getByText("Already on this instruction")).toBeVisible();

  await dialog.getByLabel("Find a contact").fill("zz-no-such-contact");
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await expect(dialog.getByText("No matching active contacts")).toBeVisible();

  await dialog.getByLabel("Find a contact").fill("");
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  const choose = dialog.getByRole("button", { name: /^Choose / }).first();
  await expect(choose).toBeVisible();
  await choose.click();
  await expect(dialog.getByRole("button", { name: "Change" })).toBeVisible();
  await expect(dialog.locator('input[name="contactId"]')).not.toHaveValue("");
});
