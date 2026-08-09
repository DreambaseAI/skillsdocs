/**
 * axe wiring, and the one policy decision that makes this suite survivable.
 *
 * **We gate on our chrome; we report on third-party content.** A book is
 * arbitrary markdown from an arbitrary GitHub repository. If a stranger's
 * `SKILL.md` ships an image with no alt text, that is a fact about their repo,
 * not a reason our build goes red — and blocking on it would make every deploy
 * hostage to any repo we render. So:
 *
 * - `auditChrome()` runs axe over the page with `.prose` excluded and asserts
 *   **zero** violations. This is a hard gate. (ARCHITECTURE §7.4 DECISION.)
 * - `auditContent()` runs axe over `.prose` only, attaches the findings to the
 *   test as JSON, and never fails. Those findings are the data behind the
 *   per-issue accessibility report in the colophon.
 *
 * axe-core and @axe-core/playwright are MPL-2.0 — file-level copyleft with no
 * obligation for unmodified use. They are `devDependencies`, they are imported
 * only from `tests/`, and they must never enter the application bundle.
 */

import fs from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";
import type { AxeResults, Result } from "axe-core";

import { SEL } from "./contract";

/** WCAG 2.0/2.1/2.2 A + AA, plus axe's best-practice pack. */
export const WCAG_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
];

export interface AuditOptions {
  /** Extra selectors to exclude (e.g. a chart owned by another workstream). */
  exclude?: string[];
  /** Rules that cannot mean anything in this project's rendering mode. */
  disableRules?: string[];
}

function builder(page: Page, options: AuditOptions = {}) {
  let b = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  for (const selector of options.exclude ?? []) b = b.exclude(selector);
  if (options.disableRules?.length) b = b.disableRules(options.disableRules);
  return b;
}

/**
 * Rules axe cannot evaluate meaningfully in forced-colors mode: the UA has
 * replaced every colour, so contrast is the system's problem, not ours. The
 * forced-colors project asserts readability structurally instead — see
 * tests/a11y/forced-colors.spec.ts.
 */
export const FORCED_COLORS_DISABLED = ["color-contrast", "color-contrast-enhanced"];

export function disabledForProject(projectName: string): string[] {
  return projectName.includes("forced-colors") ? FORCED_COLORS_DISABLED : [];
}

/**
 * Our own UI. Zero violations, no exceptions.
 *
 * The whole page is analysed and the violations are partitioned afterwards,
 * rather than handing `.prose` to axe's `exclude`. Excluding the content
 * subtree also removes it from the *page-level* rules — `page-has-heading-one`,
 * `landmark-one-main`, `region` — so a chapter whose only `<h1>` sits inside
 * the rendered markdown reports a violation that does not exist. Partitioning
 * keeps those rules honest (their node is `<html>`, which is never inside
 * `.prose`) while still letting a stranger's missing `alt` fall through to the
 * report.
 */
export async function auditChrome(
  page: Page,
  info: TestInfo,
  options: AuditOptions = {},
): Promise<AxeResults> {
  const results = await builder(page, {
    ...options,
    disableRules: [...disabledForProject(info.project.name), ...(options.disableRules ?? [])],
  }).analyze();

  const ours = await partitionOurs(page, results.violations);

  if (ours.length > 0) {
    await info.attach("axe-chrome-violations.json", {
      body: JSON.stringify(ours, null, 2),
      contentType: "application/json",
    });
  }

  expect(summarise(ours), formatViolations(ours)).toEqual([]);

  /*
   * `incomplete` is reported, never discarded — and never gated on.
   *
   * axe marks a result incomplete when it could not decide. For the modality
   * rules that is almost always Base UI's own machinery: the `aria-hidden`
   * `tabindex="0"` sentinels either side of a popup, and the page behind an
   * open modal, which the dialog marks `aria-hidden` while its focus trap —
   * not an attribute axe can see — is what actually keeps focus out.
   *
   * The suite used to read only `violations`, so an open dialog's
   * `aria-hidden-focus: incomplete 1` looked exactly like a pass. Failing on it
   * is the wrong correction: it goes red on a framework idiom in two different
   * components, and the question axe could not answer — *is the hidden content
   * reachable?* — is one this suite can answer directly. So these are attached
   * to the report and printed, and focus containment is asserted for real in
   * `keyboard.spec.ts` and `overlays.spec.ts`.
   */
  const undecided = results.incomplete.filter((r) => MODALITY_RULES.includes(r.id));
  if (undecided.length > 0) {
    await info.attach("axe-chrome-incomplete.json", {
      body: JSON.stringify(undecided, null, 2),
      contentType: "application/json",
    });
    process.stdout.write(
      `[a11y] axe could not decide ${summarise(undecided).join(", ")} on ${page.url()} — see the attached report; containment is asserted separately.\n`,
    );
  }

  return results;
}

