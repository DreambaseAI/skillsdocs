/**
 * Two source-level guards, written once and asserted by
 * `tests/guards/source-guards.test.ts`.
 *
 * They are greps, but they are greps with a reason:
 *
 * 1. **"bionic"** — Bionic Reading® is claimed under patent, copyright and
 *    trademark (USPTO reg. 5557651) with an EULA prohibiting commercial use.
 *    ARCHITECTURE §5.5 rules the string out of code, class names, prop names,
 *    analytics events and copy. Our own deferred feature is called *fixation
 *    emphasis*. A grep is the only enforcement that survives a new contributor
 *    who has never read the decision.
 *
 * 2. **Raw colour literals outside `tokens.css`** — the three-axis theming
 *    contract only holds if every colour resolves through a semantic token.
 *    One `#3b82f6` in a component is invisible in review and silently breaks
 *    dark mode, sepia paper, high contrast and forced colours at once.
 */

import fs from "node:fs";
import path from "node:path";

export interface Hit {
  file: string;
  line: number;
  column: number;
  text: string;
  match: string;
}

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".js", ".jsx", ".mjs", ".mts"]);

export function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

function scan(files: string[], root: string, pattern: RegExp): Hit[] {
  const hits: Hit[] = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const lines = source.split("\n");
    lines.forEach((text, index) => {
      const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        hits.push({
          file: path.relative(root, file),
          line: index + 1,
          column: m.index + 1,
          text: text.trim().slice(0, 120),
          match: m[0],
        });
        if (m.index === re.lastIndex) re.lastIndex += 1;
      }
    });
  }
  return hits;
}

/* --------------------------------------------------------------- bionic */

const BIONIC = /bionic/i;

export function findBionic(srcRoot: string, repoRoot: string): Hit[] {
  return scan(sourceFiles(srcRoot), repoRoot, BIONIC);
}

/* -------------------------------------------------- raw colour literals */

/**
 * Hex literals and every CSS colour function that can carry one.
 *
 * The function arms capture their arguments, because the argument list is what
 * decides whether a match is a *literal* at all: `oklch(from var(--paper) …)`
 * derives from a token and is exactly what we want people writing, while
 * `oklch(0.71 0.18 29)` is a hardcoded colour.
 */
const COLOUR = new RegExp(
  [
    // #rgb, #rgba, #rrggbb, #rrggbbaa — not after a word char, so `sha#abc`
    // and `&#8212;` do not match.
    String.raw`(?<![\w&])#[0-9a-fA-F]{3,8}\b`,
    // A colour function with its arguments, tolerating one level of nesting.
    String.raw`\b(?:rgba?|hsla?|oklch|oklab|lch|lab)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)`,
  ].join("|"),
  "g",
);

/**
 * Files allowed a raw colour, each for a stated reason.
 *
 * - `tokens.css` is the single source of colour (CLAUDE.md).
 * - `globals.css` still holds the shadcn `base-luma` `:root` palette that the
 *   scaffold generated. It is WS-0's file and outside this workstream's
 *   ownership; ARCHITECTURE §4.2 wants those declarations folded into
 *   `tokens.css`, and this exemption should be deleted when they are.
 * - `color.ts` is the OKLCH engine: parsing and constructing colour strings is
 *   its entire job.
 * - `design/theme.ts` and `design/parse.ts` read literals out of a stranger's
 *   `design.md`; `design/registry.ts` *is* a table of third-party brand
 *   colours. All three feed the engine that turns a brand colour into
 *   contrast-checked tokens, which is the opposite of hardcoding one.
 * - `dither-kit/` is vendored third-party chart code (ARCHITECTURE §6.3); we
 *   patch `palette.ts` but do not own the source style.
 * - Test files assert on colour values by definition.
 */
