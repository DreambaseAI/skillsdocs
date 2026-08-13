/**
 * Turns a parsed `design.md` into a contrast-safe per-issue theme.
 *
 * Two findings drive this file, both measured over the 63 brands in the
 * VoltAgent registry that publish a hex `colors.primary`:
 *
 * 1. **46% of brand primaries are achromatic.** Vercel's is `#171717`, Figma's
 *    is `#000000`, Resend's is `#fcfdff`. Seeding a hue from `primary` gives a
 *    grey magazine. We seed from the highest-chroma token in the document.
 *
 * 2. **No single accent can pass AA on both stone backgrounds.** Against
 *    stone-50 (relative luminance 0.9553) and stone-950 (0.0031), 4.5:1 on
 *    both would require luminance >= 0.1892 and <= 0.1734 simultaneously. The
 *    best any one colour achieves is 4.35:1. So every issue ships two tones.
 *
 * The lightness constants below were chosen by sweeping all 360 hues at
 * chroma <= 0.19: L=0.52 clears AA in light mode for every hue (the binding
 * case is hue 144, yellow-green), and L=0.70 clears it in dark mode (binding
 * case hue 351). `deriveIssueTheme.test.ts` re-verifies this on every run.
 */

import {
  contrastRatio,
  ensureContrast,
  formatOklch,
  gamutMap,
  hueFromString,
  parseColor,
  WCAG,
  type Oklch,
} from "../color";
import { LIMITS, sanitizeColor, sanitizeFontFamily } from "./parse";
import type {
  BrandColor,
  DesignManifest,
  FontResolution,
  IssueTheme,
  ResolvedFont,
} from "./types";

/** Paper colours the accents must sit on. Kept in sync with globals.css. */
export const PAPER = {
  light: parseColor("oklch(0.985 0.002 85)")!,
  dark: parseColor("oklch(0.171 0.004 60)")!,
  lightHc: parseColor("oklch(1 0 0)")!,
  darkHc: parseColor("oklch(0.09 0 0)")!,
} as const;

/** Verified sweep constants — see the module comment. */
const L_LIGHT = 0.52;
const L_DARK = 0.7;
const C_MAX = 0.19;
/** Below this, a colour is grey and carries no usable hue. */
const CHROMA_FLOOR = 0.04;

/**
 * Contrast headroom requested above the nominal WCAG threshold.
 *
 * `formatOklch` rounds L to four places and H to two so the emitted CSS stays
 * readable, and that rounding can move the ratio by a few thousandths. Solving
 * for exactly 4.5 therefore ships values that measure 4.499. Solving for
 * 4.5 + margin means the rounded value is still above the line.
 */
const CONTRAST_MARGIN = 0.05;

/**
 * Pick the hue to build the issue around: the most chromatic token in the
 * document, preferring ones the brand labelled accent/primary when chroma ties.
 */
export function seedFromColors(colors: BrandColor[]): Oklch | null {
  const chromatic = colors.filter((c) => c.oklch.c >= CHROMA_FLOOR && c.alpha > 0.5);
  if (chromatic.length === 0) return null;

  // A hand-verified curated seed is an editorial decision and outranks
  // anything parsed. Without this, Dreambase — whose brand is unambiguously
  // green (#14EC77) — was themed magenta, because some higher-chroma token
  // deeper in its design.md won on raw chroma alone. Curated entries carry
  // confidence > 1 precisely so they cannot lose that comparison.
  const curated = chromatic.filter((c) => c.confidence > 1);
  if (curated.length > 0) {
    return [...curated].sort((a, b) => b.confidence - a.confidence)[0].oklch;
  }

  const weight = (c: BrandColor) => {
    let w = c.oklch.c;
    if (c.role === "accent" || c.role === "primary") w += 0.02;
    // Semantic status colours are not the brand's voice.
    if (c.role === "success" || c.role === "warning" || c.role === "danger") w -= 0.06;
    if (c.role === "info") w -= 0.03;
    return w;
  };

  return [...chromatic].sort((a, b) => weight(b) - weight(a))[0].oklch;
}

/** The brand's literal primary, for the masthead logotype only. */
function inkFrom(colors: BrandColor[]): string | null {
  const primary = colors.find((c) => c.role === "primary") ?? colors[0];
  return primary?.hex ?? null;
}

function toneAt(hue: number, chroma: number, lightness: number): Oklch {
  return gamutMap({ l: lightness, c: Math.min(chroma, C_MAX), h: hue, alpha: 1 });
}

