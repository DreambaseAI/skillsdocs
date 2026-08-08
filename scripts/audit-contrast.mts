/**
 * Contrast audit — runs in CI via `pnpm verify:contrast`.
 *
 * Parses the real token values out of `src/styles/tokens.css` (so the audit
 * can never drift from what ships) and checks every ink/paper pairing, then
 * sweeps all 360 hues through the issue-theme derivation.
 *
 * Exits non-zero on any failure.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { contrastRatio, parseColor, WCAG, type Oklch } from "../src/lib/color";
import { deriveIssueTheme, PAPER } from "../src/lib/design/theme";
import type { DesignManifest } from "../src/lib/design/types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "src/styles/tokens.css"), "utf8");

const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const B = (s: string) => `\x1b[1m${s}\x1b[0m`;

let failures = 0;
let warnings = 0;

/** Pull one CSS rule body by selector, tolerating comma-separated selectors. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `(?:^|,|\\})\\s*(?:[^{}]*,\\s*)?${escaped}\\s*(?:,[^{}]*)?\\{([^}]*)\\}`,
    "m",
  );
  return css.match(re)?.[1] ?? "";
}

function tokensIn(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

/**
 * A paper mode's tokens, layered over the base rule the way the cascade does.
 * `data-contrast="high"` overrides sit on top.
 */
function modeTokens(selectors: string[]): Record<string, string> {
  return selectors.reduce<Record<string, string>>(
    (acc, sel) => ({ ...acc, ...tokensIn(ruleBody(sel)) }),
    {},
  );
}

interface Pairing {
  label: string;
  fg: string;
  bg: string;
  min: number;
  /** Advisory rather than blocking. */
  soft?: boolean;
}

function check(mode: string, tokens: Record<string, string>) {
  const get = (name: string): Oklch | null => {
    const raw = tokens[name];
    return raw ? parseColor(raw) : null;
  };

  const paper = get("paper");
  if (!paper) {
    console.log(`  ${R("MISSING")} --paper in ${mode}`);
    failures++;
    return;
  }

  const pairings: Pairing[] = [
    { label: "ink / paper", fg: "ink", bg: "paper", min: WCAG.AAA_TEXT },
    { label: "ink-strong / paper", fg: "ink-strong", bg: "paper", min: WCAG.AAA_TEXT },
    { label: "ink-muted / paper", fg: "ink-muted", bg: "paper", min: WCAG.AA_TEXT },
    { label: "ink / paper-raised", fg: "ink", bg: "paper-raised", min: WCAG.AA_TEXT },
    // Hairlines are decorative separators, not "graphical objects required to
    // understand content", so WCAG 1.4.11's 3:1 does not bind. The bar here is
    // editorial: a rule must be visible without shouting over the prose.
    { label: "rule / paper", fg: "rule", bg: "paper", min: 1.7, soft: true },
    { label: "selection", fg: "selection-fg", bg: "selection-bg", min: WCAG.AA_TEXT },
  ];

  console.log(`\n  ${B(mode)}`);
  for (const p of pairings) {
    const fg = get(p.fg);
    const bg = get(p.bg);
    if (!fg || !bg) continue;

    const ratio = contrastRatio(fg, bg);
    const ok = ratio >= p.min;
    if (!ok) {
      if (p.soft) warnings++;
      else failures++;
    }
    const mark = ok ? G("PASS") : p.soft ? Y("WARN") : R("FAIL");
    console.log(
      `    ${mark}  ${p.label.padEnd(22)} ${ratio.toFixed(2).padStart(6)}:1  (need ${p.min})`,
    );
  }
}

console.log(B("\n═══ Reading-surface contrast ═══"));

