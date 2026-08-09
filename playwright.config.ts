import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Playwright transpiles this file to CommonJS before loading it, so
// `import.meta.url` is a syntax error here and `__dirname` is the portable
// way to anchor paths.
const root = __dirname;

const PORT = Number(process.env.E2E_PORT ?? 3311);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/** `E2E_DEV=1` swaps `next start` for `next dev` while iterating on a spec. */
const DEV = process.env.E2E_DEV === "1";

/**
 * The hermetic GitHub. Preloaded into the Next server process so every book
 * the suite renders comes from `tests/fixtures/`, not from api.github.com:
 * no rate limit, no network flake, and the same bytes on every machine.
 */
const FIXTURE_PRELOAD = `--require ${path.join(root, "tests/fixtures/github-mock.cjs")}`;

export default defineConfig({
  testDir: path.join(root, "tests/a11y"),
  /** Vitest owns `*.test.ts`; Playwright owns `*.spec.ts`. */
  testMatch: /.*\.spec\.ts$/,
  globalSetup: path.join(root, "tests/support/global-setup.ts"),

  /** Under node_modules so a local run leaves no untracked files behind. */
  outputDir: path.join(root, "node_modules/.cache/playwright/output"),

  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: process.env.CI
    ? [
        ["github"],
        ["html", { outputFolder: path.join(root, "node_modules/.cache/playwright/report"), open: "never" }],
        ["list"],
      ]
    : [
        ["list"],
        ["html", { outputFolder: path.join(root, "node_modules/.cache/playwright/report"), open: "never" }],
      ],

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Pixel-comparing focus rings needs a stable device pixel ratio.
    deviceScaleFactor: 1,
  },

  /**
   * Six projects, one per environment the acceptance checklist names
   * (ARCHITECTURE §7.4). Colour scheme and viewport are orthogonal here on
   * purpose — a contrast bug shows up in the dark project, a reflow bug in the
   * mobile one, and neither masks the other.
   */
  projects: [
    {
      name: "desktop-light",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 1024 }, colorScheme: "light" },
    },
    {
      name: "desktop-dark",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 1024 }, colorScheme: "dark" },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "tablet",
      use: { ...devices["Galaxy Tab S4 landscape"], viewport: { width: 768, height: 1024 } },
    },
    {
      // Windows High Contrast Mode. backdrop-filter is ignored and box-shadow
      // is dropped here, which is what makes translucent menus dangerous.
      //
      // `forcedColors` and `reducedMotion` are BrowserContext options, not
      // top-level `use` options, in Playwright 1.62 — they have to be passed
      // through `contextOptions` or they are silently accepted and ignored at
      // runtime while failing the typecheck.
      name: "forced-colors",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 1024 },
        contextOptions: { forcedColors: "active" },
      },
    },
    {
      name: "reduced-motion",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 1024 },
        contextOptions: { reducedMotion: "reduce" },
      },
    },
  ],

  webServer: {
    command: DEV
      ? `pnpm exec next dev --port ${PORT}`
      : `pnpm exec next start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 180_000,
    env: {
      NODE_OPTIONS: [process.env.NODE_OPTIONS, FIXTURE_PRELOAD].filter(Boolean).join(" "),
      // A token would be unused (nothing reaches the network) but its absence
      // is what the fixture asserts: no live GitHub in the a11y suite.
      GITHUB_TOKEN: "",
      NEXT_PUBLIC_SITE_URL: BASE_URL,
    },
  },
});
