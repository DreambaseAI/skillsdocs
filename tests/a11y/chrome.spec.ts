/**
 * axe over our own UI, plus the landmark contract from a11y-llm §1.1.
 *
 * The chrome gate is absolute: zero violations on the home page, the book, the
 * chapter, and the chapter with the reading-controls panel open. Rendered
 * third-party markdown is audited separately and reported, never failed —
 * see tests/support/axe.ts for why.
 */

import { expect, test } from "@playwright/test";

import { auditChrome, auditContent } from "../support/axe";
import { ROUTES, SEL } from "../support/contract";
import { gotoReady, headingOutline } from "../support/a11y";
import { missingRouteNote, routeMissing } from "../support/routes";

test.describe("chrome — axe", () => {
  test("home page has no accessibility violations", async ({ page }, info) => {
    test.fixme(routeMissing("home"), missingRouteNote("home"));
    await gotoReady(page, ROUTES.home);
    await auditChrome(page, info);
  });

  test("book page has no accessibility violations in our chrome", async ({ page }, info) => {
    test.fixme(routeMissing("book"), missingRouteNote("book"));
    await gotoReady(page, ROUTES.book);
    await auditChrome(page, info);
    await auditContent(page, info, ROUTES.book);
  });

  test("chapter page has no accessibility violations in our chrome", async ({
    page,
  }, info) => {
    test.fixme(routeMissing("chapter"), missingRouteNote("chapter"));
    await gotoReady(page, ROUTES.chapter);
    await auditChrome(page, info);
    await auditContent(page, info, ROUTES.chapter);
  });

  test("reading-controls panel has no accessibility violations when open", async ({
    page,
  }, info) => {
    test.fixme(routeMissing("chapter"), missingRouteNote("chapter"));
    await gotoReady(page, ROUTES.chapter);

    const trigger = page.locator(SEL.controlsTrigger).first();
    test.fixme(
      (await trigger.count()) === 0,
      `No reading-controls trigger matched "${SEL.controlsTrigger}". Owned by WS-5 (src/components/reader/controls/controls-trigger.tsx).`,
    );

    await trigger.click();
    const panel = page.locator(SEL.controlsPanel).first();
    await expect(panel).toBeVisible();
    await auditChrome(page, info);
  });
});

test.describe("chrome — landmark and heading contract", () => {
  for (const name of ["home", "book", "chapter"] as const) {
    test(`${name}: one main, one h1, uniquely labelled navigation`, async ({ page }) => {
      test.fixme(routeMissing(name), missingRouteNote(name));
      await gotoReady(page, ROUTES[name]);

      await expect(page.locator("html")).toHaveAttribute("lang", /\w/);
      await expect(page.locator("main")).toHaveCount(1);

      const h1s = page.locator("h1");
      expect(await h1s.count(), "exactly one <h1> per document (WCAG 1.3.1)").toBe(1);

      // Repeated landmarks of the same type must be distinguishable.
      const navLabels = await page
        .locator("nav")
        .evaluateAll((nodes) =>
          nodes.map(
            (n) =>
              n.getAttribute("aria-label") ??
              (n.getAttribute("aria-labelledby")
                ? document.getElementById(n.getAttribute("aria-labelledby")!)?.textContent?.trim()
                : null) ??
              "",
          ),
        );
      if (navLabels.length > 1) {
        expect(
          navLabels.filter((l) => l.length === 0),
          "every <nav> needs a distinguishing accessible name",
        ).toEqual([]);
        expect(new Set(navLabels).size, `duplicate nav labels: ${navLabels.join(", ")}`).toBe(
          navLabels.length,
        );
      }
      for (const label of navLabels) {
        expect(label.toLowerCase()).not.toBe("navigation");
      }
    });
  }

  test("live regions are mounted and empty on first paint", async ({ page }) => {
    test.fixme(routeMissing("home"), missingRouteNote("home"));
    await gotoReady(page, ROUTES.home);

    const status = page.locator(SEL.liveStatus).first();
    const alert = page.locator(SEL.liveAlert).first();
    await expect(status).toHaveCount(1);
    await expect(alert).toHaveCount(1);
    // A live region mounted with text in it does not announce.
    expect((await status.textContent())?.trim() ?? "").toBe("");
    expect((await alert.textContent())?.trim() ?? "").toBe("");
    await expect(status).toHaveAttribute("aria-atomic", "true");
  });

  test("skip links are the first focusable elements", async ({ page }) => {
    test.fixme(routeMissing("home"), missingRouteNote("home"));
    await gotoReady(page, ROUTES.home);

    const count = await page.locator(SEL.skipLinks).count();
    expect(count, "at least one skip link (WCAG 2.4.1)").toBeGreaterThan(0);

    await page.keyboard.press("Tab");
    const firstIsSkip = await page.evaluate(
      (selector) => document.activeElement?.matches(selector) ?? false,
      SEL.skipLinks,
    );
    expect(firstIsSkip, "the first Tab stop must be a skip link").toBe(true);
  });

  test("every skip-link target exists on the full book shell and can take focus", async ({
    page,
  }) => {
    test.fixme(routeMissing("chapter"), missingRouteNote("chapter"));
    // The chapter is the only route that carries all three landmarks, so it is
    // where "the target exists" is a fair question to ask.
    await gotoReady(page, ROUTES.chapter);

    const links = page.locator(SEL.skipLinks);
    const count = await links.count();

    const missing: string[] = [];
    const unfocusable: string[] = [];

    for (let i = 0; i < count; i += 1) {
      const href = await links.nth(i).getAttribute("href");
      expect(href, "skip link needs a fragment target").toMatch(/^#/);
      const target = page.locator(href!);
      if ((await target.count()) === 0) {
        missing.push(href!);
        continue;
      }
      // Safari and Firefox move the scroll but not the focus unless the
      // target is programmatically focusable (WCAG 2.4.1).
      const focusable = await target.first().evaluate(
        (el) =>
          el.hasAttribute("tabindex") ||
          ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(el.tagName),
      );
      if (!focusable) unfocusable.push(href!);
    }

    expect(missing, "skip links pointing at nothing").toEqual([]);
    expect(
      unfocusable,
      'skip-link targets must carry tabindex="-1", or Safari and Firefox scroll without moving focus',
    ).toEqual([]);
  });

  test("chapter outline starts at h1 and never skips a level", async ({ page }) => {
    test.fixme(routeMissing("chapter"), missingRouteNote("chapter"));
    await gotoReady(page, ROUTES.chapter);

    const headings = await headingOutline(page, "main");
    expect(headings.length, "a chapter must have headings").toBeGreaterThan(1);
    expect(headings[0].level, "the document outline starts at h1").toBe(1);
    expect(headings.filter((h) => h.level === 1).length).toBe(1);
  });
});
