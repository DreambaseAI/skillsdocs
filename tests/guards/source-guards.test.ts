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

/**
 * A component that is built, tested and never imported is worse than one that
 * was never built: it passes every gate, it inflates the test count, and it
 * reads like a shipped feature to the next person who greps for it.
 *
 * All three parts of the subchapter route arrived that way. `CodeBlock` and
 * its 350 lines of `code.css` were complete, axe-clean and unreferenced —
 * source files were reaching the page through a markdown fence instead, with
 * no gutter, no `#L42`, no wrap and no clip. The shared `SubchapterRail` was
 * likewise complete while the route rendered a thinner second copy of its own.
 * Nothing failed. The site was simply missing the feature.
 *
 * These assertions are about *wiring*, which is why they read source text
 * rather than behaviour: the rendering itself is covered by the component's
 * own tests, and those all passed the whole time.
 */
describe("the subchapter route is wired to the components built for it", () => {
  const read = async (rel: string) => {
    const { readFileSync } = await import("node:fs");
    return readFileSync(path.join(SRC, rel), "utf8");
  };

  const ROUTE = "app/[owner]/[repo]/[skill]/[...file]";

  it("renders bundled source through CodeBlock", async () => {
    const wrapper = await read(`${ROUTE}/code.tsx`);
    const page = await read(`${ROUTE}/page.tsx`);

    expect(wrapper).toContain('from "@/components/ai-elements/code-block"');
    expect(page).toContain("CachedCodeBlock");
  });

  it("keeps the Shiki call inside a cache scope", async () => {
    // Cache Components fails the prerender on the `Date.now()` Shiki reads.
    // The wrapper exists for that and nothing else; without the directive the
    // route throws on every code file.
    expect(await read(`${ROUTE}/code.tsx`)).toContain('"use cache"');
  });

  it("hands the loader's own text to the highlighter", async () => {
    // The bytes have to reach the page. A pre-rendered body would silently
    // cost the gutter, the anchors, the copy button and the rail's outline.
    const loader = await read("lib/resource-loader.ts");
    expect(loader).toMatch(/view:\s*"code";\s*source:\s*string/);
  });

  it("uses the one SubchapterRail, not a local copy", async () => {
    const page = await read(`${ROUTE}/page.tsx`);
    const parts = await read(`${ROUTE}/parts.tsx`);

    expect(page).toContain('SubchapterRail } from "@/components/book/chapter-rail"');
    expect(parts).not.toMatch(/export function SubchapterRail/);
  });

  it("gives a code subchapter's rail its jump list", async () => {
    const page = await read(`${ROUTE}/page.tsx`);
    expect(page).toContain("codeOutline");
    expect(page).toContain("outline={");
  });

  it("builds every subchapter URL from one function", async () => {
    // Two identical implementations agreed only by luck; the appendix linked
    // through one and the route's canonical URL came from the other.
    const subchapters = await read("components/book/subchapters.ts");
    expect(subchapters).toContain("export const subchapterHref = resourcePath");
  });
});
