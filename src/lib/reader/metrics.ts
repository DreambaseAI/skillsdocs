/**
 * Per-family font metrics — measured, not remembered.
 *
 * ## How these numbers were produced
 *
 * Every value below was read out of the **woff2 files this app actually
 * ships**: `.next/static/media/*.woff2`, which is what `next/font/google`
 * downloaded from `fonts.gstatic.com` at build time. Measuring the upstream
 * TTFs in `github.com/google/fonts` would have been easier and wrong — Google's
 * delivery subsetter does not serve the same font it stores (see `caps`).
 *
 * Method, with `fontTools 4.63.0` + `brotli`:
 *
 * 1. Group every `.woff2` by name ID 1 and pick, per family, the upright chunk
 *    with full coverage of the measurement sample.
 * 2. **Instantiate the variable font at the reading instance** —
 *    `wght = 400`, `opsz = 19` (clamped into each axis range), other axes at
 *    their default — with `fontTools.varLib.instancer`. This matters: several
 *    of these fonts default to a weight nobody reads at (Public Sans defaults
 *    to Thin 100, Atkinson Mono to ExtraLight 200), and `hmtx` advances are
 *    per-instance.
 * 3. `avgChar` = Σ(advance × frequency) ÷ Σ(frequency) ÷ unitsPerEm over a
 *    1,900-character English prose sample written in the register this product
 *    actually renders — technical editorial writing about skill files, spaces
 *    included. Zero characters were missing from any family's cmap.
 *    **This is not the width of `0`.** The ratio between the two spans 1.000
 *    (the monos) to 1.482 (Atkinson), which is exactly why `ch` is banned.
 * 4. `xHeight` = `OS/2.sxHeight ÷ upem`, `capHeight` = `OS/2.sCapHeight ÷ upem`,
 *    both cross-checked against the outline bounds of `x` and `H` through a
 *    `BoundsPen`. Every family agreed to within its overshoot.
 * 5. `caps` = the intersection of `{smcp, onum}` with the union of every GSUB
 *    and GPOS feature tag present across all of that family's shipped chunks.
 *
 * The measured `xHeight` values reproduce ARCHITECTURE §5.4's table exactly,
 * and `sizeMult` is derived from them by the rule stated there.
 *
 * ## Why every `caps` is empty
 *
 * The upstream binaries do have small caps: `Literata[opsz,wght].ttf` from
 * `google/fonts` reports `smcp c2sc onum lnum zero ss01 ss02 …`. The file
 * `fonts.gstatic.com` serves for the same family reports
 * `ccmp dnom frac kern liga locl mark numr pnum tnum` and retains **zero**
 * small-cap or oldstyle glyphs — verified by fetching
 * `css2?family=Literata:opsz,wght@7..72,400` with a Chrome user agent and
 * inspecting the woff2 it points at, and confirmed identical to the bytes in
 * `.next/static/media`.
 *
 * So under the current loading strategy — `next/font/google`, which is the one
 * ARCHITECTURE §5.4 mandates — **no face we serve can do real small caps or
 * real oldstyle figures.** Advertising them would produce exactly the failure
 * the spec warns about: the browser synthesises small caps by scaling capitals,
 * which looks anaemic and is worse than not asking.
 *
 * `CAPS_UPSTREAM` records what the full binaries carry, so that if the fonts
 * are ever self-hosted from the OFL sources this table can be switched over
 * with evidence rather than optimism.
 */

/** One family's measured metrics. */
export interface FontMetrics {
  /** Font id from `lib/fonts.ts`. */
  id: string;
  /**
   * Average advance width as a fraction of the em, over English prose.
   * Multiply by CPL and by `1em` to get the measure.
   */
  avgChar: number;
  /** x-height normalisation factor, clamped to [0.90, 1.15]. */
  sizeMult: number;
  /** `OS/2.sxHeight ÷ unitsPerEm`. */
  xHeight: number;
  /** `OS/2.sCapHeight ÷ unitsPerEm`. Drives the drop-cap float fallback. */
  capHeight: number;
  /**
   * OpenType features safe to request on this face, as a `font-feature-settings`
   * -style token list. Empty where the shipped binary lacks them.
   */
  caps: string;
  /** Advance of `0`. Kept only to document how far off `1ch` is. */
  zeroWidth: number;
}

/** The x-height every other family is scaled toward. */
const X_HEIGHT_TARGET = 0.5;
const SIZE_MULT_MIN = 0.9;
const SIZE_MULT_MAX = 1.15;

/**
 * The clamped, 0.005-rounded multiplier that makes "19px" mean the same
 * apparent size in every family. Exported so the table below can be checked
 * against its own inputs rather than trusted.
 */