/**
 * Build a categorical chart series by rotating hue away from the brand seed.
 * Rotations are uneven so adjacent series stay distinguishable, and every
 * entry is held at the mode's accent lightness so they read as one family.
 */
function chartSeries(hue: number, chroma: number, lightness: number): string[] {
  const ROTATIONS = [0, 168, 62, 250, 115];
  return ROTATIONS.map((delta, i) => {
    // Alternate chroma slightly so hue-blind readers still get a value cue.
    const c = Math.min(chroma, C_MAX) * (i % 2 === 0 ? 1 : 0.72);
    const l = lightness + (i % 3) * 0.05;
    return formatOklch(toneAt((hue + delta) % 360, c, Math.min(l, 0.88)));
  });
}

const FONT_ROLE_ORDER = {
  display: ["display", "heading", "body"],
  body: ["body", "heading", "display"],
  mono: ["mono"],
} as const;

function pickFont(manifest: DesignManifest, want: keyof typeof FONT_ROLE_ORDER) {
  for (const role of FONT_ROLE_ORDER[want]) {
    const hit = manifest.fonts.find((f) => f.role === role);
    if (hit) return sanitizeFontFamily(hit.family);
  }
  return null;
}

/* ------------------------------------------------------- brand fonts */

/**
 * Match a brand family against the faces we already self-host.
 *
 * The rule that governs this whole section: **we never inject a runtime
 * `<link>` to fonts.googleapis.com.** It would add a third-party origin to the
 * CSP, forfeit `next/font`'s fallback-metric generation (our largest CLS
 * lever), and put an attacker-controlled string into `<head>`. A brand either
 * names a face we ship, or it gets the nearest one we do and a line in the
 * colophon saying so.
 *
 * **Why this data is mirrored instead of imported.** `lib/fonts.ts` calls
 * `next/font/google` at module scope, and those calls only exist inside a Next
 * build — importing that module from here would break `pnpm verify:contrast`
 * and every unit test, both of which run under plain Node. The mirror below is
 * held to the real catalogue by `theme.test.ts`, which imports `lib/fonts.ts`
 * with `next/font/google` mocked and fails on any drift.
 */
interface ShippedFace {
  id: string;
  label: string;
  cssVar: string;
  fallback: string;
}

const SERIF_FALLBACK = "Georgia, 'Times New Roman', serif";
const SANS_FALLBACK = "system-ui, -apple-system, 'Segoe UI', sans-serif";
const MONO_FALLBACK = "ui-monospace, SFMono-Regular, Menlo, monospace";

export const SHIPPED_FACES: ShippedFace[] = [
  { id: "literata", label: "Literata", cssVar: "--font-literata", fallback: SERIF_FALLBACK },
  { id: "source-serif", label: "Source Serif 4", cssVar: "--font-source-serif", fallback: SERIF_FALLBACK },
  { id: "newsreader", label: "Newsreader", cssVar: "--font-newsreader", fallback: SERIF_FALLBACK },
  { id: "eb-garamond", label: "EB Garamond", cssVar: "--font-eb-garamond", fallback: SERIF_FALLBACK },
  { id: "crimson-pro", label: "Crimson Pro", cssVar: "--font-crimson-pro", fallback: SERIF_FALLBACK },
  { id: "lora", label: "Lora", cssVar: "--font-lora", fallback: SERIF_FALLBACK },
  { id: "geist", label: "Geist", cssVar: "--font-geist", fallback: SANS_FALLBACK },
  { id: "inter", label: "Inter", cssVar: "--font-inter", fallback: SANS_FALLBACK },
  { id: "public-sans", label: "Public Sans", cssVar: "--font-public-sans", fallback: SANS_FALLBACK },
  { id: "atkinson", label: "Atkinson Hyperlegible", cssVar: "--font-atkinson", fallback: SANS_FALLBACK },
  { id: "geist-mono", label: "Geist Mono", cssVar: "--font-geist-mono", fallback: MONO_FALLBACK },
  { id: "jetbrains-mono", label: "JetBrains Mono", cssVar: "--font-jetbrains-mono", fallback: MONO_FALLBACK },
  { id: "atkinson-mono", label: "Atkinson Mono", cssVar: "--font-atkinson-mono", fallback: MONO_FALLBACK },
  { id: "fraunces", label: "Fraunces", cssVar: "--font-fraunces", fallback: SERIF_FALLBACK },
  { id: "instrument-serif", label: "Instrument Serif", cssVar: "--font-instrument-serif", fallback: SERIF_FALLBACK },
];

