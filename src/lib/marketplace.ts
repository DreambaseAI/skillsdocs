/**
 * Plugin marketplace manifests.
 *
 * 83 of the 157 surveyed repos ship `.claude-plugin/marketplace.json`, with
 * siblings for other runtimes (`.cursor-plugin/`, `.agents/plugins/`,
 * `.codex-plugin/`, `.grok-plugin/`, `.factory-plugin/`, `.github/plugin/`)
 * and a long tail of bespoke locations (`src/plugins/claude/marketplace.json`,
 * `resources/plugins/launch/orca-marketplace.json`).
 *
 * Treat a manifest as EDITORIAL METADATA, never as the skill index. Only
 * `anthropics/skills` enumerates `plugins[].skills[]`; cloudflare and stripe
 * do not. The recursive tree scan in `skills.ts` stays the source of truth for
 * what a book contains. What we take from here is the publisher's display
 * name, `owner.url` (a design.md lookup candidate), and plugin descriptions.
 */

import { fetchRawText, type TreeEntry } from "./github";

export interface MarketplacePlugin {
  name: string;
  description: string | null;
  /** Relative directory the plugin is rooted at; `"./"` when unspecified. */
  source: string;
  version: string | null;
  /** Relative skill directories, when the manifest bothers to list them. */
  skills: string[];
}

export interface MarketplaceInfo {
  /** Repo-relative path the manifest was read from. */
  path: string;
  /** Manifest-level `name`. */
  name: string | null;
  publisher: string | null;
  /** `owner.url` — worth trying as a design.md host. */
  publisherUrl: string | null;
  description: string | null;
  plugins: MarketplacePlugin[];
}

/**
 * Directories that host a manifest by convention. Used for ranking only —
 * discovery matches on filename so bespoke locations are still found.
 */
const CONVENTIONAL_DIRS = [
  ".claude-plugin",
  ".agents/plugins",
  ".cursor-plugin",
  ".codex-plugin",
  ".grok-plugin",
  ".factory-plugin",
  ".github/plugin",
];

/** Never read a manifest out of vendored or fixture trees. */
const NOISE = /(^|\/)(node_modules|dist|build|vendor|third_party|fixtures|__tests__|tests?)(\/|$)/;

function isManifestName(path: string): boolean {
  const base = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  return base === "marketplace.json" || base.endsWith("-marketplace.json");
}

/** Lower is more canonical. */
function rank(path: string): number {
  const depth = path.split("/").length;
  const dir = path.slice(0, Math.max(0, path.lastIndexOf("/")));
  const conventional = CONVENTIONAL_DIRS.findIndex((d) => dir.endsWith(d));
  // A conventional directory outranks depth; `.claude-plugin` outranks the
  // other runtimes because it is the one the ecosystem actually standardised on.
  return conventional === -1 ? 100 + depth : conventional * 10 + depth;
}

/** Every marketplace manifest in the tree, most canonical first. */
export function findMarketplaceManifests(entries: TreeEntry[]): string[] {
  return entries
    .filter((e) => e.type === "blob" && isManifestName(e.path) && !NOISE.test(e.path))
    .map((e) => e.path)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
}

/**
 * Parse a manifest body. Returns null when the JSON is unusable — a malformed
 * third-party manifest must never take a book down with it.
 */
export function parseMarketplace(path: string, source: string): MarketplaceInfo | null {
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;

  const m = data as Record<string, unknown>;
  const owner =
    typeof m.owner === "object" && m.owner !== null
      ? (m.owner as Record<string, unknown>)
      : {};
  const metadata =
    typeof m.metadata === "object" && m.metadata !== null
      ? (m.metadata as Record<string, unknown>)
      : {};

  const plugins: MarketplacePlugin[] = [];
  if (Array.isArray(m.plugins)) {
    for (const raw of m.plugins) {
      if (typeof raw !== "object" || raw === null) continue;
      const p = raw as Record<string, unknown>;
      const name = str(p.name);
      if (!name) continue;
      plugins.push({
        name,
        description: str(p.description),
        source: str(p.source) ?? "./",
        version: str(p.version),
        skills: stringArray(p.skills),
      });
    }
  }

  const name = str(m.name);
  // A file called marketplace.json with neither a name nor plugins is some
  // other project's config that happens to share the filename.
  if (!name && plugins.length === 0) return null;

  return {
    path,
    name,
    publisher: str(owner.name),
    publisherUrl: str(owner.url),
    description: str(metadata.description) ?? str(m.description),
    plugins,
  };
}

/**
 * Read the most canonical manifest in a repo, if any.
 *
 * Tries up to `maxAttempts` candidates so a bespoke or malformed top choice
 * does not hide a good one underneath. Raw reads are CDN-served and do not
 * count against the GitHub API quota.
 */
export async function fetchMarketplace(
  owner: string,
  repo: string,
  ref: string,
  entries: TreeEntry[],
  maxAttempts = 3,
): Promise<MarketplaceInfo | null> {
  const candidates = findMarketplaceManifests(entries).slice(0, maxAttempts);
  for (const path of candidates) {
    const body = await fetchRawText(owner, repo, ref, path);
    if (!body) continue;
    const parsed = parseMarketplace(path, body);
    if (parsed) return parsed;
  }
  return null;
}
