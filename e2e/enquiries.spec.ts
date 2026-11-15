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

test("landlord-lead workspace routes and quick capture are usable", async ({
  page,
}) => {
  await signInAsOwner(page);
  await expect(page.getByRole("heading", { name: "Your day" })).toBeVisible();
  await page.getByRole("button", { name: "Landlord pipeline" }).click();
  await page.getByRole("link", { name: "Landlord leads" }).click();
  await expect(
    page.getByRole("heading", { name: "Landlord leads", exact: true }),
  ).toBeVisible();
  const search = page.getByLabel("Search landlord leads");
  await expect(search).toBeVisible();
  // The list filters as you type, with no Search button, and the words stay
  // out of the web address.
  await search.fill("zzqxj");
  await expect(page.getByText("No landlord leads found")).toBeVisible();
  expect(page.url()).not.toContain("zzqxj");
  await search.fill("");
  const views = page.getByRole("navigation", { name: "Lead views" });
  await views.getByRole("link", { name: /^Lost or postponed/ }).click();
  await expect(page).toHaveURL(/view=closed/);
  await views.getByRole("link", { name: /^Needs action/ }).click();
  await expect(page).toHaveURL(/\/enquiries$/);
  await page.getByRole("button", { name: "New landlord lead" }).click();
  const modal = page.getByRole("dialog", { name: "New landlord lead" });
  await expect(modal).toBeVisible();
  await expect(modal.getByLabel("First name")).toBeVisible();
  await expect(modal.getByLabel(/^Branch/)).toBeVisible();
  await expect(modal.getByRole("button", { name: "Continue" })).toBeVisible();
});

test("each lead view's count matches the leads it opens", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(`${WORKSPACE}/enquiries`);
  const views = page.getByRole("navigation", { name: "Lead views" });
  for (const name of [
    "Mine",
    "All open",
    "Won",
    "Lost or postponed",
    "Needs action",
  ]) {
    await views.getByRole("link", { name: new RegExp(`^${name}`) }).click();
    await expect(
      views.getByRole("link", { name: new RegExp(`^${name}`) }),
    ).toHaveAttribute("aria-current", "page");
    const label = await views
      .getByRole("link", { name: new RegExp(`^${name}`) })
      .innerText();
    const count = Number(label.match(/(\d+)\s*$/)?.[1]);
    // One page holds 25 leads; the demo data is smaller than that.
    expect(count).toBeLessThanOrEqual(25);
    await expect(page.locator("tbody tr")).toHaveCount(count, {
      timeout: 15_000,
    });
  }
});

test("a lead can be previewed beside the list without leaving it", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto(`${WORKSPACE}/enquiries?view=open`);
  const listAddress = page.url();
  const first = page.locator("tbody tr").first();
  const name = (await first.getByRole("link").innerText()).trim();
  await first.getByRole("button", { name: `Preview ${name}` }).click();
  const preview = page.getByRole("complementary", {
    name: `Preview of ${name}`,
  });
  await expect(preview).toBeVisible();
  await expect(
    preview.getByRole("button", { name: "Open full record" }),
  ).toBeVisible();
  await expect(preview.getByText("Looked after by")).toBeVisible();
  expect(page.url()).toBe(listAddress);
  await preview.getByRole("button", { name: "Close preview" }).click();
  await expect(preview).toHaveCount(0);
  // A phone has no preview: a tap opens the record, and the page fits.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect(page.getByRole("button", { name: /^Preview / })).toHaveCount(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("a next action can be added and finished from the preview", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto(`${WORKSPACE}/enquiries?view=attention`);
  // A lead with no next action; it ends up exactly as it began.
  const row = page
    .locator("tbody tr")
    .filter({ hasText: "No next action" })
    .first();
  await expect(row).toBeVisible();
  const name = (await row.getByRole("link").innerText()).trim();
  await row.getByRole("button", { name: `Preview ${name}` }).click();
  const preview = page.getByRole("complementary", {
    name: `Preview of ${name}`,
  });
  await expect(preview.getByText("No next action")).toBeVisible();

  const title = `E2E lead ${Date.now()}`;
  await preview.getByRole("button", { name: "Add next action" }).click();
  const dialog = page.getByRole("dialog", { name: "Add next action" });
  await dialog.getByLabel("What needs doing?").fill(title);
  await dialog.getByRole("button", { name: "Due date" }).click();
  await page
    .locator('[role="gridcell"]')
    .filter({ hasText: /^20$/ })
    .getByRole("button")
    .click();
  await dialog.getByRole("button", { name: "Add action" }).click();
  // The lead now has a next action, so it leaves Needs action; the list says
  // what happened, and its tab count drops.
  await expect(page.getByText(`Next action added for ${name}.`)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator("tbody tr").filter({ hasText: name })).toHaveCount(
    0,
    { timeout: 15_000 },
  );

  // It is still in All open, with the new action, and can be finished there.
  await page.goto(`${WORKSPACE}/enquiries?view=open`);
  const openRow = page.locator("tbody tr").filter({ hasText: name });
  await expect(openRow.getByText(title)).toBeVisible();
  await openRow.getByRole("button", { name: `Preview ${name}` }).click();
  const openPreview = page.getByRole("complementary", {
    name: `Preview of ${name}`,
  });
  await expect(openPreview.getByText(title)).toBeVisible();
  await openPreview.getByRole("button", { name: "Done" }).click();
  await expect(
    page.getByText(`Marked "${title}" done for ${name}.`),
  ).toBeVisible({ timeout: 15_000 });
  await expect(openPreview.getByText("No next action")).toBeVisible({
    timeout: 15_000,
  });
});

test("landlord-lead settings support mobile dark mode without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsOwner(page);
  await page.goto(`${WORKSPACE}/settings/enquiries`);
  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(
    page.getByRole("heading", { name: "Landlord lead lists" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Lead sources" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Outcome reasons" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("an open landlord lead can be reviewed for editing without saving", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto(`${WORKSPACE}/enquiries?stage=new_enquiry`);
  await page.locator("tbody tr").first().getByRole("link").click();
  await expect(
    page.getByRole("button", { name: "Edit details" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit details" }).click();
  await expect(
    page.getByRole("heading", { name: "Edit landlord lead" }),
  ).toBeVisible();
  await expect(page.getByLabel("Landlord name")).not.toHaveValue("");
  await expect(
    page.getByText("Responsible branch", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeVisible();
  await page.getByLabel("Postcode").fill("not a postcode");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Enter a valid UK postcode.")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Edit landlord lead" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/landlord-lead-edit-desktop-light.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({
    path: "test-results/landlord-lead-edit-mobile-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("button", { name: "Edit details" }),
  ).toBeVisible();
});

test("a booked appraisal can be reviewed for editing without saving", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto(`${WORKSPACE}/enquiries?stage=appraisal_booked`);
  await page.locator("tbody tr").first().getByRole("link").click();
  await page.getByRole("button", { name: "Edit booking" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit appraisal booking" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Date and time" }),
  ).toContainText(/\d{4}/);
  await expect(
    dialog.getByRole("combobox", { name: "Assigned to" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});
