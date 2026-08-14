/**
 * Serializer and licence-hygiene tests.
 *
 * The licence rules are the ones most likely to be broken by a well-meaning
 * later edit, and breaking them means republishing someone's content without
 * permission. Every rule in the module header has an assertion here.
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SITE_NAME } from "@/lib/site";
import { assembleBook, type Book } from "./book";
import type { IssueTheme } from "./design/types";
import type { RepoMeta, TreeEntry } from "./github";
import {
  AGENT_SKILLS_SCHEMA,
  SITE_SKILL_MD,
  absolutiseLinks,
  bookToAgentSkills,
  bookToMarkdown,
  chapterLicence,
  classifyUpstreamError,
  failureFromProbe,
  normaliseSpdx,
  repoLicence,
  siteLlmsTxt,
  skillToMarkdown,
} from "./serialize";
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

function repoMeta(
  full: string,
  license: RepoMeta["license"] = null,
): RepoMeta {
  const [owner, repo] = full.split("/");
  return {
    owner,
    repo,
    fullName: full,
    defaultBranch: "main",
    description: "A repository of skills.",
    homepage: null,
    stars: 1234,
    forks: 5,
    watchers: 5,
    openIssues: 0,
    topics: [],
    license,
    pushedAt: "2026-07-22T14:02:11Z",
    createdAt: "2025-10-16T00:00:00Z",
    archived: false,
    isFork: false,
    htmlUrl: `https://github.com/${full}`,
    ownerAvatar: "https://avatars.githubusercontent.com/u/1?v=4",
    ownerType: "Organization",
    ownerUrl: `https://github.com/${owner}`,
  };
}

const SOURCE_ALPHA = `---
name: alpha
description: The first skill. Use when testing.
---

# Alpha

Body of alpha, with a *deliberate*  double space and trailing newline.
`;

const SOURCE_BETA = `---
name: beta
description: The second skill.
license: MIT
---

# Beta

Body of beta.
`;

interface Fixture {
  /** Extra blobs beyond the SKILL.md files, e.g. per-skill LICENSE files. */
  extra?: string[];
  license?: RepoMeta["license"];
}

function makeBook({ extra = [], license = null }: Fixture = {}): Book {
  const paths = ["skills/alpha/SKILL.md", "skills/beta/SKILL.md"];
  const entries: TreeEntry[] = [...paths, ...extra].map((path, i) => ({
    path,
    type: "blob" as const,
    sha: `sha${i}`,
    size: 100,
  }));

  return assembleBook({
    repo: repoMeta("acme/skills", license),
    owner: null,
    entries,
    truncated: false,
    readme: "# acme/skills\n\nThe README.",
    sources: [SOURCE_ALPHA, SOURCE_BETA],
    theme: THEME,
  });
}

const RAW = new Map([
  ["alpha", SOURCE_ALPHA],
  ["beta", SOURCE_BETA],
]);

describe("normaliseSpdx", () => {
  it("canonicalises known ids case-insensitively", () => {
    expect(normaliseSpdx("mit")).toBe("MIT");
    expect(normaliseSpdx("APACHE-2.0")).toBe("Apache-2.0");
    expect(normaliseSpdx("Apache 2.0")).toBe("Apache-2.0");
    expect(normaliseSpdx("MIT License")).toBe("MIT");
  });

  it("refuses to guess", () => {
    expect(normaliseSpdx("NOASSERTION")).toBeNull();
    expect(normaliseSpdx("other")).toBeNull();
    expect(normaliseSpdx("see LICENSE")).toBeNull();
    expect(normaliseSpdx(null)).toBeNull();
    expect(normaliseSpdx("")).toBeNull();
  });
});

