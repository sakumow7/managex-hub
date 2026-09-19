import { expect, test, type Page } from "@playwright/test";

async function launch(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Every ticket/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Launch the demo|Continue my demo/ })
    .click();
  await expect(page.getByLabel("Demo role")).toBeVisible({ timeout: 120_000 });
}

test("portfolio visitor switches roles through intake and private conversation", async ({
  page,
}) => {
  await launch(page);
  await page.getByLabel("Demo role").selectOption("requester");
  await expect(
    page.getByRole("heading", { name: "All tickets", exact: true }),
  ).toBeVisible();
  const title = `Portfolio request ${Date.now()}`;
  await page.getByRole("button", { name: "New ticket", exact: true }).click();
  await page.getByLabel("Ticket title").fill(title);
  await page
    .getByLabel("Description")
    .fill("Fictional device cannot reach the demo application.");
  await page.getByLabel("Affected device or service").fill("DEMO-PORTFOLIO");
  await page
    .getByRole("button", { name: "Create ticket", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("created");
  await page.getByLabel("Demo role").selectOption("supervisor");
  await expect(
    page.getByRole("heading", { name: "CST Service Desk", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await page.getByLabel("Assign agent").selectOption({ label: "Jordan Ellis" });
  await page.getByRole("button", { name: "Save update" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("combobox", { name: "Status", exact: true }),
  ).toHaveValue("assigned");
  await page.getByRole("button", { name: "Close ticket", exact: true }).click();
  await page.getByLabel("Demo role").selectOption("technician");
  await expect(
    page.getByRole("button", { name: new RegExp(title) }),
  ).toBeVisible();
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await page
    .getByRole("checkbox", { name: "Internal note", exact: true })
    .check();
  await page.getByLabel("Message").fill("Staff-only fictional investigation.");
  await page.getByRole("button", { name: "Post message" }).click();
  await expect(page.locator(".conversation")).toContainText(
    "Staff-only fictional investigation.",
  );
  await page.getByRole("button", { name: "Close ticket", exact: true }).click();
  await page.getByLabel("Demo role").selectOption("requester");
  await expect(
    page.getByRole("heading", { name: "All tickets", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await expect(page.getByRole("dialog")).not.toContainText(
    "Staff-only fictional investigation.",
  );
  await page.reload();
  await page.getByRole("button", { name: "Continue my demo" }).click();
  await expect(page.getByLabel("Demo role")).toBeVisible({ timeout: 120_000 });
  await expect(
    page.getByRole("button", { name: new RegExp(title) }),
  ).toBeVisible();
});

test("two visitors get separate data and keyboard-friendly mobile entry", async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await launch(page);
  await page.getByRole("button", { name: "New ticket", exact: true }).click();
  const title = `Only visitor one ${Date.now()}`;
  await page.getByLabel("Ticket title").fill(title);
  await page
    .getByLabel("Description")
    .fill("A fictional issue in this visitor workspace.");
  await page.getByLabel("Affected device or service").fill("DEMO-ONE");
  await page
    .getByRole("button", { name: "Create ticket", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("created");
  const otherContext = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  const other = await otherContext.newPage();
  await launch(other);
  await other.getByLabel("Search tickets").fill(title);
  await expect(other.locator("tbody tr")).toHaveCount(0);
  await otherContext.close();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("radio", { name: /CST agent/ }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("radio", { name: /CST agent/ })).toBeChecked();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("sleeping-server feedback and capacity errors remain actionable", async ({
  page,
}) => {
  await page.route("**/api/health", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.fulfill({ json: { status: "ok" } });
  });
  await page.route("**/api/demo/sessions", (route) =>
    route.fulfill({
      status: 503,
      json: {
        detail:
          "The free demo is busy. Please try again later or explore the source code.",
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Launch the demo" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Waking the demo server",
  );
  await expect(page.getByRole("alert")).toContainText("free demo is busy");
  await expect(
    page.getByRole("button", { name: "Launch the demo" }),
  ).toBeEnabled();
});
