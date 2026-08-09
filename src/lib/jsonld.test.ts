/**
 * JSON-LD shape validation.
 *
 * There is no schema.org validator in the test toolchain, so these assert the
 * invariants a validator would check and that a hand-written graph actually
 * gets wrong: every node typed, every `@id` absolute and unique, no
 * `undefined` anywhere (JSON.stringify silently drops those keys, so a typo in
 * a property name disappears instead of failing), and cross-references that
 * resolve to a node in the same graph.
 */

import { describe, expect, it } from "vitest";
import { SITE_NAME } from "@/lib/site";
import { assembleBook, type Book } from "./book";
import type { IssueTheme } from "./design/types";
import type { RepoMeta, TreeEntry } from "./github";
import {
  bookJsonLd,
  breadcrumbJsonLd,
  chapterJsonLd,
  jsonLdScriptProps,
  siteJsonLd,
} from "./jsonld";
import { SITE_URL } from "./site";

const THEME: IssueTheme = {
  owner: "acme",
  hue: 30,
  chroma: 0.1,
  accentLight: "oklch(0.5 0.1 30)",
  accentDark: "oklch(0.8 0.1 30)",
  accentForegroundLight: "oklch(1 0 0)",
  accentForegroundDark: "oklch(0.2 0 0)",
  accentLightHc: "oklch(0.4 0.1 30)",
  accentDarkHc: "oklch(0.9 0.1 30)",
  ink: null,
  chartLight: [],
  chartDark: [],
  radiusPx: null,
  displayFont: null,
  bodyFont: null,
  monoFont: null,
  origin: "name-hash",
};

function makeBook(): Book {
  const entries: TreeEntry[] = [
    { path: "skills/alpha/SKILL.md", type: "blob", sha: "a", size: 10 },
    { path: "skills/beta/SKILL.md", type: "blob", sha: "b", size: 10 },
  ];
  const repo: RepoMeta = {
    owner: "acme",
    repo: "skills",
    fullName: "acme/skills",
    defaultBranch: "main",
    description: "Skills for <script>agents</script>.",
    homepage: null,
    stars: 4321,
    forks: 1,
    watchers: 1,
    openIssues: 0,
    topics: ["agent-skills"],
    license: { key: "mit", name: "MIT License", spdxId: "MIT" },
    pushedAt: "2026-07-22T14:02:11Z",
    createdAt: "2025-10-16T00:00:00Z",
    archived: false,
    isFork: false,
    htmlUrl: "https://github.com/acme/skills",
    ownerAvatar: "https://avatars.githubusercontent.com/u/1?v=4",
    ownerType: "Organization",
    ownerUrl: "https://github.com/acme",
  };

  return assembleBook({
    repo,
    owner: null,
    entries,
    truncated: false,
    readme: null,
    sources: [
      "---\nname: alpha\ndescription: The first.\n---\n\n# Alpha\n\nWords.\n",
      "---\nname: beta\ndescription: The second.\n---\n\n# Beta\n\nWords.\n",
    ],
    theme: THEME,
  });
}

type Node = Record<string, unknown>;

function graphOf(doc: object): Node[] {
  const d = doc as { "@context": string; "@graph": Node[] };
  expect(d["@context"]).toBe("https://schema.org");
  expect(Array.isArray(d["@graph"])).toBe(true);
  return d["@graph"];
}

/** Every `@id` reachable anywhere in the document. */
function collectIds(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const v of value) collectIds(v, out);
  } else if (value && typeof value === "object") {
    const node = value as Node;
    if (typeof node["@id"] === "string") out.push(node["@id"]);
    for (const v of Object.values(node)) collectIds(v, out);
  }
  return out;
}

function hasUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some(hasUndefined);
  if (value && typeof value === "object") {
    return Object.values(value as Node).some(hasUndefined);
  }
  return false;
}

