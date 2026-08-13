/**
 * `skills-lock.json` parsing.
 *
 * The shape is the skills CLI's project-scoped lock (vercel-labs/skills,
 * `src/local-lock.ts`): `{ version, skills: { <name>: { source, sourceType,
 * skillPath, … } } }`, committed to the repo root.
 */

import { describe, expect, it } from "vitest";
import { mergeSkillsLocks, parseSkillsLock } from "./skills-lock";

const LOCK = JSON.stringify({
  version: 1,
  skills: {
    "find-skills": {
      source: "vercel-labs/skills",
      sourceType: "github",
      skillPath: "skills/find-skills/SKILL.md",
      computedHash: "abc",
    },
    pdf: {
      source: "anthropics/skills",
      sourceType: "github",
      skillPath: "skills/pdf/SKILL.md",
      computedHash: "def",
    },
    "my-local": {
      source: "../elsewhere",
      sourceType: "local",
      computedHash: "ghi",
    },
    "from-node-modules": {
      source: "@acme/skills-pack",
      sourceType: "node_modules",
      computedHash: "jkl",
    },
  },
});

describe("parseSkillsLock", () => {
  it("maps lowercased skill names to their GitHub sources", () => {
    const lock = parseSkillsLock(LOCK);
    expect(lock.get("pdf")).toEqual({
      source: "anthropics/skills",
      skillPath: "skills/pdf/SKILL.md",
    });
    expect(lock.get("find-skills")?.source).toBe("vercel-labs/skills");
  });

  it("drops local and node_modules sources — no book to link to", () => {
    const lock = parseSkillsLock(LOCK);
    expect(lock.has("my-local")).toBe(false);
    expect(lock.has("from-node-modules")).toBe(false);
  });

  it("drops sources that are not owner/repo even when typed github", () => {
    const lock = parseSkillsLock(
      JSON.stringify({
        version: 1,
        skills: {
          weird: { source: "https://example.com/x", sourceType: "github" },
        },
      }),
    );
    expect(lock.size).toBe(0);
  });

  it("returns empty on malformed JSON (merge-conflict markers included)", () => {
    expect(parseSkillsLock("<<<<<<< HEAD\n{}\n").size).toBe(0);
    expect(parseSkillsLock("null").size).toBe(0);
    expect(parseSkillsLock('{"skills": 3}').size).toBe(0);
  });

  it("tolerates entries missing optional fields", () => {
    const lock = parseSkillsLock(
      JSON.stringify({
        version: 1,
        skills: { pdf: { source: "anthropics/skills" } },
      }),
    );
    expect(lock.get("pdf")).toEqual({
      source: "anthropics/skills",
      skillPath: null,
    });
  });
});

describe("mergeSkillsLocks", () => {
  it("folds several lock files, later files winning, skipping unreadable ones", () => {
    const a = JSON.stringify({
      version: 1,
      skills: { pdf: { source: "anthropics/skills", sourceType: "github" } },
    });
    const b = JSON.stringify({
      version: 1,
      skills: { pdf: { source: "openai/skills", sourceType: "github" } },
    });
    const merged = mergeSkillsLocks([a, null, b]);
    expect(merged["pdf"].source).toBe("openai/skills");
  });
});
