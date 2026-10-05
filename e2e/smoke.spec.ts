/**
 * smoke.spec.ts — end-to-end flows: examples, keyboard-only use, sharing, mode tabs,
 * consent, reflow and the offline single file.
 * Depends on: e2e/helpers.ts.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { loadExample, openToolbar, watchErrors } from "./helpers.ts";

test("every example produces an answer without errors", async ({ page }) => {
  const errors = watchErrors(page);
  for (const [i, text] of [[0, "2 possible periods"], [1, "possible period"], [2, "possible period"], [3, "candidate area"]] as const) {
    await loadExample(page, i);
    await expect(page.locator("#results-body")).toContainText(text);
  }
  expect(errors).toEqual([]);
});

test("a case can be completed with the keyboard only", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard flow is a desktop concern");
  await page.goto("/");
  // Reach the first start-screen choice by tabbing, then activate it.
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    if (await page.locator(".choice").first().evaluate((el) => el === document.activeElement)) break;
  }
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-field="site.loc"]')).toBeFocused();
  await page.keyboard.type("48.8584, 2.2945");
  await page.locator(".gstep-actions .btn").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-field$=".h"]')).toBeFocused();
  const values = ["1.2", "0.02", "1.43", "0.04", "308.2", "4"];
  for (const [k, v] of values.entries()) {
    await page.keyboard.type(v);
    if (k < values.length - 1) {
      // Skip the "i" buttons between fields.
      do await page.keyboard.press("Tab");
      while (!(await page.evaluate(() => document.activeElement?.tagName === "INPUT")));
    }
  }
  await expect(page.locator(".summary .headline")).toContainText("2 possible periods", { timeout: 20_000 });
});

test("share links: the tool link carries no data", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "clipboard permissions");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await loadExample(page, 0);
  expect(page.url()).not.toContain("#");
  await openToolbar(page);
  await page.locator("#share-menu > summary").click();
  await page.locator("#share-tool").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).not.toContain("#");
  await openToolbar(page);
  await page.locator("#share-menu > summary").click();
  await page.locator("#share-calc").click();
  // The platform's warning lists what the link contains; nothing is copied before "Copy".
  await expect(page.locator("#share-dialog")).toBeVisible();
  await expect(page.locator("#share-dialog")).toContainText("48.8584");
  await page.locator("#share-dialog [data-answer='copy']").click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain("#");
  const other = await context.newPage();
  await other.goto(link);
  await expect(other.locator('[data-field="site.loc"], .gstep-summary').first()).toBeVisible();
  await expect(other.locator(".summary .headline")).toContainText("possible period", { timeout: 20_000 });
  expect(other.url()).not.toContain("#");
});

test("mode switch keeps the page usable", async ({ page }) => {
  const errors = watchErrors(page);
  await loadExample(page, 0);
  await page.locator("#tab-place").click();
  await expect(page.locator("#results-body")).toContainText(/Still needed|candidate area/);
  await page.locator("#tab-time").click();
  await expect(page.locator(".summary .headline")).toContainText("possible period", { timeout: 20_000 });
  expect(errors).toEqual([]);
});

test("no request leaves the site unless the user enables the map", async ({ page, baseURL }) => {
  const foreign: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith("http") && u.origin !== new URL(baseURL as string).origin) foreign.push(u.origin);
  });
  for (const i of [0, 1, 2, 3]) await loadExample(page, i);
  await page.locator(".evidence > summary").click();
  await page.locator("#tab-time").click();
  await expect(page.locator(".summary .headline")).toBeVisible({ timeout: 20_000 });
  expect(foreign).toEqual([]);
});

for (const width of [320, 390]) {
  test(`reflows without horizontal scrolling at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await loadExample(page, 0);
    await page.locator(".claim-card > summary").click();
    await page.locator(".evidence > summary").click();
    await expect(page.locator("canvas.heatmap")).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await loadExample(page, 3);
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
}

test("the single-file download computes an answer offline", async ({ page, isMobile }) => {
  test.skip(isMobile, "phones use the hosted site, not the downloaded file");
  const errors = watchErrors(page);
  const file = pathToFileURL(path.resolve(import.meta.dirname, "../public/shadowclock.html")).href;
  const foreign: string[] = [];
  page.on("request", (r) => {
    if (r.url().startsWith("http")) foreign.push(r.url());
  });
  await page.goto(file);
  await page.locator(".landing .example-buttons button").first().click();
  await expect(page.locator(".summary .headline")).toContainText("2 possible periods", { timeout: 20_000 });
  expect(foreign).toEqual([]);
  expect(errors).toEqual([]);
});

test("map tiles load only after consent, and only from the declared server", async ({ page }) => {
  const tiles: string[] = [];
  const foreign: string[] = [];
  // Stub the tile server: the test checks what the app asks for, not OpenStreetMap.
  await page.route("https://tile.openstreetmap.org/**", (route) => {
    tiles.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "image/png", body: Buffer.alloc(0) });
  });
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith("http") && u.hostname !== "localhost" && u.hostname !== "tile.openstreetmap.org") foreign.push(r.url());
  });
  await page.goto("/");
  await page.locator(".choice").first().click();
  await page.getByRole("button", { name: "Pick on a map" }).click();
  const dialog = page.locator("#consent-dialog");
  await expect(dialog).toBeVisible();
  expect(tiles).toEqual([]);
  await page.keyboard.press("Escape"); // Esc = Deny
  await expect(dialog).toBeHidden();
  await page.waitForTimeout(500);
  expect(tiles).toEqual([]);
  await page.getByRole("button", { name: "Pick on a map" }).click();
  await dialog.locator("[data-answer='session']").click();
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect.poll(() => tiles.length).toBeGreaterThan(0);
  expect(foreign).toEqual([]);
});