/**
 * Proprietary and unshipped families mapped to the nearest face we serve.
 * Mirrors `FONT_SUBSTITUTIONS` in `lib/fonts.ts`; parity is enforced by test.
 */
export const BRAND_FONT_SUBSTITUTIONS: Record<string, string> = {
  copernicus: "newsreader",
  tiempos: "newsreader",
  "tiempos text": "newsreader",
  "tiempos headline": "fraunces",
  "domaine display": "fraunces",
  "domaine display narrow": "fraunces",
  "suisse intl": "inter",
  "suisse int'l": "inter",
  söhne: "inter",
  sohne: "inter",
  favorit: "inter",
  styrene: "geist",
  "styrene a": "geist",
  "styrene b": "geist",
  "söhne mono": "jetbrains-mono",
  "sohne mono": "jetbrains-mono",
  commitmono: "jetbrains-mono",
  "berkeley mono": "jetbrains-mono",
  "gt america": "inter",
  "abc favorit": "inter",
  "neue haas grotesk": "inter",
  helvetica: "inter",
  "helvetica neue": "inter",
  circular: "geist",
  graphik: "inter",
};

const FACE_BY_ID = new Map(SHIPPED_FACES.map((f) => [f.id, f] as const));
const FACE_BY_LABEL = new Map(
  SHIPPED_FACES.map((f) => [f.label.toLowerCase(), f.id] as const),
);

export function shippedFace(id: string | null): ShippedFace | null {
  return id ? (FACE_BY_ID.get(id) ?? null) : null;
}

/** Trailing style qualifiers that are not part of the family's identity. */
const FAMILY_QUALIFIER = /\s+(?:variable|vf|std|lt|mt|regular|book|text)$/i;

