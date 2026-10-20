import { expect, test, type Page } from "@playwright/test";

const WORKSPACE = "/dashboard/w/oakfield-lettings-demo";
const MISSING = "0b6f2b1e-5d3a-4c8e-9a41-7f2c1d9e8a60";

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

test("a missing or hidden record keeps the app shell and gives nothing away", async ({
  page,
}) => {
  await signInAsOwner(page);
  for (const path of [
    `/contacts/${MISSING}`,
    `/properties/${MISSING}`,
    `/enquiries/${MISSING}`,
    `/instructions/${MISSING}`,
    `/contacts/not-a-real-id`,
    `/properties/not-a-real-id`,
    `/enquiries/not-a-real-id`,
    `/enquiries/not-a-real-id/edit`,
    `/enquiries/not-a-real-id/book-appraisal`,
    `/enquiries/not-a-real-id/start-instruction`,
    `/enquiries/${MISSING}/edit`,
    `/enquiries/${MISSING}/book-appraisal`,
    `/enquiries/${MISSING}/start-instruction`,
    `/instructions/not-a-real-id`,
  ]) {
    await page.goto(`${WORKSPACE}${path}`);
    await expect(
      page.getByRole("heading", { name: /not found/i }),
      path,
    ).toBeVisible();
    // The shell is still there, so the person can carry on.
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
      path,
    ).toBeVisible();
    await expect(page.getByLabel("Search the workspace"), path).toBeVisible();
  }
  // The way back leads to the list it names, not somewhere else.
  for (const [path, button, list] of [
    ["contacts", /Back to contacts/, "/contacts"],
    ["properties", /Back to properties/, "/properties"],
    ["enquiries", /Back to landlord leads/, "/enquiries"],
    ["instructions", /Back to instructions/, "/instructions"],
  ] as const) {
    await page.goto(`${WORKSPACE}/${path}/${MISSING}`);
    await page.getByRole("button", { name: button }).click();
    await expect(page, path).toHaveURL(new RegExp(`${WORKSPACE}${list}$`));
  }
  await page.goto(`${WORKSPACE}/enquiries/not-a-real-id/edit`);
  await expect(page.getByRole("heading", { name: /not found/i })).toBeVisible();
});

test("every main page has one heading, a main area and a title", async ({
  page,
}) => {
  await signInAsOwner(page);
  for (const path of [
    "",
    "?tab=landlords",
    "?tab=management",
    "/enquiries",
    "/landlords",
    "/instructions",
    "/properties",
    "/contacts",
    "/settings",
  ]) {
    await page.goto(`${WORKSPACE}${path}`);
    await expect(page.getByRole("main"), path).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 }), path).toHaveCount(1);
    expect((await page.title()).trim().length, path).toBeGreaterThan(0);
  }
});

test("the first Tab stop is a skip link that moves focus to the page content", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("the workspace search can be used with the keyboard alone", async ({
  page,
}) => {
  await signInAsOwner(page);
  const search = page.getByLabel("Search the workspace");
  await search.focus();
  await page.keyboard.type("Eleanor");
  const results = page.getByRole("region", { name: "Search results" });
  await expect(
    results.getByRole("link", { name: /Eleanor Price/ }),
  ).toBeVisible();
  // Down arrow or Tab moves from the box into the results.
  await page.keyboard.press("ArrowDown");
  await expect(
    results.getByRole("link", { name: /Eleanor Price/ }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: /Eleanor Price/ }),
  ).toBeVisible();
  // Escape closes the results without leaving the box.
  await search.focus();
  await page.keyboard.type("Eleanor");
  await expect(results).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(results).toBeHidden();
  await expect(search).toBeFocused();
});

test("the Contacts menu group opens and closes from the keyboard", async ({
  page,
}) => {
  await signInAsOwner(page);
  const contacts = page.getByRole("button", { name: "Contacts" });
  await contacts.focus();
  await expect(contacts).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect(contacts).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "All contacts" })).toBeFocused();
  await contacts.focus();
  await page.keyboard.press("Space");
  await expect(contacts).toHaveAttribute("aria-expanded", "false");
});

test("every field on the main forms has a name a screen reader can announce", async ({
  page,
}) => {
  await signInAsOwner(page);
  for (const path of [
    "/enquiries/new",
    "/contacts/new",
    "/properties/new",
    "/enquiries",
    "/contacts",
    "/properties",
    "/instructions",
    "/landlords",
    "/settings/enquiries",
    "/settings/users",
  ]) {
    await page.goto(`${WORKSPACE}${path}`);
    await expect(page.getByRole("main")).toBeVisible();
    const unnamed = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          'main input:not([type="hidden"]), main select, main textarea, main [role="combobox"], header input, header [role="combobox"]',
        ),
      ]
        .filter((el) => {
          if (el.closest("[hidden], [aria-hidden='true']")) return false;
          // Next.js adds its own hidden bookkeeping fields to server forms.
          if ((el.getAttribute("name") ?? "").startsWith("$ACTION")) {
            return false;
          }
          const input = el as HTMLInputElement;
          const labelled =
            (input.labels && input.labels.length > 0) ||
            el.getAttribute("aria-label") ||
            el.getAttribute("aria-labelledby") ||
            el.getAttribute("title");
          return !labelled;
        })
        .map(
          (el) =>
            `${el.tagName.toLowerCase()}[name=${el.getAttribute("name")}][id=${el.id}]`,
        ),
    );
    expect(unnamed, path).toEqual([]);
  }
});

test("a dialog traps focus, closes with Escape and returns focus", async ({
  page,
}) => {
  await signInAsOwner(page);
  const opener = page.getByRole("button", { name: "Add action" }).first();
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Focus stays inside the dialog and wraps round while tabbing. The dialog
  // moves focus back a moment after it reaches the last control, so wait for
  // it to settle rather than reading it instantly.
  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press("Tab");
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            Boolean(document.activeElement?.closest('[role="dialog"]')),
          ),
        { message: `Tab ${step + 1}`, timeout: 2_000 },
      )
      .toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});
