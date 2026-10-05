/**
 * playwright.config.ts — browser tests of behaviour (examples, share, consent, offline).
 *
 * Defines: the Playwright projects (desktop light, desktop dark, phone) and the preview
 *          server the tests run against.
 * Used by: `npm run test:e2e`, .github/workflows/ci.yml.
 * Depends on: @playwright/test; e2e/*.spec.ts; public/ (built by `npx swp build`) served
 *             by `swp serve`, which applies public/_headers as Cloudflare does.
 *
 * WHY test public/: it is exactly what is published. Google Chrome is used locally and in
 * CI (the verification gate installs it there too).
 */
import { defineConfig, devices } from "@playwright/test";

const channel = "chrome";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  projects: [
    { name: "desktop-light", use: { ...devices["Desktop Chrome"], channel, colorScheme: "light" } },
    { name: "desktop-dark", use: { ...devices["Desktop Chrome"], channel, colorScheme: "dark" } },
    { name: "phone", use: { ...devices["Pixel 7"], channel, colorScheme: "light" } },
  ],
  webServer: {
    command: "npx swp serve public 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