function normaliseFamily(family: string): string {
  return family
    .toLowerCase()
    .replace(/[""'']/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(FAMILY_QUALIFIER, "");
}

/** Substitution keys longest-first, so "söhne mono" wins over "söhne". */
const SUBSTITUTION_KEYS = Object.keys(BRAND_FONT_SUBSTITUTIONS).sort(
  (a, b) => b.length - a.length,
);

export function resolveBrandFont(family: string | null): ResolvedFont | null {
  const safe = sanitizeFontFamily(family);
  if (!safe) return null;

  const key = normaliseFamily(safe);

  const exact = FACE_BY_LABEL.get(key);
  if (exact) {
    return {
      requested: safe,
      id: exact,
      label: shippedFace(exact)?.label ?? null,
      kind: "exact",
      note: null,
    };
  }

  // Exact substitution, then containment — "Resend Favorit" is Favorit, and
  // "Söhne Mono" must not be answered by the "Söhne" entry.
  const subKey = BRAND_FONT_SUBSTITUTIONS[key]
    ? key
    : (SUBSTITUTION_KEYS.find((k) => key.includes(k)) ?? null);

  if (subKey) {
    const id = BRAND_FONT_SUBSTITUTIONS[subKey];
    const face = shippedFace(id);
    return {
      requested: safe,
      id,
      label: face?.label ?? null,
      kind: "substituted",
      note: `${safe} is not available to us; set in ${face?.label ?? id}.`,
    };
  }

  return {
    requested: safe,
    id: null,
    label: null,
    kind: "unavailable",
    note: `${safe} is not a face we ship; the reader's own choice is used.`,
  };
}

function resolveFonts(manifest: DesignManifest | null): FontResolution {
  if (!manifest) return { display: null, body: null, mono: null };
  return {
    display: resolveBrandFont(pickFont(manifest, "display")),
    body: resolveBrandFont(pickFont(manifest, "body")),
    mono: resolveBrandFont(pickFont(manifest, "mono")),
  };
}

export function deriveIssueTheme(
  owner: string,
  manifest: DesignManifest | null,
): IssueTheme {
  const colors = manifest?.colors ?? [];
  const seed = seedFromColors(colors);

  // No usable hue anywhere: fall back to a stable hue derived from the name.
  // This never fails, and gives each owner a consistent identity across visits.
  const hue = seed?.h ?? hueFromString(owner);
  const chroma = Math.min(seed?.c ?? C_MAX, C_MAX);

  const accentLight = toneAt(hue, chroma, L_LIGHT);
  const accentDark = toneAt(hue, chroma, L_DARK);

  // The sweep guarantees these already pass, but a brand can seed an unusual
  // hue/chroma pair — enforce the floor rather than trusting the constants.
  const AA = WCAG.AA_TEXT + CONTRAST_MARGIN;
  const AAA = WCAG.AAA_TEXT + CONTRAST_MARGIN;
  const safeLight = ensureContrast(accentLight, PAPER.light, AA);
  const safeDark = ensureContrast(accentDark, PAPER.dark, AA);

  return {
    owner,
    hue: Math.round(hue * 100) / 100,
    chroma: Math.round(chroma * 1000) / 1000,
    accentLight: formatOklch(safeLight),
    accentDark: formatOklch(safeDark),
    accentForegroundLight: formatOklch(ensureContrast(PAPER.lightHc, safeLight, AA)),
    accentForegroundDark: formatOklch(ensureContrast(PAPER.darkHc, safeDark, AA)),
    accentLightHc: formatOklch(
      ensureContrast(toneAt(hue, chroma, L_LIGHT), PAPER.lightHc, AAA),
    ),
    accentDarkHc: formatOklch(
      ensureContrast(toneAt(hue, chroma, L_DARK), PAPER.darkHc, AAA),
    ),
    ink: inkFrom(colors),
    chartLight: chartSeries(hue, chroma, L_LIGHT),
    chartDark: chartSeries(hue, chroma, L_DARK),
    radiusPx: safeRadius(manifest?.radiusPx ?? null),
    displayFont: manifest ? pickFont(manifest, "display") : null,
    bodyFont: manifest ? pickFont(manifest, "body") : null,
    monoFont: manifest ? pickFont(manifest, "mono") : null,
    fontResolution: resolveFonts(manifest),
    origin: manifest?.origin ?? "name-hash",
  };
}

/** A radius outside this band is a parse artefact, not a brand decision. */
function safeRadius(px: number | null): number | null {
  if (px === null || !Number.isFinite(px) || px < 0 || px > 64) return null;
  return Math.round(px * 100) / 100;
}

/** Contrast report for an issue theme, used by tests and the colophon. */
export function auditIssueTheme(theme: IssueTheme) {
  const ratio = (color: string, paper: Oklch) =>
    Math.round(contrastRatio(parseColor(color)!, paper) * 100) / 100;

  return {
    light: ratio(theme.accentLight, PAPER.light),
    dark: ratio(theme.accentDark, PAPER.dark),
    lightHc: ratio(theme.accentLightHc, PAPER.lightHc),
    darkHc: ratio(theme.accentDarkHc, PAPER.darkHc),
    chartLight: theme.chartLight.map((c) => ratio(c, PAPER.light)),
    chartDark: theme.chartDark.map((c) => ratio(c, PAPER.dark)),
  };
}

/**
 * The `[data-issue="…"]` selector for an owner.
 *
 * The owner login is a path segment, which means it is whatever the request
 * URL said it was. Slugify it here rather than trusting a caller to remember:
 * an owner named `x"]{}html{display:none}[y="` would otherwise author CSS on
 * our origin.
 */
export function issueSelector(owner: string): string {
  const slug = owner.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 48);
  return `[data-issue="${slug || "unknown"}"]`;
}

/**
 * Selectors that may be handed to `issueThemeCss`.
 *
 * Braces, angle brackets, semicolons and `@` are all absent by construction,
 * so no value here can close the rule and open something else. Parentheses
 * are admitted for `:has()` scoping — they cannot terminate a declaration
 * block, start an at-rule, or open a tag, so the invariant holds.
 */
const SAFE_SELECTOR = /^[A-Za-z0-9_\-[\]="':.#>~*()\s]{1,96}$/;

/**
 * A per-book scope for the streamed theme `<style>`, immune to co-mounted
 * neighbours.
 *
 * The naive scope — the shared `.book-issue` class — has a failure mode the
 * router made real: Next keeps the previous route's tree mounted under
 * `display: none` for instant back-navigation, and a `<style>` element keeps
 * applying document-wide no matter how its container is displayed. Two books
 * mounted at once meant two rules fighting for the same class, and document
 * order (the *hidden* book, appended later) won: drill from a credited book
 * into its origin and the new page wore the old book's colours, then swapped
 * on the way back.
 *
 * `:has(style[data-issue-scope="…"])` pins each rule to the one `.book-issue`
 * div that contains its own style element — pure CSS, so it is correct in
 * SSR'd HTML before hydration and inside hidden trees where effects don't
 * run. The key is slugified exactly like `issueSelector` and the attribute
 * value is the same string, so neither side can smuggle CSS syntax.
 */
export function issueScope(fullName: string): {
  /** Goes on the `<style>` element as `data-issue-scope`. */
  key: string;
  /** Hand this to `issueThemeCss`. */
  selector: string;
} {
  const key =
    fullName.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) ||
    "unknown";
  return {
    key,
    selector: `.book-issue:has(style[data-issue-scope="${key}"])`,
  };
}

