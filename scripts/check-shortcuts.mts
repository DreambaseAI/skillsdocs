/**
 * Presses every shortcut in the keymap on every reading route and asserts that
 * something actually changed.
 *
 * This script exists because a grep is not evidence. Eleven of the sixteen
 * shortcuts in `lib/shortcuts.ts` were declared, documented and drawn as key
 * caps in the help dialog while nothing anywhere subscribed to them — the unit
 * suite passed, the types passed, and the keys were dead. The only test that
 * could have caught that is one that presses the key in a browser and looks at
 * the page afterwards.
 *
 * Every row asserts an *observable* consequence: a URL, a scroll offset, a
 * dialog count, the clipboard, a class on `<html>`, a focused element. "The
 * handler ran" is not a result.
 *
 *   pnpm check:shortcuts                    # against http://localhost:3150
 *   BASE=http://localhost:3210 pnpm check:shortcuts
 *
 * Note on `page.evaluate`: tsx's transform rewrites named arrow functions in a
 * way Playwright cannot serialise, so every probe below is passed as a string.
 */

import { chromium, type BrowserContext, type Page } from "@playwright/test";

const BASE = (process.env.BASE ?? "http://localhost:3150").replace(/\/+$/, "");
const BOOK = "/anthropics/skills";
const CHAPTER = "/anthropics/skills/skill-creator";
const SUBCHAPTER = "/anthropics/skills/pdf/scripts/fill_fillable_fields.py";

const ROUTES: Array<{ id: string; path: string }> = [
  { id: "book", path: BOOK },
  { id: "chapter", path: CHAPTER },
  { id: "subchapter", path: SUBCHAPTER },
];

/* ------------------------------------------------------------- probes */

/** One snapshot of everything a shortcut could plausibly move. */
const SNAPSHOT = `(() => {
  const html = document.documentElement;
  const dialogs = [...document.querySelectorAll('[role="dialog"]')]
    .filter((el) => el.getBoundingClientRect().height > 0);
  return {
    url: location.pathname + location.hash,
    scrollY: Math.round(window.scrollY),
    scheme: html.classList.contains("dark") ? "dark" : "light",
    focusMode: html.getAttribute("data-focus-mode"),
    size: html.style.getPropertyValue("--reader-size-step"),
    dialogs: dialogs.length,
    dialogTitles: dialogs.map((el) => (el.textContent ?? "").slice(0, 40)),
    activeId: document.activeElement ? document.activeElement.id : "",
    status: (document.getElementById("page-status") || {}).textContent || "",
  };
})()`;

const RESET_SCROLL = `(() => { window.scrollTo({ top: 0, behavior: "instant" }); return true; })()`;
const SCROLL_TO_MIDDLE = `(() => { window.scrollTo({ top: 1200, behavior: "instant" }); return true; })()`;
const CLEAR_CLIPBOARD = `navigator.clipboard.writeText("__none__")`;
const READ_CLIPBOARD = `navigator.clipboard.readText()`;

type Snapshot = {
  url: string;
  scrollY: number;
  scheme: string;
  focusMode: string | null;
  size: string;
  dialogs: number;
  dialogTitles: string[];
  activeId: string;
  status: string;
};

/* ------------------------------------------------------------- harness */

interface Row {
  key: string;
  action: string;
  route: string;
  observed: string;
  pass: boolean;
}

const rows: Row[] = [];

function record(key: string, action: string, route: string, pass: boolean, observed: string) {
  rows.push({ key, action, route, observed, pass });
  process.stdout.write(
    `${pass ? "  PASS" : "  FAIL"}  ${key.padEnd(12)} ${action.padEnd(12)} ${observed}\n`,
  );
}

async function snap(page: Page): Promise<Snapshot> {
  return (await page.evaluate(SNAPSHOT)) as Snapshot;
}

/** A fresh, fully hydrated page at `path`. */
async function open(ctx: BrowserContext, path: string): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: "load" });
  // The keyboard layer lives behind Suspense islands; wait for the one piece
  // of chrome that proves the client tree mounted, then let the rest settle.
  await page.locator('[data-slot="controls-trigger"]').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1200);
  await page.evaluate(RESET_SCROLL);
  return page;
}

