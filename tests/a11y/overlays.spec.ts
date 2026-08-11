/**
 * The states nothing audited.
 *
 * Every check here exists because a review found a real barrier that the green
 * suite could not see. The pattern was always the same: the suite audited
 * pages, and every one of these defects lives in a state you have to *open* —
 * a palette, a dialog, a sheet — or on a route (`/search`, the 404 shell) that
 * was not in `ROUTES` at all.
 *
 *   - the ⌘K palette's combobox had an accessible name of `""`;
 *   - eleven of the sixteen advertised shortcuts had no subscriber, and the
 *     dispatcher cancelled their keys anyway, so `/` suppressed the browser's
 *     own quick-find and did nothing;
 *   - `Shift+=` / `Shift+-` could never match a real keyboard event;
 *   - "Skip to reading controls" pointed at nothing on the home page;
 *   - the reading-controls popup had no Close inside it.
 */

import { expect, test, type Page } from "@playwright/test";

import { auditChrome } from "../support/axe";
import { ROUTES, SEL } from "../support/contract";
import { gotoReady } from "../support/a11y";
import { missingRouteNote, routeMissing } from "../support/routes";

const STORAGE_KEY = "skillsdocs:reader:1";

/** Interaction-shaped tests run once, in the reference environment. */
function interactionOnly(projectName: string) {
  test.skip(projectName !== "desktop-light", "interaction-shaped");
}

async function openPalette(page: Page) {
  await page.getByRole("button", { name: /search skills/i }).first().click();
  const dialog = page.getByRole("dialog").filter({ has: page.getByRole("combobox") });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function waitForSearchShortcut(page: Page) {
  await expect(
    page.getByRole("button", { name: /search skills/i }).first(),
  ).toHaveAttribute("data-shortcut-ready", "true");
}

/* ------------------------------------------------------------ open states */

test.describe("overlay states are audited, not assumed", () => {
  test("the command palette is clean and its combobox is named", async ({ page }, info) => {
    interactionOnly(info.project.name);
    test.fixme(routeMissing("home"), missingRouteNote("home"));

    await gotoReady(page, ROUTES.home);
    await openPalette(page);

    const combobox = page.getByRole("combobox").first();
    // 4.1.2. cmdk points `aria-labelledby` at a hidden <label> it renders from
    // the Command root's `label` prop; with no prop the element is empty and
    // the name computation stops there rather than falling back to the
    // placeholder.
    await expect(combobox).toHaveAccessibleName(/\w/);

    /*
     * The measurement axe could not make.
     *
     * With the palette open, Base UI marks the page container behind it
     * `aria-hidden="true"` — axe sees that the subtree still contains
     * focusable elements, cannot tell whether anything keeps focus out of
     * them, and returns `aria-hidden-focus: incomplete`. That result used to be
     * discarded silently. Rather than fail the gate on axe's uncertainty, ask
     * the question directly: tab right around the surface and assert that
     * focus never lands *inside* an `aria-hidden` subtree, which is the actual
     * 4.1.2 hazard. (Landing on the skip links, which are outside the hidden
     * region and perfectly visible to AT, is not.)
     */
    const intoHidden: string[] = [];
    for (let i = 0; i < 15; i += 1) {
      // 40ms, not zero. Base UI restores focus asynchronously, so a
      // machine-gun cadence outruns its own guards and drops focus to `body`
      // for a frame — a measurement artefact the earlier review characterised
      // and dismissed, not a barrier a person can hit.
      await page.keyboard.press("Tab");
      await page.waitForTimeout(40);
      const hidden = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        if (!el.closest('[aria-hidden="true"]')) return null;
        // Base UI's own 1px sentinels are `aria-hidden` by construction; they
        // are how it notices focus trying to leave, and they bounce it back.
        if (el.hasAttribute("data-base-ui-focus-guard")) return null;
        const name = el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 40) ?? "";
        return `${el.tagName.toLowerCase()} "${name}"`;
      });
      if (hidden) intoHidden.push(hidden);
    }
    expect(
      intoHidden,
      "focus landed on a control inside an aria-hidden subtree — visible to the keyboard, invisible to a screen reader (WCAG 4.1.2)",
    ).toEqual([]);

    await auditChrome(page, info);
  });

  test("the shortcuts dialog is clean", async ({ page }, info) => {
    interactionOnly(info.project.name);
    test.fixme(routeMissing("chapter"), missingRouteNote("chapter"));

    await gotoReady(page, ROUTES.chapter);
    await page.keyboard.press("?");
    const dialog = page.getByRole("dialog").filter({ hasText: "Keyboard shortcuts" });
    await expect(dialog).toBeVisible();
    await auditChrome(page, info);
  });

  test("every open dialog popup carries a labelled Close inside it", async ({
    page,
  }, info) => {
    interactionOnly(info.project.name);
    test.fixme(routeMissing("chapter"), missingRouteNote("chapter"));

    await gotoReady(page, ROUTES.chapter);
    await page.locator(SEL.controlsTrigger).first().click();
    const panel = page.locator(SEL.controlsPanel).first();
    await expect(panel).toBeVisible();

    // ARCHITECTURE §7.2. Not gated on `aria-modal`: this panel is deliberately
    // non-modal so the reader can watch the column reflow, and a touch
    // screen-reader user still needs an announced way out.
    await expect(
      panel.locator("button[aria-label*='Close' i], [data-slot$='close']"),
    ).toHaveCount(1);
  });
});