describe("licence resolution", () => {
  it("reports no licence when GitHub found none", () => {
    const licence = repoLicence(repoMeta("acme/skills"));
    expect(licence.scope).toBe("none");
    expect(licence.redistributable).toBe(false);
  });

  it("accepts an unclassified licence file as a grant", () => {
    const licence = repoLicence(
      repoMeta("acme/skills", { key: "other", name: "Other", spdxId: "NOASSERTION" }),
    );
    expect(licence.spdx).toBeNull();
    expect(licence.redistributable).toBe(true);
    expect(licence.scope).toBe("repo");
  });

  it("prefers a skill's own frontmatter licence over the repo's", () => {
    const book = makeBook({
      license: { key: "apache-2.0", name: "Apache License 2.0", spdxId: "Apache-2.0" },
    });
    const beta = book.skills.find((s) => s.slug === "beta")!;
    expect(chapterLicence(book, beta)).toMatchObject({ spdx: "MIT", scope: "skill" });
  });

  it("treats a LICENSE file inside the skill directory as a skill-level grant", () => {
    // This is the `anthropics/skills` shape: no root LICENSE, sixteen per-skill
    // ones, and GitHub reporting `license: null` for the repository.
    const book = makeBook({ extra: ["skills/alpha/LICENSE.txt"] });
    const alpha = book.skills.find((s) => s.slug === "alpha")!;
    const licence = chapterLicence(book, alpha);
    expect(licence.scope).toBe("skill");
    expect(licence.redistributable).toBe(true);
    expect(licence.url).toContain("skills/alpha/LICENSE.txt");
  });

  it("falls through to nothing when neither level declares one", () => {
    const book = makeBook();
    const alpha = book.skills.find((s) => s.slug === "alpha")!;
    expect(chapterLicence(book, alpha).redistributable).toBe(false);
  });
});

describe("bookToMarkdown", () => {
  const licensed = makeBook({
    license: { key: "mit", name: "MIT License", spdxId: "MIT" },
  });

  it("opens with YAML frontmatter naming the source, ref and licence", () => {
    const md = bookToMarkdown(licensed, { raw: RAW, now: new Date(0) });
    expect(md.startsWith("---\n")).toBe(true);
    expect(md).toContain("source: https://github.com/acme/skills");
    expect(md).toContain("ref: main");
    expect(md).toContain("license: MIT");
    expect(md).toContain(`canonical: ${SITE_URL}/acme/skills`);
  });

  it("inlines every chapter verbatim, frontmatter intact", () => {
    const md = bookToMarkdown(licensed, { raw: RAW });
    expect(md).toContain(SOURCE_ALPHA.trimEnd());
    expect(md).toContain(SOURCE_BETA.trimEnd());
  });

  it("includes the README as the book's front matter", () => {
    const md = bookToMarkdown(licensed, { raw: RAW });
    expect(md).toContain("## Front matter");
    expect(md).toContain("The README.");
  });

  it("withholds unlicensed bodies but still links them", () => {
    const unlicensed = makeBook();
    const md = bookToMarkdown(unlicensed, { raw: RAW });
    // `beta` declares MIT in its own frontmatter, so it survives; `alpha` does not.
    expect(md).not.toContain("Body of alpha");
    expect(md).toContain("Body of beta");
    expect(md).toContain("## Licence notice");
    expect(md).toContain(
      "https://github.com/acme/skills/blob/main/skills/alpha/SKILL.md",
    );
  });

  it("carries a takedown contact", () => {
    expect(bookToMarkdown(licensed, { raw: RAW })).toContain("Takedown:");
  });

  it("never emits an unencoded placeholder in the pointer block", () => {
    const md = bookToMarkdown(licensed, { raw: RAW });
    expect(md).toContain("/acme/skills/<skill>.md");
    expect(md).not.toContain("%3Cskill%3E");
  });
});

describe("skillToMarkdown", () => {
  const book = makeBook({
    license: { key: "mit", name: "MIT License", spdxId: "MIT" },
  });
  const alpha = book.skills.find((s) => s.slug === "alpha")!;

  it("names the source, ref, licence and raw bytes in the header", () => {
    const md = skillToMarkdown(book, alpha, { raw: RAW });
    expect(md).toContain("https://github.com/acme/skills/blob/main/skills/alpha/SKILL.md");
    expect(md).toContain("@ `main`");
    expect(md).toContain("Licence: MIT");
    expect(md).toContain(
      "https://raw.githubusercontent.com/acme/skills/main/skills/alpha/SKILL.md",
    );
  });

  it("says which skill it is", () => {
    expect(skillToMarkdown(book, alpha, { raw: RAW })).toContain("skill 1 of 2");
  });

  it("reproduces the upstream bytes exactly, frontmatter included", () => {
    const md = skillToMarkdown(book, alpha, { raw: RAW });
    expect(md.endsWith(`${SOURCE_ALPHA.trimEnd()}\n`)).toBe(true);
    expect(md).toContain("description: The first skill. Use when testing.");
  });

  it("withholds the body when no licence is detectable", () => {
    const unlicensed = makeBook();
    const a = unlicensed.skills.find((s) => s.slug === "alpha")!;
    const md = skillToMarkdown(unlicensed, a, { raw: RAW });
    expect(md).not.toContain("Body of alpha");
    expect(md).toContain("No licence could be detected");
  });
});

