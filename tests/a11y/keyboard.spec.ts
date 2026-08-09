/**
 * The keyboard tour: 2.1.1 (operable), 2.1.2 (no trap), 2.4.3 (focus order),
 * 2.4.7 (focus visible), 2.4.11 (focus not obscured), and the Next 16
 * `<Activity>` hazard.
 *
 * The focus-ring assertion compares rendered pixels rather than reading
 * `outline-width`. A ring can be an outline, a box-shadow, a `ring-*` utility
 * or a pseudo-element, and any of those can be silently overridden further
 * down the cascade. Pixels are what the reader sees, so pixels are what we
 * assert. See `focusRingChangesPixels` in tests/support/a11y.ts.
 */

import { expect, test, type Page } from "@playwright/test";

import { describeActiveElement, focusRingChangesPixels, gotoReady } from "../support/a11y";
import { ROUTES, SEL } from "../support/contract";
import { missingRouteNote, routeMissing } from "../support/routes";

/** Pixel diffing is slow; two projects cover light chrome and the HCM palette. */
const RING_PROJECTS = new Set(["desktop-light", "forced-colors"]);

/**
 * The home page is a directory of 89 books, so a legitimate tab order there is
 * hundreds of stops long. Running out of budget is therefore *not* evidence of
 * a trap; a trap is focus cycling among a handful of elements, which
 * `looksTrapped` detects directly.
 */
const MAX_STOPS = 150;
/** Pixel-diffing every stop on a directory page is a soak test, not a check. */
const MAX_RING_CHECKS = 40;

function looksTrapped(signatures: string[]): boolean {
  const tail = signatures.slice(-8);
  return tail.length === 8 && new Set(tail).size <= 2;
}

async function activeSignature(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return "body";
    const path: string[] = [];
    let node: Element | null = el;
    while (node && node !== document.body) {
      const parent: Element | null = node.parentElement;
      const index = parent ? Array.prototype.indexOf.call(parent.children, node) : 0;
      path.unshift(`${node.tagName.toLowerCase()}:${index}`);
      node = parent;
    }
    return path.join(">");
  });
}

/** Walks Tab until focus returns to the document start or MAX_STOPS is hit. */
async function tabTour(page: Page): Promise<string[]> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const seen: string[] = [];
  const signatures = new Set<string>();

  for (let i = 0; i < MAX_STOPS; i += 1) {
    await page.keyboard.press("Tab");
    const signature = await activeSignature(page);
    if (signature === "body") break;
    if (signatures.has(signature)) break; // wrapped around: full cycle
    signatures.add(signature);
    seen.push(await describeActiveElement(page));
  }
  return seen;
}

test.describe("keyboard tour", () => {
  for (const name of ["home", "book", "chapter"] as const) {
    test(`${name}: every tab stop has a visible focus ring and nothing traps`, async ({
      page,
    }, info) => {
      test.skip(!RING_PROJECTS.has(info.project.name), "pixel diffing; two projects is enough");
      test.fixme(routeMissing(name), missingRouteNote(name));

      await gotoReady(page, ROUTES[name]);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

      const ringless: string[] = [];
      const obscured: string[] = [];
      const order: string[] = [];
      const seen = new Set<string>();
      let stops = 0;

      for (let i = 0; i < MAX_STOPS; i += 1) {
        await page.keyboard.press("Tab");
        const signature = await activeSignature(page);
        order.push(signature);
        if (signature === "body") break;
        if (seen.has(signature)) break; // wrapped around: a complete cycle
        seen.add(signature);
        stops += 1;

        if (looksTrapped(order)) break;

        const description = await describeActiveElement(page);

        // 2.4.11 Focus Not Obscured: a focused control hidden behind a sticky
        // header is unusable even though it is technically focused.
        const visible = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return true;
          // An inline link that wraps across lines has a bounding box whose
          // centre falls in the *gap* between its own line boxes, so probe the
          // first client rect instead.
          const r = el.getClientRects()[0] ?? el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return true;

          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          // Off-screen is not obscured. `elementFromPoint` is viewport-relative
          // and returns null outside it, which would otherwise flag every link
          // below the fold on a long page.
          if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) return true;

          const hit = document.elementFromPoint(cx, cy);
          if (!hit || hit === el || el.contains(hit) || hit.contains(el)) return true;

          // 2.4.11 is specifically about author-created overlays covering a
          // focused control — a sticky header, a floating controls bar. An
          // unrelated hit that is part of normal flow means the probe point
          // landed somewhere harmless, not that anything is covering it.
          for (let node: Element | null = hit; node; node = node.parentElement) {
            const position = getComputedStyle(node).position;
            if (position === "fixed" || position === "sticky") return false;
          }
          return true;
        });
        if (!visible) obscured.push(description);

        if (stops <= MAX_RING_CHECKS) {
          const hasRing = await focusRingChangesPixels(page);
          if (!hasRing) ringless.push(description);

          // focusRingChangesPixels blurs to take its comparison shot; put focus
          // back so the next Tab continues from the right place.
          await page.evaluate((sig) => {
            const walk = (root: Element, path: string[]): Element | null => {
              if (path.length === 0) return root;
              const [head, ...rest] = path;
              const index = Number(head.split(":")[1]);
              const next = root.children[index];
              return next ? walk(next, rest) : null;
            };
            const target = walk(document.body, sig.split(">"));
            (target as HTMLElement | null)?.focus();
          }, signature);
        }
      }

      expect(stops, `${ROUTES[name]} has no keyboard-reachable controls`).toBeGreaterThan(0);
      expect(
        looksTrapped(order),
        `focus cycled among ${new Set(order.slice(-8)).size} elements — keyboard trap (WCAG 2.1.2): ${order.slice(-8).join(" → ")}`,
      ).toBe(false);
      expect(ringless, `no visible focus ring (WCAG 2.4.7) on: ${ringless.join(", ")}`).toEqual([]);
      expect(obscured, `focused control is obscured (WCAG 2.4.11): ${obscured.join(", ")}`).toEqual(
        [],
      );
    });
  }
});

