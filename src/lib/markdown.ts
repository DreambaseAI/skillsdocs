/**
 * Markdown → HAST pipeline for third-party skill documents.
 *
 * Everything here runs on the server. The content is untrusted (arbitrary
 * markdown from arbitrary GitHub repos), so raw HTML is never passed through
 * and the tree is sanitized before any decoration is added.
 *
 * Rendering to React happens in `components/reader/markdown.tsx`, which
 * consumes the HAST this module produces.
 */

import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeShiki from "@shikijs/rehype";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { toString as hastToString } from "hast-util-to-string";
import type { Element, Root } from "hast";

export interface MarkdownContext {
  owner: string;
  repo: string;
  ref: string;
  /** Directory the document lives in, for resolving relative links. */
  baseDir: string;
  /** Maps an in-repo path to an internal route, when we publish that page. */
  resolveInternal?: (repoPath: string) => string | null;
}

export interface RenderedMarkdown {
  tree: Root;
  headings: Array<{ depth: number; text: string; id: string }>;
}

/**
 * Sanitization schema: the GitHub-flavored default, widened only for the
 * attributes our own plugins add (Shiki tokens, heading ids, task lists).
 */
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "className", "id", "style"],
    code: [...(defaultSchema.attributes?.code ?? []), "className"],
    pre: [...(defaultSchema.attributes?.pre ?? []), "className", "style", "tabIndex"],
    span: [...(defaultSchema.attributes?.span ?? []), "className", "style"],
    input: [...(defaultSchema.attributes?.input ?? []), "checked", "disabled", "type"],
    img: [...(defaultSchema.attributes?.img ?? []), "loading", "decoding", "width", "height"],
    a: [...(defaultSchema.attributes?.a ?? []), "target", "rel"],
  },
  // Shiki emits inline `style` on spans; allow it but keep the tag list closed.
  clobberPrefix: "md-",
} satisfies typeof defaultSchema;

/* ---------------------------------------------------------- link resolving */

const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

function joinPath(baseDir: string, rel: string): string {
  const stack = baseDir ? baseDir.split("/") : [];
  for (const seg of rel.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") stack.pop();
    else stack.push(seg);
  }
  return stack.join("/");
}

function rawUrlFor(ctx: MarkdownContext, repoPath: string): string {
  const encoded = repoPath.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${ctx.owner}/${ctx.repo}/${ctx.ref}/${encoded}`;
}

function blobUrlFor(ctx: MarkdownContext, repoPath: string): string {
  const encoded = repoPath.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${ctx.owner}/${ctx.repo}/blob/${ctx.ref}/${encoded}`;
}

/**
 * Rewrite relative links and images so they resolve against the source repo
 * rather than against our own origin, and mark external links for the
 * renderer (which adds rel/target and an affordance).
 */
function rehypeResolveLinks(ctx: MarkdownContext) {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName === "img") {
        const src = node.properties?.src;
        if (typeof src !== "string" || ABSOLUTE.test(src)) return;
        node.properties!.src = rawUrlFor(ctx, joinPath(ctx.baseDir, src));
        node.properties!.loading = "lazy";
        node.properties!.decoding = "async";
        return;
      }

      if (node.tagName !== "a") return;
      const href = node.properties?.href;
      if (typeof href !== "string" || href === "") return;

      if (href.startsWith("#")) return; // in-page anchor

      if (ABSOLUTE.test(href)) {
        node.properties!.dataExternal = "true";
        return;
      }

      // Relative: prefer an internal route when we publish that document.
      const [pathPart, hash] = href.split("#");
      const repoPath = joinPath(ctx.baseDir, pathPart);
      const internal = ctx.resolveInternal?.(repoPath);
      if (internal) {
        node.properties!.href = hash ? `${internal}#${hash}` : internal;
        node.properties!.dataInternal = "true";
      } else {
        node.properties!.href = blobUrlFor(ctx, repoPath);
        node.properties!.dataExternal = "true";
        node.properties!.dataRepoFile = repoPath;
      }
    });
  };
}

/** Record the language and raw source of each code block for the copy button. */
function rehypeCodeMeta() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "pre") return;
      const code = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "code",
      );
      if (!code) return;

      const classes = code.properties?.className;
      const list = Array.isArray(classes) ? classes.map(String) : [];
      const lang = list.find((c) => c.startsWith("language-"))?.slice(9);

      node.properties = {
        ...node.properties,
        dataLang: lang ?? "text",
        dataSource: hastToString(code),
      };
      void index;
      void parent;
    });
  };
}

/** Collect headings from the final tree so ids match the rendered anchors. */
function collectHeadings(tree: Root) {
  const headings: RenderedMarkdown["headings"] = [];
  visit(tree, "element", (node: Element) => {
    const m = /^h([1-6])$/.exec(node.tagName);
    if (!m) return;
    const id = typeof node.properties?.id === "string" ? node.properties.id : "";
    const text = hastToString(node).trim();
    if (!text) return;
    headings.push({ depth: Number(m[1]), text, id });
  });
  return headings;
}

/* -------------------------------------------------------------- the runner */

function buildProcessor(ctx: MarkdownContext) {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    // allowDangerousHtml is off: raw HTML in skill docs is dropped, not run.
    .use(remarkRehype)
    .use(rehypeSanitize, schema)
    .use(rehypeSlug)
    .use(rehypeResolveLinks, ctx)
    .use(rehypeShiki, {
      themes: { light: "github-light", dark: "github-dark-dimmed" },
      defaultColor: false,
      cssVariablePrefix: "--shiki-",
      fallbackLanguage: "text",
    })
    .use(rehypeCodeMeta);
}

export async function renderMarkdown(
  source: string,
  ctx: MarkdownContext,
): Promise<RenderedMarkdown> {
  const processor = buildProcessor(ctx);
  const tree = (await processor.run(processor.parse(source))) as Root;
  return { tree, headings: collectHeadings(tree) };
}
