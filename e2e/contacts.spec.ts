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

test("contact list and person creation path are available", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.getByRole("link", { name: "Contacts" }).click();
  await expect(page.getByRole("heading", { name: "Contacts" })).toBeVisible();
  await expect(page.getByLabel("Search contacts")).toBeVisible();

  await page.getByRole("button", { name: "New contact" }).click();
  await page.getByRole("button", { name: "Create person" }).click();
  await expect(page.getByRole("heading", { name: "New person" })).toBeVisible();
  await expect(page.getByLabel("First name")).toBeVisible();
  const branch = page.getByLabel("Responsible branch");
  await expect(branch).toContainText("Select a branch");
  await branch.click();
  await expect(page.getByRole("option", { name: "Main Branch" })).toBeVisible();
  await page.getByRole("option", { name: "Main Branch" }).click();
  await expect(branch).toContainText("Main Branch");
  await expect(
    page.getByRole("button", { name: "Create contact" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/contact-person-desktop.png",
    fullPage: true,
  });
});

test("person record uses the profile sidebar with an icon on every detail", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.getByRole("link", { name: "Contacts" }).click();
  await page.getByRole("link", { name: "Eleanor Price" }).click();

  await expect(
    page.getByRole("heading", { name: /Eleanor Price/ }),
  ).toBeVisible();
  await expect(page.locator('[data-slot="card"]')).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Organisations", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Notes", exact: true }),
  ).toBeVisible();
  for (const list of await page.locator("dl").all()) {
    const rows = await list.locator(":scope > div").count();
    expect(rows).toBeGreaterThan(0);
    await expect(list.locator(":scope > div > svg")).toHaveCount(rows);
  }
});

test("organisation form is usable on mobile and in dark mode", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsOwner(page);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Contacts" }).click();
  await page.getByRole("button", { name: "New contact" }).click();
  await page.getByRole("button", { name: "Create organisation" }).click();
  await expect(
    page.getByRole("heading", { name: "New organisation" }),
  ).toBeVisible();

  const sameAddress = page.getByLabel(
    "Correspondence address is the same as the registered address",
  );
  await sameAddress.check();
  await expect(page.locator("#correspondenceAddressLine1")).toBeDisabled();
  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({
    path: "test-results/contact-organisation-mobile.png",
    fullPage: true,
  });
});

test("organisation record lets a manager search for people to link", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.getByRole("link", { name: "Contacts" }).click();
  await page
    .getByRole("link", { name: /Hawthorne Property Holdings/ })
    .first()
    .click();
  const people = page.locator("section").filter({
    has: page.getByRole("heading", { name: "People", exact: true }),
  });
  await expect(people).toBeVisible();
  await people.getByRole("button", { name: "Link person" }).click();
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("radio").first()).toBeVisible();
  await expect(
    page.getByLabel("Main contact for this organisation"),
  ).toBeVisible();

  await page.getByRole("button", { name: "New person" }).click();
  await expect(page.getByLabel("First name")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add and link person" }),
  ).toBeVisible();
});

test("the whole contact row opens the record", async ({ page }) => {
  await signInAsOwner(page);
  await page.getByRole("link", { name: "Contacts" }).click();
  const cell = page
    .getByRole("row")
    .filter({ hasText: "Eleanor Price" })
    .getByRole("cell")
    .last();
  // The row may be below the fold when the list is long, and the click below
  // uses screen coordinates, so bring it into view first.
  await cell.scrollIntoViewIfNeeded();
  const box = await cell.boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(
    page.getByRole("heading", { name: /Eleanor Price/ }),
  ).toBeVisible();
});

test("contact record shows the notes timeline and add form", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.getByRole("link", { name: "Contacts" }).click();
  await page.getByRole("link", { name: "Eleanor Price" }).first().click();
  const notes = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Notes", exact: true }),
  });
  await expect(notes.getByLabel("Note", { exact: true })).toBeVisible();
  await expect(notes.getByLabel("Share with all branches")).toBeVisible();
  await expect(notes.getByRole("button", { name: "Add note" })).toBeVisible();
  await expect(
    notes.getByRole("link", { name: "Show voided notes" }),
  ).toBeVisible();
});

test("dropdown form inputs stay hidden on a directly loaded page", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto(`${WORKSPACE}/contacts/new?kind=person`);
  await expect(page.getByRole("heading", { name: "New person" })).toBeVisible();
  const sizes = await page
    .locator('input[aria-hidden="true"][name$="Label"]')
    .evaluateAll((inputs) =>
      inputs.map((input) => input.getBoundingClientRect().width),
    );
  expect(sizes.length).toBeGreaterThan(0);
  for (const width of sizes) expect(width).toBeLessThanOrEqual(1);
});

test("contact list searches privately and filters by status", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.getByRole("link", { name: "Contacts" }).click();
  await page.getByLabel("Search contacts").fill("Eleanor");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("link", { name: "Eleanor Price" })).toBeVisible();
  expect(page.url()).not.toContain("Eleanor");

  await page.getByLabel("Status").click();
  await page.getByRole("option", { name: "Merged" }).click();
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/state=merged/);
  await expect(page.getByText("No contacts found")).toBeVisible();
});
