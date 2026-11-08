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

// The lab only looks. It loads each round-two view and saves screenshots.
test("round two views render, and the modal opens and leads to the new lead", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signInAsOwner(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto("/design-lab/look-and-feel-2?v=list");
  await page.getByRole("button", { name: "New landlord lead" }).click();
  await expect(
    page.getByRole("dialog").getByText("New landlord lead"),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/r2-modal-click.png" });
  await page
    .getByRole("dialog")
    .getByText("Create landlord lead", { exact: true })
    .click();
  await expect(page.getByText("Landlord lead created")).toBeVisible();

  for (const [view, facts, band] of [
    ["list", "a", "blue"],
    ["modal", "a", "blue"],
    ["created", "a", "blue"],
    ["created", "b", "blue"],
    ["created", "c", "navy"],
    ["property", "a", "blue"],
    ["property", "b", "navy"],
    ["property", "c", "blue"],
  ] as const) {
    await page.goto(
      `/design-lab/look-and-feel-2?v=${view}&f=${facts}&b=${band}`,
    );
    await expect(
      page.getByRole("heading", { name: "Look and feel, round two", level: 1 }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/r2-${view}-${facts}-${band}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Dark theme" }).click();
  await page.goto("/design-lab/look-and-feel-2?v=modal&f=a&b=blue");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: "test-results/r2-modal-dark.png" });
  await page.goto("/design-lab/look-and-feel-2?v=created&f=a&b=blue");
  await page.screenshot({
    path: "test-results/r2-created-dark.png",
    fullPage: true,
  });
});
