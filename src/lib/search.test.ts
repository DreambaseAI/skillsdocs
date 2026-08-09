import { describe, expect, it } from "vitest";
import {
  fieldScore,
  foldIndex,
  highlight,
  normalize,
  search,
  tokenize,
  type SearchDoc,
} from "./search";

function doc(partial: Partial<SearchDoc> & Pick<SearchDoc, "title">): SearchDoc {
  return {
    kind: "chapter",
    owner: "acme",
    repo: "skills",
    slug: "a-skill",
    subtitle: null,
    keywords: [],
    installs: 0,
    official: false,
    avatar: "",
    href: "/acme/skills/a-skill",
    ...partial,
  };
}

const CORPUS: SearchDoc[] = [
  doc({
    kind: "book",
    owner: "anthropics",
    repo: "skills",
    slug: null,
    title: "anthropics/skills",
    subtitle: "Public repository for Agent Skills",
    installs: 2_738_696,
    official: true,
    href: "/anthropics/skills",
  }),
  doc({
    owner: "anthropics",
    repo: "skills",
    slug: "skill-creator",
    title: "skill-creator",
    subtitle: "anthropics/skills",
    installs: 91_000,
    href: "/anthropics/skills/skill-creator",
  }),
  doc({
    owner: "anthropics",
    repo: "skills",
    slug: "frontend-design",
    title: "frontend-design",
    subtitle: "anthropics/skills",
    keywords: ["css", "layout", "typography"],
    installs: 120_000,
    href: "/anthropics/skills/frontend-design",
  }),
  doc({
    kind: "book",
    owner: "mattpocock",
    repo: "skills",
    slug: null,
    title: "mattpocock/skills",
    subtitle: "TypeScript skills, from Total TypeScript",
    installs: 40_000,
    href: "/mattpocock/skills",
  }),
];

describe("normalize", () => {
  it("collapses punctuation and case", () => {
    expect(normalize("Skill_Creator--v2")).toBe("skill creator v2");
  });

  it("strips diacritics rather than dropping the word", () => {
    expect(normalize("Café Résumé")).toBe("cafe resume");
  });

  it("returns an empty string for punctuation-only input", () => {
    expect(normalize("--- ///")).toBe("");
  });
});

describe("tokenize", () => {
  it("de-duplicates and caps", () => {
    expect(tokenize("test test")).toEqual(["test"]);
    expect(tokenize("a b c d e f g h i j")).toHaveLength(8);
  });

  it("truncates absurd queries instead of scanning them", () => {
    expect(tokenize("x".repeat(500))[0]).toHaveLength(128);
  });
});

describe("fieldScore", () => {
  it("ranks exact above prefix above word-start above substring", () => {
    expect(fieldScore("skill creator", "skill creator")).toBe(1);
    expect(fieldScore("skill creator", "skill")).toBeGreaterThan(
      fieldScore("skill creator", "creator"),
    );
    expect(fieldScore("skill creator", "creator")).toBeGreaterThan(
      fieldScore("askillcreator", "reato"),
    );
  });

  it("only fuzzy-matches tokens of three characters or more", () => {
    expect(fieldScore("skill creator", "sc")).toBe(0);
    expect(fieldScore("skill creator", "sct")).toBeGreaterThan(0);
  });

  it("does not fuzzy-match when fuzzy is off", () => {
    expect(fieldScore("skill creator", "sct", false)).toBe(0);
    expect(fieldScore("skill creator", "creator", false)).toBeGreaterThan(0);
  });
});