export function sizeMultFor(xHeight: number): number {
  const raw = X_HEIGHT_TARGET / xHeight;
  const clamped = Math.min(SIZE_MULT_MAX, Math.max(SIZE_MULT_MIN, raw));
  return Math.round(clamped * 200) / 200;
}

/**
 * Literata is the reference face and the default, so its multiplier is pinned
 * to exactly 1. Measured, it is 0.985 — a 1.5% correction nobody asked for,
 * applied to the one family where "19px" must mean 19px.
 */
const REFERENCE_ID = "literata";

const measured = (
  id: string,
  avgChar: number,
  xHeight: number,
  capHeight: number,
  zeroWidth: number,
  caps = "",
): FontMetrics => ({
  id,
  avgChar,
  sizeMult: id === REFERENCE_ID ? 1 : sizeMultFor(xHeight),
  xHeight,
  capHeight,
  caps,
  zeroWidth,
});

/** All fifteen faces in `lib/fonts.ts`, keyed by font id. */
export const FONT_METRICS: Record<string, FontMetrics> = {
  literata: measured("literata", 0.4694, 0.508, 0.703, 0.58),
  "source-serif": measured("source-serif", 0.4713, 0.475, 0.67, 0.529),
  newsreader: measured("newsreader", 0.3984, 0.426, 0.67, 0.551),
  "eb-garamond": measured("eb-garamond", 0.3732, 0.4, 0.65, 0.48),
  "crimson-pro": measured("crimson-pro", 0.3926, 0.4199, 0.5732, 0.5654),
  lora: measured("lora", 0.4612, 0.5, 0.7, 0.621),
  fraunces: measured("fraunces", 0.4571, 0.482, 0.7, 0.647),
  "instrument-serif": measured("instrument-serif", 0.3338, 0.51, 0.72, 0.46),
  geist: measured("geist", 0.4603, 0.53, 0.71, 0.663),
  inter: measured("inter", 0.4705, 0.5459, 0.7275, 0.6309),
  "public-sans": measured("public-sans", 0.46, 0.517, 0.723, 0.612),
  "geist-mono": measured("geist-mono", 0.6, 0.53, 0.71, 0.6),
  "jetbrains-mono": measured("jetbrains-mono", 0.6, 0.55, 0.73, 0.6),
  atkinson: measured("atkinson", 0.4374, 0.496, 0.668, 0.648),
  "atkinson-mono": measured("atkinson-mono", 0.632, 0.496, 0.668, 0.632),
};

/**
 * What the OFL source binaries carry, from `github.com/google/fonts`. Not what
 * we serve — see the note at the top of this file. Present so the shipped
 * `caps` values can be re-derived rather than re-guessed if the loading
 * strategy ever changes.
 */
export const CAPS_UPSTREAM: Record<string, string> = {
  literata: "smcp onum",
  "source-serif": "smcp onum",
  newsreader: "",
  "eb-garamond": "smcp onum",
  "crimson-pro": "onum",
  lora: "",
  fraunces: "",
  "instrument-serif": "",
  geist: "",
  inter: "",
  "public-sans": "onum",
  "geist-mono": "",
  "jetbrains-mono": "",
  atkinson: "",
  "atkinson-mono": "",
};

/** Metrics for a font id, falling back to the reference face. */
export function metricsFor(id: string): FontMetrics {
  return FONT_METRICS[id] ?? FONT_METRICS[REFERENCE_ID];
}

/**
 * The rendered measure, in CSS pixels, for a given family / size / CPL.
 *
 * The panel uses this to tell the reader what a slider is about to do before
 * they move it, and the tests use it to prove that switching families holds
 * the character count still rather than the pixel width.
 */
export function measurePx(fontId: string, sizeStepPx: number, cpl: number): number {
  const m = metricsFor(fontId);
  return cpl * m.avgChar * sizeStepPx * m.sizeMult;
}

/** Apparent size: the step the reader picked, corrected for x-height. */
export function renderedSizePx(fontId: string, sizeStepPx: number): number {
  return sizeStepPx * metricsFor(fontId).sizeMult;
}

/**
 * The auto leading curve from ARCHITECTURE §5.4, in JS.
 *
 * `lh_px = 7.84 + 1.186 × size_px`, i.e. leading grows more slowly than size,
 * so the *ratio* falls: 1.60 at 19px, 1.35 at 48px. `0.49rem` in the CSS is the
 * same 7.84px at a 16px root.
 */
export function autoLineHeight(renderedPx: number): number {
  return (0.49 * 16 + 1.186 * renderedPx) / renderedPx;
}
