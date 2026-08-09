/**
 * Screenshot sweep. Drives a real browser over the routes that matter at every
 * breakpoint in both schemes, and reports console errors and horizontal
 * overflow — the two failures that never show up in a unit test.
 *
 *   pnpm shots [baseUrl]
 */

import { mkdirSync, rmSync } from "node:fs";
import { chromium, type ConsoleMessage } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = "/tmp/skillsbook-shots";

const ROUTES: Array<[string, string]> = [
  ["home", "/"],
  ["book-anthropics", "/anthropics/skills"],
  ["chapter-skill-creator", "/anthropics/skills/skill-creator"],
  ["book-mattpocock", "/mattpocock/skills"],
  ["book-stripe", "/stripe/agent-toolkit"],
  ["book-dreambase", "/DreambaseAI/skills"],
  ["book-empty", "/vercel-labs/next-skills"],
  ["search", "/search?q=pdf"],
];

const VIEWPORTS: Array<[string, number, number]> = [
  ["1920", 1920, 1080],
  ["1440", 1440, 900],
  ["1024", 1024, 768],
  ["768", 768, 1024],
  ["390", 390, 844],
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const problems: string[] = [];

for (const scheme of ["light", "dark"] as const) {
  const context = await browser.newContext({ colorScheme: scheme });

  for (const [vpName, width, height] of VIEWPORTS) {
    // The wide desktop treatment only differs above 1280; don't shoot every
    // route at every width, that's 80 screenshots nobody will look at.
    const routes =
      vpName === "1920" || vpName === "390" ? ROUTES : ROUTES.slice(0, 3);

    for (const [name, path] of routes) {
      const page = await context.newPage();
      await page.setViewportSize({ width, height });

      const errors: string[] = [];
      page.on("console", (m: ConsoleMessage) => {
        if (m.type() === "error") errors.push(m.text().slice(0, 200));
      });
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));

      try {
        const res = await page.goto(`${BASE}${path}`, {
          waitUntil: "networkidle",
          timeout: 60_000,
        });
        const status = res?.status() ?? 0;
        if (status >= 400 && name !== "book-empty") {
          problems.push(`${path} [${vpName}/${scheme}] HTTP ${status}`);
        }

        // Give streamed Suspense content a moment to land.
        await page.waitForTimeout(1200);

        const overflow = await page.evaluate(() => {
          const d = document.documentElement;
          return Math.max(0, d.scrollWidth - d.clientWidth);
        });
        if (overflow > 0) {
          problems.push(`${path} [${vpName}/${scheme}] horizontal overflow ${overflow}px`);
        }

        await page.screenshot({
          path: `${OUT}/${scheme}-${vpName}-${name}.png`,
          fullPage: vpName === "1920" || vpName === "390",
        });

        for (const e of errors) {
          problems.push(`${path} [${vpName}/${scheme}] console: ${e}`);
        }
      } catch (err) {
        problems.push(`${path} [${vpName}/${scheme}] FAILED: ${(err as Error).message.slice(0, 160)}`);
      }
      await page.close();
    }
  }
  await context.close();
}

await browser.close();

console.log(`\nScreenshots → ${OUT}`);
if (problems.length === 0) {
  console.log("\x1b[32mNo console errors, no horizontal overflow, no bad statuses.\x1b[0m\n");
} else {
  console.log(`\n\x1b[31m${problems.length} problem(s):\x1b[0m`);
  // Collapse the same message repeated across viewports.
  const seen = new Map<string, number>();
  for (const p of problems) {
    const key = p.replace(/\[\d+\/(light|dark)\]/, "[*]");
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [msg, n] of [...seen.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}x  ${msg}`);
  }
  console.log();
}
