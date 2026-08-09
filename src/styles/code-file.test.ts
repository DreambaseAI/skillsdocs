import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The whole-file chrome, as a stylesheet contract.
 *
 * Every invariant here is a layout or a cascade bug, and jsdom has neither
 * layout nor a cascade — so the guard has to read the source. Re-verify any
 * change of these in a real browser; the measurement is
 * `getBoundingClientRect()` on the gutter and the code beside it at three
 * reader type sizes, not this file.
 */

const CSS = readFileSync(join(process.cwd(), "src/styles/code.css"), "utf8");
/** The same file with the comments removed, for "this must never appear". */
const DECLARED = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/** The body of a rule, given its selector text. */
function block(selector: string): string {
  const at = CSS.indexOf(`${selector} {`);
  expect(at, `no rule for \`${selector}\``).toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf("}", at));
}

const ORDINAL = ".code-block__pre .line > span.code-line__no";

describe("the line-number gutter", () => {
  const rule = block(ORDINAL);

  it("outspecifies Shiki's own span colouring", () => {
    // The four dual-theme rules at the top of the file are `.shiki span`
    // (0,2,0) and `:root.dark .shiki span` (0,3,0), and the ordinal *is* a
    // span inside `.shiki`. Without the element selector taking this to
    // 0,3,1 the gutter would be painted whatever colour Shiki last resolved,
    // and only source order would decide it.
    expect(ORDINAL).toContain("span.code-line__no");
    expect(rule).toMatch(/color:\s*var\(--ink-muted\)/);
  });

  it("is sized in ch off the file's own digit count", () => {
    // `ch` is the wrong unit for prose measure but the right one here: the
    // face is monospaced by construction, so 1ch is exactly one digit and the
    // gutter re-aligns itself at every step of the type-size slider.
    expect(rule).toMatch(/inline-size:\s*calc\(var\(--code-line-digits[^)]*\)\s*\*\s*1ch\)/);
    expect(rule).toMatch(/box-sizing:\s*content-box/);
  });

  it("survives a file scrolled sideways", () => {
    expect(rule).toMatch(/position:\s*sticky/);
    // Without a ground of its own the code would pass under the ordinals.
    expect(rule).toMatch(/background:\s*var\(--code-ground\)/);
  });

  it("never reaches the clipboard or the screen reader", () => {
    expect(rule).toMatch(/user-select:\s*none/);
  });

  it("hangs the continuation lines off the gutter once wrapping is on", () => {
    // A sticky ordinal beside a three-line wrap sits next to the wrong line.
    const wrapped = block('[data-code-wrap="on"] .code-block__pre[data-line-numbers] .line');
    expect(wrapped).toMatch(/padding-inline-start:\s*var\(--code-gutter\)/);
    expect(wrapped).toMatch(/text-indent:\s*calc\(-1 \* var\(--code-gutter\)\)/);
    expect(block('[data-code-wrap="on"] .code-block__pre .line > span.code-line__no')).toMatch(
      /position:\s*static/,
    );
  });
});

describe("the targeted line", () => {
  it("marks `#L42` without spending contrast", () => {
    // The code ground is lifted 0.04 L precisely to get the lowest Shiki scope
    // to 4.55:1. Any wash behind the tokens spends that margin, and the token
    // built for the job (`--selection-bg`, L 0.9 on light) would put the
    // `comment` scope near 3.6:1. A ring costs nothing.
    const rule = block(".code-block__pre .line:target");
    expect(rule).toMatch(/box-shadow:\s*inset/);
    expect(rule).not.toMatch(/(^|[^-])background:/);
  });

  it("marks the sticky ordinal too, so the mark survives a sideways scroll", () => {
    expect(block(".code-block__pre .line:target > span.code-line__no")).toMatch(
      /color:\s*var\(--issue-accent\)/,
    );
  });

  it("clears the site header when a deep link scrolls it into view", () => {
    // Anchored to the start of the line: `[data-code-wrap="on"]
    // .code-block__pre[data-line-numbers] .line` contains this selector as a
    // substring and `block()` would find that one first.
    expect(CSS).toMatch(
      /\n\s*\.code-block__pre\[data-line-numbers\] \.line \{\s*\n\s*scroll-margin-block:/,
    );
  });
});

describe("the clip", () => {
  it("measures the clip in `lh`, so it cannot drift from the leading", () => {
    // `1lh` on the `pre` is exactly one code line — its own font-size times
    // its own line-height — at any reader type size.
    const clip = CSS.slice(CSS.indexOf('.code-file__body[data-clipped="true"]'));
    expect(clip).toMatch(/max-block-size:\s*calc\(var\(--code-clip-lines[^)]*\)\s*\*\s*1lh/);
    // And a plain fallback first, for the browsers without the unit.
    expect(clip).toMatch(/max-block-size:\s*62rem;/);
  });

  it("wraps `:has()` in `:where()` so an old browser drops the match, not the rule", () => {
    // `:not()` is not forgiving. An unsupported `:has()` inside a bare
    // `:not(:has(…))` invalidates the whole declaration block and un-clips
    // every long file in the corpus.
    expect(DECLARED).toContain(":not(:where(:has(.line:target)))");
    expect(DECLARED).not.toMatch(/:not\(:has\(/);
  });

  it("clips on the named scroll container, never on the `pre`", () => {
    // `overflow` is not per-axis independent: `visible` computes to `auto` as
    // soon as the other axis is anything else. `overflow-y: hidden` on the
    // `pre` therefore makes it a *horizontal* scroller too, nested inside the
    // one that already exists — and that inner box has no `tabindex` and no
    // accessible name. Measured as axe `scrollable-region-focusable` on
    // `init-artifact.sh`, whose long `printf` lines overflow the clipped
    // region sideways. The cap stays on the `pre` because `1lh` has to
    // resolve against the code's own font; only the overflow moves out.
    const clip = CSS.slice(CSS.indexOf('.code-file__body[data-clipped="true"]'));
    const preRule = clip.slice(0, clip.indexOf("}"));
    expect(preRule).not.toMatch(/overflow/);
    expect(clip).toMatch(
      /\.code-file__body\[data-clipped="pinned"\] \.code-block__scroll \{[^}]*overflow-y:\s*hidden/,
    );
  });

  it("distinguishes 'not expanded yet' from 'collapsed again by hand'", () => {
    // Only the first yields to a deep link. A button reading "show all" over a
    // file that is visibly already all there is worse than a short scroll.
    expect(CSS).toContain('[data-clipped="pinned"]');
    expect(CSS).toContain('[data-clipped="true"]');
  });
});

describe("print and forced colours", () => {
  it("opens every clipped file on paper", () => {
    // Paper has no buttons. A file printed clipped is a file the reader cannot
    // get at.
    const print = CSS.slice(CSS.indexOf("@media print"));
    expect(print).toMatch(/max-block-size:\s*none/);
    expect(print).toMatch(/\.code-file__more,?[\s\S]{0,120}display:\s*none/);
  });

  it("keeps the gutter opaque and the target visible under forced colours", () => {
    const hcm = CSS.slice(
      CSS.indexOf("@media (forced-colors: active)"),
      CSS.indexOf("@media (prefers-contrast: more)"),
    );
    expect(hcm).toMatch(/span\.code-line__no \{[^}]*background:\s*Canvas/);
    expect(hcm).toMatch(/outline:\s*2px solid Highlight/);
  });
});
