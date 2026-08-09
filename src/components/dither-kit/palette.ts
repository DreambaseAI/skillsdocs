/**
 * Vendored from dither-kit — MIT.
 *
 *   Project:  dither-kit
 *   Author:   ripgrim (Boring Software Inc)
 *   Upstream: https://github.com/Boring-Software-Inc/dither-kit
 *   Registry: https://www.tripwire.sh/r/core.json
 *   Licence:  MIT
 *
 * The registry JSON carries no `license` field and the upstream repo has no
 * LICENSE *file*, which is why this header is written by hand: MIT is declared
 * in the monorepo root package.json that contains the registry sources, and in
 * the published @dither-kit/cli and @dither-kit/registry-core packages. See
 * docs/ARCHITECTURE.md §11, "Risk 2 — dither-kit licensing".
 *
 * Local modifications by WS-7 are marked with a `WS-7:` comment.
 */
export type Rgb = [number, number, number]

export type DitherColor =
  | "green"
  | "blue"
  | "purple"
  | "pink"
  | "orange"
  | "red"
  | "grey"

export type Seed = { fill: Rgb; line: Rgb; star: Rgb }

// Each seed: the area-fill hue, the bright series line, and the star sparkle.
export const PALETTE: Record<DitherColor, Seed> = {
  green: { fill: [40, 210, 110], line: [150, 255, 180], star: [200, 255, 220] },
  blue: { fill: [53, 143, 243], line: [150, 200, 255], star: [205, 228, 255] },
  purple: {
    fill: [150, 110, 255],
    line: [200, 175, 255],
    star: [225, 210, 255],
  },
  pink: { fill: [240, 90, 190], line: [255, 170, 220], star: [255, 205, 235] },
  orange: {
    fill: [255, 150, 50],
    line: [255, 195, 130],
    star: [255, 220, 175],
  },
  red: { fill: [240, 70, 70], line: [255, 150, 140], star: [255, 195, 185] },
  // No-data: a muted grey so empty metrics read as "nothing here".
  grey: { fill: [92, 92, 100], line: [140, 140, 150], star: [165, 165, 175] },
}

export const rgb = ([r, g, b]: Rgb, k = 1, a = 1) =>
  `rgba(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)},${a})`

export const seedOfColor = (color: DitherColor): Seed => PALETTE[color]

export const isDitherColor = (value: unknown): value is DitherColor =>
  typeof value === "string" && value in PALETTE

/* ─────────────────────────────────────────────────────── WS-7: seed passthrough
 *
 * Upstream `ChartConfig` is `{ color: DitherColor }` — a closed seven-name
 * union with no hex, no CSS variable, no theme token. That is not an oversight:
 * every chart in this pack paints per-pixel through `ctx.fillStyle`, and a
 * canvas cannot resolve a CSS custom property. So the colours have to arrive as
 * concrete numbers.
 *
 * Our per-issue accents are derived per owner at request time, so the seven
 * names cannot express them. `ChartSeed` widens the union by exactly one arm:
 * a caller may pass a literal `Seed` (three RGB triples), which `seedOf` hands
 * straight through. `IssueTheme.chartLight` / `chartDark` are resolved to those
 * triples **on the server** (see `components/charts/seeds.ts`) and passed in as
 * props, so no colour maths reaches the client bundle.
 *
 * ARCHITECTURE §6.3 patch 1 / decision log #15.
 */

/** A named dither colour, or a literal seed resolved by the caller. */
export type ChartSeed = DitherColor | Seed

export const isSeed = (value: unknown): value is Seed =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as Seed).fill)

/** Resolve either arm of {@link ChartSeed}. Literal seeds pass through. */
export const seedOf = (value: ChartSeed | undefined): Seed => {
  if (isSeed(value)) return value
  return PALETTE[isDitherColor(value) ? value : "grey"]
}
