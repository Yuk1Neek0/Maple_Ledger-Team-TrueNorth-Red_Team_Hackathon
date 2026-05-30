import { defineConfig, devices } from "@playwright/test";

// Drives the already-running dev servers; does not start them.
export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    headless: true,
    trace: "off",
    screenshot: "only-on-failure",
    actionTimeout: 10000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
