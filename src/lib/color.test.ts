import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  ensureContrast,
  formatHex,
  formatOklch,
  gamutMap,
  hueFromString,
  inSrgbGamut,
  mix,
  oklchToRgb,
  parseColor,
  relativeLuminance,
  rgbToOklch,
  WCAG,
} from "./color";

const near = (a: number, b: number, tol = 1e-3) => Math.abs(a - b) < tol;

describe("parseColor", () => {
  it("parses hex in every length", () => {
    expect(formatHex(parseColor("#fff")!)).toBe("#ffffff");
    expect(formatHex(parseColor("#000000")!)).toBe("#000000");
    expect(formatHex(parseColor("3ECF8E")!)).toBe("#3ecf8e"); // bare, no hash
    expect(parseColor("#80808080")!.alpha).toBeCloseTo(0.502, 2);
  });

  it("parses functional notations", () => {
    expect(formatHex(parseColor("rgb(255, 0, 0)")!)).toBe("#ff0000");
    expect(formatHex(parseColor("rgb(100% 0% 0%)")!)).toBe("#ff0000");
    expect(formatHex(parseColor("hsl(120, 100%, 50%)")!)).toBe("#00ff00");
    expect(parseColor("rgba(0,0,0,0.5)")!.alpha).toBeCloseTo(0.5, 3);
    expect(parseColor("rgb(0 0 0 / 40%)")!.alpha).toBeCloseTo(0.4, 3);
  });

  it("round-trips oklch", () => {
    const c = parseColor("oklch(0.7 0.15 250)")!;
    expect(near(c.l, 0.7)).toBe(true);
    expect(near(c.c, 0.15)).toBe(true);
    expect(near(c.h, 250)).toBe(true);
  });

  it("rejects nonsense", () => {
    expect(parseColor("not-a-color")).toBeNull();
    expect(parseColor("")).toBeNull();
    expect(parseColor("rgb(1,2)")).toBeNull();
  });
});

describe("sRGB <-> OKLCH round trip", () => {
  // Known reference values from Ottosson's OKLab post.
  it("maps white and black correctly", () => {
    const white = rgbToOklch({ r: 1, g: 1, b: 1, alpha: 1 });
    expect(near(white.l, 1, 1e-3)).toBe(true);
    expect(white.c).toBeLessThan(1e-3);

    const black = rgbToOklch({ r: 0, g: 0, b: 0, alpha: 1 });
    expect(black.l).toBeCloseTo(0, 5);
  });

  it("round-trips 4096 colours within a quantisation step", () => {
    let worst = 0;
    for (let r = 0; r < 256; r += 16) {
      for (let g = 0; g < 256; g += 16) {
        for (let b = 0; b < 256; b += 16) {
          const src = { r: r / 255, g: g / 255, b: b / 255, alpha: 1 };
          const back = oklchToRgb(rgbToOklch(src));
          worst = Math.max(
            worst,
            Math.abs(back.r - src.r),
            Math.abs(back.g - src.g),
            Math.abs(back.b - src.b),
          );
        }
      }
    }
    // Well under one 8-bit step (1/255 ≈ 0.0039).
    expect(worst).toBeLessThan(0.002);
  });
});

describe("relativeLuminance / contrastRatio", () => {
  it("matches the WCAG reference extremes", () => {
    const white = parseColor("#ffffff")!;
    const black = parseColor("#000000")!;
    expect(relativeLuminance(white)).toBeCloseTo(1, 3);
    expect(relativeLuminance(black)).toBeCloseTo(0, 5);
    expect(contrastRatio(white, black)).toBeCloseTo(21, 1);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
  });

  it("matches known published ratios", () => {
    // #767676 on white is the canonical "smallest passing AA grey" (4.54:1).
    const ratio = contrastRatio(parseColor("#767676")!, parseColor("#ffffff")!);
    expect(ratio).toBeGreaterThan(4.5);
    expect(ratio).toBeLessThan(4.6);

    // #595959 on white is the AAA boundary (7.0:1).
    const aaa = contrastRatio(parseColor("#595959")!, parseColor("#ffffff")!);
    expect(aaa).toBeGreaterThan(6.9);
    expect(aaa).toBeLessThan(7.1);
  });

  it("is symmetric", () => {
    const a = parseColor("#3ECF8E")!;
    const b = parseColor("#1c1917")!;
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
  });
});

describe("gamut mapping", () => {
  it("leaves in-gamut colours untouched", () => {
    const c = parseColor("#635BFF")!;
    expect(inSrgbGamut(c)).toBe(true);
    expect(gamutMap(c).c).toBeCloseTo(c.c, 6);
  });

  it("pulls impossible chroma back into sRGB", () => {
    const wild = { l: 0.6, c: 0.4, h: 150, alpha: 1 };
    expect(inSrgbGamut(wild)).toBe(false);
    const mapped = gamutMap(wild);
    expect(inSrgbGamut(mapped)).toBe(true);
    expect(mapped.c).toBeLessThan(wild.c);
    // Hue and lightness must survive.
    expect(mapped.h).toBeCloseTo(wild.h, 6);
    expect(mapped.l).toBeCloseTo(wild.l, 6);
  });
});

