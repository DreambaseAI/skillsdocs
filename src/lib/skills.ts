/**
 * Skill discovery and parsing.
 *
 * Deliberately layout-agnostic. Real-world skills repos disagree about where
 * skills live — `skills/<name>/SKILL.md`, `<name>/SKILL.md`,
 * `.claude/skills/<name>/SKILL.md`, `plugins/<plugin>/skills/<name>/SKILL.md`,
 * or a lone `SKILL.md` at the root. Rather than special-case each, we treat
 * "any directory containing a SKILL.md" as a skill and derive structure from
 * the surrounding path.
 *
 * Spec: https://agentskills.io/specification
 */

import matter from "gray-matter";
import GithubSlugger from "github-slugger";
import type { TreeEntry } from "./github";
import { isSameTitle, normalizeOutlineLevels } from "./markdown/headings";
import { smarten } from "./markdown/typography";

/* ------------------------------------------------------------------ types */

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  license?: string;
  compatibility?: string;
  /** Spec says string→string, but repos in the wild nest objects here. */
  metadata?: Record<string, unknown>;
  "allowed-tools"?: string;
  [key: string]: unknown;
}

export interface SkillHeading {
  depth: number;
  text: string;
  id: string;
}

export interface SkillResource {
  path: string;
  /** Path relative to the skill directory. */
  relPath: string;
  kind: "script" | "reference" | "asset" | "other";
  size: number;
  ext: string;
}

export interface Skill {
  /** URL-safe, unique within a book. */
  slug: string;
  /** Display name — frontmatter `name`, else the directory name. */
  name: string;
  title: string;
  description: string;
  dir: string;
  skillMdPath: string;
  /** Section this skill was grouped under (derived from path or metadata). */
  group: string;
  frontmatter: SkillFrontmatter;
  /** Markdown body with frontmatter removed. */
  body: string;
  headings: SkillHeading[];
  wordCount: number;
  readingMinutes: number;
  resources: SkillResource[];
  license: string | null;
  compatibility: string | null;
  allowedTools: string[];
  variants: SkillVariant[];
  parentSlug: string | null;
  /** Set when frontmatter is missing or violates the spec. */
  issues: string[];
}

/** A mirror copy of the same skill published for another agent/runtime. */
export interface SkillVariant {
  /** e.g. "claude", "codex", "cursor" — derived from the mirror path. */
  label: string;
  path: string;
}

export interface SkillStub {
  slug: string;
  dir: string;
  skillMdPath: string;
  group: string;
  /** Byte-identical copies of this skill found elsewhere in the repo. */
  variants: SkillVariant[];
  /** Slug of the enclosing skill, when skills are nested. */
  parentSlug: string | null;
}

/* -------------------------------------------------------------- discovery */

/** Path segments that describe packaging, not subject matter. */
const STRUCTURAL_SEGMENTS = new Set([
  "skills",
  "skill",
  ".claude",
  ".claude-plugin",
  ".agent",
  ".agents",
  ".cursor",
  ".codex",
  ".opencode",
  "plugins",
  "plugin",
  "packages",
  "package",
  "src",
  "docs",
  "examples",
  "example",
  "dist",
  "build",
  "node_modules",
  "vendor",
  "third_party",
]);

/**
 * If one of these appears as an *ancestor* of a skill directory, the SKILL.md
 * is scaffolding rather than a published skill — e.g. anthropics'
 * `template/SKILL.md` or Dreambase's `.../assets/skill-template/SKILL.md`.
 */
const NOISE_ANCESTORS = new Set([
  "node_modules",
  "dist",
  "build",
  "vendor",
  "third_party",
  "assets",
  "asset",
  "template",
  "templates",
  "example",
  "examples",
  "fixtures",
  "__fixtures__",
  // Go's convention, and not a rare one: larksuite/cli publishes a real
  // `skills/` tree AND `internal/qualitygate/skillscan/testdata/skills/
  // lark-demo/SKILL.md`, which was surfacing as a 29th chapter called
  // "Lark Demo" that nobody wrote.
  "testdata",
  "test-data",
  "__mocks__",
  "mocks",
  "golden",
  "test",
  "tests",
  "__tests__",
  "spec",
  "snapshots",
  "__snapshots__",
]);

