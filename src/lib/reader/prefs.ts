/**
 * Reader preferences: the model, the defaults, and the cookie codec.
 *
 * These are read on the **server** from the `reader-prefs` cookie and written
 * onto `<html>` during SSR, which is the whole point — a reading app that
 * repaints in the wrong typeface after hydration is worse than one with no
 * settings at all.
 *
 * The codec is deliberately terse: the cookie rides on every request, so it is
 * capped at 400 bytes and stores indices rather than labels.
 */

/** The 17-step size ladder, in px. */
export const SIZE_STEPS = [
  14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 26, 28, 32, 36, 40, 44, 48,
] as const;

export const SIZE_DEFAULT_INDEX = 5; // 19px

export type PaperMode =
  | "system"
  | "paper"
  | "sepia"
  | "eink"
  | "night"
  | "midnight"
  | "slate";

export type ParagraphStyle = "spaced" | "indented";
export type TextAlign = "left" | "justify";
export type ContrastMode = "normal" | "high";
export type MotionMode = "system" | "reduce" | "allow";

export interface ReaderPrefs {
  /** Font ids from `lib/fonts.ts`. */
  font: string;
  codeFont: string;
  /** Index into SIZE_STEPS. */
  sizeIndex: number;
  /** `null` means the auto curve, which is a real state and not a value. */
  lineHeight: number | null;
  /** Characters per line — never `ch`. */
  cpl: number;
  /** em */
  tracking: number;
  wordSpacing: number;
  paraGap: number;
  paraStyle: ParagraphStyle;
  align: TextAlign;
  paper: PaperMode;
  contrast: ContrastMode;
  motion: MotionMode;
  /** Id of the preset last applied, for highlighting it in the panel. */
  preset: string | null;
}

export const DEFAULT_PREFS: ReaderPrefs = {
  font: "literata",
  codeFont: "geist-mono",
  sizeIndex: SIZE_DEFAULT_INDEX,
  lineHeight: null,
  cpl: 68,
  tracking: -0.003,
  wordSpacing: 0,
  paraGap: 0.9,
  paraStyle: "spaced",
  align: "left",
  paper: "system",
  contrast: "normal",
  motion: "system",
  preset: "book",
};

/**
 * Bounds every numeric control. The spacing maxima deliberately exceed the
 * WCAG 1.4.12 thresholds (0.12em tracking, 0.16em word spacing, 2em paragraph
 * spacing) so the layout is provably exercised past them rather than merely
 * assumed to survive.
 */
export const LIMITS = {
  cpl: { min: 45, max: 100, step: 1 },
  lineHeight: { min: 1.3, max: 2.2, step: 0.05 },
  tracking: { min: -0.02, max: 0.16, step: 0.005 },
  wordSpacing: { min: 0, max: 0.32, step: 0.01 },
  paraGap: { min: 0, max: 2, step: 0.05 },
} as const;

const clamp = (n: number, min: number, max: number) =>
  Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;

