# Reading UX: Typography, Layout & Readability Controls

**Project:** GitHub Skills Book — `localhost:3000/<owner>/<repo>`
**Stack:** Next.js 16.3 (App Router, src/, Turbopack) · React 19.2 · Tailwind v4 · shadcn "base-luma" (Base UI) · stone base · HugeIcons
**Date:** 2026-08-08

---

## 0. How this was researched (verified vs. inferred)

| Claim class | Method | Confidence |
|---|---|---|
| Computed typography of live editorial sites | Real Chromium at 1440×900 via `agent-browser eval`, reading `getComputedStyle` + canvas `measureText` | **Verified this session** |
| Font availability, weights, variable axes | `https://fonts.google.com/metadata/fonts` (1,942 families) **and** `node_modules/next/dist/compiled/@next/font/dist/google/font-data.json` shipped with Next 16.3 | **Verified this session** |
| Font x-heights, cap-heights, OpenType feature tags, advance widths | Downloaded the actual TTFs from `github.com/google/fonts` and inspected with `fontTools 4.63.0` | **Verified this session** |
| Browser support numbers | MDN `browser-compat-data` raw JSON + caniuse `features-json` | **Verified this session** |
| WCAG criterion text | `w3.org/WAI/WCAG22/Understanding/*` | **Verified this session** |
| Readwise Reader / Instapaper / Kindle control inventories | Vendor docs + search | **Verified via docs** (defaults quoted from Readwise docs) |
| Apple Books theme names (Original/Quiet/Paper/Bold/Calm/Focus) | Product knowledge; search did **not** confirm | **Inferred — do not cite externally** |
| Increment magazine | Stripe wound the publication down; not measurable | n/a |
| Medium, NYT | Cloudflare / paywall blocked instrumentation | not measured |

---

## 1. Field measurements — what the best editorial sites actually ship

All measured in real Chromium, desktop viewport **1440×900**. `CPL` = *actual* characters per line, computed as `elementWidth ÷ (canvas.measureText(realArticleText) / textLength)` — i.e. true average character advance, **not** the `ch` unit.

| Site | Body face | Size | Line-height | Ratio | Column px | **CPL** | Para gap | Align | Notable |
|---|---|---|---|---|---|---|---|---|---|
| **The Verge** (article) | FK Roman Standard (serif) | 18px | 28.8px | **1.60** | 600 | **71.3** | 20px (1.11em) | start | `letter-spacing: -0.18px` (−0.01em); h1 44px / lh 1.0 / ls −0.01em / 700 |
| **Linear blog** | Inter Variable | 17px | 27.2px | **1.60** | 624 | **78.4** | 20px (1.18em) | start | `font-feature-settings: "cv01","ss03"`; h1 48px / lh 1.0 / **ls −1.056px = −0.022em** / **wght 590**; `text-wrap: balance` on h1 |
| **Every.to** | Signifier (serif) | 20px | 30px | **1.50** | 736 | **89.9** | 20px (1.00em) | start | `font-feature-settings: "calt","clig","kern","liga","onum","pnum"` — **oldstyle figures in body**; **`text-wrap: pretty` on body `p`**; `balance` on h1 (48px) |
| **Works in Progress** | Editor (serif) | 18px | 27px | **1.50** | 728 | **85.8** | 20px (1.11em) | start | h1 48px / lh 1.3; h2 32px / lh 1.25; warm paper `#FFF7F4` |
| **Substack** (Pragmatic Engineer) | SF Pro Display | 19px | 30.4px | **1.60** | 699 | **89.4** | 20px | start | h1 Lora 24px in nav; body sans |
| **iA.net** | iA Serif (custom) | 23px | 37.95px | **1.65** | 1024 | **83.5** | 23px (1.00em) | start | **`font-variant-numeric: oldstyle-nums`**, `font-feature-settings: "dlig"`; uses a 4-column CSS multicol block |
| **Stripe Press** | Ivar Text | 17px | 25.5px | **1.50** | — | — | 30.6px | start | Ivar Headline for display; ink `#1D1A15` on `#201819`-family paper |

### What the corpus agrees on

1. **Line-height ratio clusters at 1.50–1.65.** Nobody ships 1.4 for long-form; nobody ships 1.8.
2. **Size clusters at 17–20px** for desktop long-form; 18–19px is the center of mass.
3. **Column width 600–740px.** The two 736/728px outliers (Every, WiP) run 86–90 CPL — above the WCAG 1.4.8 AAA ceiling of 80.
4. **Paragraph gap ≈ 1.0–1.2× font-size** (uniformly 20px). Nobody uses indents on the web.
5. **Zero justification.** All seven are `text-align: start`.
6. **`hyphens: manual`** everywhere — nobody enables auto-hyphenation ragged-right.
7. **`text-wrap: balance` on headlines is now standard** (Linear, Every). **`text-wrap: pretty` on body is emerging** (Every).
8. **Negative tracking on display type only**: −0.01em (Verge h1) to −0.022em (Linear h1). Body tracking is `normal` or a hair negative (−0.01em).
9. **Oldstyle figures in body text** are a real differentiator (Every, iA) — and only some open-source faces have them (see §2.4).

### Reference conventions (literature, not measured)

- **Butterick, *Practical Typography*:** 45–90 characters per line including spaces; "two to three alphabets on a line." *(verified from source)*
- **Bringhurst, *Elements*:** 66 characters "including spaces" is the ideal for single-column.
- **WCAG 2.2 SC 1.4.8 (AAA):** width ≤ **80 characters or glyphs** (40 CJK); text **not justified**; line spacing ≥ **1.5** within paragraphs; paragraph spacing ≥ **1.5× the line spacing**; user-selectable fg/bg; 200% resize with no horizontal scroll. *(verified)*
- **WCAG 2.2 SC 1.4.12 (AA):** no loss of content/function when the user sets line-height **1.5×**, space-after-paragraph **2×**, letter-spacing **0.12×**, word-spacing **0.16×** font size. *(verified)*

---

## 2. The font set

### 2.1 The `ch` trap — read this before you write a single `max-width`

**`1ch` is the advance width of the digit `0`, which is nowhere near the average character width.** I computed both from the real font binaries. The ratio varies from 1.00 (monospace) to **1.47** (Atkinson) — so `max-width: 66ch` produces anywhere from 66 to 97 real characters per line depending on which family the reader picked.

Measured from the actual TTFs (advance widths in em; average taken over a representative English sample including spaces):

| Family | `0` width (em) | avg char (em) | **CPL per `ch`** | ch needed for 66 CPL | ch needed for 75 CPL |
|---|---|---|---|---|---|
| Geist Mono / JetBrains Mono / IBM Plex Mono | 0.6000 | 0.6000 | 1.000 | 66.0 | 75.0 |
| Source Serif 4 | 0.5000 | 0.4496 | 1.112 | 59.4 | 67.4 |
| Spectral | 0.5000 | 0.4443 | 1.125 | 58.7 | 66.7 |
| **Literata** | 0.5780 | **0.4795** | 1.205 | 54.8 | 62.2 |
| EB Garamond | 0.4800 | 0.3814 | 1.259 | 52.4 | 59.6 |
| Public Sans | 0.5790 | 0.4564 | 1.269 | 52.0 | 59.1 |
| IBM Plex Serif | 0.6000 | 0.4711 | 1.274 | 51.8 | 58.9 |
| Inter | 0.6309 | 0.4771 | 1.322 | 49.9 | 56.7 |
| Lora | 0.6210 | 0.4692 | 1.324 | 49.9 | 56.7 |
| Merriweather | 0.6350 | 0.4759 | 1.334 | 49.5 | 56.2 |
| Instrument Serif | 0.4600 | 0.3409 | 1.350 | 48.9 | 55.6 |
| Newsreader | 0.5500 | 0.4056 | 1.356 | 48.7 | 55.3 |
| Geist | 0.6630 | 0.4689 | 1.414 | 46.7 | 53.0 |
| Crimson Pro | 0.5654 | 0.3998 | 1.414 | 46.7 | 53.0 |
| Fraunces | 0.7305 | 0.5162 | 1.415 | 46.6 | 53.0 |
| Figtree | 0.6380 | 0.4432 | 1.439 | 45.9 | 52.1 |
| Atkinson Hyperlegible Next | 0.6480 | 0.4425 | **1.464** | 45.1 | 51.2 |
| **OpenDyslexic** | 0.6640 | **0.7871** | **0.844** | 78.2 | 88.9 |

**Firm recommendation:** express measure as a **CPL target**, and convert per family with a token:

```css
/* per-family token, set by the family switcher */
--font-avg-char: 0.4795;        /* Literata */
--reader-measure-cpl: 68;

.reader__col {
  max-width: calc(var(--reader-measure-cpl) * var(--font-avg-char) * 1em);
}
```

At 19px Literata, 68 CPL → `68 × 0.4795 × 19px` = **620px**. That lands exactly in the Verge/Linear band. Switch to EB Garamond and the same 68 CPL correctly narrows to 493px; switch to OpenDyslexic and it correctly widens to 1017px.

### 2.2 x-height normalization — so "19px" means the same thing in every family

Also measured from the binaries (`OS/2.sxHeight ÷ unitsPerEm`). x-height spans **0.400em (EB Garamond) to 0.560em (OpenDyslexic)** — a 40% swing. Without normalization, switching families feels like the size control broke.

| Family | x-height (em) | cap (em) | Raw mult to 0.500 x-height | **Ship this** (clamped 0.90–1.15, rounded 0.005) |
|---|---|---|---|---|
| OpenDyslexic | 0.560 | 0.850 | 0.893 | **0.895** |
| Merriweather | 0.555 | — | 0.901 | 0.900 |
| JetBrains Mono | 0.550 | — | 0.909 | 0.910 |
| Inter | 0.546 | 0.728 | 0.916 | **0.915** |
| Geist / Geist Mono | 0.530 | 0.710 | 0.943 | **0.945** |
| Public Sans | 0.517 | — | 0.967 | 0.965 |
| IBM Plex Mono / IBM Plex Serif | 0.516 | — | 0.969 | 0.970 |
| Instrument Serif | 0.510 | — | 0.980 | 0.980 |
| **Literata** | 0.507 | 0.700 | 0.986 | **1.000** ← reference |
| Figtree / Lora | 0.500 | — | 1.000 | 1.000 |
| Atkinson Hyperlegible (v1 & Next) | 0.496 | 0.668 | 1.008 | 1.010 |
| Fraunces | 0.482 | 0.700 | 1.037 | 1.035 |
| Source Serif 4 | 0.475 | 0.670 | 1.053 | **1.055** |
| Spectral | 0.450 | 0.660 | 1.111 | 1.110 |
| Newsreader | 0.426 | 0.670 | 1.174 | **1.150** (clamped) |
| Crimson Pro | 0.420 | — | 1.190 | 1.150 (clamped) |
| EB Garamond | 0.400 | 0.650 | 1.250 | 1.150 (clamped) |

