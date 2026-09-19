import { defineConfig } from "@playwright/test";

const port = Number(process.env.E2E_PORT || "5173");

export default defineConfig({
  testDir: "./tests",
  testMatch:
    process.env.DEMO_E2E === "true"
      ? "**/portfolio.spec.ts"
      : "**/workflow.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: process.env.BASE_URL || `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --port ${port} --strictPort`,
        url: `http://127.0.0.1:${port}`,
        reuseExistingServer: !process.env.CI,
      },
});