/** Skill directory names that denote a blank template, not a real skill. */
const TEMPLATE_DIR_NAMES = new Set([
  "template",
  "templates",
  "skill-template",
  "example-skill",
  "your-skill-name",
  "skill-name",
]);

/**
 * Prefixes that mark a per-agent republication of one canonical skill.
 *
 * Repos routinely ship the same skill once per agent runtime, and the copies
 * are NOT byte-identical — `pbakaus/impeccable` publishes fourteen copies
 * (`.claude/`, `.cursor/`, `.gemini/`, `.grok/`, `.kiro/`, `.pi/`, `.qoder/`,
 * `.rovodev/`, `.trae/`, …) with fourteen distinct blob SHAs. Stripping the
 * prefix and comparing what remains collapses them correctly.
 *
 * Only a *leading* dot-directory counts: `facebook/react` legitimately hosts
 * both `.claude/skills/*` and `compiler/.claude/skills/*`, and those are
 * different skills that must stay separate.
 */
const MIRROR_PREFIXES: RegExp[] = [
  /^\.([a-z0-9][a-z0-9_-]*)\//, // .claude/ .cursor/ .gemini/ .trae-cn/ …
  /^providers\/([^/]+)\//, // providers/claude/ providers/codex/ …
];

/** Strip a mirror prefix, returning the remainder and the agent it targeted. */
function stripMirror(path: string): { normalized: string; label: string | null } {
  for (const re of MIRROR_PREFIXES) {
    const m = path.match(re);
    if (m) return { normalized: path.slice(m[0].length), label: titleCase(m[1]) };
  }
  return { normalized: path, label: null };
}

function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

function isSkillManifest(path: string): boolean {
  return basename(path).toLowerCase() === "skill.md";
}

/**
 * Derive a human section label for a skill from its path.
 *
 * `plugins/document-skills/skills/pdf/SKILL.md` → "Document Skills"
 * `skills/pdf/SKILL.md`                          → "" (no meaningful group)
 */
function deriveGroup(dir: string): string {
  const segments = dir.split("/").filter(Boolean);
  // Drop the skill's own directory; look at what encloses it.
  const enclosing = segments.slice(0, -1);
  for (let i = enclosing.length - 1; i >= 0; i--) {
    const seg = enclosing[i];
    if (!STRUCTURAL_SEGMENTS.has(seg.toLowerCase())) return titleCase(seg);
  }
  return "";
}

/**
 * Words whose canonical casing is not "capitalise the first letter".
 *
 * Skill directory names are lowercase by spec, so the information that `api`
 * is an initialism and `echarts` is a product name is simply not in the
 * string — "Claude Api" and "Dreambase Echarts" are what naive title casing
 * produces, and they look like a bug to anyone who knows the subject. Keyed by
 * the lowercased token.
 */
const CANONICAL_CASING: Record<string, string> = Object.fromEntries(
  [
    // Initialisms
    "API", "CLI", "UI", "UX", "SDK", "MCP", "IDE", "CI", "CD", "QA", "PR",
    "AI", "ML", "LLM", "RAG", "TTS", "ASR", "OCR", "NLP",
    "PDF", "DOCX", "PPTX", "XLSX", "CSV", "TSV", "JSON", "JSONC", "YAML",
    "XML", "HTML", "CSS", "SVG", "PNG", "JPEG", "GIF", "WEBP", "MDX",
    "HTTP", "HTTPS", "REST", "RPC", "SQL", "ORM", "DNS", "SSL", "TLS", "SSH",
    "URL", "URI", "CDN", "DOM", "CORS", "CSP", "JWT", "SSO", "MFA", "RBAC",
    "AWS", "GCP", "S3", "EC2", "RDS", "IAM", "VPC", "EKS", "AKS", "GKE",
    "K8S", "VM", "OS", "CPU", "GPU", "RAM", "IO", "TCP", "UDP", "SSG", "SSR",
    "CSR", "PWA", "SEO", "RSS", "OG", "A11Y", "I18N", "L10N", "WCAG", "ARIA",
    "SSI", "APM", "SLO", "SLA", "TDD", "BDD", "DDD", "CRUD", "ETL", "AB",
  ].map((a) => [a.toLowerCase(), a]),
);