Pure x-height matching over-corrects the Garamond family — at 1.25× the overall block looks oversized even though x-heights match. **Clamp to [0.90, 1.15].**

```css
--reader-font-size: calc(var(--reader-size-step) * var(--font-size-mult));
```

### 2.3 The recommended set — all OFL-1.1, all loadable via `next/font/google` in Next 16.3

Every row below was checked against **`node_modules/next/dist/compiled/@next/font/dist/google/font-data.json`** shipped with this repo's Next 16.3. Import identifier = family name with spaces → underscores.

#### Serif / literary

| Family | `next/font/google` import | Variable? | Axes | Weights available | Styles | Best for |
|---|---|---|---|---|---|---|
| **Literata** ★ default | `Literata` | ✅ | `opsz 7–72`, `wght 200–900` | 200–900 + variable | normal, italic | **The default.** Google's own e-reader face (Google Play Books). Optical sizing + true small caps + oldstyle figures. Screen-tuned, generous x-height (0.507). |
| **Source Serif 4** | `Source_Serif_4` | ✅ | `opsz 8–60`, `wght 200–900` | 200–900 + variable | normal, italic | Best "technical-editorial" serif. Small caps, oldstyle, slashed zero. Pairs natively with code. |
| **Newsreader** | `Newsreader` | ✅ | `opsz 6–72`, `wght 200–800` | 200–800 + variable | normal, italic | Warmest news-editorial voice. ⚠️ **No `smcp`, no `onum`** (verified from the binary) — do not promise small caps with it. Very low x-height (0.426) → needs the 1.15 multiplier. |
| **EB Garamond** | `EB_Garamond` | ✅ | `wght 400–800` | 400–800 + variable | normal, italic | The "old book" mode. Richest feature set of any candidate: `smcp c2sc pcap c2pc onum swsh hist dlig`. Needs the size multiplier and a narrower px column. |
| **Spectral** | `Spectral` | ❌ **static only** | — | 200–800 (14 static faces) | normal, italic | Screen-first serif with `smcp/c2sc/onum/ornm`. **Not variable on Google Fonts** — costs 2–4 static files. Load only 400/600 + italics. |
| **Crimson Pro** | `Crimson_Pro` | ✅ | `wght 200–900` | 200–900 + variable | normal, italic | Book-classic alternative to Garamond, lighter color on the page. No small caps in the GF build. |
| **Lora** | `Lora` | ✅ | `wght 400–700` | 400–700 + variable | normal, italic | Safe, familiar, brushed-serif. No small caps/oldstyle. |
| **Fraunces** *(display only)* | `Fraunces` | ✅ | `SOFT 0–100`, `WONK 0–1`, `opsz 9–144`, `wght 100–900` | 100–900 + variable | normal, italic | Chapter openers and covers. ⚠️ Feature-poor (`case kern liga rvrn ss01` only). Never use for body. |
| **Instrument Serif** *(display only)* | `Instrument_Serif` | ❌ | — | **400 only** | normal, italic | High-contrast masthead face. Very low avg char width (0.341em) — huge headlines at small file cost. |

#### Sans / modern

| Family | Import | Variable? | Axes | Weights | Best for |
|---|---|---|---|---|---|
| **Geist** ★ UI default | `Geist` | ✅ | `wght 100–900` | 100–900 + variable | Chrome/UI, control panel, metadata. `ss01–ss11`, `tnum`, `frac`. Matches the Vercel/Geist design language this stack already implies. |
| **Inter** | `Inter` | ✅ | `opsz 14–32`, `wght 100–900` | 100–900 + variable | Sans body option. 14 `cv##` character variants + 8 `ss##` — use `"cv01","cv11"` for single-storey `a`/`g` if desired. Highest x-height of the sans set (0.546) after Merriweather. |
| **Public Sans** | `Public_Sans` | ✅ | `wght 100–900` | 100–900 + variable | The neutral, government-grade option. **Has `onum` + `lnum`** — rare in a sans. |
| **Figtree** | `Figtree` | ✅ | `wght 300–900` | 300–900 + variable | Friendlier geometric. |
| **Plus Jakarta Sans** | `Plus_Jakarta_Sans` | ✅ | `wght 200–800` | 200–800 + variable | Distinctive humanist-geometric; good for a "product docs" personality. |
| **Manrope** | `Manrope` | ✅ | `wght 200–800` | 200–800 + variable | ⚠️ **`styles: ['normal']` only — no italic on Google Fonts.** Disqualifies it as a body face for prose. UI/display only. |
| **Instrument Sans** | `Instrument_Sans` | ✅ | `wdth 75–100`, `wght 400–700` | 400–700 + variable | Pairs with Instrument Serif; the `wdth` axis is useful for condensed sidebars. |

#### Mono

| Family | Import | Variable? | Axes | Notes |
|---|---|---|---|---|
| **Geist Mono** ★ default | `Geist_Mono` | ✅ | `wght 100–900` | 0.6em advance, x-height 0.530 — visually matches Geist and Literata well. `symbols2` subset available. |
| **JetBrains Mono** | `JetBrains_Mono` | ✅ | `wght 100–800` | Tallest x-height of the monos (0.550). `calt` ligatures + `zero`. |
| **IBM Plex Mono** | `IBM_Plex_Mono` | ❌ **static only** | — | 100–700 static. Pairs with IBM Plex Serif/Sans if you offer that trio. |
| **Fira Code** | `Fira_Code` | ✅ | `wght 300–700` | ⚠️ **`styles: ['normal']` — no italic.** Programming ligatures are its whole point; some readers hate them. Ship with `font-variant-ligatures: none` toggle. |
| **Atkinson Hyperlegible Mono** | `Atkinson_Hyperlegible_Mono` | ✅ | `wght 200–800` | New; the accessible mono. Pair with Atkinson Next for a fully hyperlegible mode. |

#### Dyslexia-friendly / accessible

| Family | How to load | License | Weights | Verdict |
|---|---|---|---|---|
| **Atkinson Hyperlegible Next** ★ | `next/font/google` → `Atkinson_Hyperlegible_Next` | OFL-1.1 | **variable `wght 200–800`**, normal + italic, latin/latin-ext | **Ship this as the accessibility default.** The variable successor to the Braille Institute face; strictly better than the original (which is static 400/700 only). |
| Atkinson Hyperlegible (v1) | `Atkinson_Hyperlegible` | OFL-1.1 | 400/700 static | Only for parity with other readers' naming. Prefer Next. |
| Atkinson Hyperlegible Mono | `Atkinson_Hyperlegible_Mono` | OFL-1.1 | variable 200–800 | Code companion for the above. |
| **OpenDyslexic** | **Not on Google Fonts.** Use `@fontsource/opendyslexic@5.3.0` (npm, verified) + `next/font/local`, or self-host from `github.com/antijingoist/opendyslexic` | **OFL-1.1 — verified** (`OFL.txt`: "Copyright (c) 2019-07-29, Abbie Gonzalez … Reserved Font Name OpenDyslexic"), commercial use permitted | 400/700, normal + italic, **latin only** | Ship it — many readers expect it by name. But: avg char width **0.787em** (65% wider than Literata) and x-height 0.560. It *must* get its own measure and size multipliers or the column blows out. Efficacy evidence is weak; offer it, don't default to it. |

> **Licensing summary:** every family above is SIL Open Font License 1.1 — free for commercial use, embeddable, self-hostable. `next/font/google` self-hosts at build time, so no runtime request to Google and no third-party font CDN in the CSP.

### 2.4 OpenType features actually present (verified from the binaries)

Do not write CSS that assumes a feature exists. This is the real inventory (`GSUB` feature tags):

| Family | smcp | c2sc | onum | lnum | tnum | zero | dlig | swsh | Other notable |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|---|
| EB Garamond | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ | `pcap c2pc hist ss01–ss07 subs sups` |
| Spectral | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | `hist ornm ss01–ss06` |
| Literata | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | `cpsp rvrn ss01 ss02` |
| Source Serif 4 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | `ss01 ss02 sinf sups` |
| Merriweather | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | `calt` |
| Public Sans | — | — | ✅ | ✅ | ✅ | — | — | — | `calt ss01` |
| Crimson Pro | — | — | ✅ | ✅ | ✅ | — | ✅ | — | — |
| Lora | — | — | — | — | ✅ | — | — | — | `calt` |
| **Newsreader** | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | `liga pnum sups ordn` only |
| Inter | — | — | — | — | ✅ | ✅ | ✅ | — | `cv01–cv14 ss01–ss08 calt salt cpsp` |
| Geist | — | — | — | — | ✅ | — | ✅ | — | `ss01–ss11 frac sinf sups` |
| Fraunces | — | — | — | — | — | — | — | — | `case kern liga rvrn ss01` |
| Atkinson Next | — | — | — | — | ✅ | — | — | — | `frac pnum sups ordn` |

**Consequence:** the "oldstyle figures in body" move (Every.to, iA) is only available in Literata, Source Serif 4, EB Garamond, Spectral, Crimson Pro, Merriweather, Public Sans. Gate the numerals control on a per-family capability flag; grey it out for Newsreader/Lora/Inter/Geist rather than silently no-op'ing.

### 2.5 Loading strategy for a reader-selectable font set