/* --------------------------------------------------------------- keymap */

test.describe("the keymap does what it advertises", () => {
  // The palette now mounts on the reading routes too — it rides in the book
  // header alongside the reading controls, which is what made `/` and ⌘K work
  // inside a book. Home is still where these three run, because it is the one
  // route that carries the palette and *not* the reader's own chrome.
  test("/ opens the palette, and Escape closes it", async ({ page }, info) => {
    interactionOnly(info.project.name);
    test.fixme(routeMissing("home"), missingRouteNote("home"));

    await gotoReady(page, ROUTES.home);
    await waitForSearchShortcut(page);
    await page.keyboard.press("/");
    await expect(page.getByRole("combobox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("combobox")).toBeHidden();
  });

  test("the off switch silences / but leaves ⌘K alone", async ({ page }, info) => {
    interactionOnly(info.project.name);
    test.fixme(routeMissing("home"), missingRouteNote("home"));

    await page.addInitScript(
      ([key]) => window.localStorage.setItem(key, JSON.stringify({ shortcuts: "off" })),
      [STORAGE_KEY],
    );
    await gotoReady(page, ROUTES.home);
    await waitForSearchShortcut(page);

    // Escape (b) of WCAG 2.1.4. Before this, `/` was bound by the palette's own
    // window listener, which consulted neither the switch nor the rebinding
    // table — so the switch was decorative for the shortcut most likely to
    // collide with assistive technology.
    await page.keyboard.press("/");
    await expect(page.getByRole("combobox")).toHaveCount(0);

    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByRole("combobox")).toBeVisible();
  });

  test("rebinding search moves the shortcut, rather than announcing that it did", async ({
    page,
  }, info) => {
    interactionOnly(info.project.name);
    test.fixme(routeMissing("home"), missingRouteNote("home"));

    await page.addInitScript(
      ([key]) => window.localStorage.setItem(key, JSON.stringify({ shortcuts: "search:s" })),
      [STORAGE_KEY],
    );
    await gotoReady(page, ROUTES.home);
    await waitForSearchShortcut(page);

    await page.keyboard.press("/");
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await page.keyboard.press("s");
    await expect(page.getByRole("combobox")).toBeVisible();
  });

  test("the text-size keys are the ones a keyboard actually sends", async ({
    page,
  }, info) => {
    interactionOnly(info.project.name);
    test.fixme(routeMissing("chapter"), missingRouteNote("chapter"));

    await gotoReady(page, ROUTES.chapter);
    // `--reader-size-step` is written to the root element only when the reader
    // has moved off the default, which makes it an exact record of whether the
    // key did anything.
    const step = () =>
      page.evaluate(() =>
        document.documentElement.style.getPropertyValue("--reader-size-step").trim(),
      );

    const before = await step();
    // Shift+Equal is what a reader presses; `+` is what the browser reports,
    // and `"shift+="` — the old binding — is a string `normalizeKey` can never
    // produce.
    await page.keyboard.press("Shift+Equal");
    await expect
      .poll(step, { message: "Shift+= must step the text size up" })
      .not.toBe(before);

    await page.keyboard.press("Shift+Minus");
    await expect.poll(step, { message: "Shift+- must step it back" }).toBe(before);
  });

  test("D cycles the colour scheme", async ({ page }, info) => {
    interactionOnly(info.project.name);
    test.fixme(routeMissing("chapter"), missingRouteNote("chapter"));

    await gotoReady(page, ROUTES.chapter);
    // The stored choice, not the class. Two of the three settings render the
    // same pixels — "system" *is* light or dark — so one edge of the cycle
    // necessarily leaves the class alone. `nextScheme` puts that edge on the
    // return to "system" rather than on the first press, but the setting is
    // still the only thing that changes on every press.
    const stored = () => page.evaluate(() => window.localStorage.getItem("theme"));
    expect(await stored()).toBeNull();

    await page.keyboard.press("d");
    await expect
      .poll(stored, { message: "D must cycle the theme, not merely swallow the key" })
      .not.toBeNull();

    const first = await stored();
    await page.keyboard.press("d");
    await expect.poll(stored).not.toBe(first);
  });

  test("a shortcut nothing handles leaves the keystroke to the browser", async ({
    page,
  }, info) => {
    interactionOnly(info.project.name);
    test.fixme(routeMissing("home"), missingRouteNote("home"));

    await gotoReady(page, ROUTES.home);
    // `]` is "Next chapter", which the home page has no chapters for. The
    // dispatcher must not call preventDefault on a key it cannot act on:
    // cancelling a keystroke and doing nothing with it is strictly worse than
    // not binding it, and that is what made `/` a net removal of the browser's
    // own quick-find.
    const prevented = await page.evaluate(async () => {
      let seen: boolean | null = null;
      const probe = (event: KeyboardEvent) => {
        if (event.key === "]") seen = event.defaultPrevented;
      };
      // Last listener on the document wins the ordering race with the reader's
      // own handler, which is attached at the same phase and earlier.
      document.addEventListener("keydown", probe);
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "]", bubbles: true, cancelable: true }),
      );
      document.removeEventListener("keydown", probe);
      return seen;
    });
    expect(prevented, "an unhandled shortcut must not cancel the key").toBe(false);
  });
});

