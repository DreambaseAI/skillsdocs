import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { SkillResource } from "@/lib/skills";

import { buildFileTree, FileTree } from "./file-tree";

function resource(relPath: string, size = 1024): SkillResource {
  const dot = relPath.lastIndexOf(".");
  return {
    path: `skills/pdf/${relPath}`,
    relPath,
    kind: relPath.startsWith("scripts/") ? "script" : "reference",
    size,
    ext: dot > 0 ? relPath.slice(dot + 1) : "",
  };
}

const FILES = [
  resource("references/FORMS.md"),
  resource("references/step-10.md"),
  resource("references/step-2.md"),
  resource("references/deep/NOTES.md"),
  resource("scripts/extract.py"),
  resource("README.md"),
  resource("logo.ttf", 40_000),
];

describe("buildFileTree", () => {
  const tree = buildFileTree(FILES);

  it("folds paths into directories and leaves the root files at the root", () => {
    expect(tree.children.map((c) => c.name)).toEqual(["references", "scripts"]);
    // Case-insensitive, the way a file listing sorts: `logo` before `README`,
    // not every capital letter herded to the top.
    expect(tree.files.map((f) => f.relPath)).toEqual(["logo.ttf", "README.md"]);
  });

  it("counts every descendant, not just direct children", () => {
    expect(tree.total).toBe(FILES.length);
    const references = tree.children[0]!;
    expect(references.total).toBe(4);
    expect(references.children[0]!.name).toBe("deep");
  });

  it("collates numerically, so step-2 precedes step-10", () => {
    // Plain `localeCompare` puts `step-10.md` first, and a numbered sequence
    // listed out of sequence reads as a bug in the source repository.
    const references = tree.children[0]!;
    expect(references.files.map((f) => f.relPath)).toEqual([
      "references/FORMS.md",
      "references/step-2.md",
      "references/step-10.md",
    ]);
  });

  it("classifies as it folds, so the leaf knows how it will render", () => {
    expect(tree.files.map((f) => f.render)).toEqual(["binary", "prose"]);
  });

  it("survives a flat skill with no directories at all", () => {
    const flat = buildFileTree([resource("ONE.md"), resource("TWO.md")]);
    expect(flat.children).toEqual([]);
    expect(flat.total).toBe(2);
  });
});

describe("<FileTree>", () => {
  const markup = renderToStaticMarkup(
    <FileTree
      resources={FILES}
      owner="anthropics"
      repo="skills"
      slug="pdf"
      currentPath="references/FORMS.md"
    />,
  );

  it("is a nested list of links, not an ARIA tree widget", () => {
    // See the note at the top of `file-tree.tsx`: every leaf navigates, so the
    // list gives the reader counts and their own arrow keys for free, and the
    // tree role would take both away.
    expect(markup).not.toContain('role="tree"');
    expect(markup).not.toContain('role="treeitem"');
    expect(markup).toContain("<ul");
    expect(markup).toContain('aria-label="Bundled files"');
  });

  it("links every file into the catch-all route, binaries included", () => {
    expect(markup).toContain('href="/anthropics/skills/pdf/references/FORMS.md"');
    expect(markup).toContain('href="/anthropics/skills/pdf/scripts/extract.py"');
    expect(markup).toContain('href="/anthropics/skills/pdf/logo.ttf"');
  });

  it("marks the open file with aria-current", () => {
    expect(markup.match(/aria-current="page"/g)?.length).toBe(1);
  });

  it("ships no JavaScript: directories are native details elements", () => {
    expect(markup).toContain("<details");
    expect(markup).toContain("<summary");
  });

  it("says what a file is rather than how big it is, when it will not render", () => {
    // "39 KB" tells a reader nothing about `logo.ttf`; "TrueType font" tells
    // them why clicking it will not open a subchapter.
    expect(markup).toContain(">TrueType font</span>");
    expect(markup).toContain(">1 KB</span>");
  });

  it("hides the meta column from assistive tech", () => {
    // 82 links each trailed by "YAML, 4 KB" is 82 announcements a reader
    // working down an appendix did not ask for.
    expect(markup).toMatch(/aria-hidden="true"[^>]*>TrueType font</);
  });

  it("opens only the current file's directory in the rail when the tree is big", () => {
    const many = Array.from({ length: 30 }, (_, i) => resource(`references/r${i}.md`)).concat(
      resource("scripts/extract.py"),
    );
    const rail = renderToStaticMarkup(
      <FileTree
        resources={many}
        owner="a"
        repo="b"
        slug="c"
        density="rail"
        currentPath="references/r3.md"
      />,
    );
    // `references` open, `scripts` closed.
    expect(rail.match(/<details[^>]*open/g)?.length).toBe(1);
  });

  it("renders nothing at all for a skill that bundles nothing", () => {
    expect(renderToStaticMarkup(<FileTree resources={[]} owner="a" repo="b" slug="c" />)).toBe("");
  });
});
