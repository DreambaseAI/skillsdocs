/**
 * Code-block handling: language bounding, copy source, and the code ratio.
 */

import { visit } from "unist-util-visit";
import { toString as hastToString } from "hast-util-to-string";
import type { Element, Root } from "hast";
import type { Root as MdastRoot } from "mdast";
import { MAX_LAZY_LANGS, SPECIAL_LANGS, isKnownLanguage } from "./highlighter";

const LANG_CLASS = /^language-(.+)$/;

/**
 * remark-rehype stores classes under the hast property name `className` as an
 * array; Shiki builds its own trees with the raw attribute name `class` as a
 * string. Reading only one of the two silently mislabels every highlighted
 * block as plain text, which is exactly what happened the first time.
 */
function classList(node: Element): string[] {
  const values = [node.properties?.className, node.properties?.class];
  const out: string[] = [];
  for (const value of values) {
    if (Array.isArray(value)) out.push(...value.map(String));
    else if (typeof value === "string") out.push(...value.split(/\s+/).filter(Boolean));
  }
  return out;
}

/**
 * Bound the set of grammars a single document can pull in.
 *
 * Runs before Shiki. Any fence tagged with a language Shiki does not ship, or
 * tagged past the per-document lazy-load cap, is rewritten to `language-text`
 * so Shiki resolves it without a network of dynamic imports.
 */
export function rehypeBoundCodeLanguages() {
  return (tree: Root) => {
    const lazy = new Set<string>();

    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "code") return;
      const classes = classList(node);
      if (classes.length === 0) return;

      for (let i = 0; i < classes.length; i++) {
        const match = LANG_CLASS.exec(classes[i]);
        if (!match) continue;
        const lang = match[1].toLowerCase();

        if (SPECIAL_LANGS.has(lang)) {
          classes[i] = `language-${lang}`;
          continue;
        }
        if (!isKnownLanguage(lang)) {
          classes[i] = "language-text";
          continue;
        }
        lazy.add(lang);
        classes[i] = lazy.size > MAX_LAZY_LANGS ? "language-text" : `language-${lang}`;
      }

      node.properties = { ...node.properties, className: classes };
    });
  };
}

/**
 * Record the language and the raw source of each block on the `pre`.
 *
 * Runs after Shiki, so `data-source` is the exact text the copy button should
 * put on the clipboard — reconstructed from the highlighted tree rather than
 * kept alongside it, which means it cannot drift from what is on screen.
 */
export function rehypeCodeMeta() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "pre") return;
      const code = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "code",
      );
      if (!code) return;

      const lang = classList(code)
        .find((c) => LANG_CLASS.test(c))
        ?.replace(LANG_CLASS, "$1");

      node.properties = {
        ...node.properties,
        dataLang: lang ?? "text",
        dataSource: hastToString(code),
      };
    });
  };
}

/**
 * Fraction of the document that is fenced code.
 *
 * Computed from mdast before any transform runs, because after Shiki the code
 * text is scattered across thousands of token spans. Gates spread mode
 * (auto-disabled above 0.25) and the drop cap.
 */
export function codeRatioOf(tree: MdastRoot, sourceLength: number): number {
  if (sourceLength <= 0) return 0;
  let codeChars = 0;
  visit(tree, "code", (node) => {
    codeChars += node.value.length;
  });
  return Math.min(1, codeChars / sourceLength);
}
