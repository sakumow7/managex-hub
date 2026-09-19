import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: process.env.BASE_URL || "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    headless: true,
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: !process.env.CI,
      },
});
