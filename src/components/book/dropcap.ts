import { toString as hastToString } from "hast-util-to-string";
import type { Element, Root } from "hast";

/**
 * How a document's first paragraph is opened.
 *
 * `prose.css` decorates `p:first-of-type` from the `data-dropcap` attribute,
 * and it has no way to know what that paragraph contains. Two real cases in
 * the corpus make an ungated drop cap look like a bug rather than a flourish:
 *
 * - **A badge paragraph.** Half the READMEs on GitHub open with a line of
 *   shields.io images inside a `<p>`. `::first-letter` then matches nothing
 *   visible and the cap silently disappears, or worse, lands on a stray
 *   character between two badges.
 * - **A one-line opening paragraph.** A three-line sunk initial next to a
 *   single-line paragraph pushes the *next* paragraph up beside the cap, which
 *   reads as two paragraphs run together.
 *
 * The old gate stopped there, and the result was worse than no drop cap at
 * all: **measured 39 of 111 chapters (35%)** across five repositories carried
 * one, so a reader saw a decorated opener on chapter 01 and a bare paragraph
 * on chapter 02 with no explanation. `skill-creator` — the flagship — opens on
 * a 63-character sentence and got nothing.
 *
 * So there are now two treatments and a floor, not one treatment and a cliff:
 *
 * | opening block                            | mode     |
 * |------------------------------------------|----------|
 * | paragraph, ≥ `MIN_SUNK_CHARS` of text    | `sunk`   |
 * | paragraph, any real text                 | `raised` |
 * | fence, table, list, image-only paragraph | `none`   |
 *
 * A raised initial costs no lines of measure, so it is safe on the short
 * paragraph the sunk cap cannot take, and it is safe on a phone where the sunk
 * cap is switched off entirely.
 *
 * The document-wide code ratio is deliberately *not* consulted. Whether a
 * chapter is 40% fenced code says nothing about whether its opening sentence
 * can carry an initial, and using it as a gate refused four otherwise perfect
 * openers.
 */

export type DropCapMode = "sunk" | "raised" | "none";

/**
 * Three lines of a 68-character measure is roughly 180 characters, which is
 * where this floor used to sit. Butterick's rule is about the *sink* looking
 * intentional, and at 90 characters — a line and a half — it still does,
 * because the fallback below catches everything shorter.
 */
const MIN_SUNK_CHARS = 90;

/**
 * Elements that may precede the opening paragraph without disqualifying it.
 *
 * A section heading before the first paragraph is not an interruption, it is
 * the classic magazine form — 11 of the 17 `anthropics/skills` chapters open
 * `## Overview` and then their real first sentence. Refusing those was what
 * held coverage at 35%. A fence, a table, a list or a `div` is different: the
 * cap would land on whatever prose happens to follow it, which is not the
 * opening of anything, so anything not listed here still returns `none`.
 */
const SKIP = new Set(["hr", "h1", "h2", "h3", "h4", "h5", "h6"]);

/**
 * Does this paragraph contain enough real text to decorate?
 *
 * A badge row is `<p><a><img></a><a><img></a></p>` — `hastToString` returns
 * the empty string, and `::first-letter` has nothing to match.
 */
function textOf(element: Element): string {
  return hastToString(element).trim();
}

/** The first character must be one a reader recognises as the start of a word. */
function opensOnAWord(text: string): boolean {
  return /^[\p{L}\p{N}]/u.test(text);
}

export function dropCapMode(tree: Root): DropCapMode {
  for (const node of tree.children) {
    if (node.type !== "element") continue;
    const element = node as Element;
    if (SKIP.has(element.tagName)) continue;

    // The cap would land on whatever prose happens to follow the code, which
    // is not the opening of anything.
    if (element.tagName !== "p") return "none";

    const text = textOf(element);
    if (text === "" || !opensOnAWord(text)) return "none";
    return text.length >= MIN_SUNK_CHARS ? "sunk" : "raised";
  }
  return "none";
}

/** Back-compat shim for callers that only need to know a cap is wanted. */
export function shouldDropCap(tree: Root): boolean {
  return dropCapMode(tree) === "sunk";
}
