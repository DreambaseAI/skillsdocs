/**
 * Windows High Contrast Mode.
 *
 * This is the highest-risk accessibility bug in the design direction and the
 * reason this file exists on its own. In forced-colors mode the UA replaces
 * colour, background-color and border-color, **drops box-shadow entirely, and
 * ignores backdrop-filter**. A menu whose legibility comes from
 * `backdrop-filter: blur(24px)` over a translucent background therefore
 * renders as transparent text-over-text. Nothing else in the suite catches
 * that, because in every other mode the blur is doing the work.
 *
 * The assertions are structural rather than contrast-based on purpose: axe's
 * colour rules read the author's colours, which the UA has already discarded.
 */

import { expect, test, type Locator } from "@playwright/test";

import { gotoReady } from "../support/a11y";
import { ROUTES, SEL } from "../support/contract";
import { missingRouteNote, routeMissing } from "../support/routes";

test.beforeEach(async ({}, info) => {
  test.skip(
    !info.project.name.includes("forced-colors"),
    "runs only in the forced-colors project",
  );
});

interface SurfaceStyle {
  background: string;
  alpha: number;
  backdropFilter: string;
  borderWidth: number;
  borderColor: string;
  color: string;
  opacity: number;
}

async function surfaceStyle(locator: Locator): Promise<SurfaceStyle> {
  return locator.evaluate((el) => {
    const s = getComputedStyle(el);
    const parseAlpha = (value: string): number => {
      if (value === "transparent") return 0;
      const m = /rgba?\(([^)]+)\)/.exec(value);
      if (!m) return 1;
      const parts = m[1].split(/[\s,/]+/).filter(Boolean);
      return parts.length >= 4 ? Number(parts[3]) : 1;
    };
    const widths = [
      s.borderTopWidth,
      s.borderRightWidth,
      s.borderBottomWidth,
      s.borderLeftWidth,
    ].map((w) => Number.parseFloat(w) || 0);
    return {
      background: s.backgroundColor,
      alpha: parseAlpha(s.backgroundColor),
      backdropFilter: s.backdropFilter || (s as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter || "none",
      borderWidth: Math.min(...widths),
      borderColor: s.borderTopColor,
      color: s.color,
      opacity: Number.parseFloat(s.opacity),
    };
  });
}

function assertReadableSurface(name: string, style: SurfaceStyle): void {
  expect(
    style.alpha,
    `${name}: background is translucent (${style.background}) in forced-colors mode, where backdrop-filter is ignored — the panel will render see-through over the page text`,
  ).toBe(1);

  expect(
    style.backdropFilter,
    `${name}: still declares backdrop-filter (${style.backdropFilter}); it is dropped in HCM and must be replaced by an opaque Canvas background`,
  ).toBe("none");

  expect(
    style.borderWidth,
    `${name}: box-shadow is dropped in forced-colors mode, so the surface needs a real 1px CanvasText border to be distinguishable from the page behind it`,
  ).toBeGreaterThanOrEqual(1);

  expect(
    style.color,
    `${name}: text colour must differ from the surface background`,
  ).not.toBe(style.background);

  expect(style.opacity, `${name}: surface is faded out`).toBeGreaterThan(0.99);
}