check("paper (light)", modeTokens([":root"]));
check("sepia", modeTokens([":root", '[data-paper="sepia"]']));
check("eink", modeTokens([":root", '[data-paper="eink"]']));
check("night (dark)", modeTokens([":root", ".dark"]));
check("midnight", modeTokens([":root", ".dark", '[data-paper="midnight"]']));
check("slate", modeTokens([":root", ".dark", '[data-paper="slate"]']));
check("high contrast (light)", modeTokens([":root", '[data-contrast="high"]']));
check(
  "high contrast (dark)",
  modeTokens([":root", ".dark", '[data-contrast="high"].dark']),
);

/* ─────────────────────────────── Issue accents across every possible hue */

console.log(B("\n═══ Issue accents — 360-hue sweep ═══"));

function manifestForHue(h: number, c: number): DesignManifest {
  return {
    ok: true,
    origin: "curated",
    sourceUrl: null,
    format: "frontmatter",
    name: null,
    description: null,
    colors: [
      {
        name: "brand",
        key: "brand",
        raw: "",
        hex: "#000000",
        alpha: 1,
        oklch: { l: 0.6, c, h, alpha: 1 },
        role: "accent",
        usage: null,
        scheme: null,
        source: "frontmatter",
        confidence: 1,
      },
    ],
    fonts: [],
    radiusPx: null,
    voice: { words: [], quotes: [], summary: null },
    pointers: [],
    warnings: [],
  };
}

const sweep = {
  light: { worst: Infinity, hue: 0 },
  dark: { worst: Infinity, hue: 0 },
  lightHc: { worst: Infinity, hue: 0 },
  darkHc: { worst: Infinity, hue: 0 },
  chartLight: { worst: Infinity, hue: 0 },
  chartDark: { worst: Infinity, hue: 0 },
};

// Vary chroma too: a low-chroma brand takes a different path through
// gamut mapping than a saturated one.
for (const chroma of [0.05, 0.12, 0.19, 0.3]) {
  for (let h = 0; h < 360; h++) {
    const t = deriveIssueTheme("sweep", manifestForHue(h, chroma));
    const at = (color: string, bg: Oklch) => contrastRatio(parseColor(color)!, bg);

    const record = (key: keyof typeof sweep, value: number) => {
      if (value < sweep[key].worst) sweep[key] = { worst: value, hue: h };
    };

    record("light", at(t.accentLight, PAPER.light));
    record("dark", at(t.accentDark, PAPER.dark));
    record("lightHc", at(t.accentLightHc, PAPER.lightHc));
    record("darkHc", at(t.accentDarkHc, PAPER.darkHc));
    for (const c of t.chartLight) record("chartLight", at(c, PAPER.light));
    for (const c of t.chartDark) record("chartDark", at(c, PAPER.dark));
  }
}

const SWEEP_MINIMA: Array<[keyof typeof sweep, number, string]> = [
  ["light", WCAG.AA_TEXT, "accent on light paper"],
  ["dark", WCAG.AA_TEXT, "accent on dark paper"],
  ["lightHc", WCAG.AAA_TEXT, "accent, high contrast light"],
  ["darkHc", WCAG.AAA_TEXT, "accent, high contrast dark"],
  ["chartLight", WCAG.AA_NON_TEXT, "chart series on light"],
  ["chartDark", WCAG.AA_NON_TEXT, "chart series on dark"],
];

for (const [key, min, label] of SWEEP_MINIMA) {
  const { worst, hue } = sweep[key];
  const ok = worst >= min;
  if (!ok) failures++;
  console.log(
    `  ${ok ? G("PASS") : R("FAIL")}  ${label.padEnd(28)} worst ${worst.toFixed(3).padStart(7)}:1 at hue ${String(hue).padStart(3)}  (need ${min})`,
  );
}

/* ───────────────────────────────────────────────────────────────── result */

console.log(
  failures === 0
    ? `\n${G(`✓ Contrast audit passed`)}${warnings ? Y(`  (${warnings} advisory)`) : ""}\n`
    : `\n${R(`✗ Contrast audit failed: ${failures} violation(s)`)}\n`,
);

process.exit(failures === 0 ? 0 : 1);