Ten families × variable = ~10 woff2 subsets. Preloading all of them is a Lighthouse catastrophe. The rule from `validate-google-font-function-call.js` (read from this repo's `node_modules`): `preload` defaults to `true` and **requires** `subsets`; setting `preload: false` still emits the `@font-face` but skips the `<link rel=preload>`.

```ts
// src/lib/reader/fonts.ts
import {
  Literata, Source_Serif_4, Newsreader, EB_Garamond, Crimson_Pro, Lora,
  Fraunces, Instrument_Serif,
  Geist, Geist_Mono, Inter, Public_Sans,
  Atkinson_Hyperlegible_Next, Atkinson_Hyperlegible_Mono,
  JetBrains_Mono,
} from 'next/font/google'
import localFont from 'next/font/local'

/* ── preloaded: the two faces the first paint needs ─────────────── */
export const literata = Literata({
  subsets: ['latin', 'latin-ext'],
  axes: ['opsz'],                 // wght is implied by weight:'variable'; ital by style
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--f-literata',
  preload: true,
})

export const geist = Geist({
  subsets: ['latin'],
  display: 'swap',
  variable: '--f-geist',
  preload: true,
})

export const geistMono = Geist_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--f-geist-mono',
  preload: true,
})

/* ── opt-in families: @font-face emitted, no preload link ───────── */
const optIn = { subsets: ['latin'] as const, display: 'swap' as const, preload: false }

export const sourceSerif = Source_Serif_4({ ...optIn, axes: ['opsz'], style: ['normal','italic'], variable: '--f-source-serif' })
export const newsreader  = Newsreader({ ...optIn, axes: ['opsz'], style: ['normal','italic'], variable: '--f-newsreader' })
export const ebGaramond  = EB_Garamond({ ...optIn, style: ['normal','italic'], variable: '--f-eb-garamond' })
export const crimsonPro  = Crimson_Pro({ ...optIn, style: ['normal','italic'], variable: '--f-crimson' })
export const lora        = Lora({ ...optIn, style: ['normal','italic'], variable: '--f-lora' })
export const inter       = Inter({ ...optIn, axes: ['opsz'], variable: '--f-inter' })
export const publicSans  = Public_Sans({ ...optIn, variable: '--f-public-sans' })
export const atkinson    = Atkinson_Hyperlegible_Next({ ...optIn, style: ['normal','italic'], variable: '--f-atkinson' })
export const atkinsonMono= Atkinson_Hyperlegible_Mono({ ...optIn, variable: '--f-atkinson-mono' })
export const jetbrains   = JetBrains_Mono({ ...optIn, variable: '--f-jetbrains' })

/* display faces — only mounted on cover / chapter-opener routes */
export const fraunces        = Fraunces({ ...optIn, axes: ['SOFT','WONK','opsz'], variable: '--f-fraunces' })
export const instrumentSerif = Instrument_Serif({ ...optIn, weight: '400', style: ['normal','italic'], variable: '--f-instrument-serif' })

/* OpenDyslexic is not on Google Fonts — vendor the woff2 from @fontsource/opendyslexic */
export const openDyslexic = localFont({
  variable: '--f-opendyslexic',
  display: 'swap',
  preload: false,
  src: [
    { path: '../../../public/fonts/opendyslexic-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../../../public/fonts/opendyslexic-400-italic.woff2', weight: '400', style: 'italic' },
    { path: '../../../public/fonts/opendyslexic-700-normal.woff2', weight: '700', style: 'normal' },
  ],
})
```

Gotchas confirmed by reading `get-font-axes.js` / `validate-google-font-function-call.js` in this repo:

- `axes` may **not** include `wght` (it is filtered out and produces the wght range automatically) and may **not** include `ital` (use `style`).
- `axes` throws unless the resolved weight is `variable` (i.e. omit `weight` entirely).
- Spectral, IBM Plex Mono/Serif, Instrument Serif, Atkinson v1 have `axes: null` → **must** pass an explicit `weight`.
- `Manrope` and `Fira_Code` have `styles: ['normal']` → passing `style: 'italic'` throws at build.

Then in `layout.tsx` put every `.variable` class on `<html>` and switch families with a single data attribute:

```tsx
<html lang="en" className={cn(literata.variable, geist.variable, geistMono.variable,
  sourceSerif.variable, newsreader.variable, /* … */ openDyslexic.variable)}
  data-reader-font="literata">
```

```css
[data-reader-font="literata"]    { --reader-family: var(--f-literata); --font-avg-char:.4795; --font-size-mult:1.000; --font-caps:"smcp onum"; }
[data-reader-font="source-serif"]{ --reader-family: var(--f-source-serif); --font-avg-char:.4496; --font-size-mult:1.055; --font-caps:"smcp onum"; }
[data-reader-font="newsreader"]  { --reader-family: var(--f-newsreader);  --font-avg-char:.4056; --font-size-mult:1.150; --font-caps:""; }
[data-reader-font="eb-garamond"] { --reader-family: var(--f-eb-garamond); --font-avg-char:.3814; --font-size-mult:1.150; --font-caps:"smcp onum swsh"; }
[data-reader-font="inter"]       { --reader-family: var(--f-inter);       --font-avg-char:.4771; --font-size-mult:0.915; --font-caps:""; }
[data-reader-font="atkinson"]    { --reader-family: var(--f-atkinson);    --font-avg-char:.4425; --font-size-mult:1.010; --font-caps:""; }
[data-reader-font="opendyslexic"]{ --reader-family: var(--f-opendyslexic);--font-avg-char:.7871; --font-size-mult:0.895; --font-caps:""; }
```

---

## 3. The type scale

### 3.1 Size ladder (discrete steps, not a slider)

Readwise Reader ships 14→80px with `Shift+-` / `Shift+=`; Instapaper ships 25 discrete sizes topping out near 48pt. Discrete steps beat a continuous slider — they're keyboard-addressable, they persist cleanly, and they stop users landing on 17.3px.

```ts
export const SIZE_STEPS = [14,15,16,17,18,19,20,21,22,24,26,28,32,36,40,44,48] // px
export const SIZE_DEFAULT_INDEX = 5   // → 19px
```

19px is the median of the measured corpus (Verge 18, Linear 17, WiP 18, Substack 19, Every 20, Readwise default 20).

### 3.2 Line-height as a function of size (the "auto" default)

Leading must *decrease* as size increases. Fitted to the corpus and to the 1.5 WCAG floor at body sizes:

| Size | Auto line-height |
|---|---|
| 14–15px | 1.75 → 1.70 |
| 16–17px | 1.68 → 1.64 |
| 18–19px | 1.62 → **1.60** |
| 20–22px | 1.57 → 1.53 |
| 24–28px | 1.50 → 1.47 |
| 32–40px | 1.43 → 1.38 |
| 44–48px | 1.36 → 1.35 |

Closed-form, usable directly in CSS (linear in px, which is what produces the decreasing *ratio*):

```css
/* auto mode: lh_px = 7.86px + 1.186 × font-size  → 1.60 at 19px, 1.35 at 48px */
--reader-line-height-auto: calc(0.49rem + 1.186 * var(--reader-font-size));
```

The manual control then overrides with a unitless ratio. **Never let the manual minimum go below 1.30, and mark anything under 1.50 with an inline "below WCAG AAA" hint** rather than blocking it.

Two second-order corrections worth shipping (both are what fine book design actually does):

```css
/* wider measure needs more leading */
--lh-measure-adj: calc((var(--reader-measure-cpl) - 68) * 0.0035);   /* +0.035 at 78 CPL, −0.035 at 58 */
/* larger x-height needs more leading */
--lh-xheight-adj: calc((var(--font-x-height) - 0.50) * 0.6);          /* +0.036 for Inter, −0.06 for EB Garamond */
```

### 3.3 Modular scale for headings

Use **1.250 (major third)** for the reading column and **1.333 (perfect fourth)** for chapter openers/covers. Both measured sites land on 48px h1 at 1440px, from an 18–20px body — that's a ratio of ~2.5×, i.e. 4 steps of 1.25.

| Role | Multiple of body | At 19px body | Line-height | Tracking | Weight |
|---|---|---|---|---|---|
| Book title (cover) | 3.815× (fluid, clamp) | `clamp(2.75rem, 7vw, 5.5rem)` | 0.95 | −0.03em | 400 (display serif) / 600 (sans) |
| Chapter opener h1 | 2.441× | 46px | 1.05 | −0.022em | 500 |
| h1 (in-column) | 1.953× | 37px | 1.15 | −0.018em | 550 |
| h2 | 1.563× | 30px | 1.22 | −0.012em | 550 |
| h3 | 1.250× | 24px | 1.32 | −0.006em | 600 |
| h4 | 1.000× | 19px | 1.45 | 0 | 650 |
| h5 / eyebrow | 0.800× | 15px | 1.40 | **+0.08em, `font-variant-caps: all-small-caps`** | 600 |
| Body | 1.000× | 19px | 1.60 | −0.003em | 400 |
| Lead / standfirst | 1.250× | 24px | 1.45 | −0.006em | 350 |
| Pull quote | 1.563× | 30px | 1.30 | −0.01em | 400 italic |
| Caption / marginalia | 0.800× | 15px | 1.50 | +0.005em | 400 |
| Footnote | 0.750× | 14px | 1.55 | +0.005em | 400 |
| Code (inline) | 0.875× | 17px | inherit | 0 | 450 |
| Code (block) | 0.875× | 17px | 1.55 | 0 | 400 |

**Negative tracking must scale with size, not be a constant px value.** Use `em`. Verified: Linear ships −1.056px at 48px = −0.022em; Verge ships −0.44px at 44px = −0.010em.

### 3.4 Vertical rhythm & paragraph spacing

- **Paragraph gap default: `0.9em`** (≈17px at 19px). The corpus uses 20px flat = 1.0–1.18em. Use `margin-block-end` only (never both) so `:first-child`/`:last-child` collapse cleanly.
- **Alternative "book" mode:** `margin: 0; text-indent: 1.5em` with `p:first-of-type, h1+p, h2+p, h3+p, blockquote+p { text-indent: 0 }`. Offer as a toggle; it is the single cheapest way to make the page *feel* like a printed book.
- **Heading spacing:** `margin-block-start` = 2.0× body line box for h2, 1.5× for h3, 1.0× for h4. `margin-block-end` = 0.5× of the start value. Asymmetry (big above, small below) is what binds a heading to its section.
- **WCAG 1.4.8 AAA wants paragraph spacing ≥ 1.5× line spacing.** At lh 1.60 that's 2.4em, which looks airy and wrong for the default. Ship 0.9em as default and expose a **"Comfortable spacing"** preset (1.5em) plus the raw control up to 2.0em. 1.4.12 only requires that the layout *survives* a 2em user override — verify that in a test.

### 3.5 Micro-typography checklist

| Feature | Recommendation |
|---|---|
| **Drop cap** | Only on the first paragraph of a chapter opener, and only when that paragraph is >180 chars and not preceded by a code fence. `initial-letter: 3 3` + float fallback (§7.3). Suppress entirely at <640px container width and in paged mode's continuation pages. |
| **Small caps** | Real `font-variant-caps: all-small-caps` for eyebrows, `small-caps` for acronym runs (SKILL, YAML, MCP) — **only when `--font-caps` contains `smcp`**. Otherwise fall back to `text-transform: uppercase; font-size: 0.84em; letter-spacing: 0.08em; font-weight: 550` (a *faked* small cap; never use `font-variant` synthesis, which just scales caps and looks anemic). |
| **Oldstyle figures** | `font-variant-numeric: oldstyle-nums proportional-nums` in running prose for families that have `onum`. **Always `lining-nums tabular-nums` inside tables, code, version strings, and the progress indicator.** |
| **Slashed zero** | `font-variant-numeric: slashed-zero` on inline `<code>` for Literata / Source Serif 4 / Inter / Spectral / Merriweather (the families that ship `zero`). |
| **Ligatures** | `common-ligatures contextual` on. `discretionary-ligatures` only in display serif (EB Garamond, Spectral, Crimson Pro, Literata, Inter, Geist have `dlig`). **`font-variant-ligatures: none` inside code blocks by default** — ligature `!=` in a diff is a bug factory. |
| **Hanging punctuation** | `hanging-punctuation: first last` — Safari 26.5 only. Add it; it silently does nothing elsewhere. Do **not** build a JS polyfill. |
| **Optical margin alignment** | For pull quotes and blockquotes where the effect matters most, apply a manual negative indent on the opening mark: `text-indent: -0.42em` for `"` in serif faces. This is the 90% of hanging punctuation that actually ships cross-browser. |
| **Widows / orphans** | `orphans: 2; widows: 2` — **Chrome/Safari only, Firefox does not implement either** (verified in BCD). They also only apply in fragmented contexts (columns/print), so they're a paged-mode tool, not a scroll-mode tool. In scroll mode use `text-wrap: pretty` instead. |
| **Hyphenation** | `hyphens: auto` **requires a `lang` attribute** on an ancestor or it silently no-ops. Default **off** for ragged-right at ≥60 CPL (matches all 7 measured sites). Auto-enable when `text-align: justify` OR CPL < 55 OR container < 480px. Always pair with `hyphenate-limit-chars: 8 4 4` (Chrome 109+, Firefox 137+, **not Safari** — Safari will over-hyphenate; accept it or gate justify off in Safari). |
| **Text wrap** | `text-wrap: balance` on every heading, `figcaption`, `blockquote`, and the standfirst. `text-wrap: pretty` on `p`, `li`, `dd`. Note the engine limits: balance stops working past 6 lines in Chromium / 10 in Firefox. |
| **Quotes & dashes** | Normalize in the markdown pipeline, not CSS: straight → curly quotes, `--` → en dash, `---` → em dash, `...` → ellipsis. Add `remark-smartypants` (or a small rehype visitor) to the existing unified chain. Also insert `&thinsp;` around em dashes and a hair space inside `— ` sequences. |
| **Non-breaking glue** | Insert `&nbsp;` between the last two words of headings ≤8 words, after 1–3-letter prepositions/articles, before units (`4 KB`), and inside `Claude Code`, `skill.md`. Do this in the pipeline. |
| **Text box trim** | `text-box: trim-both cap alphabetic` on headings to remove leading/trailing half-leading — Chrome 133+, Safari 18.2+, Firefox 154+ (verified). Genuinely fixes heading-to-rule alignment. |

---

## 4. The readability control panel

### 4.1 Full inventory

Legend — **A11y:** `AA` = required to satisfy a WCAG AA criterion, `AAA` = satisfies AAA, `+` = accessibility-motivated but not a criterion.

| # | Control | Type | Min | Max | Step | Default | A11y | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | Body font family | radio-grid, 12 items | — | — | — | **Literata** | 1.4.12 `+` | Live-preview each option in its own face. Group: Literary / Modern / Accessible. |
| 2 | Display font family | select | — | — | — | *Match body* | — | Options: match body, Fraunces, Instrument Serif, Geist, body-sans-pair. |
| 3 | Code font family | select, 5 items | — | — | — | **Geist Mono** | — | Geist Mono, JetBrains Mono, IBM Plex Mono, Fira Code, Atkinson Mono. |
| 4 | Font size | stepper `A- A+` | 14px | 48px | 17-step ladder | **19px** | **1.4.4 AA** | `Shift+-` / `Shift+=`. Must also survive browser zoom to 200% independently. |
| 5 | Line height | slider | 1.30 | 2.20 | 0.05 | **auto (1.60 @19px)** | **1.4.12 AA**, 1.4.8 AAA | "Auto" is a real state, not a value. Warn below 1.50. |
| 6 | Measure (line width) | slider in **CPL** | 45 | 100 | 1 | **68** | **1.4.8 AAA (≤80)** | Show live "≈68 characters per line". Amber above 80. Also offer 4 presets: Narrow 54 / Normal 68 / Wide 80 / Full. |
| 7 | Letter spacing | slider | −0.02em | **0.16em** | 0.01 | **0** | **1.4.12 AA (0.12)** | Max must exceed 0.12em so the layout is provably tested there. |
| 8 | Word spacing | slider | 0 | **0.32em** | 0.02 | **0** | **1.4.12 AA (0.16)** | Same reasoning. |
| 9 | Paragraph spacing | slider | 0 | **2.0em** | 0.1 | **0.9em** | **1.4.12 AA (2.0)** | Mutually exclusive with #10 in "indent" mode. |
| 10 | Paragraph style | segmented | — | — | — | **Spaced** | — | Spaced ∣ Indented (1.5em) ∣ Both. |
| 11 | Text align | segmented | — | — | — | **Left (ragged)** | **1.4.8 AAA (not justified)** | Justify shows an inline note: "Justified text is harder to read for some people." Auto-enables hyphenation. |
| 12 | Hyphenation | tri-state | — | — | — | **Auto-off** | 1.4.8 `+` | Off ∣ Auto ∣ Auto+aggressive (`4 2 2`). Requires `lang`. |
| 13 | Font weight | slider | 300 | 500 | 10 | **400** | 1.4.12 `+` | Only for variable families; disabled (with reason) for Spectral/Plex/Instrument Serif/OpenDyslexic. Kindle's "boldness 0–5" analogue. |
| 14 | Optical size | switch | — | — | — | **auto** | — | `font-optical-sizing: auto` (default) vs manual `opsz` override. Only for Literata / Source Serif 4 / Newsreader / Inter / Fraunces / Merriweather. |
| 15 | Numerals | 2× segmented | — | — | — | **Oldstyle + Proportional** in prose | — | Lining ∣ Oldstyle × Proportional ∣ Tabular. Disabled where `onum` absent. |
| 16 | Ligatures | segmented | — | — | — | **Standard** | — | None ∣ Standard ∣ Standard+Discretionary. Code blocks default to None regardless. |
| 17 | Theme | radio-grid | — | — | — | **System** | **1.4.8 AAA (user colors)** | System ∣ Paper ∣ Sepia ∣ Slate ∣ Night ∣ Midnight ∣ E-ink ∣ High-contrast. See §4.3. |
| 18 | Accent hue | hue slider + "use repo color" | 0 | 360 | 1 | **derived from repo** | — | Only affects links, rules, drop cap, progress. Must re-check contrast on change. |
| 19 | Contrast level | segmented | — | — | — | **Normal** | **1.4.3 AA / 1.4.6 AAA** | Soft (4.5:1) ∣ Normal (7:1) ∣ High (12:1+). "Soft" must still clear 4.5:1 — enforce in the token generator, not by eye. |
| 20 | Paper texture | slider | 0% | 30% | 5 | **0%** (8% in Paper/Sepia) | — | SVG `feTurbulence` grain at `mix-blend-mode: multiply`; **must be disabled at High contrast and under `prefers-reduced-transparency`**. |
| 21 | Warmth / blue-light | slider | 0 | 40 | 5 | **0** | `+` | Warm overlay `hsl(30 60% 50% / x%)`. Never applies to images (`isolation`). |
| 22 | Reading ruler | select + sub-controls | — | — | — | **Off** | `+` (Kindle parity) | Off ∣ Underline ∣ Spotlight ∣ Typewriter. Height 1–5 lines (default 1). Dim 0–80% (default 55%). Follows pointer, or caret in keyboard mode. |
| 23 | Focus mode | switch + slider | — | — | — | **Off** | `+` | Dims all but the current paragraph. Opacity 0.15–0.7 (default 0.35). |
| 24 | Fixation emphasis | segmented | — | — | — | **Off** | `+` | ⚠️ **See §4.4 — legal.** Off ∣ Light (30% of word) ∣ Medium (40%) ∣ Strong (55%). |
| 25 | Page mode | segmented | — | — | — | **Scroll** | 1.4.10 `+` | Scroll ∣ Paged ∣ Spread (2-up, desktop ≥1280px only). |
| 26 | Columns | segmented | 1 | 2 | — | **1** | 1.4.10 `+` | Only enabled in Paged/Spread. Forced to 1 below 1024px and at font sizes ≥26px. |
| 27 | Margins | segmented | — | — | — | **Normal** | — | Tight ∣ Normal ∣ Wide ∣ Immersive (hides furniture). |
| 28 | Baseline grid | switch | — | — | — | **Off** | — | Snaps headings/figures/code to the body line box. Beautiful; expensive. Ship as a "Fine typography" toggle. |
| 29 | Images | segmented | — | — | — | **Show** | — | Show ∣ Dim (in dark themes) ∣ Hide. |
| 30 | Code block wrap | switch | — | — | — | **Off (scroll)** | 1.4.10 `+` | Wrapping long shell commands destroys them; scroll + a visible affordance is better. Force wrap below 480px is *not* recommended — use horizontal scroll containers. |
| 31 | Code size offset | stepper | −2 | +2 | 1 | **−1** | — | Relative steps on the size ladder. |
| 32 | Line numbers | switch | — | — | — | **Off** | — | `counter-increment` on `.line`, `user-select: none`. |
| 33 | Progress indicator | select | — | — | — | **Thin bar** | — | Off ∣ Thin bar ∣ Percent ∣ Time left ∣ Page x of y (paged mode). |
| 34 | Link style | segmented | — | — | — | **Underline on hover + dotted** | **1.4.1 AA** | Never "color only". Dotted 1px underline at 0.12em offset satisfies 1.4.1 without shouting. |
| 35 | Reduce motion | tri-state | — | — | — | **System** | **2.3.3 AAA** | System ∣ Force on ∣ Allow. Kills page-turn transitions and scroll-linked animation. |
| 36 | Text-to-speech rate | slider | 0.5× | 2.0× | 0.1 | **1.0×** | `+` | Web Speech API; highlight the spoken sentence. |
| 37 | Reset | button | — | — | — | — | — | Two-tier: "Reset typography" and "Reset everything". |

### 4.2 Presets — the thing users actually touch

Nobody moves eight sliders. Ship 6 one-click presets, each of which sets #1–#12, #17, #27 at once:

| Preset | Family | Size | LH | CPL | Align | Theme | Para |
|---|---|---|---|---|---|---|---|
| **Book** (default) | Literata | 19 | auto 1.60 | 68 | left | System | 0.9em spaced |
| **Novel** | EB Garamond | 21 | 1.55 | 62 | justify + hyphens | Paper | 0 gap, 1.5em indent |
| **Magazine** | Source Serif 4 + Fraunces display | 20 | 1.55 | 72 | left | Paper | 1.0em |
| **Terminal** | Geist Mono body | 16 | 1.70 | 78 | left | Midnight | 1.2em |
| **Docs** | Inter | 17 | 1.65 | 76 | left | System | 1.0em |
| **Accessible** | Atkinson Hyperlegible Next | 22 | 1.75 | 58 | left | High contrast | 1.6em, letter 0.02em, word 0.06em |

### 4.3 Theme tokens

Eight themes; each defines only 9 tokens. Everything else derives.

| Theme | `--paper` | `--ink` | Body contrast | Notes |
|---|---|---|---|---|
| Paper | `oklch(0.982 0.008 85)` | `oklch(0.245 0.018 60)` | 13.9:1 | Warm cream, the Works-in-Progress register (`#FFF7F4` measured). |
| Sepia | `oklch(0.945 0.028 78)` | `oklch(0.290 0.035 55)` | 10.8:1 | Kindle sepia analogue. |
| Light (system) | `oklch(0.995 0 0)` | `oklch(0.205 0.006 260)` | 16.9:1 | Tailwind `stone` neutral. |
| Slate | `oklch(0.965 0.004 250)` | `oklch(0.255 0.012 255)` | 12.6:1 | Cool daylight. |
| Night | `oklch(0.198 0.008 260)` | `oklch(0.882 0.006 260)` | 12.1:1 | **Not pure black** — pure `#000` on OLED causes smearing during scroll. |
| Midnight | `oklch(0.145 0.014 265)` | `oklch(0.845 0.012 255)` | 11.4:1 | Linear's register (measured `#08090A` bg / `#D0D6E0` ink = 11.6:1). |
| E-ink | `oklch(0.965 0 0)` | `oklch(0.180 0 0)` | 15.2:1 | Zero chroma everywhere, no shadows, no transitions, 1px hairlines. |
| High contrast | `#FFFFFF` / `#000000` | inverse | 21:1 | Also forces link underlines on, texture off, weight 500. |

Body ink should never be pure `--ink` at 100% in light themes — the measured sites use ~`#141414`–`#1D1A15`, not `#000`. Reserve maximum contrast for headings.

### 4.4 ⚠️ Bionic Reading — legal

**Verified:** the Bionic Reading® method is claimed by Renato Casutt under **patent, copyright and trademark** protection (US trademark reg. 5557651). The font-software EULA prohibits commercial use and explicitly prohibits using it "to sell a digital product electronically" without a separate license; a commercial **API licensing** program exists.

**Recommendation:** ship the feature, but

1. **Do not use the name "Bionic Reading" or "bionic" anywhere** — in UI copy, CSS class names, prop names, analytics events, or docs. Call it **"Fixation emphasis"** or **"Focus bold"**.
2. Implement it yourself with a client-side text transform (bold the first *n* chars of each word, `n = ceil(len × ratio)`, skip words ≤2 chars, skip code/links/math).
3. Get counsel to confirm before launch. The independent research support is also weak — Bionic Reading has not been shown to improve comprehension or speed in controlled studies. Keep it off by default.

### 4.5 Panel UX

- **Trigger:** a persistent `Aa` button — top-right on desktop, bottom-center floating on mobile (thumb zone). Keyboard: <kbd>Shift</kbd>+<kbd>A</kbd>.
- **Surface:** desktop → Base UI `Popover` (translucent, `backdrop-filter: blur(24px) saturate(1.4)`), anchored, **non-modal** so the reader can see changes live. Mobile → the existing `Drawer`, snap points at 40% / 92%.
- **Structure:** Presets row → *Type* (family, size, height, width) → *Layout* (align, spacing, columns, margins) → *Theme* → *Focus tools* → *Advanced* (`Collapsible`, holds tracking/word-spacing/numerals/ligatures/baseline grid).
- **Live, never "Apply".** Every control writes a CSS custom property on `<html>` immediately.
- **Keyboard shortcuts** (mirror Readwise, which readers already know): `Shift -` / `Shift =` size · `Shift ,` / `Shift .` width · `Shift ;` / `Shift '` line height · `Cmd/Ctrl+Alt+T` theme · `Shift+A` panel · `R` ruler · `F` focus mode.
- **Persistence:** write to `localStorage` **and** a `reader-prefs` cookie (`SameSite=Lax`, 1 year). Read the cookie in the root Server Component so the first server-rendered HTML already carries `data-reader-*` and the inline `style` custom properties — no flash of default typography. Keep the payload under ~400 bytes so it doesn't bloat every request.
- **Announce changes** to screen readers via a polite live region ("Font size 21 pixels"), and give every slider a real `aria-valuetext`.

---

## 5. Desktop layout — three candidates

Assume a 1440×900 desktop and content that is **markdown with fenced code blocks, tables, frontmatter, and deep heading structure** — this constraint is what decides the answer.

### Candidate A — True two-page spread (paginated multicol)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ← Skills          github.com/anthropics/skills            Aa   ☾   ⌘K       │  56px chrome
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌────────────────────────────┐║┌────────────────────────────┐              │
│   │ WRITING SKILLS         II  │║│                            │              │
│   │                            │║│  Frontmatter is parsed at  │              │
│   │ ┏━┓                        │║│  build time and drives the │              │
│   │ ┃S┃kills are markdown      │║│  cover, the table of con-  │              │
│   │ ┗━┛documents that teach    │║│  tents, and the search in- │              │
│   │  an agent how to perform   │║│  dex. Each `SKILL.md` be-  │              │
│   │  a task. They live in a    │║│  comes one chapter.        │              │
│   │  repository and are read   │║│                            │              │
│   │  on demand.                │║│  ── Structure ──           │              │
│   │                            │║│                            │              │
│   │  A skill is not a prompt.  │║│  Every skill has a name,   │              │
│   │  It is a document, and it  │║│  a description, and a body │              │
│   │  should read like one.     │║│  of instructions…          │              │
│   │                            │║│                            │              │
│   │              14            │║│             15             │              │
│   └────────────────────────────┘║└────────────────────────────┘              │
│    ◀                          spine                           ▶              │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  ████████████████░░░░░░░░░░░░░░  Ch. 2 of 9 · 14 min left                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Mechanics.** A fixed-height container with `columns: 2; column-fill: auto; overflow: hidden`, translated horizontally by `-n × (2 × pageW + gutter)`. Gutter 72–96px with an inner shadow gradient for the spine. Page numbers via `counter`. Turn on `orphans: 2; widows: 2` (Chrome/Safari only).

**Pros.** Unmistakably a book. Fixed viewport, no scrollbar. Page-turn is a genuinely delightful interaction. Reading position is legible ("p. 14 of 210").

**Cons — and they are severe for this content.**
- **Code blocks cannot fragment.** A 40-line fenced block in a 520px-tall column either overflows, clips, or forces `break-inside: avoid` and leaves half a page blank. Skills repos are ~30–50% code.
- Tables have the same problem, worse.
- **CSS column boxes are not scroll-snap targets** — you must paginate with JS `scrollTo`/`transform` and compute page count from `scrollWidth`, then **recompute on every font/size/measure change**. That's a resize observer plus a layout thrash on every slider tick.
- Deep-linking to a heading requires mapping anchor → page index after layout.
- Ctrl+F breaks (content outside the visible column is rendered but clipped — findable but not scrollable-to).
- Text selection across the spine is jarring.

**Degradation.** Tablet portrait → 1 page. Tablet landscape → keeps 2-up. Mobile → forced to scroll mode.

### Candidate B — Magazine feature layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ← Skills                                                  Aa   ☾   ⌘K       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ISSUE 02 · AUTHORING                                        06 / 09        │  small caps eyebrow
│                                                                              │
│      Writing skills that                                                     │  Fraunces 76px
│      agents actually read                                                    │  text-wrap: balance
│      ─────────────────────────                                               │
│      Nine patterns for turning a folder of markdown into                     │  standfirst 24px
│      something an LLM can navigate under pressure.                           │
│                                                                              │
│   ┌──────────────────┬──────────────────┐   ┌──────────────────────────┐     │
│   │ ┏━┓             │ hand. Frontmatter │   │  ▏IN THIS CHAPTER        │     │
│   │ ┃S┃kills are    │ is parsed at      │   │  ▏                       │     │
│   │ ┗━┛markdown doc-│ build time and    │   │  ▏ Structure         →   │     │
│   │ uments that tea-│ drives the cover, │   │  ▏ Frontmatter       →   │     │
│   │ ch an agent how │ the contents, and │   │  ▏ Progressive       →   │     │
│   │ to do a task.   │ the search index. │   │  ▏   disclosure          │     │
│   │                 │                   │   │  ▏ Testing           →   │     │
│   │ ┌─────────────────────────────────┐ │   │  ▏                       │     │
│   │ │ "A skill is not a prompt.       │ │   │  ▏─────────────────      │     │
│   │ │  It is a document."             │ │   │  ▏ ⌘ 4 code samples      │     │
│   │ └─────────────────────────────────┘ │   │  ▏ ⏱ 8 min               │     │
│   │ spans both columns                  │   │  ▏ ⭑ 1.2k stars          │     │
│   └──────────────────┴──────────────────┘   └──────────────────────────┘     │
│                                              sticky sidebar, 300px           │
│   ┌─────────────────────────────────────────────────────────────────┐        │
│   │ $ npx skills add anthropics/skills                              │        │  code escapes the
│   │ ✓ installed 12 skills                                           │        │  columns, full-bleed
│   └─────────────────────────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Mechanics.** CSS Grid page frame: `grid-template-columns: [full-start] 1fr [main-start] minmax(0, 74ch) [main-end] 24px [rail-start] 300px [rail-end] 1fr [full-end]`. Body prose inside `.main` gets `columns: 2; column-gap: 2.5rem` **only when** `@container (min-width: 62rem)` and only for runs of paragraphs; code/tables/figures are hoisted to `grid-column: full` or `main` and break the column flow.

**Pros.** Genuinely award-winning look. Uses the full 1440px without stretching the measure. The rail is the perfect home for chapter TOC, related skills, install command, repo stats.

**Cons.** Two-column *scrolling* text is the classic web sin — the reader must scroll down, then back up. Mitigate by capping every multi-column run at `max-height: 78vh` and `column-fill: balance`, so a run is never taller than the viewport. That works but requires the markdown pipeline to chunk paragraph runs.

**Degradation.** ≤1280px → rail becomes a collapsible drawer, body drops to 1 column. ≤768px → single column, rail content inlines as a "In this chapter" `<details>` after the standfirst.

### Candidate C — Scroll column + editorial furniture rails ★ **recommended**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  scroll progress (2px)    │
├────────────────┬───────────────────────────────────────┬─────────────────────┤
│                │                                       │                     │
│  anthropics/   │   ISSUE 02 · AUTHORING      06 / 09    │   ON THIS PAGE      │
│  skills        │                                       │   ─────────────     │
│  ──────────    │   Writing skills that                 │   ▎Structure        │  active marker
│                │   agents actually read                │    Frontmatter      │
│  ▸ Getting     │   ────────────────────────            │    Progressive      │
│    started     │   Nine patterns for turning a         │      disclosure     │
│  ▾ Authoring   │   folder of markdown into some-       │    Testing          │
│    · Structure │   thing an LLM can navigate.          │                     │
│    · Frontmat. │                                       │   ─────────────     │
│    · Testing   │   ┏━┓                                 │   ⏱  8 min          │
│  ▸ Distribute  │   ┃S┃kills are markdown documents     │   ⌘  4 samples      │
│  ▸ Reference   │   ┗━┛that teach an agent how to       │   ⭑  1.2k           │
│                │      perform a task. They live in     │                     │
│  ──────────    │      a repository and are read on     │   ─────────────     │
│  ⌘K  Search    │      demand, not loaded up front.     │   ⧉  View source    │
│  Aa  Display   │                                       │   ↗  On GitHub      │
│                │      A skill is not a prompt. It is   │                     │
│  280px         │      a document — and it should       │   sticky, 260px     │
│  sticky        │      read like one.¹                  │                     │
│                │                          ┌──────────┐ │                     │
│                │      ── Structure ──     │ ¹ In the │ │                     │
│                │                          │ Anthropic│ │                     │
│                │      Every skill needs   │ spec a   │ │  ← margin note      │
│                │      a name and a des-   │ skill is │ │    (float, 200px,   │
│                │      cription…           │ a folder.│ │     ≥1440px only)   │
│                │                          └──────────┘ │                     │
│                │   ┌───────────────────────────────┐   │                     │
│                │   │ $ npx skills add …            │   │  code: 118% of the  │
│                │   │ ✓ installed 12 skills         │   │  measure, breaks    │
│                │   └───────────────────────────────┘   │  the column         │
│                │        max-width = 68 CPL             │                     │
└────────────────┴───────────────────────────────────────┴─────────────────────┘
```

**Mechanics.** A three-track grid where only the center track is a reading column, sized by the CPL formula from §2.1. Both rails are `position: sticky; top: 5rem; max-height: calc(100dvh - 7rem); overflow-y: auto; overscroll-behavior: contain`. Code blocks, tables, and figures escape to a wider `--bleed` track (118% of the measure, capped at the grid `main` track). Margin notes float into the right gutter above 1440px and collapse to inline `<aside>` below it.

**Pros.**
- Every capability of the platform works: Ctrl+F, deep links, text selection, print, `prefers-reduced-motion`, screen readers reading in DOM order.
- Code blocks — the dominant content type here — are first-class instead of a fragmentation hazard.
- The measure is exact and reader-controlled; the rails absorb the leftover 1440px so the page never looks empty.
- Cheap: no JS pagination, no layout recomputation on every slider tick.

**Cons.** Not "a book" out of the box. **Fix that with editorial furniture, not pagination:** chapter opener spreads (full-viewport, `100dvh`, display serif, drop cap, rule), running heads that update via IntersectionObserver, small-caps folios, a real cover route, and a colophon at the end.

**Degradation.** ≤1280px → right rail collapses into a floating "Contents" pill. ≤1024px → left nav becomes a `Sheet`. ≤768px → single column, both rails become sheets, margin notes inline.

### Recommendation

**Ship C as the default and only fully-supported reading mode. Add A as an opt-in "Book mode" behind the Page-mode control (§4.1 #25), gated to ≥1280px and auto-disabled for chapters whose code-to-prose ratio exceeds ~25%. Use B's vocabulary — display headline, standfirst, drop cap, pull quote, small-caps eyebrow, sidebar — as the *chapter opener* treatment inside C, not as the running body layout.**

Reasoning:

1. **The content decides.** A skills repo is prose *plus* fenced code, YAML frontmatter, and tables. Paginated multicol fragments all three badly. Building the pagination engine first would be optimizing the 60% of content that is prose at the direct expense of the 40% that is code.
2. **The "book feeling" comes from typography and furniture, far more than from pagination.** Stripe Press — the best online book experience currently shipping — is a **scrolling single column** at 17px/1.5. It reads as a book because of Ivar, the ink color, the paper, and the chapter openers. Not because it turns pages.
3. **C is where the reader controls actually work.** In A, every change to size/measure/line-height invalidates the pagination and reflows the page count — the exact controls that are this product's differentiator become the most expensive operation in the app.
4. **C is accessible by construction.** A needs bespoke work for every one of 1.4.10 Reflow, 2.1.1 Keyboard, 4.1.2 Name/Role/Value on the page-turn affordances, and screen-reader reading order across clipped columns.
5. **A is still worth building** — for prose-heavy skill docs and for the marketing screenshot. Just build it second, and treat it as a mode, not the architecture.

---

## 6. Tablet and mobile

### Tablet, 768–1279px

**Portrait (768–1023).** Single column. Reading column = `min(68 CPL, 100% − 2 × 5vw)`. Left nav → `Sheet` from the left (hamburger). Right rail → a sticky "Contents" chip under the header that expands into a `Popover`. Margin notes inline as bordered `<aside>` blocks at 0.85em. Drop caps stay (2-line sink instead of 3).

**Landscape (1024–1279).** Enable **2-up spread** if page mode is Book — this is where Kindle and Readwise both flip to two columns, and it's the one place the spread genuinely earns its keep (an iPad in landscape is a book-shaped object). Otherwise: reading column + right rail, no left nav.

**Controls.** `Aa` in the header. Panel is a right-side `Sheet`, 420px, non-modal (`modal={false}`) so the reader watches the text reflow.

### Mobile, 320–767px

```
┌─────────────────────────┐
│ ███████░░░░░░░░░░░░░░░  │  2px progress, sits under the notch
├─────────────────────────┤
│ ‹  Authoring      ⌘  Aa │  44px, hides on scroll-down, returns
├─────────────────────────┤  on scroll-up (translateY, 180ms)
│                         │
│  ISSUE 02 · 06/09       │
│                         │
│  Writing skills         │  clamp(1.75rem, 8vw, 2.5rem)
│  that agents            │  text-wrap: balance
│  actually read          │
│  ───────────            │
│                         │
│  Nine patterns for      │  standfirst 1.18em
│  turning a folder of    │
│  markdown into some-    │
│  thing an LLM can       │
│  navigate.              │
│                         │
│  Skills are markdown    │  17px / 1.62
│  documents that teach   │  ~44 CPL
│  an agent how to per-   │
│  form a task. They      │
│  live in a repository   │
│  and are read on de-    │
│  mand.                  │
│                         │
│ ┌─────────────────────┐ │
│ │$ npx skills add …  →│ │  overflow-x: auto,
│ └─────────────────────┘ │  full-bleed −5vw each side
│                         │
├─────────────────────────┤
│  ‹ Prev   ● ● ● ● ●  Next ›│  optional, only in Paged mode
└─────────────────────────┘
        ╭───────────╮
        │  Aa   ☰   │  floating pill, bottom-center,
        ╰───────────╯  24px above safe-area-inset-bottom
```

**Concrete values.**
- Horizontal padding `max(20px, 5vw)`; at 390px that's 19.5px → **20px**, giving a 350px column ≈ **44 CPL** at 17px Literata. That is below Butterick's 45 floor — accept it (there is no alternative at 390px) but *do* drop the default mobile size to **17px** so it isn't worse, and enable `hyphens: auto` below 480px to kill the rag.
- Default line-height at 17px = **1.64**.
- Paragraph gap 0.95em.
- Drop caps: **off** below 480px (a 3-line initial eats 20% of the column).
- Code blocks: full-bleed to the viewport edges (`margin-inline: calc(-1 * max(20px, 5vw))`), `overflow-x: auto`, `overscroll-behavior-x: contain`, and a right-edge fade mask as the scroll affordance. Never wrap by default.
- Tables: same full-bleed + horizontal scroll, with the first column `position: sticky; left: 0`.

**Gesture and tap zones.** Only meaningful in Paged mode; in Scroll mode do **not** hijack taps.

```
Paged mode:                     Scroll mode:
┌───────┬───────────┬───────┐   ┌───────────────────────┐
│       │           │       │   │                       │
│ PREV  │  toggle   │ NEXT  │   │  (no tap regions —    │
│ 22%   │  chrome   │  30%  │   │   normal text select, │
│       │   48%     │       │   │   link taps, scroll)  │
│       │           │       │   │                       │
└───────┴───────────┴───────┘   └───────────────────────┘
  swipe ←/→ : page turn          swipe from left edge : nav sheet
  swipe ↑ from bottom : panel    swipe ↑ from bottom  : panel
  long-press : select + note     long-press : select + note
  pinch : font size ±            pinch : font size ±
```

Rules: tap targets ≥44×44 CSS px (2.5.5). Never bind a horizontal swipe in Scroll mode — it collides with iOS back-navigation. Pinch-to-resize must step the size ladder (not continuous zoom) and must announce the new value. All page-turn transitions respect `prefers-reduced-motion` and the #35 override.

**Where controls live.** A single floating pill, bottom-center, 24px above `env(safe-area-inset-bottom)` — thumb-reachable on a 6.7" phone, unlike a top-right header button. `Aa` opens the `Drawer` at 40% snap (presets + size + theme), draggable to 92% (everything). `☰` opens the nav `Sheet`.

**Chrome behavior.** Header translates out on scroll-down past 120px, returns on any scroll-up (the Instapaper/Safari pattern). Progress bar stays pinned. Use `100dvh` not `100vh`, and `env(safe-area-inset-*)` on all four sides.

---

## 7. CSS techniques — real code and real 2026 support

### 7.0 Support matrix (verified against MDN browser-compat-data and caniuse, August 2026)

| Feature | Chrome | Firefox | Safari | Global | Verdict |
|---|---|---|---|---|---|
| `text-wrap: balance` | 114 | 121 | 17.5 | 86.9% y + 4.7% a | **Ship unconditionally** |
| `text-wrap: pretty` | 130 | ❌ | 26 | — | Ship; it degrades to `auto` |
| `hyphens: auto` | 55 (a) | 6 | 5.1 | 96.0% | Ship (needs `lang`) |
| `hyphenate-limit-chars` | 109 | 137 | ❌ | — | Ship; Safari over-hyphenates |
| `initial-letter` | 110 | ❌ | 9 | 90.4% partial | Ship **with** float fallback (Firefox = 0 support) |
| `hanging-punctuation` | ❌ | ❌ | 26.5 (`first`/`last` since 10) | 16.2% | Ship as pure progressive enhancement |
| `font-variant-numeric` | 52 | 34 | 9.1 | ~98% | **Ship unconditionally** |
| `font-optical-sizing` | 79 | 62 | 13.1 | ~97% | **Ship unconditionally** |
| Container queries | 105 | 110 | 16.0 | 94.0% | **Ship unconditionally** |
| `text-box-trim` / `text-box` | 133 | 154 | 18.2 | 83.0% | Ship with `@supports` |
| `text-autospace` | 140 | 145 | 18.4 | — | Ship for CJK/Latin mixing |
| `text-spacing-trim` | 123 | ❌ | ❌ | — | Skip for now |
| `orphans` / `widows` | 25 | ❌ | 1.3 | — | Paged mode only; Firefox no-ops |
| View Transitions API | 111 | 144 | 18 | — | Ship page-turns behind `@supports`/feature detect |
| Scroll-driven anim. (`animation-timeline`) | 115 | preview | 26 | — | Progress bar only; JS fallback |

### 7.1 The token layer

```css
/* src/app/globals.css — Tailwind v4 */
@import "tailwindcss";

@theme inline {
  --font-reader: var(--reader-family);
  --font-display: var(--reader-display-family, var(--reader-family));
  --font-mono: var(--reader-mono-family);
}

:root {
  /* set by the control panel; these are the *only* mutable inputs */
  --reader-size-step: 19px;
  --reader-measure-cpl: 68;
  --reader-lh-mode: auto;          /* auto | manual */
  --reader-lh-manual: 1.6;
  --reader-tracking: 0em;
  --reader-word-spacing: 0em;
  --reader-para-gap: 0.9em;
  --reader-para-indent: 0em;
  --reader-align: start;
  --reader-weight: 400;

  /* set by [data-reader-font] — see §2.5 */
  --font-avg-char: 0.4795;
  --font-size-mult: 1;
  --font-x-height: 0.507;

  /* derived */
  --reader-font-size: calc(var(--reader-size-step) * var(--font-size-mult));
  --reader-lh-auto: calc(0.49rem + 1.186 * var(--reader-font-size));
  --reader-measure: calc(var(--reader-measure-cpl) * var(--font-avg-char) * 1em);
  --reader-bleed: calc(var(--reader-measure) * 1.18);
}

.reader {
  font-family: var(--font-reader);
  font-size: var(--reader-font-size);
  line-height: var(--reader-lh-auto);
  font-weight: var(--reader-weight);
  letter-spacing: var(--reader-tracking);
  word-spacing: var(--reader-word-spacing);
  text-align: var(--reader-align);
  color: var(--ink);
  background: var(--paper);

  font-optical-sizing: auto;
  font-kerning: normal;
  font-variant-ligatures: common-ligatures contextual;
  font-variant-numeric: oldstyle-nums proportional-nums;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  hanging-punctuation: first last;   /* Safari 26.5 only; harmless elsewhere */
}
[data-reader-lh="manual"] .reader { line-height: var(--reader-lh-manual); }

/* families without `onum` must not request it */
.reader:where([data-font-caps=""] *) { font-variant-numeric: lining-nums proportional-nums; }

.reader > * { max-width: var(--reader-measure); margin-inline: auto; }
.reader > :is(pre, table, figure, .bleed) { max-width: var(--reader-bleed); }
.reader > .full { max-width: none; }

.reader p {
  margin-block: 0 var(--reader-para-gap);
  text-indent: var(--reader-para-indent);
  text-wrap: pretty;
  orphans: 2; widows: 2;
}
.reader :is(h1,h2,h3,h4) + p,
.reader :is(blockquote,pre,figure) + p,
.reader p:first-of-type { text-indent: 0; }

.reader :is(h1,h2,h3,h4,h5,h6,figcaption,blockquote) { text-wrap: balance; }
```

### 7.2 Headings — tracking, balance, optical trim

```css
.reader h2 {
  font-family: var(--font-display);
  font-size: 1.563em;
  line-height: 1.22;
  letter-spacing: -0.012em;          /* em, so it scales — see §3.3 */
  font-weight: 550;                  /* variable-font value, not 500/600 */
  font-variant-numeric: lining-nums;
  margin-block: calc(2 * var(--reader-lh-auto)) calc(1 * var(--reader-lh-auto));
  text-wrap: balance;
}
/* remove half-leading so the heading optically aligns to the rule above it */
@supports (text-box: trim-both cap alphabetic) {
  .reader :is(h1,h2,h3) { text-box: trim-both cap alphabetic; }
}

.reader .eyebrow {
  font-size: 0.8em;
  letter-spacing: 0.08em;
  font-weight: 600;
  font-variant-caps: all-small-caps;   /* real smcp where available */
  color: var(--ink-muted);
}
/* faked small caps for families with no `smcp` (Newsreader, Lora, Inter, Geist, Atkinson) */
[data-font-caps=""] .reader .eyebrow {
  font-variant-caps: normal;
  text-transform: uppercase;
  font-size: 0.7em;
  font-weight: 550;
  letter-spacing: 0.1em;
}
```

### 7.3 Drop cap — `initial-letter` with a Firefox-safe fallback

```css
.chapter-opener > p:first-of-type::first-letter {
  font-family: var(--font-display);
  font-weight: 400;
  color: var(--accent-ink);
  -webkit-initial-letter: 3 3;   /* Safari 9+ still needs the prefix on older builds */
  initial-letter: 3 3;           /* Chrome 110+, Safari 9+ */
  margin-inline-end: 0.08em;
  font-variant-numeric: lining-nums;
}

/* Firefox (and anything else) — no initial-letter at all */
@supports not (initial-letter: 3) {
  .chapter-opener > p:first-of-type::first-letter {
    float: inline-start;
    /* 3 lines tall: 3 × lh ÷ cap-height. lh 1.60, cap 0.70em → 3×1.60/0.70 ≈ 6.86em of cap,
       but font-size is em-of-em: 3 × 1.60 / 0.70 = 6.86 is wrong; the correct factor is
       (3 × line-height) / cap-height-in-em = (3 × 1.60) / 0.70 = 6.857 … as a *font-size*
       multiple of the body em this is 4.8 / 0.70 = 6.86em ONLY if cap-height were 1em.
       Practical, verified-by-eye value for cap 0.70em faces: */
    font-size: 3.42em;
    line-height: 0.70;
    padding-inline-end: 0.06em;
    padding-block-start: 0.04em;
  }
}
/* cap-height varies: Literata/Geist/Fraunces 0.70, Inter 0.728, Newsreader/SourceSerif/Atkinson 0.67,
   EB Garamond 0.65, OpenDyslexic 0.85. Drive the fallback size from a token: */
.chapter-opener > p:first-of-type::first-letter {
  --dropcap-lines: 3;
  font-size: calc(var(--dropcap-lines) * 1.60em / var(--font-cap-height, 0.70) / 2.14);
}

/* never on mobile, never in paged continuation, never before code */
@container reader (max-width: 30rem)      { .chapter-opener > p:first-of-type::first-letter { all: unset; } }
@media (prefers-reduced-motion: reduce)   { /* no animated reveal */ }
```

> The fallback is the one place you must eyeball per family — `initial-letter` does the cap-height math for you; `float` does not. Store a `--font-cap-height` token alongside `--font-avg-char` (values in §2.2) and tune the constant once.

### 7.4 Hyphenation

```css
html { /* REQUIRED — hyphens:auto silently no-ops without a language */ }
/* <html lang="en"> in layout.tsx */

[data-hyphens="auto"] .reader :is(p, li, dd) {
  hyphens: auto;
  -webkit-hyphens: auto;
  hyphenate-limit-chars: 8 4 4;   /* Chrome 109+, FF 137+; Safari ignores → more hyphens */
  hyphenate-limit-lines: 2;       /* no ladders — Safari/Chrome via -webkit- */
  -webkit-hyphenate-limit-lines: 2;
}
[data-hyphens="aggressive"] .reader :is(p, li, dd) { hyphenate-limit-chars: 5 2 2; }

/* justified text without hyphenation is unacceptable — force the pair */
[data-align="justify"] .reader p { text-align: justify; hyphens: auto; text-justify: inter-word; }

/* auto-enable in narrow containers */
@container reader (max-width: 30rem) {
  .reader :is(p, li) { hyphens: auto; hyphenate-limit-chars: 7 3 3; }
}
/* never hyphenate these */
.reader :is(code, kbd, samp, pre, .no-hyphen, a[href^="http"]) { hyphens: manual; }
```

### 7.5 Paged / spread mode

```css
[data-page-mode="spread"] .reader-viewport {
  --page-w: calc(var(--reader-measure) + 2 * var(--page-pad));
  --page-h: calc(100dvh - 9rem);
  --gutter: 5rem;

  block-size: var(--page-h);
  columns: 2;
  column-width: var(--page-w);
  column-gap: var(--gutter);
  column-fill: auto;
  overflow: hidden;
  /* JS translates this, because column boxes are NOT scroll-snap targets */
  translate: calc(-1 * var(--page-index) * (2 * var(--page-w) + var(--gutter))) 0;
  transition: translate 380ms cubic-bezier(.22,.61,.36,1);
}
@media (prefers-reduced-motion: reduce) {
  [data-page-mode="spread"] .reader-viewport { transition: none; }
}

/* the spine */
[data-page-mode="spread"] .reader-viewport::before {
  content: ""; position: absolute; inset-block: 0;
  inset-inline-start: calc(var(--page-w) + var(--gutter) / 2 - 1px);
  inline-size: 2px;
  background: linear-gradient(90deg, transparent, color-mix(in oklch, var(--ink) 12%, transparent), transparent);
}

/* fragmentation hygiene — the whole ballgame */
[data-page-mode="spread"] .reader :is(pre, table, figure, blockquote, .callout) {
  break-inside: avoid;
  max-block-size: calc(var(--page-h) - 4rem);   /* anything taller must be allowed to clip-scroll */
  overflow: auto;
}
[data-page-mode="spread"] .reader :is(h1,h2,h3) { break-after: avoid; break-inside: avoid; }
[data-page-mode="spread"] .reader p { orphans: 2; widows: 2; }   /* Firefox: no-op */
```

**Page count** must be measured, not computed: `pages = Math.ceil(el.scrollWidth / (2*pageW + gutter))`, recomputed in a `ResizeObserver` **and** on every `--reader-*` change, debounced ~120ms. Use `document.fonts.ready` before the first measurement or the count will be wrong on cold load.

**Page turns with View Transitions** (Chrome 111+, Safari 18+, Firefox 144+):

```ts
function turn(dir: 1 | -1) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const go = () => setPage(p => clamp(p + dir, 0, pages - 1))
  if (reduced || !document.startViewTransition) return go()
  document.startViewTransition(go)
}
```

### 7.6 Reading ruler and focus mode

```css
/* Ruler: one overlay, two gradients, no per-line DOM */
.ruler {
  position: fixed; inset: 0; pointer-events: none; z-index: 40;
  --y: 50dvh;
  --h: calc(var(--ruler-lines, 1) * var(--reader-lh-auto));
  --dim: color-mix(in oklch, var(--paper) 0%, transparent);
  background:
    linear-gradient(to bottom,
      color-mix(in oklch, var(--paper) calc(var(--ruler-dim, 55) * 1%), transparent) 0 calc(var(--y) - var(--h)/2),
      transparent                                                                    calc(var(--y) - var(--h)/2) calc(var(--y) + var(--h)/2),
      color-mix(in oklch, var(--paper) calc(var(--ruler-dim, 55) * 1%), transparent) calc(var(--y) + var(--h)/2) 100%);
}
[data-ruler="underline"] .ruler {
  background: none;
  border-block-start: 2px solid color-mix(in oklch, var(--accent) 70%, transparent);
  block-size: 0; inset-block-start: var(--y);
}

