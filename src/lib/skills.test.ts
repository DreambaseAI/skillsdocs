/**
 * Regression tests for skill discovery.
 *
 * Every fixture below is a real layout observed in a real repo (noted in the
 * test name). A survey of 157 skills repos / 4,039 SKILL.md paths found that
 * `skills/<slug>/SKILL.md` accounts for only 38% of files, so these shapes are
 * the specification, not edge cases.
 */

import { describe, expect, it } from "vitest";
import type { TreeEntry } from "./github";
import {
  collectResources,
  discoverSkills,
  extractHeadings,
  parseSkill,
  titleCase,
} from "./skills";

/** Build a tree from `sha path` pairs; a bare path gets a synthetic sha. */
function tree(...specs: string[]): TreeEntry[] {
  return specs.map((spec, i) => {
    const [maybeSha, maybePath] = spec.split(/\s+/);
    const path = maybePath ?? maybeSha;
    const sha = maybePath ? maybeSha : `sha${i}`;
    return { path, type: "blob", sha, size: 100 };
  });
}

const slugs = (entries: TreeEntry[], repo = "skills") =>
  discoverSkills(entries, repo).map((s) => s.slug);

describe("layout families", () => {
  it("A: a lone root SKILL.md is named after the repo (temporalio/skill-temporal-developer)", () => {
    expect(slugs(tree("SKILL.md"), "skill-temporal-developer")).toEqual([
      "skill-temporal-developer",
    ]);
  });

  it("B: top-level <slug>/SKILL.md (prisma/skills)", () => {
    expect(slugs(tree("prisma-cli/SKILL.md", "prisma-orm/SKILL.md"))).toEqual([
      "prisma-cli",
      "prisma-orm",
    ]);
  });

  it("C: skills/<slug>/SKILL.md (anthropics/skills)", () => {
    expect(slugs(tree("skills/xlsx/SKILL.md", "skills/pdf/SKILL.md"))).toEqual([
      "pdf",
      "xlsx",
    ]);
  });

  it("D: hidden agent directories (convex-dev/convex)", () => {
    expect(slugs(tree(".claude/skills/convex/SKILL.md"))).toEqual(["convex"]);
  });

  it("E: plugins/<plugin>/skills/<slug> keeps the plugin as the group (expo/skills)", () => {
    const found = discoverSkills(
      tree(
        "plugins/expo/skills/expo-router/SKILL.md",
        "plugins/expo-experiments/skills/expo-migrate-module/SKILL.md",
      ),
      "skills",
    );
    expect(found.map((s) => [s.slug, s.group])).toEqual([
      ["expo-migrate-module", "Expo Experiments"],
      ["expo-router", "Expo"],
    ]);
  });

  it("F: skills/<group>/<slug> yields chapter sections (mattpocock/skills)", () => {
    const found = discoverSkills(
      tree(
        "skills/engineering/code-review/SKILL.md",
        "skills/productivity/ask-matt/SKILL.md",
      ),
      "skills",
    );
    expect(found.map((s) => s.group)).toEqual(["Engineering", "Productivity"]);
  });

  it("G: dot-prefixed segments inside skills/ (openai/skills)", () => {
    const found = discoverSkills(
      tree("skills/.curated/screenshot/SKILL.md", "skills/.system/plugin-creator/SKILL.md"),
      "skills",
    );
    expect(found.map((s) => [s.slug, s.group])).toEqual([
      ["screenshot", "Curated"],
      ["plugin-creator", "System"],
    ]);
  });

  it("H: arbitrary custom prefixes (vercel-labs/agent-browser, encoredev/skills)", () => {
    expect(slugs(tree("skill-data/navigate/SKILL.md"))).toEqual(["navigate"]);
    expect(slugs(tree("encore/encore-api/SKILL.md"))).toEqual(["encore-api"]);
  });

  it("mixes a root SKILL.md with nested ones (datadog-labs/agent-skills)", () => {
    const found = discoverSkills(
      tree("SKILL.md", "dd-apm/service-remapping/SKILL.md"),
      "agent-skills",
    );
    expect(found.map((s) => s.slug).sort()).toEqual(["agent-skills", "service-remapping"]);
    // The repo-level skill must not adopt every other skill as a child.
    expect(found.every((s) => s.parentSlug === null)).toBe(true);
  });
});

