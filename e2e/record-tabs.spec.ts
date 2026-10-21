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

async function openFixtureInstruction(page: Page) {
  await page.goto(`${WORKSPACE}/instructions`);
  await page
    .locator("tr", { hasText: "INS-WP32T6JU" })
    .getByRole("link")
    .first()
    .click();
  await expect(
    page.getByRole("navigation", { name: "Record sections" }),
  ).toBeVisible();
}

test("an instruction has tabs, opens on its overview and keeps the tab in the URL", async ({
  page,
}) => {
  await signInAsOwner(page);
  await openFixtureInstruction(page);
  const tabs = page.getByRole("navigation", { name: "Record sections" });
  for (const name of [
    "Overview",
    "Terms",
    "Landlords & agreement",
    "Compliance",
    "History",
  ]) {
    await expect(tabs.getByRole("link", { name })).toBeVisible();
  }
  await expect(tabs.getByRole("link", { name: "Overview" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  // The overview shows the next step, the checklist, key terms and compliance.
  await expect(
    page.getByRole("heading", { name: /Ready to market/ }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Key terms", level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Property compliance", level: 2 }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/instruction-overview.png",
    fullPage: true,
  });

  await tabs.getByRole("link", { name: "Terms" }).click();
  await expect(page).toHaveURL(/tab=terms/);
  await expect(
    page.getByRole("heading", { name: "Terms", level: 2 }),
  ).toBeVisible();

  await tabs.getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(/tab=history/);
  await expect(
    page.getByRole("heading", { name: "Journey history", level: 2 }),
  ).toBeVisible();

  // A link can open a tab directly, and an unknown tab falls back to Overview.
  await page.goto(`${page.url().split("?")[0]}?tab=nonsense`);
  await expect(
    page.getByRole("heading", { name: "Key terms", level: 2 }),
  ).toBeVisible();
});

test("the instruction shows the property's compliance and can update it", async ({
  page,
}) => {
  await signInAsOwner(page);
  await openFixtureInstruction(page);
  await page
    .getByRole("navigation", { name: "Record sections" })
    .getByRole("link", { name: "Compliance" })
    .click();
  await expect(page).toHaveURL(/tab=compliance/);
  await expect(
    page.getByRole("heading", { name: "Gas safety record (CP12)", level: 3 }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Update" })).toHaveCount(5);
  await page.getByRole("button", { name: "Update" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
});

test("a property has tabs and a current instruction card", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(`${WORKSPACE}/instructions`);
  await page
    .locator("tr", { hasText: "INS-WP32T6JU" })
    .getByRole("link")
    .first()
    .click();
  await page.getByText("Back to property").click();
  const tabs = page.getByRole("navigation", { name: "Record sections" });
  for (const name of [
    "Overview",
    "Instructions",
    "Compliance",
    "Leads",
    "Notes",
  ]) {
    await expect(tabs.getByRole("link", { name })).toBeVisible();
  }
  await expect(
    page.getByRole("heading", { name: "Current instruction", level: 2 }),
  ).toBeVisible();
  await expect(page.getByText("Open instruction")).toBeVisible();
  await page.screenshot({
    path: "test-results/property-overview.png",
    fullPage: true,
  });

  await tabs.getByRole("link", { name: "Instructions" }).click();
  await expect(page).toHaveURL(/tab=instructions/);
  await expect(
    page.getByRole("heading", { name: "Instruction", level: 2 }),
  ).toBeVisible();
  await tabs.getByRole("link", { name: "Notes" }).click();
  await expect(page).toHaveURL(/tab=notes/);
  await expect(
    page.getByRole("heading", { name: "Notes", level: 2 }),
  ).toBeVisible();
});

test("the tabs fit a phone in dark mode", async ({ page }) => {
  await signInAsOwner(page);
  await page.getByRole("button", { name: "Dark theme" }).click();
  await openFixtureInstruction(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const tab of ["", "?tab=landlords", "?tab=compliance"]) {
    await page.goto(`${page.url().split("?")[0]}${tab}`);
    await expect(
      page.getByRole("navigation", { name: "Record sections" }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, tab || "overview").toBeLessThanOrEqual(0);
  }
  await page.screenshot({
    path: "test-results/instruction-compliance-phone-dark.png",
  });
});

test("Home shows a property compliance panel that fits a phone in dark mode", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto(WORKSPACE);
  await expect(
    page.getByRole("region", { name: "Property compliance" }),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Compliance totals" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/home-compliance-panel.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "Dark theme" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(WORKSPACE);
  await expect(
    page.getByRole("region", { name: "Property compliance" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
