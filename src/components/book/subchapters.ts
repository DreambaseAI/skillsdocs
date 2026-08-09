/**
 * Subchapters — the numbering and clustering that turn a skill's bundled files
 * into part of the book.
 *
 * `src/lib/resources.ts` decides *how* a file renders. This decides *where it
 * sits*: chapter 4's three references are 4.1, 4.2 and 4.3, and that numbering
 * is the whole argument. A link to GitHub says "this is somewhere else"; a
 * folio says "this is here, and it has a position".
 *
 * Everything in this file is pure so the appendix, the contents rail, the
 * mobile sheet and the subchapter route all number the same file the same way.
 * If two surfaces disagreed about what 4.7 is, the numbering would be worse
 * than no numbering at all.
 */

import { dekOf, stripInlineMarkup } from "@/lib/deck";
import {
  classifyResource,
  formatBytes,
  groupResources,
  resourcePath,
  resourceTitle,
  type ClassifiedResource,
  type ResourceGroup,
  type ResourceRender,
} from "@/lib/resources";
import type { SkillResource } from "@/lib/skills";

export interface Subchapter extends ClassifiedResource {
  /**
   * "4.3", or `null` for a file we decline to render.
   *
   * A binary is bundled with the chapter but is not *in* the book, and giving
   * it a folio would promise a page that does not exist. The appendix prints a
   * dash in its place and sends the reader upstream, which is the honest
   * statement of what happened.
   */
  number: string | null;
  title: string;
  /** Internal subchapter route, or `null` when the file is not renderable. */
  href: string | null;
  /** e.g. "Markdown · 12 KB". */
  meta: string;
}

export interface SubchapterGroup {
  kind: ResourceGroup["kind"];
  title: string;
  note: string;
  files: Subchapter[];
  /** Files that open here, in order. */
  readable: Subchapter[];
  /** Files we describe rather than reproduce. */
  binaries: Subchapter[];
  bytes: number;
}

/**
 * Above this many files a group stops being a list and becomes an index: the
 * entries lose their extract and pair up into two columns. Measured against
 * the corpus, ten two-line entries is about where a reader stops reading rows
 * and starts scanning names.
 */
export const EXPANDED_MAX = 10;

/**
 * Above this, and only when the files span more than one directory, a group is
 * clustered by directory. `anthropics/skills/docx` ships 15 Python scripts next
 * to 44 XML schemas in `scripts/office/schemas/ISO-IEC29500-4_2016/`; flat,
 * that is 59 rows in which the 15 useful ones are invisible.
 */
export const CLUSTER_MIN = 12;

/** A cluster this big collapses behind a summary rather than printing itself. */
export const CLUSTER_COLLAPSE_MIN = 7;

/** More binaries than this in one group are summarised, never enumerated. */
export const BINARY_LIST_MAX = 4;

/** Subchapters the contents rail will print before it defers to the appendix. */
export const RAIL_MAX = 14;

/**
 * The subchapter URL, from the one function that builds it.
 *
 * A second, identical implementation lived here for a while, and the two
 * agreed only by luck: the appendix and the rail linked through this one while
 * the route's own canonical URL and its prev/next came from `resourcePath`. A
 * change to either — percent-encoding policy, a trailing slash — would have
 * split the site's idea of a file's address in half without failing anything.
 */
export const subchapterHref = resourcePath;

export interface SubchapterContext {
  owner: string;
  repo: string;
  slug: string;
  /** Chapter position, 1-based. */
  chapter: number;
}

/**
 * Group a skill's resources and number the renderable ones within the chapter.
 *
 * Order comes straight from `groupResources()` — references, scripts, assets,
 * then everything else, renderable first inside each group — so the numbers
 * run in the order the appendix prints them.
 */
export function subchapterGroups(
  resources: SkillResource[],
  ctx: SubchapterContext,
): SubchapterGroup[] {
  let counter = 0;

  return groupResources(resources).map((group) => {
    const files = group.files.map((file) => decorate(file, ctx, () => ++counter));
    return {
      kind: group.kind,
      title: group.title,
      note: group.note,
      files,
      readable: files.filter((f) => f.render !== "binary"),
      binaries: files.filter((f) => f.render === "binary"),
      bytes: files.reduce((total, f) => total + f.size, 0),
    };
  });
}

function decorate(
  file: ClassifiedResource,
  ctx: SubchapterContext,
  next: () => number,
): Subchapter {
  const renderable = file.render !== "binary";
  return {
    ...file,
    number: renderable ? `${ctx.chapter}.${next()}` : null,
    title: resourceTitle(file.relPath),
    href: renderable
      ? subchapterHref(ctx.owner, ctx.repo, ctx.slug, file.relPath)
      : null,
    meta: `${file.label} · ${formatBytes(file.size)}`,
  };
}