describe("bookToAgentSkills", () => {
  const licensed = makeBook({
    license: { key: "mit", name: "MIT License", spdxId: "MIT" },
  });
  const digests = new Map([
    ["alpha", { document: "a".repeat(64), source: "1".repeat(64) }],
    ["beta", { document: "b".repeat(64), source: "2".repeat(64) }],
  ]);

  it("emits the Mintlify-compatible fields plus the raw-source pair", () => {
    const manifest = bookToAgentSkills(licensed, digests);
    expect(manifest.$schema).toBe(AGENT_SKILLS_SCHEMA);
    expect(Object.keys(manifest.skills[0]).sort()).toEqual([
      "description",
      "digest",
      "name",
      "source",
      "sourceDigest",
      "type",
      "url",
    ]);
    expect(manifest.skills[0].type).toBe("skill-md");
    expect(manifest.skills[0].digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(manifest.skills[0].url).toBe(`${SITE_URL}/acme/skills/alpha.md`);
  });

  /**
   * The regression the whole entry shape exists for: `digest` used to hash the
   * raw upstream bytes while `url` pointed at our `.md` twin, which prepends a
   * provenance header. `curl <url> | shasum -a 256` failed on 16 of 16 entries
   * for `anthropics/skills`, on every book, while our own published skill told
   * agents to verify it.
   */
  it("pairs each URL with a digest of the bytes that URL serves", () => {
    const document = createHash("sha256")
      .update(skillToMarkdown(licensed, licensed.skills[0], { raw: RAW }), "utf8")
      .digest("hex");
    const source = createHash("sha256").update(SOURCE_ALPHA, "utf8").digest("hex");

    const manifest = bookToAgentSkills(
      licensed,
      new Map([["alpha", { document, source }]]),
    );
    const entry = manifest.skills[0];

    expect(entry.digest).toBe(`sha256:${document}`);
    expect(entry.sourceDigest).toBe(`sha256:${source}`);
    expect(entry.digest).not.toBe(entry.sourceDigest);
    expect(entry.source).toBe(
      "https://raw.githubusercontent.com/acme/skills/main/skills/alpha/SKILL.md",
    );
  });

  it("advertises a $schema on a host that resolves", () => {
    expect(AGENT_SKILLS_SCHEMA.startsWith(SITE_URL)).toBe(true);
    expect(AGENT_SKILLS_SCHEMA).not.toContain("schemas.agentskills.io");
  });

  it("omits unlicensed chapters entirely", () => {
    const manifest = bookToAgentSkills(makeBook(), digests);
    expect(manifest.skills.map((s) => s.name)).toEqual(["beta"]);
  });

  it("omits chapters whose bytes could not be hashed", () => {
    const partial = new Map([
      ["alpha", { document: "c".repeat(64), source: "d".repeat(64) }],
    ]);
    const manifest = bookToAgentSkills(licensed, partial);
    expect(manifest.skills.map((s) => s.name)).toEqual(["alpha"]);
  });
});

describe("siteLlmsTxt", () => {
  const txt = siteLlmsTxt({
    featured: [
      { owner: "anthropics", repo: "skills", description: "Official Agent Skills." },
      { owner: "acme", repo: "skills", description: null },
    ],
  });

  it("follows the llmstxt.org element order", () => {
    const lines = txt.split("\n");
    expect(lines[0]).toBe(`# ${SITE_NAME}`);
    expect(lines[2].startsWith("> ")).toBe(true);

    const headings = lines.filter((l) => l.startsWith("## "));
    expect(headings).toEqual(["## Featured books", "## API", "## Optional"]);
    // The spec gives `## Optional` the meaning "skippable"; it must be last.
    expect(headings.at(-1)).toBe("## Optional");
  });

  it("links books at their .md URLs, as the spec recommends", () => {
    expect(txt).toContain(`[anthropics/skills](${SITE_URL}/anthropics/skills.md)`);
  });

  it("states the licensing position and a takedown route", () => {
    expect(txt).toContain("detectable licence is linked but never inlined");
    expect(txt).toContain("Takedown:");
  });
});

describe("SITE_SKILL_MD", () => {
  it("is a spec-valid SKILL.md", () => {
    expect(SITE_SKILL_MD.startsWith("---\n")).toBe(true);
    const end = SITE_SKILL_MD.indexOf("\n---", 4);
    const frontmatter = SITE_SKILL_MD.slice(4, end);
    const name = /^name: (.+)$/m.exec(frontmatter)?.[1];
    const description = /^description: (.+)$/m.exec(frontmatter)?.[1];
    expect(name).toBe("skills-docs");
    // Spec: name is [a-z0-9-], <= 64 chars; description <= 1024.
    expect(name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(name!.length).toBeLessThanOrEqual(64);
    expect(description!.length).toBeLessThanOrEqual(1024);
  });

  it("never advertises the unverified per-skill install form", () => {
    expect(SITE_SKILL_MD).toContain("npx skills add <owner>/<repo>");
    expect(SITE_SKILL_MD).not.toMatch(/npx skills add <owner>\/<repo>\/<skill>/);
  });
});

/* ------------------------------------------------------- agent-surface fixes */

describe("book markdown is byte-stable and structurally chunkable", () => {
  const licensed = makeBook({
    license: { key: "mit", name: "MIT License", spdxId: "MIT" },
  });

  /**
   * `generated: <now>` changed on every request, so two consecutive fetches of
   * `/anthropics/skills.md` differed by one line and no `ETag` could ever
   * match — 240 KB re-downloaded on every poll.
   */
  it("produces identical bytes on two calls a second apart", () => {
    const a = bookToMarkdown(licensed, { raw: RAW, now: new Date(1_000) });
    const b = bookToMarkdown(licensed, { raw: RAW, now: new Date(2_000) });
    expect(a).toBe(b);
    expect(a).not.toContain("generated:");
    expect(a).toContain("updated: 2026-07-22T14:02:11Z");
  });

  it("puts an SPDX id or null in `license`, never a sentence", () => {
    expect(bookToMarkdown(licensed, { raw: RAW })).toContain("license: MIT");
    const md = bookToMarkdown(makeBook(), { raw: RAW });
    expect(md).toContain("license: null");
    expect(md).toContain('licenseName: "No licence detected"');
    // …and the counts that the prose used to carry alone.
    expect(md).toContain("chapters: 2");
    expect(md).toContain("inlined: 1");
    expect(md).toContain("withheld: 1");
  });

  it("marks every chapter boundary with a named comment", () => {
    const md = bookToMarkdown(licensed, { raw: RAW });
    expect(md).toContain("<!-- chapter:begin slug=alpha position=1 -->");
    expect(md).toContain("<!-- chapter:end slug=alpha -->");
    expect(md).toContain("<!-- chapter:end slug=beta -->");
  });

  it("declares the base a relative link resolves against", () => {
    expect(bookToMarkdown(licensed, { raw: RAW })).toContain(
      "base: https://github.com/acme/skills/blob/main/",
    );
  });

  it("does not advertise an install command for a book with no skills", () => {
    const empty = assembleBook({
      repo: repoMeta("acme/empty"),
      owner: null,
      entries: [],
      truncated: false,
      readme: null,
      sources: [],
      theme: THEME,
    });
    const md = bookToMarkdown(empty);
    expect(md).toContain("_This repository contains no Agent Skills._");
    expect(md).not.toContain("npx skills add");
  });
});

describe("absolutiseLinks", () => {
  const base = "https://github.com/acme/skills/blob/main/";

  it("resolves relative links against the repository tree", () => {
    expect(absolutiseLinks("[a](./skills/x/SKILL.md)", base)).toBe(
      "[a](https://github.com/acme/skills/blob/main/skills/x/SKILL.md)",
    );
    expect(absolutiseLinks("[a](docs/b.md)", base)).toBe(
      "[a](https://github.com/acme/skills/blob/main/docs/b.md)",
    );
    expect(absolutiseLinks("![i](/logo.png)", base)).toBe(
      "![i](https://github.com/acme/skills/blob/main/logo.png)",
    );
  });

  it("leaves absolute URLs, anchors and titles alone", () => {
    expect(absolutiseLinks("[a](https://x.dev/y)", base)).toBe("[a](https://x.dev/y)");
    expect(absolutiseLinks("[a](#heading)", base)).toBe("[a](#heading)");
    expect(absolutiseLinks("[a](//cdn.example/x.png)", base)).toBe(
      "[a](//cdn.example/x.png)",
    );
    expect(absolutiseLinks('[a](x.md "T")', base)).toBe(
      '[a](https://github.com/acme/skills/blob/main/x.md "T")',
    );
  });

  it("rewrites the README inside the aggregate document", () => {
    const book = assembleBook({
      repo: repoMeta("acme/skills", { key: "mit", name: "MIT License", spdxId: "MIT" }),
      owner: null,
      entries: [
        { path: "skills/alpha/SKILL.md", type: "blob", sha: "s0", size: 100 },
      ],
      truncated: false,
      readme: "See [grill-me](./skills/alpha/SKILL.md).",
      sources: [SOURCE_ALPHA],
      theme: THEME,
    });
    expect(bookToMarkdown(book, { raw: RAW })).toContain(
      "[grill-me](https://github.com/acme/skills/blob/main/skills/alpha/SKILL.md)",
    );
  });
});

describe("bundled files", () => {
  const book = makeBook({
    license: { key: "mit", name: "MIT License", spdxId: "MIT" },
    extra: ["skills/alpha/references/schemas.md", "skills/alpha/scripts/init.py"],
  });
  const alpha = book.skills.find((s) => s.slug === "alpha")!;

  /**
   * Without this the `.md` twin is worse than raw GitHub for exactly the
   * skills that need it most: `skill-creator` cites `references/…`,
   * `assets/…` and `scripts/…` at nine call sites and our copy resolved none
   * of them, where an agent on raw GitHub can list the sibling directory.
   */
  it("names each sibling file and its raw URL in the chapter header", () => {
    const md = skillToMarkdown(book, alpha, { raw: RAW });
    expect(md).toContain("Bundled files (2)");
    expect(md).toContain("`references/schemas.md`");
    expect(md).toContain(
      "https://raw.githubusercontent.com/acme/skills/main/skills/alpha/scripts/init.py",
    );
  });

  it("declares the base those relative paths resolve against", () => {
    expect(skillToMarkdown(book, alpha, { raw: RAW })).toContain(
      "Base for relative paths: https://raw.githubusercontent.com/acme/skills/main/skills/alpha/",
    );
  });

  it("says nothing when a skill has no bundled files", () => {
    const bare = makeBook({ license: { key: "mit", name: "MIT License", spdxId: "MIT" } });
    const beta = bare.skills.find((s) => s.slug === "beta")!;
    expect(skillToMarkdown(bare, beta, { raw: RAW })).not.toContain("Bundled files");
  });
});

describe("upstream failure classification", () => {
  /**
   * The exact object a production build hands a route handler when `getBook`
   * rejects and the handler read its params from `ctx.params`. Captured from
   * `next build && next start`: React replaces the `GitHubError` wholesale, so
   * `kind`, `status` and the message are all gone and only `digest` survives.
   */
  const REDACTED = Object.assign(
    new Error(
      "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.",
    ),
    { digest: "1349217415" },
  );

  it("cannot name the redacted error — which is why the probe exists", () => {
    expect(classifyUpstreamError(REDACTED).status).toBe(502);
  });

  it("still names an error that survived intact", () => {
    expect(
      classifyUpstreamError(
        Object.assign(new Error("Not found: /repos/a/b"), { kind: "not-found" }),
      ).status,
    ).toBe(404);
  });

  /**
   * Every agent surface answered 502 for a repository that does not exist, so
   * an agent saw a retryable 5xx for a permanent condition — and
   * `openapi.json` declared a 404 that could never occur.
   */
  it("maps a probe of a missing repository to 404, not 502", () => {
    const f = failureFromProbe({ kind: "not-found" }, "anthropics", "nope");
    expect(f.status).toBe(404);
    expect(f.code).toBe("not_found");
    expect(f.message).toBe("No repository at github.com/anthropics/nope.");
    expect(f.message).not.toContain("Server Components render");
  });

  it("maps an exhausted quota to 429 and names the reset", () => {
    const f = failureFromProbe(
      { kind: "rate-limited", resetAt: "2026-08-08T12:00:00Z" },
      "a",
      "b",
    );
    expect(f.status).toBe(429);
    expect(f.message).toContain("2026-08-08T12:00:00Z");
  });

  it("keeps 502 for a repository that exists, and says where the fault was", () => {
    const f = failureFromProbe({ kind: "ok" }, "anthropics", "skills");
    expect(f.status).toBe(502);
    expect(f.message).toContain("downstream of repository metadata");
  });
});