/** Product and brand names with deliberate internal capitals. */
const BRAND_CASING: Record<string, string> = Object.fromEntries(
  [
    "ECharts", "GraphQL", "TypeScript", "JavaScript", "PostgreSQL", "MySQL",
    "SQLite", "MongoDB", "DynamoDB", "GitHub", "GitLab", "OAuth", "OpenAPI",
    "OpenAI", "WebGL", "WebGPU", "WebRTC", "WebAssembly", "WebSocket",
    "PostHog", "DevOps", "GitOps", "MLOps", "FinOps", "NestJS", "Next.js",
    "Node.js", "Nuxt", "VSCode", "PowerShell", "AppSync", "AppInsights", "BigQuery",
    "CloudFront", "CloudWatch", "DataDog", "PagerDuty", "TanStack",
    "npm", "pnpm", "iOS", "macOS", "tvOS", "watchOS", "visionOS", "iPadOS",
    "gRPC", "dbt", "tRPC", "eBPF", "xAI",
    // Measured misses. `/openai/skills` was setting `Chatgpt Apps`,
    // `Aspnet Core` and `Gh Address Comments` at 30px in the contents and
    // 46px on the chapter opener. `gh` maps to itself for the same reason
    // `npm` does: it is a command, and a capitalised command is a wrong one.
    "ChatGPT", "gh", "OpenTelemetry", "PyTorch", "TensorFlow", "LangChain",
    "LlamaIndex", "Kubernetes", "Terraform",
  ].map((b) => [b.toLowerCase(), b]),
);

/**
 * Names whose canonical form is not recoverable from their own lowercase.
 *
 * `BRAND_CASING` is keyed by `value.toLowerCase()`, which works for `ChatGPT`
 * and fails for anything whose slug drops punctuation — `ASP.NET` lowercases
 * to `asp.net`, but the directory is `aspnet-core` and `titleCase` has already
 * split on the dot by the time the map is consulted. Measured on
 * `/openai/skills`, which set `Aspnet Core` at 46px on the chapter opener.
 */
const SLUG_CASING: Record<string, string> = {
  aspnet: "ASP.NET",
  dotnet: ".NET",
  nextjs: "Next.js",
  nodejs: "Node.js",
  nuxtjs: "Nuxt",
  vuejs: "Vue",
  fastapi: "FastAPI",
  graphiql: "GraphiQL",
  jupyter: "Jupyter",
  gitlab: "GitLab",
  github: "GitHub",
};