/** Every numbered subchapter, flat, in book order. */
export function subchapterList(
  resources: SkillResource[],
  ctx: SubchapterContext,
): Subchapter[] {
  return subchapterGroups(resources, ctx).flatMap((group) => group.readable);
}

export function findSubchapter(
  list: Subchapter[],
  relPath: string,
): Subchapter | undefined {
  const wanted = decodeURIComponent(relPath).replace(/^\/+|\/+$/g, "");
  return list.find((file) => file.relPath === wanted);
}

/* -------------------------------------------------------------- clusters */

export interface SubchapterCluster {
  /** Directory the files share, "" for the skill's own root. */
  dir: string;
  files: Subchapter[];
  bytes: number;
  /** True when the cluster prints behind a disclosure rather than inline. */
  collapsed: boolean;
}

function parentDir(relPath: string): string {
  const i = relPath.lastIndexOf("/");
  return i === -1 ? "" : relPath.slice(0, i);
}

/**
 * Split a group's readable files into directory clusters, or return a single
 * unnamed cluster when clustering would not tell the reader anything.
 *
 * The "would not tell them anything" case is the common one:
 * `supabase-postgres-best-practices` puts all 34 of its references in
 * `references/`, and wrapping the whole group in a heading that repeats the
 * group's own name is furniture for its own sake.
 */
export function clusterFiles(files: Subchapter[]): SubchapterCluster[] {
  const dirs = new Map<string, Subchapter[]>();
  for (const file of files) {
    const dir = parentDir(file.relPath);
    const bucket = dirs.get(dir);
    if (bucket) bucket.push(file);
    else dirs.set(dir, [file]);
  }

  if (files.length < CLUSTER_MIN || dirs.size < 2) {
    return [{ dir: "", files, bytes: total(files), collapsed: false }];
  }

  return [...dirs].map(([dir, bucket]) => ({
    dir,
    files: bucket,
    bytes: total(bucket),
    collapsed: bucket.length >= CLUSTER_COLLAPSE_MIN,
  }));
}

function total(files: Subchapter[]): number {
  return files.reduce((sum, f) => sum + f.size, 0);
}