const oneOf = <T extends string>(value: string, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

export const PAPER_MODES: readonly PaperMode[] = [
  "system",
  "paper",
  "sepia",
  "eink",
  "night",
  "midnight",
  "slate",
];

/** Which paper modes make sense in each scheme. */
export const PAPER_BY_SCHEME = {
  light: ["paper", "sepia", "eink"],
  dark: ["night", "midnight", "slate"],
} as const;

/* --------------------------------------------------------------- codec */

export const PREFS_COOKIE = "reader-prefs";
export const PREFS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const MAX_COOKIE_BYTES = 400;

/** Short keys keep the cookie small; never rename one without a migration. */
export function serializePrefs(prefs: ReaderPrefs): string {
  const p = new URLSearchParams();
  const d = DEFAULT_PREFS;
  // Only non-default values are written, so a default cookie is ~empty.
  if (prefs.font !== d.font) p.set("f", prefs.font);
  if (prefs.codeFont !== d.codeFont) p.set("cf", prefs.codeFont);
  if (prefs.sizeIndex !== d.sizeIndex) p.set("s", String(prefs.sizeIndex));
  if (prefs.lineHeight !== d.lineHeight) p.set("lh", String(prefs.lineHeight ?? "a"));
  if (prefs.cpl !== d.cpl) p.set("m", String(prefs.cpl));
  if (prefs.tracking !== d.tracking) p.set("t", String(prefs.tracking));
  if (prefs.wordSpacing !== d.wordSpacing) p.set("w", String(prefs.wordSpacing));
  if (prefs.paraGap !== d.paraGap) p.set("pg", String(prefs.paraGap));
  if (prefs.paraStyle !== d.paraStyle) p.set("ps", prefs.paraStyle);
  if (prefs.align !== d.align) p.set("al", prefs.align);
  if (prefs.paper !== d.paper) p.set("pa", prefs.paper);
  if (prefs.contrast !== d.contrast) p.set("c", prefs.contrast);
  if (prefs.motion !== d.motion) p.set("mo", prefs.motion);
  if (prefs.preset !== d.preset) p.set("pr", prefs.preset ?? "");

  const out = p.toString();
  // A cookie this size can only mean a corrupt or hostile value; drop it.
  return out.length > MAX_COOKIE_BYTES ? "" : out;
}

export function parsePrefs(raw: string | undefined | null): ReaderPrefs {
  if (!raw || raw.length > MAX_COOKIE_BYTES) return DEFAULT_PREFS;

  let p: URLSearchParams;
  try {
    p = new URLSearchParams(raw);
  } catch {
    return DEFAULT_PREFS;
  }

  const d = DEFAULT_PREFS;
  const num = (key: string, fallback: number) => {
    const v = p.get(key);
    return v === null ? fallback : Number(v);
  };

  const lhRaw = p.get("lh");
  const preset = p.get("pr");

  return {
    // Font ids are validated against the catalog by the caller; here we only
    // guard the shape so a hostile cookie can't reach a CSS variable.
    font: sanitizeId(p.get("f")) ?? d.font,
    codeFont: sanitizeId(p.get("cf")) ?? d.codeFont,
    sizeIndex: Math.round(clamp(num("s", d.sizeIndex), 0, SIZE_STEPS.length - 1)),
    lineHeight:
      lhRaw === null
        ? d.lineHeight
        : lhRaw === "a" || lhRaw === "null"
          ? null
          : clamp(Number(lhRaw), LIMITS.lineHeight.min, LIMITS.lineHeight.max),
    cpl: Math.round(clamp(num("m", d.cpl), LIMITS.cpl.min, LIMITS.cpl.max)),
    tracking: clamp(num("t", d.tracking), LIMITS.tracking.min, LIMITS.tracking.max),
    wordSpacing: clamp(
      num("w", d.wordSpacing),
      LIMITS.wordSpacing.min,
      LIMITS.wordSpacing.max,
    ),
    paraGap: clamp(num("pg", d.paraGap), LIMITS.paraGap.min, LIMITS.paraGap.max),
    paraStyle: oneOf(p.get("ps") ?? d.paraStyle, ["spaced", "indented"], d.paraStyle),
    align: oneOf(p.get("al") ?? d.align, ["left", "justify"], d.align),
    paper: oneOf(p.get("pa") ?? d.paper, PAPER_MODES, d.paper),
    contrast: oneOf(p.get("c") ?? d.contrast, ["normal", "high"], d.contrast),
    motion: oneOf(p.get("mo") ?? d.motion, ["system", "reduce", "allow"], d.motion),
    preset: preset === null ? d.preset : preset || null,
  };
}

/** Font ids are lowercase kebab-case and nothing else. */
function sanitizeId(value: string | null): string | null {
  if (!value) return null;
  return /^[a-z0-9-]{1,32}$/.test(value) ? value : null;
}

/* ------------------------------------------------------- to the DOM */

/**
 * The `data-*` attributes SSR writes onto `<html>`. Kept separate from the
 * custom properties because attributes drive selectors and properties drive
 * values, and mixing the two makes both harder to reason about.
 */
export function prefsToDataAttributes(prefs: ReaderPrefs): Record<string, string> {
  const attrs: Record<string, string> = {
    "data-reader-font": prefs.font,
    "data-reader-code-font": prefs.codeFont,
    "data-reader-lh": prefs.lineHeight === null ? "auto" : "manual",
    "data-reader-para": prefs.paraStyle,
    "data-reader-align": prefs.align,
    "data-contrast": prefs.contrast,
  };
  // "system" means "don't assert one" — let the scheme pick the default.
  if (prefs.paper !== "system") attrs["data-paper"] = prefs.paper;
  if (prefs.motion !== "system") attrs["data-motion"] = prefs.motion;
  return attrs;
}

/** The inline custom properties SSR writes onto `<html>`. */
export function prefsToStyle(prefs: ReaderPrefs): Record<string, string> {
  const style: Record<string, string> = {
    "--reader-size-step": `${SIZE_STEPS[prefs.sizeIndex]}px`,
    "--reader-measure-cpl": String(prefs.cpl),
    "--reader-tracking": `${prefs.tracking}em`,
    "--reader-word-spacing": `${prefs.wordSpacing}em`,
    "--reader-para-gap": `${prefs.paraGap}em`,
    "--reader-align": prefs.align,
    "--reader-para-indent": prefs.paraStyle === "indented" ? "1.5em" : "0em",
  };
  if (prefs.lineHeight !== null) {
    style["--reader-lh-manual"] = String(prefs.lineHeight);
  }
  return style;
}

export function sizePx(prefs: ReaderPrefs): number {
  return SIZE_STEPS[prefs.sizeIndex];
}
