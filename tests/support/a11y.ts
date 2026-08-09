/**
 * Measurement primitives shared by the accessibility specs.
 *
 * Everything here answers a question a screenshot cannot: is this element
 * clipped, do these two paragraphs overlap, did the focus ring actually change
 * any pixels, is this heading outline well formed. Assertions live in the
 * specs; this file only measures.
 */

import type { BrowserContext, Locator, Page } from "@playwright/test";

import { PREFS_COOKIE, PREFS_COOKIE_MAX_AGE, serializePrefs } from "@/lib/reader/prefs";
import type { ReaderPrefs } from "@/lib/reader/prefs";

/* ---------------------------------------------------------- navigation */

/**
 * Navigate and wait for the streamed content to actually be in the document.
 *
 * Under Cache Components the shell prerenders and the body arrives in a later
 * chunk, which React first parks in a hidden staging `<div>` and then adopts.
 * `page.goto()` resolves at `load`, which is *before* that adoption: query the
 * DOM then and `<main>` contains the skeleton, every real element measures
 * 0×0, and half this suite quietly asserts against a page that does not exist
 * yet. Waiting for a laid-out heading inside `<main>` is the cheapest signal
 * that the real body has landed, and it works on every route in the product.
 */
export async function gotoReady(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(
    () => {
      const main = document.querySelector("main");
      if (!main) return false;
      const heading = main.querySelector("h1, h2");
      return Boolean(heading && heading.getBoundingClientRect().height > 0);
    },
    undefined,
    { timeout: 30_000 },
  );
}

/* ------------------------------------------------------------ preferences */

/**
 * Applies reading preferences the way a returning reader has them: as the
 * `reader-prefs` cookie, which `ReaderPrefsScript` reads in `<head>` before
 * first paint. No dependency on WS-5's panel being finished.
 */
export async function applyPrefs(
  context: BrowserContext,
  baseURL: string,
  prefs: ReaderPrefs,
): Promise<void> {
  const { hostname } = new URL(baseURL);
  await context.addCookies([
    {
      name: PREFS_COOKIE,
      value: encodeURIComponent(serializePrefs(prefs)),
      domain: hostname,
      path: "/",
      expires: Math.floor(Date.now() / 1000) + PREFS_COOKIE_MAX_AGE,
      sameSite: "Lax",
    },
  ]);
}

/* --------------------------------------------------------- clip / overlap */

export interface ClippedElement {
  selector: string;
  reason: "horizontal" | "vertical";
  scroll: number;
  client: number;
  overflow: string;
  text: string;
}

export interface OverlapPair {
  a: string;
  b: string;
  overlapPx: number;
}

/**
 * Elements whose content is cut off rather than allowed to grow.
 *
 * A container with `overflow: auto | scroll` is not clipped — that is the
 * permitted 1.4.10 escape for code blocks and wide tables. A container with
 * `overflow: hidden | clip` whose content exceeds it has lost content, which
 * is exactly what 1.4.12 forbids.
 */
export async function findClipped(page: Page, root: string): Promise<ClippedElement[]> {
  return page.evaluate((rootSelector) => {
    const container = document.querySelector(rootSelector) ?? document.body;
    const out: ClippedElement[] = [];

    const describe = (el: Element): string => {
      const parts = [el.tagName.toLowerCase()];
      if (el.id) parts.push(`#${el.id}`);
      const cls = (el.getAttribute("class") ?? "").trim().split(/\s+/).filter(Boolean);
      if (cls.length) parts.push(`.${cls.slice(0, 3).join(".")}`);
      return parts.join("");
    };

    for (const el of Array.from(container.querySelectorAll<HTMLElement>("*"))) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      // sr-only text is deliberately clipped to a 1px box.
      if (el.classList.contains("sr-only")) continue;

      const text = (el.textContent ?? "").trim().slice(0, 80);
      if (!text) continue;

      // `display: contents` and other box-less elements report clientWidth 0
      // against a non-zero scrollWidth. That is not clipping, it is the
      // absence of a box, and treating it as clipping buries the real hits.
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const hiddenX = style.overflowX === "hidden" || style.overflowX === "clip";
      const hiddenY = style.overflowY === "hidden" || style.overflowY === "clip";

      if (hiddenX && el.scrollWidth > el.clientWidth + 1) {
        out.push({
          selector: describe(el),
          reason: "horizontal",
          scroll: el.scrollWidth,
          client: el.clientWidth,
          overflow: style.overflowX,
          text,
        });
      }
      if (hiddenY && el.scrollHeight > el.clientHeight + 1) {
        out.push({
          selector: describe(el),
          reason: "vertical",
          scroll: el.scrollHeight,
          client: el.clientHeight,
          overflow: style.overflowY,
          text,
        });
      }
    }
    return out;
  }, root);
}

