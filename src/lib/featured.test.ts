/**
 * Seed catalog and featured-list invariants.
 *
 * The load-bearing one is `showcaseParams()`: `generateStaticParams` returning
 * an empty array is a build error in Next 16, so this file is the guard that
 * stops an editorial change to the seed list from breaking the build.
 */

import { describe, expect, it } from "vitest";
import { SEED_REPOS, SHOWCASE, seedFor } from "./data/seed-repos";
import { allSeedParams, showcaseParams } from "./featured";
import { isGitHubSource } from "./skills-sh";

describe("showcaseParams", () => {
  it("is never empty", () => {
    expect(showcaseParams().length).toBeGreaterThan(0);
  });

  it("prerenders the eight showcase books", () => {
    expect(showcaseParams()).toHaveLength(SHOWCASE.length);
    expect(showcaseParams()).toHaveLength(8);
  });

  it("only names repos that exist in the seed catalog", () => {
    for (const { owner, repo } of showcaseParams()) {
      expect(seedFor(owner, repo)).not.toBeNull();
    }
  });

  it("covers the layout families a build regression would hide", () => {
    const layouts = showcaseParams().map((p) => seedFor(p.owner, p.repo)!.layout);
    expect(layouts.some((l) => l.startsWith("skills/*"))).toBe(true);
    expect(layouts.some((l) => l.includes("/."))).toBe(true);
    expect(layouts.some((l) => l.startsWith("plugins/"))).toBe(true);
    expect(layouts.some((l) => l.startsWith("."))).toBe(true);
  });
});

describe("SEED_REPOS", () => {
  it("holds the 89 verified entries", () => {
    expect(SEED_REPOS).toHaveLength(89);
    expect(allSeedParams()).toHaveLength(89);
  });

  it("has no duplicate owner/repo pairs", () => {
    const keys = SEED_REPOS.map((s) => `${s.owner}/${s.repo}`.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("names only well-formed GitHub repos", () => {
    for (const s of SEED_REPOS) {
      expect(isGitHubSource(`${s.owner}/${s.repo}`)).toBe(true);
      expect(s.branch).toBeTruthy();
    }
  });

  it("records at least one real chapter per book", () => {
    // Install count is not evidence of content — vercel-labs/next-skills has
    // 136k installs and zero SKILL.md — so a zero-skill repo must never be
    // seeded as a featured book.
    for (const s of SEED_REPOS) {
      expect(s.skillCount, `${s.owner}/${s.repo}`).toBeGreaterThan(0);
    }
  });

  it("uses avatars.githubusercontent.com, never a skills.sh image proxy", () => {
    for (const s of SEED_REPOS) {
      expect(s.avatar).toMatch(/^https:\/\/avatars\.githubusercontent\.com\//);
    }
  });

  it("stores every layout in `layouts`, including the dominant one", () => {
    for (const s of SEED_REPOS) {
      expect(s.layouts.length).toBeGreaterThan(0);
      expect(s.layouts).toContain(s.layout);
    }
  });

  it("resolves case-insensitively, because URLs are", () => {
    expect(seedFor("ANTHROPICS", "Skills")?.repo).toBe("skills");
    expect(seedFor("nobody", "nothing")).toBeNull();
  });
});