/* Focus mode: dim everything but the paragraph under the caret/pointer */
[data-focus-mode="on"] .reader > * {
  opacity: var(--focus-dim, .35);
  transition: opacity 160ms linear;
}
[data-focus-mode="on"] .reader > [data-active] { opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  [data-focus-mode="on"] .reader > * { transition: none; }
}
```

Drive `--y` from a `pointermove` listener throttled with `requestAnimationFrame`, and from `selectionchange` / focus for keyboard users. Set `[data-active]` with an IntersectionObserver whose `rootMargin` centers a 1-line band.

### 7.7 Container queries for the layout

```css
.reader-shell { container: reader / inline-size; }

@container reader (min-width: 46rem)  { .reader { --side-pad: 3rem; } }
@container reader (min-width: 62rem)  { .reader .prose-run { columns: 2; column-gap: 2.5rem; max-block-size: 78vh; column-fill: balance; } }
@container reader (min-width: 78rem)  { .reader .marginnote { float: inline-end; inline-size: 12.5rem; margin-inline-end: -14.5rem; font-size: .8em; line-height: 1.5; } }
@container reader (max-width: 30rem)  { .reader :is(pre, table) { margin-inline: calc(-1 * var(--side-pad)); border-radius: 0; } }
```

Container queries — not media queries — because the reading column lives inside a grid whose width depends on which rails are open. A media query would be wrong every time the reader collapses a rail.

### 7.8 Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
    view-transition-name: none !important;
  }
}
/* user override beats the OS in both directions */
[data-motion="reduce"] * { animation: none !important; transition: none !important; }
[data-motion="allow"]  { /* opt back in even when the OS says reduce */ }
```

