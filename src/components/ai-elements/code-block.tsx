/**
 * CodeBlock — a whole source file, highlighted on the server.
 *
 * ## Origin and attribution
 *
 * Derived from the **ai-elements `CodeBlock`** (Vercel, Apache-2.0), fetched
 * from `https://registry.ai-sdk.dev/code-block.json` and installed with
 * `pnpm dlx shadcn@latest add`. The original is preserved verbatim in this
 * file's history of intent below; what follows is an honest ledger of what was
 * kept and what was replaced, because almost none of the original body
 * survived and pretending otherwise would be worse than not crediting it.
 *
 * ### Kept from ai-elements
 *
 * - **The line-number Shiki transformer.** The idea we did not have and that
 *   every whole-file view needs: decorate each `line` node during
 *   highlighting rather than reconstructing gutters afterwards.
 * - **The prop shape** — `{ code, language, showLineNumbers }` — and the
 *   separate, context-fed copy button.
 *
 * ### Replaced, and why
 *
 * - **Client-side highlighting.** The original calls `codeToHtml` inside
 *   `useEffect`, so the block mounts empty and pops in after hydration, ships
 *   Shiki plus every grammar it touches to the browser, and puts nothing in
 *   the HTML for a crawler, a reader with JS off, or a print. Ours highlights
 *   in a server component against the process-wide singleton in
 *   `lib/markdown/highlighter.ts`: 0 KB of Shiki on the client, tokens in the
 *   initial HTML, and one shared grammar cache with the prose pipeline instead
 *   of a second highlighter with its own themes.
 * - **`dangerouslySetInnerHTML`, twice.** This renders arbitrary source from
 *   arbitrary third-party repositories. The prose pipeline is sanitize-first
 *   and HAST → React for exactly that reason; a source file cannot be held to
 *   a lower standard than a paragraph. We render Shiki's HAST through
 *   `hast-util-to-jsx-runtime`, so React's escaping is the last line of
 *   defence here too.
 * - **Two rendered copies of the file** (`dark:hidden` next to
 *   `hidden dark:block`). The original calls `codeToHtml` twice — once per
 *   theme — and paints both. That doubles the highlighting work, the DOM and
 *   the payload, breaks find-in-page (a browser finds the hidden copy too) and
 *   still cannot answer to both a `.dark` class and `prefers-color-scheme`.
 *   `defaultColor: false` emits `--shiki-light` and `--shiki-dark` on one tree
 *   and `code.css` resolves all four combinations.
 * - **`language: BundledLanguage`.** A compile-time type is no protection when
 *   the language comes from a file extension in a stranger's repository:
 *   `codeToHtml` *throws* on an id it cannot resolve, which would take the
 *   whole page down for one `.xsd`. `resolveLanguage` below loads on demand
 *   and degrades to plain text.
 * - **`one-light` / `one-dark-pro`.** We measured every candidate against all
 *   six paper modes; those two were not among the pair that clears AA. See the
 *   table in `lib/markdown/highlighter.ts` — worst scope 4.55:1 with ours.
 * - **`lucide-react`.** The house icon set is HugeIcons. The dependency the
 *   registry added was removed again in the same session.
 * - **Tailwind utilities baked into the transformer's class list**
 *   (`min-w-10 mr-4 text-muted-foreground`). A gutter fixed at `2.5rem` stops
 *   aligning the moment the reader moves the type-size slider, and a
 *   `text-muted-foreground` gutter is chrome-token grey painted on reader
 *   paper. Ours is sized in `ch` off the file's own digit count and coloured
 *   with `--ink-muted`, which `verify:contrast` audits against every paper.
 * - **`overflow-auto` with no keyboard affordance.** A scrollable region has
 *   to be focusable (WCAG 2.1.1) and has to have a name. That, the no-wrap
 *   rule, the fade mask and the ligature kill were already right in
 *   `reader/code-block.tsx` and are carried over wholesale.
 *
 * ## What a whole file needs that a fence does not
 *
 * A fence inside prose is a quotation: a few lines, no filename, no ordinal.
 * A file is a document. It gets a header naming it, a language and byte size,
 * a gutter of line numbers, an `#L42` anchor per line, an opt-in wrap for the
 * long lines that a nowrap default would otherwise bury, and a clip with an
 * explicit "show all N lines" when it is long enough that an un-clipped render
 * would swallow the rest of the page. Fenced blocks keep the lean treatment.
 */

import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { toJsxRuntime, type Options } from "hast-util-to-jsx-runtime";
import type { Element, ElementContent, Root, RootContent } from "hast";
import type { ShikiTransformer } from "shiki";

import {
  getHighlighter,
  isKnownLanguage,
  SHIKI_THEMES,
  SPECIAL_LANGS,
} from "@/lib/markdown/highlighter";
import { formatBytes } from "@/lib/resources";
import { cn } from "@/lib/utils";

import { CodeFileFrame } from "./code-block-frame";