/** "54 TrueType fonts and 3 PNG images" — for the line that replaces them. */
export function describeBinaries(files: Subchapter[]): string {
  const counts = new Map<string, number>();
  for (const file of files) {
    counts.set(file.label, (counts.get(file.label) ?? 0) + 1);
  }
  const parts = [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([label, n]) => `${n} ${label}${n === 1 ? "" : "s"}`);

  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * Why a single file is not reproduced — in words, not in a shrug.
 *
 * "Not shown here — 187 KB TrueType font" is a fact a reader can act on;
 * a bare "view on GitHub" is not. There are exactly two reasons a file lands
 * here, and they deserve different sentences: bytes that were never text, and
 * text too long to set. `sml.xsd` in `anthropics/skills/docx` is the second
 * kind at 237 KB, and telling a reader it is "not shown" would imply we could
 * not read it.
 */
export function whyNotShown(file: Subchapter): string {
  if (file.render !== "binary") return "";
  const size = formatBytes(file.size);
  // Classified at zero bytes, only an inherently binary extension stays binary.
  const inherentlyBinary = classifyResource(file.relPath, 0).render === "binary";
  return inherentlyBinary
    ? `Not shown here — ${size} ${file.label}`
    : `Too long to set here — ${size} ${file.label}`;
}

/* ------------------------------------------------------------- extracts */

/** Files worth spending a raw fetch on for a one-line extract. */
export const EXTRACT_MAX_FILES = 40;

/** Total declared size we will pull just to write forty subtitles. */
export const EXTRACT_MAX_BYTES = 640 * 1024;

/** Character budget for an appendix extract. Shorter than a contents dek. */
export const EXTRACT_MAX_CHARS = 116;

export function extractCandidates(groups: SubchapterGroup[]): Subchapter[] {
  const out: Subchapter[] = [];
  let bytes = 0;
  for (const group of groups) {
    for (const file of group.readable) {
      if (file.render !== "prose") continue;
      if (out.length >= EXTRACT_MAX_FILES) return out;
      if (bytes + file.size > EXTRACT_MAX_BYTES) return out;
      bytes += file.size;
      out.push(file);
    }
  }
  return out;
}

/**
 * The first real sentence of a markdown file.
 *
 * Skips the things that are not the document talking: YAML front matter, HTML
 * comments, the title, badge rows, fenced code, block quotes used as callouts.
 * Returns "" rather than guessing — an appendix entry with no extract reads
 * fine; one with `<!-- prettier-ignore -->` under it does not.
 */
export function firstSentence(source: string, max = EXTRACT_MAX_CHARS): string {
  let text = source.replace(/^﻿/, "");

  // Front matter.
  if (/^---\r?\n/.test(text)) {
    const end = text.indexOf("\n---", 4);
    if (end !== -1) text = text.slice(text.indexOf("\n", end + 1) + 1);
  }

  const lines = text.split(/\r?\n/);
  let fenced = false;
  const paragraph: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();

    if (/^(```|~~~)/.test(line)) {
      if (paragraph.length > 0) break;
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;

    if (line === "") {
      if (paragraph.length > 0) break;
      continue;
    }
    if (paragraph.length === 0) {
      // Headings, comments, tables, front-matter fences, horizontal rules,
      // list bullets and badge-only lines are all apparatus, not prose.
      if (/^(#{1,6}\s|<!--|<|\||-{3,}$|={3,}$|>\s)/.test(line)) continue;
      if (/^[-*+]\s|^\d+[.)]\s/.test(line)) continue;
      // A line that is nothing but links or images is a badge row.
      if (/^(!?\[[^\]]*\]\([^)]*\)\s*)+$/.test(line)) continue;
    }
    paragraph.push(line);
  }

  const plain = stripInlineMarkup(paragraph.join(" "));
  if (plain.length < 12) return "";
  return dekOf(plain, max);
}

/* -------------------------------------------------------------- outlines */

export interface RailOutlineEntry {
  /** 1-based line in the source file. */
  line: number;
  text: string;
}

/** Outline entries past this and the rail is a second copy of the file. */
const OUTLINE_MAX = 40;

/**
 * A jump list for a code subchapter.
 *
 * Deliberately shallow and deliberately regex-based. A real parser for eleven
 * languages is not worth it for a rail, and a wrong entry costs the reader one
 * misdirected jump — but *no* rail on a 700-line Python script costs them the
 * whole file. Only top-level and single-indent definitions qualify, so the
 * rail lists a class and its methods and stops there.
 *
 * Anchors are `#L<n>`, the convention the code subchapter's line gutter uses.
 */
export function codeOutline(source: string, language: string): RailOutlineEntry[] {
  const matcher = OUTLINE_PATTERNS[language];
  if (!matcher) return [];

  const out: RailOutlineEntry[] = [];
  const lines = source.split(/\r?\n/);

  for (let i = 0; i < lines.length && out.length < OUTLINE_MAX; i++) {
    const text = matcher(lines[i]);
    if (text) out.push({ line: i + 1, text });
  }
  return out.length >= 2 ? out : [];
}

type OutlineMatcher = (line: string) => string | null;

function firstGroup(re: RegExp): OutlineMatcher {
  return (line) => {
    const m = re.exec(line);
    return m ? m[1].trim() : null;
  };
}

/** `export function x`, `const x = (…) =>`, `class X`, `interface X`. */
const JS_DEF =
  /^ {0,2}((?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\s*\*?\s*[\w$]+|class\s+[\w$]+|interface\s+[\w$]+|type\s+[\w$]+|(?:const|let|var)\s+[\w$]+(?=\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>)))/;

const OUTLINE_PATTERNS: Record<string, OutlineMatcher> = {
  // `def foo(` and `class Foo` at top level or one indent in (methods).
  python: firstGroup(/^(?: {0,4}|\t)((?:async )?def [\w]+|class [\w]+)/),
  ruby: firstGroup(/^(?: {0,2}|\t)((?:def|class|module) [\w.:]+)/),
  bash: firstGroup(/^([\w-]+)\s*\(\)\s*\{/),
  powershell: firstGroup(/^ {0,2}((?:function|filter)\s+[\w-]+)/i),
  javascript: firstGroup(JS_DEF),
  typescript: firstGroup(JS_DEF),
  tsx: firstGroup(JS_DEF),
  jsx: firstGroup(JS_DEF),
  go: firstGroup(/^(func [\w()* ]+?[\w])\s*\(/),
  rust: firstGroup(/^ {0,4}((?:pub )?(?:async )?(?:fn|struct|enum|impl|trait) [\w<>:]+)/),
  yaml: firstGroup(/^([A-Za-z_][\w.-]*):/),
  sql: firstGroup(/^\s*((?:create|alter|drop)\s+(?:or replace\s+)?[\w ]+?\s+[\w."]+)/i),
};

/** Type label + size for the rail, e.g. "Python · 4 KB". */
export function fileMeta(relPath: string, size: number): string {
  const cls = classifyResource(relPath, size);
  return `${cls.label} · ${formatBytes(size)}`;
}

export type { ResourceRender };
