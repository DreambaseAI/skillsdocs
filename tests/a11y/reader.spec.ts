/**
 * The reading surface: WCAG 1.4.12 Text Spacing, 1.4.10 Reflow, 1.4.4 Resize
 * Text, and the heading-outline repair over third-party markdown.
 *
 * 1.4.12 is the highest-value test a reading app can own. Our own controls
 * push spacing past the WCAG thresholds on purpose (`LIMITS` in prefs.ts), so
 * a user stylesheet layered on top of the widest preset is the real worst
 * case — and that is what this injects.
 */

import { expect, test, type Page } from "@playwright/test";

import {
  applyPrefs,
  documentOverflowsHorizontally,
  findClipped,
  findOverlaps,
  gotoReady,
  headingOutline,
  outlineSkips,
} from "../support/a11y";
import { auditChrome, auditContent } from "../support/axe";
import { PRESETS, ROUTES, SEL, TEXT_SPACING_CSS, VIEWPORTS } from "../support/contract";
import { missingRouteNote, routeMissing } from "../support/routes";

/** The layout sweeps are viewport-shaped, not colour-shaped. */
const LAYOUT_PROJECTS = new Set(["desktop-light", "mobile"]);

test.describe("1.4.12 Text Spacing", () => {
  for (const preset of PRESETS) {
    test(`survives the text-spacing override at the "${preset.id}" preset`, async ({
      page,
      context,
      baseURL,
    }, info) => {
      test.skip(!LAYOUT_PROJECTS.has(info.project.name), "layout-shaped; two viewports is enough");
      test.fixme(routeMissing("chapter"), missingRouteNote("chapter"));

      await applyPrefs(context, baseURL!, preset.prefs);
      await gotoReady(page, ROUTES.chapter);

      const readerRoots = await page.locator(SEL.reader).count();
      expect(readerRoots, `no ${SEL.reader} ancestor — the prose has no measure`).toBeGreaterThan(
        0,
      );

      // 1.4.12 is a question about what the override *changes*. Controls that
      // were already 0×0 are a target-size defect (2.5.8) reported elsewhere;
      // conflating the two makes both unactionable.
      const collapsedBefore = await zeroSizeControls(page);

      await page.addStyleTag({ content: TEXT_SPACING_CSS });
      // Let the reflow settle before measuring boxes.
      await page.waitForTimeout(150);

      const clipped = await findClipped(page, "main");
      expect(
        clipped,
        `content clipped at the 1.4.12 override:\n${clipped
          .map((c) => `  ${c.selector} ${c.reason} ${c.scroll}>${c.client} (${c.overflow}) "${c.text}"`)
          .join("\n")}`,
      ).toEqual([]);

      const overlaps = await findOverlaps(page, "main");
      expect(
        overlaps,
        `text overlaps at the 1.4.12 override:\n${overlaps
          .map((o) => `  ${o.overlapPx}px between [${o.a}] and [${o.b}]`)
          .join("\n")}`,
      ).toEqual([]);

      const overflow = await documentOverflowsHorizontally(page);
      expect(
        overflow.overflows,
        `page scrolls horizontally (${overflow.scrollWidth} > ${overflow.clientWidth}): ${overflow.offenders.join(", ")}`,
      ).toBe(false);

      // Nothing may become unreachable: every control keeps a real hit area.
      const collapsedAfter = await zeroSizeControls(page);
      const newlyCollapsed = collapsedAfter.filter((c) => !collapsedBefore.includes(c));
      expect(
        newlyCollapsed,
        "controls collapsed to zero size at the 1.4.12 override",
      ).toEqual([]);
    });
  }
});

/** Focusable controls with no hit area at all. */
async function zeroSizeControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const nodes = document.querySelectorAll<HTMLElement>(
      "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])",
    );
    for (const el of Array.from(nodes)) {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden") continue;
      if (el.closest("[hidden], [inert], [aria-hidden='true']")) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) {
        const name = el.getAttribute("aria-label") ?? (el.textContent ?? "").trim().slice(0, 30);
        out.push(`${el.tagName.toLowerCase()} "${name}"`);
      }
    }
    return out;
  });
}