describe("bookJsonLd", () => {
  const book = makeBook();
  const doc = bookJsonLd(book);
  const graph = graphOf(doc);

  it("types every top-level node", () => {
    for (const node of graph) expect(node["@type"]).toBeTruthy();
  });

  it("gives every top-level node a unique absolute @id", () => {
    const ids = graph.map((n) => n["@id"] as string);
    expect(ids.every((id) => /^https?:\/\//.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("contains a Book with one Chapter per skill", () => {
    const bookNode = graph.find((n) => n["@type"] === "Book")!;
    expect(bookNode["@id"]).toBe(`${SITE_URL}/acme/skills#book`);
    expect(bookNode.numberOfPages).toBe(2);
    const parts = bookNode.hasPart as Node[];
    expect(parts).toHaveLength(2);
    expect(parts[0]["@type"]).toBe("Chapter");
    expect(parts[0].position).toBe(1);
    expect(parts[0].url).toBe(`${SITE_URL}/acme/skills/alpha`);
    expect((parts[0].encoding as Node).contentUrl).toBe(
      `${SITE_URL}/acme/skills/alpha.md`,
    );
  });

  it("resolves every internal cross-reference to a node in the graph", () => {
    const declared = new Set(graph.map((n) => n["@id"] as string));
    const referenced = collectIds(doc).filter((id) => !id.includes("#chapter"));
    for (const id of referenced) {
      if (id.startsWith(SITE_URL) || id.startsWith("https://github.com")) {
        expect(declared.has(id)).toBe(true);
      }
    }
  });

  it("carries SoftwareSourceCode with the star count and licence", () => {
    const src = graph.find((n) => n["@type"] === "SoftwareSourceCode")!;
    expect(src.codeRepository).toBe("https://github.com/acme/skills");
    expect(src.license).toBe("https://spdx.org/licenses/MIT.html");
    expect((src.interactionStatistic as Node).userInteractionCount).toBe(4321);
  });

  it("emits a BreadcrumbList with sequential positions", () => {
    const crumbs = graph.find((n) => n["@type"] === "BreadcrumbList")!;
    const items = crumbs.itemListElement as Node[];
    expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(items.every((i) => String(i.item).startsWith("http"))).toBe(true);
  });

  it("holds no undefined values, which JSON.stringify would silently drop", () => {
    expect(hasUndefined(doc)).toBe(false);
  });
});

describe("chapterJsonLd", () => {
  const book = makeBook();
  const skill = book.skills[1];
  const doc = chapterJsonLd(book, skill);
  const graph = graphOf(doc);

  it("types the chapter as both Chapter and TechArticle", () => {
    expect(graph[0]["@type"]).toEqual(["Chapter", "TechArticle"]);
    expect(graph[0].position).toBe(2);
    expect(graph[0]["@id"]).toBe(`${SITE_URL}/acme/skills/beta#chapter`);
  });

  it("links back to the book and out to the source file", () => {
    expect((graph[0].isPartOf as Node)["@id"]).toBe(`${SITE_URL}/acme/skills#book`);
    expect((graph[0].mainEntity as Node).url).toBe(
      "https://github.com/acme/skills/blob/main/skills/beta/SKILL.md",
    );
  });

  it("has a four-level breadcrumb trail", () => {
    const crumbs = graph.find((n) => n["@type"] === "BreadcrumbList")!;
    expect((crumbs.itemListElement as Node[]).map((i) => i.name)).toEqual([
      SITE_NAME,
      "acme",
      "skills",
      "beta",
    ]);
  });

  it("holds no undefined values", () => {
    expect(hasUndefined(doc)).toBe(false);
  });
});

describe("siteJsonLd", () => {
  it("declares a WebSite with a SearchAction and a DataCatalog", () => {
    const graph = graphOf(siteJsonLd());
    const site = graph.find((n) => n["@type"] === "WebSite")!;
    const action = site.potentialAction as Node;
    expect((action.target as Node).urlTemplate).toBe(
      `${SITE_URL}/search?q={search_term_string}`,
    );
    expect(action["query-input"]).toBe("required name=search_term_string");
    expect(graph.some((n) => n["@type"] === "DataCatalog")).toBe(true);
  });
});

describe("breadcrumbJsonLd", () => {
  it("absolutises relative paths", () => {
    const crumbs = breadcrumbJsonLd([{ name: "Home", url: "/" }]) as Node;
    expect((crumbs.itemListElement as Node[])[0].item).toBe(`${SITE_URL}/`);
  });
});

describe("jsonLdScriptProps", () => {
  it("escapes every < so third-party text cannot close the script tag", () => {
    const book = makeBook();
    const html = jsonLdScriptProps(bookJsonLd(book)).dangerouslySetInnerHTML.__html;
    expect(html).not.toContain("<");
    expect(html).toContain("\\u003cscript>agents\\u003c/script>");
    expect(JSON.parse(html.replace(/\\u003c/g, "<"))).toBeTruthy();
  });
});
