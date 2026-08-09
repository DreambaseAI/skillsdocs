import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Unit tests only.
 *
 * The include pattern is `*.test.ts` and nothing else, on purpose: Playwright
 * specs are `*.spec.ts`, and vitest's default glob would otherwise collect
 * them, import `@playwright/test` outside a Playwright runner, and fail with
 * an error that says nothing about the real problem. One extension, one
 * runner.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.join(root, "src") },
  },
  test: {
    root,
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "tests/fixtures/**"],
    environment: "node",
    reporters: process.env.CI ? ["default", "github-actions"] : ["default"],
  },
});
