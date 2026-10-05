/**
 * helpers.ts — shared steps for the browser tests.
 * Used by: e2e/*.spec.ts.
 * Depends on: @playwright/test.
 *
 * Accessibility (axe, labels, keyboard, phone targets) is checked on every screen by
 * `npx swp gate` with scenarios.json; these tests check behaviour and results.
 */
import { expect, type Page } from "@playwright/test";

/** Collects uncaught page errors and console errors for the whole test. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return errors;
}

/** On phones the toolbar folds behind the menu button: open it when needed. */
export async function openToolbar(page: Page): Promise<void> {
  if (await page.locator("#menu-btn").isVisible() && (await page.locator("#menu-btn").getAttribute("aria-expanded")) !== "true") {
    await page.locator("#menu-btn").click();
  }
}

/** Loads an example through the top-bar menu (works on any screen) and waits for the answer. */
export async function loadExample(page: Page, index: number): Promise<void> {
  if (page.url() === "about:blank") await page.goto("/");
  await openToolbar(page);
  await page.locator("#examples-menu > summary").click();
  await page.locator("#examples-list button").nth(index).click();
  await expect(page.locator("#results-body .summary .headline")).toBeVisible({ timeout: 20_000 });
}
