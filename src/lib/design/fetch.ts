/**
 * Resolves a `design.md` for a GitHub owner, walking a chain of sources and
 * stopping at the first that yields real markdown.
 *
 * Tier order matters. Curated seeds win because they are hand-verified and
 * make demos deterministic; the owner's own site comes next because it is
 * authoritative; the community registry backfills 74 well-known brands; and a
 * deterministic hue from the owner's name is the terminal fallback, so this
 * function never fails and never returns an unthemed issue.
 */

import { cacheLife, cacheTag } from "next/cache";
import { formatHex, parseColor } from "../color";
import { ownerTag, repoTag } from "../github";
import { looksLikeMarkdown, parseDesignCss, parseDesignMarkdown } from "./parse";
import { curatedFor, REGISTRY_RAW } from "./registry";
import { deriveIssueTheme } from "./theme";
import type { BrandColor, DesignManifest, IssueTheme } from "./types";

const TIMEOUT_MS = 6000;
const MIN_BYTES = 64;
const MAX_BYTES = 512 * 1024;
/**
 * External stylesheets get their own, larger ceiling: `vercel-brand.css` is
 * 108,891 bytes and is the only place Vercel's tokens exist. 512 KB would be
 * an open invitation, so this is deliberately just wide enough.
 */
const MAX_CSS_BYTES = 256 * 1024;

/**
 * The intended freshness window for a design document, in seconds. Kept as the
 * written-down intent behind the `design` cacheLife profile.
 *
 * The individual `fetch()` calls below deliberately carry no
 * `next: { revalidate }`. They used to, while running inside `getBook`'s
 * `"use cache"` scope, which is the exact "two independent TTLs over the same
 * bytes" bug `lib/github.ts` writes down: after `revalidateTag("repo:o/r")`
 * re-ran the book, the fetch-level entry was still fresh, so a changed
 * `design.md` stayed invisible until *its* TTL expired. One owner of freshness
 * per byte — now the `getIssueTheme` cache entry below.
 */
export const DESIGN_REVALIDATE = 60 * 60 * 24;

interface FetchedDoc {
  body: string;
  url: string;
}

async function tryFetchMarkdown(url: string): Promise<FetchedDoc | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "text/markdown, text/plain;q=0.9, */*;q=0.1" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) return null;

    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) return null;

    const body = await res.text();
    if (body.length < MIN_BYTES || body.length > MAX_BYTES) return null;

    // linear.app/design.md answers 200 with the Linear SPA shell. Status alone
    // is not evidence; require a markdown content type and a non-`<` body.
    if (!looksLikeMarkdown(body, res.headers.get("content-type"))) return null;

    return { body, url };
  } catch {
    return null;
  }
}

/** Same guards as markdown, gated on `text/css` and a body that opens like CSS. */
async function tryFetchCss(url: string): Promise<FetchedDoc | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "text/css, */*;q=0.1" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) return null;
    if (Number(res.headers.get("content-length") ?? 0) > MAX_CSS_BYTES) return null;
    if (!/^text\/css/i.test(res.headers.get("content-type") ?? "")) return null;

    const body = await res.text();
    if (body.length < MIN_BYTES || body.length > MAX_CSS_BYTES) return null;
    // A CSS file never opens with a tag; an error page served as text/css does.
    if (body.trimStart().startsWith("<")) return null;

    return { body, url };
  } catch {
    return null;
  }
}

/** Strip `www.` and any single subdomain to reach a probable apex. */
function apexOf(hostname: string): string | null {
  const parts = hostname.split(".");
  if (parts.length <= 2) return null;
  const apex = parts.slice(-2).join(".");
  return apex === hostname ? null : apex;
}

function siteCandidates(site: string | null): string[] {
  if (!site) return [];
  const withScheme = /^https?:\/\//i.test(site) ? site : `https://${site}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return [];
  }
  const out = [`https://${url.hostname}/design.md`];
  const apex = apexOf(url.hostname);
  if (apex) out.push(`https://${apex}/design.md`);
  return out;
}

