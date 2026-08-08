/**
 * Heading normalisation.
 *
 * A chapter page already renders the skill title as the page `<h1>`. Almost
 * every third-party `SKILL.md` also opens with its own `# Title`, and plenty of
 * them jump straight from `#` to `###`. Left alone that produces two `h1`s and
 * an outline with holes in it, which is a 1.3.1 failure and makes the document
 * unnavigable by heading for screen-reader users.
 *
 * So we repair the outline, and we *record* every repair. The colophon shows
 * the list: telling a repo owner "we had to shift your headings" is a feature,
 * not an apology.
 */

import { visit } from "unist-util-visit";
import { toString as hastToString } from "hast-util-to-string";
import type { Element, Root, RootContent } from "hast";

export type HeadingRepair = {
  kind: "stripped-h1" | "shifted" | "level-repaired";
  from: number;
  to: number;
  text: string;
};

export interface HeadingNormalizeOptions {
  /** Chapter title rendered by the page, so a duplicate leading H1 can go. */
  title?: string;
  /** Level the page's own heading occupies. Document headings start below it. */
  pageHeadingDepth?: number;
  sink: HeadingRepair[];
}

const HEADING = /^h([1-6])$/;

function depthOf(node: Element): number | null {
  const m = HEADING.exec(node.tagName);
  return m ? Number(m[1]) : null;
}

/** Loose comparison: a leading "# Skill Creator" duplicates "skill-creator". */
function sameTitle(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return norm(a) !== "" && norm(a) === norm(b);
}

export function rehypeHeadingNormalize(options: HeadingNormalizeOptions) {
  const { title, pageHeadingDepth = 1, sink } = options;

  return (tree: Root) => {
    // Collect in document order. Headings usually sit at the document root but
    // may also appear inside blockquotes and list items; `visit` covers both.
    const found: Array<{ node: Element; depth: number }> = [];
    visit(tree, "element", (node: Element) => {
      const depth = depthOf(node);
      if (depth !== null) found.push({ node, depth });
    });

    if (found.length === 0) return;

    // 1. Strip a leading H1 that merely repeats the chapter title.
    let head = 0;
    const first = found[0];
    if (
      title &&
      first.depth === 1 &&
      sameTitle(hastToString(first.node), title) &&
      // Only when it really is the document's opener — a mid-document H1 that
      // happens to match the title is a section, not a duplicate masthead.
      isLeading(tree, first.node)
    ) {
      const text = hastToString(first.node).trim();
      removeNode(tree, first.node);
      sink.push({ kind: "stripped-h1", from: 1, to: 0, text });
      head = 1;
    }

    const remaining = found.slice(head);
    if (remaining.length === 0) return;

    // 2. Shift the whole document down so nothing competes with the page H1.
    const minDepth = Math.min(...remaining.map((h) => h.depth));
    const shift = Math.max(0, pageHeadingDepth + 1 - minDepth);
    if (shift > 0) {
      // One aggregate record: a per-heading entry for a uniform shift would
      // bury the interesting repairs under thirty identical lines.
      sink.push({
        kind: "shifted",
        from: minDepth,
        to: minDepth + shift,
        text: `${remaining.length} heading${remaining.length === 1 ? "" : "s"}`,
      });
    }

    // 3. Repair skipped levels. A heading may never be more than one level
    //    deeper than the heading before it; the page H1 is the starting point.
    let previous = pageHeadingDepth;
    for (const heading of remaining) {
      const shifted = Math.min(6, heading.depth + shift);
      const repaired = Math.min(shifted, previous + 1);
      if (repaired !== shifted) {
        sink.push({
          kind: "level-repaired",
          from: shifted,
          to: repaired,
          text: hastToString(heading.node).trim(),
        });
      }
      heading.node.tagName = `h${repaired}`;
      previous = repaired;
    }
  };
}

/** True when nothing but whitespace precedes the node at the document root. */
function isLeading(tree: Root, node: Element): boolean {
  for (const child of tree.children) {
    if (child === node) return true;
    if (child.type === "text" && child.value.trim() === "") continue;
    return false;
  }
  return false;
}

/** Only ever called for a document-leading node, which is a root child. */
function removeNode(tree: Root, node: Element): void {
  const i = tree.children.indexOf(node as RootContent);
  if (i !== -1) tree.children.splice(i, 1);
}

/** Collect headings from the final tree so ids match the rendered anchors. */
export function collectHeadings(
  tree: Root,
): Array<{ depth: number; text: string; id: string }> {
  const headings: Array<{ depth: number; text: string; id: string }> = [];
  visit(tree, "element", (node: Element) => {
    const depth = depthOf(node);
    if (depth === null) return;
    const id = typeof node.properties?.id === "string" ? node.properties.id : "";
    // The glue pass leaves U+00A0 in the DOM on purpose; rails, search and the
    // markdown twin all want ordinary spaces.
    const text = hastToString(node).replace(/ /g, " ").trim();
    if (!text) return;
    headings.push({ depth, text, id });
  });
  return headings;
}
