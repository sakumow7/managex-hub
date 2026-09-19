import { expect, test, type Page } from "@playwright/test";
const password = process.env.DEMO_PASSWORD || "SamplePass123!";
async function signIn(page: Page, account: string) {
  await page.goto("/");
  await page.getByLabel("Email address").fill(`${account}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "New ticket", exact: true }),
  ).toBeVisible();
}
async function signOut(page: Page) {
  const close = page.getByRole("button", { name: "Close ticket", exact: true });
  if (await close.count()) await close.click();
  await page.getByRole("button", { name: "Sign out" }).click();
}
async function open(page: Page, title: string) {
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
}

test("CST intake, assignment, private notes, requester reply, blocked work, and closeout", async ({
  page,
}) => {
  const title = `CST browser ticket ${Date.now()}`;
  await signIn(page, "requester");
  await page.getByRole("button", { name: "New ticket", exact: true }).click();
  await page.getByLabel("Ticket title").fill(title);
  await page
    .getByLabel("Description")
    .fill("Fictional test device cannot open a demo application.");
  await page.getByLabel("Affected device or service").fill("DEMO-BROWSER");
  await page
    .getByRole("button", { name: "Create ticket", exact: true })
    .click();
  await open(page, title);
  await expect(page.getByRole("button", { name: "Save update" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Attach sample file" }).click();
  await expect(
    page.getByRole("button", {
      name: "sample-troubleshooting-note.txt",
      exact: true,
    }),
  ).toBeVisible();
  await signOut(page);

  await signIn(page, "supervisor");
  await open(page, title);
  await page
    .getByRole("combobox", { name: "Assign agent", exact: true })
    .selectOption({ label: "Jordan Ellis" });
  await page.getByRole("button", { name: "Save update" }).click();
  await expect(
    page.getByRole("combobox", { name: "Status", exact: true }),
  ).toHaveValue("assigned");
  await signOut(page);

  await signIn(page, "technician");
  await open(page, title);
  await page
    .getByRole("checkbox", { name: "Internal note", exact: true })
    .check();
  await page
    .getByLabel("Message")
    .fill("Private diagnostic details for staff.");
  await page.getByRole("button", { name: "Post message" }).click();
  await expect(page.locator(".conversation")).toContainText(
    "Private diagnostic details for staff.",
  );
  await page
    .getByRole("checkbox", { name: "Internal note", exact: true })
    .uncheck();
  await page.getByLabel("Message").fill("We are investigating your issue.");
  await page.getByRole("button", { name: "Post message" }).click();
  await expect(page.locator(".conversation")).toContainText(
    "We are investigating your issue.",
  );
  for (const status of ["in_progress", "blocked", "in_progress", "completed"]) {
    await page
      .getByRole("combobox", { name: "Status", exact: true })
      .selectOption(status);
    await page.getByRole("button", { name: "Save update" }).click();
    await expect(
      page.getByRole("dialog").locator(".detail-badges"),
    ).toContainText(
      status.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase()),
    );
  }
  await signOut(page);

  await signIn(page, "requester");
  await open(page, title);
  await expect(page.locator(".conversation")).toContainText(
    "We are investigating your issue.",
  );
  await expect(page.getByRole("dialog")).not.toContainText(
    "Private diagnostic",
  );
  await page
    .getByLabel("Message")
    .fill("The sample issue is resolved. Thank you.");
  await page.getByRole("button", { name: "Post message" }).click();
  await expect(page.locator(".conversation")).toContainText(
    "The sample issue is resolved.",
  );
  await signOut(page);

  await signIn(page, "supervisor");
  await open(page, title);
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("closed");
  await page.getByRole("button", { name: "Save update" }).click();
  await expect(
    page.getByRole("dialog").locator(".detail-badges"),
  ).toContainText("Closed");
  await expect(page.getByRole("button", { name: "Save update" })).toHaveCount(
    0,
  );
});

test("CST creates a restricted security handoff and cyber staff can read it", async ({
  page,
}) => {
  const title = `Restricted browser task ${Date.now()}`;
  await signIn(page, "technician");
  await open(page, "VPN disconnects after sign-in");
  await page
    .getByRole("button", { name: "Create linked task", exact: true })
    .click();
  await page.getByLabel("Ticket title").fill(title);
  await page
    .getByLabel("Description")
    .fill("Fictional restricted investigation detail.");
  await page.getByLabel("Affected device or service").fill("DEMO-SECURITY");
  await page
    .getByRole("combobox", { name: "Ticket type", exact: true })
    .selectOption("security");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create linked task", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Restricted task delivered",
  );
  await page
    .getByRole("button", { name: "Cybersecurity", exact: true })
    .click();
  await page.getByLabel("Search tickets").fill(title);
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await signOut(page);
  await signIn(page, "cyber");
  await open(page, title);
  await expect(page.getByRole("dialog")).toContainText(
    "Fictional restricted investigation detail.",
  );
});

test("filters CST tickets and exports a report", async ({ page }) => {
  await signIn(page, "supervisor");
  await page.getByLabel("Search tickets").fill("Shared printer unavailable");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await downloaded).suggestedFilename()).toBe("managex-tickets.csv");
});

test("invalid login is rejected", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Email address").fill("requester@example.com");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Invalid email or password",
  );
});
