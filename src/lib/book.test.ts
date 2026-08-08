/**
 * Book assembly regression tests.
 *
 * Network-free by construction: each fixture is a real `git/trees?recursive=1`
 * response captured with `gh api`, reduced to its SKILL.md blobs (path + short
 * sha, which is all discovery and dedupe read). Counts were confirmed live on
 * 2026-08-08 with `pnpm probe <repo>`; if upstream drifts, re-capture the
 * fixture and update the expectation in the same commit — do not loosen the
 * assertion.
 */

import { describe, expect, it } from "vitest";
import {
  assembleBook,
  chapterNav,
  findSkill,
  groupSkills,
  issueNumberFor,
  skillPathsFor,
} from "./book";
import type { IssueTheme } from "./design/types";
import type { RepoMeta, TreeEntry } from "./github";

/** `owner/repo` → [path, short sha][] for every SKILL.md blob in the tree. */
const TREES: Record<string, Array<[string, string]>> = {
  "anthropics/skills": [
    ["skills/algorithmic-art/SKILL.md", "634f6fa42e4e"],
    ["skills/brand-guidelines/SKILL.md", "47c72c607bdb"],
    ["skills/canvas-design/SKILL.md", "9f63fee82de8"],
    ["skills/claude-api/SKILL.md", "7f61519cc82e"],
    ["skills/doc-coauthoring/SKILL.md", "a5a69839ef4a"],
    ["skills/docx/SKILL.md", "fb954a460a1e"],
    ["skills/frontend-design/SKILL.md", "decdff43d059"],
    ["skills/internal-comms/SKILL.md", "56ea935b74f3"],
    ["skills/mcp-builder/SKILL.md", "8a1a77a47d14"],
    ["skills/pdf/SKILL.md", "d3e046a5ae10"],
    ["skills/pptx/SKILL.md", "41cd2306977f"],
    ["skills/skill-creator/SKILL.md", "65b3a402dbd0"],
    ["skills/slack-gif-creator/SKILL.md", "16660d8ceb77"],
    ["skills/theme-factory/SKILL.md", "90dfceaf2ecd"],
    ["skills/web-artifacts-builder/SKILL.md", "8b39b19f259b"],
    ["skills/webapp-testing/SKILL.md", "4726215301db"],
    ["skills/xlsx/SKILL.md", "9da54804cc8c"],
    ["template/SKILL.md", "50a4f9b10435"],
  ],
  "openai/skills": [
    ["skills/.curated/aspnet-core/SKILL.md", "c71ed6e705c4"],
    ["skills/.curated/chatgpt-apps/SKILL.md", "6280a08c57db"],
    ["skills/.curated/cli-creator/SKILL.md", "60e5a9a03f89"],
    ["skills/.curated/cloudflare-deploy/SKILL.md", "e2d73abb7e5a"],
    ["skills/.curated/define-goal/SKILL.md", "87f111bd700e"],
    ["skills/.curated/figma-code-connect-components/SKILL.md", "d417e16baf15"],
    ["skills/.curated/figma-create-design-system-rules/SKILL.md", "42cc4ce83827"],
    ["skills/.curated/figma-create-new-file/SKILL.md", "8f74967b9bb4"],
    ["skills/.curated/figma-generate-design/SKILL.md", "f71d7e71600e"],
    ["skills/.curated/figma-generate-library/SKILL.md", "0c162901c29d"],
    ["skills/.curated/figma-implement-design/SKILL.md", "9aacde6657a9"],
    ["skills/.curated/figma-use/SKILL.md", "4b0e23f53d81"],
    ["skills/.curated/figma/SKILL.md", "b4f18d2969fe"],
    ["skills/.curated/gh-address-comments/SKILL.md", "0ee19e080dc9"],
    ["skills/.curated/gh-fix-ci/SKILL.md", "76bdeb6a7bff"],
    ["skills/.curated/hatch-pet/SKILL.md", "5f6e79a444d2"],
    ["skills/.curated/jupyter-notebook/SKILL.md", "e1d1748cac9e"],
    ["skills/.curated/linear/SKILL.md", "6982ccbe4835"],
    ["skills/.curated/migrate-to-codex/SKILL.md", "b1c001b70e8c"],
    ["skills/.curated/netlify-deploy/SKILL.md", "52075090a664"],
    ["skills/.curated/notion-knowledge-capture/SKILL.md", "5d347f66e6b4"],
    ["skills/.curated/notion-meeting-intelligence/SKILL.md", "efc716839ee6"],
    ["skills/.curated/notion-research-documentation/SKILL.md", "4bd40dbe0eb8"],
    ["skills/.curated/notion-spec-to-implementation/SKILL.md", "d6a0a0e0fb35"],
    ["skills/.curated/openai-docs/SKILL.md", "ec6a2b06e4bc"],
    ["skills/.curated/pdf/SKILL.md", "fd5d56058f10"],
    ["skills/.curated/playwright-interactive/SKILL.md", "7d85f8284014"],
    ["skills/.curated/playwright/SKILL.md", "77c01afb31aa"],
    ["skills/.curated/render-deploy/SKILL.md", "a0f78c13b07d"],
    ["skills/.curated/screenshot/SKILL.md", "1d967bfb1d7d"],
    ["skills/.curated/security-best-practices/SKILL.md", "45ccbd8d671c"],
    ["skills/.curated/security-ownership-map/SKILL.md", "0164d0d88098"],
    ["skills/.curated/security-threat-model/SKILL.md", "abd3c1c95d49"],
    ["skills/.curated/sentry/SKILL.md", "c94f7efa9d51"],
    ["skills/.curated/speech/SKILL.md", "54727b1f8483"],
    ["skills/.curated/transcribe/SKILL.md", "757576f9bbd1"],
    ["skills/.curated/vercel-deploy/SKILL.md", "a7e6faf3b999"],
    ["skills/.curated/winui-app/SKILL.md", "28e67e8677f0"],
    ["skills/.curated/yeet/SKILL.md", "acce5634f720"],
    ["skills/.system/imagegen/SKILL.md", "88195882efde"],
    ["skills/.system/openai-docs/SKILL.md", "df395fb44274"],
    ["skills/.system/plugin-creator/SKILL.md", "5108f549a7d6"],
    ["skills/.system/skill-creator/SKILL.md", "72bc0b97e7a6"],
    ["skills/.system/skill-installer/SKILL.md", "8ca23bf83337"],
  ],
  "pbakaus/impeccable": [
    [".agents/skills/impeccable/SKILL.md", "de54a3ae215d"],
    [".claude/skills/impeccable/SKILL.md", "f89c3f92abe3"],
    [".cursor/skills/impeccable/SKILL.md", "a3676270a041"],
    [".gemini/skills/impeccable/SKILL.md", "8c6ec5bd5ad9"],
    [".github/skills/impeccable/SKILL.md", "aac5c5f38218"],
    [".grok/skills/impeccable/SKILL.md", "6381ee8b4d32"],
    [".kiro/skills/impeccable/SKILL.md", "066a82aa3fa0"],
    [".opencode/skills/impeccable/SKILL.md", "a3c09b266f24"],
    [".pi/skills/impeccable/SKILL.md", "0186716945e8"],
    [".qoder/skills/impeccable/SKILL.md", "cc683fe90216"],
    [".rovodev/skills/impeccable/SKILL.md", "5a7037414687"],
    [".trae-cn/skills/impeccable/SKILL.md", "660b99489770"],
    [".trae/skills/impeccable/SKILL.md", "d0bf938765e2"],
    [".vibe/skills/impeccable/SKILL.md", "ef911bf1d6e4"],
    ["plugin/skills/impeccable/SKILL.md", "f89c3f92abe3"],
  ],
  "microsoft/azure-skills": [
    [".github/plugins/azure-skills/skills/airunway-aks-setup/SKILL.md", "48df683b3762"],
    [".github/plugins/azure-skills/skills/appinsights-instrumentation/SKILL.md", "1febee945655"],
    [".github/plugins/azure-skills/skills/azure-ai/SKILL.md", "55e8b924e6f3"],
    [".github/plugins/azure-skills/skills/azure-aigateway/SKILL.md", "2a02dbfc3871"],
    [".github/plugins/azure-skills/skills/azure-app-onboard-prereq/SKILL.md", "4d2bc148f6a3"],
    [".github/plugins/azure-skills/skills/azure-app-onboard/SKILL.md", "4c8e0b96ae53"],
    [".github/plugins/azure-skills/skills/azure-app-onboard/deploy/SKILL.md", "22f2b21f005c"],
    [".github/plugins/azure-skills/skills/azure-app-onboard/prepare/SKILL.md", "dbe9d9e93f62"],
    [".github/plugins/azure-skills/skills/azure-app-onboard/scaffold/SKILL.md", "24e461da90d1"],
    [".github/plugins/azure-skills/skills/azure-cloud-migrate/SKILL.md", "67bf6c53496b"],
    [".github/plugins/azure-skills/skills/azure-compliance/SKILL.md", "1af8f8afb818"],
    [".github/plugins/azure-skills/skills/azure-compute/SKILL.md", "8a1d1eabfe5c"],
    [".github/plugins/azure-skills/skills/azure-cost/SKILL.md", "6415f74b278e"],
    [".github/plugins/azure-skills/skills/azure-deploy/SKILL.md", "911caa7e6d5c"],
    [".github/plugins/azure-skills/skills/azure-diagnostics/SKILL.md", "575f7bbbcccf"],
    [".github/plugins/azure-skills/skills/azure-enterprise-infra-planner/SKILL.md", "1babce75d8a0"],
    [".github/plugins/azure-skills/skills/azure-kubernetes/SKILL.md", "597a87a4e7ff"],
    [".github/plugins/azure-skills/skills/azure-kubernetes/azure-kubernetes-automatic-readiness/SKILL.md", "452449d067b9"],
    [".github/plugins/azure-skills/skills/azure-kusto/SKILL.md", "f38550b877b7"],
    [".github/plugins/azure-skills/skills/azure-messaging/SKILL.md", "9a92df2d9548"],
    [".github/plugins/azure-skills/skills/azure-prepare/SKILL.md", "c2febedf2a9f"],
    [".github/plugins/azure-skills/skills/azure-quotas/SKILL.md", "d63e38e2d046"],
    [".github/plugins/azure-skills/skills/azure-reliability/SKILL.md", "3d067da26938"],
    [".github/plugins/azure-skills/skills/azure-resource-lookup/SKILL.md", "f9f827553f6a"],
    [".github/plugins/azure-skills/skills/azure-resource-visualizer/SKILL.md", "4d5266feda81"],
    [".github/plugins/azure-skills/skills/azure-storage/SKILL.md", "e6ddfe8a8a71"],
    [".github/plugins/azure-skills/skills/azure-upgrade/SKILL.md", "ae851861e22d"],
    [".github/plugins/azure-skills/skills/azure-validate/SKILL.md", "92f74dcc7b6e"],
    [".github/plugins/azure-skills/skills/entra-agent-id/SKILL.md", "ec3318657c97"],
    [".github/plugins/azure-skills/skills/entra-app-registration/SKILL.md", "f7f472ade6f8"],
    [".github/plugins/azure-skills/skills/microsoft-foundry/SKILL.md", "4d38b2424dd3"],
    [".github/plugins/azure-skills/skills/microsoft-foundry/finetuning/SKILL.md", "428b2f364850"],
    [".github/plugins/azure-skills/skills/microsoft-foundry/models/deploy-model/SKILL.md", "fd954ccf1ed9"],
    [".github/plugins/azure-skills/skills/microsoft-foundry/models/deploy-model/capacity/SKILL.md", "46935315ebdf"],
    [".github/plugins/azure-skills/skills/microsoft-foundry/models/deploy-model/customize/SKILL.md", "eb4887175301"],
    [".github/plugins/azure-skills/skills/microsoft-foundry/models/deploy-model/preset/SKILL.md", "deec344e2ac5"],
    [".github/plugins/azure-skills/skills/python-appservice-deploy/SKILL.md", "ca5cc00ee360"],
    ["skills/airunway-aks-setup/SKILL.md", "48df683b3762"],
    ["skills/appinsights-instrumentation/SKILL.md", "1febee945655"],
    ["skills/azure-ai/SKILL.md", "55e8b924e6f3"],
    ["skills/azure-aigateway/SKILL.md", "2a02dbfc3871"],
    ["skills/azure-app-onboard-prereq/SKILL.md", "4d2bc148f6a3"],
    ["skills/azure-app-onboard/SKILL.md", "4c8e0b96ae53"],
    ["skills/azure-app-onboard/deploy/SKILL.md", "22f2b21f005c"],
    ["skills/azure-app-onboard/prepare/SKILL.md", "dbe9d9e93f62"],
    ["skills/azure-app-onboard/scaffold/SKILL.md", "24e461da90d1"],
    ["skills/azure-cloud-migrate/SKILL.md", "67bf6c53496b"],
    ["skills/azure-compliance/SKILL.md", "1af8f8afb818"],
    ["skills/azure-compute/SKILL.md", "8a1d1eabfe5c"],
    ["skills/azure-cost/SKILL.md", "6415f74b278e"],
    ["skills/azure-deploy/SKILL.md", "911caa7e6d5c"],
    ["skills/azure-diagnostics/SKILL.md", "575f7bbbcccf"],
    ["skills/azure-enterprise-infra-planner/SKILL.md", "1babce75d8a0"],
    ["skills/azure-kubernetes/SKILL.md", "597a87a4e7ff"],
    ["skills/azure-kubernetes/azure-kubernetes-automatic-readiness/SKILL.md", "452449d067b9"],
    ["skills/azure-kusto/SKILL.md", "f38550b877b7"],
    ["skills/azure-messaging/SKILL.md", "9a92df2d9548"],
    ["skills/azure-prepare/SKILL.md", "c2febedf2a9f"],
    ["skills/azure-quotas/SKILL.md", "d63e38e2d046"],
    ["skills/azure-reliability/SKILL.md", "3d067da26938"],
    ["skills/azure-resource-lookup/SKILL.md", "f9f827553f6a"],
    ["skills/azure-resource-visualizer/SKILL.md", "4d5266feda81"],
    ["skills/azure-storage/SKILL.md", "e6ddfe8a8a71"],
    ["skills/azure-upgrade/SKILL.md", "ae851861e22d"],
    ["skills/azure-validate/SKILL.md", "92f74dcc7b6e"],
    ["skills/entra-agent-id/SKILL.md", "ec3318657c97"],
    ["skills/entra-app-registration/SKILL.md", "f7f472ade6f8"],
    ["skills/microsoft-foundry/SKILL.md", "4d38b2424dd3"],
    ["skills/microsoft-foundry/finetuning/SKILL.md", "428b2f364850"],
    ["skills/microsoft-foundry/models/deploy-model/SKILL.md", "fd954ccf1ed9"],
    ["skills/microsoft-foundry/models/deploy-model/capacity/SKILL.md", "46935315ebdf"],
    ["skills/microsoft-foundry/models/deploy-model/customize/SKILL.md", "eb4887175301"],
    ["skills/microsoft-foundry/models/deploy-model/preset/SKILL.md", "deec344e2ac5"],
    ["skills/python-appservice-deploy/SKILL.md", "ca5cc00ee360"],
  ],
  "langchain-ai/deepagents": [
    ["examples/content-builder-agent/skills/blog-post/SKILL.md", "b3e07dfbb101"],
    ["examples/content-builder-agent/skills/social-media/SKILL.md", "344e94f408af"],
    ["examples/deploy-coding-agent/skills/code-review/SKILL.md", "f070cf58322e"],
    ["examples/deploy-coding-agent/skills/coding-prefs/SKILL.md", "6de6a957d598"],
    ["examples/deploy-coding-agent/skills/planning/SKILL.md", "ae81adfba912"],
    ["examples/deploy-content-writer/skills/blog-post/SKILL.md", "484c0cbee7bf"],
    ["examples/deploy-content-writer/skills/social-media/SKILL.md", "42dcb82589b2"],
    ["examples/deploy-gtm-agent/skills/competitor-analysis/SKILL.md", "9fa45e76a15b"],
    ["examples/deploy-gtm-agent/subagents/market-researcher/skills/analyze-market/SKILL.md", "8c118ef0bc35"],
    ["examples/nvidia_deep_agent/skills/cudf-analytics/SKILL.md", "399d0503cdaf"],
    ["examples/nvidia_deep_agent/skills/cuml-machine-learning/SKILL.md", "62208288a15e"],
    ["examples/nvidia_deep_agent/skills/data-visualization/SKILL.md", "03f311880ee9"],
    ["examples/nvidia_deep_agent/skills/gpu-document-processing/SKILL.md", "a5fbcf3f228f"],
    ["examples/text-to-sql-agent/skills/query-writing/SKILL.md", "a50d53cd4b5e"],
    ["examples/text-to-sql-agent/skills/schema-exploration/SKILL.md", "b67c5e76af57"],
    ["libs/cli/examples/deploy-content-writer/skills/blog-post/SKILL.md", "686563e1ad8b"],
    ["libs/cli/examples/deploy-content-writer/skills/social-media/SKILL.md", "ab8fb205ca4c"],
    ["libs/cli/examples/skills/arxiv-search/SKILL.md", "acb9afcf58e1"],
    ["libs/cli/examples/skills/langgraph-docs/SKILL.md", "bb2126237ba7"],
    ["libs/cli/examples/skills/skill-creator/SKILL.md", "92246e147d0a"],
    ["libs/cli/examples/skills/web-research/SKILL.md", "63424a2c5ea3"],
    ["libs/cli/tests/unit_tests/deploy/fixtures/projects/subagent_with_local_skills/subagents/researcher/skills/note/SKILL.md", "794674488ae1"],
    ["libs/cli/tests/unit_tests/deploy/fixtures/projects/with_skills/skills/summarize/SKILL.md", "34dc33a20a04"],
    ["libs/code/deepagents_code/built_in_skills/deepagents-thread-inspector/SKILL.md", "a59c8d8a7f13"],
    ["libs/code/deepagents_code/built_in_skills/remember/SKILL.md", "d1d86fa453e2"],
    ["libs/code/deepagents_code/built_in_skills/skill-creator/SKILL.md", "80f5cf97ec72"],
    ["libs/code/examples/skills/arxiv-search/SKILL.md", "acb9afcf58e1"],
    ["libs/code/examples/skills/langgraph-docs/SKILL.md", "bb2126237ba7"],
    ["libs/code/examples/skills/skill-creator/SKILL.md", "92246e147d0a"],
    ["libs/code/examples/skills/web-research/SKILL.md", "63424a2c5ea3"],
  ],
  "vercel-labs/next-skills": [
  ],};

