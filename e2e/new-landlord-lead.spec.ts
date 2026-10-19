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

/** The "property to let" section, so its fields are never confused with the landlord's own address. */
const propertySection = (page: Page) =>
  page.locator("section").filter({
    has: page.getByRole("heading", { name: "The property to let" }),
  });

async function openNewLead(page: Page) {
  await page.goto(`${WORKSPACE}/enquiries/new`);
  await expect(
    page.getByRole("heading", { name: "New landlord lead", level: 1 }),
  ).toBeVisible();
}

test("one page asks for the landlord, the property to let, the lead details and what happens next", async ({
  page,
}) => {
  await signInAsOwner(page);
  await openNewLead(page);
  for (const heading of [
    "Landlord",
    "The property to let",
    "Lead details",
    "What happens next",
  ]) {
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  }
  // It is clear which address is which.
  await expect(
    page.getByText("The rental property, not the landlord's own home."),
  ).toBeVisible();
  await expect(
    page.getByText("Landlord's own address (optional)"),
  ).toBeVisible();
  // The full property record is collected here, not later.
  for (const label of [
    /^Town or city/,
    /^County/,
    /^Bedrooms/,
    /^Bathrooms/,
    /^Receptions/,
  ]) {
    await expect(propertySection(page).getByLabel(label)).toBeVisible();
  }
  // What happens next changes the fields and the button.
  await expect(
    page.getByRole("button", { name: "Create lead and book appraisal" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Date and time" }),
  ).toBeVisible();
  await page.getByLabel("Set a next action").check();
  await expect(page.getByLabel("What needs doing?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create lead" })).toBeVisible();
  await page.getByLabel("Save the lead for now").check();
  await expect(page.getByRole("button", { name: "Save lead" })).toBeVisible();
});

test("an incomplete form says what is missing and keeps what was typed", async ({
  page,
}) => {
  await signInAsOwner(page);
  await openNewLead(page);
  await page.getByLabel("First name").fill("Test");
  await page.getByLabel("Bedrooms").fill("4");
  await page
    .getByRole("button", { name: "Create lead and book appraisal" })
    .click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page.getByText("Enter a surname.")).toBeVisible();
  await expect(page.getByText("Enter the street.")).toBeVisible();
  await expect(
    page.getByText("Choose the date and time of the appraisal."),
  ).toBeVisible();
  // Nothing typed was cleared by the refused save.
  await expect(page.getByLabel("First name")).toHaveValue("Test");
  await expect(page.getByLabel("Bedrooms")).toHaveValue("4");
});

test("a possible duplicate opens a pop-up, and closing it loses nothing", async ({
  page,
}) => {
  await signInAsOwner(page);
  await openNewLead(page);
  await page.getByLabel("First name").fill("Duplicate");
  await page.getByLabel("Last name").fill("Check");
  await page.getByLabel("Email").fill("duplicate.check@example.test");
  await page.getByLabel("Responsible branch").click();
  await page.getByRole("option").first().click();
  // An address that matches an existing demo property.
  const property = propertySection(page);
  await property.getByLabel(/^Flat or building/).fill("61");
  await property.getByLabel(/^Street/).fill("Canal Street");
  await property.getByLabel(/^Town or city/).fill("Manchester");
  await property.getByLabel(/^County/).fill("Greater Manchester");
  await property.getByLabel(/^Postcode/).fill("M1 3HE");
  await page.getByRole("combobox", { name: /Property type/ }).click();
  await page.getByRole("option", { name: "Flat", exact: true }).click();
  await page.getByLabel("Bedrooms").fill("3");
  await page.getByLabel("Save the lead for now").check();

  await page.getByRole("button", { name: "Save lead" }).click();
  const review = page.getByRole("dialog", { name: "Possible matches" });
  await expect(review).toBeVisible({ timeout: 20_000 });
  await expect(review.getByText("Create a new property")).toBeVisible();
  await review.getByRole("button", { name: "Back to the details" }).click();
  await expect(review).toBeHidden();
  await expect(page.getByLabel("First name")).toHaveValue("Duplicate");
  await expect(property.getByLabel(/^County/)).toHaveValue(
    "Greater Manchester",
  );
  await expect(page.getByLabel("Bedrooms")).toHaveValue("3");
  // Still on the form: nothing was saved.
  await expect(
    page.getByRole("heading", { name: "New landlord lead", level: 1 }),
  ).toBeVisible();
});

test("the date and time are picked from a calendar", async ({ page }) => {
  await signInAsOwner(page);
  await openNewLead(page);
  await page.getByRole("button", { name: "Date and time" }).click();
  await page
    .locator('[role="gridcell"]')
    .filter({ hasText: /^20$/ })
    .getByRole("button")
    .click();
  await page.getByRole("option", { name: "14:30", exact: true }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.locator("#scheduledAt")).toContainText("14:30");
});

test("the form fits a phone in dark mode", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsOwner(page);
  await page.getByRole("button", { name: "Dark theme" }).click();
  await openNewLead(page);
  await page.getByText("Landlord's own address (optional)").click();
  await expect(page.getByLabel("Address line 1")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
