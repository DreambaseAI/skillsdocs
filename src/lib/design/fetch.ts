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

import { formatHex, parseColor } from "../color";
import { looksLikeMarkdown, parseDesignMarkdown } from "./parse";
import { curatedFor, REGISTRY_RAW } from "./registry";
import { deriveIssueTheme } from "./theme";
import type { BrandColor, DesignManifest, IssueTheme } from "./types";

const TIMEOUT_MS = 6000;
const MIN_BYTES = 64;
const MAX_BYTES = 512 * 1024;

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
      next: { revalidate: DESIGN_REVALIDATE },
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
    if (!manifest.ok) continue;

    return applyCurated({ ...manifest, origin }, owner);
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

/** Convenience: resolve and derive in one call. */
export async function getIssueTheme(sources: DesignSources): Promise<{
  manifest: DesignManifest;
  theme: IssueTheme;
}> {
  const manifest = await resolveDesignManifest(sources);
  return { manifest, theme: deriveIssueTheme(sources.owner, manifest) };
}