describe("deduplication", () => {
  it("collapses 14 per-agent copies with 14 distinct SHAs (pbakaus/impeccable)", () => {
    const dirs = [
      ".agents", ".claude", ".cursor", ".gemini", ".github", ".grok", ".kiro",
      ".opencode", ".pi", ".qoder", ".rovodev", ".trae", ".trae-cn", ".vibe",
    ];
    // Distinct shas: content dedupe alone cannot collapse these.
    const found = discoverSkills(
      tree(...dirs.map((d, i) => `unique${i} ${d}/skills/impeccable/SKILL.md`)),
      "impeccable",
    );
    expect(found).toHaveLength(1);
    expect(found[0].variants).toHaveLength(13);
    expect(found[0].variants.map((v) => v.label)).toContain("Claude");
  });

  it("collapses byte-identical provider mirrors (stripe/agent-toolkit)", () => {
    const found = discoverSkills(
      tree(
        "same providers/claude/plugin/skills/stripe-docs/SKILL.md",
        "same providers/codex/plugin/skills/stripe-docs/SKILL.md",
        "same providers/cursor/plugin/skills/stripe-docs/SKILL.md",
      ),
      "agent-toolkit",
    );
    expect(found).toHaveLength(1);
    expect(found[0].variants.map((v) => v.label).sort()).toEqual(["Codex", "Cursor"]);
  });

  it("prefers the canonical path over the mirror", () => {
    const found = discoverSkills(
      tree("same .github/plugins/azure/skills/aks/SKILL.md", "same skills/aks/SKILL.md"),
      "azure-skills",
    );
    expect(found).toHaveLength(1);
    expect(found[0].skillMdPath).toBe("skills/aks/SKILL.md");
  });

  it("keeps two .claude roots in a monorepo separate (facebook/react)", () => {
    const found = discoverSkills(
      tree(".claude/skills/flow/SKILL.md", "compiler/.claude/skills/compiler-review/SKILL.md"),
      "react",
    );
    expect(found).toHaveLength(2);
    expect(found.every((s) => s.variants.length === 0)).toBe(true);
  });

  it("does not merge same-named skills in different groups (datadog dd-apm)", () => {
    const found = discoverSkills(
      tree(
        "a dd-apm/k8s-ssi/verify-ssi/SKILL.md",
        "b dd-apm/linux-ssi/verify-ssi/SKILL.md",
      ),
      "agent-skills",
    );
    expect(found).toHaveLength(2);
    // Colliding names are qualified by group, not suffixed with -1.
    expect(found.map((s) => s.slug).sort()).toEqual([
      "k8s-ssi-verify-ssi",
      "linux-ssi-verify-ssi",
    ]);
  });

  it("merges the content and position relations into a single group", () => {
    // A and B are byte-identical; B and C are mirror positions.
    const found = discoverSkills(
      tree(
        "x .claude/skills/foo/SKILL.md",
        "x .cursor/skills/foo/SKILL.md",
        "y .gemini/skills/foo/SKILL.md",
      ),
      "repo",
    );
    expect(found).toHaveLength(1);
    expect(found[0].variants).toHaveLength(2);
  });
});

