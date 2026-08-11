/**
 * Reader typefaces.
 *
 * Every family here is OFL-1.1 and self-hosted through `next/font/google`, so
 * no request ever leaves for fonts.googleapis.com.
 *
 * **Exactly three are preloaded** — the reader default, the UI face, and the
 * code face. Preloading all fourteen would inject fourteen
 * `<link rel="preload">` tags into every page: several hundred kilobytes of
 * fetches competing with the content for bandwidth, which is the single
 * fastest way to ruin LCP in a reading app. The rest ship their `@font-face`
 * rule and are fetched the first time a glyph actually needs them — which,
 * conveniently, is the moment the reader opens the font picker and each option
 * renders in its own face.
 *
 * Per-family metrics live in `reader/metrics.ts`. They are not cosmetic: the
 * x-height of these faces spans 0.400em to 0.560em, so switching family
 * without normalising size reads as a bug rather than a choice.
 */

// `next/font` parses these calls at build time: every option must be an
// inline literal. Spreads, variables, and computed values are rejected.
import {
  Atkinson_Hyperlegible_Mono,
  Atkinson_Hyperlegible_Next,
  Crimson_Pro,
  EB_Garamond,
  Fraunces,
  Geist,
  Geist_Mono,
  Instrument_Serif,
  Inter,
  JetBrains_Mono,
  Literata,
  Lora,
  Newsreader,
  Public_Sans,
  Source_Serif_4,
} from "next/font/google";

/* ------------------------------------------------------- preloaded (3) */

/** Reader default. Screen-designed, optically sized, real small caps. */
export const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin"],
  display: "swap",
  preload: true,
  style: ["normal", "italic"],
  axes: ["opsz"],
});

/** UI chrome. */
export const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

/** Code, in both the reader and the chrome. */
export const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

/* ---------------------------------------------------- on demand (11) */

export const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  style: ["normal", "italic"],
});

// Newsreader has no `smcp` and no `onum`; the numerals and small-caps
// controls are gated off for it in `reader/metrics.ts`.
export const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  style: ["normal", "italic"],
  axes: ["opsz"],
});

export const ebGaramond = EB_Garamond({
  variable: "--font-eb-garamond",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  style: ["normal", "italic"],
});

export const crimsonPro = Crimson_Pro({
  variable: "--font-crimson-pro",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  style: ["normal", "italic"],
});

export const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  style: ["normal", "italic"],
});

/** Display face for chapter openers and covers. */
export const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT", "WONK"],
});

// Static face: `weight` is required, and passing `axes` would throw.
export const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "400",
  style: ["normal", "italic"],
});

export const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

export const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  style: ["normal", "italic"],
});

export const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  style: ["normal", "italic"],
});

/**
 * The Braille Institute's legibility face. "Next" is the 2025 revision:
 * variable 200–800 with true italics, strictly better than the static v1.
 */
// Next.js ships no fallback metrics for either Atkinson face yet, so the
// automatic size-adjusted fallback is opted out of rather than warned about
// on every compile; `reader/metrics.ts` normalises these families anyway.
export const atkinson = Atkinson_Hyperlegible_Next({
  variable: "--font-atkinson",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  style: ["normal", "italic"],
  adjustFontFallback: false,
});

export const atkinsonMono = Atkinson_Hyperlegible_Mono({
  variable: "--font-atkinson-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  style: ["normal", "italic"],
  adjustFontFallback: false,
});

/* ------------------------------------------------------------ catalog */

export type FontCategory = "serif" | "sans" | "mono" | "display" | "accessible";

export interface FontChoice {
  /** Stable id, written to the prefs cookie — never rename these. */
  id: string;
  label: string;
  category: FontCategory;
  /** The CSS custom property `next/font` defined. */
  cssVar: string;
  /** Fallback stack appended after the variable. */
  fallback: string;
  note?: string;
}

const SERIF_FALLBACK = "Georgia, 'Times New Roman', serif";
const SANS_FALLBACK = "system-ui, -apple-system, 'Segoe UI', sans-serif";
const MONO_FALLBACK = "ui-monospace, SFMono-Regular, Menlo, monospace";

