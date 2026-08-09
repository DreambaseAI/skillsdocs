/**
 * Tests for the tests.
 *
 * The characteristic failure of an accessibility suite is not a false alarm,
 * it is a silent no-op: a selector stops matching, a detector starts returning
 * an empty array, and a green run means nothing. Every check in this suite is
 * therefore exercised here against a synthetic page that is *known* to contain
 * the defect, so a detector that has stopped detecting fails loudly.
 *
 * These run on `page.setContent`, need no server, and cost about a second.
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  findClipped,
  findOverlaps,
  focusRingChangesPixels,
  headingOutline,
  outlineSkips,
} from "../support/a11y";
import { WCAG_TAGS } from "../support/axe";

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "desktop-light", "self-tests are environment-independent");
});

const SHELL = (body: string, css = "") => `
<!doctype html><html lang="en"><head><meta charset="utf-8"><title>harness</title>
<style>
  body { margin: 0; font: 16px/1.5 system-ui, sans-serif; background: #fff; color: #111; }
  main { padding: 24px; }
  ${css}
</style></head><body><main>${body}</main></body></html>`;

test.describe("the focus-ring detector", () => {
  test("passes an element with a ring and fails one with outline:none", async ({ page }) => {
    await page.setContent(
      SHELL(
        `<button id="ok" type="button">With a ring</button>
         <button id="bad" type="button">Ring removed</button>`,
        `#ok:focus-visible { outline: 3px solid #0a5; outline-offset: 2px; }
         #bad:focus-visible { outline: none; }
         #bad:focus { outline: none; }`,
      ),
    );

    await page.locator("#ok").focus();
    expect(await focusRingChangesPixels(page), "a 3px outline must register").toBe(true);

    await page.locator("#bad").focus();
    expect(
      await focusRingChangesPixels(page),
      "outline:none must be detected — if this passes, the keyboard tour is a no-op",
    ).toBe(false);
  });
});

test.describe("the clipping and overlap detectors", () => {
  test("a fixed-height text box reads as clipped", async ({ page }) => {
    await page.setContent(
      SHELL(
        `<p class="fine">This paragraph is allowed to grow to whatever height its text needs.</p>
         <p class="capped">This paragraph is trapped in a box that cannot grow, so the 1.4.12
         override will cut its last lines off entirely and the reader loses content.</p>`,
        `.capped { height: 20px; overflow: hidden; width: 200px; }`,
      ),
    );

    const clipped = await findClipped(page, "main");
    expect(clipped.map((c) => c.selector)).toContain("p.capped");
    expect(clipped.map((c) => c.selector)).not.toContain("p.fine");
  });

  test("overlapping siblings are found and normal flow is not", async ({ page }) => {
    await page.setContent(
      SHELL(
        `<div id="flow"><p>First paragraph.</p><p>Second paragraph.</p></div>
         <div id="stacked"><p class="a">Overlapping one.</p><p class="b">Overlapping two.</p></div>`,
        `#stacked .a { margin-bottom: -40px; }`,
      ),
    );

    const overlaps = await findOverlaps(page, "#stacked");
    expect(overlaps.length, "a negative margin that stacks two paragraphs must be found").toBe(1);

    const clean = await findOverlaps(page, "#flow");
    expect(clean, "ordinary flow must not be reported").toEqual([]);
  });
});

test.describe("the outline detector", () => {
  test("finds a skipped heading level", async ({ page }) => {
    await page.setContent(SHELL(`<h1>One</h1><h3>Jumped to three</h3><h4>Four</h4>`));
    const skips = outlineSkips(await headingOutline(page, "main"));
    expect(skips.length).toBe(1);
    expect(skips[0]).toContain("h1 → h3");
  });

  test("accepts a well-formed outline", async ({ page }) => {
    await page.setContent(SHELL(`<h1>One</h1><h2>Two</h2><h3>Three</h3><h2>Two again</h2>`));
    expect(outlineSkips(await headingOutline(page, "main"))).toEqual([]);
  });
});

test.describe("the dialog-name check", () => {
  /**
   * The predicate the overlay spec applies to the reading-controls panel. A
   * dialog with no accessible name is a 4.1.2 failure and the single most
   * common Base UI mistake — Base UI wires `aria-labelledby` for you only if
   * you actually render `Dialog.Title`.
   */
  const accessibleName = (selector: string) => `
    (() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      const labelledby = el.getAttribute('aria-labelledby');
      const fromId = labelledby
        ? labelledby.split(/\\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? '').join(' ').trim()
        : '';
      return el.getAttribute('aria-label')?.trim() || fromId;
    })()`;

  test("a titled dialog has a name and an untitled one does not", async ({ page }) => {
    await page.setContent(
      SHELL(
        `<div id="named" role="dialog" aria-modal="true" aria-labelledby="t">
           <h2 id="t">Reading controls</h2>
         </div>
         <div id="untitled" role="dialog" aria-modal="true">
           <p>No title was rendered.</p>
         </div>`,
      ),
    );

    expect(await page.evaluate(accessibleName("#named"))).toBe("Reading controls");
    expect(
      await page.evaluate(accessibleName("#untitled")),
      "a dialog without Dialog.Title must read as unnamed",
    ).toBeFalsy();
  });

  test("the configured axe rule set reports an unnamed dialog", async ({ page }) => {
    // Proves the *tag* selection, not just the predicate: if someone trims
    // WCAG_TAGS to `wcag2a` alone, `aria-dialog-name` stops running and a
    // missing Dialog.Title sails through the chrome gate.
    await page.setContent(
      SHELL(`<div role="dialog" aria-modal="true"><p>No title was rendered.</p></div>`),
    );

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(
      results.violations.map((v) => v.id),
      "aria-dialog-name must be part of the enabled rule set",
    ).toContain("aria-dialog-name");
  });
});