describe("noise exclusion", () => {
  it("drops a root template directory (anthropics/skills)", () => {
    expect(slugs(tree("skills/pdf/SKILL.md", "template/SKILL.md"))).toEqual(["pdf"]);
  });

  it("drops a template bundled as a skill asset (DreambaseAI/skills)", () => {
    expect(
      slugs(
        tree(
          "skills/dreambase-skill-creator/SKILL.md",
          "skills/dreambase-skill-creator/assets/skill-template/SKILL.md",
        ),
      ),
    ).toEqual(["dreambase-skill-creator"]);
  });

  it("drops test fixtures (langchain-ai/deepagents)", () => {
    expect(
      slugs(
        tree(
          "skills/real/SKILL.md",
          "libs/cli/tests/unit_tests/fixtures/projects/x/skills/note/SKILL.md",
        ),
      ),
    ).toEqual(["real"]);
  });

  it("drops docs examples (google-gemini/gemini-cli)", () => {
    expect(
      slugs(
        tree(
          "skills/real/SKILL.md",
          "packages/cli/src/commands/extensions/examples/skills/greeter/SKILL.md",
        ),
      ),
    ).toEqual(["real"]);
  });

  it("keeps a skill whose own name merely contains a noise word", () => {
    expect(slugs(tree("plugins/expo/skills/expo-examples/SKILL.md"))).toEqual([
      "expo-examples",
    ]);
  });

  it("ignores vendored trees", () => {
    expect(slugs(tree("skills/real/SKILL.md", "node_modules/pkg/skills/x/SKILL.md"))).toEqual([
      "real",
    ]);
  });

  it("matches SKILL.md case-insensitively but not other filenames", () => {
    expect(slugs(tree("skills/a/skill.md", "skills/b/SKILLS.md", "skills/c/README.md"))).toEqual(
      ["a"],
    );
  });
});

describe("nesting", () => {
  it("links a nested skill to its nearest enclosing skill (microsoft/azure-skills)", () => {
    const found = discoverSkills(
      tree(
        "skills/microsoft-foundry/SKILL.md",
        "skills/microsoft-foundry/models/SKILL.md",
        "skills/microsoft-foundry/models/deploy-model/SKILL.md",
      ),
      "azure-skills",
    );
    const bySlug = Object.fromEntries(found.map((s) => [s.slug, s]));
    expect(bySlug["microsoft-foundry"].parentSlug).toBeNull();
    expect(bySlug["models"].parentSlug).toBe("microsoft-foundry");
    expect(bySlug["deploy-model"].parentSlug).toBe("models");
  });
});

describe("collectResources", () => {
  const entries = tree(
    "skills/pdf/SKILL.md",
    "skills/pdf/scripts/extract.py",
    "skills/pdf/references/FORMS.md",
    "skills/pdf/assets/template.pdf",
    "skills/pdf/notes.txt",
    "skills/pdf/nested/SKILL.md",
    "skills/pdf/nested/helper.py",
    "skills/other/SKILL.md",
  );
  const [pdf] = discoverSkills(entries, "skills").filter((s) => s.slug === "pdf");

  it("classifies bundled files by convention", () => {
    const res = collectResources(entries, pdf);
    const byPath = Object.fromEntries(res.map((r) => [r.relPath, r.kind]));
    expect(byPath["scripts/extract.py"]).toBe("script");
    expect(byPath["references/FORMS.md"]).toBe("reference");
    expect(byPath["assets/template.pdf"]).toBe("asset");
    expect(byPath["notes.txt"]).toBe("other");
  });

  it("does not absorb a nested skill's files", () => {
    const res = collectResources(entries, pdf);
    expect(res.map((r) => r.relPath)).not.toContain("nested/helper.py");
  });

  it("does not reach into a sibling skill", () => {
    const res = collectResources(entries, pdf);
    expect(res.every((r) => r.path.startsWith("skills/pdf/"))).toBe(true);
  });
});

describe("extractHeadings", () => {
  it("collects ATX headings with slugged ids", () => {
    expect(extractHeadings("# One\n\n## Two Words\n")).toEqual([
      { depth: 1, text: "One", id: "one" },
      { depth: 2, text: "Two Words", id: "two-words" },
    ]);
  });

  it("ignores headings inside fenced code", () => {
    const md = "# Real\n\n```sh\n# not a heading\n```\n\n## Also Real\n";
    expect(extractHeadings(md).map((h) => h.text)).toEqual(["Real", "Also Real"]);
  });

  it("handles tilde fences and nested backticks", () => {
    const md = "~~~\n# hidden\n~~~\n\n# Shown\n";
    expect(extractHeadings(md).map((h) => h.text)).toEqual(["Shown"]);
  });

  it("strips inline markup from heading text", () => {
    expect(extractHeadings("## Use `foo()` and [bar](x)").map((h) => h.text)).toEqual([
      "Use foo() and bar",
    ]);
  });

  it("disambiguates duplicate headings", () => {
    expect(extractHeadings("# A\n# A\n").map((h) => h.id)).toEqual(["a", "a-1"]);
  });
});