export function titleCase(input: string): string {
  return input
    .replace(/[-_.]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase();
      const canonical =
        SLUG_CASING[lower] ?? BRAND_CASING[lower] ?? CANONICAL_CASING[lower];
      if (canonical) return canonical;

      // An author who typed mixed case or full caps meant it.
      if (word !== lower) return word;

      return word.length <= 1 ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/** True when a SKILL.md is scaffolding rather than a published skill. */
function isNoise(skillMdPath: string): boolean {
  const segments = skillMdPath.split("/").slice(0, -1); // drop "SKILL.md"
  const ancestors = segments.slice(0, -1);
  if (ancestors.some((s) => NOISE_ANCESTORS.has(s.toLowerCase()))) return true;

  const dirName = segments.at(-1)?.toLowerCase();
  // Only reject a template-named directory at the top level; deeper ones are
  // usually a real skill that happens to be *about* templates.
  return Boolean(dirName && segments.length === 1 && TEMPLATE_DIR_NAMES.has(dirName));
}

/**
 * Rank candidate paths for the same content. Lower wins.
 * Canonical published locations beat hidden dirs and per-agent mirrors.
 */
function canonicalRank(path: string): number {
  let score = path.split("/").length;
  if (path.startsWith("skills/")) score -= 2;
  if (path.startsWith(".")) score += 4;
  if (stripMirror(path).label !== null) score += 6;
  return score;
}

/** The directory a `SKILL.md` sits in, which is the skill's name. */
function skillName(skillMdPath: string): string {
  return basename(dirname(skillMdPath)).toLowerCase();
}

/** Minimal disjoint set over paths, so grouping cannot depend on input order. */
class UnionFind {
  private parent = new Map<string, string>();

  find(a: string): string {
    const seen = this.parent.get(a);
    if (seen === undefined || seen === a) {
      this.parent.set(a, a);
      return a;
    }
    const root = this.find(seen);
    this.parent.set(a, root);
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

/**
 * Locate every skill in a repo tree and assign each a unique slug.
 *
 * Byte-identical copies (repos commonly republish the same skill under
 * `providers/claude/`, `providers/codex/`, …) collapse into one chapter with
 * the others recorded as variants.
 *
 * Returns stubs; bodies are fetched separately so callers control the cost.
 */
export function discoverSkills(
  entries: TreeEntry[],
  repoName: string,
): SkillStub[] {
  const manifests = entries
    .filter((e) => e.type === "blob" && isSkillManifest(e.path) && !isNoise(e.path))
    .sort((a, b) => a.path.localeCompare(b.path));

  /**
   * Collapse duplicates on two relations, in order of confidence.
   *
   *   1. **Same position once a per-agent mirror prefix is removed.** This is
   *      the strong one: `.claude/skills/pdf` and `.cursor/skills/pdf` are one
   *      skill published twice, even when the bytes drifted apart.
   *   2. **Byte-identical content, *for the same skill name*.** The name guard
   *      is not decoration. Merging on sha alone deleted real chapters: three
   *      distinct directories that happen to share a placeholder body
   *      (`skills/alpha`, `skills/beta`, `skills/gamma`) collapsed into one,
   *      and — worse — the union was transitive, so `skills/b` sharing a sha
   *      with `.claude/skills/a`, which shares a position with `skills/a`,
   *      made `skills/b` vanish from the book entirely with no variant entry
   *      pointing at it. Both cases are covered by unit tests.
   */
  const group = new UnionFind();
  const byPosition = new Map<string, string>();
  const bySha = new Map<string, string[]>();

  for (const entry of manifests) {
    const position = stripMirror(entry.path).normalized;
    const claimed = byPosition.get(position);
    if (claimed) group.union(claimed, entry.path);
    else byPosition.set(position, entry.path);

    const sameSha = bySha.get(entry.sha);
    if (sameSha) sameSha.push(entry.path);
    else bySha.set(entry.sha, [entry.path]);
  }

  for (const paths of bySha.values()) {
    for (let i = 1; i < paths.length; i++) {
      // Same content *and* same skill name: a republication, not a coincidence.
      if (skillName(paths[0]) === skillName(paths[i])) group.union(paths[0], paths[i]);
    }
  }

  const groupsByKey = new Map<string, TreeEntry[]>();
  for (const entry of manifests) {
    const key = group.find(entry.path);
    const list = groupsByKey.get(key);
    if (list) list.push(entry);
    else groupsByKey.set(key, [entry]);
  }

  const chosen = [...groupsByKey.values()].map((copies) => {
    const sorted = [...copies].sort(
      (a, b) => canonicalRank(a.path) - canonicalRank(b.path) || a.path.localeCompare(b.path),
    );
    return {
      entry: sorted[0],
      variants: sorted.slice(1).map((e) => ({
        label: stripMirror(e.path).label ?? "Alternate",
        path: e.path,
      })),
    };
  });

  chosen.sort((a, b) => a.entry.path.localeCompare(b.entry.path));

  // Names collide legitimately — datadog-labs ships both
  // `dd-apm/k8s-ssi/verify-ssi` and `dd-apm/linux-ssi/verify-ssi`. Qualify a
  // colliding slug with its group rather than letting it become "verify-ssi-1".
  const nameCounts = new Map<string, number>();
  for (const { entry } of chosen) {
    const dir = dirname(entry.path);
    const n = dir === "" ? repoName : basename(dir);
    nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1);
  }

  const slugger = new GithubSlugger();
  const dirToSlug = new Map<string, string>();

  const stubs: SkillStub[] = chosen.map(({ entry, variants }, index) => {
    const dir = dirname(entry.path);
    // A SKILL.md at the repo root describes the repo itself.
    const rawName = dir === "" ? repoName : basename(dir);
    const group = deriveGroup(dir);
    const qualified =
      (nameCounts.get(rawName) ?? 0) > 1 && group ? `${group}-${rawName}` : rawName;

    /*
     * A directory name with no sluggable characters — `..`, `.`, `🚀` — slugs
     * to `""` or to github-slugger's disambiguation stub `-1`, and an empty
     * slug makes the chapter link `/owner/repo/`, which 308s back to the
     * cover: a contents row that navigates to the book it is in. Fall back to
     * the chapter's ordinal, which is always a usable URL.
     */
    let slug = slugger.slug(qualified);
    if (slug === "" || /^-\d+$/.test(slug)) slug = slugger.slug(`chapter-${index + 1}`);
    dirToSlug.set(dir, slug);
    return { slug, dir, skillMdPath: entry.path, group, variants, parentSlug: null };
  });

  // Link nested skills (e.g. `skills/foundry/SKILL.md` encloses
  // `skills/foundry/models/SKILL.md`) to their nearest enclosing skill.
  // A root SKILL.md is excluded: it describes the repo, and treating it as
  // everyone's parent would flatten the whole book under one chapter.
  for (const stub of stubs) {
    if (stub.dir === "") continue;
    let ancestor = dirname(stub.dir);
    while (ancestor !== "") {
      const parent = dirToSlug.get(ancestor);
      if (parent && parent !== stub.slug) {
        stub.parentSlug = parent;
        break;
      }
      ancestor = dirname(ancestor);
    }
  }

  return stubs;
}

/** Files bundled with a skill, excluding its own SKILL.md. */
export function collectResources(
  entries: TreeEntry[],
  stub: SkillStub,
): SkillResource[] {
  const prefix = stub.dir === "" ? "" : `${stub.dir}/`;

  return entries
    .filter((e) => {
      if (e.type !== "blob") return false;
      if (e.path === stub.skillMdPath) return false;
      if (prefix === "") return !e.path.includes("/");
      if (!e.path.startsWith(prefix)) return false;
      // A nested SKILL.md marks a different skill — don't absorb its tree.
      return true;
    })
    .filter((e) => {
      // Exclude files that belong to a nested skill.
      const rel = e.path.slice(prefix.length);
      const nestedDir = rel.includes("/") ? rel.split("/")[0] : null;
      if (!nestedDir) return true;
      return !entries.some(
        (o) =>
          o.type === "blob" &&
          isSkillManifest(o.path) &&
          o.path !== stub.skillMdPath &&
          o.path.startsWith(`${prefix}${nestedDir}/`),
      );
    })
    .map((e) => {
      const rel = e.path.slice(prefix.length);
      const top = rel.split("/")[0].toLowerCase();
      const ext = rel.includes(".") ? rel.slice(rel.lastIndexOf(".") + 1) : "";
      const kind: SkillResource["kind"] =
        top === "scripts" || top === "bin"
          ? "script"
          : top === "references" || top === "reference"
            ? "reference"
            : top === "assets" || top === "templates" || top === "static"
              ? "asset"
              : "other";
      return { path: e.path, relPath: rel, kind, size: e.size ?? 0, ext };
    })
    .sort((a, b) => a.relPath.localeCompare(b.relPath));
}

/* ----------------------------------------------------------------- parsing */

const WORDS_PER_MINUTE = 220;

/**
 * Extract ATX headings, skipping fenced code blocks.
 *
 * **This must produce exactly what the page renders.** The JSON API publishes
 * this list as `outline`, the chapter opener counts it as "N sections", and an
 * agent turns each `id` into a `#anchor` against the HTML page. Measured across
 * 78 real chapters before this was fixed: 38% had at least one id that matched
 * no element on the page, 32% had the wrong number of entries, and 85% had the
 * wrong level for the first heading — because the outline was read off the raw
 * source while the page was rendered from a tree that had been smart-quoted,
 * had its duplicate leading H1 stripped, and had its levels shifted and
 * repaired.
 *
 * So this function performs the same three transforms, using the same shared
 * helpers as the renderer, and `markdown.test.ts` asserts the two agree
 * heading-for-heading on real documents.
 */
export function extractHeadings(markdown: string, title?: string): SkillHeading[] {
  const raw: Array<{ depth: number; text: string }> = [];
  let inFence = false;
  let fenceMarker = "";
  let leadingIndex = -1;
  let seenContent = false;

  for (const line of markdown.split("\n")) {
    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[1][0];
      } else if (fence[1][0] === fenceMarker) {
        inFence = false;
      }
      seenContent = true;
      continue;
    }
    if (inFence) continue;

    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!m) {
      if (line.trim() !== "") seenContent = true;
      continue;
    }

    const text = smarten(
      m[2]
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
        .trim(),
    );
    if (!text) {
      seenContent = true;
      continue;
    }

    if (!seenContent && raw.length === 0) leadingIndex = 0;
    seenContent = true;
    raw.push({ depth: m[1].length, text });
  }

  // The renderer drops a document-leading H1 that merely repeats the chapter
  // title, because the page already prints that title as its only h1.
  const kept =
    title !== undefined &&
    leadingIndex === 0 &&
    raw.length > 0 &&
    raw[0].depth === 1 &&
    isSameTitle(raw[0].text, title)
      ? raw.slice(1)
      : raw;

  const levels = normalizeOutlineLevels(kept.map((h) => h.depth));
  const slugger = new GithubSlugger();
  return kept.map((h, i) => ({
    depth: levels[i],
    text: h.text,
    id: slugger.slug(h.text),
  }));
}

