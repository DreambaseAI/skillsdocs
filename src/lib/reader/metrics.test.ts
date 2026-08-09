/**
 * Font metrics: the numbers, and the CSS that has to agree with them.
 *
 * Two things can rot here. The table can drift from the fonts (only a re-run of
 * the fontTools measurement catches that), and `reader.css` can drift from the
 * table — which is silent, because CSS with a stale `--font-avg-char` still
 * renders, just at the wrong measure. The parser below closes the second gap.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

/*
 * `next/font/google` is a build-time construct: the real module is replaced by
 * the Next compiler and throws when imported by a plain Node runner. Every
 * loader call in `fonts.ts` returns the same shape, so one Proxy stands in for
 * all fifteen — and the catalog we care about (ids, cssVars, fallbacks) is
 * plain data that the stub does not touch.
 */
vi.mock("next/font/google", () => {
  const loader = () => ({ variable: "", className: "", style: { fontFamily: "" } });
  return Object.fromEntries(
    [
      "Atkinson_Hyperlegible_Mono",
      "Atkinson_Hyperlegible_Next",
      "Crimson_Pro",
      "EB_Garamond",
      "Fraunces",
      "Geist",
      "Geist_Mono",
      "Instrument_Serif",
      "Inter",
      "JetBrains_Mono",
      "Literata",
      "Lora",
      "Newsreader",
      "Public_Sans",
      "Source_Serif_4",
    ].map((name) => [name, loader]),
  );
});

const { ALL_FONTS, BODY_FONTS, CODE_FONTS } = await import("../fonts");
import {
  autoLineHeight,
  CAPS_UPSTREAM,
  FONT_METRICS,
  measurePx,
  metricsFor,
  renderedSizePx,
  sizeMultFor,
} from "./metrics";
import { SIZE_STEPS } from "./prefs";

const READER_CSS = readFileSync(
  join(process.cwd(), "src/styles/reader.css"),
  "utf8",
);

/** `[data-reader-font="id"] { … }` → the custom properties it declares. */
function cssFontBlocks(): Map<string, Record<string, string>> {
  const blocks = new Map<string, Record<string, string>>();
  const blockRe = /\[data-reader-font="([a-z0-9-]+)"\]\s*\{([^}]*)\}/g;
  for (const match of READER_CSS.matchAll(blockRe)) {
    const [, id, body] = match;
    const props: Record<string, string> = {};
    for (const decl of body.split(";")) {
      const colon = decl.indexOf(":");
      if (colon < 0) continue;
      const name = decl.slice(0, colon).trim();
      if (!name.startsWith("--")) continue;
      props[name] = decl
        .slice(colon + 1)
        .replace(/\s+/g, " ")
        .trim();
    }
    blocks.set(id, props);
  }
  return blocks;
}

