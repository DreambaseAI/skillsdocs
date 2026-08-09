/**
 * Micro-typography: smart punctuation and non-breaking glue.
 *
 * The two passes run at different stages, and the split is load-bearing.
 *
 * **Smart punctuation runs on mdast.** There, `code` and `inlineCode` are
 * their own node types, so a `text` visitor physically cannot reach a shell
 * command. Doing it on hast would mean maintaining an ancestor skip-list and
 * getting it wrong exactly once.
 *
 * **Non-breaking glue runs on hast, last.** It has to: gluing "Write the
 * SKILL.md" before `rehype-slug` sees it produces the id `writetheskillmd`
 * instead of `write-the-skillmd`, because U+00A0 is not a word separator to
 * github-slugger. Every in-page anchor and every TOC link in the document
 * would break. Measured, not theorised — it happened on the first run against
 * `anthropics/skills`.
 *
 * Implemented here rather than pulled in as `remark-smartypants` for two
 * reasons: a naive smartypants turns the CLI flag `--recursive` into
 * "–recursive" in running prose, which in a document about running commands is
 * a real defect; and the glue pass has no off-the-shelf equivalent.
 * See `reading-ux.md` §3.5.
 */

import { visit } from "unist-util-visit";
import type { Element, Root as HastRoot, RootContent as HastContent } from "hast";
import type { Root, Text } from "mdast";

const NBSP = " ";
const EN_DASH = "–";
const EM_DASH = "—";
const ELLIPSIS = "…";
const LSQUO = "‘";
const RSQUO = "’";
const LDQUO = "“";
const RDQUO = "”";

/** Text that is really a machine string: leave every character alone. */
const MACHINE = /^(?:[a-z][a-z0-9+.-]*:\/\/|\.{0,2}\/|[\w.-]+\/[\w./-]+$)/i;

function isMachineText(value: string): boolean {
  return MACHINE.test(value.trim());
}

/* ------------------------------------------------------------ smartypants */

function curlyQuotes(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch !== '"' && ch !== "'") {
      out += ch;
      continue;
    }
    const prev = i === 0 ? "" : input[i - 1];
    // An opening mark follows nothing, whitespace, or an opening bracket/dash.
    const opening = prev === "" || /[\s([{<—–]/.test(prev);
    if (ch === '"') {
      out += opening ? LDQUO : RDQUO;
    } else {
      // A straight apostrophe between word characters is always a right single
      // quote — "don't", "'90s" and "readers'" all resolve correctly this way.
      out += /[A-Za-z0-9]/.test(prev) ? RSQUO : opening ? LSQUO : RSQUO;
    }
  }
  return out;
}

/**
 * Exported because frontmatter never enters the remark pipeline.
 *
 * A skill's `description` is rendered as a deck, as a TOC entry and as an
 * index row without ever passing through `remarkSmartypants`, so `skill's`
 * arrived at 24px with a U+0027 two inches above a body that set `user’s`
 * with a U+2019. One transform, both paths.
 */
export function smartenText(value: string): string {
  return isMachineText(value) ? value : smarten(value);
}

export function smarten(value: string): string {
  return curlyQuotes(
    value
      .replace(/---/g, EM_DASH)
      // `--` becomes an en dash only when it is punctuation, never when it is
      // the start of a long flag (`--dry-run`) or the middle of one.
      .replace(/(\s)--(\s)/g, `$1${EN_DASH}$2`)
      .replace(/(\d)--(\d)/g, `$1${EN_DASH}$2`)
      .replace(/\.\.\./g, ELLIPSIS),
  );
}

export function remarkSmartypants() {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, _index, parent) => {
      if (isMachineText(node.value)) return;
      // An autolink's visible text is its URL; smartening it would corrupt it.
      if (parent && parent.type === "link" && node.value === (parent as { url?: string }).url) {
        return;
      }
      node.value = smarten(node.value);
    });
  };
}

/* ------------------------------------------------------------------- glue */

/** Units that must never be orphaned from their number. */
const UNITS =
  "B|kB|KB|MB|GB|TB|KiB|MiB|GiB|bytes?|bits?|ms|s|min|hr|h|px|pt|em|rem|ch|%|×|x|k|M";

/** Articles and prepositions of three letters or fewer. */
const SHORT_WORDS =
  "a|an|the|in|on|at|of|to|is|it|as|by|or|and|for|if|we|be|no|so|up|do|per|via|but|not";

/** Multi-word product names that should never break across a line. */
const PHRASES: Array<[RegExp, string]> = [
  [/\bClaude Code\b/g, `Claude${NBSP}Code`],
  [/\bClaude Desktop\b/g, `Claude${NBSP}Desktop`],
  [/\bGitHub Skills\b/g, `GitHub${NBSP}Skills`],
  [/\bAgent Skills\b/g, `Agent${NBSP}Skills`],
];

function glue(value: string): string {
  let out = value;
  for (const [pattern, replacement] of PHRASES) out = out.replace(pattern, replacement);
  out = out.replace(new RegExp(`(\\d)\\s+(${UNITS})\\b`, "g"), `$1${NBSP}$2`);
  // Bind a short function word to the word it governs. The 12-character cap on
  // the following word keeps the unbreakable run short enough to survive a
  // 320px viewport (1.4.10).
  out = out.replace(
    new RegExp(`\\b(${SHORT_WORDS}) (\\w{1,12})\\b`, "gi"),
    `$1${NBSP}$2`,
  );
  return out;
}

/** Elements whose text is machine-readable and must never be re-spaced. */
const NO_GLUE = new Set(["pre", "code", "kbd", "samp", "var", "script", "style"]);

const HEADING = /^h[1-6]$/;

function glueSubtree(nodes: HastContent[]): void {
  for (const node of nodes) {
    if (node.type === "text") {
      if (!isMachineText(node.value)) node.value = glue(node.value);
      continue;
    }
    if (node.type !== "element") continue;
    if (NO_GLUE.has(node.tagName)) continue;
    glueSubtree(node.children);
  }
}

/** Last text node in document order, so a heading's tail can be bound. */
function lastTextNode(nodes: HastContent[]): Text | undefined {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (node.type === "text" && node.value.trim() !== "") return node as unknown as Text;
    if (node.type === "element" && !NO_GLUE.has(node.tagName)) {
      const found = lastTextNode(node.children);
      if (found) return found;
    }
  }
  return undefined;
}

function textLength(nodes: HastContent[]): number {
  let words = 0;
  for (const node of nodes) {
    if (node.type === "text") {
      const trimmed = node.value.trim();
      if (trimmed) words += trimmed.split(/\s+/).length;
    } else if (node.type === "element") {
      words += NO_GLUE.has(node.tagName) ? 1 : textLength(node.children);
    }
  }
  return words;
}

/**
 * Runs last, after `rehype-slug`, so heading ids are computed from ordinary
 * spaces. See the module header.
 */
export function rehypeNbsp() {
  return (tree: HastRoot) => {
    glueSubtree(tree.children);

    // Bind the final two words of a short heading so it never leaves a widow.
    visit(tree, "element", (node: Element) => {
      if (!HEADING.test(node.tagName)) return;
      if (textLength(node.children) > 8) return;
      const last = lastTextNode(node.children);
      if (!last) return;
      const idx = last.value.lastIndexOf(" ");
      if (idx === -1) return;
      last.value = `${last.value.slice(0, idx)}${NBSP}${last.value.slice(idx + 1)}`;
    });
  };
}
