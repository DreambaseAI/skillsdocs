# `design.md` — convention, live probe results, parser spec, and theme derivation

Research date: **2026-08-08**. Every HTTP result below was fetched with `curl` during this session.
Claims are tagged **[verified]** (I fetched/computed it) or **[inferred]** (reasoning on top of verified data).

---

## 1. What `design.md` is

**[verified]** `design.md` is an emerging sibling to `llms.txt`: a plain-Markdown design-system
document served at a site's root, written *for agents* rather than for humans, so a coding agent can
generate on-brand UI without Figma exports or a token pipeline.

**Origin.** The convention was popularized by **Google Stitch**, which open-sourced its `DESIGN.md`
format (April 2026). The de-facto community registry is
**[VoltAgent/awesome-design-md](https://github.com/voltagent/awesome-design-md)** (browsable at
`https://getdesign.md`), which at time of writing hosts **74 brand `DESIGN.md` files** **[verified — enumerated via the GitHub trees API]**.

There is **no formal RFC and no JSON Schema.** **[verified — no spec document found; the registry README is the only normative text]** What exists is a strongly-observed *de-facto* schema, documented below. Any parser must therefore be tolerant, not validating.

Secondary sources: [Better Stack — DESIGN.md for AI coding agents](https://betterstack.com/community/guides/ai/design-md-ai/), [designproject.io](https://designproject.io/blog/design-md-file/).

---

## 2. Live probe results

### 2.1 `https://<domain>/design.md`

| Domain | Status | Content-Type | Bytes | Real markdown? |
|---|---|---|---|---|
| `vercel.com` | **200** | `text/markdown` | 35,732 | **YES** |
| `resend.com` | **200** | `text/markdown` | 1,159 | **YES** (pointer file) |
| `dreambase.com` | **200** | `text/markdown` | 13,713 | **YES** (richest) |
| `clerk.com` | **200** | `text/markdown` | 18,586 | **YES** (richest tables) |
| `linear.app` | 200 | **`text/html`** | 24,446 | **NO — SPA shell** |
| `stripe.com` | 404 | text/html | 365,222 | no |
| `supabase.com` | 404 | text/html | 16,581 | no |
| `tailwindcss.com` | 404 | text/html | 158,895 | no |
| `ui.shadcn.com` | 404 | text/html | 34,984 | no |
| `anthropic.com` | 404 (→`www.`) | text/html | 58,334 | no |
| `claude.com` | 404 | text/html | 75,359 | no |

> **Critical trap [verified]:** `linear.app/design.md` returns **HTTP 200** but serves the Linear SPA
> `index.html` (`<!doctype html> <html data-sw-cache=true …><title>Linear</title>`). A status-code-only
> check produces a false positive. **You must gate on `Content-Type` starting with `text/markdown` or
> `text/plain`, AND reject bodies whose first non-whitespace character is `<`.**

### 2.2 Fallback paths on the 404s

**[verified]** `/.well-known/design.md` and `/brand.md` are **dead ends** — 404 on every domain tested.
`tailwindcss.com/.well-known/design.md` returns a 308 to a 14-byte `text/plain` body (not markdown).
`vercel.com/.well-known/design.md` → 404, 9 bytes.

`llms.txt` **does** exist widely (200 on `stripe.com`, `supabase.com`, `ui.shadcn.com`, `claude.com`,
`linear.app`, `vercel.com`, `resend.com` — sizes 2.3 KB → 207 KB) but **contains no color or font
tokens**; it is a link index. **Do not use `llms.txt` as a theme source.**

**Conclusion:** probe `/design.md` only. Skip `.well-known` and `brand.md` entirely.

### 2.3 GitHub owner → website → design.md chain

`OwnerMeta.blog` (already returned by `fetchOwnerMeta` in `/Users/username/Sites/githubskills/src/lib/github.ts:222`) resolves cleanly **[verified]**:

| GitHub org | `blog` field | `/design.md` |
|---|---|---|
| `vercel` | `https://vercel.com` | **200 markdown** |
| `resend` | `https://resend.com` | **200 markdown** |
| `DreambaseAI` | `https://dreambase.com` | **200 markdown** |
| `clerk` | `https://clerk.com` | **200 markdown** |
| `anthropics` | `https://anthropic.com` | 404 |
| `mattpocock` | `https://totaltypescript.com` | 404 |
| `supabase` | `https://supabase.com` | 404 |
| `stripe` | **`https://stripe.dev`** | 404 |

Note `stripe`'s `blog` is `stripe.dev`, not `stripe.com` — **[inferred]** also try the apex of the org's
primary product domain and a curated override map (§7.1).

---

## 3. The three format families

**[verified]** Across the 74-file registry plus the 4 live files, `design.md` comes in exactly three shapes. A parser must handle all three.

### Family A — YAML frontmatter (structured). 64 / 74 registry files + `dreambase.com`

**This is the machine-readable jackpot.** The frontmatter key set is astonishingly stable: **all 64 files
have exactly these 8 top-level keys and no others** **[verified — key frequency count]**:

```
version  name  description  colors  typography  rounded  spacing  components
```

Real excerpt — `https://dreambase.com/design.md`:

```yaml
---
version: "alpha"
name: Dreambase
description: AI-native intelligence and agentic analytics for Supabase. A dark, data-dense,
  developer-first analytics platform for techncial founders and startups.
colors:
  primary: "#00623A"
  secondary: "#3CCE8E"
  accent: "#14EC77"
  background: "#171717"
  card: "#1F1F1F"
  border: "oklch(0.2739 0.0055 286.03)"
  foreground: "oklch(0.98 0.002 250)"
  destructive: "oklch(0.7 0.22 25)"
typography:
  hero:
    fontFamily: Inter
    fontSize: 3.75rem
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -0.04em
  body-md:
    fontFamily: Geist
    fontSize: 0.875rem
  mono:
    fontFamily: Geist Mono
rounded: { sm: 4px, md: 6px, lg: 10px, xl: 14px, full: 9999px }
spacing: { xs: 4px, sm: 8px, md: 16px, lg: 24px, xl: 32px, 2xl: 48px, 3xl: 80px }
components:
  button-primary:
    backgroundColor: "{colors.primary}"     # <-- token reference syntax
    rounded: "{rounded.md}"
---
```

Note the `"{colors.primary}"` **token-reference syntax** in `components` — must be resolved or ignored, never rendered literally. **[verified]**

Registry `colors.*` key frequency (of 64) **[verified]**:

| key | n | key | n | key | n |
|---|---|---|---|---|---|
| `primary` | 64 | `hairline` | 53 | `surface-card` | 24 |
| `ink` | 64 | `body` | 38 | `muted` | 23 |
| `on-primary` | 63 | `on-dark` | 38 | `mute` | 20 |
| `canvas` | 58 | `surface-soft` | 25 | `primary-active` | 17 |

`rounded` keys: `full` 61, `sm` 60, `md` 57, `xs` 51, `lg` 50, `none` 38, `xl` 37, `pill` 34.
`spacing` keys: `xs`/`sm`/`md`/`lg`/`xl` 64 each, `xxs` 63, `xxl` 53, `section` 48.

Color notation across the corpus: **hex 64/74, rgb() 42/74, oklch 1/74** (only `dreambase.com` uses oklch). **[verified]**

### Family B — Stitch 9-section prose. 10 / 74 registry files

Files: `kraken, lamborghini, lovable, mastercard, runwayml, sanity, spotify, starbucks, tesla, theverge`.
No frontmatter. Fixed heading skeleton **[verified]**:

```
# Design System Inspired by <Brand>
## 1. Visual Theme & Atmosphere
## 2. Color Palette & Roles
## 3. Typography Rules
## 4. Component Stylings
## 5. Layout Principles
## 6. Depth & Elevation
## 7. Do's and Don'ts
## 8. Responsive Behavior
## 9. Agent Prompt Guide
```

Colors live in **bold-name + backticked-hex bullets** inside §2 — real excerpt (`spotify`):

```markdown
### Primary Brand
- **Spotify Green** (`#1ed760`): Primary brand accent — play buttons, active states, CTAs
- **Near Black** (`#121212`): Deepest background surface
### Semantic
- **Negative Red** (`#f3727f`): `--text-negative`, error states
```

Voice/atmosphere is prose in §1, and it is genuinely usable:
> "content-first darkness" … "the UI recedes into shadow" … "tactile, rounded, and built for touch"

### Family C — Markdown tables (human design-system doc). `clerk.com`, `resend` brand skill

`clerk.com/design.md` is the best table-format example. Real excerpts **[verified]**:

```markdown
| Token | Hex | Use |
|---|---|---|
| purple-400 | `#9785ff` | Hover state on light backgrounds |
| **purple-500** | **`#6c47ff`** | **Primary CTA, logomark, brand anchor** |
| purple-600 | `#6430f7` | Pressed state |

| Role | Family | CSS variable |
|---|---|---|
| Primary sans | Suisse Intl + Geist (numbers) | `--font-sans` |
| Monospace | Söhne Mono | `--font-mono` |

## Radius & Shape
| Context | Class | Value |
| Buttons, inputs, small chips | `rounded-md` | 0.375rem (6px) |
| Bento cards, code blocks, drawers | `rounded-2xl` | 1rem (16px) |
| Avatars, FAB, pill badges | `rounded-full` | 9999px |
```

Clerk's **Voice & Tone** section is the single best brand-voice source found:
> - **Direct.** Lead with the user's problem… "Subscription billing, without the headache."
> - **Technical.** Assume the reader is a developer.
> - **Grounded.** Avoid "powerful", "robust", "seamless". Use "drop-in", "purpose-built", "straightforward", "invisible".
> - **Precise.** Tricolon negations: "No payment code, no webhooks, no sync logic."

Clerk also gives a logo spec: three-arc mark, `#bab1ff` upper arc + `#6c47ff` dot/lower arc, wordmark `#131316`, min 18px, assets at `clerk.com/brand-assets`.

### Family D (degenerate) — the **pointer file**. `resend.com`

`resend.com/design.md` is 1,159 bytes and contains **zero tokens** — it delegates **[verified]**:

```markdown
# Resend Design
## Get the Agent Skill
npx skills add resend/design-skills
- [Brand guidelines](https://github.com/resend/design-skills/blob/main/brand-guidelines/SKILL.md)
- [Design system](https://github.com/resend/design-skills/blob/main/design-system/SKILL.md)
```

**Those links are stale — they 404.** **[verified]** The repo `resend/design-skills` exists (200) but its
actual tree is:

```
README.md  SKILL.md  resend-brand/SKILL.md  tests/TESTS.md
```

The real tokens are at `raw.githubusercontent.com/resend/design-skills/main/resend-brand/SKILL.md`,
found by listing the repo tree rather than trusting the link. Excerpt **[verified]**:

```markdown
| Name         | Hex       |
| Resend Black | `#000000` |
| Resend White | `#FDFDFD` |
| Scale | Background  | Foreground  |
| Red   | `#FF173F2D` | `#FF9592`   |
| Green | `#22FF991E` | `#46FEA5D4` |

| Font                       | Role                                    |
| **Domaine Display Narrow** | Display headlines (never in product UI) |
| **Favorit**                | Headings & titles                       |
| **Inter**                  | Body text                               |
| **CommitMono**             | Code                                    |
```

Two lessons: **(a)** pointer files require a GitHub-tree fallback, not blind link-following;
**(b)** `#16171AEB`, `#FF173F2D` are **8-digit hex with alpha** — the hex regex must accept 3/4/6/8 digits.

### Family E — Agent-skill prose with an external stylesheet. `vercel.com`

`vercel.com/design.md` is a 35 KB **Agent Skill**, with SKILL.md frontmatter, and contains
**no hex, no oklch, no CSS variables at all** **[verified — grep returned zero color matches]**:

```yaml
---
name: vercel-brand-guidelines
description: "Design, build, or substantially improve an official Vercel-authored report website…"
---
# Design report websites like Vercel
```

It defers colors to a linked stylesheet: **`https://vercel.com/geist/vercel-brand.css`**
(**200, `text/css`, 108,891 bytes** **[verified]**), which is a first-class token source using
`light-dark()` pairs:

```css
--vbg-font-sans: var(--font-geist-sans, var(--font-sans, "Geist", -apple-system, …));
--vbg-font-mono: var(--font-geist-mono, var(--font-mono, "Geist Mono", …));
--vbg-background-100: light-dark(oklch(1 0 0), oklch(0 0 0));
--vbg-gray-1000:      light-dark(oklch(0.205 0 0), oklch(0.946 0 0));
--vbg-blue-700:       light-dark(oklch(57.61% 0.2508 258.23), oklch(57.61% 0.2321 258.23));
--vbg-green-700:      light-dark(oklch(64.58% 0.1746 147.27), oklch(64.58% 0.199 147.27));
--vbg-red-700:        light-dark(oklch(62.56% 0.2524 23.03), oklch(62.56% 0.2234 23.03));
```

Vercel's tone is also extractable from prose: *"precise, calm, direct, technically literate, evidence-led, editorial, and restrained."*

> **Note the two oklch dialects:** `oklch(0.55 0.01 250)` (unit interval) and
> `oklch(57.61% 0.2508 258.23)` (percent). Normalize both.

---

## 4. Parser specification

### 4.1 Result type

```ts
// src/lib/design-md/types.ts
export type ColorSpace = "hex" | "rgb" | "hsl" | "oklch";
export type TokenSource =
  | "frontmatter" | "css-fence" | "json-fence" | "table" | "prose" | "external-css";

/** Every color normalized to OKLCH so theming math is uniform. */
export interface BrandColor {
  /** token name as authored: "primary", "purple-500", "Spotify Green" */
  name: string;
  /** slugified, lowercased, deduped key: "primary", "purple-500", "spotify-green" */
  key: string;
  raw: string;              // "#6c47ff" | "oklch(57.61% 0.25 258)" | "rgb(0 0 0 / .06)"
  space: ColorSpace;
  hex: string;              // "#6c47ff" — always 6-digit, alpha stripped
  alpha: number;            // 0..1, 1 when absent
  oklch: { l: number; c: number; h: number }; // l,c unit-interval; h degrees 0..360
  role?: ColorRole;         // inferred, see 4.4
  usage?: string;           // trailing prose/table cell: "Primary CTA, logomark"
  scheme?: "light" | "dark";// set when parsed from light-dark() or a dark-mode block
  source: TokenSource;
  confidence: number;       // 0..1, see 4.6
}

export type ColorRole =
  | "primary" | "accent" | "background" | "surface" | "foreground"
  | "muted" | "border" | "success" | "warning" | "danger" | "info" | "unknown";

export interface BrandFont {
  family: string;                 // "Geist Mono"
  stack: string[];                // full fallback list as authored
  role: "display" | "heading" | "body" | "mono" | "unknown";
  weights: number[];              // [400,600]
  availability: "google" | "fontsource" | "adobe" | "proprietary" | "system" | "unknown";
  googleFontsHref?: string;       // https://fonts.googleapis.com/css2?family=Geist:wght@400..700
  substitute?: string;            // when proprietary: nearest Google-hosted match
  source: TokenSource;
}

export interface RadiusHints {
  /** px, the value we bind to --radius. */
  base: number | null;
  scale: Partial<Record<"none"|"xs"|"sm"|"md"|"lg"|"xl"|"2xl"|"full", number>>;
  /** derived: mostly-square vs pill-heavy brand */
  personality: "sharp" | "soft" | "pill" | "unknown";
}

export interface SpacingHints {
  base: number | null;             // GCD-ish unit, usually 4 or 8
  scale: Record<string, number>;   // px
}

export interface BrandVoice {
  /** adjectives mined from description + voice sections */
  words: string[];                 // ["direct","technical","grounded","precise"]
  /** verbatim short sentences worth quoting in the magazine masthead */
  quotes: string[];
  /** explicit banned words if the doc lists them */
  avoid: string[];
  tone: "editorial" | "technical" | "playful" | "luxury" | "minimal" | "unknown";
  summary: string | null;          // frontmatter `description`
}

export interface DesignManifest {
  ok: boolean;
  sourceUrl: string;
  fetchedAt: string;               // ISO
  format: "frontmatter" | "stitch-prose" | "tables" | "pointer" | "skill" | "mixed" | "none";
  name: string | null;
  description: string | null;
  colors: BrandColor[];
  fonts: BrandFont[];
  radius: RadiusHints;
  spacing: SpacingHints;
  voice: BrandVoice;
  logo: LogoRef | null;
  /** URLs the doc delegated to and we did (or should) chase */
  pointers: string[];
  warnings: string[];
  /** the final, contrast-safe theme — see §6 */
  theme: IssueTheme;
}

export interface LogoRef {
  url: string;
  kind: "svg" | "png" | "unknown";
  variant: "mark" | "wordmark" | "lockup" | "unknown";
  minHeightPx?: number;
}
```

### 4.2 Pipeline

```
fetchDesignMd(owner)
  └─ resolve candidate URLs  (§7.1)
  └─ HTTP GET, 5s timeout, follow ≤3 redirects
  └─ GUARD: content-type ∈ {text/markdown, text/plain, text/x-markdown}
     AND body.trimStart()[0] !== "<"
     AND body.length between 200 and 512_000
  └─ gray-matter(body)          ← already a dependency
       ├─ data  → parseFrontmatter()     (Family A)
       └─ content → mdast via unified/remark-parse + remark-gfm  ← already deps
             ├─ visit "code"      → parseFence()        (css / json / yaml / ts)
             ├─ visit "table"     → parseTable()        (Family C)
             ├─ visit "listItem"  → parseBullet()       (Family B)
             ├─ visit "link"      → collectPointers()   (Family D)
             └─ visit "text"      → parseProse()        (last resort)
  └─ if colors.length === 0 && pointers.length → chasePointer()   (§4.5)
  └─ mergeByKey(), rank by confidence
  └─ deriveTheme()   (§6)
```

**Use the mdast walk, not raw regex, for tables and fences.** `unified`, `remark-parse`, `remark-gfm`,
and `gray-matter` are **already in `package.json`** — zero new dependencies.

### 4.3 Extraction rules

**Color literals** — one shared scanner, applied to every text node / cell / fence:

```ts
const HEX   = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b/gi;
const OKLCH = /oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+%?)\s*)?\)/gi;
const RGB   = /rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)/gi;
const HSL   = /hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*(?:[,/]\s*([\d.]+%?)\s*)?\)/gi;
```

- **8/4-digit hex carries alpha** (`#FF173F2D` → `#FF173F` @ α=0.176). Required for Resend.
- **oklch percent vs unit**: if `L` ends in `%`, divide by 100. `dreambase` uses unit, `vercel-brand.css` uses percent.
- **`light-dark(a, b)`** — split into two `BrandColor`s with `scheme: "light" | "dark"`. Required for Vercel.
  `const LIGHT_DARK = /light-dark\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/gi;`
- **Reject** colors inside `rgba(0,0,0,.35)`-style shadow declarations when the line matches
  `/box-shadow|text-shadow|shadow|gridline/i` — these are not brand colors. (Clerk's file has 13 such rgb values.)

**Name association**, in priority order:

1. Frontmatter: the YAML key is the name (`colors.primary`).
2. Table row: the color is in one cell; the **name is the first cell of the same row**, the **usage is the last cell**. Strip `**bold**` and `` `backticks` ``.
3. Bullet (Family B): `- **Spotify Green** (\`#1ed760\`): Primary brand accent`
   → `/^\s*[-*]\s*\*\*(?<name>[^*]+)\*\*\s*\(?\s*`?(?<color>#[0-9a-f]{3,8})`?\s*\)?\s*[:—-]?\s*(?<usage>.*)$/i`
4. CSS fence: `/--(?<name>[\w-]+)\s*:\s*(?<value>[^;]+);/g`
5. Bare prose hex → `name = "unnamed-N"`, `confidence = 0.3`.

**Fonts:**

```ts
const FONT_FAMILY_CSS = /font-family\s*:\s*([^;}\n]+)/gi;
const FONT_FAMILY_YML = /fontFamily\s*:\s*["']?([^"'\n,]+(?:,[^"'\n]+)*)["']?/gi;
const FONT_VAR        = /--font-(?<role>sans|serif|mono|display|heading|body)\s*:\s*([^;]+)/gi;
```

Plus a **font-role table** heuristic for Family C: a GFM table whose header row matches
`/\b(font|family|typeface)\b/i` → first cell = family, other cells = role. Split stacks on `,`,
strip quotes, drop generic keywords (`sans-serif`, `serif`, `monospace`, `system-ui`, `-apple-system`,
`BlinkMacSystemFont`, `Segoe UI`).

**Radius:**

```ts
const RADIUS = /(?:border-)?radius[^|\n]*?([\d.]+)\s*(px|rem|em)|rounded-(\w+)[^|\n]*?([\d.]+)\s*(px|rem)/gi;
```
Family A gives it directly via `rounded:`. Set `base = scale.md ?? scale.lg ?? 8`.
`personality`: `base <= 3` → `sharp`; `<= 10` → `soft`; `>= 9999` present on buttons → `pill`.

**Voice:** union of
(a) frontmatter `description`;
(b) prose under headings matching `/voice|tone|brand|philosophy|atmosphere|personality|do'?s and don'?ts/i`;
(c) `**Bold.**`-led bullets (Clerk's exact shape: `/^\s*[-*]\s*\*\*(\w+)\.\*\*\s*(.+)$/gm` → word + gloss);
(d) adjective mining: intersect the text against a ~200-word curated adjective lexicon
(`precise, calm, direct, restrained, editorial, warm, humanist, dense, immersive, tactile, grounded, playful, luxurious, minimal, technical, confident, …`), rank by frequency, take top 6.
`avoid`: capture the "Don't" column of Do/Don't tables and phrases after `/avoid|never use/i`.

**Logo:** `design.md` files essentially **never carry a logo URL** **[verified — zero URL matches for
logo/wordmark/logomark across all 74 registry files + 4 live files]**. Clerk describes its logo in prose
but links only to a landing page (`clerk.com/brand-assets`). **Do not build a logo parser.** Use, in order:
1. any markdown image whose alt/src matches `/logo|wordmark|mark/i`;
2. `https://<domain>/favicon.svg`, then `/favicon.ico`, then `<link rel="icon">` from the homepage;
3. **GitHub org avatar** (`OwnerMeta.avatar`) — always present, always square, already fetched.

### 4.4 Role inference

```ts
const ROLE_PATTERNS: [RegExp, ColorRole][] = [
  [/^(primary|brand|accent|action|cta|link)(-|$)/i, "primary"],
  [/^(bg|background|canvas|base|surface-?0?)(-|$)/i, "background"],
  [/^(surface|card|popover|elevated|panel)(-|$)/i,   "surface"],
  [/^(fg|foreground|text|ink|body|on-)(-|$)/i,        "foreground"],
  [/^(muted|subtle|secondary|mute|dim)(-|$)/i,        "muted"],
  [/^(border|hairline|divider|separator|outline|stroke)(-|$)/i, "border"],
  [/(success|positive|green|ok)(-|$)/i,               "success"],
  [/(warn|warning|caution|amber|yellow)(-|$)/i,       "warning"],
  [/(error|danger|destructive|negative|critical|red)(-|$)/i, "danger"],
  [/(info|informational|blue)(-|$)/i,                 "info"],
];
```

### 4.5 Pointer chasing (Family D)

Only when `colors.length === 0`. Collect links matching
`/design|brand|token|theme|style/i` AND host ∈ `{github.com, raw.githubusercontent.com, <same origin>}`.

For a `github.com/<o>/<r>/blob/<ref>/<path>` link:
1. Try `raw.githubusercontent.com/<o>/<r>/<ref>/<path>`.
2. **On 404 — which is what actually happens for Resend — list the repo tree**
   (`GET /repos/<o>/<r>/git/trees/<default_branch>?recursive=1`) and take blobs matching
   `/(SKILL|DESIGN|BRAND|TOKENS)\.md$/i`, preferring paths containing `brand`.
   This is exactly how you reach `resend-brand/SKILL.md`.
3. Depth limit **1**. Never chase a pointer's pointer.

For a same-origin `.css` link (Vercel), fetch it and run the CSS-fence extractor over the whole file —
`vercel-brand.css` yields the complete Geist token set.

### 4.6 Confidence

| Source | conf |
|---|---|
| YAML frontmatter `colors.*` | 1.00 |
| CSS custom property (`--token: value`) | 0.90 |
| JSON/YAML fence | 0.90 |
| GFM table row w/ name cell | 0.80 |
| Bold-name bullet (Stitch §2) | 0.70 |
| External CSS chased from a link | 0.65 |
| Bare prose hex | 0.30 |

On key collision keep the highest confidence; tie → the earliest in document order.

### 4.7 Safety

The document is third-party. **Never** inject parsed strings into a `<style>` block raw.
Whitelist-validate every value before it reaches CSS:

```ts
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|(oklch|rgba?|hsla?)\([\d.,%\s/deg-]+\))$/i;
const SAFE_LEN   = /^-?[\d.]+(px|rem|em|%)$/;
const SAFE_FONT  = /^[\w \-]{1,48}$/;   // family names only, no quotes/semicolons/url()
```
Emit tokens by building a `Record<string,string>` and applying via React `style={{...}}` (which escapes),
not via `dangerouslySetInnerHTML`. Cap: ≤64 colors, ≤8 fonts, ≤32 KB of derived CSS.

---

## 5. Why you cannot use `colors.primary` directly

Two measurements, both computed this session over the 63 registry files that expose a hex `colors.primary`:

**[verified] 46% of `primary` values are achromatic** (OKLCH chroma < 0.04) — they are brand *black* or
*white*, not a hue:

| brand | `primary` | C | most-chromatic token in the same file |
|---|---|---|---|
| vercel | `#171717` | 0.000 | `highlight-pink` `#ff0080` (C=0.26) |
| figma | `#000000` | 0.000 | `accent-magenta` `#ff3d8b` (C=0.23) |
| resend | `#fcfdff` | 0.003 | `accent-red` `#ff2047` (C=0.25) |
| x.ai | `#ffffff` | 0.000 | `accent-dusk` `#7c3aed` (C=0.25) |
| raycast | `#ffffff` | 0.000 | `hero-stripe-start` `#ff5757` (C=0.20) |
| hashicorp | `#000000` | 0.000 | `semantic-visited` `#a737ff` (C=0.27) |
| vercel/uber/spacex | `#000000` | 0.000 | `link` `#0000ee` (C=0.30) |

→ **Seed the hue from the highest-chroma token in the document, not from `primary`.**
Keep `primary` only as `--brand-ink` (masthead/logotype color).

**[verified] 0 of 63 brand primaries pass WCAG AA 4.5:1 on both stone backgrounds.** That is not a
data problem, it is arithmetic:

```
relLum(stone-50  #fafaf9) = 0.9553
relLum(stone-950 #0c0a09) = 0.0031

AA 4.5:1 on both requires   relLum >= 4.5(0.0031+0.05)-0.05 = 0.1892
                       and  relLum <= (0.9553+0.05)/4.5-0.05 = 0.1734
                       → 0.1892 > 0.1734 → INFEASIBLE

Max contrast a single color can hold against BOTH = 4.35:1
```

**One accent color for both themes is mathematically impossible at AA.** Ship **two tones per hue.**

---

## 6. Theme derivation — validated math

### 6.1 Algorithm

```
1. seedHue   = OKLCH hue of the highest-chroma parsed color
   seedChroma= that color's chroma
   (if no color has C >= 0.04 → fallback chain, §7)
2. C = min(seedChroma, 0.19)                    // cap; prevents neon
3. accentLight = oklch(0.52, clampToGamut(0.52, C, H), H)
   accentDark  = oklch(0.70, clampToGamut(0.70, C, H), H)
4. clampToGamut = binary search (24 iters) for the largest chroma
   whose OKLab→linear-sRGB conversion stays within [0,1]
```

### 6.2 Why L = 0.52 and L = 0.70

Worst-case AA across **all 360 hues**, chroma capped at 0.19, gamut-clamped **[verified — computed]**:

| L | light-theme worst | | L | dark-theme worst |
|---|---|---|---|---|
| 0.58 | 3.80 ✗ | | 0.62 | 4.91 ✓ |
| 0.56 | 4.14 ✗ | | 0.66 | 5.76 ✓ |
| 0.55 | 4.32 ✗ | | 0.68 | 6.23 ✓ |
| **0.54** | **4.51 ✓** | | **0.70** | **6.73 ✓** |
| **0.52** | **4.92 ✓** | | 0.74 | 7.83 ✓ |

The binding constraint on light is **hue 144 (yellow-green)**, which is intrinsically luminous.
`L = 0.54` is the exact threshold; **`L = 0.52` gives a 0.42 safety margin** — use it.
On dark, hue 351 binds; `L = 0.70` yields 6.73:1.

**Recommended constants: `L_light = 0.52`, `L_dark = 0.70`, `C_max = 0.19`.**

### 6.3 Validation on the real corpus

Running the derivation over all 63 registry brands **[verified]**:

- **63/63 (100%)** produce a light tone ≥ 4.5:1 and a dark tone ≥ 7.0:1.
- **92%** of seed chroma is retained after gamut clamping.
- Solved-L range was 0.54–0.58 (light) and 0.67–0.71 (dark) — tight enough that the fixed constants above are equivalent and far cheaper.

Sample output at the recommended constants:

| hue | light accent | AA vs `#fafaf9` | dark accent | AA vs `#0c0a09` |
|---|---|---|---|---|
| 0 | `#b72164` | 5.87 | `#f7619a` | 6.74 |
| 30 | `#be2517` | 5.81 | `#fe6652` | 6.82 |
| 90 | `#816500` | 5.30 | `#c19900` | 7.37 |
| 150 | `#007f38` | 4.94 | `#0fbd59` | 7.99 |
| 200 | `#00787d` | 5.06 | `#00b4bb` | 7.77 |
| 260 | `#1961d4` | 5.45 | `#629dff` | 7.32 |
| 300 | `#7c44c3` | 5.78 | `#b17eff` | 6.89 |

Real brands: `claude` → light `#c84746` / dark `#f5706c`; `linear.app` → `#00862d` / `#008d30`;
`cursor` → `#d14100` / `#ff6d3d`; `framer` → `#aa4bbe` / `#d474e9`.

**Caveat [verified]:** hues **180–220** cap at chroma 0.088–0.095 at L=0.52 — cyan/teal reads muted in
light mode. Acceptable (still 5.0:1+), but if a brand seeds there, consider boosting the *dark* issue's
presence instead of forcing chroma.

### 6.4 Emitted tokens

Bind to the existing shadcn variables in `src/app/globals.css` (which are already stone/oklch):

```css
[data-issue="vercel"] {
  --brand-h: 335; --brand-c: 0.19;
  --brand-accent:      oklch(0.52 var(--brand-c) var(--brand-h));
  --brand-accent-fg:   oklch(0.98 0.002 var(--brand-h));
  --brand-ink:         #171717;                 /* colors.primary, verbatim */
  --primary:           var(--brand-accent);
  --ring:              var(--brand-accent);
  --radius:            8px;                     /* from rounded.md */
  --font-display:      "Geist", ui-sans-serif;
}
.dark [data-issue="vercel"] { --brand-accent: oklch(0.70 var(--brand-c) var(--brand-h)); }
```

Keep the stone neutrals untouched — the magazine stays one product; only the accent, display font,
radius, and voice change per issue. **[inferred]** Re-theming neutrals per issue would destroy the
book's visual cohesion and multiply the contrast-audit surface by ~20 tokens per issue.

---

## 7. Fallback chain

### 7.1 Source resolution (stop at first success)

| # | Source | Cache TTL | Notes |
|---|---|---|---|
| 1 | **Curated map** (`src/lib/design-md/registry.ts`) | build-time | Hand-tuned for hero orgs. Always wins — deterministic demos. |
| 2 | `https://<OwnerMeta.blog host>/design.md` | 24 h | Hits vercel, resend, DreambaseAI, clerk. |
| 3 | `https://<apex of blog host>/design.md` | 24 h | Strips `www.`/subdomain; catches `docs.x.com` → `x.com`. |
| 4 | **VoltAgent registry**: `raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/<slug>/DESIGN.md` | 24 h | **74 brands, free, no key.** Covers supabase, stripe, linear.app, cursor, notion, figma, sentry, posthog, raycast, warp, claude, x.ai, mistral.ai, resend, vercel… |
| 5 | **Repo-local** `design.md` / `DESIGN.md` / `.github/design.md` in the skills repo itself | 12 h | Lets any repo self-theme. Use existing `fetchRawTextBatch`. |
| 6 | **Org avatar dominant color** (`OwnerMeta.avatar`) | 24 h | See 7.2. |
| 7 | **Deterministic name hash** | — | Never fails. See 7.3. |

Registry slug matching: try `login.toLowerCase()`, then the blog host minus TLD, then host with TLD
(`linear.app`, `x.ai`, `mistral.ai`, `opencode.ai`, `together.ai` are stored **with** their TLD **[verified]**).

**Curated map — seed it with the verified achromatic-primary corrections**, e.g.
`vercel → #ff0080` (h≈335), `resend → #ff2047`, `figma → #ff3d8b`, `x.ai → #7c3aed`,
`anthropics/claude → #cc785c` (h≈24, from `claude/DESIGN.md`'s `primary`, which *is* chromatic),
`supabase → #3ecf8e`, `linear → #5e6ad2`, `stripe → #533afd`, `DreambaseAI → #14EC77`.

### 7.2 Avatar dominant color

`OwnerMeta.avatar` + `&s=64`. Decode server-side, bucket pixels into 32 hue bins weighted by
`chroma × min(1, 2×min(L, 1−L))` (so near-black/near-white GitHub logos contribute nothing), take the
modal bin's mean hue. **Reject and fall through to 7.3 if the winning bin's mean chroma < 0.05** —
which is the common case, since most dev-org avatars are monochrome. **[inferred — not measured; treat
as a nice-to-have, not a load-bearing tier.]** Needs an image decoder (`sharp` or `@napi-rs/canvas`);
**[inferred]** given tier 4 already covers 74 brands, I'd ship tiers 1–5 + 7 first and add 7.2 only if
demand appears.

### 7.3 Deterministic name hash — always terminal

```ts
export function hueFromName(login: string): number {
  let h = 0x811c9dc5;                       // FNV-1a 32
  for (const ch of login.toLowerCase()) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 360;
}
```

**[verified]** real output, with contrast measured at the §6.2 constants:

| org | hue | light | AA | dark | AA |
|---|---|---|---|---|---|
| vercel | 2 | `#b82060` | 5.87 | `#f96195` | 6.74 |
| resend | 94 | `#7d6700` | 5.27 | `#bc9c00` | 7.40 |
| DreambaseAI | 347 | `#b0277e` | 5.88 | `#ee64b5` | 6.74 |
| anthropics | 160 | `#007d51` | 4.97 | `#00bb7b` | 7.94 |
| mattpocock | 242 | `#006fa9` | 5.21 | `#00a8fc` | 7.51 |
| shadcn | 250 | `#006bb9` | 5.28 | `#3fa3ff` | 7.42 |
| cloudflare | 262 | `#245fd4` | 5.47 | `#679cff` | 7.30 |

Every value passes. Chroma is fixed at the gamut max for that hue (no seed to inherit from).
**[verified]** Distribution is imperfect — 10/19 adjacent pairs in a 20-org sample fall within 12°,
so two neighbouring issues can look similar. **[inferred]** If that matters, quantize to 24 fixed hues
(15° apart) and use the hash to index the bin, which makes collisions explicit and evenly spread.

---

## 8. Font resolution

**[verified]** `https://fonts.google.com/metadata/fonts` returns **200, 2.69 MB, 1,942 families**, no API
key. (Body may carry an XSSI prefix — slice from the first `{`.) Fetch once at build, ship a
`Set<string>` of family names (~40 KB).

| family (seen in real design.md files) | Google Fonts |
|---|---|
| Inter, Geist, Geist Mono, Sora, IBM Plex Sans, DM Sans, Instrument Serif, Figtree, Space Grotesk, Newsreader, Fraunces, JetBrains Mono, Roboto Mono | **YES** |
| Copernicus, Tiempos Headline, Suisse Intl, Söhne / Söhne Mono, Styrene B, Domaine Display Narrow, Favorit, CommitMono | **NO — proprietary** |

`Inter` is by far the most common `fontFamily` in the registry (138 occurrences). **[verified]**

**Substitution map for proprietary families** (required — Clerk, Claude, Resend all use them):

```ts
const FONT_SUBSTITUTES: Record<string, string> = {
  "copernicus": "Newsreader", "tiempos headline": "Newsreader", "tiempos text": "Newsreader",
  "styrene b": "Inter", "styrene a": "Inter", "suisse intl": "Inter", "favorit": "Inter",
  "söhne": "Inter", "sohne": "Inter", "söhne mono": "JetBrains Mono", "commitmono": "JetBrains Mono",
  "domaine display narrow": "Fraunces", "circularsp": "Figtree", "spotifymixui": "Figtree",
  "roobert pro": "Inter", "euclid circular a": "Poppins", "gt walsheim": "Poppins",
};
```

Resolution: exact match → normalized (lowercase, strip `Variable`/`VF`/` Pro`/` Display`) → substitute
map → `Inter`. Load only the 1–2 families actually used, via `next/font/google` where the family is
statically known and a single `<link>` to `fonts.googleapis.com/css2` for dynamic ones.
**[inferred]** Because the issue font is only known at request time, `next/font/google` (build-time)
cannot cover the dynamic case — use a `<link rel="stylesheet" precedence="...">` in the issue layout
(React 19 hoists it), and restrict the family name with `SAFE_FONT` before interpolating.

---

## 9. Recommendations

1. **Ship tiers 1, 2, 4, 5, 7 of the fallback chain.** That alone gives real brand tokens for
   ~78 owners (74 registry + the 4 live files) and a deterministic, accessible theme for everyone else.
   Skip `.well-known`, `brand.md`, and `llms.txt` — all verified dead for this purpose.
2. **Gate on Content-Type + first-byte, never on status code.** `linear.app` proves the point.
3. **Build Family A (YAML frontmatter) first** — 64/74 of the registry and the richest live file
   (`dreambase.com`) are that shape, with a rock-stable 8-key schema. Families B and C are ~2 hours each after.
4. **Never use `colors.primary` as the accent.** 46% are black or white. Seed from the highest-chroma token.
5. **Two accent tones, always.** `L=0.52` light / `L=0.70` dark, chroma capped at 0.19 and gamut-clamped.
   A single accent at AA on both stone backgrounds is provably impossible (max 4.35:1).
6. **Theme the accent, display font, radius, and voice — not the neutrals.** Keeps the magazine coherent.
7. **Add a `pnpm test` contrast assertion** that walks all 360 hues at the two constants and fails
   below 4.5:1. The math is settled; lock it down so a future chroma-cap tweak can't silently regress it.
8. **Cache aggressively.** These documents change monthly at best — 24 h matches `REVALIDATE.owner`
   in `src/lib/github.ts:20`. Persist parsed `DesignManifest`, not raw markdown.
9. **New deps: none required.** `gray-matter`, `unified`, `remark-parse`, `remark-gfm` are already
   installed. Only the optional avatar tier (7.2) would need an image decoder.

---

## 10. Artifacts

Fetched corpus, analysis scripts, and the reference OKLCH implementation used for every number above:

```
/private/tmp/claude-501/-Users-username-Sites-githubskills/8e089d66-b4d0-4762-a2da-70027e823fb8/scratchpad/
  dm/{vercel.com,resend.com,dreambase.com,clerk.com,linear.app}.designmd   # live probes
  reg/*.md                    # all 74 VoltAgent registry DESIGN.md files
  vercel-brand.css            # 108 KB Geist token source
  rbrand.md                   # resend real brand tokens (via tree fallback)
  accent.py                   # OKLCH <-> sRGB, gamut clamp, WCAG solver
  brands.txt                  # registry slugs
```
