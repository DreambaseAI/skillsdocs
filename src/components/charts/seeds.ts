/**
 * Issue theme → canvas-ready chart seeds. Owner: WS-7.
 *
 * **This module must only be imported from a server component.** It pulls in
 * `lib/color`, which is ~350 lines of OKLab maths that has no business in a
 * client bundle. Resolve once on the server, pass the result as a prop.
 *
 * Why it exists at all: the dither charts paint per-pixel through
 * `ctx.fillStyle`. A canvas cannot read a CSS custom property, so
 * `--issue-chart-1` is worthless to them — the colours have to arrive as
 * literal numbers. `IssueTheme.chartLight` / `chartDark` are OKLCH strings, so
 * this converts each to the `{ fill, line, star }` triple that `palette.ts`
 * calls a `Seed` and hands both mode sets to the client, which picks one at
 * paint time. See ARCHITECTURE §6.3 patch 1 and decision log #15.
 */

import type { Rgb as DitherRgb, Seed } from "@/components/dither-kit/palette";
import { gamutMap, type Oklch, oklchToRgb, parseColor } from "@/lib/color";
import type { IssueTheme } from "@/lib/design/types";

export type ChartScheme = "light" | "dark";

/** Both mode sets, resolved. Serializable — safe to pass to a client component. */
export interface ChartSeeds {
  light: Seed[];
  dark: Seed[];
}

/**
 * Lightness offsets for the two accessory tones in each seed.
 *
 * `line` and `star` are only used by `<Dot>` markers and the sparkle field, and
 * upstream derives both by lightening — which is correct on the dark ground
 * dither-kit was designed for and invisible on light paper. So the offsets flip
 * sign with the mode: both tones move *away* from the paper, never toward it.
 */
const TONE_SHIFT: Record<ChartScheme, { line: number; star: number }> = {
  light: { line: -0.12, star: -0.2 },
  dark: { line: 0.13, star: 0.21 },
};

/** Fallback when a theme string fails to parse — the pack's own neutral grey. */
const GREY: Seed = {
  fill: [92, 92, 100],
  line: [140, 140, 150],
  star: [165, 165, 175],
};

function toRgb255(color: Oklch): DitherRgb {
  const { r, g, b } = oklchToRgb(gamutMap(color));
  return [
    Math.round(Math.min(1, Math.max(0, r)) * 255),
    Math.round(Math.min(1, Math.max(0, g)) * 255),
    Math.round(Math.min(1, Math.max(0, b)) * 255),
  ];
}

/** One OKLCH string → one canvas seed, toned for the given ground. */
export function seedFromColor(css: string, scheme: ChartScheme): Seed {
  const base = parseColor(css);
  if (!base) return GREY;
  const shift = TONE_SHIFT[scheme];
  const at = (dl: number) =>
    toRgb255({ ...base, l: Math.min(0.97, Math.max(0.06, base.l + dl)) });
  return { fill: toRgb255(base), line: at(shift.line), star: at(shift.star) };
}

/**
 * Resolve a whole issue theme. Call this in a server component and pass the
 * result down; never call it in a `"use client"` module.
 */
export function chartSeedsFromTheme(theme: IssueTheme): ChartSeeds {
  return {
    light: theme.chartLight.map((c) => seedFromColor(c, "light")),
    dark: theme.chartDark.map((c) => seedFromColor(c, "dark")),
  };
}

/** Series `index`, wrapping when a chart has more series than the theme has tones. */
export function seedAt(
  seeds: ChartSeeds,
  scheme: ChartScheme,
  index: number,
): Seed {
  const set = seeds[scheme];
  if (set.length === 0) return GREY;
  return set[((index % set.length) + set.length) % set.length];
}

/**
 * The CSS custom property carrying the same colour, for DOM chrome (legend
 * swatches, HCM keys). The DOM *can* read variables, and using them there keeps
 * legends in step with the rest of the page during a theme swap — the canvas is
 * the only surface that needs the resolved numbers.
 */
export function chartVar(index: number, count = 5): string {
  return `var(--issue-chart-${(index % count) + 1})`;
}
