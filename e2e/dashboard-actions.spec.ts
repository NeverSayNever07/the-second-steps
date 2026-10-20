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

test("an action can be added, snoozed and finished from the Overview", async ({
  page,
}) => {
  await signInAsOwner(page);
  const title = `E2E check ${Date.now()}`;
  const row = page.getByRole("listitem").filter({ hasText: title });

  await expect(page.getByRole("heading", { name: "Actions" })).toBeVisible();
  await page.getByRole("button", { name: "Add action" }).click();
  await page.getByLabel("What needs doing?").fill(title);
  await page.getByRole("button", { name: "Add action" }).last().click();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row.getByText("Today", { exact: true })).toBeVisible();

  await row.getByRole("button", { name: /More actions/ }).click();
  await page.getByRole("button", { name: "Snooze…" }).click();
  await page.getByRole("button", { name: "Tomorrow" }).click();
  await expect(row.getByText("Tomorrow", { exact: true })).toBeVisible({
    timeout: 10_000,
  });

  await row.getByRole("button", { name: /^Finish / }).click();
  await expect(
    page.getByRole("heading", { name: "What happens next?" }),
  ).toBeVisible();
  await page.getByLabel("Nothing more to do").check();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  // The open pop-up hides the page from the test, so wait for the server's
  // confirmation before checking the list.
  await expect(page.getByText(/^Finished/)).toBeVisible({ timeout: 15_000 });
  await expect(row).toHaveCount(0, { timeout: 10_000 });
  // It stays gone after a fresh load, so the change really was saved.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Actions" })).toBeVisible();
  await expect(row).toHaveCount(0);
});

test("the Overview actions list fits a phone in dark mode", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsOwner(page);
  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("heading", { name: "Actions" })).toBeVisible();
  await page.getByRole("button", { name: "Add action" }).click();
  await expect(
    page.getByRole("heading", { name: "Add an action" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the Pipeline tab shows open leads by stage with assign and outcome controls", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.getByRole("link", { name: "Pipeline" }).click();
  await expect(page).toHaveURL(/\?tab=pipeline$/);
  await expect(page.getByRole("link", { name: "Pipeline" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  for (const stage of ["New lead", "Appraisal booked", "Appraisal completed"]) {
    await expect(
      page.getByRole("heading", { name: new RegExp(`^${stage}`) }),
    ).toBeVisible();
  }
  // The actions list stays on the page.
  await expect(page.getByRole("heading", { name: "Actions" })).toBeVisible();
  await page
    .getByRole("button", { name: /^Assign / })
    .first()
    .click();
  await expect(
    page.getByText("Who should look after this lead?"),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Record outcome" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Record lead outcome" }),
  ).toBeVisible();
});

test("the Pipeline tab fits a phone in dark mode", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsOwner(page);
  await page.getByRole("button", { name: "Dark theme" }).click();
  await page.goto(`${WORKSPACE}?tab=pipeline`);
  await expect(page.getByRole("heading", { name: /^New lead/ })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("an action can be planned into an hour on the Schedule tab and removed again", async ({
  page,
}) => {
  await signInAsOwner(page);
  const title = `E2E plan ${Date.now()}`;
  const row = page.getByRole("listitem").filter({ hasText: title });
  await page.getByRole("button", { name: "Add action" }).click();
  await page.getByLabel("What needs doing?").fill(title);
  await page.getByRole("button", { name: "Add action" }).last().click();
  await expect(row).toBeVisible({ timeout: 10_000 });

  await page.getByRole("link", { name: "Schedule" }).click();
  await expect(page).toHaveURL(/\?tab=schedule$/);
  await expect(
    page.getByRole("heading", { name: "Waiting to be planned" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Plan ${title} into today` })
    .last()
    .click();
  await page.getByRole("button", { name: "15:00" }).click();
  // Once planned it sits in the 15:00 slot with a remove button.
  const remove = page.getByRole("button", {
    name: `Remove ${title} from the plan`,
  });
  await expect(remove).toBeVisible({ timeout: 10_000 });
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: "15:00" })
      .filter({
        hasText: title,
      })
      .first(),
  ).toBeVisible();

  await remove.click();
  await expect(
    page.getByRole("button", { name: `Plan ${title} into today` }).first(),
  ).toBeVisible({ timeout: 10_000 });

  // Tidy up: finish it from the actions list.
  await page.getByRole("button", { name: `Finish ${title}` }).click();
  await page.getByLabel("Nothing more to do").check();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(page.getByText(/^Finished/)).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Actions" })).toBeVisible();
  await expect(page.getByText(title)).toHaveCount(0);
});

test("the Team tab shows each colleague's workload", async ({ page }) => {
  await signInAsOwner(page);
  await page.getByRole("link", { name: "Team" }).click();
  await expect(page).toHaveURL(/\?tab=team$/);
  await expect(
    page.getByRole("heading", { name: "Team workload" }),
  ).toBeVisible();
  await expect(page.getByText("Nobody assigned")).toBeVisible();
  await expect(page.getByText(/\(you\)/)).toBeVisible();
  await expect(page.getByText(/\d+ open/).first()).toBeVisible();
});

test("later-module previews are clearly placeholders", async ({ page }) => {
  await signInAsOwner(page);
  // The old dashboard search placeholder is gone; search is in the top bar.
  await expect(page.getByLabel("Search everything")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Coming with later modules" }),
  ).toBeVisible();
  await expect(
    page.getByText("Preview", { exact: true }).first(),
  ).toBeVisible();
  // The preview tiles show no invented figures.
  await expect(page.getByLabel("Not available yet")).toHaveCount(4);
  // There is no spacing switch any more.
  await expect(page.getByRole("button", { name: "Comfortable" })).toHaveCount(
    0,
  );
});

test("the Schedule and Team tabs fit a phone in dark mode", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsOwner(page);
  await page.getByRole("button", { name: "Dark theme" }).click();
  for (const tab of ["schedule", "team"]) {
    await page.goto(`${WORKSPACE}?tab=${tab}`);
    await expect(
      page.getByRole("heading", {
        name: tab === "schedule" ? /^Waiting to be planned/ : "Team workload",
      }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }
});

test("the Overview shows instruction onboarding totals on a phone in dark mode", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await signInAsOwner(page);
  const panel = page.getByRole("region", { name: "Instruction onboarding" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("In onboarding")).toBeVisible();
  await expect(panel.getByText("Ready to market")).toBeVisible();
  await panel.getByRole("link", { name: /In onboarding/ }).click();
  await expect(page).toHaveURL(/\/instructions\?stage=onboarding/);
  await page.goBack();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});
