/**
 * prefers-reduced-motion: reduce.
 *
 * A page-turn animation is exactly the class of motion (large-area translate)
 * that triggers vestibular symptoms. The global CSS override in
 * `theme-modes.css` collapses durations, but two things routinely escape it:
 * `scrollIntoView({ behavior: 'smooth' })`, which is a JS option the media
 * query cannot reach, and `scroll-behavior: smooth` set on `<html>` — which
 * this project sets deliberately via `data-scroll-behavior`.
 */

import { expect, test } from "@playwright/test";

import { gotoReady } from "../support/a11y";
import { ROUTES } from "../support/contract";
import { missingRouteNote, routeMissing } from "../support/routes";

test.beforeEach(async ({}, info) => {
  test.skip(
    !info.project.name.includes("reduced-motion"),
    "runs only in the reduced-motion project",
  );
});

test.describe("reduced motion", () => {
  test("the media query is actually active in this project", async ({ page }) => {
    await gotoReady(page, ROUTES.home);
    const reduced = await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    expect(reduced).toBe(true);
  });

  for (const name of ["home", "book", "chapter"] as const) {
    test(`${name}: nothing animates for longer than a frame`, async ({ page }) => {
      test.fixme(routeMissing(name), missingRouteNote(name));
      await gotoReady(page, ROUTES[name]);
      await page.waitForTimeout(200);

      const offenders = await page.evaluate(() => {
        const parse = (value: string) =>
          value
            .split(",")
            .map((v) => {
              const t = v.trim();
              return t.endsWith("ms")
                ? Number.parseFloat(t)
                : Number.parseFloat(t) * 1000 || 0;
            })
            .reduce((a, b) => Math.max(a, b), 0);

        const out: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
          const s = getComputedStyle(el);
          if (s.display === "none" || s.visibility === "hidden") continue;
          const animation = parse(s.animationDuration);
          const transition = parse(s.transitionDuration);
          const infinite = s.animationIterationCount.split(",").some((c) => c.trim() === "infinite");
          if (animation > 100 || transition > 100 || (infinite && animation > 0)) {
            const id = el.id ? `#${el.id}` : "";
            const cls = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 2);
            out.push(
              `${el.tagName.toLowerCase()}${id}${cls.length ? `.${cls.join(".")}` : ""} anim=${animation}ms trans=${transition}ms${infinite ? " infinite" : ""}`,
            );
          }
          if (out.length >= 10) break;
        }
        return out;
      });

      expect(
        offenders,
        `motion survives prefers-reduced-motion:\n  ${offenders.join("\n  ")}`,
      ).toEqual([]);
    });
  }

  test("scroll-behavior is not smooth when motion is reduced", async ({ page }) => {
    test.fixme(routeMissing("chapter"), missingRouteNote("chapter"));
    await gotoReady(page, ROUTES.chapter);
    const behavior = await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollBehavior,
    );
    expect(
      behavior,
      "html sets data-scroll-behavior=smooth; the reduced-motion block must override it",
    ).not.toBe("smooth");
  });
});
