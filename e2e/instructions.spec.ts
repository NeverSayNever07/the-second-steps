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
 * Opens the fictional "Test Fixture Landlord" lead, which is kept at
 * appraisal completed for these tests. They only look at it and cancel:
 * confirming Start instruction on it would use it up for good.
 */
async function openCompletedLead(page: Page) {
  await page.goto(`${WORKSPACE}/enquiries?stage=appraisal_completed`);
  // A table row from tablet width, a stacked card on a phone: either way, the
  // visible link to the lead.
  const lead = page
    .locator("a", { hasText: "Test Fixture Landlord" })
    .locator("visible=true")
    .first();
  await expect(lead).toBeVisible();
  await lead.click();
  await expect(
    page.getByRole("button", { name: "Start instruction" }),
  ).toBeVisible();
}

test("a lead with a completed appraisal offers Start instruction instead of a Won outcome", async ({
  page,
}) => {
  await signInAsOwner(page);
  await openCompletedLead(page);
  await page.getByRole("button", { name: "Close landlord lead" }).click();
  await page.getByRole("combobox", { name: "Outcome" }).click();
  await expect(page.getByRole("option", { name: "Lost" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Postponed" })).toBeVisible();
  await expect(page.getByRole("option", { name: /won/i })).toHaveCount(0);
});

test("the Start instruction review is pre-filled, changes nothing until confirmed, and fits a phone in dark mode", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsOwner(page);
  await page.getByRole("button", { name: "Dark theme" }).click();
  await openCompletedLead(page);
  const leadUrl = page.url();
  await page.getByRole("button", { name: "Start instruction" }).click();
  await expect(
    page.getByRole("heading", { name: "Start instruction", level: 1 }),
  ).toBeVisible();
  for (const heading of [
    "Landlords",
    "Instruction details",
    "Terms",
    "Service and rent",
    "Agency fee",
    "Deposit offered",
  ]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  // The lead's landlord is ticked and is the main contact by default.
  const landlords = page.getByRole("checkbox");
  await expect(landlords.first()).toBeChecked();
  await expect(page.getByRole("radio").first()).toBeChecked();
  await expect(page.getByLabel("Instruction date")).toHaveValue(
    /^\d{4}-\d{2}-\d{2}$/,
  );
  await expect(
    page.getByRole("button", { name: "Confirm and start instruction" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // Leaving changes nothing: the lead is still awaiting its decision.
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(leadUrl);
  await expect(
    page.getByRole("button", { name: "Start instruction" }),
  ).toBeVisible();
});

test("the form refuses to start without a main contact or a service, and says why", async ({
  page,
}) => {
  await signInAsOwner(page);
  await openCompletedLead(page);
  await page.getByRole("button", { name: "Start instruction" }).click();
  // Typed text must survive a refused save.
  await page.getByLabel("Agreed asking rent").fill("1234");
  await page.getByRole("checkbox").first().uncheck();
  await page
    .getByRole("button", { name: "Confirm and start instruction" })
    .click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page.getByText("Choose at least one landlord.")).toBeVisible();
  await expect(page.getByLabel("Agreed asking rent")).toHaveValue("1234");
  // Still on the review page: nothing was saved.
  await expect(
    page.getByRole("heading", { name: "Start instruction", level: 1 }),
  ).toBeVisible();
});

test("a property page lists its instructions and an empty state when there are none", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto(`${WORKSPACE}/properties`);
  await page.locator("tbody tr").first().getByRole("link").click();
  await expect(
    page.getByRole("heading", { name: "Instruction", level: 2 }),
  ).toBeVisible();
});
