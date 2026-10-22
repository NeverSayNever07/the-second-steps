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

test("the calendar mock-up switches view and authorised scope", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto("/design-lab/calendar");

  await expect(
    page.getByRole("heading", { name: "Calendar", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("4 visible entries")).toBeVisible();

  await page.getByRole("button", { name: "Branch calendar" }).click();
  await expect(page.getByLabel("Branch")).toBeVisible();
  await expect(page.getByText("9 visible entries")).toBeVisible();

  await page.getByLabel("Branch").click();
  await page.getByRole("option", { name: "Riverside Branch" }).click();
  await expect(page.getByText("1 visible entry")).toBeVisible();

  await page.getByRole("button", { name: "Month" }).click();
  await expect(
    page.getByRole("heading", { name: "October 2026" }),
  ).toBeVisible();
});

test("the calendar mock-up uses an agenda without phone overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsOwner(page);
  await page.goto("/design-lab/calendar");
  await page.getByRole("button", { name: "Dark theme" }).click();

  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(
    page.getByRole("heading", { name: "Thursday, 22 October 2026" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("a day slot can add an appointment and drag-to-move asks for confirmation", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto("/design-lab/calendar");
  await page.getByRole("button", { name: "Day", exact: true }).click();

  await expect(
    page.getByRole("button", { name: "Add appointment at 06:00" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Show early and late hours" }).click();
  await expect(
    page.getByRole("button", { name: "Add appointment at 06:00" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show usual hours" }).click();

  await page.getByRole("button", { name: "Add appointment at 13:00" }).click();
  const addDialog = page.getByRole("dialog");
  await addDialog.getByLabel("Landlord or lead").fill("Morgan Lee");
  await addDialog
    .getByLabel("Related property or record")
    .fill("10 Market Street, Cambridge");
  await addDialog.getByRole("button", { name: "Add appointment" }).click();
  await expect(
    page.getByRole("button", { name: /13:00 Appraisal · Morgan Lee/ }),
  ).toBeVisible();

  const appointment = page.getByRole("button", {
    name: /11:30 Appraisal · Hannah Cole/,
  });
  const newTime = page.locator('[data-calendar-drop-time="16:00"]');
  await appointment.dragTo(newTime);
  await expect(
    page.getByRole("heading", { name: "Move this appointment?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm move" }).click();
  await expect(
    page.getByRole("button", { name: /16:00 Appraisal · Hannah Cole/ }),
  ).toBeVisible();
});
