/**
 * The six reading presets (ARCHITECTURE §5.5).
 *
 * Presets are the control. Nobody moves eight sliders; they press "Novel" and
 * either like it or press "Book" again. The sliders exist to make the presets
 * credible and to let the one reader in fifty who cares finish the job.
 *
 * A preset is a complete typography state, not a patch: applying one must land
 * every reader on the same page regardless of what they had set before, which
 * is what makes the reset semantics obvious. Chrome-level state the preset does
 * not name (motion, code face) is deliberately left alone.
 */

import { DEFAULT_PREFS, type ReaderPrefs, SIZE_STEPS } from "./prefs";

export interface ReaderPreset {
  id: string;
  label: string;
  /** One line, shown under the label. Says what it is *for*, not what it sets. */
  hint: string;
  /** The typography half of the state. Merged over `DEFAULT_PREFS`. */
  prefs: Omit<ReaderPrefs, "codeFont" | "motion" | "preset">;
  /**
   * Which colour scheme the preset was designed in, if it only works in one.
   * Sepia paper in a dark chrome resolves to Night and the preset silently
   * stops being itself, so the panel flips the scheme rather than shipping a
   * preset that half-applies.
   */
  scheme?: "light" | "dark";
}

/** Index into `SIZE_STEPS` for a px size that is on the ladder. */
function step(px: number): number {
  const index = SIZE_STEPS.indexOf(px as (typeof SIZE_STEPS)[number]);
  if (index < 0) throw new Error(`${px}px is not on the size ladder`);
  return index;
}

export const PRESETS: ReaderPreset[] = [
  {
    id: "book",
    label: "Book",
    hint: "The default. Literata at a book measure.",
    prefs: {
      font: "literata",
      sizeIndex: step(19),
      lineHeight: null,
      cpl: 68,
      tracking: -0.003,
      wordSpacing: 0,
      paraGap: 0.9,
      paraStyle: "spaced",
      align: "left",
      paper: "system",
      contrast: "normal",
    },
  },
  {
    id: "novel",
    label: "Novel",
    hint: "Garamond, justified, indented. A paperback.",
    scheme: "light",
    prefs: {
      font: "eb-garamond",
      sizeIndex: step(21),
      lineHeight: 1.55,
      cpl: 62,
      tracking: 0,
      wordSpacing: 0,
      // Indented paragraphs and a gap are two solutions to one problem; running
      // both is the classic amateur tell.
      paraGap: 0,
      paraStyle: "indented",
      align: "justify",
      paper: "sepia",
      contrast: "normal",
    },
  },
  {
    id: "magazine",
    label: "Magazine",
    hint: "Source Serif on warm stock, wider column.",
    scheme: "light",
    prefs: {
      font: "source-serif",
      sizeIndex: step(20),
      lineHeight: 1.55,
      cpl: 72,
      tracking: -0.004,
      wordSpacing: 0,
      paraGap: 1,
      paraStyle: "spaced",
      align: "left",
      paper: "paper",
      contrast: "normal",
    },
  },
  {
    id: "terminal",
    label: "Terminal",
    hint: "Monospaced body on the deepest dark.",
    scheme: "dark",
    prefs: {
      font: "geist-mono",
      sizeIndex: step(16),
      lineHeight: 1.7,
      cpl: 78,
      tracking: 0,
      wordSpacing: 0,
      paraGap: 1.2,
      paraStyle: "spaced",
      align: "left",
      paper: "midnight",
      contrast: "normal",
    },
  },
  {
    id: "docs",
    label: "Docs",
    hint: "Inter, tight and neutral. Reference reading.",
    prefs: {
      font: "inter",
      sizeIndex: step(17),
      lineHeight: 1.65,
      cpl: 76,
      tracking: -0.006,
      wordSpacing: 0,
      paraGap: 1,
      paraStyle: "spaced",
      align: "left",
      paper: "system",
      contrast: "normal",
    },
  },
  {
    id: "accessible",
    label: "Accessible",
    hint: "Atkinson Hyperlegible, high contrast, WCAG spacing.",
    prefs: {
      font: "atkinson",
      sizeIndex: step(22),
      lineHeight: 1.75,
      cpl: 58,
      // At or past the 1.4.12 author thresholds by default, not merely capable
      // of reaching them.
      tracking: 0.02,
      wordSpacing: 0.06,
      paraGap: 1.6,
      paraStyle: "spaced",
      align: "left",
      paper: "system",
      contrast: "high",
    },
  },
];

export const DEFAULT_PRESET_ID = "book";

export function presetById(id: string | null): ReaderPreset | undefined {
  return id === null ? undefined : PRESETS.find((p) => p.id === id);
}

/** A preset applied over the current state. Code face and motion survive. */
export function applyPreset(current: ReaderPrefs, preset: ReaderPreset): ReaderPrefs {
  return {
    ...current,
    ...preset.prefs,
    preset: preset.id,
  };
}

/**
 * Which preset, if any, the current state *is*.
 *
 * Recomputed rather than trusted: a reader who applies Novel and then nudges
 * the measure is no longer reading Novel, and the panel must stop claiming
 * they are. Only the fields a preset owns are compared.
 */
export function matchPreset(prefs: ReaderPrefs): string | null {
  const found = PRESETS.find((preset) =>
    (Object.keys(preset.prefs) as (keyof ReaderPreset["prefs"])[]).every(
      (key) => prefs[key] === preset.prefs[key],
    ),
  );
  return found?.id ?? null;
}

/** "Reset typography" — the type half, leaving paper, contrast and motion. */
export function resetTypography(current: ReaderPrefs): ReaderPrefs {
  const d = DEFAULT_PREFS;
  const next: ReaderPrefs = {
    ...current,
    font: d.font,
    codeFont: d.codeFont,
    sizeIndex: d.sizeIndex,
    lineHeight: d.lineHeight,
    cpl: d.cpl,
    tracking: d.tracking,
    wordSpacing: d.wordSpacing,
    paraGap: d.paraGap,
    paraStyle: d.paraStyle,
    align: d.align,
    preset: null,
  };
  // The surviving paper or contrast choice may or may not still add up to a
  // named preset; ask rather than assume.
  return { ...next, preset: matchPreset(next) };
}

/** "Reset everything" — back to the factory state, including paper and motion. */
export function resetAll(): ReaderPrefs {
  return { ...DEFAULT_PREFS };
}
