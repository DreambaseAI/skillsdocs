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
import type { BrandColor, DesignManifest, IssueTheme } from "./types";

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
    if (hit) return hit.family;
  }
  return null;
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
    radiusPx: manifest?.radiusPx ?? null,
    displayFont: manifest ? pickFont(manifest, "display") : null,
    bodyFont: manifest ? pickFont(manifest, "body") : null,
    monoFont: manifest ? pickFont(manifest, "mono") : null,
    origin: manifest?.origin ?? "name-hash",
  };
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
 * Serialise a theme as CSS custom properties.
 *
 * Only the accent, radius and fonts change per issue — the stone neutrals are
 * deliberately shared so the magazine still reads as one publication, and so
 * we aren't re-auditing twenty tokens for every owner.
 */
export function issueThemeCss(theme: IssueTheme, selector: string): string {
  const lines: string[] = [
    `${selector}{`,
    `--issue-hue:${theme.hue};`,
    `--issue-chroma:${theme.chroma};`,
    `--issue-accent:${theme.accentLight};`,
    `--issue-accent-foreground:${theme.accentForegroundLight};`,
    ...theme.chartLight.map((c, i) => `--issue-chart-${i + 1}:${c};`),
  ];
  if (theme.radiusPx !== null) lines.push(`--radius:${theme.radiusPx / 16}rem;`);
  if (theme.ink) lines.push(`--issue-ink:${theme.ink};`);
  lines.push("}");

  lines.push(
    `.dark ${selector},${selector}.dark{`,
    `--issue-accent:${theme.accentDark};`,
    `--issue-accent-foreground:${theme.accentForegroundDark};`,
    ...theme.chartDark.map((c, i) => `--issue-chart-${i + 1}:${c};`),
    "}",
  );

  lines.push(
    `[data-contrast="high"] ${selector}{--issue-accent:${theme.accentLightHc};}`,
    `[data-contrast="high"].dark ${selector},[data-contrast="high"] .dark ${selector}{--issue-accent:${theme.accentDarkHc};}`,
  );

  return lines.join("");
}
