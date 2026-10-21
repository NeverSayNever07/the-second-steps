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

/**
 * Opens the first property in the list. These tests only look and cancel or
 * submit invalid input: compliance history is permanent in the shared test
 * data, so nothing here records anything. Recording real evidence is checked
 * by hand.
 */
async function openFirstProperty(page: Page) {
  await page.goto(`${WORKSPACE}/properties`);
  const link = page
    .locator('a[href*="/properties/"]')
    .filter({ hasNotText: "New property" })
    .locator("visible=true")
    .first();
  await expect(link).toBeVisible();
  await link.click();
  await page.getByRole("link", { name: "Compliance" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Compliance", level: 2 }),
  ).toBeVisible();
}

const AREAS = [
  "EPC and minimum energy efficiency",
  "Gas safety record (CP12)",
  "Electrical safety (EICR)",
  "Smoke and carbon monoxide alarms",
  "Property licensing",
];

test("a property lists its five compliance areas", async ({ page }) => {
  await signInAsOwner(page);
  await openFirstProperty(page);
  for (const area of AREAS) {
    await expect(
      page.getByRole("heading", { name: area, level: 3 }),
    ).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Update" })).toHaveCount(5);
  await page
    .getByRole("heading", { name: "Compliance", level: 2 })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/property-compliance-desktop.png",
    fullPage: true,
  });
});

test("the update dialog refuses incomplete input without saving anything", async ({
  page,
}) => {
  await signInAsOwner(page);
  await openFirstProperty(page);

  // Gas safety is the second area.
  await page.getByRole("button", { name: "Update" }).nth(1).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("What do you want to record?")).toBeVisible();

  // Does not apply needs a reason.
  await dialog.getByLabel("Does this apply to the property?").click();
  await page.getByRole("option", { name: "Does not apply" }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("Give a reason.")).toBeVisible();

  // Evidence for gas safety needs a file, and then a date.
  await dialog.getByLabel("What do you want to record?").click();
  await page.getByRole("option", { name: "Add evidence" }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Choose the file this evidence comes from.",
  );
  await dialog.getByLabel("File").setInputFiles({
    name: "fictional-gas-record.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\n%%EOF\n"),
  });
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("Enter a valid date.").first()).toBeVisible();

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
});

test("the compliance section fits a phone in dark mode", async ({ page }) => {
  await signInAsOwner(page);
  await page.getByRole("button", { name: "Dark theme" }).click();
  await openFirstProperty(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Update" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({
    path: "test-results/property-compliance-phone-dark.png",
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