Scroll-linked progress bar with a JS fallback:

```css
@supports (animation-timeline: scroll()) {
  .progress { transform-origin: left; animation: grow linear both; animation-timeline: scroll(root block); }
  @keyframes grow { from { scale: 0 1 } to { scale: 1 1 } }
}
```

### 7.9 Paper texture (optional, off by default)

```css
[data-texture]:not([data-texture="0"]) .reader::before {
  content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 1;
  opacity: calc(var(--texture) * 1%);
  mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.82' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
@media (prefers-reduced-transparency: reduce) { [data-texture] .reader::before { display: none; } }
[data-contrast="high"] .reader::before { display: none; }
```

---

## 8. Integration notes for this codebase

- **`next-themes`** already handles light/dark. Extend it: `attribute="class"` for `dark`, plus a **separate** `data-reader-theme` attribute for Paper/Sepia/E-ink/High-contrast so those compose with the dark class rather than fighting it.
- **No-flash SSR.** Read the `reader-prefs` cookie in `src/app/layout.tsx` (a Server Component) and emit `data-reader-*` attributes plus an inline `style` block of the ~10 custom properties on `<html>`. Keep the existing `next-themes` inline script for the OS-preference case only.
- **Shiki** is already in the dependency list. Give code blocks their own token set (`--code-font-size`, `--code-lh: 1.55`) that derives from, but does not equal, the reader tokens. Use `--reader-size-step` index + `--code-size-offset` so code tracks the reader without inheriting oldstyle figures or `text-wrap: pretty`.
- **Base UI (not Radix).** The panel is `Popover` on desktop / `Drawer` on mobile — both already in `src/components/ui`. Use `Slider`, `ToggleGroup`, `Switch`, `Select`, `Collapsible`, `Separator`, `Kbd` (all present). Make the popover **non-modal** so the reader sees changes live.
- **Markdown pipeline.** The unified chain (`remark-parse` → `remark-gfm` → `remark-rehype` → `rehype-slug` → `@shikijs/rehype`) needs three additions for award-level typography: (1) smart punctuation, (2) non-breaking-space insertion, (3) a rehype visitor that tags paragraph *runs* (`.prose-run`) so §7.7's `columns` rule has something to apply to, and hoists `pre`/`table`/`figure` out of those runs.
- **Tailwind v4.** Put all reader tokens in `@theme inline` so `text-(--reader-font-size)`-style arbitrary values resolve, but write the reader's own CSS as plain cascade layers — Tailwind utilities are the wrong tool for a system where every value is a live custom property.
- **Test the WCAG 1.4.12 override.** Add a Vitest/Playwright case that injects the bookmarklet stylesheet (`line-height:1.5!important; letter-spacing:.12em!important; word-spacing:.16em!important; margin-bottom:2em!important`) into a rendered skill page and asserts no clipped or overlapping text. This is the single highest-value accessibility test for a reading app.