function treeFor(full: string): TreeEntry[] {
  return TREES[full].map(([path, sha]) => ({ path, type: "blob" as const, sha }));
}

function repoMeta(full: string): RepoMeta {
  const [owner, repo] = full.split("/");
  return {
    owner,
    repo,
    fullName: full,
    defaultBranch: "main",
    description: null,
    homepage: null,
    stars: 0,
    forks: 0,
    watchers: 0,
    openIssues: 0,
    topics: [],
    license: null,
    pushedAt: null,
    createdAt: null,
    archived: false,
    isFork: false,
    htmlUrl: `https://github.com/${full}`,
    ownerAvatar: "",
    ownerType: "Organization",
    ownerUrl: `https://github.com/${owner}`,
  };
}

const THEME: IssueTheme = {
  owner: "test",
  hue: 0,
  chroma: 0.1,
  accentLight: "oklch(0.52 0.1 0)",
  accentDark: "oklch(0.7 0.1 0)",
  accentForegroundLight: "oklch(1 0 0)",
  accentForegroundDark: "oklch(0.1 0 0)",
  accentLightHc: "oklch(0.42 0.1 0)",
  accentDarkHc: "oklch(0.8 0.1 0)",
  ink: null,
  chartLight: [],
  chartDark: [],
  radiusPx: null,
  displayFont: null,
  bodyFont: null,
  monoFont: null,
  origin: "name-hash",
};