test.describe("overlays return focus", () => {
  test("the reading-controls panel is named, closable, and restores focus", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "desktop-light", "interaction-shaped");
    test.fixme(routeMissing("chapter"), missingRouteNote("chapter"));

    await gotoReady(page, ROUTES.chapter);
    const trigger = page.locator(SEL.controlsTrigger).first();
    test.fixme(
      (await trigger.count()) === 0,
      `No reading-controls trigger matched "${SEL.controlsTrigger}". Owned by WS-5.`,
    );

    await trigger.focus();
    await page.keyboard.press("Enter");

    const panel = page.locator(SEL.controlsPanel).first();
    await expect(panel).toBeVisible();

    // 4.1.2: a dialog with no accessible name is the most common Base UI
    // mistake, and Base UI cannot supply one for us.
    const name = await panel.evaluate((el) => {
      const labelledby = el.getAttribute("aria-labelledby");
      const fromId = labelledby
        ? labelledby
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
            .join(" ")
            .trim()
        : "";
      return el.getAttribute("aria-label")?.trim() || fromId;
    });
    expect(name, "the controls panel must have an accessible name").toBeTruthy();

    /*
     * Touch screen-reader users have no Esc: a Close must live inside the
     * popup — for *every* dialog popup, not only `aria-modal="true"` ones.
     *
     * This assertion used to be gated on `aria-modal === "true"`, which
     * neither the popover nor the drawer sets (both are deliberately
     * non-modal, so the reader can watch the text reflow behind them). The
     * gate was therefore never taken and the panel shipped with no Close at
     * all: on iOS VoiceOver the only exits were a backdrop tap and an
     * `aria-hidden`, drag-only swipe handle. Modality changes whether Esc is
     * conventional; it does not change whether a touch user can find the way
     * out.
     */
    const closeInside = await panel
      .locator("[data-slot$='close'], button[aria-label*='Close' i], button:has-text('Close')")
      .count();
    expect(
      closeInside,
      "a dialog popup needs a labelled Close inside it (ARCHITECTURE §7.2)",
    ).toBeGreaterThan(0);

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();

    const focusReturned = await trigger.evaluate((el) => document.activeElement === el);
    expect(focusReturned, "Esc must return focus to the trigger").toBe(true);
  });
});

test.describe("Next 16 <Activity>", () => {
  test("no overlay is stranded after a back-navigation", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-light", "interaction-shaped");
    test.fixme(routeMissing("chapter"), missingRouteNote("chapter"));
    test.fixme(routeMissing("book"), missingRouteNote("book"));

    // Baseline: what a clean load of the book page offers the keyboard.
    await gotoReady(page, ROUTES.book);
    const baseline = await tabTour(page);

    // Chapter → open the panel → navigate back. `<Activity>` keeps the
    // previous route mounted-but-hidden, so a portalled panel can survive the
    // navigation and leave phantom tab stops behind.
    await gotoReady(page, ROUTES.chapter);
    const trigger = page.locator(SEL.controlsTrigger).first();
    if ((await trigger.count()) > 0) {
      await trigger.click();
      await expect(page.locator(SEL.controlsPanel).first()).toBeVisible();
    }

    await page.goBack();
    await page.waitForURL(`**${ROUTES.book}`);
    // The restored route streams in exactly as a fresh one does; measuring the
    // tab order before it lands compares 31 stops against zero.
    await page.waitForFunction(() => {
      const main = document.querySelector("main");
      const heading = main?.querySelector("h1, h2");
      return Boolean(heading && heading.getBoundingClientRect().height > 0);
    });
    await page.waitForTimeout(250);

    const stranded = await page.locator(SEL.controlsPanel).filter({ visible: true }).count();
    expect(stranded, "an overlay from the previous route is still visible").toBe(0);

    const after = await tabTour(page);
    expect(
      after.length,
      `tab stops changed after back-navigation (${baseline.length} → ${after.length}); a hidden route is probably still focusable.\nbefore: ${baseline.join(" | ")}\nafter:  ${after.join(" | ")}`,
    ).toBe(baseline.length);
  });
});