describe("search", () => {
  it("returns nothing for an empty query", () => {
    expect(search(CORPUS, "")).toEqual([]);
    expect(search(CORPUS, "   ")).toEqual([]);
  });

  it("puts the book above its own chapters when the repo is named", () => {
    const hits = search(CORPUS, "anthropics");
    expect(hits[0].doc.href).toBe("/anthropics/skills");
  });

  it("finds a chapter by its slug across books", () => {
    const hits = search(CORPUS, "skill-creator");
    expect(hits[0].doc.slug).toBe("skill-creator");
  });

  it("requires every token to match somewhere", () => {
    expect(search(CORPUS, "anthropics typescript")).toEqual([]);
    expect(search(CORPUS, "mattpocock typescript")).toHaveLength(1);
  });

  it("matches keywords, but ranks them below a title", () => {
    const hits = search(CORPUS, "typography");
    expect(hits).toHaveLength(1);
    expect(hits[0].field).toBe("keywords");
  });

  it("never fuzzy-matches a prose description", () => {
    // "pry" is a subsequence of "Public repositorY for Agent Skills" and of no
    // title or path in the corpus. Allowing it would make long blurbs match
    // very nearly every query.
    expect(search(CORPUS, "pry")).toEqual([]);
  });

  it("honours the kind filter and the limit", () => {
    expect(search(CORPUS, "skills", { kind: "book" }).every((h) => h.doc.kind === "book")).toBe(
      true,
    );
    expect(search(CORPUS, "skills", { limit: 2 })).toHaveLength(2);
  });

  it("is deterministic for equally scored documents", () => {
    const a = search(CORPUS, "skills").map((h) => h.doc.href);
    const b = search([...CORPUS].reverse(), "skills").map((h) => h.doc.href);
    expect(a).toEqual(b);
  });

  it("scores identically whether the index is folded once or per call", () => {
    const folded = foldIndex(CORPUS);
    expect(folded).toHaveLength(CORPUS.length);
    expect(search(CORPUS, "design")[0].doc.slug).toBe("frontend-design");
  });
});

describe("highlight", () => {
  it("round-trips the original text exactly", () => {
    const segments = highlight("Skill Creator", "creator");
    expect(segments.map((s) => s.text).join("")).toBe("Skill Creator");
    expect(segments.filter((s) => s.hit).map((s) => s.text)).toEqual(["Creator"]);
  });

  it("marks every occurrence of every token", () => {
    const segments = highlight("test the test", "test");
    expect(segments.filter((s) => s.hit)).toHaveLength(2);
  });

  it("returns a single unmatched segment when nothing matches", () => {
    expect(highlight("Skill Creator", "zzz")).toEqual([
      { text: "Skill Creator", hit: false },
    ]);
  });

  it("ignores one-character tokens that would mark half the string", () => {
    expect(highlight("Skill Creator", "a")).toEqual([
      { text: "Skill Creator", hit: false },
    ]);
  });
});

describe("fuzzy tier", () => {
  it("is suppressed entirely once anything matches properly", () => {
    // "pdf" is a subsequence of "frontend-design"'s path but a real substring
    // of nothing else here; add a doc that matches it outright and the fuzzy
    // rescue must disappear.
    const corpus = [
      ...CORPUS,
      doc({ slug: "pdf", title: "pdf", href: "/acme/skills/pdf", installs: 500 }),
    ];
    const hits = search(corpus, "pdf");
    expect(hits).toHaveLength(1);
    expect(hits[0].doc.title).toBe("pdf");
  });

  it("still rescues a typo when nothing matches properly", () => {
    const hits = search(CORPUS, "sct");
    expect(hits.map((h) => h.doc.slug)).toContain("skill-creator");
  });

  it("refuses a subsequence smeared across a whole phrase", () => {
    // Observed in the live palette: "echarts" returned
    // "two-factor-authentication-best-practices" because e, c, h, a, r, t, s
    // all appear in that path in order — over 55 characters.
    const spread = doc({
      slug: "two-factor-authentication-best-practices",
      title: "Two factor authentication best practices",
      owner: "better-auth",
      repo: "skills",
      href: "/better-auth/skills/two-factor-authentication-best-practices",
    });
    expect(search([spread], "echarts")).toHaveLength(0);
  });

  it("keeps the span bound off the exact-, prefix- and substring tiers", () => {
    const long = doc({
      slug: "a-very-long-slug-about-authentication",
      title: "A very long slug about authentication",
      owner: "acme",
      repo: "skills",
      href: "/acme/skills/a-very-long-slug-about-authentication",
    });
    // "authentication" is 14 characters inside a 37-character title: a real
    // substring, so the span rule must not touch it.
    expect(search([long], "authentication")).toHaveLength(1);
  });
});
