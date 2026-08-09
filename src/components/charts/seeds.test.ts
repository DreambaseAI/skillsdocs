import { describe, expect, it } from "vitest";
import { isSeed, seedOf } from "@/components/dither-kit/palette";
import { deriveIssueTheme } from "@/lib/design/theme";
import { compactNumber, exactNumber, percentOf, truncateLabel } from "./format";
import { chartSeedsFromTheme, seedAt, seedFromColor } from "./seeds";

const theme = deriveIssueTheme("anthropics", null);

describe("palette seed passthrough (WS-7 patch)", () => {
  it("hands a literal seed back unchanged", () => {
    const literal = {
      fill: [1, 2, 3] as [number, number, number],
      line: [4, 5, 6] as [number, number, number],
      star: [7, 8, 9] as [number, number, number],
    };
    expect(seedOf(literal)).toBe(literal);
  });

  it("still resolves the closed named union", () => {
    expect(seedOf("blue").fill).toEqual([53, 143, 243]);
  });

  it("falls back to grey for an unknown or missing colour", () => {
    expect(seedOf(undefined).fill).toEqual([92, 92, 100]);
  });

  it("does not mistake a colour name for a seed", () => {
    expect(isSeed("blue")).toBe(false);
    expect(isSeed(null)).toBe(false);
  });
});

describe("chartSeedsFromTheme", () => {
  const seeds = chartSeedsFromTheme(theme);

  it("resolves one seed per theme tone, in both schemes", () => {
    expect(seeds.light).toHaveLength(theme.chartLight.length);
    expect(seeds.dark).toHaveLength(theme.chartDark.length);
    expect(seeds.light.length).toBeGreaterThan(0);
  });

  it("produces integer 0-255 channels — canvas cannot take anything else", () => {
    for (const set of [seeds.light, seeds.dark]) {
      for (const seed of set) {
        for (const tone of [seed.fill, seed.line, seed.star]) {
          expect(tone).toHaveLength(3);
          for (const channel of tone) {
            expect(Number.isInteger(channel)).toBe(true);
            expect(channel).toBeGreaterThanOrEqual(0);
            expect(channel).toBeLessThanOrEqual(255);
          }
        }
      }
    }
  });

  /**
   * The bug this guards: upstream derives `line` and `star` by lightening,
   * which is right on the dark ground dither-kit was built for and invisible
   * on light paper. Both tones must move away from the paper, not toward it.
   */
  it("darkens the accessory tones on light paper and lightens them on dark", () => {
    const sum = (t: readonly number[]) => t[0] + t[1] + t[2];
    for (const seed of seeds.light) {
      expect(sum(seed.line)).toBeLessThan(sum(seed.fill));
      expect(sum(seed.star)).toBeLessThan(sum(seed.line));
    }
    for (const seed of seeds.dark) {
      expect(sum(seed.line)).toBeGreaterThan(sum(seed.fill));
      expect(sum(seed.star)).toBeGreaterThan(sum(seed.line));
    }
  });

  it("gives the two schemes visibly different fills", () => {
    expect(seeds.light[0].fill).not.toEqual(seeds.dark[0].fill);
  });

  it("wraps the series index rather than returning undefined", () => {
    const count = seeds.light.length;
    expect(seedAt(seeds, "light", count)).toEqual(seedAt(seeds, "light", 0));
    expect(seedAt(seeds, "light", -1)).toEqual(
      seedAt(seeds, "light", count - 1),
    );
  });

  it("returns grey rather than throwing on an unparseable colour", () => {
    expect(seedFromColor("not-a-colour", "light").fill).toEqual([92, 92, 100]);
  });
});

describe("chart formatting", () => {
  it("compacts axis ticks but never the table", () => {
    expect(compactNumber(2_871_622)).toBe("2.9M");
    expect(exactNumber(2_871_622)).toBe("2,871,622");
  });

  it("keeps a decimal on small shares so 2% does not read as 0%", () => {
    expect(percentOf(98_120, 4_937_255)).toBe("2.0%");
    expect(percentOf(2_871_622, 4_937_255)).toBe("58%");
    expect(percentOf(1, 0)).toBe("0%");
  });

  it("truncates to the requested width, ellipsis included", () => {
    expect(truncateLabel("vercel-labs/skills", 10)).toBe("vercel-la…");
    expect(truncateLabel("vercel-la…", 10)).toHaveLength(10);
    expect(truncateLabel("short", 10)).toBe("short");
  });
});
