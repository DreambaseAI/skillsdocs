/**
 * Per-owner brand accents on the directory, resolved synchronously.
 *
 * The book pages resolve a full `IssueTheme` over the network (design.md, the
 * owner's site, the community registry) and emit it as a `<style>` block. The
 * home page cannot: it lists ~82 distinct owners, and 82 network resolutions
 * would be both slow and pointless for a card that only needs one colour.
 *
 * So the directory uses the two tiers of the chain that are free — the curated
 * seed map, and the FNV-1a hue hash that terminates it — and runs them through
 * the same `deriveIssueTheme` the book pages use. Same maths, same contrast
 * guarantees, no network. An owner therefore keeps the same identity between
 * the index and their issue, unless their own `design.md` says otherwise.
 *
 * Delivery is inline custom properties rather than a `<style>` block because
 * the full serialised form for 82 owners measures 76 KB, which is not
 * something to put in the head of a landing page. Two indirection variables
 * per element cost ~120 bytes and only for the cards actually rendered.
 */

import type { CSSProperties } from "react";
import { formatHex, parseColor } from "@/lib/color";
import { curatedFor } from "@/lib/design/registry";
import { deriveIssueTheme } from "@/lib/design/theme";
import type { BrandColor, DesignManifest } from "@/lib/design/types";

export interface IssueAccent {
  /** `>= 4.5:1` on light paper. */
  light: string;
  /** `>= 4.5:1` on dark paper. */
  dark: string;
  lightHc: string;
  darkHc: string;
  foregroundLight: string;
  foregroundDark: string;
}

/**
 * `deriveIssueTheme` does real colour maths (gamut mapping, a contrast solve
 * per tone). Eighty-two owners rendered several times per page is enough
 * repetition to be worth a module-level memo; the input is a login and the
 * output is deterministic, so the cache can never go stale within a process.
 */
const cache = new Map<string, IssueAccent>();

function curatedManifest(owner: string): DesignManifest | null {
  const curated = curatedFor(owner);
  const seed = curated ? parseColor(curated.color) : null;
  if (!curated || !seed) return null;

  const color: BrandColor = {
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
    confidence: 1.5,
  };

  return {
    ok: true,
    origin: "curated",
    sourceUrl: null,
    format: "frontmatter",
    name: null,
    description: null,
    colors: [color],
    fonts: [],
    radiusPx: null,
    voice: { words: [], quotes: [], summary: null },
    pointers: [],
    warnings: [],
  };
}

export function ownerAccent(owner: string): IssueAccent {
  const key = owner.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;

  const theme = deriveIssueTheme(owner, curatedManifest(owner));
  const accent: IssueAccent = {
    light: theme.accentLight,
    dark: theme.accentDark,
    lightHc: theme.accentLightHc,
    darkHc: theme.accentDarkHc,
    foregroundLight: theme.accentForegroundLight,
    foregroundDark: theme.accentForegroundDark,
  };
  cache.set(key, accent);
  return accent;
}

/**
 * Inline properties for one owner's element.
 *
 * Note what is *not* set here: `--issue-accent` itself. An inline declaration
 * outranks every stylesheet rule short of `!important`, which would make the
 * contrast axis unable to swap in the high-contrast tone. The accent is
 * published as two neutral inputs and `IssueAccentRules` picks between them.
 */
export function ownerAccentStyle(owner: string): CSSProperties {
  const accent = ownerAccent(owner);
  return {
    "--accent-a": `light-dark(${accent.light}, ${accent.dark})`,
    "--accent-b": `light-dark(${accent.lightHc}, ${accent.darkHc})`,
    "--accent-fg": `light-dark(${accent.foregroundLight}, ${accent.foregroundDark})`,
  } as CSSProperties;
}

/**
 * The two rules that turn those inputs into the real issue tokens.
 *
 * Rendered once per page. React 19 hoists a `<style>` carrying `href` and
 * `precedence` into the head and de-duplicates it by href, so mounting this
 * from several places is safe.
 */
export function IssueAccentRules() {
  return (
    <style href="issue-accent-rules" precedence="default">
      {
        "[data-issue]{--issue-accent:var(--accent-a);--issue-accent-foreground:var(--accent-fg)}" +
          '[data-contrast="high"] [data-issue]{--issue-accent:var(--accent-b)}'
      }
    </style>
  );
}
