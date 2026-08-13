import { describe, expect, it } from "vitest";
import { descriptionsAgree, skillSourceCandidates } from "./attribution";
import type { SkillsShOwner, SkillsShSkill } from "./skills-sh";

describe("descriptionsAgree", () => {
  it("agrees on verbatim copies, whitespace and case aside", () => {
    expect(
      descriptionsAgree(
        "Extract text from PDF files.",
        "  extract text from\nPDF files. ",
      ),
    ).toBe(true);
  });

  it("agrees when the origin extended a long description", () => {
    const installed =
      "Extract text and tables from PDF files, fill forms, merge documents.";
    expect(descriptionsAgree(installed, `${installed} Now with OCR support.`)).toBe(
      true,
    );
  });

  it("refuses short prefixes — 'Fix' matching 'Fix everything…' is not identity", () => {
    expect(descriptionsAgree("Fix lint errors", "Fix lint errors in CI and format")).toBe(
      false,
    );
  });

  it("refuses different descriptions and empty ones", () => {
    // facebook/react's internal `fix` skill must not attach to whichever
    // repo happens to publish a skill named `fix`.
    expect(
      descriptionsAgree(
        "Use when you have lint errors, formatting issues, or before committing code.",
        "Automatically fix common CSS layout bugs.",
      ),
    ).toBe(false);
    expect(descriptionsAgree("", "anything")).toBe(false);
    expect(descriptionsAgree("anything", "")).toBe(false);
  });
});

describe("skillSourceCandidates", () => {
  const leaderboard: SkillsShSkill[] = [
    { source: "anthropics/skills", skillId: "pdf", name: "pdf", installs: 9000, weeklyInstalls: [] },
    { source: "someone/pdf-tools", skillId: "pdf", name: "pdf", installs: 40, weeklyInstalls: [] },
    { source: "acme/other", skillId: "docx", name: "docx", installs: 500, weeklyInstalls: [] },
  ];
  const owners: SkillsShOwner[] = [
    {
      owner: "vercel-labs",
      totalInstalls: 100,
      featuredRepo: null,
      featuredSkill: null,
      repos: [
        {
          repo: "vercel-labs/skills",
          totalInstalls: 100,
          skills: [{ name: "find-skills", installs: 100 }],
        },
      ],
    },
  ];

  it("ranks matching sources by installs, best first", () => {
    expect(skillSourceCandidates("pdf", leaderboard, owners)).toEqual([
      "anthropics/skills",
      "someone/pdf-tools",
    ]);
  });

  it("reads the owners payload too, and matches case-insensitively", () => {
    expect(skillSourceCandidates("Find-Skills", leaderboard, owners)).toEqual([
      "vercel-labs/skills",
    ]);
  });

  it("returns nothing for a name nobody publishes", () => {
    expect(skillSourceCandidates("my-internal-thing", leaderboard, owners)).toEqual([]);
  });
});
