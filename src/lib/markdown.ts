/**
 * Markdown → HAST pipeline for third-party skill documents.
 *
 * Everything here runs on the server. The content is untrusted (arbitrary
 * markdown from arbitrary GitHub repos), so raw HTML is never passed through
 * and the tree is scrubbed before any decoration is added.
 *
 * Rendering to React happens in `components/reader/markdown.tsx`, which
 * consumes the HAST this module produces. Nothing in this pipeline produces an
 * HTML string, and nothing downstream uses `dangerouslySetInnerHTML`.
 *
 * ## Plugin order is load-bearing
 *
 *   remark-parse → remark-gfm → smartypants
 *     → remark-rehype (allowDangerousHtml: FALSE — raw HTML is dropped)
 *     → rehype-sanitize          ← untrusted content is scrubbed HERE
 *     → fix-clobbered-anchors    ← sanitize prefixed ids; re-point the hrefs
 *     → heading-normalize        ← strip duplicate H1, shift, repair skips
 *     → rehype-slug              ← AFTER sanitize, or every anchor id gets the
 *                                  `user-content-` clobber prefix and the TOC
 *                                  breaks
 *     → resolve-links
 *     → bound-code-languages
 *     → shiki                    ← AFTER sanitize; its markup is OURS
 *     → code-meta
 *     → nbsp                     ← LAST, or U+00A0 lands in the heading slugs
 *
 * Two rules that must survive every future edit, each with a unit test:
 *
 *   - **Never enable `rehype-raw`, never pass `allowDangerousHtml`.** Buy
 *     fidelity back by allow-listing tags in the sanitize schema, never by
 *     re-enabling raw HTML.
 *   - **Sanitize before Shiki and before slug.** Sanitising after Shiki strips
 *     every token colour; slugging before sanitize gets every id rewritten.
 */

import rehypeShikiFromHighlighter from "@shikijs/rehype/core";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import type { Root } from "hast";
import type { Root as MdastRoot } from "mdast";

import { codeRatioOf, rehypeBoundCodeLanguages, rehypeCodeMeta } from "./markdown/code";
import { collectHeadings, rehypeHeadingNormalize, type HeadingRepair } from "./markdown/headings";
import { getHighlighter, SHIKI_THEMES } from "./markdown/highlighter";
import { rehypeFixClobberedAnchors, rehypeResolveLinks } from "./markdown/links";
import { sanitizeSchema } from "./markdown/sanitize";
import { rehypeNbsp, remarkSmartypants } from "./markdown/typography";

export type { HeadingRepair } from "./markdown/headings";
export { PRELOADED_LANGS, SHIKI_THEMES } from "./markdown/highlighter";

export interface MarkdownContext {
  owner: string;
  repo: string;
  ref: string;
  /** Directory the document lives in, for resolving relative links. */
  baseDir: string;
  /** Maps an in-repo path to an internal route, when we publish that page. */
  resolveInternal?: (repoPath: string) => string | null;
  /** The chapter title, so a duplicate leading H1 can be stripped. */
  title?: string;
}

export interface RenderedMarkdown {
  tree: Root;
  headings: Array<{ depth: number; text: string; id: string }>;
  /** Heading repairs taken, surfaced in the colophon accessibility report. */
  repairs: HeadingRepair[];
  /** Fenced-code chars ÷ total chars. Gates spread mode and the drop cap. */
  codeRatio: number;
}

/**
 * A leading YAML/TOML frontmatter block.
 *
 * CommonMark has no concept of frontmatter, so `---\nname: x\n---` parses as a
 * thematic break followed by a *setext H2* whose text is the entire metadata
 * block. On `anthropics/skills/skill-creator` that produced a 330-character
 * heading, an unusable anchor id, and a bogus first TOC entry.
 *
 * Skill bodies arrive already stripped by gray-matter in `skills.ts`, but
 * READMEs and linked `.md` files do not go through that path and this renders
 * arbitrary third-party documents. Stripping here is idempotent and matches
 * what GitHub itself does with frontmatter.
 */
const FRONTMATTER = /^﻿?(?:---|\+\+\+)[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\+\+\+)[ \t]*(?:\r?\n|$)/;

export function stripFrontmatter(source: string): string {
  return FRONTMATTER.test(source) ? source.replace(FRONTMATTER, "") : source;
}

/**
 * The document body is already capped at 512 KB by `fetchRawText`, which is
 * the only path a `SKILL.md` reaches this function by. No second cap here —
 * a silent truncation at this layer would be invisible to the reader.
 */
export async function renderMarkdown(
  input: string,
  ctx: MarkdownContext,
): Promise<RenderedMarkdown> {
  const source = stripFrontmatter(input);
  const highlighter = await getHighlighter();
  const repairs: HeadingRepair[] = [];

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkSmartypants)
    // allowDangerousHtml is off: raw HTML in skill docs is dropped, not run.
    // clobberPrefix is emptied because sanitize is about to apply its own; two
    // layers of it produce `user-content-user-content-fn-1`.
    .use(remarkRehype, { clobberPrefix: "" })
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeFixClobberedAnchors, sanitizeSchema.clobberPrefix ?? undefined)
    .use(rehypeHeadingNormalize, { title: ctx.title, sink: repairs })
    .use(rehypeSlug)
    .use(rehypeResolveLinks, ctx)
    .use(rehypeBoundCodeLanguages)
    .use(rehypeShikiFromHighlighter, highlighter, {
      themes: SHIKI_THEMES,
      defaultColor: false,
      cssVariablePrefix: "--shiki-",
      // 59% of fences in the measured corpus carry no info string at all.
      // Without a default they would skip Shiki entirely and render without
      // the `.shiki` class every code rule in `code.css` hangs off.
      defaultLanguage: "text",
      fallbackLanguage: "text",
      // Shiki rebuilds the `code` element, so the language hint has to be
      // re-attached for `rehypeCodeMeta` and the language label to find it.
      addLanguageClass: true,
      // Grammars outside the preloaded twelve load on first sight; the set is
      // bounded by rehypeBoundCodeLanguages.
      lazy: true,
    })
    .use(rehypeCodeMeta)
    .use(rehypeNbsp);

  const mdast = processor.parse(source) as MdastRoot;
  const codeRatio = codeRatioOf(mdast, source.length);
  const tree = (await processor.run(mdast)) as Root;

  return { tree, headings: collectHeadings(tree), repairs, codeRatio };
}