/** Press a key on the document, not on a control. */
async function press(page: Page, key: string, settle = 700) {
  await page.locator("body").press(key);
  await page.waitForTimeout(settle);
}

/* --------------------------------------------------------------- suite */

async function runRoute(ctx: BrowserContext, route: { id: string; path: string }) {
  process.stdout.write(`\n── ${route.id} (${route.path})\n`);

  /* ] and [ — chapter navigation ------------------------------------- */
  {
    const page = await open(ctx, route.path);
    const before = await snap(page);
    await press(page, "]", 1500);
    const after = await snap(page);
    const moved = after.url !== before.url;
    const bounded = /Last chapter/i.test(after.status);
    record("]", "nextChapter", route.id, moved || bounded,
      moved ? `url ${before.url} → ${after.url}` : `announced "${after.status}"`);
    await page.close();
  }
  {
    const page = await open(ctx, route.path);
    const before = await snap(page);
    await press(page, "[", 1500);
    const after = await snap(page);
    const moved = after.url !== before.url;
    const bounded = /First chapter/i.test(after.status);
    record("[", "prevChapter", route.id, moved || bounded,
      moved ? `url ${before.url} → ${after.url}` : `announced "${after.status}"`);
    await page.close();
  }

  /* → ← Space ⇧Space — page turning ---------------------------------- */
  {
    const page = await open(ctx, route.path);
    const before = await snap(page);
    await press(page, "ArrowRight", 900);
    const down = await snap(page);
    record("→", "pageDown", route.id, down.scrollY > before.scrollY + 100,
      `scrollY ${before.scrollY} → ${down.scrollY}`);

    await page.evaluate(SCROLL_TO_MIDDLE);
    await page.waitForTimeout(200);
    const mid = await snap(page);
    await press(page, "ArrowLeft", 900);
    const up = await snap(page);
    record("←", "pageUp", route.id, up.scrollY < mid.scrollY - 100,
      `scrollY ${mid.scrollY} → ${up.scrollY}`);

    await page.evaluate(RESET_SCROLL);
    await page.waitForTimeout(200);
    const zero = await snap(page);
    await press(page, "Space", 900);
    const spaced = await snap(page);
    // Must be one page, not two: the native Space scroll used to land on top
    // of ours. 90% of the viewport, with generous slack for the sticky header.
    const viewport = page.viewportSize()?.height ?? 720;
    const oneScreen = spaced.scrollY > viewport * 0.6 && spaced.scrollY < viewport * 1.3;
    record("Space", "pageDown", route.id, spaced.scrollY > zero.scrollY + 100 && oneScreen,
      `scrollY ${zero.scrollY} → ${spaced.scrollY} (viewport ${viewport})`);

    await press(page, "Shift+Space", 900);
    const back = await snap(page);
    record("⇧Space", "pageUp", route.id, back.scrollY < spaced.scrollY - 100,
      `scrollY ${spaced.scrollY} → ${back.scrollY}`);
    await page.close();
  }

  /* T — contents ------------------------------------------------------ */
  {
    const page = await open(ctx, route.path);
    const before = await snap(page);
    await press(page, "t", 1500);
    const after = await snap(page);
    const focused = after.activeId === "contents";
    const navigated = after.url !== before.url && after.url.includes("#contents");
    record("T", "toc", route.id, focused || navigated,
      focused ? `focus → #contents` : `url ${before.url} → ${after.url}`);
    await page.close();
  }

  /* G B / G H — chords ------------------------------------------------ */
  {
    const page = await open(ctx, route.path);
    const before = await snap(page);
    await page.locator("body").press("g");
    await page.waitForTimeout(150);
    await page.locator("body").press("b");
    await page.waitForTimeout(1500);
    const after = await snap(page);
    // On the cover itself there is no URL to change, so the announcement is
    // the observable — otherwise this row would pass for a dead key.
    const landed = after.url === BOOK;
    const moved = route.path === BOOK ? /Cover/i.test(after.status) : after.url !== before.url;
    record("G B", "goCover", route.id, landed && moved,
      `url ${before.url} → ${after.url} · "${after.status}"`);
    await page.close();
  }
  {
    const page = await open(ctx, route.path);
    const opened = ctx.waitForEvent("page", { timeout: 6000 }).catch(() => null);
    await page.locator("body").press("g");
    await page.waitForTimeout(150);
    await page.locator("body").press("h");
    const tab = await opened;
    const url = tab ? tab.url() : "(no tab)";
    record("G H", "goGitHub", route.id, url.startsWith("https://github.com/anthropics/skills"),
      `opened ${url}`);
    if (tab) await tab.close();
    await page.close();
  }

  /* C / ⇧C — clipboard ------------------------------------------------ */
  {
    const page = await open(ctx, route.path);
    await page.evaluate(CLEAR_CLIPBOARD);
    await press(page, "c", 900);
    const install = (await page.evaluate(READ_CLIPBOARD)) as string;
    record("C", "copyInstall", route.id, install === "npx skills add anthropics/skills",
      `clipboard "${install}"`);

    await page.evaluate(CLEAR_CLIPBOARD);
    await press(page, "Shift+C", 900);
    const link = (await page.evaluate(READ_CLIPBOARD)) as string;
    record("⇧C", "copyLink", route.id, link === `${BASE}${route.path}`,
      `clipboard "${link}"`);
    await page.close();
  }

  /* D — theme --------------------------------------------------------- */
  {
    // next-themes persists the choice, so the previous route's run would
    // otherwise decide which edge of the cycle this one starts on — and one of
    // the three edges is, unavoidably, a repaint of the same colours (two of
    // {light, dark, system} always render identically). Start from a known
    // "system" and walk the whole cycle: the two steps away from "system" must
    // both flip the page, and the third must land back on "system".
    const page = await ctx.newPage();
    await page.goto(`${BASE}${route.path}`, { waitUntil: "domcontentloaded" });
    await page.evaluate(`(() => { localStorage.removeItem("theme"); return true; })()`);
    await page.reload({ waitUntil: "load" });
    await page.locator('[data-slot="controls-trigger"]').first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1200);

    const seen: string[] = [(await snap(page)).scheme];
    const stored: string[] = [];
    for (let i = 0; i < 3; i++) {
      await press(page, "d", 700);
      seen.push((await snap(page)).scheme);
      stored.push(
        ((await page.evaluate(`localStorage.getItem("theme")`)) as string) ?? "(unset)",
      );
    }
    const flipped = seen[1] !== seen[0] && seen[2] !== seen[1];
    const cycled = stored[2] === "system";
    record("D", "themeCycle", route.id, flipped && cycled,
      `rendered ${seen.join(" → ")} · stored ${stored.join(" → ")}`);
    await page.close();
  }

  /* / and ⌘K — search ------------------------------------------------- */
  {
    const page = await open(ctx, route.path);
    const before = await snap(page);
    await press(page, "/", 900);
    const after = await snap(page);
    record("/", "search", route.id, after.dialogs > before.dialogs,
      `dialogs ${before.dialogs} → ${after.dialogs} ${JSON.stringify(after.dialogTitles)}`);
    await page.close();
  }
  {
    const page = await open(ctx, route.path);
    const before = await snap(page);
    await press(page, "ControlOrMeta+k", 900);
    const after = await snap(page);
    record("⌘K", "search", route.id, after.dialogs > before.dialogs,
      `dialogs ${before.dialogs} → ${after.dialogs}`);
    await page.close();
  }

  /* , ? Z — panel, help, focus mode ----------------------------------- */
  {
    const page = await open(ctx, route.path);
    const before = await snap(page);
    await press(page, ",", 900);
    const after = await snap(page);
    record(",", "controls", route.id, after.dialogs > before.dialogs,
      `dialogs ${before.dialogs} → ${after.dialogs}`);
    await page.close();
  }
  {
    const page = await open(ctx, route.path);
    const before = await snap(page);
    await press(page, "?", 900);
    const after = await snap(page);
    const help = after.dialogTitles.some((t) => /Keyboard shortcuts/i.test(t));
    record("?", "help", route.id, after.dialogs > before.dialogs && help,
      `dialogs ${before.dialogs} → ${after.dialogs} ${JSON.stringify(after.dialogTitles)}`);
    await page.close();
  }
  {
    const page = await open(ctx, route.path);
    const before = await snap(page);
    await press(page, "z", 700);
    const after = await snap(page);
    record("Z", "immersive", route.id, after.focusMode !== before.focusMode,
      `data-focus-mode ${before.focusMode} → ${after.focusMode}`);
    await page.close();
  }

  /* ⇧= / ⇧- — text size ----------------------------------------------- */
  {
    const page = await open(ctx, route.path);
    const before = await snap(page);
    await press(page, "Shift+Equal", 700);
    const up = await snap(page);
    record("⇧=", "sizeUp", route.id, up.size !== before.size,
      `--reader-size-step ${before.size || "(unset)"} → ${up.size || "(unset)"}`);

    await press(page, "Shift+Minus", 700);
    const down = await snap(page);
    record("⇧-", "sizeDown", route.id, down.size !== up.size,
      `--reader-size-step ${up.size} → ${down.size}`);
    await page.close();
  }
}

