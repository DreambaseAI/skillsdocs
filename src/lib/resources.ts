/**
 * Bundled resources, treated as subchapters rather than as links.
 *
 * A skill is not just its `SKILL.md`. Across the 170 skills surveyed there are
 * 2,518 bundled files, and **1,812 of them — 72% — are markdown**: reference
 * guides, form schemas, worked examples, evaluation rubrics. That is real
 * documentation, and every other skills browser throws it away behind a link
 * to GitHub. Rendering it is the point of this app.
 *
 * The other 706 files are mostly source — Python, shell, PowerShell, YAML,
 * JSON, TypeScript — plus a tail of genuine binaries (54 TrueType fonts, 34
 * PNGs) that must never be fed to a text renderer.
 *
 * So every resource is classified into exactly one of three renderings:
 * `prose` (markdown, through the same pipeline as a chapter), `code` (Shiki,
 * with line numbers), or `binary` (described and linked, never inlined).
 */

import { paths } from "./site";
import { titleCase, type SkillResource } from "./skills";

export type ResourceRender = "prose" | "code" | "binary";

/**
 * Upper bound on what we will fetch and render inline.
 *
 * The corpus tops out at a 2 MB `option-index.json` and a 440 KB `.d.ts`.
 * Highlighting either would cost more than the whole rest of the page and
 * nobody reads a 2 MB generated index in a magazine, so past this we show the
 * head of the file and send the reader upstream for the rest.
 */
export const MAX_RENDER_BYTES = 192 * 1024;

/** Lines of a too-large file we show as a preview before linking out. */
export const PREVIEW_LINES = 40;

/**
 * Extension → Shiki language id.
 *
 * Only languages Shiki actually bundles; anything unmapped renders as plain
 * text rather than throwing at highlight time.
 */
const CODE_LANGUAGES: Record<string, string> = {
  // Scripting — the bulk of what skills ship.
  py: "python",
  rb: "ruby",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "fish",
  ps1: "powershell",
  psm1: "powershell",
  bat: "bat",
  // Web.
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  vue: "vue",
  svelte: "svelte",
  // Data and config.
  json: "json",
  jsonc: "jsonc",
  json5: "json5",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  ini: "ini",
  env: "dotenv",
  xml: "xml",
  xsd: "xml",
  xsl: "xml",
  svg: "xml",
  csv: "csv",
  graphql: "graphql",
  gql: "graphql",
  proto: "proto",
  sql: "sql",
  // Systems and infra.
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  lua: "lua",
  r: "r",
  jl: "julia",
  tf: "terraform",
  tfvars: "terraform",
  hcl: "hcl",
  bicep: "bicep",
  dockerfile: "docker",
  gradle: "groovy",
  makefile: "make",
  // Notebooks are JSON on disk.
  ipynb: "json",
};

/** Extensions that are markdown by another name. */
const PROSE_EXTENSIONS = new Set(["md", "markdown", "mdx", "mdown", "mkd"]);

/** Plain text we show monospaced but do not pretend to highlight. */
const PLAIN_EXTENSIONS = new Set(["txt", "text", "log", "rst", "adoc", "cfg", "conf", "properties"]);

/**
 * Anything here is bytes, not characters. Explicitly enumerated rather than
 * inferred: a file we cannot classify is safer treated as text we decline to
 * render than as text we mangle.
 */
const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "tif", "tiff",
  "ttf", "otf", "woff", "woff2", "eot",
  "pdf", "zip", "gz", "tar", "tgz", "bz2", "7z", "rar",
  "mp3", "mp4", "wav", "mov", "avi", "webm", "ogg", "m4a",
  "xlsx", "xls", "docx", "doc", "pptx", "ppt", "odt", "ods",
  "so", "dylib", "dll", "exe", "bin", "wasm", "pyc", "class", "jar",
  "sqlite", "db", "parquet", "npy", "pkl", "pickle",
]);

/** Files with no extension whose name tells us what they are. */
const KNOWN_FILENAMES: Record<string, string> = {
  dockerfile: "docker",
  makefile: "make",
  procfile: "bash",
  gemfile: "ruby",
  rakefile: "ruby",
  license: "text",
  notice: "text",
};

function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

