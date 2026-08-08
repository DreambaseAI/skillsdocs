import Image from "next/image";
import Link from "next/link";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { toJsxRuntime, type Components, type Options } from "hast-util-to-jsx-runtime";
import { toString as hastToString } from "hast-util-to-string";
import { visit } from "unist-util-visit";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpRight01Icon, Link01Icon } from "@hugeicons/core-free-icons";
import type { Element, ElementContent, Root } from "hast";

import { CodeBlock } from "@/components/reader/code-block";
import { MarginNote, MarginNoteRef } from "@/components/reader/margin-note";
import type { RenderedMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";

/**
 * HAST → React for rendered skill documents.
 *
 * **There is no `dangerouslySetInnerHTML` anywhere in this tree, and there
 * must never be one.** The content is arbitrary markdown from arbitrary GitHub
 * repositories. `hast-util-to-jsx-runtime` builds real React elements from the
 * sanitised tree, which means React's own escaping is the last line of defence
 * and every element passes through a renderer we control.
 *
 * The renderers below exist because the default HTML element is wrong for the
 * reading surface in some specific way — a scroll region that keyboard users
 * cannot reach, an external link with no affordance, a footnote that costs a
 * round trip to the bottom of the page.
 */

/** Hosts `next/image` is configured for. Mirrors `remotePatterns` in `next.config.ts`. */
const OPTIMISED_HOSTS = new Set([
  "avatars.githubusercontent.com",
  "github.com",
  "raw.githubusercontent.com",
  "user-images.githubusercontent.com",
  "camo.githubusercontent.com",
]);

/** A blockquote shorter than this, with a single paragraph, reads as a pull quote. */
const PULL_QUOTE_MAX_CHARS = 180;

/* ------------------------------------------------------------- footnotes */

interface Footnote {
  /** Phrasing-only body, safe to inline inside a paragraph. */
  inline: ElementContent[];
  marker: string;
}

/**
 * Pair each footnote reference with a body that can legally live inside a
 * paragraph.
 *
 * Promotion is all-or-nothing per document. A footnote whose body is more than
 * one paragraph cannot be flattened into phrasing content without producing
 * invalid HTML, and mixing promoted and un-promoted notes in one document
 * would give the reader two different mechanisms for the same thing.
 */
function collectFootnotes(tree: Root): {
  notes: Map<string, Footnote>;
  promote: boolean;
} {
  const notes = new Map<string, Footnote>();
  let section: Element | undefined;

  visit(tree, "element", (node: Element) => {
    if (node.tagName === "section" && node.properties?.dataFootnotes !== undefined) {
      section = node;
    }
  });
  if (!section) return { notes, promote: false };

  const items: Element[] = [];
  visit(section, "element", (node: Element) => {
    if (node.tagName === "li") items.push(node);
  });
  if (items.length === 0) return { notes, promote: false };

  let promote = true;
  items.forEach((item, index) => {
    const id = typeof item.properties?.id === "string" ? item.properties.id : "";
    const blocks = item.children.filter(
      (child) => !(child.type === "text" && child.value.trim() === ""),
    );
    const only = blocks.length === 1 ? blocks[0] : undefined;
    if (!id || !only || only.type !== "element" || only.tagName !== "p") {
      promote = false;
      return;
    }
    notes.set(id, {
      marker: String(index + 1),
      inline: only.children.filter((child) => !isBackref(child)),
    });
  });

  return { notes, promote };
}

function isBackref(node: ElementContent): boolean {
  return (
    node.type === "element" &&
    node.tagName === "a" &&
    node.properties?.dataFootnoteBackref !== undefined
  );
}

/** The footnote reference inside a `sup`, if that is all the `sup` holds. */
function footnoteRefIn(node: Element): Element | undefined {
  for (const child of node.children) {
    if (child.type === "text" && child.value.trim() === "") continue;
    if (
      child.type === "element" &&
      child.tagName === "a" &&
      child.properties?.dataFootnoteRef !== undefined
    ) {
      return child;
    }
    return undefined;
  }
  return undefined;
}

/* ------------------------------------------------------------- component */

export interface MarkdownProps {
  rendered: RenderedMarkdown;
  /**
   * Sink the first letter of the opening paragraph. Ignored for code-heavy
   * documents, where the first block is usually a fence and a drop cap on the
   * one stray sentence above it looks like a mistake.
   */
  dropCap?: boolean;
  className?: string;
}

export function Markdown({ rendered, dropCap = false, className }: MarkdownProps) {
  const { tree, codeRatio } = rendered;
  const { notes, promote } = collectFootnotes(tree);

  // Indices are assigned during a walk rather than counted inside a component
  // body: React owns when components run, so a render-time counter would be
  // both impure and wrong under streaming.
  const tableIndex = new Map<Element, number>();
  let tables = 0;
  visit(tree, "element", (node: Element) => {
    if (node.tagName === "table") tableIndex.set(node, ++tables);
  });

  // Guards against a footnote that references itself, directly or in a cycle.
  const rendering = new Set<string>();
  const state: { options?: Options } = {};
  const renderInline = (nodes: ElementContent[]) =>
    toJsxRuntime({ type: "root", children: nodes }, state.options!);

  const components: Partial<Components> = {
    h1: heading(1),
    h2: heading(2),
    h3: heading(3),
    h4: heading(4),
    h5: heading(5),
    h6: heading(6),

    a({ node, children, href, ...rest }) {
      delete (rest as { key?: unknown }).key;
      if (typeof href !== "string" || href === "") {
        return <span {...rest}>{children}</span>;
      }
      if (node?.properties?.dataExternal !== undefined) {
        return (
          <a
            {...rest}
            href={href}
            className="prose-link prose-link--external"
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
            <HugeiconsIcon
              icon={ArrowUpRight01Icon}
              className="prose-link__mark"
              aria-hidden="true"
            />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        );
      }
      if (node?.properties?.dataInternal !== undefined) {
        return (
          <Link {...rest} href={href} className="prose-link">
            {children}
          </Link>
        );
      }
      return (
        <a {...rest} href={href} className="prose-link">
          {children}
        </a>
      );
    },

    img({ src, alt, width, height }) {
      if (typeof src !== "string" || src === "") return null;
      // We never invent alt text. A missing one is recorded for the colophon's
      // accessibility report and treated as decorative in the meantime.
      const described = typeof alt === "string" && alt.trim() !== "";
      const host = hostOf(src);
      const w = numeric(width);
      const h = numeric(height);

      if (host && OPTIMISED_HOSTS.has(host) && w && h) {
        return (
          <span className="prose-figure">
            <Image
              src={src}
              alt={described ? alt : ""}
              width={w}
              height={h}
              className="prose-image"
              data-missing-alt={described ? undefined : "true"}
            />
          </span>
        );
      }

      // No intrinsic size is knowable for a remote image at render time, so the
      // wrapper reserves a floor: the block can only ever grow past it, which
      // bounds the shift instead of letting the page jump by the full height.
      return (
        <span className="prose-figure prose-figure--unsized">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={described ? alt : ""}
            width={w}
            height={h}
            loading="lazy"
            decoding="async"
            className="prose-image"
            data-missing-alt={described ? undefined : "true"}
          />
        </span>
      );
    },

    pre({ node, children, className: shiki }) {
      const lang = String(node?.properties?.dataLang ?? "text");
      const source = String(node?.properties?.dataSource ?? "");
      return (
        <CodeBlock lang={lang} source={source} shikiClassName={shiki}>
          {children}
        </CodeBlock>
      );
    },

    table({ node, children, className, ...rest }) {
      delete (rest as { key?: unknown }).key;
      const index = node ? tableIndex.get(node) : undefined;
      const label = tables > 1 && index ? `Table ${index} of ${tables}` : "Table";
      return (
        <div className="prose-table-scroll" role="region" tabIndex={0} aria-label={label}>
          <table {...rest} className={cn("prose-table", className)}>
            {children}
          </table>
        </div>
      );
    },

    blockquote({ node, children, className, ...rest }) {
      delete (rest as { key?: unknown }).key;
      const text = node ? hastToString(node).trim() : "";
      const paragraphs = node
        ? node.children.filter(
            (child: ElementContent) => child.type === "element" && child.tagName === "p",
          ).length
        : 0;
      const pull = paragraphs === 1 && text.length > 0 && text.length <= PULL_QUOTE_MAX_CHARS;
      return (
        <blockquote
          {...rest}
          className={cn("prose-quote", className)}
          data-pull={pull ? "true" : undefined}
        >
          {children}
        </blockquote>
      );
    },

    input({ type, checked }) {
      if (type !== "checkbox") return null;
      // A disabled checkbox is an unlabelled control in the a11y tree and a
      // tab stop that does nothing. Render the state as text instead.
      return (
        <>
          <span className="prose-task" data-checked={checked ? "true" : "false"} aria-hidden="true" />
          <span className="sr-only">{checked ? "Done: " : "Not done: "}</span>
        </>
      );
    },

    section({ node, children, ...rest }) {
      delete (rest as { key?: unknown }).key;
      // Footnote bodies already live in the margin; the basement copy would be
      // a second, duplicate reading of the same text.
      if (promote && node?.properties?.dataFootnotes !== undefined) return null;
      return <section {...rest}>{children}</section>;
    },

    sup({ node, children, ...rest }) {
      delete (rest as { key?: unknown }).key;
      const ref = node ? footnoteRefIn(node) : undefined;
      const href = typeof ref?.properties?.href === "string" ? ref.properties.href : "";
      const id = href.startsWith("#") ? href.slice(1) : "";
      const note = promote ? notes.get(id) : undefined;

      if (!ref || !note || rendering.has(id)) {
        return <sup {...rest}>{children}</sup>;
      }

      const refId =
        typeof ref.properties?.id === "string" ? ref.properties.id : `ref-${id}`;
      rendering.add(id);
      const body = renderInline(note.inline);
      rendering.delete(id);

      return (
        <>
          <MarginNoteRef id={refId} noteId={id} marker={note.marker} />
          <MarginNote id={id} marker={note.marker} backref={refId}>
            {body}
          </MarginNote>
        </>
      );
    },
  };

  state.options = {
    Fragment,
    jsx,
    jsxs,
    components,
    passNode: true,
    // A malformed style string must degrade, never throw a whole page away.
    ignoreInvalidStyle: true,
  };

  return (
    <div
      className={cn("prose", className)}
      data-dropcap={dropCap && codeRatio <= 0.25 ? "true" : undefined}
    >
      {toJsxRuntime(tree, state.options)}
    </div>
  );
}

/* ------------------------------------------------------------- renderers */

/**
 * The whole heading is the permalink.
 *
 * The usual pattern — an icon-only anchor appended after the text — either
 * duplicates the heading text in the accessibility tree or is hidden from it
 * entirely, and hiding it makes the affordance keyboard-unreachable. Wrapping
 * the text keeps one accessible name, one tab stop, and a target big enough to
 * hit (2.5.8).
 */
function heading(depth: 1 | 2 | 3 | 4 | 5 | 6) {
  const Tag = `h${depth}` as const;

  return function Heading({ children, id, className, ...rest }: Record<string, unknown>) {
    const props = { ...rest } as Record<string, unknown>;
    delete props.node;
    delete props.key;
    // GFM gives the footnotes label `sr-only`; replacing the class instead of
    // merging it would surface a heading the author never wrote.
    const merged = cn("prose-heading", className as string | undefined);

    if (typeof id !== "string" || id === "") {
      return (
        <Tag {...props} className={merged}>
          {children as React.ReactNode}
        </Tag>
      );
    }

    return (
      <Tag {...props} id={id} className={merged}>
        <a href={`#${id}`} className="heading-anchor">
          <span className="heading-anchor__text">{children as React.ReactNode}</span>
          <HugeiconsIcon
            icon={Link01Icon}
            className="heading-anchor__mark"
            aria-hidden="true"
          />
        </a>
      </Tag>
    );
  };
}

function hostOf(src: string): string | null {
  try {
    return new URL(src).hostname;
  } catch {
    return null;
  }
}

function numeric(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