describe("FONT_METRICS", () => {
  it("covers every face in the catalog", () => {
    for (const font of ALL_FONTS) {
      expect(FONT_METRICS[font.id], `missing metrics for ${font.id}`).toBeDefined();
    }
    // 15 faces in fonts.ts, 15 rows here — no orphans in either direction.
    expect(Object.keys(FONT_METRICS)).toHaveLength(15);
  });

  it("keys agree with their own id field", () => {
    for (const [key, metrics] of Object.entries(FONT_METRICS)) {
      expect(metrics.id).toBe(key);
    }
  });

  it("measures the average character, not the width of zero", () => {
    // If someone ever pastes `zeroWidth` into `avgChar` the measure silently
    // grows by up to 48%; the two must never be equal outside the monospaces.
    for (const metrics of Object.values(FONT_METRICS)) {
      const isMono = metrics.avgChar === metrics.zeroWidth;
      const monoIds = ["geist-mono", "jetbrains-mono", "atkinson-mono"];
      expect(isMono, `${metrics.id} avgChar === zeroWidth`).toBe(
        monoIds.includes(metrics.id),
      );
    }
  });

  it("spans the ch trap the architecture warns about", () => {
    const ratios = Object.values(FONT_METRICS).map((m) => m.zeroWidth / m.avgChar);
    expect(Math.min(...ratios)).toBeCloseTo(1.0, 2);
    // Atkinson: 66ch would be 98 real characters.
    expect(Math.max(...ratios)).toBeGreaterThan(1.45);
  });

  it("derives sizeMult from the measured x-height", () => {
    for (const metrics of Object.values(FONT_METRICS)) {
      if (metrics.id === "literata") continue; // pinned reference
      expect(metrics.sizeMult, metrics.id).toBe(sizeMultFor(metrics.xHeight));
    }
  });

  it("pins the reference face to exactly 1", () => {
    expect(FONT_METRICS.literata.sizeMult).toBe(1);
  });

  it("clamps sizeMult to [0.90, 1.15]", () => {
    for (const metrics of Object.values(FONT_METRICS)) {
      expect(metrics.sizeMult).toBeGreaterThanOrEqual(0.9);
      expect(metrics.sizeMult).toBeLessThanOrEqual(1.15);
    }
    // EB Garamond wants 1.25 and is held back.
    expect(sizeMultFor(0.4)).toBe(1.15);
    expect(sizeMultFor(0.6)).toBe(0.9);
  });

  it("reproduces the x-heights ARCHITECTURE §5.4 tabulates", () => {
    expect(FONT_METRICS.literata.xHeight).toBeCloseTo(0.507, 2);
    expect(FONT_METRICS["eb-garamond"].xHeight).toBe(0.4);
    expect(FONT_METRICS.inter.xHeight).toBeCloseTo(0.546, 3);
    expect(FONT_METRICS.newsreader.xHeight).toBe(0.426);
  });

  it("reproduces the shipped sizeMult column", () => {
    expect(FONT_METRICS["source-serif"].sizeMult).toBe(1.055);
    expect(FONT_METRICS.newsreader.sizeMult).toBe(1.15);
    expect(FONT_METRICS.inter.sizeMult).toBe(0.915);
    expect(FONT_METRICS.geist.sizeMult).toBe(0.945);
    expect(FONT_METRICS.atkinson.sizeMult).toBe(1.01);
  });

  it("gives every face a usable cap height for the drop-cap fallback", () => {
    for (const metrics of Object.values(FONT_METRICS)) {
      expect(metrics.capHeight).toBeGreaterThan(metrics.xHeight);
      expect(metrics.capHeight).toBeLessThan(1);
    }
  });
});

describe("OpenType feature gating", () => {
  it("never promises small caps for Newsreader", () => {
    // The one family ARCHITECTURE calls out by name: no smcp, no onum, in the
    // upstream binary as well as the shipped one.
    expect(FONT_METRICS.newsreader.caps).toBe("");
    expect(CAPS_UPSTREAM.newsreader).toBe("");
  });

  it("promises nothing the shipped woff2 cannot do", () => {
    // Google's delivery subsetter strips smcp and onum from every face it
    // serves, so no family may advertise either. If this ever fails it means
    // the fonts are being loaded a different way — re-measure before relaxing
    // it, and update CAPS_UPSTREAM's note at the same time.
    for (const metrics of Object.values(FONT_METRICS)) {
      expect(metrics.caps, metrics.id).toBe("");
    }
  });

  it("records what the upstream binaries carry, for every face", () => {
    for (const id of Object.keys(FONT_METRICS)) {
      expect(CAPS_UPSTREAM[id], id).toBeDefined();
    }
    expect(CAPS_UPSTREAM.literata).toContain("smcp");
  });
});

