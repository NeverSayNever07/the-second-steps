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

test("the production calendar keeps its view and scope in the address", async ({
  page,
}) => {
  await signInAsOwner(page);
  const dashboardTabs = page.getByRole("navigation", {
    name: "Dashboard sections",
  });
  await dashboardTabs
    .getByRole("link", { name: "Calendar", exact: true })
    .click();

  await expect(
    page.getByRole("heading", { name: "Calendar", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Day", exact: true }).click();
  await expect(page).toHaveURL(/tab=calendar.*view=day/);
  await expect(page.getByText("Showing 07:00 to 21:00")).toBeVisible();

  await page
    .getByRole("link", { name: "Branch calendar", exact: true })
    .click();
  await expect(page).toHaveURL(/scope=branch/);
  await expect(
    page.getByText("Your appointments", { exact: true }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Add timed action at 13:00" }).click();
  await expect(
    page.getByRole("heading", { name: "Add an action" }),
  ).toBeVisible();
  await expect(
    page.getByText("This puts the action straight into the calendar."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
});

test("the production calendar fits a phone and can reveal the full day", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsOwner(page);
  await page.goto(`${WORKSPACE}?tab=calendar&view=day`);

  await page.getByRole("button", { name: "Show early and late hours" }).click();
  await expect(page.getByText("Showing the full day")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