/** A minimal spec-valid SKILL.md for a given directory name. */
function body(name: string): string {
  return `---\nname: ${name}\ndescription: A test skill named ${name}.\n---\n\n# ${name}\n\nSome prose about ${name}.\n`;
}

function bookFrom(full: string) {
  const entries = treeFor(full);
  const [, repoName] = full.split("/");
  const paths = skillPathsFor(entries, repoName);
  return assembleBook({
    repo: repoMeta(full),
    owner: null,
    entries,
    truncated: false,
    readme: null,
    sources: paths.map((p) => {
      const dir = p.slice(0, p.lastIndexOf("/"));
      return body(dir === "" ? repoName : dir.slice(dir.lastIndexOf("/") + 1));
    }),
    theme: THEME,
  });
}

describe("chapter counts against captured real trees", () => {
  it("anthropics/skills yields 17 chapters (18 SKILL.md, one is a template)", () => {
    expect(TREES["anthropics/skills"]).toHaveLength(18);
    expect(bookFrom("anthropics/skills").skills).toHaveLength(17);
  });

  it("openai/skills yields 44 — dot-directory traversal must be enabled", () => {
    const book = bookFrom("openai/skills");
    expect(book.skills).toHaveLength(44);
    // 39 curated + 5 system, all hidden under a dot-prefixed segment.
    const dotted = book.skills.filter((s) => s.skillMdPath.includes("/."));
    expect(dotted).toHaveLength(44);
  });

  it("pbakaus/impeccable collapses 15 per-agent mirrors into 1 chapter", () => {
    expect(TREES["pbakaus/impeccable"]).toHaveLength(15);
    const book = bookFrom("pbakaus/impeccable");
    expect(book.skills).toHaveLength(1);
    expect(book.skills[0].variants).toHaveLength(14);
    // The canonical copy must not be one of the hidden mirrors.
    expect(book.skills[0].skillMdPath.startsWith(".")).toBe(false);
  });

  it("microsoft/azure-skills dedupes its two parallel skill trees", () => {
    expect(TREES["microsoft/azure-skills"]).toHaveLength(74);
    const book = bookFrom("microsoft/azure-skills");
    expect(book.skills).toHaveLength(37);
    expect(book.skills.filter((s) => s.variants.length > 0)).toHaveLength(37);
    expect(new Set(book.skills.map((s) => s.slug)).size).toBe(37);
  });

  it("langchain-ai/deepagents excludes the 12-slash test fixture", () => {
    const book = bookFrom("langchain-ai/deepagents");
    expect(book.skills).toHaveLength(3);
    expect(
      book.skills.some((s) => s.skillMdPath.includes("/fixtures/")),
    ).toBe(false);
    expect(
      book.skills.some((s) => s.skillMdPath.includes("/tests/")),
    ).toBe(false);
  });

  it("a repo with zero SKILL.md returns an empty book without throwing", () => {
    expect(TREES["vercel-labs/next-skills"]).toHaveLength(0);
    const book = bookFrom("vercel-labs/next-skills");
    expect(book.skills).toEqual([]);
    expect(book.parts).toEqual([{ group: "", title: "Skills", skills: [] }]);
    expect(book.totalWords).toBe(0);
    expect(book.layouts).toEqual([]);
    expect(book.issueNumber).toBeGreaterThan(0);
  });
});

