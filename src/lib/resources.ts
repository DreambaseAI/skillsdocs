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
}

export function classifyResource(path: string, size = 0): ResourceClass {
  const ext = extensionOf(path);
  const name = basename(path).toLowerCase();

  if (BINARY_EXTENSIONS.has(ext)) {
    return { render: "binary", language: "text", label: labelFor(ext) };
  }

  if (PROSE_EXTENSIONS.has(ext)) {
    // An enormous markdown file is still markdown, but it is not a subchapter.
    return size > MAX_RENDER_BYTES
      ? { render: "binary", language: "markdown", label: "Markdown" }
      : { render: "prose", language: "markdown", label: "Markdown" };
  }

  if (size > MAX_RENDER_BYTES) {
    return { render: "binary", language: "text", label: labelFor(ext) };
  }

  if (PLAIN_EXTENSIONS.has(ext)) {
    return { render: "code", language: "text", label: labelFor(ext) };
  }

  const byName = KNOWN_FILENAMES[name];
  if (!ext && byName) {
    return { render: "code", language: byName, label: labelFor(name) };
  }

  const language = CODE_LANGUAGES[ext];
  if (language) return { render: "code", language, label: labelFor(ext) };

  // Dotfiles and unknown extensions: show them, do not colour them.
  if (!ext || ext.length <= 5) {
    return { render: "code", language: "text", label: labelFor(ext || name) };
  }

  return { render: "binary", language: "text", label: labelFor(ext) };
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

export interface ClassifiedResource extends SkillResource {
  render: ResourceRender;
  language: string;
  label: string;
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