describe("parseSkill", () => {
  const stub = {
    slug: "pdf",
    dir: "skills/pdf",
    skillMdPath: "skills/pdf/SKILL.md",
    group: "",
    variants: [],
    parentSlug: null,
  };

  it("reads spec frontmatter", () => {
    const skill = parseSkill(
      stub,
      `---
name: pdf
description: Extract PDF text.
license: Apache-2.0
compatibility: Requires Python 3.14+
allowed-tools: Bash(git:*) Read
---

# Body
Text here.`,
      [],
    );
    expect(skill.name).toBe("pdf");
    expect(skill.description).toBe("Extract PDF text.");
    expect(skill.license).toBe("Apache-2.0");
    expect(skill.compatibility).toBe("Requires Python 3.14+");
    expect(skill.allowedTools).toEqual(["Bash(git:*)", "Read"]);
    expect(skill.issues).toEqual([]);
    expect(skill.body.startsWith("# Body")).toBe(true);
  });

  it("flags missing required fields", () => {
    const skill = parseSkill(stub, "no frontmatter at all", []);
    expect(skill.issues).toHaveLength(2);
    expect(skill.issues.join(" ")).toMatch(/name/);
    expect(skill.issues.join(" ")).toMatch(/description/);
    // Falls back to the directory name so the chapter still has a title.
    expect(skill.name).toBe("pdf");
  });

  it("flags a description over the 1024-character limit (anthropics/claude-api)", () => {
    const skill = parseSkill(
      stub,
      `---\nname: pdf\ndescription: ${"x".repeat(1025)}\n---\n`,
      [],
    );
    expect(skill.issues.join(" ")).toMatch(/exceeds 1024/);
  });

  it("flags a name that disagrees with its directory (datadog-labs)", () => {
    const skill = parseSkill(
      { ...stub, dir: "dd-audit/ai-activity-audit" },
      "---\nname: dd-audit-ai-activity\ndescription: Audit.\n---\n",
      [],
    );
    expect(skill.issues.join(" ")).toMatch(/does not match directory/);
  });

  it("rejects names that break the spec's character rules", () => {
    const bad = (name: string) =>
      parseSkill(stub, `---\nname: ${name}\ndescription: d\n---\n`, []).issues.join(" ");
    expect(bad("PDF-Processing")).toMatch(/lowercase/);
    expect(bad("-pdf")).toMatch(/lowercase/);
    expect(bad("pdf--processing")).toMatch(/lowercase/);
  });

  it("survives malformed YAML without losing the body", () => {
    const skill = parseSkill(stub, "---\nname: [unclosed\n---\n\n# Still here\n", []);
    expect(skill.body).toContain("Still here");
  });

  it("estimates reading time from prose, not code", () => {
    const prose = parseSkill(stub, `---\nname: pdf\ndescription: d\n---\n${"word ".repeat(660)}`, []);
    expect(prose.readingMinutes).toBe(3);

    const code = parseSkill(
      stub,
      `---\nname: pdf\ndescription: d\n---\n\`\`\`js\n${"token ".repeat(2000)}\n\`\`\``,
      [],
    );
    expect(code.readingMinutes).toBe(1);
  });
});

describe("titleCase", () => {
  it("humanises slugs while keeping acronyms", () => {
    expect(titleCase("expo-experiments")).toBe("Expo Experiments");
    expect(titleCase("dd_apm")).toBe("Dd Apm");
    expect(titleCase(".curated")).toBe("Curated");
    expect(titleCase("PDF")).toBe("PDF");
  });
});