/* ------------------------------------------------ the three 2.1.4 escapes */

const SEED = (shortcuts: string) =>
  `(() => { localStorage.setItem("skillsdocs:reader:1", JSON.stringify({ shortcuts: ${JSON.stringify(shortcuts)} })); return true; })()`;

async function runEscapes(ctx: BrowserContext) {
  process.stdout.write(`\n── WCAG 2.1.4 escapes (chapter route)\n`);

  /* (a) scoping — inert while focus is in a text field. */
  {
    const page = await open(ctx, CHAPTER);
    const before = await snap(page);
    await page.locator("body").press("/");
    await page.waitForTimeout(800);
    // Focus is now in the palette's combobox. Every bare character must be a
    // character, including the ones that navigate.
    await page.keyboard.type("]t[cz");
    await page.waitForTimeout(800);
    const after = await snap(page);
    const typed = await page.evaluate(
      `(() => { const el = document.activeElement; return el && "value" in el ? el.value : ""; })()`,
    );
    record("scoping", "escape (a)", "chapter",
      after.url === before.url && typed === "]t[cz",
      `url unchanged (${after.url}), field holds "${typed}"`);
    await page.close();
  }

  /* (b) the global off switch. */
  {
    const page = await ctx.newPage();
    await page.goto(`${BASE}${CHAPTER}`, { waitUntil: "domcontentloaded" });
    await page.evaluate(SEED("off"));
    await page.reload({ waitUntil: "load" });
    await page.locator('[data-slot="controls-trigger"]').first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    const before = await snap(page);
    for (const key of ["]", "t", "d", "z", "c"]) await press(page, key, 400);
    const after = await snap(page);
    // ⌘K keeps working with the switch off — a modifier combo cannot be
    // spoken by accident, and it is the only keyboard way into search.
    await press(page, "ControlOrMeta+k", 900);
    const withMod = await snap(page);
    record("off switch", "escape (b)", "chapter",
      after.url === before.url &&
        after.scheme === before.scheme &&
        after.focusMode === before.focusMode &&
        withMod.dialogs > after.dialogs,
      `bare keys inert; ⌘K still opens (dialogs ${after.dialogs} → ${withMod.dialogs})`);
    await page.close();
  }

  /* (c) remapping. */
  {
    const page = await ctx.newPage();
    await page.goto(`${BASE}${CHAPTER}`, { waitUntil: "domcontentloaded" });
    await page.evaluate(SEED("nextChapter:n"));
    await page.reload({ waitUntil: "load" });
    await page.locator('[data-slot="controls-trigger"]').first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    const before = await snap(page);
    await press(page, "]", 1200);
    const afterDefault = await snap(page);
    await press(page, "n", 1500);
    const afterRemap = await snap(page);
    record("remap", "escape (c)", "chapter",
      afterDefault.url === before.url && afterRemap.url !== before.url,
      `] inert, N → ${afterRemap.url}`);
    await page.close();
  }

  /* The dialog must not advertise a shortcut that has no handler here. */
  {
    const page = await open(ctx, CHAPTER);
    await press(page, "?", 1200);
    const unavailable = (await page.evaluate(
      `(() => {
        const nodes = [...document.querySelectorAll('[role="dialog"] span')];
        return nodes.filter((el) => el.textContent === "Not available on this page").length;
      })()`,
    )) as number;
    record("dialog honesty", "help", "chapter", unavailable === 0,
      `${unavailable} rows say "Not available on this page"`);

    // …and it must list all sixteen, in all four groups. The rows live in a
    // 52dvh scroller, so "the Actions group is missing" is what a screenshot
    // of the first fold looks like; the DOM is the authority.
    const dialog = (await page.evaluate(
      `(() => {
        const scope = document.querySelector('[role="dialog"]');
        if (!scope) return { rows: 0, groups: [], emptyCaps: 0, labels: [] };
        const rows = [...scope.querySelectorAll('button[aria-label^="Change the key for"]')];
        return {
          rows: rows.length,
          groups: [...scope.querySelectorAll("h3")].map((h) => h.textContent),
          emptyCaps: [...scope.querySelectorAll("kbd")]
            .filter((k) => (k.textContent || "").trim() === "").length,
          labels: rows.map((b) => (b.getAttribute("aria-label") || "").replace("Change the key for ", "")),
        };
      })()`,
    )) as { rows: number; groups: string[]; emptyCaps: number; labels: string[] };

    record("dialog rows", "help", "chapter",
      dialog.rows === 16 && dialog.groups.length === 4,
      `${dialog.rows} rows across ${dialog.groups.length} groups ${JSON.stringify(dialog.groups)}`);

    // An empty `<Kbd>` is a key cap the reader cannot learn. `"+".split("+")`
    // used to produce two of them on the "Larger text" row.
    record("dialog key caps", "help", "chapter", dialog.emptyCaps === 0,
      `${dialog.emptyCaps} blank key caps`);

    await page.close();
  }
}