/** Custom-property name/value pairs, both already proven safe. */
type Decls = Array<[string, string]>;

function block(selector: string, decls: Decls): string {
  if (decls.length === 0) return "";
  return `${selector}{${decls.map(([k, v]) => `${k}:${v};`).join("")}}`;
}

/**
 * Serialise a theme as CSS custom properties.
 *
 * Only the accent, radius and fonts change per issue — the stone neutrals are
 * deliberately shared so the magazine still reads as one publication, and so
 * we aren't re-auditing twenty tokens for every owner.
 *
 * Every value that reaches this function came, directly or indirectly, from a
 * third-party document, so each one is re-validated here even though the
 * accents are machine-generated. Defence in depth is cheap; a stored XSS on
 * our own origin is not.
 */
export function issueThemeCss(theme: IssueTheme, selector: string): string {
  if (!SAFE_SELECTOR.test(selector)) return "";

  const colors = (values: string[], prefix: string): Decls => {
    const out: Decls = [];
    values.slice(0, 5).forEach((value, i) => {
      const safe = sanitizeColor(value);
      if (safe) out.push([`${prefix}${i + 1}`, safe]);
    });
    return out;
  };

  const light: Decls = [
    ["--issue-hue", String(Math.round(theme.hue * 100) / 100)],
    ["--issue-chroma", String(Math.round(theme.chroma * 1000) / 1000)],
  ];
  const accentLight = sanitizeColor(theme.accentLight);
  const accentFgLight = sanitizeColor(theme.accentForegroundLight);
  if (accentLight) light.push(["--issue-accent", accentLight]);
  if (accentFgLight) light.push(["--issue-accent-foreground", accentFgLight]);
  light.push(...colors(theme.chartLight, "--issue-chart-"));

  const radius = safeRadius(theme.radiusPx);
  if (radius !== null) light.push(["--radius", `${radius / 16}rem`]);
  const ink = sanitizeColor(theme.ink);
  if (ink) light.push(["--issue-ink", ink]);

  const displayFace = shippedFace(theme.fontResolution?.display?.id ?? null);

  const dark: Decls = [];
  const accentDark = sanitizeColor(theme.accentDark);
  const accentFgDark = sanitizeColor(theme.accentForegroundDark);
  if (accentDark) dark.push(["--issue-accent", accentDark]);
  if (accentFgDark) dark.push(["--issue-accent-foreground", accentFgDark]);
  dark.push(...colors(theme.chartDark, "--issue-chart-"));

  const hcLight = sanitizeColor(theme.accentLightHc);
  const hcDark = sanitizeColor(theme.accentDarkHc);

  const css = [
    block(selector, light),
    // The brand display face holds only while the reader is on the default
    // body face. Once they choose another family, `reader.css` re-points
    // `--display-font-family` at that family so titles and text share one
    // voice — a reader's explicit choice outranks the issue's branding.
    // Only ever a variable we declared ourselves — never the brand's string.
    displayFace
      ? block(`[data-reader-font="literata"] ${selector}`, [
          [
            "--display-font-family",
            `var(${displayFace.cssVar}), ${displayFace.fallback}`,
          ],
        ])
      : "",
    block(`.dark ${selector},${selector}.dark`, dark),
    hcLight
      ? block(`[data-contrast="high"] ${selector}`, [["--issue-accent", hcLight]])
      : "",
    hcDark
      ? block(
          `[data-contrast="high"].dark ${selector},[data-contrast="high"] .dark ${selector}`,
          [["--issue-accent", hcDark]],
        )
      : "",
  ].join("");

  // Cannot happen with the caps above; if it ever does, ship nothing rather
  // than a truncated rule that leaves a brace open.
  return css.length > LIMITS.css ? "" : css;
}
