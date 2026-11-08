import { expect, test, type Page } from "@playwright/test";

const WORKSPACE = "/dashboard/w/oakfield-lettings-demo";

async function signInAsOwner(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Sandbox user").click();
  await page.getByRole("option").filter({ hasText: "Olivia Hart" }).click();
  await page.getByRole("button", { name: "Sign in as selected user" }).click();
  await expect(page).toHaveURL(new RegExp(`${WORKSPACE}$`), {
    timeout: 30_000,
  });
}

// The lab only looks. This loads every direction on every screen, checks the
// page does not scroll sideways, and saves screenshots for review.
test("every look-and-feel direction renders on every screen", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signInAsOwner(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const direction of ["d1", "d2", "d3", "d4", "d5", "d6"]) {
    for (const screen of ["list", "record", "form"]) {
      await page.goto(`/design-lab/look-and-feel?d=${direction}&s=${screen}`);
      await expect(
        page.getByRole("heading", { name: "Look and feel options", level: 1 }),
      ).toBeVisible();
      await page.screenshot({
        path: `test-results/look-${direction}-${screen}.png`,
        fullPage: true,
      });
    }
  }
  await page.getByRole("button", { name: "Dark theme" }).click();
  for (const direction of ["d1", "d2", "d3", "d4", "d5", "d6"]) {
    await page.goto(`/design-lab/look-and-feel?d=${direction}&s=record`);
    await page.screenshot({
      path: `test-results/look-${direction}-record-dark.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/design-lab/look-and-feel?d=d1&s=list");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