/**
 * Consecutive block siblings whose boxes intersect vertically.
 *
 * This is how a fixed-height container fails 1.4.12: nothing reports as
 * clipped, the lines simply land on top of each other. Two pixels of tolerance
 * absorbs subpixel layout; anything more is real.
 */
export async function findOverlaps(page: Page, root: string): Promise<OverlapPair[]> {
  return page.evaluate((rootSelector) => {
    const container = document.querySelector(rootSelector);
    if (!container) return [];
    const TOLERANCE = 2;
    const out: OverlapPair[] = [];

    const describe = (el: Element): string => {
      const id = el.id ? `#${el.id}` : "";
      return `${el.tagName.toLowerCase()}${id}: ${(el.textContent ?? "").trim().slice(0, 48)}`;
    };

    const blocks = Array.from(
      container.querySelectorAll<HTMLElement>(
        "p, li, h1, h2, h3, h4, h5, h6, blockquote, figure, pre, dt, dd",
      ),
    ).filter((el) => {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden") return false;
      if (s.position === "absolute" || s.position === "fixed") return false;
      if (el.classList.contains("sr-only")) return false;
      return (el.textContent ?? "").trim().length > 0;
    });

    for (let i = 0; i < blocks.length - 1; i += 1) {
      const a = blocks[i];
      const b = blocks[i + 1];
      // Only compare true siblings; nesting (li inside ul inside li) overlaps
      // by definition and says nothing about spacing.
      if (a.parentElement !== b.parentElement) continue;
      if (a.contains(b) || b.contains(a)) continue;

      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      if (ra.height === 0 || rb.height === 0) continue;
      // Side-by-side (grid/flex row) is not an overlap.
      if (rb.left >= ra.right - 1 || ra.left >= rb.right - 1) continue;

      const overlap = ra.bottom - rb.top;
      if (overlap > TOLERANCE) {
        out.push({ a: describe(a), b: describe(b), overlapPx: Math.round(overlap) });
      }
    }
    return out;
  }, root);
}

/** Horizontal scrolling of the page itself — WCAG 1.4.10. */
export async function documentOverflowsHorizontally(page: Page): Promise<{
  overflows: boolean;
  scrollWidth: number;
  clientWidth: number;
  offenders: string[];
}> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const scrollWidth = Math.max(doc.scrollWidth, document.body.scrollWidth);
    const clientWidth = doc.clientWidth;
    const offenders: string[] = [];

    if (scrollWidth > clientWidth + 1) {
      for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden") continue;
        if (s.position === "fixed") continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        if (r.right > clientWidth + 1) {
          // Its own scroll container is the permitted 1.4.10 escape.
          const scrolls = s.overflowX === "auto" || s.overflowX === "scroll";
          if (scrolls) continue;
          const id = el.id ? `#${el.id}` : "";
          const cls = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 2);
          offenders.push(
            `${el.tagName.toLowerCase()}${id}${cls.length ? `.${cls.join(".")}` : ""} right=${Math.round(r.right)}`,
          );
        }
        if (offenders.length >= 12) break;
      }
    }

    return { overflows: scrollWidth > clientWidth + 1, scrollWidth, clientWidth, offenders };
  });
}

