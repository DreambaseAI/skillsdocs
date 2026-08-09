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

/**
 * The root layout renders its children on every route, so anything it mounts
 * shares their prerendering fate.
 *
 * Under `cacheComponents`, a client component that reads a URL hook outside a
 * <Suspense> boundary makes its whole route a "blocking route" — and when that
 * component sits in the root layout, that is *every* route on the site. It
 * cost us prerendering site-wide once already, via a `usePathname()` added to
 * SkipLinks for an unrelated accessibility fix.
 */
describe("root layout prerender safety", () => {
  const URL_HOOKS = ["usePathname", "useSearchParams", "useParams", "useSelectedLayoutSegment"];

  it("mounts nothing that reads a URL hook un-Suspended", async () => {
    const { readFileSync, existsSync } = await import("node:fs");
    const layout = readFileSync(path.join(SRC, "app/layout.tsx"), "utf8");

    // Local imports the layout mounts directly, resolved to files under src/.
    const imported = [...layout.matchAll(/from\s+"@\/([^"]+)"/g)]
      .map((m) => m[1])
      .flatMap((rel) =>
        [".tsx", ".ts", "/index.tsx"]
          .map((ext) => path.join(SRC, rel + ext))
          .filter((p) => existsSync(p)),
      );

    expect(imported.length).toBeGreaterThan(3);

    // Comments must be stripped first: the fix for this very bug documents
    // itself by naming the hook, and a naive scan flags its own explanation.
    const stripComments = (source: string) =>
      source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

    const offenders = imported.filter((file) => {
      const code = stripComments(readFileSync(file, "utf8"));
      return URL_HOOKS.some((hook) => new RegExp(`\\b${hook}\\s*\\(`).test(code));
    });

    expect(
      offenders.map((f) => path.relative(REPO_ROOT, f)),
      "A URL hook here marks every route blocking. Either drop the hook or wrap the component in <Suspense> inside layout.tsx.",
    ).toEqual([]);
  });
});
