/**
 * The gist → book projection, against a fixture shaped like the gists
 * observed in the wild: a description for a title, two flat markdown files,
 * the skill file carrying command-style frontmatter with a `description`
 * but no `name`.
 */

import { describe, expect, it } from "vitest";
import { gistBookInputs } from "./gist";
import type { GistMeta } from "./github";
import { discoverSkills } from "./skills";

const ID = "d2b3f0aa41c59c8b3d42c71794cffc54";

function gist(overrides: Partial<GistMeta> = {}): GistMeta {
  return {
    id: ID,
    owner: "acme",
    ownerAvatar: "https://avatars.githubusercontent.com/u/1?v=4",
    ownerUrl: "https://github.com/acme",
    ownerType: "User",
    description: "PR Review Guide Template",
    isPublic: false,
    htmlUrl: `https://gist.github.com/acme/${ID}`,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-14T00:00:00Z",
    files: [
      {
        name: "create-pr-skill.md",
        size: 3665,
        content:
          "---\ndescription: Create pull requests with GitHub CLI.\n---\n\n# Create Pull Request\n\nBody.",
      },
      {
        name: "pull_request_template.md",
        size: 2536,
        content: "# PR Template\n\n- [ ] Tests",
      },
      { name: "helper.sh", size: 100, content: "echo hi" },
    ],
    ...overrides,
  };
}

describe("gistBookInputs", () => {
  it("projects each markdown file to <stem>/SKILL.md, in discovery order", () => {
    const { entries, sources } = gistBookInputs(gist());

    expect(entries.map((e) => e.path)).toEqual([
      "create-pr-skill/SKILL.md",
      "pull_request_template/SKILL.md",
    ]);

    const stubs = discoverSkills(entries, ID);
    expect(stubs.map((s) => s.slug)).toEqual([
      "create-pr-skill",
      "pull_request_template",
    ]);
    // Sources align with stub order, which is what assembleBook indexes by.
    expect(sources[0]).toContain("Create Pull Request");
    expect(sources[1]).toContain("PR Template");
  });

  it("drops non-markdown files rather than minting unfetchable resources", () => {
    const { entries } = gistBookInputs(gist());
    expect(entries.some((e) => e.path.includes("helper"))).toBe(false);
  });

  it("titles the book from a short description and clears the dek", () => {
    const { repo } = gistBookInputs(gist());
    expect(repo.displayName).toBe("PR Review Guide Template");
    expect(repo.description).toBeNull();
    expect(repo.repo).toBe(ID);
    expect(repo.fullName).toBe(`acme/${ID}`);
    expect(repo.htmlUrl).toBe(`https://gist.github.com/acme/${ID}`);
  });

  it("keeps a long description as the dek and titles from the first file", () => {
    const long =
      "A very long description that reads as a sentence rather than a title, " +
      "well past the eighty-character ceiling for a cover headline.";
    const { repo } = gistBookInputs(gist({ description: long }));
    expect(repo.displayName).toBe("Create PR Skill");
    expect(repo.description).toBe(long);
  });

  it("gives distinct files distinct shas so dedup cannot collapse them", () => {
    const twin = gist({
      files: [
        { name: "alpha.md", size: 4, content: "todo" },
        { name: "beta.md", size: 4, content: "todo" },
      ],
    });
    const { entries } = gistBookInputs(twin);
    expect(new Set(entries.map((e) => e.sha)).size).toBe(2);
    // Identical placeholder bodies under different names stay two chapters.
    expect(discoverSkills(entries, ID)).toHaveLength(2);
  });
});