describe("reader.css stays in step with the table", () => {
  const blocks = cssFontBlocks();

  it("emits a block for every family", () => {
    expect([...blocks.keys()].sort()).toEqual(Object.keys(FONT_METRICS).sort());
  });

  it("emits the measured values", () => {
    for (const [id, props] of blocks) {
      const metrics = FONT_METRICS[id];
      expect(Number(props["--font-avg-char"]), `${id} avg-char`).toBe(metrics.avgChar);
      expect(Number(props["--font-size-mult"]), `${id} size-mult`).toBe(
        metrics.sizeMult,
      );
      expect(Number(props["--font-x-height"]), `${id} x-height`).toBe(metrics.xHeight);
      expect(Number(props["--font-cap-height"]), `${id} cap-height`).toBe(
        metrics.capHeight,
      );
      expect(props["--font-caps"], `${id} caps`).toBe(`"${metrics.caps}"`);
    }
  });

  it("points each block at that family's next/font variable", () => {
    for (const [id, props] of blocks) {
      const choice = ALL_FONTS.find((f) => f.id === id);
      expect(choice, id).toBeDefined();
      expect(props["--reader-font-family"]).toContain(`var(${choice!.cssVar})`);
    }
  });

  it("gives every offered code face a --reader-code-family", () => {
    for (const choice of CODE_FONTS) {
      expect(
        READER_CSS.includes(`[data-reader-code-font="${choice.id}"]`),
        choice.id,
      ).toBe(true);
    }
  });

  it("declares the same defaults on :root as the reference face", () => {
    const root = READER_CSS.slice(READER_CSS.indexOf(":root {"));
    const literata = FONT_METRICS.literata;
    expect(root).toContain(`--font-avg-char: ${literata.avgChar}`);
    expect(root).toContain(`--font-x-height: ${literata.xHeight}`);
  });
});

describe("derived sizes", () => {
  it("holds the character count still across families", () => {
    // The point of the whole exercise: 68 CPL is 68 characters in every face,
    // even though the pixel width of the column is not the same.
    const cpl = 68;
    const step = 19;
    const widths = BODY_FONTS.map((f) => measurePx(f.id, step, cpl));
    const chars = BODY_FONTS.map(
      (f, i) => widths[i] / (metricsFor(f.id).avgChar * renderedSizePx(f.id, step)),
    );
    for (const count of chars) expect(count).toBeCloseTo(cpl, 6);
    // …and the widths genuinely differ, or the test above proves nothing.
    expect(Math.max(...widths) / Math.min(...widths)).toBeGreaterThan(1.3);
  });

  it("keeps apparent size within 2% across families at one step", () => {
    // Rendered px × x-height is the apparent size of a lowercase letter, which
    // is what the reader actually perceives as "how big is this".
    const apparent = BODY_FONTS.map((f) => {
      const m = metricsFor(f.id);
      return renderedSizePx(f.id, 19) * m.xHeight;
    });
    const reference = renderedSizePx("literata", 19) * FONT_METRICS.literata.xHeight;
    for (const value of apparent) {
      // Garamond, Crimson and Newsreader are clamp-limited and cannot reach the
      // reference; everything unclamped must land within 2%.
      expect(value / reference).toBeGreaterThan(0.9);
      expect(value / reference).toBeLessThan(1.1);
    }
  });

  it("lands the default measure in the measured best-in-class band", () => {
    // 600–660px is where the Verge / Linear / Stripe Press corpus sits.
    const width = measurePx("literata", 19, 68);
    expect(width).toBeGreaterThan(590);
    expect(width).toBeLessThan(660);
  });

  it("falls back to the reference face for an unknown id", () => {
    expect(metricsFor("not-a-font")).toBe(FONT_METRICS.literata);
  });
});

describe("auto leading", () => {
  it("is 1.60 at the 19px default and falls as size grows", () => {
    expect(autoLineHeight(19)).toBeCloseTo(1.6, 2);
    expect(autoLineHeight(48)).toBeCloseTo(1.35, 2);
  });

  it("decreases monotonically over the whole ladder", () => {
    const ratios = SIZE_STEPS.map((px) => autoLineHeight(px));
    for (let i = 1; i < ratios.length; i += 1) {
      expect(ratios[i]).toBeLessThan(ratios[i - 1]);
    }
  });

  it("never drops below the 1.5 WCAG floor at body sizes", () => {
    for (const px of SIZE_STEPS.filter((s) => s <= 22)) {
      expect(autoLineHeight(px)).toBeGreaterThanOrEqual(1.5);
    }
  });
});
