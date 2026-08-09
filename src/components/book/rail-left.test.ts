import { describe, expect, it } from "vitest";

import {
  collapseClusters,
  isCluster,
  isGap,
  railWindow,
  sharedLead,
  type RailRow,
} from "./rail-left";
import { subchapterGroups, type Subchapter } from "./subchapters";
import type { SkillResource } from "@/lib/skills";

function resources(...relPaths: string[]): SkillResource[] {
  return relPaths.map((relPath) => ({
    path: `skills/demo/${relPath}`,
    relPath,
    kind: relPath.startsWith("references/")
      ? "reference"
      : relPath.startsWith("scripts/")
        ? "script"
        : "other",
    size: 1024,
    ext: relPath.slice(relPath.lastIndexOf(".") + 1),
  }));
}

function readable(...relPaths: string[]): Subchapter[] {
  return subchapterGroups(resources(...relPaths), {
    owner: "o",
    repo: "r",
    slug: "demo",
    chapter: 3,
  }).flatMap((group) => group.readable);
}

/** `canvas-design`: 27 font licences in one directory plus one file above it. */
const CANVAS = readable(
  ...Array.from({ length: 27 }, (_, i) => `canvas-fonts/Face${i + 1}-OFL.txt`),
  "LICENSE.txt",
);

function names(rows: RailRow[]): string[] {
  return rows.map((row) =>
    isGap(row)
      ? `gap:${row.gap}`
      : isCluster(row)
        ? `${row.dir}/:${row.count}`
        : row.relPath,
  );
}

/**
 * `microsoft/azure-skills` puts 30 consecutive entries in the contents rail
 * whose first six characters are `Azure ` — `Azure AI`, `Azure Aigateway`,
 * `Azure App Onboard Prereq`, … The rail is unscannable: nothing distinguishes
 * one entry from the next until character seven.
 */

const AZURE = [
  "Azure AI",
  "Azure Aigateway",
  "Azure App Onboard Prereq",
  "Azure Bicep",
  "Azure Cosmos DB",
  "Azure Functions",
  "Deployment Guide",
];

describe("sharedLead", () => {
  it("finds the headword a clear majority of a part shares", () => {
    expect(sharedLead(AZURE)).toBe("Azure");
  });

  it("says nothing when the list is short enough to scan as it is", () => {
    expect(sharedLead(AZURE.slice(0, 4))).toBeNull();
  });

  it("says nothing below a 60% majority", () => {
    expect(
      sharedLead(["Azure AI", "Azure Bicep", "Slack GIF", "PDF", "Docx", "Xlsx"]),
    ).toBeNull();
  });

  it("refuses a headword that would leave an entry with no label at all", () => {
    expect(
      sharedLead(["Azure", "Azure AI", "Azure Bicep", "Azure Functions", "Azure Cosmos"]),
    ).toBeNull();
  });

  it("refuses a headword too short to be worth removing", () => {
    expect(sharedLead(["Go Build", "Go Test", "Go Vet", "Go Fmt", "Go Run"])).toBeNull();
  });
});

/**
 * The rail and the appendix have to describe the same chapter.
 *
 * `canvas-design` bundles 27 readable font licences in `canvas-fonts/`. The
 * appendix puts them behind one disclosure; the rail used to print the first
 * thirteen of them by name and push `LICENSE.txt` — the one file at the
 * skill's own root — out of the window.
 */
describe("collapseClusters", () => {
  it("names a directory the appendix collapses instead of enumerating it", () => {
    expect(names(collapseClusters(CANVAS))).toEqual([
      "canvas-fonts/:27",
      "LICENSE.txt",
    ]);
  });

  it("leaves a single-directory group alone — there is nothing to tell apart", () => {
    const supabase = readable(
      ...Array.from({ length: 34 }, (_, i) => `references/rule-${i + 1}.md`),
    );
    expect(collapseClusters(supabase)).toHaveLength(34);
  });

  it("keeps the open file visible inside a collapsed directory", () => {
    expect(
      names(collapseClusters(CANVAS, "canvas-fonts/Face20-OFL.txt")),
    ).toEqual([
      "canvas-fonts/:27",
      "canvas-fonts/Face20-OFL.txt",
      "LICENSE.txt",
    ]);
  });
});

describe("railWindow", () => {
  const flat = readable(
    ...Array.from({ length: 34 }, (_, i) => `references/rule-${i + 1}.md`),
  );

  it("prints everything when the chapter fits", () => {
    const { rows, hidden } = railWindow(flat.slice(0, 6), undefined);
    expect(rows).toHaveLength(6);
    expect(hidden).toBe(0);
  });

  it("defers to the appendix once the rail would become one", () => {
    const { rows, hidden } = railWindow(flat, undefined, 14);
    expect(rows).toHaveLength(14);
    expect(hidden).toBe(21);
    expect(names(rows).at(-1)).toBe("gap:21");
  });

  it("never omits the file you are reading", () => {
    const { rows } = railWindow(flat, "references/rule-30.md", 14);
    expect(names(rows).at(-1)).toBe("references/rule-30.md");
    expect(names(rows).at(-2)).toMatch(/^gap:/);
  });

  it("counts hidden files, not hidden rows", () => {
    // Twelve loose files then a 27-file directory, with a budget of five.
    const rows: RailRow[] = [
      ...flat.slice(0, 12),
      { dir: "canvas-fonts", count: 27 },
    ];
    const { hidden } = railWindow(rows, undefined, 5);
    expect(hidden).toBe(8 + 27);
  });
});