const COLOUR_EXEMPT: Array<[RegExp, string]> = [
  [/^src\/styles\/tokens\.css$/, "the single source of colour"],
  [/^src\/app\/globals\.css$/, "WS-0 scaffold palette; move to tokens.css and delete this"],
  [/^src\/lib\/color\.ts$/, "the OKLCH engine"],
  [/^src\/lib\/design\/(theme|parse|registry)\.ts$/, "brand-colour ingestion"],
  [/^src\/components\/dither-kit\//, "vendored third-party charts"],
  [/\.test\.ts$/, "tests assert on colour values"],
];

/**
 * Line-level exemptions, for files otherwise held to the rule.
 *
 * All of these are OS-chrome colours in metadata — the browser tab strip, the
 * PWA splash screen — read outside the document by software that has never
 * seen our stylesheet. They are the one place a CSS variable is not merely
 * discouraged but impossible.
 */
const LINE_EXEMPT: Array<[RegExp, RegExp, string]> = [
  [
    /^src\/app\/layout\.tsx$/,
    /prefers-color-scheme/,
    "<meta name=theme-color>, read by the OS chrome",
  ],
  [
    /^src\/app\/manifest\.ts$/,
    /\b(?:background_color|theme_color)\b/,
    "webmanifest colours, read by the OS installer",
  ],
];

/** `#fff`, `#333`, `oklch(0 0 0 / .35)` — greyscale, i.e. not a brand decision. */
function isAchromatic(match: string): boolean {
  if (match.startsWith("#")) {
    const hex = match.slice(1);
    const expand = (h: string) =>
      h.length <= 4 ? h.split("").map((c) => c + c).join("") : h;
    const full = expand(hex);
    if (full.length < 6) return false;
    const [r, g, b] = [full.slice(0, 2), full.slice(2, 4), full.slice(4, 6)];
    return r === g && g === b;
  }

  const open = match.indexOf("(");
  const fn = match.slice(0, open).trim().toLowerCase();
  const args = match
    .slice(open + 1, match.lastIndexOf(")"))
    .split(/[\s,/]+/)
    .filter(Boolean);
  const n = (i: number) => Number.parseFloat(args[i] ?? "");

  if (fn === "rgb" || fn === "rgba") return n(0) === n(1) && n(1) === n(2);
  if (fn === "hsl" || fn === "hsla") return n(1) === 0;
  if (fn === "oklch" || fn === "lch") return n(1) === 0;
  if (fn === "oklab" || fn === "lab") return n(1) === 0 && n(2) === 0;
  return false;
}

/** A match that is not a hardcoded colour at all. */
function isFalsePositive(hit: Hit): boolean {
  const trimmed = hit.text.trimStart();
  // A comment explaining a value, e.g. "/* github-light comment sits at #66707b */".
  if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return true;
  // Fragment identifiers and SVG paint references: url(#gradient), href="#anchor".
  if (/(?:url\(|href=|xlink:href=|fill="url\()\s*"?#/.test(hit.text)) return true;
  // Derived from a token or from the cascade — the pattern we *want*.
  if (/\b(?:from\s|var\(|currentcolor)/i.test(hit.match)) return true;
  // Greyscale resets in print and forced-contrast blocks are not brand colour.
  if (isAchromatic(hit.match)) return true;
  return false;
}

export function findRawColours(srcRoot: string, repoRoot: string): Hit[] {
  const files = sourceFiles(srcRoot).filter((file) => {
    const rel = path.relative(repoRoot, file);
    return !COLOUR_EXEMPT.some(([pattern]) => pattern.test(rel));
  });
  return scan(files, repoRoot, COLOUR).filter((hit) => {
    if (isFalsePositive(hit)) return false;
    return !LINE_EXEMPT.some(
      ([file, line]) => file.test(hit.file) && line.test(hit.text),
    );
  });
}

export function formatHits(hits: Hit[]): string {
  return hits.map((h) => `  ${h.file}:${h.line}:${h.column}  ${h.match}  — ${h.text}`).join("\n");
}
