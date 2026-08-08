/**
 * Shiki highlighter: one module-level singleton for the process.
 *
 * Shiki never reaches the client — highlighting happens inside a server
 * component at cache-fill time, so the client cost is 0 KB. What does cost us
 * is cold start and resident memory, which is what the singleton and the
 * preload list are for.
 *
 * ## The preload list is measured, not guessed
 *
 * `scripts`-free scan of 230 real `SKILL.md` files across 12 skills repos
 * (anthropics, openai, supabase, vercel-labs, obra, microsoft, cloudflare,
 * remotion-dev, expo, firecrawl, prisma, better-auth) found 2,286 fences:
 * 1,348 with no info string and 938 tagged, across 29 distinct languages.
 * Collapsing Shiki's aliases, the tagged distribution was:
 *
 *   bash (incl. sh, shell)  457   typescript (incl. ts)  134   tsx    72
 *   javascript (incl. js)    48   python                  41   markdown 37
 *   json                     28   powershell              25   text   17
 *   jsonc                    17   jsx                     14   yaml    8
 *   ...then a 36-fence tail: kql, dot, prisma, css, xml, dotenv, toml,
 *      dockerfile, swift, kotlin, mermaid, env
 *
 * The twelve grammars below cover 96.2% of tagged fences. `text` needs no
 * grammar (Shiki special-cases it), and it is also the fallback for the 59% of
 * fences that carry no language at all. The tail loads lazily on first sight.
 */

import { bundledLanguages, createHighlighter, type Highlighter } from "shiki";

/**
 * Dual themes. `defaultColor: false` makes Shiki emit `--shiki-light` **and**
 * `--shiki-dark` custom properties instead of baking one theme into `color`,
 * which is what lets `code.css` satisfy the class strategy and
 * `prefers-color-scheme` at the same time without them fighting.
 *
 * ## Why the high-contrast pair
 *
 * We paint code on the reader's own paper (`--paper-raised`) rather than on
 * the background the theme was designed against, so the themes had to be
 * re-measured against all six paper modes. Contrast of every foreground scope
 * against every ground, worst case:
 *
 *   github-light                 2.79:1   24 of 114 scopes below AA
 *   github-light-default         3.64:1   11 of 126
 *   github-light-high-contrast   4.03:1    2 of 126   ← chosen
 *   github-dark-dimmed           4.06:1    2 of 126
 *   github-dark-default          5.11:1    0 of 126
 *   github-dark-high-contrast    7.41:1    0 of 126   ← chosen
 *
 * `github-light` — the obvious default, and what this file used to ship —
 * fails AA for `variable` (3.15:1) and `keyword` (4.13:1), which are not
 * decorative scopes. With the pair below plus the ground lift in `code.css`,
 * the worst scope on any paper mode is 4.55:1.
 */
export const SHIKI_THEMES = {
  light: "github-light-high-contrast",
  dark: "github-dark-high-contrast",
} as const;

export const PRELOADED_LANGS = [
  "bash",
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "python",
  "markdown",
  "json",
  "jsonc",
  "yaml",
  "powershell",
  "html",
] as const;

/** Languages Shiki resolves without a grammar. */
export const SPECIAL_LANGS = new Set(["text", "plaintext", "txt", "plain", "ansi"]);

/**
 * A hostile document could tag two hundred fences with two hundred different
 * languages and make us load two hundred grammars. Cap the lazily-loaded set
 * per document; everything past the cap renders as plain text.
 */
export const MAX_LAZY_LANGS = 8;

export function isKnownLanguage(lang: string): boolean {
  return lang in bundledLanguages;
}

let singleton: Promise<Highlighter> | undefined;

/**
 * Shiki's own guidance is that the highlighter is a long-lived singleton and
 * must never be constructed in a hot path.
 */
export function getHighlighter(): Promise<Highlighter> {
  singleton ??= createHighlighter({
    themes: [SHIKI_THEMES.light, SHIKI_THEMES.dark],
    langs: [...PRELOADED_LANGS],
  });
  return singleton;
}
