/**
 * Types for `design.md` — the emerging sibling to `llms.txt`: a brand's design
 * system published as plain markdown for agents to read.
 *
 * There is no RFC and no JSON Schema for it, so everything here is tolerant.
 * A survey of the 74-brand VoltAgent/awesome-design-md registry plus the live
 * files at vercel.com, resend.com, clerk.com and dreambase.com found four
 * distinct shapes; `DesignManifest.format` records which one we matched.
 */

import type { Oklch } from "../color";

export type TokenSource =
  | "frontmatter"
  | "css-fence"
  | "data-fence"
  | "table"
  | "bullet"
  | "prose";

export type ColorRole =
  | "primary"
  | "accent"
  | "background"
  | "surface"
  | "foreground"
  | "muted"
  | "border"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "unknown";

export interface BrandColor {
  /** Token name as authored: "primary", "purple-500", "Spotify Green". */
  name: string;
  /** Slugified, deduped key. */
  key: string;
  /** The literal we matched. */
  raw: string;
  hex: string;
  alpha: number;
  oklch: Oklch;
  role: ColorRole;
  /** Trailing prose or table cell: "Primary CTA, logomark". */
  usage: string | null;
  /** Set when the value came from `light-dark()` or a mode-specific block. */
  scheme: "light" | "dark" | null;
  source: TokenSource;
  /** 0–1. Frontmatter beats a bare hex found in prose. */
  confidence: number;
}

export type FontRole = "display" | "heading" | "body" | "mono" | "unknown";

export interface BrandFont {
  family: string;
  /** Full fallback list as authored. */
  stack: string[];
  role: FontRole;
  source: TokenSource;
}

export interface BrandVoice {
  /** Adjectives mined from the description and any voice section. */
  words: string[];
  /** Short verbatim sentences worth quoting on the masthead. */
  quotes: string[];
  summary: string | null;
}

export type DesignFormat =
  | "frontmatter"
  | "prose"
  | "tables"
  | "pointer"
  | "mixed"
  | "none";

export interface DesignManifest {
  ok: boolean;
  /** Which tier of the resolution chain produced this. */
  origin:
    | "curated"
    | "owner-site"
    | "apex"
    | "registry"
    | "repo-local"
    | "name-hash";
  sourceUrl: string | null;
  format: DesignFormat;
  name: string | null;
  description: string | null;
  colors: BrandColor[];
  fonts: BrandFont[];
  radiusPx: number | null;
  voice: BrandVoice;
  /** URLs the document delegated to. */
  pointers: string[];
  warnings: string[];
}

/** The contrast-safe theme derived from a manifest, ready to emit as CSS. */
export interface IssueTheme {
  /** Owner login this theme belongs to. */
  owner: string;
  /** Seed hue in degrees. */
  hue: number;
  /** Seed chroma, capped. */
  chroma: number;
  /** Accent for light mode — guaranteed >= 4.5:1 on light paper. */
  accentLight: string;
  /** Accent for dark mode — guaranteed >= 4.5:1 on dark paper. */
  accentDark: string;
  accentForegroundLight: string;
  accentForegroundDark: string;
  /** High-contrast variants, >= 7:1. */
  accentLightHc: string;
  accentDarkHc: string;
  /** The brand's own primary, used verbatim for the masthead logotype only. */
  ink: string | null;
  /** Categorical series for charts, one per mode. */
  chartLight: string[];
  chartDark: string[];
  radiusPx: number | null;
  displayFont: string | null;
  bodyFont: string | null;
  monoFont: string | null;
  origin: DesignManifest["origin"];
}