function countWords(markdown: string): number {
  const prose = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/[#>*_~|-]/g, " ");
  const matches = prose.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return matches ? matches.length : 0;
}

function asString(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

/** Validate frontmatter against the Agent Skills spec, returning warnings. */
function validate(fm: SkillFrontmatter, dirName: string): string[] {
  const issues: string[] = [];
  const name = asString(fm.name);
  const description = asString(fm.description);

  if (!name) {
    issues.push("Missing required `name` in frontmatter.");
  } else {
    if (name.length > 64) issues.push("`name` exceeds 64 characters.");
    if (!/^[\p{Ll}\p{N}]+(?:-[\p{Ll}\p{N}]+)*$/u.test(name)) {
      issues.push(
        "`name` should be lowercase alphanumeric with single hyphens.",
      );
    }
    if (dirName && name !== dirName) {
      issues.push(`\`name\` (“${name}”) does not match directory “${dirName}”.`);
    }
  }

  if (!description) {
    issues.push("Missing required `description` in frontmatter.");
  } else if (description.length > 1024) {
    issues.push("`description` exceeds 1024 characters.");
  }

  const compatibility = asString(fm.compatibility);
  if (compatibility && compatibility.length > 500) {
    issues.push("`compatibility` exceeds 500 characters.");
  }

  return issues;
}

export function parseSkill(
  stub: SkillStub,
  source: string,
  resources: SkillResource[],
): Skill {
  let frontmatter: SkillFrontmatter = {};
  let body = source;

  try {
    const parsed = matter(source);
    frontmatter = (parsed.data ?? {}) as SkillFrontmatter;
    body = parsed.content;
  } catch {
    // Malformed YAML: surface the whole file rather than losing the content.
    frontmatter = {};
    body = source;
  }

  const dirName = stub.dir === "" ? "" : basename(stub.dir);
  const issues = validate(frontmatter, dirName);

  const name = asString(frontmatter.name) ?? (dirName || stub.slug);
  const description = asString(frontmatter.description) ?? "";
  const wordCount = countWords(body);

  return {
    slug: stub.slug,
    name,
    title: titleCase(name),
    description,
    dir: stub.dir,
    skillMdPath: stub.skillMdPath,
    group: stub.group,
    frontmatter,
    body: body.trim(),
    headings: extractHeadings(body, titleCase(name)),
    wordCount,
    readingMinutes: Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE)),
    resources,
    license: asString(frontmatter.license),
    compatibility: asString(frontmatter.compatibility),
    allowedTools: (asString(frontmatter["allowed-tools"]) ?? "")
      .split(/\s+/)
      .filter(Boolean),
    variants: stub.variants,
    parentSlug: stub.parentSlug,
    issues,
  };
}
