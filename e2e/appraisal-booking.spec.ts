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

test("Continue finds duplicates in the background, shows them in a pop-up, and never clears what was typed", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto(`${WORKSPACE}/enquiries?stage=new_enquiry`);
  await page.locator("tbody tr").first().getByRole("link").click();
  await page.getByRole("button", { name: "Book appraisal" }).click();
  await expect(
    page.getByRole("heading", { name: "Book an appraisal" }),
  ).toBeVisible();

  // Pick the date and time from the calendar, not by typing.
  await page.getByRole("button", { name: "Date and time" }).click();
  await page
    .locator('[role="gridcell"]')
    .filter({ hasText: /^20$/ })
    .getByRole("button")
    .click();
  await page.getByRole("option", { name: "10:00", exact: true }).click();
  await expect(page.getByRole("option", { name: "10:00" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.locator("#scheduledAt")).toContainText("20");
  await expect(page.locator("#scheduledAt")).toContainText("10:00");
  await page.getByRole("combobox", { name: "Assigned to" }).click();
  await page.getByRole("option").first().click();
  // An address that matches an existing demo property.
  await page.getByLabel("Flat or building").fill("61");
  await page.getByLabel("Street").fill("Canal Street");
  await page.getByLabel("Locality").fill("Northern Quarter");
  await page.getByLabel("Town or city").fill("Manchester");
  await page.getByLabel("County").fill("Greater Manchester");
  await page.getByLabel("Postcode").fill("M1 3HE");
  await page.getByRole("combobox", { name: "Property type" }).click();
  await page.getByRole("option", { name: "Flat", exact: true }).click();
  await page.getByLabel("Bedrooms").fill("3");
  await page.getByLabel("Bathrooms").fill("2");
  await page.getByLabel("Property notes").fill("Second floor, lift access");
  await page
    .getByLabel("Appointment notes (optional)")
    .fill("Use side gate, dog in garden");

  // There is no separate duplicate-review step: one Continue button.
  await expect(
    page.getByRole("button", { name: "Review duplicates" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Continue" }).click();
  const review = page.getByRole("dialog", { name: "Possible matches" });
  await expect(review).toBeVisible({ timeout: 20_000 });
  await expect(review.getByText("Create a new property")).toBeVisible();

  // Closing the pop-up goes back to the details, with nothing cleared.
  await review.getByRole("button", { name: "Back to the details" }).click();
  await expect(review).toBeHidden();
  await expect(page.getByLabel("Locality")).toHaveValue("Northern Quarter");
  await expect(page.getByLabel("Town or city")).toHaveValue("Manchester");
  await expect(page.getByLabel("County")).toHaveValue("Greater Manchester");
  await expect(page.getByLabel("Bedrooms")).toHaveValue("3");
  await expect(page.getByLabel("Bathrooms")).toHaveValue("2");
  await expect(page.getByLabel("Property notes")).toHaveValue(
    "Second floor, lift access",
  );
  await expect(page.getByLabel("Appointment notes (optional)")).toHaveValue(
    "Use side gate, dog in garden",
  );
  await expect(page.locator("#scheduledAt")).toContainText("10:00");
  // Still on the booking page: nothing was booked.
  await expect(
    page.getByRole("heading", { name: "Book an appraisal" }),
  ).toBeVisible();
});