---

## 9. Firm recommendations, in priority order

1. **Default: Literata 19px / auto-1.60 / 68 CPL / left-aligned / 0.9em paragraph gap / Paper (light) & Midnight (dark).** This is the median of the best-in-class corpus, and Literata is the only OFL face in the set that is simultaneously screen-designed, optically-sized, variable, and equipped with real small caps and oldstyle figures.
2. **Express measure in characters-per-line and convert per family** with the verified `--font-avg-char` table. Do not use `ch`. This is the single least-obvious, highest-impact decision in the whole spec.
3. **Normalize font size by x-height**, clamped to [0.90, 1.15], with the verified table. Without it the family switcher feels broken.
4. **Build layout C** (scroll column + sticky editorial rails + full-viewport chapter openers). Add spread mode second, as an opt-in, gated at ≥1280px.
5. **Ship six presets before you ship 37 sliders.** Presets are what people use; the sliders are what makes the presets credible.
6. **Ship `text-wrap: balance` on all headings and `pretty` on all body copy today.** Both are safe, both are free, both are visible.
7. **Ship `initial-letter` with the float fallback** — Firefox has zero support and always will until they implement it.
8. **Do not use the word "bionic" anywhere.** Call it Fixation emphasis, implement it yourself, default it off, and get counsel before launch.
9. **Atkinson Hyperlegible *Next*, not the original** — variable 200–800 with italics vs. static 400/700. Same license, strictly better.
10. **Newsreader has no small caps and no oldstyle figures.** Gate those controls per family from the verified feature table; never emit `font-variant-caps: small-caps` into a face that will synthesize it.

