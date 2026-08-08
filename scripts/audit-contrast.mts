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
import {
  auditIssueTheme,
  deriveIssueTheme,
  issueSelector,
  issueThemeCss,
  PAPER,
} from "../src/lib/design/theme";
import { CURATED } from "../src/lib/design/registry";
import type { DesignManifest } from "../src/lib/design/types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "src/styles/tokens.css"), "utf8");
const modesCss = readFileSync(join(root, "src/styles/theme-modes.css"), "utf8");

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

/* ───────────────────────────── Every owner we ship must derive a real theme */

console.log(B("\n═══ Curated brand seeds ═══"));

let worstSeed = { owner: "", light: Infinity, dark: Infinity };
for (const [owner, seed] of Object.entries(CURATED)) {
  const color = parseColor(seed.color);
  if (!color) {
    console.log(`  ${R("UNPARSEABLE")} ${owner} → ${seed.color}`);
    failures++;
    continue;
  }
  const theme = deriveIssueTheme(owner, {
    ...manifestForHue(color.h, color.c),
    origin: "curated",
  });
  const audit = auditIssueTheme(theme);
  const ok =
    audit.light >= WCAG.AA_TEXT &&
    audit.dark >= WCAG.AA_TEXT &&
    audit.lightHc >= WCAG.AAA_TEXT &&
    audit.darkHc >= WCAG.AAA_TEXT;
  if (!ok) {
    failures++;
    console.log(
      `  ${R("FAIL")} ${owner.padEnd(24)} ${audit.light.toFixed(2)} / ${audit.dark.toFixed(2)}`,
    );
  }
  if (audit.light < worstSeed.light) {
    worstSeed = { owner, light: audit.light, dark: audit.dark };
  }
}
console.log(
  `  ${failures === 0 ? G("PASS") : R("FAIL")}  ${Object.keys(CURATED).length} curated seeds; ` +
    `worst light ${worstSeed.light.toFixed(2)}:1 (${worstSeed.owner})`,
);

/* ─────────────────────── Nothing a third party publishes may author our CSS */

console.log(B("\n═══ CSS emission safety ═══"));

const HOSTILE_OWNER = 'evil"]{}html{display:none}[x="';
const hostileTheme = deriveIssueTheme(HOSTILE_OWNER, {
  ...manifestForHue(320, 0.2),
  radiusPx: 999999,
});
const emitted = issueThemeCss(
  {
    ...hostileTheme,
    ink: "</style><script>alert(1)</script>",
    accentLight: "red; } html { display: none } .x { color: red",
    chartLight: ["url(javascript:alert(1))", "#14ec77", "expression(alert(1))"],
  },
  issueSelector(HOSTILE_OWNER),
);

const emissionChecks: Array<[string, boolean]> = [
  ["selector is slugified", !issueSelector(HOSTILE_OWNER).includes("{")],
  ["no markup", !/[<>]/.test(emitted)],
  ["no javascript: or expression()", !/javascript:|expression\(/i.test(emitted)],
  ["no url() or @import", !/url\(|@import/i.test(emitted)],
  ["braces balanced", emitted.split("{").length === emitted.split("}").length],
  ["no nested blocks", !/\{[^{}]*\{/.test(emitted)],
  [
    "only custom properties emitted",
    [...emitted.matchAll(/\{([^{}]*)\}/g)].every((m) =>
      m[1]
        .split(";")
        .filter(Boolean)
        .every((d) => /^--[a-z-]+[0-9]?:/.test(d)),
    ),
  ],
  ["absurd radius dropped", !emitted.includes("--radius:")],
  ["under the 32 KB cap", emitted.length < 32 * 1024],
  ["rejects a hand-rolled selector", issueThemeCss(hostileTheme, "x{}html{}") === ""],
];

for (const [label, ok] of emissionChecks) {
  if (!ok) failures++;
  console.log(`  ${ok ? G("PASS") : R("FAIL")}  ${label}`);
}

/* ───────────────────── The forced-colors reset is not optional (§4.5, risk 6) */

console.log(B("\n═══ Preference resets present in theme-modes.css ═══"));

const REQUIRED_RULES: Array<[string, RegExp]> = [
  ["@media (forced-colors: active)", /@media\s*\(forced-colors:\s*active\)/],
  ["popups forced to Canvas", /background:\s*Canvas/],
  ["popup borders in CanvasText", /border:\s*1px solid CanvasText/],
  ["backdrop-filter killed in HCM", /backdrop-filter:\s*none/],
  ["blur pseudo-element removed", /::before[\s\S]{0,600}display:\s*none/],
  ["selected state uses Highlight", /background:\s*Highlight/],
  ["focus ring survives HCM", /outline:\s*3px solid Highlight/],
  ["charts opt out of forcing", /forced-color-adjust:\s*none/],
  ["@media (prefers-contrast: more)", /@media\s*\(prefers-contrast:\s*more\)/],
  ["links underlined at high contrast", /text-decoration:\s*underline/],
  [
    "@media (prefers-reduced-transparency: reduce)",
    /@media\s*\(prefers-reduced-transparency:\s*reduce\)/,
  ],
  ["@media (prefers-reduced-motion: reduce)", /@media\s*\(prefers-reduced-motion:\s*reduce\)/],
  ["motion override honours data-motion=allow", /:root:not\(\[data-motion="allow"\]\)/],
  ["data-motion=reduce forces reduction", /\[data-motion="reduce"\]/],
  ["@media print", /@media\s*print/],
  ["print writes out external link URLs", /content:\s*" \(" attr\(href\) "\)"/],
  ["print avoids breaking code blocks", /break-inside:\s*avoid/],
  ["print avoids orphaned headings", /break-after:\s*avoid/],
];

for (const [label, re] of REQUIRED_RULES) {
  const ok = re.test(modesCss);
  if (!ok) failures++;
  console.log(`  ${ok ? G("PASS") : R("FAIL")}  ${label}`);
}

// theme-modes.css must never carry a colour literal; tokens.css owns those.
// The system keywords of forced-colors mode and the print black/white are the
// documented exceptions.
const strayLiterals = [...modesCss.matchAll(/#[0-9a-f]{3,8}\b/gi)]
  .map((m) => m[0])
  .filter((hex) => !["#fff", "#000", "#333", "#999"].includes(hex.toLowerCase()));
if (strayLiterals.length > 0) {
  failures++;
  console.log(`  ${R("FAIL")}  colour literals outside tokens.css: ${strayLiterals.join(" ")}`);
} else {
  console.log(`  ${G("PASS")}  no stray colour literals`);
}

/* ───────────────────────────────────────────────────────────────── result */

console.log(
  failures === 0
    ? `\n${G(`✓ Contrast audit passed`)}${warnings ? Y(`  (${warnings} advisory)`) : ""}\n`
    : `\n${R(`✗ Contrast audit failed: ${failures} violation(s)`)}\n`,
);

process.exit(failures === 0 ? 0 : 1);
