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
  "fixtures",
  "__fixtures__",
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
 * Path prefixes that are per-agent republications of a canonical skill.
 * The captured group names the target agent.
 */
const MIRROR_PATTERNS: Array<{ re: RegExp; from: (m: RegExpMatchArray) => string }> = [
  { re: /^providers\/([^/]+)\//, from: (m) => m[1] },
  { re: /^\.github\/plugins\/([^/]+)\//, from: (m) => m[1] },
  { re: /^\.(claude|codex|cursor|agents?|opencode|windsurf|gemini)\//, from: (m) => m[1] },
];

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

export function titleCase(input: string): string {
  return input
    .replace(/[-_.]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .split(/\s+/)
    .map((w) =>
      // Preserve deliberate acronyms and mixed-case brand names.
      w.length <= 1 || w === w.toUpperCase()
        ? w
        : w[0].toUpperCase() + w.slice(1),
    )
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
  for (const { re } of MIRROR_PATTERNS) if (re.test(path)) score += 6;
  return score;
}

function mirrorLabel(path: string): string {
  for (const { re, from } of MIRROR_PATTERNS) {
    const m = path.match(re);
    if (m) return titleCase(from(m));
  }
  return "Alternate";
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

  // Collapse byte-identical copies, keeping the most canonical path.
  const byContent = new Map<string, typeof manifests>();
  for (const entry of manifests) {
    const list = byContent.get(entry.sha);
    if (list) list.push(entry);
    else byContent.set(entry.sha, [entry]);
  }

  const chosen = [...byContent.values()].map((copies) => {
    const sorted = [...copies].sort(
      (a, b) => canonicalRank(a.path) - canonicalRank(b.path) || a.path.localeCompare(b.path),
    );
    return {
      entry: sorted[0],
      variants: sorted.slice(1).map((e) => ({
        label: mirrorLabel(e.path),
        path: e.path,
      })),
    };
  });

  chosen.sort((a, b) => a.entry.path.localeCompare(b.entry.path));

  const slugger = new GithubSlugger();
  const dirToSlug = new Map<string, string>();

  const stubs: SkillStub[] = chosen.map(({ entry, variants }) => {
    const dir = dirname(entry.path);
    // A SKILL.md at the repo root describes the repo itself.
    const rawName = dir === "" ? repoName : basename(dir);
    const slug = slugger.slug(rawName);
    dirToSlug.set(dir, slug);
    return {
      slug,
      dir,
      skillMdPath: entry.path,
      group: deriveGroup(dir),
      variants,
      parentSlug: null,
    };
  });

  // Link nested skills (e.g. `skills/foundry/SKILL.md` encloses
  // `skills/foundry/models/SKILL.md`) to their nearest enclosing skill.
  for (const stub of stubs) {
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

/** Extract ATX headings, skipping fenced code blocks. */
export function extractHeadings(markdown: string): SkillHeading[] {
  const slugger = new GithubSlugger();
  const out: SkillHeading[] = [];
  let inFence = false;
  let fenceMarker = "";

  for (const line of markdown.split("\n")) {
    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[1][0];
      } else if (fence[1][0] === fenceMarker) {
        inFence = false;
      }
      continue;
    }
    if (inFence) continue;

    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!m) continue;

    const text = m[2]
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
      .trim();
    if (!text) continue;

    out.push({ depth: m[1].length, text, id: slugger.slug(text) });
  }
  return out;
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
    headings: extractHeadings(body),
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