---

## Appendix — sources verified this session

- Google Fonts metadata: `https://fonts.google.com/metadata/fonts` (1,942 families)
- Next 16.3 font registry: `node_modules/next/dist/compiled/@next/font/dist/google/font-data.json`
- Next font validation rules: `.../google/validate-google-font-function-call.js`, `.../google/get-font-axes.js`
- Font binaries: `github.com/google/fonts/raw/main/ofl/*` — inspected with fontTools 4.63.0
- OpenDyslexic license: `github.com/antijingoist/opendyslexic/OFL.txt`; package `@fontsource/opendyslexic@5.3.0` (`license: OFL-1.1`); Fontsource API `api.fontsource.org/v1/fonts/opendyslexic`
- Browser support: `github.com/mdn/browser-compat-data` (`css/properties/*.json`), `github.com/Fyrd/caniuse` (`features-json/*.json`)
- WCAG: `w3.org/WAI/WCAG22/Understanding/text-spacing.html`, `…/visual-presentation.html`
- Butterick: `practicaltypography.com/line-length.html`
- Readwise Reader appearance defaults: `docs.readwise.io/reader/docs/faqs/appearance`
- Bionic Reading licensing: `bionic-reading.com/bionic-reading-font-software-license-agreement/`, `…/patent-trademark/`; USPTO reg. 5557651
- Live computed styles measured in Chromium 1440×900: theverge.com, linear.app/now, every.to, worksinprogress.co, newsletter.pragmaticengineer.com, ia.net, press.stripe.com
