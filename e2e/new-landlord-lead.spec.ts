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

const modalOf = (page: Page) =>
  page.getByRole("dialog", { name: "New landlord lead" });

async function openNewLead(page: Page) {
  await page.goto(`${WORKSPACE}/enquiries`);
  await page.getByRole("button", { name: "New landlord lead" }).click();
  await expect(modalOf(page)).toBeVisible();
}

test("New landlord lead is a short two-step modal: the essentials, then what happens next", async ({
  page,
}) => {
  await signInAsOwner(page);
  await openNewLead(page);
  const modal = modalOf(page);
  for (const heading of ["Landlord", "The property to let", "Lead details"]) {
    await expect(
      modal.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  }
  await expect(modal.getByText("Step 1 of 2")).toBeVisible();
  // The detail that moved to the records is not asked for here.
  await expect(modal.getByLabel(/^Bedrooms/)).toHaveCount(0);

  await modal.getByRole("button", { name: "Continue" }).click();
  await expect(modal.getByText("Step 2 of 2")).toBeVisible();
  await expect(
    modal.getByRole("button", { name: "Create lead and book appraisal" }),
  ).toBeVisible();
  await expect(
    modal.getByRole("button", { name: "Date and time" }),
  ).toBeVisible();
  await modal.getByLabel("Set a next action").check();
  await expect(modal.getByLabel("What needs doing?")).toBeVisible();
  await expect(
    modal.getByRole("button", { name: "Create lead", exact: true }),
  ).toBeVisible();
  await modal.getByLabel("Save the lead for now").check();
  await expect(modal.getByRole("button", { name: "Save lead" })).toBeVisible();
  await modal.getByRole("button", { name: "Back" }).click();
  await expect(modal.getByText("Step 1 of 2")).toBeVisible();
});

test("the old address opens the list with the modal", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(`${WORKSPACE}/enquiries/new`);
  await expect(page).toHaveURL(/\/enquiries\?new=1$/);
  await expect(modalOf(page)).toBeVisible();
});

test("an incomplete form returns to step 1, says what is missing and keeps what was typed", async ({
  page,
}) => {
  await signInAsOwner(page);
  await openNewLead(page);
  const modal = modalOf(page);
  await modal.getByLabel("First name").fill("Test");
  await modal.getByRole("button", { name: "Continue" }).click();
  await modal
    .getByRole("button", { name: "Create lead and book appraisal" })
    .click();
  await expect(modal.getByRole("alert").first()).toBeVisible();
  await expect(modal.getByText("Step 1 of 2")).toBeVisible();
  await expect(modal.getByText("Enter a surname.")).toBeVisible();
  await expect(modal.getByText("Enter the street.")).toBeVisible();
  // Nothing typed was cleared by the refused save.
  await expect(modal.getByLabel("First name")).toHaveValue("Test");
});

test("a possible duplicate opens a pop-up, and closing it loses nothing", async ({
  page,
}) => {
  await signInAsOwner(page);
  await openNewLead(page);
  const modal = modalOf(page);
  await modal.getByLabel("First name").fill("Duplicate");
  await modal.getByLabel("Last name").fill("Check");
  await modal.getByLabel("Email").fill("duplicate.check@example.test");
  await modal.getByLabel(/^Branch/).click();
  await page.getByRole("option").first().click();
  // An address that matches an existing demo property.
  await modal.getByLabel(/^Flat or building/).fill("61");
  await modal.getByLabel(/^Street/).fill("Canal Street");
  await modal.getByLabel(/^Town or city/).fill("Manchester");
  await modal.getByLabel(/^Postcode/).fill("M1 3HE");
  await modal.getByRole("combobox", { name: /Property type/ }).click();
  await page.getByRole("option", { name: "Flat", exact: true }).click();
  await modal.getByRole("button", { name: "Continue" }).click();
  await modal.getByLabel("Save the lead for now").check();

  await modal.getByRole("button", { name: "Save lead" }).click();
  const review = page.getByRole("dialog", { name: "Possible matches" });
  await expect(review).toBeVisible({ timeout: 20_000 });
  await expect(review.getByText("Create a new property")).toBeVisible();
  await review.getByRole("button", { name: "Back to the details" }).click();
  await expect(review).toBeHidden();
  // Still in the modal: nothing was saved and nothing was lost.
  await expect(modal.getByText("Step 2 of 2")).toBeVisible();
  await modal.getByRole("button", { name: "Back" }).click();
  await expect(modal.getByLabel("First name")).toHaveValue("Duplicate");
  await expect(modal.getByLabel(/^Street/)).toHaveValue("Canal Street");
});

test("the date and time are picked from a calendar", async ({ page }) => {
  await signInAsOwner(page);
  await openNewLead(page);
  const modal = modalOf(page);
  await modal.getByRole("button", { name: "Continue" }).click();
  await modal.getByRole("button", { name: "Date and time" }).click();
  await page
    .locator('[role="gridcell"]')
    .filter({ hasText: /^20$/ })
    .getByRole("button")
    .click();
  await page.getByRole("option", { name: "14:30", exact: true }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.locator("#scheduledAt")).toContainText("14:30");
});

test("the modal is a bottom sheet that fits a phone in dark mode", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsOwner(page);
  await page.getByRole("button", { name: "Dark theme" }).click();
  await openNewLead(page);
  const modal = modalOf(page);
  const box = await modal.boundingBox();
  expect(box).not.toBeNull();
  // Sitting on the bottom edge of the screen.
  expect(box!.y + box!.height).toBeGreaterThan(830);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