/* ----------------------------------------------------------------- main */

const browser = await chromium.launch();
const ctx = await browser.newContext({
  colorScheme: "light",
  permissions: ["clipboard-read", "clipboard-write"],
});

const failures: string[] = [];
ctx.on("weberror", (error) => failures.push(`page error: ${error.error().message}`));

try {
  for (const route of ROUTES) await runRoute(ctx, route);
  await runEscapes(ctx);
} finally {
  await ctx.close();
  await browser.close();
}

/* ------------------------------------------------------------- report */

const width = {
  key: Math.max(3, ...rows.map((r) => r.key.length)),
  action: Math.max(6, ...rows.map((r) => r.action.length)),
  route: Math.max(5, ...rows.map((r) => r.route.length)),
};

process.stdout.write("\n\n=== key × route × result ===\n\n");
process.stdout.write(
  `| ${"key".padEnd(width.key)} | ${"action".padEnd(width.action)} | ${"route".padEnd(width.route)} | ok  | observed\n`,
);
for (const row of rows) {
  process.stdout.write(
    `| ${row.key.padEnd(width.key)} | ${row.action.padEnd(width.action)} | ${row.route.padEnd(width.route)} | ${row.pass ? "yes" : "NO "} | ${row.observed}\n`,
  );
}

const failed = rows.filter((r) => !r.pass);
process.stdout.write(
  `\n${rows.length - failed.length}/${rows.length} checks observed a change.\n`,
);
for (const problem of failures) process.stdout.write(`${problem}\n`);

if (failed.length > 0) process.exitCode = 1;
