/**
 * vite.config.ts — build and test configuration.
 *
 * Defines: the Vite build (static output in dist/ for Cloudflare Pages) and Vitest settings.
 * Used by: npm scripts (dev, build, preview, test).
 * Depends on: vite, vitest.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  build: { outDir: "dist", target: "es2022", sourcemap: true },
  worker: { format: "es" },
  test: { include: ["tests/**/*.test.ts"], environment: "node", testTimeout: 30000 },
});