test.describe("forced colors", () => {
  test("the media query is actually active in this project", async ({ page }) => {
    await gotoReady(page, ROUTES.home);
    const active = await page.evaluate(
      () => matchMedia("(forced-colors: active)").matches,
    );
    expect(active, "the forced-colors project must emulate HCM").toBe(true);
  });

  test("the reading-controls panel stays readable", async ({ page }) => {
    test.fixme(routeMissing("chapter"), missingRouteNote("chapter"));
    await gotoReady(page, ROUTES.chapter);

    const trigger = page.locator(SEL.controlsTrigger).first();
    test.fixme(
      (await trigger.count()) === 0,
      `No reading-controls trigger matched "${SEL.controlsTrigger}". Owned by WS-5.`,
    );

    await trigger.click();
    const panel = page.locator(SEL.controlsPanel).first();
    await expect(panel).toBeVisible();
    assertReadableSurface("reading-controls panel", await surfaceStyle(panel));
  });

  test("every visible translucent surface is opaque and bordered", async ({ page }) => {
    for (const route of [ROUTES.home, ROUTES.book, ROUTES.chapter] as const) {
      const name = route === ROUTES.home ? "home" : route === ROUTES.book ? "book" : "chapter";
      test.fixme(routeMissing(name as "home" | "book" | "chapter"), missingRouteNote(name as "home"));

      await gotoReady(page, route);
      const surfaces = page.locator(SEL.translucent);
      const count = await surfaces.count();
      for (let i = 0; i < count; i += 1) {
        const surface = surfaces.nth(i);
        if (!(await surface.isVisible())) continue;
        assertReadableSurface(`${route} surface #${i}`, await surfaceStyle(surface));
      }
    }
  });

  test("decorative backgrounds do not fight the system palette", async ({ page }) => {
    test.fixme(routeMissing("book"), missingRouteNote("book"));
    await gotoReady(page, ROUTES.book);

    // background-image on non-<img> elements is dropped by the UA; anything
    // that still declares one is relying on a paint that will not happen.
    const leftovers = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
        if (el.tagName === "IMG" || el.tagName === "SVG") continue;
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden") continue;
        if (s.backgroundImage !== "none" && s.forcedColorAdjust !== "none") {
          const r = el.getBoundingClientRect();
          if (r.width * r.height > 4000) {
            out.push(`${el.tagName.toLowerCase()}.${el.className} ${s.backgroundImage.slice(0, 60)}`);
          }
        }
        if (out.length >= 6) break;
      }
      return out;
    });
    expect(
      leftovers,
      "large decorative background-images are dropped in HCM; hide them or opt out with forced-color-adjust: none",
    ).toEqual([]);
  });

  test("charts opt out of the forced palette and keep a non-colour encoding", async ({
    page,
  }) => {
    test.fixme(routeMissing("book"), missingRouteNote("book"));
    await gotoReady(page, ROUTES.book);

    const charts = page.locator("figure svg, [role='img'] svg, svg[data-chart]");
    const count = await charts.count();
    /*
     * This skip has never not been taken: nothing under `src/app` imports
     * `components/charts/`, so the pack renders on no route and this check has
     * executed zero times since it was written. A vacuous skip reads exactly
     * like a pass in the report, which is the failure mode an accessibility
     * suite can least afford.
     *
     * The structural half of the contract — figure, named `role="img"` leaf,
     * always-present data table — is therefore asserted directly against the
     * component in `src/components/charts/accessible-chart.test.tsx`, which
     * cannot skip itself. What is left here is the half that needs a real
     * forced-colours browser, and it starts running the day a route mounts a
     * chart.
     */
    test.skip(
      count === 0,
      "charts render on no route yet (src/components/charts/ is imported by nothing); " +
        "the structural contract is covered by accessible-chart.test.tsx",
    );

    for (let i = 0; i < count; i += 1) {
      const chart = charts.nth(i);
      if (!(await chart.isVisible())) continue;
      // SVG fill/stroke are not forced, so a multi-series chart collapses to
      // invisible-or-identical unless it opts out and re-encodes.
      const adjust = await chart.evaluate(
        (el) => getComputedStyle(el).forcedColorAdjust ?? "auto",
      );
      expect(adjust, `chart #${i} must set forced-color-adjust: none`).toBe("none");

      const hasTable = await chart.evaluate((el) => {
        const figure = el.closest("figure, [data-slot='chart']");
        return figure?.querySelector("table") !== null;
      });
      expect(hasTable, `chart #${i} needs a table fallback (a11y-llm §1.14)`).toBe(true);
    }
  });
});