/**
 * Files longer than this are clipped, with the rest one button away.
 *
 * A 2,000-line schema rendered whole is not generous, it is a wall: the
 * reader loses the appendix, the rail's scroll map becomes useless and the
 * page costs several screens of scrolling to get past. 300 lines is roughly
 * four laptop screens of code at the default type size — long enough that no
 * ordinary script is ever clipped (the corpus median script is 96 lines), and
 * short enough that the outliers do not take the page with them.
 */
export const CLIP_THRESHOLD_LINES = 300;

/** Lines left visible when a file is clipped. */
export const CLIP_VISIBLE_LINES = 120;

/* --------------------------------------------------------------- Shiki */

export interface LineDecorationOptions {
  /** Render the gutter of ordinals. */
  showLineNumbers: boolean;
  /** Give each line an `id`, so `#L42` resolves. */
  lineAnchors: boolean;
  /** Prefix for those ids. `L` matches GitHub's, so pasted links carry over. */
  anchorPrefix: string;
}

/**
 * Decorate every line with its ordinal and, optionally, its anchor id.
 *
 * The number is a `span` inside the line box rather than a parallel gutter
 * column, which is what makes it align at *every* reader font size for free:
 * it is set in the same face at the same leading as the code beside it, so
 * there is no second measurement to keep in sync. `code.css` pins it with
 * `position: sticky` so it survives horizontal scrolling.
 *
 * It is `aria-hidden` and `user-select: none`. A screen reader reading a
 * script does not want "forty-two" spoken before every line, and a mouse
 * selection dragged down the file must not put ordinals on the clipboard.
 *
 * The number is deliberately **not** a link. Making 500 ordinals into 500
 * anchors adds 500 tab stops to a page whose content is already fully
 * reachable, and a mouse-only permalink would fail 2.1.1 anyway. The line
 * carries an `id`, so `…/extract.py#L42` scrolls to and highlights line 42;
 * the ordinal is a verse number, a target rather than a control.
 */
export function lineDecorations(options: LineDecorationOptions): ShikiTransformer {
  const { showLineNumbers, lineAnchors, anchorPrefix } = options;

  return {
    name: "githubskills:line-decorations",
    line(node, line) {
      if (lineAnchors) node.properties.id = `${anchorPrefix}${line}`;
      node.properties["data-line"] = String(line);
      if (!showLineNumbers) return;
      node.children.unshift({
        type: "element",
        tagName: "span",
        properties: { className: ["code-line__no"], "aria-hidden": "true" },
        children: [{ type: "text", value: String(line) }],
      });
    },
  };
}

/**
 * Resolve a Shiki language id, loading the grammar if the singleton has not
 * seen it yet.
 *
 * The singleton preloads the twelve grammars that cover 96% of *fences*. Whole
 * files skew differently — `xml`, `xsd`, `toml`, `dotenv`, `ruby` all appear
 * in the corpus and none are preloaded — so this loads on demand and falls
 * back to plain text rather than throwing a page away for a missing grammar.
 */
async function resolveLanguage(language: string): Promise<string> {
  const id = language.trim().toLowerCase();
  if (!id || SPECIAL_LANGS.has(id)) return "text";
  if (!isKnownLanguage(id)) return "text";

  const highlighter = await getHighlighter();
  if (highlighter.getLoadedLanguages().includes(id)) return id;
  try {
    await highlighter.loadLanguage(id as Parameters<typeof highlighter.loadLanguage>[0]);
    return id;
  } catch {
    return "text";
  }
}

export interface HighlightedCode {
  /** Shiki's `code` subtree, already React. */
  node: React.ReactNode;
  /** Shiki's class list from the `pre`; `.shiki` is what `code.css` hangs off. */
  preClassName: string;
  /** The language actually used, after fallback. */
  language: string;
  lines: number;
}

const JSX_OPTIONS: Options = {
  Fragment,
  jsx,
  jsxs,
  // Shiki writes `--shiki-light` / `--shiki-dark` into inline styles; a
  // malformed one must degrade rather than throw the file away.
  ignoreInvalidStyle: true,
};

/**
 * First child element with this tag name.
 *
 * Written as a loop rather than `children.find(predicate)` because
 * `Root["children"]` and `Element["children"]` are different unions, and
 * TypeScript will not apply a type predicate through a call on a union of
 * array types — it widens the result back to the raw node union (which, with
 * `mdast-util-mdx-jsx` in the tree, includes MDX nodes that are not `Element`).
 */
function findElement(parent: Root | Element, tagName: string): Element | undefined {
  const children: Array<RootContent | ElementContent> = parent.children;
  for (const child of children) {
    if (child.type === "element" && child.tagName === tagName) return child;
  }
  return undefined;
}

/**
 * Normalise a file for display.
 *
 * CRLF is stripped because a stray `\r` renders as a zero-width gap at the end
 * of every line, and a single trailing newline is dropped because a file that
 * ends the way POSIX asks would otherwise show a phantom final line whose
 * ordinal is one past `wc -l`. **The clipboard gets the original bytes** — the
 * copy source is the untouched `code` prop, not this.
 */