describe("assembleBook", () => {
  it("survives a body that failed to download", () => {
    const entries = treeFor("anthropics/skills");
    const paths = skillPathsFor(entries, "skills");
    const sources = paths.map((_, i) => (i === 0 ? null : body("x")));
    const book = assembleBook({
      repo: repoMeta("anthropics/skills"),
      owner: null,
      entries,
      truncated: false,
      readme: null,
      sources,
      theme: THEME,
    });
    expect(book.skills).toHaveLength(16);
  });

  it("records every distinct path layout for the colophon", () => {
    const book = bookFrom("openai/skills");
    expect(book.layouts.sort()).toEqual([
      "skills/.curated/*/SKILL.md",
      "skills/.system/*/SKILL.md",
    ]);
  });

  it("defaults signal and marketplace to null rather than undefined", () => {
    const book = bookFrom("anthropics/skills");
    expect(book.signal).toBeNull();
    expect(book.marketplace).toBeNull();
    expect(book.theme).toBe(THEME);
  });

  it("totals words and reading minutes across chapters", () => {
    const book = bookFrom("anthropics/skills");
    expect(book.totalWords).toBeGreaterThan(0);
    expect(book.totalWords).toBe(
      book.skills.reduce((n, s) => n + s.wordCount, 0),
    );
    expect(book.totalReadingMinutes).toBe(book.skills.length);
  });
});

