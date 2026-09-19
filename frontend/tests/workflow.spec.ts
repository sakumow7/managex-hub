import { expect, test, type Page } from "@playwright/test";

const password = process.env.DEMO_PASSWORD || "SamplePass123!";
async function signIn(page: Page, role: string) {
  await page.goto("/");
  await page.getByLabel("Email address").fill(`${role}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A clear view of the work." }),
  ).toBeVisible();
}

test("requester submits, supervisor assigns, technician completes, supervisor closes", async ({
  page,
}) => {
  const title = `Sample lighting request ${Date.now()}`;
  await signIn(page, "requester");
  await page.getByRole("button", { name: "New request" }).click();
  await page.getByLabel("Request title").fill(title);
  await page
    .getByLabel("Description")
    .fill("Fictional light fixture requires a sample inspection.");
  await page.getByLabel("Location", { exact: true }).fill("Example hall");
  await page
    .getByRole("button", { name: "Create request", exact: true })
    .click();
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await expect(page.getByRole("button", { name: "Save update" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Attach sample file" }).click();
  await expect(
    page.getByRole("button", {
      name: "sample-maintenance-note.txt",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close work order", exact: true })
    .click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await signIn(page, "supervisor");
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await page
    .getByLabel("Assign technician")
    .selectOption({ label: "Jordan Ellis" });
  await page.getByRole("button", { name: "Save update" }).click();
  await expect(
    page.getByRole("combobox", { name: "Status", exact: true }),
  ).toHaveValue("assigned");
  await page
    .getByRole("button", { name: "Close work order", exact: true })
    .click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await signIn(page, "technician");
  await page.getByRole("button", { name: new RegExp(title) }).click();
  for (const status of ["in_progress", "completed"]) {
    await page
      .getByRole("combobox", { name: "Status", exact: true })
      .selectOption(status);
    await page.getByRole("button", { name: "Save update" }).click();
    await expect(page.locator(".timeline")).toContainText(`→ ${status}`);
  }
  await page
    .getByRole("button", { name: "Close work order", exact: true })
    .click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await signIn(page, "supervisor");
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("closed");
  await page.getByRole("button", { name: "Save update" }).click();
  await expect(
    page.getByRole("dialog").getByText("Closed", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save update" })).toHaveCount(
    0,
  );
});

test("filters inspections and exports a report", async ({ page }) => {
  await signIn(page, "supervisor");
  await page.getByRole("button", { name: "Inspections", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Inspection queue" }),
  ).toBeVisible();
  await page.getByLabel("Search work orders").fill("safety walk");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await downloaded).suggestedFilename()).toBe(
    "managex-work-orders.csv",
  );
});

test("rejects invalid login", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Email address").fill("requester@example.com");
  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Invalid email or password",
  );
});