/* ------------------------------------------------------------- focus ring */

export interface FocusStop {
  index: number;
  description: string;
  ringVisible: boolean;
  inViewport: boolean;
}

/** A short, human-readable identity for whatever currently has focus. */
export async function describeActiveElement(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return "body";
    const id = el.id ? `#${el.id}` : "";
    const name =
      el.getAttribute("aria-label") ??
      (el.textContent ?? "").trim().slice(0, 40) ??
      "";
    const cls = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 2);
    return `${el.tagName.toLowerCase()}${id}${cls.length ? `.${cls.join(".")}` : ""}${name ? ` "${name}"` : ""}`;
  });
}

/**
 * Does focusing this element change any pixels?
 *
 * Reading `outline-width` is not enough: a ring can be a `box-shadow`, a
 * background swap, a pseudo-element, or a `ring-*` utility, and a `:focus`
 * rule can be overridden by something more specific further down the cascade.
 * Comparing the rendered bytes of the element's box, focused versus not, is
 * the only check that cannot be fooled — and it is what a sighted keyboard
 * user actually experiences.
 */
export async function focusRingChangesPixels(page: Page, pad = 8): Promise<boolean> {
  const box = await page.evaluate((padding) => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    // A control that Tab scrolled only partly into view yields a clip box that
    // misses the ring, so the comparison would report "no ring" for an element
    // whose ring is simply off-camera. Centre it first, then measure.
    el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    if (r.top - padding < 0 || r.bottom + padding > document.documentElement.clientHeight) {
      return null; // taller than the viewport; cannot frame it fairly
    }
    return {
      x: Math.max(0, Math.floor(r.left - padding)),
      y: Math.max(0, Math.floor(r.top - padding)),
      width: Math.min(
        document.documentElement.clientWidth - Math.max(0, Math.floor(r.left - padding)),
        Math.ceil(r.width + padding * 2),
      ),
      height: Math.min(
        document.documentElement.clientHeight - Math.max(0, Math.floor(r.top - padding)),
        Math.ceil(r.height + padding * 2),
      ),
    };
  }, pad);

  if (!box || box.width <= 0 || box.height <= 0) return true;

  const focused = await page.screenshot({ clip: box, animations: "disabled" });

  const restored = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return false;
    (el as HTMLElement).blur();
    return true;
  });
  if (!restored) return true;

  const blurred = await page.screenshot({ clip: box, animations: "disabled" });
  return !focused.equals(blurred);
}

/** Restores focus after `focusRingChangesPixels` blurred it, so Tab continues. */
export async function refocus(page: Page, handle: Locator): Promise<void> {
  await handle.evaluate((el: HTMLElement) => el.focus());
}

/* ------------------------------------------------------- heading outline */

export interface HeadingNode {
  level: number;
  text: string;
  id: string;
}

export async function headingOutline(page: Page, root = "body"): Promise<HeadingNode[]> {
  return page.evaluate((rootSelector) => {
    const container = document.querySelector(rootSelector) ?? document.body;
    return Array.from(
      container.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, [role='heading']"),
    )
      .filter((el) => {
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden") return false;
        if (el.getAttribute("aria-hidden") === "true") return false;
        return true;
      })
      .map((el) => ({
        level: el.hasAttribute("aria-level")
          ? Number(el.getAttribute("aria-level"))
          : Number(el.tagName.slice(1)),
        text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
        id: el.id,
      }));
  }, root);
}

/** Levels that jump by more than one — the only outline defect that matters. */
export function outlineSkips(headings: HeadingNode[]): string[] {
  const problems: string[] = [];
  let previous = 0;
  for (const h of headings) {
    if (previous !== 0 && h.level > previous + 1) {
      problems.push(`h${previous} → h${h.level} at "${h.text}"`);
    }
    previous = h.level;
  }
  return problems;
}