describe("ensureContrast", () => {
  // These are the brand colours we actually expect to receive.
  const BRANDS: Array<[string, string]> = [
    ["Supabase", "#3ECF8E"],
    ["Stripe", "#635BFF"],
    ["Anthropic", "#D97757"],
    ["Linear", "#5E6AD2"],
    ["Vercel", "#000000"],
    ["Resend", "#FFFFFF"],
    ["Cloudflare", "#F6821F"],
    ["Expo", "#4630EB"],
  ];

  const LIGHT_PAPER = parseColor("oklch(0.985 0.003 85)")!;
  const DARK_PAPER = parseColor("oklch(0.17 0.005 60)")!;

  for (const [name, hex] of BRANDS) {
    it(`makes ${name} (${hex}) readable on light paper`, () => {
      const fixed = ensureContrast(parseColor(hex)!, LIGHT_PAPER, WCAG.AA_TEXT);
      expect(contrastRatio(fixed, LIGHT_PAPER)).toBeGreaterThanOrEqual(WCAG.AA_TEXT - 0.01);
      expect(inSrgbGamut(fixed)).toBe(true);
    });

    it(`makes ${name} (${hex}) readable on dark paper`, () => {
      const fixed = ensureContrast(parseColor(hex)!, DARK_PAPER, WCAG.AA_TEXT);
      expect(contrastRatio(fixed, DARK_PAPER)).toBeGreaterThanOrEqual(WCAG.AA_TEXT - 0.01);
      expect(inSrgbGamut(fixed)).toBe(true);
    });

    it(`preserves ${name}'s hue while fixing contrast`, () => {
      const original = parseColor(hex)!;
      if (original.c < 0.02) return; // achromatic: hue is meaningless
      const fixed = ensureContrast(original, LIGHT_PAPER, WCAG.AA_TEXT);
      // Shortest angular distance between the two hues, 0–180°.
      const delta = Math.abs(((fixed.h - original.h + 180) % 360) - 180);
      expect(delta).toBeLessThan(6);
    });
  }

  it("reaches AAA where the gamut allows", () => {
    const fixed = ensureContrast(parseColor("#3ECF8E")!, LIGHT_PAPER, WCAG.AAA_TEXT);
    expect(contrastRatio(fixed, LIGHT_PAPER)).toBeGreaterThanOrEqual(WCAG.AAA_TEXT - 0.01);
  });

  it("is a no-op when contrast already passes", () => {
    const black = parseColor("#000000")!;
    const fixed = ensureContrast(black, LIGHT_PAPER, WCAG.AA_TEXT);
    expect(fixed.l).toBeCloseTo(black.l, 6);
  });

  it("returns the best available when the target is unreachable", () => {
    const midGrey = parseColor("#808080")!;
    // 21:1 is impossible against mid grey; we should still get a valid colour.
    const fixed = ensureContrast(parseColor("#777777")!, midGrey, 21);
    expect(inSrgbGamut(fixed)).toBe(true);
    expect(Number.isFinite(contrastRatio(fixed, midGrey))).toBe(true);
  });
});

describe("mix", () => {
  it("returns the endpoints exactly", () => {
    const a = parseColor("#ff0000")!;
    const b = parseColor("#0000ff")!;
    expect(formatHex(mix(a, b, 0))).toBe("#ff0000");
    expect(formatHex(mix(a, b, 1))).toBe("#0000ff");
  });

  it("interpolates lightness monotonically", () => {
    const a = parseColor("#000000")!;
    const b = parseColor("#ffffff")!;
    const steps = [0, 0.25, 0.5, 0.75, 1].map((t) => mix(a, b, t).l);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeGreaterThan(steps[i - 1]);
    }
  });
});

describe("formatOklch", () => {
  it("emits valid CSS for in-gamut colours", () => {
    expect(formatOklch({ l: 0.5, c: 0.05, h: 200, alpha: 1 })).toBe("oklch(0.5 0.05 200)");
    expect(formatOklch({ l: 0.5, c: 0.05, h: 200, alpha: 0.5 })).toBe(
      "oklch(0.5 0.05 200 / 0.5)",
    );
  });

  it("clamps chroma that sRGB cannot render", () => {
    // oklch(0.5 0.1 200) drives the red channel negative, so it must be mapped.
    expect(inSrgbGamut({ l: 0.5, c: 0.1, h: 200, alpha: 1 })).toBe(false);
    const out = formatOklch({ l: 0.5, c: 0.1, h: 200, alpha: 1 });
    expect(out).toMatch(/^oklch\(0\.5 0\.0\d+ 200\)$/);
  });
});

describe("hueFromString", () => {
  it("is deterministic and in range", () => {
    for (const s of ["anthropics", "vercel-labs", "DreambaseAI", ""]) {
      const h = hueFromString(s);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
      expect(hueFromString(s)).toBe(h);
    }
  });

  it("spreads distinct owners apart", () => {
    const hues = ["anthropics", "vercel-labs", "mattpocock", "DreambaseAI", "stripe"].map(
      hueFromString,
    );
    expect(new Set(hues).size).toBe(hues.length);
  });
});