describe("issueNumberFor", () => {
  it("is deterministic and in 1..99", () => {
    for (const full of Object.keys(TREES)) {
      const n = issueNumberFor(full);
      expect(n).toBe(issueNumberFor(full));
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(99);
    }
  });

  it("distinguishes repos that differ by one character", () => {
    expect(issueNumberFor("anthropics/skills")).not.toBe(
      issueNumberFor("anthropics/skill"),
    );
  });

  it("spreads a large sample across most of the range", () => {
    const seen = new Set(
      Array.from({ length: 500 }, (_, i) => issueNumberFor(`owner${i}/skills`)),
    );
    expect(seen.size).toBeGreaterThan(90);
  });
});

describe("navigation helpers", () => {
  it("groups only when grouping actually partitions the set", () => {
    const book = bookFrom("openai/skills");
    // openai splits into Curated (39) and System (5).
    expect(book.parts.map((p) => p.title).sort()).toEqual(["Curated", "System"]);
    expect(book.parts.reduce((n, p) => n + p.skills.length, 0)).toBe(44);
  });

  it("returns a single part when no meaningful grouping exists", () => {
    expect(groupSkills(bookFrom("anthropics/skills").skills)).toHaveLength(1);
  });

  it("walks prev/next across the chapter list", () => {
    const book = bookFrom("anthropics/skills");
    const first = book.skills[0].slug;
    const last = book.skills[book.skills.length - 1].slug;
    expect(chapterNav(book, first).prev).toBeNull();
    expect(chapterNav(book, first).next?.slug).toBe(book.skills[1].slug);
    expect(chapterNav(book, last).next).toBeNull();
    expect(chapterNav(book, "nope")).toEqual({ index: -1, prev: null, next: null });
    expect(findSkill(book, first)?.slug).toBe(first);
    expect(findSkill(book, "nope")).toBeUndefined();
  });
});
