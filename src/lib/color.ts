/**
 * Colour engine.
 *
 * Every issue of the magazine is themed from a brand colour lifted out of an
 * owner's `design.md`. Brand colours are chosen for logos, not for body text
 * on paper — so we can't use them raw. This module converts whatever we're
 * given into OKLCH, then adjusts lightness (perceptually, so hue and
 * saturation survive) until the result actually passes WCAG against the
 * surface it will sit on.
 *
 * OKLab conversion follows Björn Ottosson's reference implementation.
 * WCAG contrast follows WCAG 2.x relative luminance.
 */

export interface Oklch {
  /** Perceptual lightness, 0–1. */
  l: number;
  /** Chroma, 0–~0.37 in sRGB gamut. */
  c: number;
  /** Hue angle in degrees, 0–360. */
  h: number;
  /** Alpha, 0–1. */
  alpha: number;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
  alpha: number;
}

/* --------------------------------------------------------- sRGB <-> OKLab */

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

function srgbToLinear(x: number): number {
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(x: number): number {
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
}

export function rgbToOklch({ r, g, b, alpha }: Rgb): Oklch {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const c = Math.sqrt(A * A + B * B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;

  return { l: L, c, h: c < 1e-6 ? 0 : h, alpha };
}

export function oklchToRgb({ l: L, c, h, alpha }: Oklch): Rgb {
  const hr = (h * Math.PI) / 180;
  const A = c * Math.cos(hr);
  const B = c * Math.sin(hr);

  const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = L - 0.0894841775 * A - 1.291485548 * B;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r: clamp01(linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    g: clamp01(linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    b: clamp01(linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
    alpha,
  };
}

/** True when the colour survives the round-trip without channel clipping. */
export function inSrgbGamut(color: Oklch, epsilon = 0.0005): boolean {
  const { l: L, c, h } = color;
  const hr = (h * Math.PI) / 180;
  const A = c * Math.cos(hr);
  const B = c * Math.sin(hr);
  const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = L - 0.0894841775 * A - 1.291485548 * B;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const channels = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return channels.every((x) => x >= -epsilon && x <= 1 + epsilon);
}

/** Reduce chroma (never lightness) until the colour fits in sRGB. */
export function gamutMap(color: Oklch): Oklch {
  if (inSrgbGamut(color)) return color;
  let lo = 0;
  let hi = color.c;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inSrgbGamut({ ...color, c: mid })) lo = mid;
    else hi = mid;
  }
  return { ...color, c: lo };
}

/* ------------------------------------------------------------- parsing */

const NAMED: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  orange: "#ffa500",
  purple: "#800080",
  gray: "#808080",
  grey: "#808080",
  transparent: "#00000000",
};

function parseHex(hex: string): Rgb | null {
  let h = hex.replace(/^#/, "").trim();
  if (h.length === 3 || h.length === 4) {
    h = h
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  if (h.length !== 6 && h.length !== 8) return null;
  if (!/^[0-9a-f]+$/i.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
    alpha: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
  };
}

/** Accept a number, a percentage, or `none`, scaled to `full`. */
function scalar(token: string, full: number): number {
  const t = token.trim();
  if (t === "none") return 0;
  if (t.endsWith("%")) return (parseFloat(t) / 100) * full;
  return parseFloat(t);
}

/**
 * Parse hex, `rgb()`, `hsl()`, `oklch()`, `oklab()` and a few CSS keywords.
 * Returns null for anything unrecognised — callers fall back to a default.
 */
export function parseColor(input: string): Oklch | null {
  if (!input) return null;
  const raw = input.trim().toLowerCase();
  const named = NAMED[raw];
  const value = named ?? raw;

  if (value.startsWith("#")) {
    const rgb = parseHex(value);
    return rgb ? rgbToOklch(rgb) : null;
  }

  const fn = value.match(/^(rgba?|hsla?|oklch|oklab)\(([^)]+)\)$/);
  if (!fn) {
    // Bare hex without the hash, e.g. a table cell reading "3ECF8E".
    if (/^[0-9a-f]{3,8}$/i.test(value)) {
      const rgb = parseHex(value);
      return rgb ? rgbToOklch(rgb) : null;
    }
    return null;
  }

  const [, name, body] = fn;
  const parts = body
    .replace(/\//g, " / ")
    .split(/[\s,]+/)
    .filter((p) => p !== "");
  const slash = parts.indexOf("/");
  const comps = slash === -1 ? parts : parts.slice(0, slash);
  const alpha = slash === -1 ? 1 : clamp01(scalar(parts[slash + 1] ?? "1", 1));

  if (comps.length < 3) return null;

  if (name === "rgb" || name === "rgba") {
    return rgbToOklch({
      r: clamp01(scalar(comps[0], 255) / 255),
      g: clamp01(scalar(comps[1], 255) / 255),
      b: clamp01(scalar(comps[2], 255) / 255),
      alpha: comps[3] !== undefined && slash === -1 ? clamp01(scalar(comps[3], 1)) : alpha,
    });
  }

  if (name === "hsl" || name === "hsla") {
    const h = parseFloat(comps[0]);
    const s = clamp01(scalar(comps[1], 1));
    const l = clamp01(scalar(comps[2], 1));
    return rgbToOklch({ ...hslToRgb(h, s, l), alpha });
  }

  if (name === "oklch") {
    return {
      l: clamp01(scalar(comps[0], 1)),
      c: Math.max(0, scalar(comps[1], 0.4)),
      h: parseFloat(comps[2]) || 0,
      alpha,
    };
  }

  // oklab
  const L = clamp01(scalar(comps[0], 1));
  const A = parseFloat(comps[1]);
  const B = parseFloat(comps[2]);
  const c = Math.sqrt(A * A + B * B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h, alpha };
}

function hslToRgb(h: number, s: number, l: number): Omit<Rgb, "alpha"> {
  const hh = ((h % 360) + 360) % 360;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - chroma / 2;
  const [r, g, b] =
    hh < 60
      ? [chroma, x, 0]
      : hh < 120
        ? [x, chroma, 0]
        : hh < 180
          ? [0, chroma, x]
          : hh < 240
            ? [0, x, chroma]
            : hh < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return { r: r + m, g: g + m, b: b + m };
}

/* ---------------------------------------------------------- serialisation */

const round = (x: number, places: number) => {
  const f = 10 ** places;
  return Math.round(x * f) / f;
};

export function formatOklch(color: Oklch): string {
  const { l, c, h, alpha } = gamutMap(color);
  const base = `${round(l, 4)} ${round(c, 4)} ${round(h, 2)}`;
  return alpha >= 1 ? `oklch(${base})` : `oklch(${base} / ${round(alpha, 3)})`;
}

export function formatHex(color: Oklch): string {
  const { r, g, b, alpha } = oklchToRgb(gamutMap(color));
  const hex = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, "0");
  return alpha >= 1
    ? `#${hex(r)}${hex(g)}${hex(b)}`
    : `#${hex(r)}${hex(g)}${hex(b)}${hex(alpha)}`;
}

/* ---------------------------------------------------------------- contrast */

export function relativeLuminance(color: Oklch): number {
  const { r, g, b } = oklchToRgb(gamutMap(color));
  const lin = (x: number) => srgbToLinear(x);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2.x contrast ratio, 1–21. */
export function contrastRatio(a: Oklch, b: Oklch): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export const WCAG = {
  /** Body text, AA. */
  AA_TEXT: 4.5,
  /** Large text (18.66px bold / 24px), AA. */
  AA_LARGE: 3,
  /** UI components and graphical objects. */
  AA_NON_TEXT: 3,
  /** Body text, AAA. */
  AAA_TEXT: 7,
  AAA_LARGE: 4.5,
} as const;

/**
 * Nudge a colour's lightness until it clears `target` contrast against
 * `background`, keeping hue and as much chroma as the gamut allows.
 *
 * Direction is chosen by which way has headroom: on a light background we
 * darken, on a dark background we lighten.
 */
export function ensureContrast(
  color: Oklch,
  background: Oklch,
  target: number,
): Oklch {
  if (contrastRatio(color, background) >= target) return gamutMap(color);

  const at = (l: number) => gamutMap({ ...color, l });
  const meets = (l: number) => contrastRatio(at(l), background) >= target;

  // Head toward whichever extreme has contrast headroom against this surface.
  // 0.18 is the perceptual mid-grey, not 0.5.
  const goDarker = relativeLuminance(background) > 0.18;
  const extreme = goDarker ? 0 : 1;

  // Even pure black/white may not clear the target on a mid-tone surface.
  if (!meets(extreme)) return at(extreme);

  // Invariant: `pass` always meets the target, `fail` never does. Converge on
  // the boundary so we keep as much of the original lightness as possible.
  let pass = extreme;
  let fail = color.l;
  for (let i = 0; i < 30; i++) {
    const mid = (pass + fail) / 2;
    if (meets(mid)) pass = mid;
    else fail = mid;
  }
  return at(pass);
}

/** Mix two colours in OKLab space (t = 0 → a, t = 1 → b). */
export function mix(a: Oklch, b: Oklch, t: number): Oklch {
  const ar = (a.h * Math.PI) / 180;
  const br = (b.h * Math.PI) / 180;
  const aa = a.c * Math.cos(ar);
  const ab = a.c * Math.sin(ar);
  const ba = b.c * Math.cos(br);
  const bb = b.c * Math.sin(br);
  const A = aa + (ba - aa) * t;
  const B = ab + (bb - ab) * t;
  const c = Math.sqrt(A * A + B * B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return {
    l: a.l + (b.l - a.l) * t,
    c,
    h: c < 1e-6 ? a.h : h,
    alpha: a.alpha + (b.alpha - a.alpha) * t,
  };
}

/** Deterministic hue (0–360) from a string — the fallback brand colour. */
export function hueFromString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 3600) / 10;
}