function forDisplay(code: string): string {
  return code.replace(/^﻿/, "").replace(/\r\n?/g, "\n").replace(/\n$/, "");
}

export interface HighlightOptions {
  showLineNumbers?: boolean;
  lineAnchors?: boolean;
  anchorPrefix?: string;
}

/**
 * Highlight source to React on the server.
 *
 * Exported so a caller that needs the tokens without the chrome — a diff view,
 * an OG image, a future inline preview — does not have to reach for Shiki
 * itself and pick its own themes.
 */
export async function highlightCode(
  code: string,
  language: string,
  options: HighlightOptions = {},
): Promise<HighlightedCode> {
  const { showLineNumbers = false, lineAnchors = false, anchorPrefix = "L" } = options;
  const text = forDisplay(code);
  const resolved = await resolveLanguage(language);
  const highlighter = await getHighlighter();

  const root = highlighter.codeToHast(text, {
    lang: resolved,
    themes: SHIKI_THEMES,
    // Both themes as custom properties on one tree — never a baked colour, and
    // never two copies of the file. See `code.css` for the four-rule cascade.
    defaultColor: false,
    cssVariablePrefix: "--shiki-",
    transformers: [lineDecorations({ showLineNumbers, lineAnchors, anchorPrefix })],
  });

  const pre = findElement(root, "pre");
  const codeEl = pre ? findElement(pre, "code") : undefined;
  const preClassName = [pre?.properties?.class, pre?.properties?.className]
    .flat()
    .filter(Boolean)
    .join(" ");

  return {
    node: codeEl ? toJsxRuntime(codeEl, JSX_OPTIONS) : text,
    preClassName,
    language: resolved,
    lines: text === "" ? 0 : text.split("\n").length,
  };
}

/* ----------------------------------------------------------- component */

export interface CodeBlockProps {
  /** The file, exactly as fetched. This is also what Copy puts on the clipboard. */
  code: string;
  /** Shiki language id — `classifyResource().language` gives you one. */
  language: string;
  /** Human label for the type, e.g. "Python". Defaults to the language id. */
  label?: string;
  /** Path relative to the skill, e.g. `references/FORMS.md`. Names the block. */
  path: string;
  /** Byte size on disk, when known. Rendered in the header. */
  size?: number;
  /** Canonical upstream URL, rendered as a quiet "on GitHub" link. */
  sourceUrl?: string;
  /** Gutter of ordinals. On for whole files, off for quotations. */
  showLineNumbers?: boolean;
  /** Give each line an `#L42` id. Only ever safe once per page. */
  lineAnchors?: boolean;
  anchorPrefix?: string;
  /** Clip long files behind a "show all" button. */
  clip?: boolean;
  /** Anything to say beneath the block — a truncation notice, a provenance line. */
  notice?: React.ReactNode;
  className?: string;
}

/**
 * A whole file, with the chrome a whole file needs.
 *
 * Async server component: the highlighting, the grammar load and the line
 * decoration all happen before a byte reaches the client, and the only
 * JavaScript this ships is the frame — copy, wrap, expand.
 */
export async function CodeBlock({
  code,
  language,
  label,
  path,
  size,
  sourceUrl,
  showLineNumbers = true,
  lineAnchors = true,
  anchorPrefix = "L",
  clip = true,
  notice,
  className,
}: CodeBlockProps) {
  const highlighted = await highlightCode(code, language, {
    showLineNumbers,
    lineAnchors,
    anchorPrefix,
  });

  const slash = path.lastIndexOf("/");
  const dir = slash === -1 ? "" : path.slice(0, slash + 1);
  const name = slash === -1 ? path : path.slice(slash + 1);
  const clipped = clip && highlighted.lines > CLIP_THRESHOLD_LINES;

  return (
    <CodeFileFrame
      source={code}
      dir={dir}
      name={name}
      label={label ?? highlighted.language}
      language={highlighted.language}
      lines={highlighted.lines}
      sizeLabel={typeof size === "number" && size > 0 ? formatBytes(size) : undefined}
      sourceUrl={sourceUrl}
      showLineNumbers={showLineNumbers}
      // The gutter is sized off the widest ordinal, in `ch`. `ch` is the wrong
      // unit for prose measure — the ratio swings 0.84–1.47 across our text
      // faces — but here the face is monospaced by construction and the digits
      // are tabular, so `1ch` *is* the advance width of a digit, exactly.
      digits={String(Math.max(highlighted.lines, 1)).length}
      clipped={clipped}
      clipLines={CLIP_VISIBLE_LINES}
      preClassName={cn("code-block__pre", highlighted.preClassName)}
      notice={notice}
      className={className}
    >
      {highlighted.node}
    </CodeFileFrame>
  );
}

export { CodeBlockCopyButton } from "./code-block-frame";
