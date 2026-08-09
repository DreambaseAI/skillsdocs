/**
 * Presets, and the invariants that keep them from lying.
 *
 * The riskiest one is `matchPreset`: the panel highlights whatever it returns,
 * so a false positive tells a reader they are on "Book" while they are looking
 * at something else, and a false negative makes every preset look broken the
 * instant it is applied.
 */

import { describe, expect, it } from "vitest";
import {
  applyPreset,
  DEFAULT_PRESET_ID,
  matchPreset,
  PRESETS,
  presetById,
  resetAll,
  resetTypography,
} from "./presets";
import { DEFAULT_PREFS, LIMITS, SIZE_STEPS } from "./prefs";

describe("PRESETS", () => {
  it("ships the six ARCHITECTURE §5.5 names", () => {
    expect(PRESETS.map((p) => p.id)).toEqual([
      "book",
      "novel",
      "magazine",
      "terminal",
      "docs",
      "accessible",
    ]);
  });

  it("has unique ids", () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });

  it("only names sizes that exist on the ladder", () => {
    for (const preset of PRESETS) {
      expect(SIZE_STEPS[preset.prefs.sizeIndex], preset.id).toBeDefined();
    }
  });

  it("stays inside every slider's bounds", () => {
    for (const { id, prefs } of PRESETS) {
      expect(prefs.cpl, id).toBeGreaterThanOrEqual(LIMITS.cpl.min);
      expect(prefs.cpl, id).toBeLessThanOrEqual(LIMITS.cpl.max);
      expect(prefs.tracking, id).toBeGreaterThanOrEqual(LIMITS.tracking.min);
      expect(prefs.tracking, id).toBeLessThanOrEqual(LIMITS.tracking.max);
      expect(prefs.wordSpacing, id).toBeGreaterThanOrEqual(LIMITS.wordSpacing.min);
      expect(prefs.wordSpacing, id).toBeLessThanOrEqual(LIMITS.wordSpacing.max);
      expect(prefs.paraGap, id).toBeGreaterThanOrEqual(LIMITS.paraGap.min);
      expect(prefs.paraGap, id).toBeLessThanOrEqual(LIMITS.paraGap.max);
      if (prefs.lineHeight !== null) {
        expect(prefs.lineHeight, id).toBeGreaterThanOrEqual(LIMITS.lineHeight.min);
        expect(prefs.lineHeight, id).toBeLessThanOrEqual(LIMITS.lineHeight.max);
      }
    }
  });

  it("matches the spec table", () => {
    const table: Record<string, [string, number, number | null, number]> = {
      book: ["literata", 19, null, 68],
      novel: ["eb-garamond", 21, 1.55, 62],
      magazine: ["source-serif", 20, 1.55, 72],
      terminal: ["geist-mono", 16, 1.7, 78],
      docs: ["inter", 17, 1.65, 76],
      accessible: ["atkinson", 22, 1.75, 58],
    };
    for (const preset of PRESETS) {
      const [font, size, lh, cpl] = table[preset.id];
      expect(preset.prefs.font, preset.id).toBe(font);
      expect(SIZE_STEPS[preset.prefs.sizeIndex], preset.id).toBe(size);
      expect(preset.prefs.lineHeight, preset.id).toBe(lh);
      expect(preset.prefs.cpl, preset.id).toBe(cpl);
    }
  });

  it("never runs an indent and a paragraph gap at once", () => {
    for (const preset of PRESETS) {
      if (preset.prefs.paraStyle === "indented") {
        expect(preset.prefs.paraGap, preset.id).toBe(0);
      }
    }
  });

  it("takes the scheme with it when the paper only works in one", () => {
    const light = new Set(["paper", "sepia", "eink"]);
    const dark = new Set(["night", "midnight", "slate"]);
    for (const preset of PRESETS) {
      if (light.has(preset.prefs.paper)) expect(preset.scheme, preset.id).toBe("light");
      if (dark.has(preset.prefs.paper)) expect(preset.scheme, preset.id).toBe("dark");
    }
  });

  it("puts Accessible at or past the WCAG 1.4.12 author values", () => {
    const accessible = presetById("accessible")!;
    expect(accessible.prefs.tracking).toBeGreaterThanOrEqual(0.02);
    expect(accessible.prefs.wordSpacing).toBeGreaterThanOrEqual(0.06);
    expect(accessible.prefs.lineHeight).toBeGreaterThanOrEqual(1.5);
    expect(accessible.prefs.contrast).toBe("high");
  });
});