/* ------------------------------------------------------- pointer chasing */

/**
 * Some brands publish a *pointer* rather than a document.
 *
 * - `resend.com/design.md` is 1,159 bytes of links, and **its own links 404**
 *   (verified). The real tokens live at `resend-brand/SKILL.md`, reachable
 *   only by listing the repo tree.
 * - `vercel.com/design.md` is a 35 KB Agent Skill with zero colour literals;
 *   everything is in the `vercel-brand.css` it links to.
 *
 * So: chase, but chase properly, and exactly one level deep. A pointer's
 * pointer is somebody else's problem.
 */
const MAX_CHASES = 4;
const BRAND_DOC = /(?:^|\/)(?:SKILL|DESIGN|BRAND|TOKENS|THEME|STYLE)\.md$/i;

/** `github.com/<o>/<r>/blob/<ref>/<path>` → the raw URL for the same bytes. */
function githubBlobToRaw(url: string): string | null {
  const m = url.match(
    /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/blob\/([^/]+)\/(.+)$/i,
  );
  if (!m) return null;
  const [, owner, repo, ref, path] = m;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path.split("#")[0]}`;
}

function githubRepoOf(url: string): { owner: string; repo: string } | null {
  const m = url.match(/^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)(?:[/?#]|$)/i);
  return m ? { owner: m[1], repo: m[2].replace(/\.git$/, "") } : null;
}

/**
 * List a repo's blobs. Uses the `HEAD` ref so we never need a second call to
 * discover the default branch — verified against `resend/design-skills`.
 * Unauthenticated is fine (60 req/hr/IP); `GITHUB_TOKEN` lifts it to 5,000.
 */
async function listRepoBlobs(owner: string, repo: string): Promise<string[]> {
  const token = process.env.GITHUB_TOKEN;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as {
      tree?: Array<{ path?: string; type?: string }>;
    };
    return (json.tree ?? [])
      .filter((e) => e.type === "blob" && typeof e.path === "string")
      .map((e) => e.path as string);
  } catch {
    return [];
  }
}

/** Rank brand documents in a repo tree: `resend-brand/SKILL.md` beats `SKILL.md`. */
function rankBrandDocs(paths: string[]): string[] {
  return paths
    .filter((p) => BRAND_DOC.test(p) && !/(^|\/)(tests?|examples?|node_modules)\//i.test(p))
    .map((p) => {
      let score = 0;
      if (/brand/i.test(p)) score += 4;
      if (/design|token|theme/i.test(p)) score += 2;
      // A nested doc is the specific one; a root SKILL.md is usually the index.
      if (p.includes("/")) score += 1;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p)
    .slice(0, 3);
}

/**
 * Resolve one pointer to a parsed manifest, or null.
 * Never recurses: whatever comes back is used as-is.
 */
async function chaseOne(url: string): Promise<DesignManifest | null> {
  if (/\.css(?:[?#]|$)/i.test(url)) {
    const css = await tryFetchCss(url);
    if (!css) return null;
    const parsed = parseDesignCss(css.body, css.url);
    return parsed.ok ? parsed : null;
  }

  const raw = githubBlobToRaw(url);
  if (raw) {
    const doc = await tryFetchMarkdown(raw);
    if (doc) {
      const parsed = parseDesignMarkdown(doc.body, doc.url);
      if (parsed.ok) return parsed;
    }
  }

  // The blob URL 404'd — which is exactly what Resend's published links do.
  // Fall back to listing the tree and finding the brand document ourselves.
  const repo = githubRepoOf(url);
  if (repo) {
    const blobs = await listRepoBlobs(repo.owner, repo.repo);
    for (const path of rankBrandDocs(blobs)) {
      const doc = await tryFetchMarkdown(
        `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/HEAD/${path}`,
      );
      if (!doc) continue;
      const parsed = parseDesignMarkdown(doc.body, doc.url);
      if (parsed.ok && parsed.colors.length > 0) return parsed;
    }
    return null;
  }

  const doc = await tryFetchMarkdown(url);
  if (!doc) return null;
  const parsed = parseDesignMarkdown(doc.body, doc.url);
  return parsed.ok ? parsed : null;
}

/**
 * Merge a chased manifest into the pointer document that named it.
 * The pointer keeps its identity (name, description, voice); the chased
 * document supplies the tokens it was pointing at.
 */
function mergeChased(pointer: DesignManifest, chased: DesignManifest): DesignManifest {
  return {
    ...pointer,
    ok: true,
    colors: chased.colors.length > 0 ? chased.colors : pointer.colors,
    fonts: chased.fonts.length > 0 ? chased.fonts : pointer.fonts,
    radiusPx: pointer.radiusPx ?? chased.radiusPx,
    name: pointer.name ?? chased.name,
    description: pointer.description ?? chased.description,
    format: pointer.colors.length === 0 ? "pointer" : pointer.format,
    warnings: [...pointer.warnings, `Tokens chased from ${chased.sourceUrl}.`],
  };
}

/**
 * Chase a document's pointers, depth 1.
 * Only fires when the document itself yielded no colours — a manifest with
 * real tokens is never second-guessed.
 */
async function chasePointers(manifest: DesignManifest): Promise<DesignManifest> {
  if (manifest.colors.length > 0 || manifest.pointers.length === 0) return manifest;

  const seen = new Set<string>();
  let budget = MAX_CHASES;

  for (const url of manifest.pointers) {
    if (budget-- <= 0) break;
    if (seen.has(url)) continue;
    seen.add(url);
    const chased = await chaseOne(url);
    if (chased && chased.colors.length > 0) return mergeChased(manifest, chased);
  }

  return manifest;
}

export interface DesignSources {
  owner: string;
  /** `OwnerMeta.blog`, when GitHub has one. */
  site?: string | null;
  /** Raw URLs of any design.md inside the skills repo itself. */
  repoLocalUrls?: string[];
}

/**
 * Fetch and parse the best available design document for an owner.
 * Always returns a manifest; `origin` records which tier answered.
 */
export async function resolveDesignManifest(
  sources: DesignSources,
): Promise<DesignManifest> {
  const { owner } = sources;
  const curated = curatedFor(owner);

  // Tier 2/3: the owner's own site, then its apex.
  const siteUrls = [
    ...siteCandidates(curated?.site ?? null),
    ...siteCandidates(sources.site ?? null),
  ];

  // Tier 4: the community registry.
  const registrySlug = curated?.registrySlug ?? owner.toLowerCase();
  const registryUrls = [`${REGISTRY_RAW}/${registrySlug}/DESIGN.md`];

  // Tier 5: a design.md committed to the skills repo itself.
  const repoUrls = sources.repoLocalUrls ?? [];

  const attempts: Array<{ url: string; origin: DesignManifest["origin"] }> = [
    ...[...new Set(siteUrls)].map((url, i) => ({
      url,
      origin: (i === 0 ? "owner-site" : "apex") as DesignManifest["origin"],
    })),
    ...registryUrls.map((url) => ({ url, origin: "registry" as const })),
    ...repoUrls.map((url) => ({ url, origin: "repo-local" as const })),
  ];

  for (const { url, origin } of attempts) {
    const doc = await tryFetchMarkdown(url);
    if (!doc) continue;

    const manifest = parseDesignMarkdown(doc.body, doc.url);
    if (!manifest.ok && manifest.pointers.length === 0) continue;

    // A pointer file parses as "ok: false, colours: 0" but is still the right
    // document — it just delegates. Chase before deciding it is a dead end.
    const resolved = await chasePointers(manifest);
    if (!resolved.ok) continue;

    return applyCurated({ ...resolved, origin }, owner);
  }

  // Nothing published anything usable — synthesise from the curated seed, or
  // fall through to a name-derived hue in deriveIssueTheme.
  return applyCurated(emptyManifest(), owner);
}

function emptyManifest(): DesignManifest {
  return {
    ok: false,
    origin: "name-hash",
    sourceUrl: null,
    format: "none",
    name: null,
    description: null,
    colors: [],
    fonts: [],
    radiusPx: null,
    voice: { words: [], quotes: [], summary: null },
    pointers: [],
    warnings: [],
  };
}

/**
 * Overlay the hand-verified seed. This is what rescues brands whose published
 * `primary` is black or white — we keep their document's fonts, voice and
 * radius, but seed the hue from a colour we know actually represents them.
 */
function applyCurated(manifest: DesignManifest, owner: string): DesignManifest {
  const curated = curatedFor(owner);
  if (!curated) return manifest;

  const seed = parseColor(curated.color);
  const colors = [...manifest.colors];

  if (seed) {
    const override: BrandColor = {
      name: "brand",
      key: "curated-brand",
      raw: curated.color,
      hex: formatHex({ ...seed, alpha: 1 }),
      alpha: 1,
      oklch: seed,
      role: "accent",
      usage: "Curated brand seed",
      scheme: null,
      source: "frontmatter",
      // Above any parsed token, so seedFromColors always prefers it.
      confidence: 1.5,
    };
    colors.unshift(override);
  }

  if (curated.ink && !colors.some((c) => c.role === "primary")) {
    const ink = parseColor(curated.ink);
    if (ink) {
      colors.push({
        name: "ink",
        key: "curated-ink",
        raw: curated.ink,
        hex: formatHex({ ...ink, alpha: 1 }),
        alpha: 1,
        oklch: ink,
        role: "primary",
        usage: "Masthead logotype",
        scheme: null,
        source: "frontmatter",
        confidence: 1.4,
      });
    }
  }

  const fonts = [...manifest.fonts];
  const addFont = (family: string | undefined, role: "display" | "body" | "mono") => {
    if (family && !fonts.some((f) => f.role === role)) {
      fonts.push({ family, stack: [family], role, source: "frontmatter" });
    }
  };
  addFont(curated.displayFont, "display");
  addFont(curated.bodyFont, "body");
  addFont(curated.monoFont, "mono");

  return {
    ...manifest,
    ok: true,
    origin: manifest.ok ? manifest.origin : "curated",
    colors,
    fonts,
    radiusPx: manifest.radiusPx ?? curated.radiusPx ?? null,
  };
}

/**
 * Convenience: resolve and derive in one call.
 *
 * Its own cache scope, tagged with the owner and with every repository whose
 * local `design.md` it consulted, so the chain is invalidated by the same
 * webhook that invalidates the book — and so two books by the same owner cost
 * one design resolution rather than two (the chain can make up to four
 * `git/trees` calls, which is most of the gap between the documented "two API
 * calls per book" and the three-to-four measured).
 */
export async function getIssueTheme(sources: DesignSources): Promise<{
  manifest: DesignManifest;
  theme: IssueTheme;
}> {
  "use cache";
  cacheLife("design");
  cacheTag("design", ownerTag(sources.owner), ...repoTagsOf(sources.repoLocalUrls));

  const manifest = await resolveDesignManifest(sources);
  return { manifest, theme: deriveIssueTheme(sources.owner, manifest) };
}

/** `raw.githubusercontent.com/<owner>/<repo>/…` → the book's revalidation tag. */
function repoTagsOf(urls: string[] | undefined): string[] {
  const tags = new Set<string>();
  for (const url of urls ?? []) {
    const m = /^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\//i.exec(url);
    if (m) tags.add(repoTag(m[1], m[2]));
  }
  return [...tags];
}