/** Body faces offered in the reader, in picker order. */
export const BODY_FONTS: FontChoice[] = [
  { id: "literata", label: "Literata", category: "serif", cssVar: "--font-literata", fallback: SERIF_FALLBACK, note: "Default — designed for screens" },
  { id: "source-serif", label: "Source Serif 4", category: "serif", cssVar: "--font-source-serif", fallback: SERIF_FALLBACK },
  { id: "newsreader", label: "Newsreader", category: "serif", cssVar: "--font-newsreader", fallback: SERIF_FALLBACK, note: "Editorial" },
  { id: "eb-garamond", label: "EB Garamond", category: "serif", cssVar: "--font-eb-garamond", fallback: SERIF_FALLBACK, note: "Classical, small on the body" },
  { id: "crimson-pro", label: "Crimson Pro", category: "serif", cssVar: "--font-crimson-pro", fallback: SERIF_FALLBACK },
  { id: "lora", label: "Lora", category: "serif", cssVar: "--font-lora", fallback: SERIF_FALLBACK },
  { id: "geist", label: "Geist", category: "sans", cssVar: "--font-geist", fallback: SANS_FALLBACK },
  { id: "inter", label: "Inter", category: "sans", cssVar: "--font-inter", fallback: SANS_FALLBACK },
  { id: "public-sans", label: "Public Sans", category: "sans", cssVar: "--font-public-sans", fallback: SANS_FALLBACK },
  { id: "atkinson", label: "Atkinson Hyperlegible", category: "accessible", cssVar: "--font-atkinson", fallback: SANS_FALLBACK, note: "Braille Institute legibility face" },
  { id: "geist-mono", label: "Geist Mono", category: "mono", cssVar: "--font-geist-mono", fallback: MONO_FALLBACK },
  { id: "jetbrains-mono", label: "JetBrains Mono", category: "mono", cssVar: "--font-jetbrains-mono", fallback: MONO_FALLBACK },
];

/** Faces offered for code blocks. */
export const CODE_FONTS: FontChoice[] = [
  { id: "geist-mono", label: "Geist Mono", category: "mono", cssVar: "--font-geist-mono", fallback: MONO_FALLBACK },
  { id: "jetbrains-mono", label: "JetBrains Mono", category: "mono", cssVar: "--font-jetbrains-mono", fallback: MONO_FALLBACK },
  { id: "atkinson-mono", label: "Atkinson Mono", category: "mono", cssVar: "--font-atkinson-mono", fallback: MONO_FALLBACK, note: "Legibility face" },
];

/** Display faces for chapter openers, offered per issue. */
export const DISPLAY_FONTS: FontChoice[] = [
  { id: "fraunces", label: "Fraunces", category: "display", cssVar: "--font-fraunces", fallback: SERIF_FALLBACK },
  { id: "instrument-serif", label: "Instrument Serif", category: "display", cssVar: "--font-instrument-serif", fallback: SERIF_FALLBACK },
  { id: "literata", label: "Literata", category: "serif", cssVar: "--font-literata", fallback: SERIF_FALLBACK },
  { id: "geist", label: "Geist", category: "sans", cssVar: "--font-geist", fallback: SANS_FALLBACK },
];

export const ALL_FONTS: FontChoice[] = [
  ...BODY_FONTS,
  ...CODE_FONTS.filter((f) => !BODY_FONTS.some((b) => b.id === f.id)),
  ...DISPLAY_FONTS.filter(
    (f) => ![...BODY_FONTS, ...CODE_FONTS].some((b) => b.id === f.id),
  ),
];

export function fontById(id: string): FontChoice | undefined {
  return ALL_FONTS.find((f) => f.id === id);
}

/** The `font-family` value for a choice, e.g. `var(--font-literata), Georgia…`. */
export function fontStack(choice: FontChoice): string {
  return `var(${choice.cssVar}), ${choice.fallback}`;
}

/**
 * Brand families named in a `design.md` that we cannot legally serve, mapped
 * to the closest face we do ship. Surfaced in the colophon when it fires.
 */
export const FONT_SUBSTITUTIONS: Record<string, string> = {
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

/** All font `.variable` class names, for the root `<html>` element. */
export const FONT_VARIABLE_CLASSES = [
  literata,
  geist,
  geistMono,
  sourceSerif,
  newsreader,
  ebGaramond,
  crimsonPro,
  lora,
  fraunces,
  instrumentSerif,
  inter,
  publicSans,
  jetbrainsMono,
  atkinson,
  atkinsonMono,
]
  .map((f) => f.variable)
  .join(" ");