describe("the default state is the Book preset", () => {
  it("agrees field for field", () => {
    const book = presetById(DEFAULT_PRESET_ID)!;
    for (const key of Object.keys(book.prefs) as (keyof typeof book.prefs)[]) {
      expect(DEFAULT_PREFS[key], key).toBe(book.prefs[key]);
    }
  });

  it("is what matchPreset reports for a fresh reader", () => {
    expect(matchPreset(DEFAULT_PREFS)).toBe("book");
  });
});

describe("applyPreset", () => {
  it("lands on a state matchPreset recognises", () => {
    for (const preset of PRESETS) {
      const next = applyPreset(DEFAULT_PREFS, preset);
      expect(matchPreset(next), preset.id).toBe(preset.id);
      expect(next.preset).toBe(preset.id);
    }
  });

  it("is order-independent — any preset from any other", () => {
    for (const from of PRESETS) {
      const start = applyPreset(DEFAULT_PREFS, from);
      for (const to of PRESETS) {
        expect(matchPreset(applyPreset(start, to)), `${from.id}→${to.id}`).toBe(to.id);
      }
    }
  });

  it("leaves the code face and the motion preference alone", () => {
    const start = { ...DEFAULT_PREFS, codeFont: "jetbrains-mono", motion: "reduce" as const };
    const next = applyPreset(start, presetById("novel")!);
    expect(next.codeFont).toBe("jetbrains-mono");
    expect(next.motion).toBe("reduce");
  });
});

describe("matchPreset", () => {
  it("returns null the moment one field is nudged", () => {
    const novel = applyPreset(DEFAULT_PREFS, presetById("novel")!);
    expect(matchPreset({ ...novel, cpl: novel.cpl + 1 })).toBeNull();
    expect(matchPreset({ ...novel, font: "lora" })).toBeNull();
    expect(matchPreset({ ...novel, paper: "eink" })).toBeNull();
  });

  it("ignores the fields no preset owns", () => {
    const book = applyPreset(DEFAULT_PREFS, presetById("book")!);
    expect(matchPreset({ ...book, codeFont: "atkinson-mono" })).toBe("book");
    expect(matchPreset({ ...book, motion: "allow" })).toBe("book");
  });
});

describe("reset", () => {
  it("resetTypography keeps paper, contrast and motion", () => {
    const start = {
      ...applyPreset(DEFAULT_PREFS, presetById("novel")!),
      motion: "reduce" as const,
    };
    const next = resetTypography(start);
    expect(next.font).toBe(DEFAULT_PREFS.font);
    expect(next.cpl).toBe(DEFAULT_PREFS.cpl);
    expect(next.paraStyle).toBe(DEFAULT_PREFS.paraStyle);
    expect(next.paper).toBe("sepia");
    expect(next.motion).toBe("reduce");
    // Book requires system paper, so this is genuinely Custom now.
    expect(next.preset).toBeNull();
  });

  it("resetTypography reports Book when nothing else was changed", () => {
    const start = { ...DEFAULT_PREFS, cpl: 95, font: "lora", preset: null };
    expect(resetTypography(start).preset).toBe("book");
  });

  it("resetAll returns the factory state and does not alias it", () => {
    const next = resetAll();
    expect(next).toEqual(DEFAULT_PREFS);
    expect(next).not.toBe(DEFAULT_PREFS);
  });
});
