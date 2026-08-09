import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A stylesheet contract, because the bug it guards is a layout bug and jsdom
 * has no layout.
 *
 * Shiki emits a literal `\n` text node *between* every `<span class="line">`.
 * Those spans are `display: block`, so with `white-space: pre` on an ancestor
 * each of those newlines renders its own empty line box and the leading of
 * every fence in the product doubles. Measured on
 * `/anthropics/skills/skill-creator` before the fix: computed `line-height`
 * 24.22px, `.line` height 24px, and a line-to-line pitch of 48–49px — an
 * effective leading of 3.07 on a 15.63px mono face, on 30–50% of the corpus.
 * ASCII tree diagrams lost their verticals as a direct result.
 *
 * The invariant: whitespace collapses on `code`, and preformatting lives on
 * `.line`. Re-verify with a browser if this ever needs changing —
 * `getBoundingClientRect().top` deltas on four consecutive `pre` blocks is the
 * measurement, not this file.
 */

const CSS = readFileSync(join(process.cwd(), "src/styles/code.css"), "utf8");

/** The body of a rule, given its selector text. */
function block(selector: string): string {
  const at = CSS.indexOf(`${selector} {`);
  expect(at, `no rule for \`${selector}\``).toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf("}", at));
}

describe("code block leading", () => {
  it("collapses whitespace on the code element", () => {
    expect(block(".code-block__pre code")).toMatch(/white-space:\s*normal/);
  });

  it("puts the preformatting on the line, where it cannot double the leading", () => {
    expect(block(".code-block__pre .line")).toMatch(/white-space:\s*pre\b/);
  });

  it("keeps the opt-in wrap reaching the line, not just its ancestors", () => {
    expect(block('[data-code-wrap="on"] .code-block__pre .line')).toMatch(
      /white-space:\s*pre-wrap/,
    );
  });
});

describe("inline code", () => {
  const inline = block(".prose :not(pre) > code");

  it("is a tint, not a bordered chip", () => {
    // One paragraph of `claude-api` carries nine code spans; nine pills in a
    // row read as a tag cloud rather than as prose.
    expect(inline).toMatch(/border:\s*none/);
    expect(inline).toMatch(/background:\s*color-mix/);
  });

  it("is the same size as block code, so a token does not change size", () => {
    // Measured: `evals/evals.json` was 16.815px in a paragraph and 15.628px in
    // a fence on the same page in the same family. Both are now 0.875em of the
    // body plus the reader's own code-size step (0.0525 = 0.875 x 0.06).
    expect(inline).toMatch(
      /font-size:\s*calc\(0\.875em \+ 0\.0525em \* var\(--reader-code-offset\)\)/,
    );
    expect(block(".code-block__pre")).toMatch(/font-size:\s*0\.875em/);
    expect(block(".code-block")).toMatch(
      /font-size:\s*calc\(1em \+ var\(--reader-code-offset\) \* 0\.06em\)/,
    );
  });

  it("keeps an outline under forced colours, where a tint is dropped", () => {
    const hcm = CSS.slice(CSS.indexOf("@media (forced-colors: active)"));
    expect(hcm).toMatch(/\.prose :not\(pre\) > code \{[^}]*border:\s*1px solid CanvasText/);
  });

  it("paints nothing behind a code span inside a link", () => {
    // `--issue-accent` is pinned to the lightness where accent-on-paper is
    // exactly AA, so any wash behind accent-coloured text spends that margin
    // and a wash of the accent itself spends the most. Measured on a
    // production build with a 12% accent tint: `openai/skills` 4.22:1 (axe,
    // serious, WCAG 1.4.3), plus 10 failing nodes on `mattpocock/skills`, 8 on
    // `DreambaseAI/skills` and 2 on `supabase/agent-skills`. `verify:contrast`
    // audits token pairs and cannot see a pair that only exists once two rules
    // composite, so the guard has to live here.
    const linked = block(".prose .prose-link > code");
    expect(linked).toMatch(/background:\s*transparent/);
    expect(linked).not.toMatch(/--issue-accent/);
  });
});
