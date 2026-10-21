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
  await expect(page.getByRole("heading", { name: "Actions" })).toBeVisible();
  await page.getByRole("link", { name: "Landlord leads" }).click();
  await expect(
    page.getByRole("heading", { name: "Landlord leads", exact: true }),
  ).toBeVisible();
  const search = page.getByLabel("Search landlord leads");
  await expect(search).toBeVisible();
  await search.fill("zzqxj");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("No landlord leads found")).toBeVisible();
  expect(page.url()).not.toContain("zzqxj");
  await page.getByLabel("Include lost and postponed").check();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page).toHaveURL(/closed=yes/);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/enquiries$/);
  await page.getByRole("button", { name: "New landlord lead" }).click();
  await expect(
    page.getByRole("heading", { name: "New landlord lead", level: 1 }),
  ).toBeVisible();
  await expect(page.getByLabel("First name")).toBeVisible();
  await expect(page.getByLabel("Responsible branch")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create lead and book appraisal" }),
  ).toBeVisible();
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