/* ----------------------------------------------------------- skip links */

test.describe("skip links point at something on every route", () => {
  for (const name of ["home", "search", "book", "chapter", "notFound"] as const) {
    test(`${name}: no skip link is a no-op`, async ({ page }, info) => {
      interactionOnly(info.project.name);

      await page.goto(ROUTES[name]);
      await page.waitForLoadState("domcontentloaded");
      // The set is resolved on the client once the route's landmarks exist.
      await page.waitForTimeout(500);

      const dead = await page.evaluate((selector) => {
        const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(selector));
        return links
          .map((a) => a.getAttribute("href") ?? "")
          .filter((href) => href.startsWith("#") && !document.querySelector(href));
      }, SEL.skipLinks);

      expect(
        dead,
        `dead skip links on ${ROUTES[name]} — they are the first tab stops on the page (WCAG 2.4.1)`,
      ).toEqual([]);
    });
  }
});

/* --------------------------------------------------------------- reflow */

test.describe("/search", () => {
  test("does not scroll horizontally at 320 CSS px", async ({ page }, info) => {
    interactionOnly(info.project.name);
    test.fixme(routeMissing("search"), missingRouteNote("search"));

    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(ROUTES.search);
    await page.waitForLoadState("networkidle");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "WCAG 1.4.10: 1280px at 400% zoom must not scroll sideways").toBeLessThanOrEqual(
      0,
    );
  });
});