test.describe("1.4.10 Reflow and 1.4.4 Resize Text", () => {
  for (const name of ["home", "book", "chapter"] as const) {
    test(`${name} has no horizontal scroll at 320 CSS px (400% zoom)`, async ({ page }, info) => {
      test.skip(!LAYOUT_PROJECTS.has(info.project.name), "layout-shaped");
      test.fixme(routeMissing(name), missingRouteNote(name));

      await page.setViewportSize(VIEWPORTS.reflow400);
      await gotoReady(page, ROUTES[name]);
      await page.waitForTimeout(150);

      const overflow = await documentOverflowsHorizontally(page);
      expect(
        overflow.overflows,
        `${ROUTES[name]} at 320px scrolls horizontally (${overflow.scrollWidth} > ${overflow.clientWidth}). Offenders: ${overflow.offenders.join(", ")}`,
      ).toBe(false);
    });
  }

  test("chapter survives 200% text-only zoom", async ({ page }, info) => {
    test.skip(!LAYOUT_PROJECTS.has(info.project.name), "layout-shaped");
    test.fixme(routeMissing("chapter"), missingRouteNote("chapter"));

    await gotoReady(page, ROUTES.chapter);
    // Firefox's "zoom text only" in effect: the root font doubles, px-fixed
    // boxes do not. This is stricter than page zoom and finds fixed heights.
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await page.waitForTimeout(150);

    const clipped = await findClipped(page, "main");
    expect(
      clipped,
      `content clipped at 200% text zoom:\n${clipped.map((c) => `  ${c.selector} ${c.reason}`).join("\n")}`,
    ).toEqual([]);
  });

  test("the code block and table are the only horizontal scrollers, and they are reachable", async ({
    page,
  }, info) => {
    test.skip(!LAYOUT_PROJECTS.has(info.project.name), "layout-shaped");
    test.fixme(routeMissing("chapterAlt"), missingRouteNote("chapterAlt"));

    await page.setViewportSize(VIEWPORTS.reflow400);
    await gotoReady(page, ROUTES.chapterAlt);

    // 1.4.10 permits a scroll container per code block / table, but axe's
    // scrollable-region-focusable requires it be keyboard-scrollable.
    const bad = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
        const s = getComputedStyle(el);
        const scrolls = s.overflowX === "auto" || s.overflowX === "scroll";
        if (!scrolls) continue;
        if (el.scrollWidth <= el.clientWidth + 1) continue;
        const focusable =
          el.tabIndex >= 0 || el.querySelector("a[href], button, [tabindex='0']") !== null;
        if (!focusable) out.push(el.tagName.toLowerCase() + "." + el.className);
      }
      return out;
    });
    expect(bad, "a horizontally scrollable region no keyboard user can scroll").toEqual([]);
  });
});

test.describe("third-party markdown", () => {
  test("a skipped-level source outline is repaired before it renders", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-light", "content-shaped, not viewport-shaped");
    test.fixme(routeMissing("roughOutline"), missingRouteNote("roughOutline"));

    await gotoReady(page, ROUTES.roughOutline);

    const headings = await headingOutline(page, "main");
    expect(headings.length).toBeGreaterThan(2);
    expect(headings.filter((h) => h.level === 1).length, "one h1 after the leading-H1 strip").toBe(
      1,
    );
    const skips = outlineSkips(headings);
    expect(
      skips,
      `outline still skips levels after repair: ${skips.join("; ")}\n${headings
        .map((h) => `  h${h.level} ${h.text}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  test("content defects are reported, and never fail our chrome", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-light", "content-shaped, not viewport-shaped");
    test.fixme(routeMissing("roughMedia"), missingRouteNote("roughMedia"));

    await gotoReady(page, ROUTES.roughMedia);

    // The gate: our chrome is still clean around defective content.
    await auditChrome(page, info);

    // The product feature: the defects are captured as data.
    const findings = await auditContent(page, info, ROUTES.roughMedia);
    info.annotations.push({
      type: "accessibility-report",
      description: `${findings.length} content finding(s): ${findings.map((f) => f.id).join(", ") || "none"}`,
    });
  });
});
