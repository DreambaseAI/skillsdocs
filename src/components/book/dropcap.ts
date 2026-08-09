import { toString as hastToString } from "hast-util-to-string";
import type { Element, Root } from "hast";

/**
 * Whether a document has earned a drop cap.
 *
 * `prose.css` sinks `p:first-of-type` whenever the container carries
 * `data-dropcap`, and it has no way to know what that paragraph contains. Two
 * real cases in the corpus make an ungated drop cap look like a bug rather
 * than a flourish:
 *
 * - **A badge paragraph.** Half the READMEs on GitHub open with a line of
 *   shields.io images inside a `<p>`. `::first-letter` then matches nothing
 *   visible and the cap silently disappears, or worse, lands on a stray
 *   character between two badges.
 * - **A one-line opening paragraph.** A three-line initial next to a
 *   single-line paragraph pushes the *next* paragraph up beside the cap, which
 *   reads as two paragraphs run together. Butterick's floor of roughly three
 *   lines of text is what makes the sink look intentional; 180 characters is
 *   three lines at the default 68-character measure.
 *
 * A document that opens on a fence or a table is also refused: the cap would
 * land on whatever prose happens to follow the code, which is not the opening
 * of anything.
 */

const MIN_CHARS = 180;

export function shouldDropCap(tree: Root): boolean {
  for (const node of tree.children) {
    if (node.type !== "element") continue;
    const element = node as Element;

    if (element.tagName === "pre" || element.tagName === "table") return false;
    if (element.tagName !== "p") continue;

    return hastToString(element).trim().length >= MIN_CHARS;
  }
  return false;
}
