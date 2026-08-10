import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { insertSeedEntries, seedArrayCloseIndex } from "./seed-insert";

/**
 * `seed-repos.ts` declares SEED_REPOS and then SHOWCASE, so "the last closing
 * bracket in the file" is the wrong anchor. That is exactly what shipped.
 */
const TWO_ARRAYS = `export const SEED_REPOS: SeedRepo[] = [
  { owner: "a", repo: "b" },
];

export const SHOWCASE: readonly string[] = [
  "a/b",
];
`;

describe("seedArrayCloseIndex", () => {
  it("anchors on SEED_REPOS, not the last array in the file", () => {
    const at = seedArrayCloseIndex(TWO_ARRAYS);
    expect(TWO_ARRAYS.slice(0, at)).toContain('owner: "a"');
    expect(TWO_ARRAYS.slice(0, at)).not.toContain("SHOWCASE");
  });

  it("reports failure rather than guessing", () => {
    expect(seedArrayCloseIndex("const x = 1;")).toBe(-1);
    expect(() => insertSeedEntries("const x = 1;", "  {},")).toThrow();
  });
});

describe("insertSeedEntries", () => {
  it("puts the entry inside SEED_REPOS and leaves SHOWCASE alone", () => {
    const out = insertSeedEntries(TWO_ARRAYS, '  { owner: "c", repo: "d" },');
    const seeds = out.slice(0, out.indexOf("SHOWCASE"));
    const showcase = out.slice(out.indexOf("SHOWCASE"));
    expect(seeds).toContain('owner: "c"');
    expect(showcase).not.toContain('owner: "c"');
  });

  it("works against the real seed-repos.ts", () => {
    const real = readFileSync(join(process.cwd(), "src/lib/data/seed-repos.ts"), "utf8");
    const out = insertSeedEntries(real, '  { owner: "zzz", repo: "test" },');
    // The insert must land before SHOWCASE, which is declared after the array.
    expect(out.indexOf('owner: "zzz"')).toBeLessThan(out.indexOf("export const SHOWCASE"));
  });
});
