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
 * Opens a fictional lead at appraisal completed (the demo data keeps
 * several). These tests only look at it and cancel: confirming Start
 * instruction on it would use it up for good.
 */
async function openCompletedLead(page: Page) {
  await page.goto(`${WORKSPACE}/enquiries?stage=appraisal_completed`);
  // A table row from tablet width, a stacked card on a phone: either way, the
  // visible link to the lead.
  const lead = page
    .locator('a[href*="/enquiries/"]:not([href$="/new"])')
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
  // Today's date is chosen, shown by the date picker.
  await expect(page.locator("#instructedOn")).toContainText(/\d{4}/);
  await page.getByLabel("Agreed asking rent").fill("1300");
  await page.getByRole("combobox", { name: "Offering" }).click();
  await page
    .getByRole("option", { name: "Standard deposit", exact: true })
    .click();
  await expect(page.getByLabel("Tenancy deposit")).toHaveValue("1500.00");
  await page.getByRole("combobox", { name: "How often" }).click();
  await expect(page.getByRole("option", { name: "annually" })).toBeVisible();
  await page.keyboard.press("Escape");
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

test("the Instructions worklist finds current work without putting search words in the URL", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.getByRole("link", { name: "Instructions", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Instructions", level: 1 }),
  ).toBeVisible();

  const instruction = page
    .getByText("INS-WP32T6JU", { exact: false })
    .locator("visible=true")
    .first();
  await expect(instruction).toBeVisible();
  await page.getByLabel("Search instructions").fill("INS-WP32T6JU");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(instruction).toBeVisible();
  expect(new URL(page.url()).searchParams.has("q")).toBe(false);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Dark theme" }).click();
  await page.reload();
  await expect(instruction).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

/** A tiny fictional PDF: enough for the upload checks, never a real record. */
const FICTIONAL_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n",
);

async function openFixtureInstruction(page: Page) {
  await page.goto(`${WORKSPACE}/instructions`);
  // The reference sits under the address link in the worklist row.
  await page
    .locator("tr", { hasText: "INS-WP32T6JU" })
    .getByRole("link")
    .first()
    .click();
  // The agreement is on the Landlords & agreement tab.
  await page.getByRole("link", { name: "Landlords & agreement" }).click();
  await expect(
    page.getByRole("heading", { name: "Agreement", level: 2 }),
  ).toBeVisible();
}

/**
 * Uploads a signed copy, is refused without the signatures confirmation (the
 * draft stays, offering Finish), then discards it. It never completes one:
 * a completed agreement is permanent, even in the shared test data.
 */
test("an uploaded agreement stays a draft until confirmed, and a draft can be discarded", async ({
  page,
}) => {
  await signInAsOwner(page);
  await openFixtureInstruction(page);
  const discardDraft = async () => {
    await page.getByRole("button", { name: "Discard draft" }).click();
    await page.getByLabel("Reason").fill("Browser test clean-up");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Discard draft" })
      .click();
    await expect(page.getByText("Draft uploaded")).toHaveCount(0);
  };
  // A run that stopped half-way may have left its draft behind.
  if (await page.getByText("Draft uploaded").isVisible()) await discardDraft();

  await page.getByRole("button", { name: /signed (agreement|copy)/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Signed agreement (PDF)").setInputFiles({
    name: "fictional-agreement.pdf",
    mimeType: "application/pdf",
    buffer: FICTIONAL_PDF,
  });
  await dialog.getByRole("button", { name: "Upload and complete" }).click();
  // The first call compiles the action in the dev server, which can be slow.
  await expect(dialog.getByRole("alert")).toContainText(
    "Check the details and try again.",
    { timeout: 20_000 },
  );
  await expect(
    dialog.getByRole("button", { name: "Complete agreement" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByText("Draft uploaded")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Finish agreement" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download" }).first(),
  ).toBeVisible();
  await discardDraft();
  // Every run adds to the history; the newest is listed first.
  await expect(
    page.getByText(/Discarded.*Browser test clean-up/).first(),
  ).toBeVisible();
});

test("the agreement section fits a phone in dark mode", async ({ page }) => {
  await signInAsOwner(page);
  await page.getByRole("button", { name: "Dark theme" }).click();
  await openFixtureInstruction(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page
      .getByText(
        /No signed agreement|Signed agreement|Agreement update required/,
      )
      .first(),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
