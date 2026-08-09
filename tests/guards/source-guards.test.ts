import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { findBionic, findRawColours, formatHits, sourceFiles } from "./source-guards";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../..");
const SRC = path.join(REPO_ROOT, "src");

describe("source guards", () => {
  it("scans a non-trivial number of files (the guard itself must not silently no-op)", () => {
    expect(sourceFiles(SRC).length).toBeGreaterThan(30);
  });

  it('never ships the string "bionic"', () => {
    const hits = findBionic(SRC, REPO_ROOT);
    expect(
      hits,
      `Bionic Reading® is trademarked and its EULA prohibits commercial use (ARCHITECTURE §5.5).\nOur equivalent is "fixation emphasis".\n${formatHits(hits)}`,
    ).toEqual([]);
  });

  it("keeps every raw colour literal inside tokens.css", () => {
    const hits = findRawColours(SRC, REPO_ROOT);
    expect(
      hits,
      `Raw colour literals outside src/styles/tokens.css break the three-axis theme contract.\nUse a semantic token (bg-paper, text-ink, text-issue-accent, …).\n${formatHits(hits)}`,
    ).toEqual([]);
  });
});
