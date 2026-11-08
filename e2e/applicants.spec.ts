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

const newApplicantModal = (page: Page) =>
  page.getByRole("dialog", { name: "New applicant" });

async function openNewApplicant(page: Page) {
  await page.goto(`${WORKSPACE}/applicants`);
  await page.getByRole("button", { name: "New applicant" }).click();
  await expect(newApplicantModal(page)).toBeVisible();
}

test("New applicant is a short modal that says what is missing and keeps what was typed", async ({
  page,
}) => {
  await signInAsOwner(page);
  await openNewApplicant(page);
  const modal = newApplicantModal(page);
  for (const label of ["First name", "Last name", "Telephone", "Email"]) {
    await expect(modal.getByLabel(new RegExp(`^${label}`))).toBeVisible();
  }
  await modal.getByLabel("First name").fill("Test");
  await modal.getByRole("button", { name: "Create applicant" }).click();
  await expect(modal.getByText("Enter a surname.")).toBeVisible();
  await expect(modal.getByText("Choose a branch.")).toBeVisible();
  await expect(modal.getByLabel("First name")).toHaveValue("Test");
});

test("a possible matching contact opens a pop-up, and closing it loses nothing", async ({
  page,
}) => {
  await signInAsOwner(page);
  await openNewApplicant(page);
  const modal = newApplicantModal(page);
  await modal.getByLabel("First name").fill("Tomasz");
  await modal.getByLabel("Last name").fill("Kowalski");
  await modal.getByLabel("Email").fill("tomasz.kowalski@example.com");
  await modal.getByLabel(/^Branch/).click();
  await page.getByRole("option").first().click();
  await modal.getByRole("button", { name: "Create applicant" }).click();
  const review = page.getByRole("dialog", { name: "Possible matches" });
  await expect(review).toBeVisible({ timeout: 20_000 });
  await expect(review.getByText("Create a new applicant")).toBeVisible();
  await review.getByRole("button", { name: "Back to the details" }).click();
  await expect(review).toBeHidden();
  // Nothing was saved or lost.
  await expect(modal.getByLabel("First name")).toHaveValue("Tomasz");
});

test("the New applicant modal is a bottom sheet that fits a phone in dark mode", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsOwner(page);
  await page.goto(`${WORKSPACE}/applicants`);
  await page.getByRole("button", { name: "Dark theme" }).click();
  await page.getByRole("button", { name: "New applicant" }).click();
  // Sitting on the bottom edge of the screen (once it has finished opening).
  await expect
    .poll(async () => {
      const box = await newApplicantModal(page).boundingBox();
      return box ? box.y + box.height : 0;
    })
    .toBeGreaterThan(830);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

async function openDemoApplicantRequirements(page: Page) {
  await page.goto(`${WORKSPACE}/applicants`);
  await page.getByRole("link", { name: "Demo Applicant" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Demo Applicant", level: 1 }),
  ).toBeVisible();
  await page.goto(`${page.url().split("?")[0]}?tab=requirements`);
}

test("requirements are edited in one dialog, checked, and saved as a version", async ({
  page,
}) => {
  await signInAsOwner(page);
  await openDemoApplicantRequirements(page);
  await page.getByRole("button", { name: /(Add|Edit) requirements/ }).click();
  const dialog = page.getByRole("dialog", {
    name: "What they are looking for",
  });
  await expect(dialog).toBeVisible();
  // A refused save keeps what was typed and says what is wrong.
  await dialog.getByLabel("Least rent (£)").fill("2000");
  await dialog.getByLabel("Most rent (£)").fill("1500");
  await dialog.getByRole("button", { name: "Save requirements" }).click();
  await expect(
    dialog.getByText("The most cannot be less than the least."),
  ).toBeVisible();
  await expect(dialog.getByLabel("Least rent (£)")).toHaveValue("2000");
  // A sensitive-looking note is warned about, never blocked.
  await dialog.getByLabel("Notes (optional)").fill("Works, salary stated");
  await expect(dialog.getByRole("note")).toContainText("Do not record income");
  await dialog.getByLabel("Notes (optional)").fill("");
  // A valid save closes the dialog and shows the new values.
  await dialog.getByLabel("Areas (separate with commas)").fill("M20, Didsbury");
  await dialog.getByLabel("Least rent (£)").fill("1000");
  await dialog.getByLabel("Most rent (£)").fill("1500");
  await dialog.getByLabel("Fewest bedrooms").fill("2");
  await dialog.getByLabel("Most bedrooms").fill("3");
  await dialog.getByLabel("Terraced").check();
  await dialog.getByRole("button", { name: "Save requirements" }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText("M20, Didsbury")).toBeVisible();
  await expect(page.getByText("£1,000.00 to £1,500.00")).toBeVisible();
});

test("the requirements dialog fits a phone in dark mode", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsOwner(page);
  await page.getByRole("button", { name: "Dark theme" }).click();
  await openDemoApplicantRequirements(page);
  await page.getByRole("button", { name: /(Add|Edit) requirements/ }).click();
  await expect(
    page.getByRole("dialog", { name: "What they are looking for" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