export function extensionOf(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  // A leading dot is `.gitignore`, not an extension.
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export interface ResourceClass {
  render: ResourceRender;
  /** Shiki language id, for `render === "code"`. */
  language: string;
  /** Human label for the file type, e.g. "Markdown", "Python". */
  label: string;
  /**
   * True when this is *text we declined to render whole*, not bytes.
   *
   * `render: "binary"` covers two very different files — a TrueType font, and
   * a 2 MB generated `option-index.json`. The font must never be fetched as
   * text; the JSON should show its first lines and then send the reader
   * upstream. Without this flag the loader cannot tell them apart, and would
   * either feed a font to a decoder or throw away the only readable part of
   * the largest files in the corpus.
   */
  oversized: boolean;
}

/**
 * Best-effort Shiki id for a file we are not going to render in full.
 *
 * Language resolution normally happens on the way to `render: "code"`, which
 * an oversized file never reaches — so a 2 MB JSON would have previewed as
 * plain text. The preview is short; the highlighting is what makes it legible.
 */
function previewLanguageFor(ext: string, name: string): string {
  if (PROSE_EXTENSIONS.has(ext)) return "markdown";
  if (PLAIN_EXTENSIONS.has(ext)) return "text";
  if (!ext) return KNOWN_FILENAMES[name] ?? "text";
  return CODE_LANGUAGES[ext] ?? "text";
}

export function classifyResource(path: string, size = 0): ResourceClass {
  const ext = extensionOf(path);
  const name = basename(path).toLowerCase();

  if (BINARY_EXTENSIONS.has(ext)) {
    return { render: "binary", language: "text", label: labelFor(ext), oversized: false };
  }

  if (PROSE_EXTENSIONS.has(ext)) {
    // An enormous markdown file is still markdown, but it is not a subchapter.
    return size > MAX_RENDER_BYTES
      ? { render: "binary", language: "markdown", label: "Markdown", oversized: true }
      : { render: "prose", language: "markdown", label: "Markdown", oversized: false };
  }

  if (size > MAX_RENDER_BYTES) {
    return {
      render: "binary",
      language: previewLanguageFor(ext, name),
      label: labelFor(ext || name),
      oversized: true,
    };
  }

  if (PLAIN_EXTENSIONS.has(ext)) {
    return { render: "code", language: "text", label: labelFor(ext), oversized: false };
  }

  const byName = KNOWN_FILENAMES[name];
  if (!ext && byName) {
    return { render: "code", language: byName, label: labelFor(name), oversized: false };
  }

  const language = CODE_LANGUAGES[ext];
  if (language) return { render: "code", language, label: labelFor(ext), oversized: false };

  // Dotfiles and unknown extensions: show them, do not colour them.
  if (!ext || ext.length <= 5) {
    return {
      render: "code",
      language: "text",
      label: labelFor(ext || name),
      oversized: false,
    };
  }

  return { render: "binary", language: "text", label: labelFor(ext), oversized: false };
}

const LABELS: Record<string, string> = {
  md: "Markdown", markdown: "Markdown", mdx: "MDX",
  py: "Python", rb: "Ruby", sh: "Shell", bash: "Shell", zsh: "Shell",
  ps1: "PowerShell", psm1: "PowerShell", bat: "Batch",
  js: "JavaScript", mjs: "JavaScript", cjs: "JavaScript", jsx: "JavaScript",
  ts: "TypeScript", mts: "TypeScript", tsx: "TypeScript",
  json: "JSON", jsonc: "JSON", json5: "JSON",
  yaml: "YAML", yml: "YAML", toml: "TOML", ini: "INI",
  xml: "XML", xsd: "XML Schema", xsl: "XSLT", svg: "SVG",
  html: "HTML", css: "CSS", scss: "Sass",
  csv: "CSV", sql: "SQL", graphql: "GraphQL", gql: "GraphQL", proto: "Protobuf",
  go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", swift: "Swift",
  c: "C", h: "C", cpp: "C++", hpp: "C++", cs: "C#", php: "PHP",
  lua: "Lua", r: "R", jl: "Julia",
  tf: "Terraform", tfvars: "Terraform", hcl: "HCL", bicep: "Bicep",
  txt: "Text", text: "Text", log: "Log", rst: "reStructuredText",
  ttf: "TrueType font", otf: "OpenType font", woff: "Web font", woff2: "Web font",
  png: "PNG image", jpg: "JPEG image", jpeg: "JPEG image", gif: "GIF image",
  webp: "WebP image", svgz: "SVG image", ico: "Icon", pdf: "PDF",
  zip: "Archive", gz: "Archive", tar: "Archive",
  xlsx: "Spreadsheet", docx: "Document", pptx: "Presentation",
  ipynb: "Notebook", wasm: "WebAssembly",
};

function labelFor(key: string): string {
  return LABELS[key] ?? (key ? key.toUpperCase() : "File");
}

/* ------------------------------------------------------------- grouping */

export interface ResourceGroup {
  kind: SkillResource["kind"];
  title: string;
  /** One line explaining what the convention means, for readers who don't know. */
  note: string;
  files: ClassifiedResource[];
}

export interface ClassifiedResource extends SkillResource, ResourceClass {
  /** URL-safe path segments for the subchapter route. */
  segments: string[];
}

const GROUP_META: Record<SkillResource["kind"], { title: string; note: string }> = {
  reference: {
    title: "References",
    note: "Documentation the agent loads on demand, rather than up front.",
  },
  script: {
    title: "Scripts",
    note: "Executable code the skill can run.",
  },
  asset: {
    title: "Assets",
    note: "Templates, schemas and fixtures the skill draws on.",
  },
  other: {
    title: "Also bundled",
    note: "Everything else published alongside the skill.",
  },
};

/** Order that reads as a book: prose first, then code, then everything else. */
const KIND_ORDER: SkillResource["kind"][] = ["reference", "script", "asset", "other"];

export function classifyAll(resources: SkillResource[]): ClassifiedResource[] {
  return resources.map((resource) => {
    const cls = classifyResource(resource.relPath, resource.size);
    return {
      ...resource,
      ...cls,
      segments: resource.relPath.split("/"),
    };
  });
}

export function groupResources(resources: SkillResource[]): ResourceGroup[] {
  const classified = classifyAll(resources);

  return KIND_ORDER.map((kind) => ({
    kind,
    ...GROUP_META[kind],
    files: classified
      .filter((r) => r.kind === kind)
      // Renderable files first — a reader clicking into an appendix wants the
      // ones that will actually open here.
      .sort(
        (a, b) =>
          Number(a.render === "binary") - Number(b.render === "binary") ||
          a.relPath.localeCompare(b.relPath),
      ),
  })).filter((group) => group.files.length > 0);
}

/** Resources that open as a subchapter in the reader. */
export function readableResources(resources: SkillResource[]): ClassifiedResource[] {
  return classifyAll(resources).filter((r) => r.render !== "binary");
}

/**
 * A display title for a resource: `references/api-reference.md` → "API
 * Reference", `FORMS.md` → "FORMS".
 *
 * Goes through the same `titleCase` as chapter titles so the acronym table is
 * shared — otherwise the appendix reads "Api Reference" next to a contents
 * list that says "Claude API".
 */
export function resourceTitle(relPath: string): string {
  const name = basename(relPath);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  // An all-caps filename is a deliberate convention (FORMS.md, README.md).
  if (stem.length > 1 && stem === stem.toUpperCase() && /[A-Z]/.test(stem)) {
    return stem.replace(/[-_]+/g, " ");
  }
  return titleCase(stem);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ------------------------------------------------------- addressing */

/**
 * The subchapter URL for one bundled file.
 *
 * Built on `paths.chapter` rather than beside it, so the third segment stays
 * whatever the router says a skill slug is. See ARCHITECTURE §namespace: the
 * third segment belongs entirely to skill slugs, and a fourth-and-deeper
 * catch-all is the only addition that cannot collide with one.
 */
export function resourcePath(
  owner: string,
  repo: string,
  slug: string,
  relPath: string,
): string {
  const tail = relPath.split("/").map(encodeURIComponent).join("/");
  return `${paths.chapter(owner, repo, slug)}/${tail}`;
}

/**
 * The maximum depth and length a bundled file's path may have.
 *
 * Not a security control on their own — the whitelist below is — but a cheap
 * way to refuse an absurd request before it costs a book fetch.
 */
const MAX_SEGMENTS = 12;
const MAX_REL_PATH = 512;

/**
 * A git path never contains a control character. NUL in particular only
 * ever arrives as a truncation probe, so it is refused rather than trimmed.
 */
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Turn the catch-all's segments into a repo-relative path, or refuse.
 *
 * **This is the first half of a security boundary.** The second half —
 * `findResource` — is the one that actually matters, because it only ever
 * matches against paths the repository's own git tree declared. But defence
 * here is not redundant: it means a traversal attempt is rejected *before* it
 * is used to build a cache key or a fetch URL, and it makes the rule testable
 * without a network.
 *
 * Next has already percent-decoded these segments, so `%2e%2e` arrives as
 * `..` and `%2f` arrives as a segment containing `/`. Both are refused.
 */
export function safeRelPath(segments: readonly string[]): string | null {
  if (segments.length === 0 || segments.length > MAX_SEGMENTS) return null;

  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") return null;
    if (segment.includes("/") || segment.includes("\\")) return null;
    if (hasControlChar(segment)) return null;
  }

  const relPath = segments.join("/");
  return relPath.length > MAX_REL_PATH ? null : relPath;
}

/**
 * Every resource of a skill, in the order the appendix lists them.
 *
 * Flattened straight out of `groupResources` on purpose: prev/next has to walk
 * the same sequence the reader can see, or paging through an appendix jumps
 * around the list they are looking at.
 */
export function resourceOrder(resources: SkillResource[]): ClassifiedResource[] {
  return groupResources(resources).flatMap((group) => group.files);
}

/**
 * Look one resource up by its repo-relative path.
 *
 * **This is the security boundary.** The lookup is an exact match against the
 * skill's declared resources, which come from the repository's git tree — so
 * there is no path arithmetic to get wrong and no way to name a file the skill
 * does not ship. Never replace this with a join against the skill directory.
 */
export function findResource(
  resources: SkillResource[],
  relPath: string,
): ClassifiedResource | null {
  const match = resources.find((r) => r.relPath === relPath);
  return match ? (classifyAll([match])[0] ?? null) : null;
}

export interface ResourceNav {
  /**
   * 1-based position among the files that are *set in the book*, or 0 for one
   * that is not — a font, or text too long to reproduce.
   */
  position: number;
  /** How many files of this skill are set in the book. */
  total: number;
  prev: ClassifiedResource | null;
  next: ClassifiedResource | null;
}

/**
 * Neighbours within the same skill, so an appendix pages like a book.
 *
 * **The sequence is the readable files only, and that is the whole point.**
 * `canvas-design` bundles 54 TrueType fonts among its 82 files; paging through
 * the raw order would walk a reader into fifty-four consecutive pages that say
 * "not reproduced here" and out the other side. The appendix does not link
 * them and the contents rail does not number them, so the nav must not walk
 * them either — three surfaces, one sequence.
 *
 * A file that is not in that sequence is still *addressable*: an old link or a
 * typed URL lands on its description page. Rather than dead-ending there, it
 * is bracketed in the full order and handed the nearest readable file on each
 * side, so there is always a way back into the book.
 */
export function resourceNav(
  resources: SkillResource[],
  relPath: string,
): ResourceNav {
  const ordered = resourceOrder(resources);
  const readable = ordered.filter((r) => r.render !== "binary");
  const total = readable.length;

  const index = readable.findIndex((r) => r.relPath === relPath);
  if (index !== -1) {
    return {
      position: index + 1,
      total,
      prev: index > 0 ? readable[index - 1] : null,
      next: index < readable.length - 1 ? readable[index + 1] : null,
    };
  }

  const full = ordered.findIndex((r) => r.relPath === relPath);
  if (full === -1) return { position: 0, total, prev: null, next: null };

  let prev: ClassifiedResource | null = null;
  for (let i = full - 1; i >= 0; i--) {
    if (ordered[i].render !== "binary") {
      prev = ordered[i];
      break;
    }
  }
  let next: ClassifiedResource | null = null;
  for (let i = full + 1; i < ordered.length; i++) {
    if (ordered[i].render !== "binary") {
      next = ordered[i];
      break;
    }
  }
  return { position: 0, total, prev, next };
}

/** The directory a resource lives in, as a full repo path. `""` at the root. */
export function resourceDir(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/* --------------------------------------------------- rendering helpers */

/*
 * This lives here rather than in `resource-loader.ts` for one reason: it is
 * the part of the loader that can be wrong in a way a reader would see, and
 * `resource-loader.ts` imports `server-only`, so a test cannot load it. A pure
 * function in a pure module is a function with a test.
 *
 * A `fenceFor` helper stood beside it while source files were rendered by
 * wrapping them in a markdown fence. `CodeBlock` highlights the bytes
 * directly, so CommonMark's fence-closing rules no longer apply to somebody
 * else's Python and the helper had nothing left to protect.
 */

/**
 * How many lines a file has, as the reader will see them counted.
 *
 * There is exactly one definition of this because there are two surfaces
 * showing it — the code frame's header ("Python · 98 lines") and the rail's
 * "Lines" stat — and they disagreed. The frame normalises before it counts
 * (`forDisplay` in `ai-elements/code-block.tsx`: CRLF folded, one trailing
 * newline dropped, so a POSIX file does not show a phantom final line), while
 * the loader counted the raw bytes. A 98-line script therefore read "98 lines"
 * in its header and "Lines 99" in its rail, on the same page.
 *
 * Both now call this. Keep it in step with `forDisplay`.
 */
export function countLines(source: string): number {
  const normalised = source
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n$/, "");
  return normalised === "" ? 0 : normalised.split("\n").length;
}

export interface PreviewHead {
  source: string;
  lines: number;
}

/**
 * The head of a file we decline to set whole.
 *
 * `truncated` says the read stopped at a byte budget rather than at the end of
 * the file, which means the last line almost certainly ends mid-token. A half
 * line reads as a rendering fault rather than as a boundary, so it goes — but
 * only when the preview actually reaches the end of what was fetched. When the
 * file had more than `PREVIEW_LINES` lines inside the budget, the cut is ours
 * and every line in it is whole.
 */
export function previewHead(text: string, truncated: boolean): PreviewHead {
  const all = text.split("\n");
  const lines = all.slice(0, PREVIEW_LINES);
  if (truncated && lines.length === all.length) lines.pop();
  return { source: lines.join("\n"), lines: lines.length };
}
