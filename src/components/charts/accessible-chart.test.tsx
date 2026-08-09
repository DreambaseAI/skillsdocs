/**
 * The chart accessibility contract, executed.
 *
 * `tests/a11y/forced-colors.spec.ts` has a chart check that has never once
 * run: it locates `figure svg, [role='img'] svg, svg[data-chart]`, finds zero
 * on every audited route — nothing in `src/app` imports `components/charts/` —
 * and calls `test.skip`. A vacuous skip is indistinguishable from a pass, so
 * the pack's whole a11y story ("the table, not the tooltip, is the primary
 * representation of the data") was unverified.
 *
 * These render the component for real and assert the contract from
 * `docs/research/a11y-llm.md` §1.14. They cost milliseconds and they cannot
 * skip themselves. The Playwright check stays for the day the charts are
 * mounted, where it will additionally see the computed `forced-color-adjust`.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AccessibleChart } from "./accessible-chart";

function render() {
  return renderToStaticMarkup(
    <AccessibleChart
      title="Weekly installs of anthropics/skills"
      description="Falling over eight weeks, 108k to 79k per week."
      columns={["Week", "Installs"]}
      rows={[
        { header: "Week 1", cells: ["108,000"] },
        { header: "Week 8", cells: ["79,000"] },
      ]}
      hcm={<svg data-testid="hcm" />}
    >
      <canvas />
    </AccessibleChart>,
  );
}

describe("AccessibleChart", () => {
  const html = render();

  it("is a figure with a caption, not a bare canvas", () => {
    expect(html).toContain("<figure");
    expect(html).toContain("<figcaption");
    expect(html).toContain("data-chart");
  });

  it("names the drawing with a sentence, never the word 'Chart'", () => {
    expect(html).toContain('aria-label="Weekly installs of anthropics/skills"');
    expect(html).not.toContain('aria-label="Chart"');
  });

  it("makes the drawing a single role=img leaf so the canvases are pruned", () => {
    expect(html).toContain('role="img"');
    // Both renditions — live and forced-colours — are hidden inside the leaf.
    expect(html.match(/aria-hidden="true"/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("ships the data as a real table, in the tree, before anyone presses anything", () => {
    // Collapsed means `sr-only`, never `display:none` and never unmounted:
    // the table is the primary representation of the data (a11y-llm §1.14).
    expect(html).toContain('class="sr-only"');
    expect(html).toContain("<table");
    expect(html).toContain('<th scope="col">Week</th>');
    expect(html).toContain('<th scope="row">Week 1</th>');
    expect(html).toContain("108,000");
    expect(html).toContain("79,000");
  });

  it("captions the table with the same name and description as the drawing", () => {
    expect(html).toContain(
      "<caption>Weekly installs of anthropics/skills. Falling over eight weeks, 108k to 79k per week.</caption>",
    );
  });

  it("wires the description to the drawing by id", () => {
    const described = /aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(described, "the drawing must reference its description").toBeTruthy();
    expect(html).toContain(`id="${described}"`);
  });

  it("gives the disclosure button an expanded state and a target", () => {
    expect(html).toMatch(/aria-expanded="false"[^>]*>|aria-expanded="false"/);
    const controls = /aria-controls="([^"]+)"/.exec(html)?.[1];
    expect(controls).toBeTruthy();
    expect(html).toContain(`id="${controls}"`);
  });
});