/** Rules whose "incomplete" is worth printing rather than silently dropping. */
const MODALITY_RULES = ["aria-hidden-focus", "aria-hidden-body", "focus-order-semantics"];

/** Violations with at least one node outside the rendered markdown. */
async function partitionOurs(page: Page, violations: Result[]): Promise<Result[]> {
  if (violations.length === 0) return [];

  const selectors = violations.flatMap((v) =>
    v.nodes.map((n) => (Array.isArray(n.target) ? String(n.target[n.target.length - 1]) : String(n.target))),
  );

  const inContent = await page.evaluate(
    ({ list, contentSelector }) =>
      list.map((selector) => {
        try {
          const el = document.querySelector(selector);
          return Boolean(el && el.closest(contentSelector));
        } catch {
          return false;
        }
      }),
    { list: selectors, contentSelector: SEL.content },
  );

  let cursor = 0;
  const ours: Result[] = [];
  for (const violation of violations) {
    const flags = violation.nodes.map(() => inContent[cursor++]);
    const outside = violation.nodes.filter((_, i) => !flags[i]);
    if (outside.length > 0) ours.push({ ...violation, nodes: outside });
  }
  return ours;
}

/**
 * Rendered third-party markdown. Never fails; the findings are product data.
 * Written to `node_modules/.cache/a11y-content-report.json` so the colophon
 * work (WS-4) has a concrete shape to build against.
 */
export async function auditContent(
  page: Page,
  info: TestInfo,
  route: string,
): Promise<Result[]> {
  const hasContent = await page.locator(SEL.content).count();
  if (hasContent === 0) return [];

  const results = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .include(SEL.content)
    .disableRules(disabledForProject(info.project.name))
    .analyze();

  const report = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    helpUrl: v.helpUrl,
    nodes: v.nodes.map((n) => ({ target: n.target, html: n.html.slice(0, 240) })),
  }));

  await info.attach("axe-content-findings.json", {
    body: JSON.stringify({ route, project: info.project.name, findings: report }, null, 2),
    contentType: "application/json",
  });
  appendContentReport({ route, project: info.project.name, findings: report });

  return results.violations;
}

const CONTENT_REPORT = path.join(
  process.cwd(),
  "node_modules/.cache/a11y-content-report.json",
);

function appendContentReport(entry: unknown): void {
  try {
    fs.mkdirSync(path.dirname(CONTENT_REPORT), { recursive: true });
    const existing = fs.existsSync(CONTENT_REPORT)
      ? (JSON.parse(fs.readFileSync(CONTENT_REPORT, "utf8")) as unknown[])
      : [];
    existing.push(entry);
    fs.writeFileSync(CONTENT_REPORT, JSON.stringify(existing, null, 2));
  } catch {
    // The report is a by-product. Never let it fail a run.
  }
}

/** A stable, diffable shape for the assertion message. */
function summarise(violations: Result[]): string[] {
  return violations.map((v) => `${v.id} (${v.nodes.length})`);
}

export function formatViolations(violations: Result[]): string {
  if (violations.length === 0) return "no violations";
  return violations
    .map((v) => {
      const nodes = v.nodes
        .slice(0, 4)
        .map((n) => `      ${n.target.join(" ")}\n        ${n.html.slice(0, 160)}`)
        .join("\n");
      return `  ${v.id} [${v.impact}] ${v.help}\n    ${v.helpUrl}\n${nodes}`;
    })
    .join("\n\n");
}
