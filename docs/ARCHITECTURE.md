# Skills Docs — Architecture Brief

**Status:** Authoritative. This document supersedes the six research reports in `docs/research/` wherever they conflict. The research reports remain the *evidence*; this document is the *decision*.
**Date:** 2026-08-08 · **Author:** Principal architect / PM
**Stack (already installed, verified in `package.json`):** Next.js 16.3.0 (App Router, `src/`, Turbopack) · React 19.2.8 · Tailwind v4 · shadcn preset `base-luma` (Base UI 1.7, **not Radix**) · stone base color · HugeIcons · `unified`/`remark`/`rehype`/Shiki 4.4.2 · `next-themes` · `cmdk` · `sonner` · Vitest 4.

**Read `node_modules/next/dist/docs/` before writing any Next.js code.** `node_modules/next/AGENTS.md` states verbatim: *"This is NOT the Next.js you know… Read the relevant guide in `dist/docs/` before writing any code."* Training data on Next 16 is stale. That directory is the source of truth for framework behavior; this document is the source of truth for product behavior.

---

## Table of contents

1. [Product definition and route map](#1-product-definition-and-route-map)
2. [File and directory tree](#2-file-and-directory-tree)
3. [Data layer contract](#3-data-layer-contract)
4. [Theming contract](#4-theming-contract)
5. [Reading experience spec](#5-reading-experience-spec)
6. [Component inventory](#6-component-inventory)
7. [Accessibility and LLM-surface acceptance checklist](#7-accessibility-and-llm-surface-acceptance-checklist)
8. [Build plan](#8-build-plan)
9. [Open risks and mitigations](#9-open-risks-and-mitigations)
10. [Decision log](#10-decision-log-conflicts-resolved)

---

# 1. Product definition and route map

## 1.1 What this is

**Skills Docs turns any GitHub repository containing `SKILL.md` files into a branded, book-grade reading experience — for humans and for agents.**

One repo = one **issue** of a magazine / one **book**. One `SKILL.md` = one **chapter**. The repo README is the **front matter**. The owner's `design.md` (or the community registry, or a deterministic hash) supplies the issue's **accent, display font, radius, and voice**. Every page is simultaneously a beautiful HTML reading surface and a clean `text/markdown` document an agent can read by appending `.md`.

**Three audiences, in priority order:**

1. **A developer evaluating a skills repo.** They want to read what the skills actually *say* without cloning, without GitHub's file browser, at a typography quality that respects their eyes.
2. **An agent.** It wants `/{owner}/{repo}.md` and `/{owner}/{repo}/.well-known/agent-skills/index.json`, and it wants to install without cloning.
3. **The repo owner.** They want their skills to look like *their* brand, and they want to link to it.

**Non-goals for v1:** authoring/editing skills, user accounts, comments, private repos, an MCP server, non-GitHub sources.

## 1.2 Canonical identity

| Constant | Value | Where |
|---|---|---|
| Production origin | `https://skillsdocs.com` | `SITE_URL` in `src/lib/site.ts`, from `NEXT_PUBLIC_SITE_URL` |
| Site name | `Skills Docs` | `SITE_NAME` |
| Primary install command | `npx skills add <owner>/<repo>` | `installCommand()` in `src/lib/site.ts` |

**DECISION — domain.** `skillsdocs.com`. The a11y research assumed `githubskills.book`; `.book` is an Amazon-controlled brand gTLD not generally registrable. Every `@id`, `metadataBase`, `llms.txt` URL, and OG image reads `SITE_URL` — **never a string literal.** One constant, one change.

**DECISION — install command.** `npx skills add <owner>/<repo>` is the only form **verified in the wild** (observed verbatim in `supabase/agent-skills`, `coinbase/agentic-wallet-skills`, `resend/design-skills` READMEs). The per-skill form `npx skills add <owner>/<repo>/<skill>` is unverified — do **not** ship it in OG images or copy buttons. Chapter pages show the repo-level command plus a "Copy skill path" secondary action.

## 1.3 Route map

Every route below. `use cache` scopes are marked; **anything not marked is dynamic by default** because `cacheComponents: true` is on.

### Human (HTML)

| URL | Renders | Static/Dynamic | Cache |
|---|---|---|---|
| `/` | Home: featured books, skills.sh leaderboard, search entry | Prerendered shell; `<Suspense>` islands | `use cache` + `cacheLife('hours')`, tag `home` |
| `/search?q=` | Cross-book search results | Dynamic (reads `searchParams`) | `use cache` on the index build only; query match is uncached |
| `/[owner]/[repo]` | **The book**: cover, masthead, standfirst, TOC, stats, colophon | Shell prerendered; body streams | `use cache` + `cacheLife('hours')`, tags `repo:{o}/{r}`, `book` |
| `/[owner]/[repo]/[skill]` | **A chapter**: chapter opener + rendered `SKILL.md` + rails | Shell prerendered; body streams | same tags + `skill:{o}/{r}/{s}` |
| `/about`, `/docs/api` | Static marketing/API docs | Fully static | `cacheLife('max')` |

**Rule: the third path segment namespace belongs entirely to skill slugs.** No static sibling routes may be added under `/[owner]/[repo]/`. The colophon, the accessibility report, and the "all chapters" view are **sections of the book page**, not routes. This is non-negotiable — a repo containing a skill named `colophon` must not be shadowed.

### Agent (Markdown)

| URL | Serves | How |
|---|---|---|
| `/[owner]/[repo].md` | Whole book as one markdown doc (front matter + every chapter, in order) — this **is** our `llms-full.txt` for that book | `proxy.ts` rewrites → `/api/md/[owner]/[repo]` |
| `/[owner]/[repo]/[skill].md` | One chapter, unmodified body + provenance header | `proxy.ts` rewrites → `/api/md/[owner]/[repo]/[skill]` |
| Any HTML reader URL with `Accept: text/markdown` outranking `text/html` | Same markdown | `proxy.ts` rewrite, `Vary: Accept` |
| `/llms.txt` | Site index per llmstxt.org spec: H1, blockquote summary, `## Featured books`, `## API`, `## Optional` | `app/llms.txt/route.ts` |

**DECISION — `.md` suffix is canonical; `Accept` negotiation is a bonus.** Rejected `/{owner}/{repo}/md` (collides with the skill namespace). `.md` URLs are cacheable (`public, s-maxage=3600`), pasteable, and are what Anthropic, Vercel, and Mintlify all converged on (verified). `Accept` negotiation carries `Vary: Accept` + `s-maxage=600` and is a convenience path only.

**DECISION — no per-book `llms.txt` / `llms-full.txt` routes.** `/{owner}/{repo}.md` already *is* the full corpus for that book, and per-book `llms.txt` would need a segment under `/[owner]/[repo]/`, which is forbidden by the namespace rule. Site-level `/llms.txt` links to the `.md` URLs. Two routes eliminated.

### Agent (JSON)

| URL | Serves |
|---|---|
| `/.well-known/agent-skills/index.json` | Site-level: the one skill *we* author (teaches an agent to use this site) |
| `/[owner]/[repo]/.well-known/agent-skills/index.json` | **The differentiator.** Per-book manifest, `schemas.agentskills.io/discovery/0.2.0`, one entry per chapter with `sha256` digest and a `.md` URL |
| `/.well-known/api-catalog` | RFC 9727 linkset, `application/linkset+json` |
| `/api/v1/books/[owner]/[repo]` | Book JSON |
| `/api/v1/books/[owner]/[repo]/skills/[skill]` | Chapter JSON |
| `/api/v1/search?q=` | Cross-book search |
| `/api/v1/openapi.json` | OpenAPI 3.1 description |
| `/api/v1/health` | Liveness + upstream rate-limit budget |

**DECISION — all `.well-known` URLs are served by `proxy.ts` rewrites to `/api/well-known/*` route handlers.** Next's treatment of a literal `.well-known` directory inside `app/` is unverified (dot-prefixed directories may be excluded as hidden). A rewrite is deterministic and costs nothing. Do not create `src/app/.well-known/`.

### Metadata / infra

| URL | Source |
|---|---|
| `/robots.txt` | `app/robots.ts` — permissive, `Content-Signal: search=yes, ai-input=yes, ai-train=yes` |
| `/sitemap.xml` | `app/sitemap.ts` — featured books + their chapters |
| `/manifest.webmanifest` | `app/manifest.ts` |
| `/opengraph-image` | `app/opengraph-image.tsx` |
| `/[owner]/[repo]/opengraph-image` | Per-book OG (owner avatar, repo, skill count, stars) |
| `/[owner]/[repo]/[skill]/opengraph-image` | Per-chapter OG |
| `/api/icon/[owner]/[repo]` | Per-book 64×64 PNG favicon (owner avatar + issue accent) |
| `POST /api/revalidate` | Webhook; `revalidateTag(\`repo:${o}/${r}\`, 'max')` behind `REVALIDATE_SECRET` |

## 1.4 The rendering rule that shapes everything

```tsx
// src/app/[owner]/[repo]/page.tsx — CORRECT
export default function RepoPage(props: PageProps<'/[owner]/[repo]'>) {
  return (
    <Suspense fallback={<BookSkeleton />}>
      <BookBody params={props.params} />   {/* pass the PROMISE, don't await */}
    </Suspense>
  );
}
async function BookBody({ params }: Pick<PageProps<'/[owner]/[repo]'>, 'params'>) {
  const { owner, repo } = await params;   // await INSIDE the boundary
  ...
}
```

**Never `await params` above a `<Suspense>` boundary in a page or layout.** The bundled docs are explicit that doing so "would tie this layout's App Shell to that URL," destroying shell reuse across every repo in the world. Consequence: **`BookSkeleton` is the App Shell that every uncached repo renders first — the most-viewed component in the product.** It gets real design investment: chrome, spine, masthead placeholder, plausible skeleton text. It should read as "the book is here, not yet inked," never as a spinner.

`generateStaticParams` must return a **non-empty** array (`[]` is now a build error). Seed it with 8 showcase repos; `dynamicParams: true` handles the rest — Next serves the shell instantly and upgrades in the background.

---

# 2. File and directory tree

Every file, with its purpose. **The "Owner" column is the workstream (§8) that may create/edit it. No other workstream touches it.**

```
githubskills/
├─ next.config.ts                    WS-0  cacheComponents, partialPrefetching, images, cacheLife profiles
├─ eslint.config.mjs                 WS-8  strict jsx-a11y ruleset (replaces the 6 default warnings)
├─ playwright.config.ts              WS-8  6 projects: desktop, mobile, reflow-320, forced-colors, reduced-motion, contrast-more
├─ vitest.config.ts                  WS-8  unit tests (color math, parsers, serializers)
├─ .lighthouserc.json                WS-8  accessibility: 1.0 assertion
├─ components.json                   WS-0  (exists) shadcn config; add the dither registry entry
├─ docs/ARCHITECTURE.md              —     this file
├─ docs/research/*.md                —     evidence, frozen
├─ public/
│  ├─ fonts/opendyslexic-{400,700}-{normal,italic}.woff2   WS-5  vendored from @fontsource/opendyslexic (OFL-1.1)
│  └─ og/{Literata-SemiBold,Geist-Regular}.ttf             WS-6  ImageResponse needs raw ArrayBuffers, not next/font
├─ scripts/
│  ├─ probe-repos.mts                WS-1  (exists) verify a repo has real SKILL.md files
│  ├─ sync-skills-sh.mts             WS-1  refresh the cached skills.sh snapshot into src/lib/data/
│  └─ audit-contrast.mts             WS-3  sweep all 360 hues; fails below AA
├─ tests/
│  ├─ a11y/chrome.spec.ts            WS-8  axe on our own UI (home, book, chapter, controls open)
│  ├─ a11y/reader.spec.ts            WS-8  1.4.12 text-spacing injection, 400% reflow, keyboard tour
│  ├─ a11y/forced-colors.spec.ts     WS-8  Windows HCM: translucent surfaces must stay readable
│  └─ fixtures/clean-book/           WS-8  a hand-authored, zero-violation skills repo fixture
└─ src/
   ├─ proxy.ts                       WS-6  Next 16 replacement for middleware.ts: .md rewrites, Accept negotiation, .well-known rewrites, Link headers
   ├─ app/
   │  ├─ layout.tsx                  WS-0  <html>: all font .variable classes, data-* from the prefs cookie, providers, metadataBase
   │  ├─ globals.css                 WS-0  Tailwind entry + @theme + @import of every partial below (stubs land in WS-0)
   │  ├─ page.tsx                    WS-9  home / directory
   │  ├─ not-found.tsx               WS-9  site 404
   │  ├─ error-boundary.tsx          WS-9  catchError() boundary with retry()
   │  ├─ robots.ts                   WS-6
   │  ├─ sitemap.ts                  WS-6
   │  ├─ manifest.ts                 WS-6
   │  ├─ opengraph-image.tsx         WS-6  site OG
   │  ├─ llms.txt/route.ts           WS-6  llmstxt.org-conformant site index
   │  ├─ search/page.tsx             WS-9  cross-book search results
   │  ├─ [owner]/[repo]/
   │  │  ├─ layout.tsx               WS-4  injects the issue theme <style>, sets data-issue, renders rails
   │  │  ├─ page.tsx                 WS-4  book: cover + TOC + colophon (Suspense + BookSkeleton)
   │  │  ├─ not-found.tsx            WS-4  "no skills book here"
   │  │  ├─ error-boundary.tsx       WS-4  catchError with retry for transient GitHub failures
   │  │  ├─ opengraph-image.tsx      WS-6
   │  │  └─ [skill]/
   │  │     ├─ page.tsx              WS-4  chapter
   │  │     └─ opengraph-image.tsx   WS-6
   │  └─ api/
   │     ├─ icon/[owner]/[repo]/route.ts                  WS-6  per-book favicon
   │     ├─ md/[owner]/[repo]/route.ts               WS-6  whole book as text/markdown
   │     ├─ md/[owner]/[repo]/[skill]/route.ts       WS-6  one chapter as text/markdown
   │     ├─ well-known/agent-skills/route.ts         WS-6  site-level manifest
   │     ├─ well-known/agent-skills/[owner]/[repo]/route.ts  WS-6  per-book manifest w/ sha256 digests
   │     ├─ well-known/api-catalog/route.ts          WS-6  RFC 9727 linkset
   │     ├─ v1/books/[owner]/[repo]/route.ts         WS-6
   │     ├─ v1/books/[owner]/[repo]/skills/[skill]/route.ts  WS-6
   │     ├─ v1/search/route.ts                       WS-6
   │     ├─ v1/openapi.json/route.ts                 WS-6
   │     ├─ v1/health/route.ts                       WS-6  includes GitHub rate-limit budget
   │     └─ revalidate/route.ts                      WS-1  webhook, secret-gated
   ├─ styles/                        (each partial owned by exactly one workstream; globals.css @imports all of them)
   │  ├─ tokens.css                  WS-0  the full token list from §4.2
   │  ├─ theme-modes.css             WS-3  paper/ink modes, contrast axis, forced-colors + prefers-contrast resets
   │  ├─ reader.css                  WS-5  reader shell, measure, line-height, drop cap, ruler, focus mode
   │  ├─ prose.css                   WS-2  rendered markdown: headings, lists, tables, blockquote, footnotes
   │  ├─ code.css                    WS-2  Shiki dual-theme rules, scroll affordance, line numbers
   │  └─ chart.css                   WS-7  dither-kit container sizing, HCM chart fallbacks
   ├─ components/
   │  ├─ ui/                         WS-0  shadcn base-luma primitives (35 present; §6.1 adds 3)
   │  ├─ dither-kit/                 WS-7  vendored charts; palette.ts is patched by us
   │  ├─ providers/
   │  │  ├─ theme-provider.tsx       WS-3  next-themes wrapper (class strategy) + paper-mode attribute
   │  │  ├─ reader-prefs-provider.tsx WS-5 context + cookie/localStorage sync, writes CSS custom props on <html>
   │  │  └─ motion-provider.tsx      WS-7  <MotionConfig reducedMotion="user"> (dither-kit's tooltip ignores it otherwise)
   │  ├─ chrome/
   │  │  ├─ skip-links.tsx           WS-4  first focusable elements in the DOM
   │  │  ├─ site-header.tsx          WS-4  banner landmark, hides on scroll-down (mobile)
   │  │  ├─ live-regions.tsx         WS-4  #page-status (polite) + #alerts (assertive), always mounted
   │  │  ├─ command-palette.tsx      WS-9  cmdk, ⌘K / "/"
   │  │  ├─ theme-toggle.tsx         WS-3
   │  │  └─ shortcuts-dialog.tsx     WS-5  "?" help; also the 2.1.4 disable/remap surface
   │  ├─ book/
   │  │  ├─ book-skeleton.tsx        WS-4  ★ the App Shell. Highest-traffic component in the product
   │  │  ├─ book-cover.tsx           WS-4  masthead, issue number, standfirst, avatar, install command
   │  │  ├─ table-of-contents.tsx    WS-4  parts → chapters, sparklines, reading minutes
   │  │  ├─ chapter-opener.tsx       WS-4  full-viewport display type, eyebrow, drop cap, rule
   │  │  ├─ chapter-nav.tsx          WS-4  prev/next, "Page navigation" landmark
   │  │  ├─ rail-left.tsx            WS-4  sticky contents rail (desktop ≥1024px)
   │  │  ├─ rail-right.tsx           WS-4  sticky "On this page" + stats + source links
   │  │  ├─ running-head.tsx         WS-4  IntersectionObserver-driven; updates the current section name
   │  │  ├─ colophon.tsx             WS-4  layouts observed, license, provenance, a11y report, theme origin
   │  │  └─ install-command.tsx      WS-4  copy button with a real accessible name + live-region confirmation
   │  ├─ reader/
   │  │  ├─ markdown.tsx             WS-2  hast → React via hast-util-to-jsx-runtime (no dangerouslySetInnerHTML)
   │  │  ├─ code-block.tsx           WS-2  Shiki output + copy, scroll affordance, optional line numbers
   │  │  ├─ margin-note.tsx          WS-2  footnote → gutter note above 1440px, inline <aside> below
   │  │  ├─ reading-progress.tsx     WS-5  scroll-driven where supported, JS fallback
   │  │  ├─ reading-ruler.tsx        WS-5  single overlay, two gradients, no per-line DOM
   │  │  ├─ focus-mode.tsx           WS-5  dims all but the active block
   │  │  └─ controls/
   │  │     ├─ controls-trigger.tsx  WS-5  "Aa" button (top-right desktop / bottom pill mobile)
   │  │     ├─ controls-panel.tsx    WS-5  Popover (desktop, non-modal) / Drawer (mobile, snap 40%/92%)
   │  │     ├─ preset-row.tsx        WS-5  the six presets
   │  │     ├─ type-section.tsx      WS-5  family / size / line-height / measure
   │  │     ├─ layout-section.tsx    WS-5  align / spacing / margins / paragraph style
   │  │     ├─ theme-section.tsx     WS-5  paper mode / contrast / accent
   │  │     └─ advanced-section.tsx  WS-5  Collapsible: tracking, word spacing, numerals, ligatures, hyphens
   │  ├─ charts/
   │  │  ├─ accessible-chart.tsx     WS-7  figure + figcaption + sr-only data table; neutralises dither-kit's hard-coded aria-label="Chart"
   │  │  ├─ installs-bar.tsx         WS-7  installs per skill
   │  │  ├─ category-donut.tsx       WS-7  skills per part
   │  │  └─ installs-sparkline.tsx   WS-7  8-week weeklyInstalls from skills.sh
   │  └─ home/
   │     ├─ featured-grid.tsx        WS-9
   │     ├─ leaderboard.tsx          WS-9
   │     └─ repo-search-form.tsx     WS-9  "paste any github.com/owner/repo"
   ├─ hooks/
   │  ├─ use-reader-prefs.ts         WS-5
   │  ├─ use-shortcuts.ts            WS-5  the 2.1.4-compliant engine
   │  ├─ use-active-heading.ts       WS-4  IntersectionObserver for rails + running head
   │  └─ use-media.ts                WS-5  matchMedia with SSR-safe default
   └─ lib/
      ├─ site.ts                     WS-0  SITE_URL, SITE_NAME, installCommand(), absoluteUrl()
      ├─ site-icons.ts               WS-0  hosted defaults + per-book icon metadata
      ├─ book-icon.ts                WS-6  owner-avatar favicon renderer
      ├─ image-data-uri.ts           WS-6  validated raster fetches for metadata images
      ├─ utils.ts                    WS-0  (exists) cn()
      ├─ color.ts                    WS-3  (exists) OKLCH↔sRGB, gamut map, WCAG, hueFromString
      ├─ github.ts                   WS-1  (exists) repo/tree/owner/raw fetchers → convert to `use cache`
      ├─ skills.ts                   WS-1  (exists) discovery, dedupe, frontmatter parse, headings
      ├─ book.ts                     WS-1  (exists) getBook(), groupSkills(), chapterNav()
      ├─ markdown.ts                 WS-2  (exists) unified pipeline → extend per §3.6
      ├─ marketplace.ts              WS-1  parse .claude-plugin/marketplace.json + siblings (editorial metadata only)
      ├─ skills-sh.ts                WS-1  RSC-payload scraper for skills.sh (+ static fallback)
      ├─ data/seed-repos.ts          WS-1  the 89 verified SeedRepo entries
      ├─ data/skills-sh-snapshot.json WS-1 last-good scrape, committed, used when the live scrape fails
      ├─ featured.ts                 WS-1  merges seed + live into the home page + sitemap + generateStaticParams
      ├─ design/                     WS-3  (exists) types.ts, registry.ts, parse.ts, theme.ts, fetch.ts
      ├─ reader/
      │  ├─ fonts.ts                 WS-5  next/font declarations; exactly 3 preloaded
      │  ├─ metrics.ts               WS-5  the verified per-family avg-char / x-height / cap-height / feature tables
      │  ├─ prefs.ts                 WS-5  ReaderPrefs type, cookie codec, defaults, clamping
      │  └─ presets.ts               WS-5  the six presets
      ├─ serialize.ts                WS-6  bookToMarkdown(), skillToMarkdown(), bookToLlmsTxt()
      ├─ jsonld.ts                   WS-6  Book / Chapter / SoftwareSourceCode / BreadcrumbList emitters
      ├─ search.ts                   WS-9  in-memory index build + query
      └─ shortcuts.ts                WS-5  ActionId union, default keymap, serialization
```

---

# 3. Data layer contract

Types marked **(exists)** are already implemented in the repo and are **normative — do not rename them.** Types marked **(new)** must be added.

## 3.1 `Repo` — use the existing `RepoMeta` (exists, `src/lib/github.ts`)

**DECISION:** there is no separate `Repo` type. `RepoMeta` is it. The research reports used `Repo`/`RepoMeta` interchangeably; the shipped name wins.

```ts
export interface RepoMeta {
  owner: string; repo: string; fullName: string; defaultBranch: string;
  description: string | null; homepage: string | null;
  stars: number; forks: number; watchers: number; openIssues: number;
  topics: string[];
  license: { key: string; name: string; spdxId: string | null } | null;
  pushedAt: string | null; createdAt: string | null;
  archived: boolean; isFork: boolean;
  htmlUrl: string; ownerAvatar: string;
  ownerType: "User" | "Organization" | string; ownerUrl: string;
}

export interface TreeEntry { path: string; type: "blob" | "tree" | "commit"; size?: number; sha: string }
export interface RepoTree  { entries: TreeEntry[]; truncated: boolean }
export interface OwnerMeta {
  login: string; name: string | null; bio: string | null; blog: string | null;
  avatar: string; htmlUrl: string; type: string; location: string | null;
  twitter: string | null; publicRepos: number; followers: number;
}
```

**Additions (new):**

```ts
/** skills.sh signal, merged onto a book when available. */
export interface RepoSignal {
  installs: number;                 // 0 when unranked
  weeklyInstalls: number[];         // 8 elements, oldest→newest; [] when unknown
  official: boolean;                // listed on skills.sh /official
  featuredSkill: string | null;     // skills.sh editor's pick — our "cover story"
  perSkillInstalls: Record<string, number>;
}

/** Editorial metadata from a plugin marketplace manifest. NEVER the skill index. */
export interface MarketplaceInfo {
  path: string;                     // where we found it
  publisher: string | null;         // owner.name
  publisherUrl: string | null;      // owner.url — a design.md lookup candidate
  plugins: Array<{ name: string; description: string | null; source: string; version: string | null }>;
}
```

## 3.2 `Skill` (exists, `src/lib/skills.ts`) — normative

```ts
export interface SkillFrontmatter {
  name?: string; description?: string; license?: string; compatibility?: string;
  metadata?: Record<string, unknown>; "allowed-tools"?: string; [key: string]: unknown;
}
export interface SkillHeading { depth: number; text: string; id: string }
export interface SkillVariant { label: string; path: string }   // "claude" | "codex" | "cursor" …

export interface Skill {
  slug: string;                 // URL-safe, unique within a book
  name: string;                 // frontmatter.name ?? directory name
  title: string;                // display-cased
  description: string;
  dir: string;                  // "" for a root SKILL.md
  skillMdPath: string;
  group: string;                // magazine "part"; "" when ungrouped
  frontmatter: SkillFrontmatter;
  body: string;                 // markdown with frontmatter stripped — served VERBATIM to agents
  headings: SkillHeading[];
  wordCount: number; readingMinutes: number;
  resources: SkillResource[];
  license: string | null; compatibility: string | null; allowedTools: string[];
  variants: SkillVariant[];     // byte-identical mirrors collapsed into this chapter
  parentSlug: string | null;
  issues: string[];             // spec violations, surfaced in the colophon — never hidden
}
```

## 3.3 `SkillFile` (new) — the resource contract

The existing type is named `SkillResource`. **DECISION:** rename is not worth the churn; `SkillFile` is a **type alias** so both names resolve, and new code uses `SkillFile`.

```ts
export interface SkillResource {
  path: string;      // repo-relative
  relPath: string;   // relative to the skill directory
  kind: "script" | "reference" | "asset" | "other";
  size: number;      // bytes
  ext: string;       // lowercase, no dot
}
export type SkillFile = SkillResource;
```

## 3.4 `Book` and `BookPart` (exists, `src/lib/book.ts`) — extended

```ts
export interface BookPart { group: string; title: string; skills: Skill[] }

export interface Book {
  repo: RepoMeta;
  owner: OwnerMeta | null;
  readme: string | null;              // the book's front matter
  skills: Skill[];
  parts: BookPart[];
  truncated: boolean;                 // GitHub capped the tree; chapters may be missing
  totalWords: number; totalReadingMinutes: number;
  layouts: string[];                  // distinct path shapes observed, for the colophon
  // --- new in this architecture ---
  signal: RepoSignal | null;          // skills.sh
  marketplace: MarketplaceInfo | null;
  theme: IssueTheme;                  // always present; falls back to the name hash
  issueNumber: number;                // stable per repo: 1 + (fnv1a(fullName) % 99)
}
```

## 3.5 `IssueTheme` (exists, `src/lib/design/types.ts`) — normative

```ts
export interface IssueTheme {
  owner: string;
  hue: number;                   // 0–360
  chroma: number;                // ≤ 0.19
  accentLight: string;           // oklch(0.52 …) — ≥4.5:1 on light paper, PROVEN by test
  accentDark: string;            // oklch(0.70 …) — ≥4.5:1 on dark paper
  accentForegroundLight: string; accentForegroundDark: string;
  accentLightHc: string; accentDarkHc: string;   // ≥7:1
  ink: string | null;            // the brand's own primary — masthead logotype ONLY
  chartLight: string[]; chartDark: string[];     // categorical series
  radiusPx: number | null;
  displayFont: string | null; bodyFont: string | null; monoFont: string | null;
  origin: "curated" | "owner-site" | "apex" | "registry" | "repo-local" | "name-hash";
}
```

## 3.6 `SeedRepo` (new, `src/lib/data/seed-repos.ts`) — normative

```ts
export type SeedRepo = {
  owner: string; repo: string; branch: string;
  skillCount: number;              // verified, noise-filtered
  layout: string;                  // dominant path pattern
  layouts: string[];               // every pattern present
  stars: number; installs: number; official: boolean;
  license: string | null; marketplace: boolean;
  avatar: string;
  site: string | null;             // repo homepage → owner blog; the design.md lookup key
  description: string | null;
};
export const SEED_REPOS: SeedRepo[] = [ /* the 89 verified entries from docs/research/skills-repos.md §5 */ ];
```

## 3.7 Library function signatures

### `src/lib/site.ts` (WS-0)
```ts
export const SITE_URL: string;                    // NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
export const SITE_NAME: "Skills Docs";
export function absoluteUrl(path: string): string;
export function installCommand(owner: string, repo: string): string;   // `npx skills add ${owner}/${repo}`
export function bookPath(owner: string, repo: string): string;
export function chapterPath(owner: string, repo: string, slug: string): string;
```

### `src/lib/github.ts` (WS-1) — convert every fetcher to `use cache`
```ts
export const REVALIDATE: { repo: number; tree: number; content: number; owner: number };
export class GitHubError extends Error { readonly status: number; readonly kind: "not-found"|"rate-limited"|"network"|"other" }

export async function fetchRepoMeta(owner: string, repo: string): Promise<RepoMeta>;      // 'use cache'; cacheLife('repo'); cacheTag(`repo:${o}/${r}`)
export async function fetchRepoTree(owner: string, repo: string, ref: string): Promise<RepoTree>;
export async function fetchOwnerMeta(login: string): Promise<OwnerMeta | null>;
export function rawUrl(owner: string, repo: string, ref: string, path: string): string;
export function blobUrl(owner: string, repo: string, ref: string, path: string): string;
export async function fetchRawText(url: string, maxBytes?: number): Promise<string | null>;
export async function fetchRawTextBatch(urls: string[], concurrency?: number): Promise<Array<string | null>>;
export async function rateLimitBudget(): Promise<{ limit: number; remaining: number; resetAt: string }>;  // new, for /api/v1/health
```

**Hard constraint:** one book = **two** GitHub API calls (repo meta + one recursive tree) plus `raw.githubusercontent.com` reads, which are CDN-served and do not count against the quota. Never call the contents API per file. Never call the search API except as the truncation fallback.

**`use cache` argument rule:** primitives only. Never pass a `URL`, a class instance, or a function into a cached function — the cache key serializer rejects them.

### `src/lib/skills.ts` (WS-1)
```ts
export function discoverSkills(entries: TreeEntry[], repoName: string): SkillStub[];
export function collectResources(entries: TreeEntry[], stub: SkillStub): SkillResource[];
export function extractHeadings(markdown: string): SkillHeading[];
export function parseSkill(stub: SkillStub, source: string, resources: SkillResource[]): Skill;
export function titleCase(input: string): string;
```

Discovery is **generic recursive tree + `endsWith("SKILL.md")`**, never a glob. Verified across 4,039 real paths: `skills/*/SKILL.md` is only **38%** of files. Eight families exist including repo-root, bare `<slug>/`, six different dot-directories, `plugins/<p>/skills/`, and arbitrary prefixes (`skill-data/`, `encore/`, `config/skills/`, `solutions/`, `tools/audio/`).

Three non-negotiable behaviors, each with a regression test:
- **Dot-directory traversal must be enabled.** `openai/skills` hides 39 of 44 skills under `skills/.curated/`.
- **Dedupe by slug**, preferring the shallowest non-dot path. `pbakaus/impeccable` ships every skill 5×; `microsoft/azure-skills` 2×.
- **Noise filter:** `/(^|\/)(assets|templates?|fixtures|examples?|tests?|__tests__|node_modules)(\/|$)/`. `langchain-ai/deepagents` has a 12-slash test fixture.

### `src/lib/book.ts` (WS-1)
```ts
export async function getBook(owner: string, repo: string): Promise<Book>;   // 'use cache'; cacheLife('hours'); tags repo:… + book
export function groupSkills(skills: Skill[]): BookPart[];
export function findSkill(book: Book, slug: string): Skill | undefined;
export function chapterNav(book: Book, slug: string): { index: number; prev: Skill | null; next: Skill | null };
export async function getSkillRaw(owner: string, repo: string, slug: string): Promise<string>;   // new; verbatim bytes for digests + .md
```

`getBook` must **never throw on an empty repo.** `vercel-labs/next-skills` has 136,219 installs on skills.sh and **zero** `SKILL.md` on its default branch. Install count is not proof of content. Return a `Book` with `skills: []` and let the page render a designed empty state that links to the repo.

### `src/lib/skills-sh.ts` (WS-1)
```ts
export interface SkillsShSkill { source: string; skillId: string; name: string; installs: number; weeklyInstalls: number[]; isOfficial?: boolean }
export interface SkillsShOwner  { owner: string; totalInstalls: number; featuredRepo: string | null; featuredSkill: string | null;
                                  repos: Array<{ repo: string; totalInstalls: number; skills: Array<{ name: string; installs: number }> }> }
export async function fetchLeaderboard(): Promise<SkillsShSkill[]>;   // 'use cache'; cacheLife('hours')
export async function fetchOfficialOwners(): Promise<SkillsShOwner[]>;
export async function getRepoSignal(owner: string, repo: string): Promise<RepoSignal | null>;
```

Implementation: `GET https://www.skills.sh/` and `https://www.skills.sh/official` with header `RSC: 1`, then a balanced-bracket scan for `"initialSkills":[…]` (600 skills / 91 sources, 137 KB) and `"owners":[…]` (98 owners / 475 repos, 310 KB). **No auth.** Their `/api/v1/*` is OIDC-only and buys nothing.

**Every parse is wrapped in try/catch and falls back to `src/lib/data/skills-sh-snapshot.json`** — a committed last-good scrape refreshed by `scripts/sync-skills-sh.mts`. These are undocumented internals; the snapshot is the resilience layer, not a bootstrap throwaway. Filter sources with `^[\w.-]+\/[\w.-]+$` **and** an owner segment containing no `.` (drops `open.feishu.cn`, `agent.qq.com`). Use `https://github.com/<owner>.png?size=128` for avatars, never skills.sh's hashed `image-proxy` URLs.

### `src/lib/markdown.ts` (WS-2)
```ts
export interface MarkdownContext {
  owner: string; repo: string; ref: string; baseDir: string;
  resolveInternal?: (repoPath: string) => string | null;
  /** New: the chapter title, so a duplicate leading H1 can be stripped. */
  title?: string;
}
export interface RenderedMarkdown {
  tree: Root;
  headings: Array<{ depth: number; text: string; id: string }>;
  /** New: heading-repair actions taken, surfaced in the colophon a11y report. */
  repairs: Array<{ kind: "stripped-h1" | "shifted" | "level-repaired"; from: number; to: number; text: string }>;
  codeRatio: number;   // new: fenced-code chars ÷ total chars — gates spread mode and drop caps
}
export async function renderMarkdown(source: string, ctx: MarkdownContext): Promise<RenderedMarkdown>;
```

**Plugin order is load-bearing and already correct in the repo — do not reorder:**

```
remarkParse → remarkGfm → remarkSmartypants → remarkRehype (allowDangerousHtml: FALSE)
  → rehypeSanitize(schema)      ← untrusted content scrubbed HERE
  → rehypeHeadingNormalize      ← new: strip duplicate H1, shift +1, repair skipped levels
  → rehypeSlug                  ← AFTER sanitize, or clobberPrefix mangles every anchor
  → rehypeAutolinkHeadings
  → rehypeResolveLinks(ctx)
  → rehypeExternalLinks
  → rehypeShiki                 ← AFTER sanitize; its inline styles are OURS and trusted
  → rehypeCodeMeta
  → rehypeProseRuns             ← new: tag paragraph runs; hoist pre/table/figure out of them
  → rehypeNbsp                  ← new: non-breaking glue in headings and before units
```

Two rules that must survive every future edit, each with a unit test:
- **Never enable `rehype-raw`, never pass `allowDangerousHtml`.** Raw HTML from a third-party repo is dropped entirely. Buy fidelity back later by allow-listing specific tags in the sanitize schema, never by re-enabling raw.
- **Sanitize before Shiki and before slug.** Sanitizing after Shiki strips every token color (`hast-util-sanitize`'s default schema has no `style` allowance); slugging before sanitize gets every `id` rewritten to `md-…` by `clobberPrefix`, breaking the TOC.

**Cleanup task (WS-2, P1):** the current schema allows `style` on `"*"`. Since raw HTML is dropped and Shiki runs *after* sanitize, no legitimate `style` can exist at sanitize time. Remove `style` from the `"*"`, `span`, and `pre` allowances.

### `src/lib/design/*` (WS-3) — exists, normative
```ts
// fetch.ts
export interface DesignSources { owner: string; site?: string | null; repoLocalUrls?: string[] }
export async function resolveDesignManifest(sources: DesignSources): Promise<DesignManifest>;
export async function getIssueTheme(sources: DesignSources): Promise<{ manifest: DesignManifest; theme: IssueTheme }>;
// parse.ts
export function looksLikeMarkdown(body: string, contentType: string | null): boolean;
export function parseDesignMarkdown(source: string, sourceUrl: string): DesignManifest;
// theme.ts
export const PAPER: { light: Oklch; dark: Oklch; lightHc: Oklch; darkHc: Oklch };
export function seedFromColors(colors: BrandColor[]): Oklch | null;
export function deriveIssueTheme(owner: string, manifest: DesignManifest): IssueTheme;
export function auditIssueTheme(theme: IssueTheme): { light: number; dark: number; lightHc: number; darkHc: number; chartLight: number[]; chartDark: number[] };
export function issueThemeCss(theme: IssueTheme, selector: string): string;
// registry.ts
export function curatedFor(owner: string): CuratedSeed | null;
```

### `src/lib/serialize.ts` (WS-6)
```ts
export function bookToMarkdown(book: Book): string;                 // front matter + every chapter, verbatim bodies
export function skillToMarkdown(book: Book, skill: Skill): string;  // provenance header + verbatim body
export function siteLlmsTxt(featured: SeedRepo[]): string;          // llmstxt.org shape
export function bookToAgentSkills(book: Book, digests: Map<string,string>): unknown;   // discovery/0.2.0 manifest
```

### `src/lib/jsonld.ts` (WS-6)
```ts
export function bookJsonLd(book: Book): object;        // schema.org Book + hasPart Chapter[]
export function chapterJsonLd(book: Book, skill: Skill): object;   // Chapter + SoftwareSourceCode
export function breadcrumbJsonLd(parts: Array<{ name: string; url: string }>): object;
export function JsonLd(props: { data: object }): JSX.Element;      // <script type="application/ld+json">
```

---

# 4. Theming contract

## 4.1 Three orthogonal axes — this is the core decision

The two theming researchers disagreed. `design-md` said *"keep the stone neutrals untouched; only the accent, display font, radius, and voice change per issue."* `reading-ux` specified *eight paper/ink themes* plus a separate contrast control. Both are right about different surfaces.

**DECISION: theming is three independent axes, not one list of themes.**

| Axis | Attribute on `<html>` | Values | Governs |
|---|---|---|---|
| **A. Color scheme** | `class="dark"` (next-themes) | `light` \| `dark` \| `system` | The **chrome**: shadcn/stone tokens, header, rails, popovers, controls. Never issue-specific. |
| **B. Paper mode** | `data-paper` | `paper`(default light) \| `sepia` \| `slate` \| `eink` \| `night`(default dark) \| `midnight` | The **reading surface only** — `--paper`, `--ink`, `--ink-muted`, `--rule`. Scoped to `.reader`. |
| **C. Contrast** | `data-contrast` | `normal` \| `high` | Amplifies both A and B; forces link underlines, kills texture and translucency, swaps to the `*Hc` accents. |

Rationale: (1) the chrome must stay one product across every issue or the magazine reads as twenty different websites; (2) the reading surface is what readers actually tune, and it must compose with dark mode rather than fight it; (3) "High contrast" as a *theme* (reading-ux #17) duplicated "Contrast level" as a *control* (#19) — making it an axis removes 8 redundant token sets and one whole class of bugs.

Paper mode auto-pairs with the scheme: choosing `sepia` in dark mode resolves to `night`; the picker only shows modes valid for the current scheme, plus a "match system" default.

**Per-issue branding overlays all three.** `[data-issue="<owner>"]` sets only: `--issue-accent`, `--issue-accent-foreground`, `--issue-ink`, `--issue-chart-1..5`, `--radius`, `--font-display`. It never touches `--paper`, `--ink`, or any stone token.

## 4.2 The complete token list

```css
/* ── src/styles/tokens.css — the ONLY place a raw color literal may appear ── */

/* A. shadcn/stone chrome (exists in globals.css; unchanged) */
--background --foreground --card --card-foreground --popover --popover-foreground
--primary --primary-foreground --secondary --secondary-foreground
--muted --muted-foreground --accent --accent-foreground --destructive
--border --input --ring --radius
--sidebar --sidebar-foreground --sidebar-primary --sidebar-accent --sidebar-border --sidebar-ring
--chart-1 … --chart-5

/* B. Reading surface (set by data-paper; consumed only inside .reader) */
--paper            /* page ground */
--ink              /* body text — never pure black; the measured corpus runs #141414–#1D1A15 */
--ink-strong       /* headings; the only token allowed maximum contrast */
--ink-muted        /* captions, folios, marginalia — must clear 4.5:1 on --paper */
--rule             /* hairlines and section rules */
--paper-raised     /* callouts, code ground */
--selection-bg --selection-fg

/* C. Issue branding (set by [data-issue]) */
--issue-hue --issue-chroma
--issue-accent --issue-accent-foreground
--issue-ink                       /* brand primary, masthead logotype ONLY */
--issue-chart-1 … --issue-chart-5
--font-display                    /* resolved brand display family, or the reader's choice */

/* D. Reader typography — the mutable inputs the control panel writes */
--reader-size-step        /* 19px default; one of the 17-step ladder */
--reader-measure-cpl      /* 68 default; CHARACTERS per line, not ch */
--reader-lh-manual        /* 1.60; only used when data-reader-lh="manual" */
--reader-tracking --reader-word-spacing
--reader-para-gap --reader-para-indent
--reader-align --reader-weight
--reader-code-offset      /* -1 default: code renders one ladder step below body */

/* E. Per-family metrics — set by [data-reader-font], values from the verified tables */
--font-avg-char           /* 0.4795 for Literata */
--font-size-mult          /* 1.000 for Literata; clamped [0.90, 1.15] */
--font-x-height --font-cap-height
--font-caps               /* "smcp onum" or "" — gates the numerals/small-caps controls */

/* F. Derived — never set directly */
--reader-font-size:  calc(var(--reader-size-step) * var(--font-size-mult));
--reader-lh-auto:    calc(0.49rem + 1.186 * var(--reader-font-size));   /* 1.60 @19px → 1.35 @48px */
--reader-measure:    calc(var(--reader-measure-cpl) * var(--font-avg-char) * 1em);
--reader-bleed:      calc(var(--reader-measure) * 1.18);

/* G. Chrome/motion */
--focus-ring-width --focus-ring-offset --header-h --rail-w --safe-b
```

## 4.3 How a `design.md` becomes an issue theme

```
fetchOwnerMeta(owner).blog
  ↓
resolveDesignManifest({ owner, site, repoLocalUrls })
  tier 1  curated map (src/lib/design/registry.ts)          ← always wins; deterministic demos
  tier 2  https://<blog host>/design.md                      ← hits vercel, resend, clerk, dreambase
  tier 3  https://<apex of blog host>/design.md
  tier 4  VoltAgent/awesome-design-md raw                    ← 74 brands, no key
  tier 5  design.md | DESIGN.md | .github/design.md in the skills repo itself
  tier 6  deterministic FNV-1a hue hash of the login         ← terminal; never fails
  ↓
deriveIssueTheme(owner, manifest)
  ↓
issueThemeCss(theme, `[data-issue="${owner}"]`)  →  <style> in /[owner]/[repo]/layout.tsx
```

**Skipped deliberately:** `/.well-known/design.md` and `/brand.md` (verified 404 everywhere), `llms.txt` (exists widely, contains zero design tokens), and avatar dominant-color extraction (needs an image decoder, and most dev-org avatars are monochrome — tier 4 already covers 74 brands).

**Four rules with test coverage:**

1. **Gate on `Content-Type` + first byte, never on status code.** `linear.app/design.md` returns HTTP 200 with the Linear SPA HTML shell. Accept only `text/markdown`/`text/plain`/`text/x-markdown` **and** `body.trimStart()[0] !== "<"` **and** 200 ≤ bytes ≤ 512,000.
2. **Never use `colors.primary` as the accent.** 46% of registry primaries are achromatic — vercel `#171717`, figma `#000000`, resend `#fcfdff`, x.ai `#ffffff`. Seed the hue from the **highest-chroma** token in the document; keep `primary` only as `--issue-ink`.
3. **Two accent tones, always.** A single accent at AA on both stone grounds is *provably impossible*: relLum(stone-50)=0.9553, relLum(stone-950)=0.0031 ⇒ AA needs relLum ≥0.1892 **and** ≤0.1734; max simultaneous contrast is 4.35:1. Ship `L=0.52` light / `L=0.70` dark, chroma capped 0.19, gamut-clamped. Verified 100% pass across all 360 hues and all 63 registry brands; worst case 4.92:1 light (binds at hue 144) and 6.73:1 dark.
4. **Sanitize every parsed value before it reaches CSS.** Whitelist with `SAFE_COLOR`, `SAFE_LEN`, `SAFE_FONT`; cap at 64 colors, 8 fonts, 32 KB of derived CSS; emit via a serialized `<style>` string built from validated tokens only.

**`scripts/audit-contrast.mts` runs in CI** and fails the build if any hue at the shipped constants drops below 4.5:1. The math is settled; lock it so a future chroma tweak cannot silently regress it.

## 4.4 Brand fonts

Brand display families come from `design.md`. Because the family is only known at request time, `next/font/google` (build-time) cannot cover it.

**DECISION:** resolve the brand family against a build-time snapshot of the 1,942 Google Fonts family names. If it matches **and** is in our pre-declared `next/font` set, swap `--font-display` to that family's CSS variable — zero network cost. If it matches but is not pre-declared, or is proprietary, apply the substitution map (`Copernicus`/`Tiempos` → Newsreader, `Suisse Intl`/`Söhne`/`Favorit`/`Styrene` → Inter, `Domaine Display Narrow` → Fraunces, `CommitMono`/`Söhne Mono` → JetBrains Mono) and note the substitution in the colophon. **We never inject a runtime `<link>` to fonts.googleapis.com** — it adds a third-party origin to the CSP, forfeits `next/font`'s fallback-metric generation (our biggest CLS lever), and gives an attacker-controlled string a path into `<head>`.

## 4.5 Forced colors and reduced transparency — mandatory

The single highest-risk a11y bug in the current design direction: **translucent menus become unreadable in Windows High Contrast Mode**, because `backdrop-filter` is ignored there and the surface renders transparent over arbitrary content. `src/styles/theme-modes.css` **must** ship:

```css
@media (forced-colors: active) {
  :root { forced-color-adjust: auto; }
  .translucent-surface,
  [data-slot="popover-popup"], [data-slot="dialog-popup"],
  [data-slot="drawer-popup"], [data-slot="menu-popup"] {
    background: Canvas; color: CanvasText; border: 1px solid CanvasText;
    backdrop-filter: none; box-shadow: none;
  }
  button, [role="button"] { border: 1px solid ButtonBorder; }
  [aria-current="page"], [aria-selected="true"], [data-selected] {
    background: Highlight; color: HighlightText; forced-color-adjust: none;
  }
  .decorative-gradient, .paper-texture { display: none; }
  :focus-visible { outline: 3px solid Highlight; outline-offset: 2px; }
}
@media (prefers-contrast: more) {
  :root { --ink-muted: var(--ink); --focus-ring-width: 3px; }
  .translucent-surface { backdrop-filter: none; background: var(--popover); }
}
@media (prefers-reduced-transparency: reduce) {
  .translucent-surface { backdrop-filter: none; }
  .paper-texture { display: none; }
}
```

Charts need `forced-color-adjust: none` on the chart root plus a `CanvasText` monochrome encoding with pattern/dash differentiation — SVG `fill`/`stroke` are not forced, so a multi-series chart otherwise collapses to identical or invisible.

---

# 5. Reading experience spec

## 5.1 Desktop — Candidate C, committed

**DECISION: scroll column + sticky editorial rails is the one fully-supported desktop reading mode.**

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ████████████░░░░░░░░░░░░░░░░░░░░░  reading progress (2px)                │
├──────────────┬──────────────────────────────────┬────────────────────────┤
│ LEFT RAIL    │        READING COLUMN            │      RIGHT RAIL        │
│ 280px sticky │  measure = CPL × avg-char × 1em  │      260px sticky      │
│              │                                  │                        │
│ owner/repo   │  ISSUE 02 · AUTHORING   06 / 09  │  ON THIS PAGE          │
│ ─────────    │                                  │  ▎Structure            │
│ ▸ Getting…   │  Writing skills that             │   Frontmatter          │
│ ▾ Authoring  │  agents actually read            │   Testing              │
│   · Structure│  ──────────────────              │  ─────────             │
│   · Testing  │  Nine patterns for turning a     │  ⏱ 8 min · ⌘ 4 samples │
│ ▸ Reference  │  folder of markdown into…        │  ⭑ 1.2k                │
│ ─────────    │                                  │  ─────────             │
│ ⌘K Search    │  ┏━┓kills are markdown documents │  ⧉ View source         │
│ Aa Display   │  ┗━┛that teach an agent how to…  │  ↗ On GitHub           │
│              │  ┌────────────────────────────┐  │                        │
│              │  │ $ npx skills add …         │  │ code bleeds to 118%    │
│              │  └────────────────────────────┘  │                        │
└──────────────┴──────────────────────────────────┴────────────────────────┘
```

**Mechanics.** Three-track CSS grid; only the center track is the reading column, sized by the CPL formula. Both rails: `position: sticky; top: var(--header-h); max-height: calc(100dvh - var(--header-h) - 2rem); overflow-y: auto; overscroll-behavior: contain`. `pre`, `table`, `figure` escape to `--reader-bleed` (118% of the measure). Margin notes float into the right gutter above 1440px, collapse to inline `<aside>` below.

**Why C and not the two-page spread.** Skills repos are 30–50% fenced code. CSS multicol fragments code blocks and tables catastrophically; pagination must be recomputed by JS on *every* font/size/measure change — which makes the exact controls that are this product's differentiator the most expensive operation in the app. Ctrl+F, deep links, text selection, print, and screen-reader DOM order all work for free in C and all need bespoke work in a paginated mode. Stripe Press — the best online book experience currently shipping — is a scrolling single column at 17px/1.5. The book feeling comes from typography and furniture, not from turning pages.

**The book feeling is delivered by furniture, on the same architecture:** full-viewport chapter openers (`100dvh`, display serif, eyebrow in small caps, drop cap, rule), IntersectionObserver-driven running heads, small-caps folios, a real cover route, and a colophon.

**Spread mode ships in Phase 4 as an opt-in**, gated to viewports ≥1280px and **auto-disabled when `RenderedMarkdown.codeRatio > 0.25`**. Off-screen columns must get the native `inert` attribute (removes them from tab order *and* the a11y tree in one shot), and the mode must force back to scroll under `prefers-reduced-motion` or below 640px.

## 5.2 Tablet, 768–1279px

- **Portrait (768–1023):** single column, `min(measure, 100% − 2×5vw)`. Left rail → `Sheet` from the left. Right rail → a sticky "Contents" chip that opens a `Popover`. Margin notes inline at 0.85em. Drop caps sink 2 lines instead of 3.
- **Landscape (1024–1279):** reading column + right rail, no left rail. This is the one place a 2-up spread genuinely earns its keep once Phase 4 lands.
- **Controls:** `Aa` in the header, panel as a right-side `Sheet`, 420px, **non-modal** so the reader watches the text reflow.

## 5.3 Mobile, 320–767px

- Horizontal padding `max(20px, 5vw)`. At 390px that gives ~350px ≈ **44 CPL** at 17px Literata — below Butterick's 45 floor, unavoidable at that width. Mitigate by dropping the default mobile size to **17px** and auto-enabling `hyphens: auto` below 480px.
- Default line-height at 17px = **1.64**; paragraph gap 0.95em. Drop caps off below 480px.
- Code blocks full-bleed to the viewport edge (`margin-inline: calc(-1 * max(20px, 5vw))`), `overflow-x: auto`, right-edge fade mask as the scroll affordance. **Never wrap by default** — a wrapped shell command is a broken shell command. Tables the same, with the first column `position: sticky; left: 0`.
- **Controls live in a floating pill, bottom-center, 24px above `env(safe-area-inset-bottom)`** — thumb-reachable, unlike a top-right header button. `Aa` opens the Base UI **`Drawer`** (swipe-dismiss, snap 40% / 92%); `☰` opens the nav `Sheet`.
- Header translates out on scroll-down past 120px, returns on any scroll-up. `100dvh`, never `100vh`. `env(safe-area-inset-*)` on all four sides.
- **Never bind a horizontal swipe in scroll mode** — it collides with iOS back-navigation. Tap targets ≥44×44 CSS px. Pinch-to-resize steps the size ladder and announces the new value.

## 5.4 Typography

**Default: Literata 19px / auto line-height 1.60 / 68 CPL / left-aligned / 0.9em paragraph gap / Paper (light) & Night (dark).** This is the median of the measured best-in-class corpus (Verge 18/1.60/71 CPL, Linear 17/1.60/78, Every 20/1.50/90, iA 23/1.65/84, Stripe Press 17/1.50), and Literata is the only OFL face that is simultaneously screen-designed, optically-sized, variable, and equipped with real `smcp` + `onum`.

**Two rules that are the least obvious and highest impact in the whole spec:**

1. **Never use `ch` for the measure.** `1ch` is the advance width of `0`, not the average character; the ratio spans 1.00 (mono) to 1.47 (Atkinson) to 0.84 (OpenDyslexic). `max-width: 66ch` yields anywhere from 66 to 97 real characters. Express measure in **CPL** and convert per family via `--font-avg-char`.
2. **Normalize size by x-height**, clamped to `[0.90, 1.15]`. x-heights span 0.400em (EB Garamond) to 0.560em (OpenDyslexic) — a 40% swing. Without the multiplier the family switcher reads as a bug.

### Size ladder and auto leading
```ts
export const SIZE_STEPS = [14,15,16,17,18,19,20,21,22,24,26,28,32,36,40,44,48]; // px
export const SIZE_DEFAULT_INDEX = 5;   // 19px
```
```css
--reader-lh-auto: calc(0.49rem + 1.186 * var(--reader-font-size));  /* 1.60@19px → 1.35@48px */
```
"Auto" is a real state, not a value. Manual minimum 1.30; anything below 1.50 shows an inline "below WCAG AAA" hint rather than being blocked.

### Modular scale (1.250 in-column, 1.333 for openers)

| Role | × body | @19px | LH | Tracking | Weight |
|---|---|---|---|---|---|
| Book title (cover) | fluid | `clamp(2.75rem, 7vw, 5.5rem)` | 0.95 | −0.03em | 400 display |
| Chapter opener h1 | 2.441 | 46px | 1.05 | −0.022em | 500 |
| h1 in-column | 1.953 | 37px | 1.15 | −0.018em | 550 |
| h2 | 1.563 | 30px | 1.22 | −0.012em | 550 |
| h3 | 1.250 | 24px | 1.32 | −0.006em | 600 |
| h4 | 1.000 | 19px | 1.45 | 0 | 650 |
| Eyebrow | 0.800 | 15px | 1.40 | +0.08em, all-small-caps | 600 |
| Body | 1.000 | 19px | 1.60 | −0.003em | 400 |
| Standfirst | 1.250 | 24px | 1.45 | −0.006em | 350 |
| Pull quote | 1.563 | 30px | 1.30 | −0.01em | 400 italic |
| Caption / marginalia | 0.800 | 15px | 1.50 | +0.005em | 400 |
| Code | 0.875 | 17px | 1.55 | 0 | 400 |

Tracking is always in `em` so it scales. `text-wrap: balance` on every heading, `figcaption`, `blockquote`, and standfirst; `pretty` on `p`, `li`, `dd`. Zero justification by default. `hyphens: manual` by default.

### Font set (all OFL-1.1, all self-hosted by `next/font`)

**Exactly three preloaded:** Literata (reader default), Geist (UI), Geist Mono (code). Everything else `preload: false` — the `@font-face` ships, the browser fetches on first use, and rendering each picker item in its own face makes opening the picker trigger the lazy fetch naturally. Ten `preload: true` fonts in the root layout would inject 10+ `<link rel=preload>` on *every* page: 200–400 KB of competing fetches that destroy LCP.

- **Serif:** Literata ★, Source Serif 4, Newsreader, EB Garamond, Crimson Pro, Lora
- **Display:** Fraunces, Instrument Serif (static, weight 400 only)
- **Sans:** Geist ★, Inter, Public Sans
- **Mono:** Geist Mono ★, JetBrains Mono, Atkinson Hyperlegible Mono
- **Accessible:** Atkinson Hyperlegible **Next** (variable 200–800 + italics — strictly better than the static v1), OpenDyslexic via vendored `@fontsource/opendyslexic@5.3.0` woff2 + `next/font/local`

Verified traps to encode in `fonts.ts`: `axes` may not include `wght` or `ital`; `axes` throws unless weight is variable; Spectral / IBM Plex / Instrument Serif / Atkinson v1 are static and need an explicit `weight`; **Manrope and Fira Code have no italic on Google Fonts** and must never be offered as a body face; **Newsreader has no `smcp` and no `onum`** — gate those controls per family from `--font-caps`, never emit `font-variant-caps` into a face that will synthesize it.

**Do not use `@fontsource` for anything Google Fonts carries.** It forfeits `next/font`'s automatic fallback-metric generation, which is the biggest CLS lever in a reading app.

## 5.5 Readability controls — tiered

37 controls were specified. **DECISION: ship 6 presets + 14 Tier-1 controls in v1.** Presets are what people use; the sliders are what make the presets credible. Everything else is Tier 2/3.

### The six presets (v1 — build these first)

| Preset | Family | Size | LH | CPL | Align | Paper | Paragraph |
|---|---|---|---|---|---|---|---|
| **Book** ★ default | Literata | 19 | auto 1.60 | 68 | left | system | 0.9em spaced |
| **Novel** | EB Garamond | 21 | 1.55 | 62 | justify + hyphens | Sepia | 1.5em indent |
| **Magazine** | Source Serif 4 + Fraunces display | 20 | 1.55 | 72 | left | Paper | 1.0em |
| **Terminal** | Geist Mono | 16 | 1.70 | 78 | left | Midnight | 1.2em |
| **Docs** | Inter | 17 | 1.65 | 76 | left | system | 1.0em |
| **Accessible** | Atkinson Hyperlegible Next | 22 | 1.75 | 58 | left | high contrast | 1.6em, tracking 0.02em, word 0.06em |

### Tier 1 — v1 (14 controls)

| # | Control | Type | Range | Default | A11y |
|---|---|---|---|---|---|
| 1 | Body font | radio-grid, 12 items, each rendered in its own face | — | **Literata** | 1.4.12 |
| 2 | Code font | select, 5 | — | **Geist Mono** | — |
| 3 | Font size | stepper `A− A+` | 14–48px, 17-step ladder | **19px** | **1.4.4 AA** |
| 4 | Line height | slider | 1.30–2.20, step 0.05 | **auto** | **1.4.12 AA** |
| 5 | Measure | slider in **CPL** + 4 presets | 45–100 | **68** | **1.4.8 AAA (≤80)** |
| 6 | Letter spacing | slider | −0.02 → **0.16em** | 0 | **1.4.12 (0.12)** |
| 7 | Word spacing | slider | 0 → **0.32em** | 0 | **1.4.12 (0.16)** |
| 8 | Paragraph spacing | slider | 0 → **2.0em** | **0.9em** | **1.4.12 (2.0)** |
| 9 | Paragraph style | segmented | Spaced ∣ Indented | **Spaced** | — |
| 10 | Text align | segmented | Left ∣ Justify | **Left** | **1.4.8 AAA** |
| 11 | Paper mode | radio-grid | see §4.1 axis B | **System** | 1.4.8 AAA |
| 12 | Contrast | segmented | Normal ∣ High | **Normal** | **1.4.3 / 1.4.6** |
| 13 | Reduce motion | tri-state | System ∣ Force ∣ Allow | **System** | **2.3.3 AAA** |
| 14 | Reset | 2-tier button | typography ∣ everything | — | — |

Maxima on #6/#7/#8 deliberately exceed the WCAG 1.4.12 thresholds so the layout is *provably* tested at them.

### Tier 2 — v1.1
Display font override · hyphenation tri-state · font weight (variable families only) · numerals (gated on `--font-caps`) · ligatures · accent hue override · margins · code wrap · code size offset · line numbers · progress indicator style · link style · reading ruler · focus mode.

### Tier 3 — later, each behind an explicit decision
Optical size override · paper texture · warmth/blue-light · baseline grid · images show/dim/hide · page mode (spread) · columns · text-to-speech.

### Excluded from v1 by decision
**"Fixation emphasis"** (first-*n*-characters bolding). The Bionic Reading® method is claimed under patent, copyright, and trademark (USPTO reg. 5557651) with an EULA that prohibits commercial use. **Rules: the strings "bionic" and "Bionic Reading" appear nowhere in code, class names, prop names, analytics events, copy, or commits. The feature is self-implemented, named "Fixation emphasis", defaults off, and does not ship until counsel signs off.** Independent efficacy evidence is weak, so there is no product cost to deferring it.

### Panel UX
- **Trigger:** persistent `Aa` — top-right desktop, bottom-center pill mobile. Keyboard: `,`.
- **Surface:** Base UI `Popover`, **non-modal**, translucent (`backdrop-filter: blur(24px) saturate(1.4)`) desktop; Base UI `Drawer` with snap points mobile.
- **Live, never "Apply."** Every control writes a CSS custom property on `<html>` immediately.
- **Persistence:** `localStorage` **and** a `reader-prefs` cookie (`SameSite=Lax`, 1 year, **≤400 bytes**). The root Server Component reads the cookie and emits `data-reader-*` plus the inline custom properties on `<html>` — **no flash of default typography.**
- **Announce** every change through the polite live region ("Font size 21 pixels"); every slider carries a real `aria-valuetext`.

## 5.6 Keyboard map

WCAG **2.1.4** is binding: single-character shortcuts must be escapable. All three escapes ship: (a) shortcuts are scoped to the reader, inert while focus is in any input/textarea/contenteditable/dialog; (b) a global disable switch in the controls panel; (c) remapping in the shortcuts dialog, persisted with the prefs.

| Action | Key | Notes |
|---|---|---|
| Next / prev chapter | `]` / `[` | avoids `Cmd+[`; matches editor tab muscle memory |
| Next / prev page (scroll) | `→` `Space` / `←` `Shift+Space` | |
| Table of contents | `T` | |
| Search | `/` or `⌘K` | global |
| Reading controls | `,` | global preferences idiom |
| Theme cycle | `D` | |
| Copy install command | `C` · copy chapter link `Shift+C` | |
| Immersive / hide chrome | `Z` | |
| Text size | `Shift+=` / `Shift+-` | `⌘+` stays browser zoom |
| Go to cover / GitHub | `G B` / `G H` | 1500 ms chord window with a visible pending hint |
| Help | `?` | |
| Close / exit | `Esc` | |

**`J`/`K` are deliberately unused** — too many users expect them as next/prev *item*, and `k` is NVDA's link key. `H`/`L` exist only as secondary page-turn aliases (`h` is NVDA's heading key and never reaches us in browse mode).

---

# 6. Component inventory

## 6.1 shadcn — already installed (35)

`accordion, alert, avatar, badge, breadcrumb, button, card, collapsible, command, dialog, drawer, dropdown-menu, empty, field, input, input-group, item, kbd, label, popover, progress, scroll-area, select, separator, sheet, skeleton, slider, sonner, spinner, switch, tabs, textarea, toggle, toggle-group, tooltip`

## 6.2 shadcn — to install (exact command)

```bash
npx shadcn@latest add radio-group table hover-card
```

- `radio-group` — the font-family and paper-mode radio grids (a `ToggleGroup` would announce the wrong role).
- `table` — styled base for markdown tables and the sr-only chart data tables.
- `hover-card` — footnote and margin-note previews on desktop.

Nothing else. We build the rails, the reader, and the chrome ourselves; `sidebar` and `navigation-menu` would fight the editorial layout.

## 6.3 dither-kit (vendored charts)

```bash
npx shadcn@latest add https://www.tripwire.sh/r/bar-chart.json
npx shadcn@latest add https://www.tripwire.sh/r/pie-chart.json
npx shadcn@latest add https://www.tripwire.sh/r/area-chart.json     # Sparkline ships INSIDE this one
pnpm add motion@13.0.0 d3-scale@4.0.2 d3-shape@3.2.0
pnpm add -D @types/d3-scale@4.0.9 @types/d3-shape@3.1.8
```

**Do not** install the `dither-kit` meta-package (pulls `radar-chart` and `button`, neither wanted), the `button` item (a second, visually unrelated button system next to base-luma), or `gradient`. `avatar` is optional and safe (`DitherAvatar`, no name clash) for owners with no GitHub avatar.

**Zero Base UI / Radix conflict — verified.** dither-kit imports only `react`, `motion/react`, `d3-scale`, `d3-shape`, `clsx`, `tailwind-merge`.

**Two mandatory day-one patches (WS-7):**

1. **`src/components/dither-kit/palette.ts`.** `ChartConfig` is `{ color: DitherColor }` where `DitherColor` is a **closed 7-name union** — no hex, no CSS variables, no theme tokens — because the charts paint per-pixel to canvas via `ctx.fillStyle`, and canvas cannot read custom properties. Widen the type to `DitherColor | Seed` and make `seedOf` pass a `Seed` through unchanged (~5 lines across `palette.ts` + `chart-context.tsx` + `polar-context.tsx`). Then feed RGB triples **resolved on the server from `IssueTheme.chartLight` / `chartDark`** and passed as props. The existing seeds are tuned for dark grounds with additive `plus-lighter` bloom; set `bloom="off"` in light mode and ship a light-mode seed set.
2. **Every chart is wrapped in `AccessibleChart`.** dither-kit hard-codes `<svg role="img" aria-label="Chart">` **with no prop override**, ships no table fallback, and wires only pointer events on the tooltip — three WCAG failures out of the box (1.1.1, 1.1.1, 2.1.1). The wrapper renders a `<figure>` with a real `figcaption`, `aria-hidden`s the dither subtree, and emits an `sr-only` data table.

Also mount `<MotionConfig reducedMotion="user">` once at the client root — the canvas painters check reduced motion, the tooltip does not.

Always wrap a chart in a fixed-height container (`h-56 w-full`) — charts render nothing until measured and will otherwise cause CLS.

## 6.4 Custom components

All listed in the file tree (§2) with their purpose and owning workstream. The three that carry disproportionate weight:

- **`book/book-skeleton.tsx`** — the App Shell for every uncached repo on Earth.
- **`reader/markdown.tsx`** — hast → React via `hast-util-to-jsx-runtime`, **never** `dangerouslySetInnerHTML`.
- **`charts/accessible-chart.tsx`** — the single place three dither-kit a11y failures get fixed.

## 6.5 New dependencies (complete list)

```bash
# markdown pipeline additions (all MIT/ISC)
pnpm add rehype-autolink-headings@7.1.0 rehype-external-links@3.0.0 \
         rehype-shift-heading@2.0.0 remark-smartypants@3.0.2 \
         hast-util-heading-rank@3.0.0 reading-time@1.5.0
pnpm add -D @types/hast@3.0.5 @types/mdast@4.0.4

# a11y harness (dev only — see the licensing note)
pnpm add -D eslint-plugin-jsx-a11y@^6.10.2 @playwright/test@^1.62.1 \
            @axe-core/playwright@^4.12.1 axe-core@^4.13.0 \
            @lhci/cli@^0.15.1 accented@^1.4.0 start-server-and-test@^2
pnpm exec playwright install --with-deps chromium

# fonts
pnpm add -D @fontsource/opendyslexic@5.3.0   # vendor the woff2 into public/fonts, then remove
```

**Licensing decisions.** `next-mdx-remote` is **rejected** on two grounds — MPL-2.0, and MDX compiles untrusted markdown into executable JavaScript (arbitrary code execution on our server). `axe-core` and `@axe-core/playwright` are **MPL-2.0**: file-level copyleft, safe as unmodified `devDependencies` that never enter the client bundle — and they must stay there. `@axe-core/react` is **dropped** (browser-resident, trivially mis-shipped, no React 18+ support); `accented` (MIT) replaces it. **`pa11y` is dropped entirely** — LGPL-3.0-only, and it adds nothing axe + Lighthouse don't already give us. `@lhci/cli`, `lighthouse`, and `@playwright/test` are Apache-2.0. dither-kit has **no license field and no source headers** — see §9.

---

# 7. Accessibility and LLM-surface acceptance checklist

A feature is not "done" until every applicable box is ticked. WS-8 owns verification; the implementing workstream owns the fix.

## 7.1 Structure and semantics

- [ ] Exactly one `<main>` and exactly one `<h1>` per rendered document.
- [ ] Landmarks: `banner`, `navigation` (each uniquely labelled — "Table of contents" vs "Page navigation"), `main`, `contentinfo`.
- [ ] DPUB-ARIA roles (`doc-toc`, `doc-chapter`, `doc-cover`, `doc-credits`) used **additively only** — never as the sole carrier of meaning.
- [ ] Heading pipeline: a leading H1 duplicating the chapter title is stripped; remaining headings shift +1; **skipped levels are repaired** so arbitrary third-party markdown always yields a valid outline. Repairs are recorded in `RenderedMarkdown.repairs` and shown in the colophon.
- [ ] Skip links are the first focusable elements: "Skip to content", "Skip to table of contents", "Skip to reading controls".
- [ ] Two live regions always mounted, never conditionally rendered: `#page-status` (`role="status"`, polite) and `#alerts` (`role="alert"`, assertive).

## 7.2 Interaction

- [ ] Visible `:focus-visible` ring on every interactive element, ≥3:1 against both adjacent surfaces. **Base UI gives us ARIA, focus trapping, Esc, and roving tabindex; the ring, the contrast, the `Dialog.Title`, and a `Dialog.Close` inside the popup are ours.**
- [ ] Every dialog/drawer has a `Dialog.Title` and a `Dialog.Close` **inside** the popup (Base UI's docs require it for touch screen-reader users).
- [ ] `initialFocus` / `finalFocus` set on the controls panel; focus returns to the `Aa` trigger on close.
- [ ] Chapter navigation moves focus to the chapter `<section tabIndex={-1}>` and announces the new chapter in `#page-status`.
- [ ] All three WCAG 2.1.4 escapes implemented (scope, disable, remap).
- [ ] Target sizes ≥24×24 (2.5.8 AA); ≥44×44 on mobile (2.5.5 AAA).
- [ ] Copy buttons have real accessible names ("Copy install command") and announce success politely.

## 7.3 Presentation

- [ ] Body prose ≥7:1 (AAA target); UI boundaries, icons, focus rings, chart strokes ≥3:1.
- [ ] `forced-colors`, `prefers-contrast: more`, and `prefers-reduced-transparency` resets shipped (§4.5). **Verified in a real Windows HCM emulation, not by reading the CSS.**
- [ ] 1.4.12 text-spacing survival test: inject `line-height:1.5!important; letter-spacing:.12em!important; word-spacing:.16em!important; margin-bottom:2em!important` and assert zero clipping or overlap. *This is the single highest-value accessibility test for a reading app.*
- [ ] 1.4.10 Reflow: 320 CSS px wide and 400% zoom, no horizontal scroll on the page body (individual code blocks and tables scroll inside their own containers, which is permitted).
- [ ] `prefers-reduced-motion` honoured, plus the user override in both directions.
- [ ] 1.4.8 AAA on the reading surface: user-selectable fg/bg, ≤80 CPL, ≥1.5 line-height, never justified by default. **This turns the controls panel from a compliance burden into a compliance asset.**
- [ ] Charts: `AccessibleChart` wrapper on all of them; HCM monochrome + pattern encoding.
- [ ] Third-party images get `alt=""` when decorative-by-heuristic and a "no description provided" note in the a11y report otherwise. We never invent alt text.

## 7.4 Tooling gates

- [ ] `eslint-plugin-jsx-a11y` strict (the bundled `eslint-config-next` enables only **6 rules as warnings** — nowhere near sufficient).
- [ ] Playwright + `@axe-core/playwright`, 6 projects: desktop, mobile, reflow-320, forced-colors, reduced-motion, contrast-more.
- [ ] Lighthouse CI asserts `accessibility: 1.0`.
- [ ] `pnpm verify` runs lint + unit + a11y + lighthouse headless.
- [ ] Manual AT pass before each release: NVDA/Firefox, VoiceOver/Safari, Windows HCM, 400% zoom.

**DECISION — CI and third-party content.** CI gates on **our chrome plus one curated zero-violation fixture book** (`tests/fixtures/clean-book/`). Violations originating in third-party skill markdown **do not fail the build**; they are surfaced in a per-book **Accessibility report** section of the colophon. Failing the build on content we don't control would make the pipeline hostage to arbitrary repos, and the report is a differentiating product feature — it tells a repo owner exactly what to fix.

## 7.5 LLM / agent surface

- [ ] `/{owner}/{repo}.md` and `/{owner}/{repo}/{skill}.md` return `text/markdown; charset=utf-8`, `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`, and `Link: <html url>; rel="canonical"`.
- [ ] `Accept: text/markdown` (q-value aware, only when it outranks `text/html`) returns the same body with `Vary: Accept`.
- [ ] Every HTML page carries `<link rel="alternate" type="text/markdown" href="…md">` **and** the `Link` response header.
- [ ] Every HTML response carries the discovery `Link` header set and `X-Llms-Txt: /llms.txt`.
- [ ] `/llms.txt` conforms to llmstxt.org: H1 (the only required element), blockquote summary, prose, `##` file-list sections, and an `## Optional` section.
- [ ] `/{owner}/{repo}/.well-known/agent-skills/index.json` validates against `schemas.agentskills.io/discovery/0.2.0` with a real `sha256:` digest per skill.
- [ ] JSON-LD on every reader page: `Book` + `hasPart: Chapter[]`, `SoftwareSourceCode`, `BreadcrumbList`, all `@id`s built from `SITE_URL`.
- [ ] OG images render (Satori: flexbox subset only, explicit `display:flex` on every multi-child node, no grid, fonts as raw `ArrayBuffer` — `next/font` objects do not work, ≤500 KB).
- [ ] `robots.txt` permissive with `Content-Signal: search=yes, ai-input=yes, ai-train=yes`.
- [ ] **Attribution is a hard product rule.** Every markdown response, manifest entry, and HTML page carries the upstream repo URL, its SPDX license, and an **unmodified body**. Never strip frontmatter. Never "improve" a description. A repo with no detectable license shows "All rights reserved — view on GitHub" and is **omitted from the agent-skills manifest and from the full-book `.md`** (linked only).

---

# 8. Build plan

Ten workstreams. **WS-0 is blocking; WS-1 through WS-3 are the second wave; WS-4 through WS-9 run in parallel once their dependencies land.** Each is sized for one agent. File ownership from §2 is absolute — **no two workstreams edit the same file.**

## Coordination mechanism (read this before starting anything)

Two files would otherwise be contended. WS-0 resolves both up front:

- **`src/app/globals.css`** — WS-0 lands it once with `@import` lines for all six partials and creates each partial as an empty stub with a header comment naming its owner. After that, **no workstream may edit `globals.css`**; they edit their own partial.
- **`src/app/layout.tsx`** — WS-0 lands the final composition, importing placeholder components that other workstreams will fill. After that, **no workstream may edit `layout.tsx`**; they fill their own components.

Same pattern for `next.config.ts` and `components.json`: WS-0 only.

---

### WS-0 · Foundation **(BLOCKING — nothing starts until this merges)**

**Owns:** `next.config.ts`, `components.json`, `src/app/layout.tsx`, `src/app/globals.css`, `src/styles/tokens.css`, `src/lib/site.ts`, all six empty style partials, `src/components/ui/*` (the 3 new shadcn adds).

1. `next.config.ts`: `cacheComponents: true`, `partialPrefetching: true`, `images.remotePatterns` for the five GitHub hosts, custom `cacheLife` profile `repo: { stale: 300, revalidate: 3600, expire: 86400 }`.
2. `src/lib/site.ts` with `SITE_URL`, `SITE_NAME`, `installCommand()`, `absoluteUrl()`, path builders.
3. `layout.tsx`: `metadataBase`, title template, `<html lang="en" data-scroll-behavior="smooth">` (Next 16 removed automatic smooth scrolling), all font `.variable` classes, `data-reader-*` + inline custom properties read from the `reader-prefs` cookie, provider stack, skip links, live regions.
4. `globals.css` + `tokens.css` with the complete §4.2 token list; the other five partials as owned stubs.
5. `npx shadcn@latest add radio-group table hover-card`.
6. Delete the create-next-app boilerplate metadata ("Create Next App").

**Done when:** `pnpm build` succeeds with `cacheComponents: true`; `/` renders; every token in §4.2 resolves in devtools in light, dark, and `data-contrast="high"`; the `RouteContext<'/route'>` generated type is confirmed present in `.next/types` after one `next dev` (this was flagged unverified — resolve it here and record the answer).

---

### WS-1 · Data layer and caching  *(depends: WS-0)*

**Owns:** `src/lib/github.ts`, `skills.ts`, `book.ts`, `marketplace.ts`, `skills-sh.ts`, `featured.ts`, `data/seed-repos.ts`, `data/skills-sh-snapshot.json`, `scripts/probe-repos.mts`, `scripts/sync-skills-sh.mts`, `src/app/api/revalidate/route.ts`.

1. Convert every fetcher to `use cache` + `cacheLife` + `cacheTag`. **Delete all `unstable_cache` usage** — the docs state plainly it is "replaced by `use cache`". Never pass a `URL` or class instance into a cached function.
2. Land the 89 `SeedRepo` entries verbatim from the research.
3. Implement the skills.sh RSC scraper with the balanced-bracket extractor, the non-GitHub source filter, and the committed-snapshot fallback.
4. Extend `Book` with `signal`, `marketplace`, `theme`, `issueNumber`.
5. `revalidateTag(tag, 'max')` — **the second argument is now required.**
6. Regression tests: `openai/skills` yields 44 (not 5) chapters; `pbakaus/impeccable` yields 15 (not 75); `microsoft/azure-skills` deduped; `langchain-ai/deepagents` fixture excluded; `vercel-labs/next-skills` returns an empty book without throwing.

**Done when:** `getBook("anthropics","skills")` returns 17 chapters in ≤2 GitHub API calls; the six regression tests pass; `/api/v1/health` reports the live rate-limit budget.

---

### WS-2 · Markdown and prose  *(depends: WS-0)*

**Owns:** `src/lib/markdown.ts` and its plugins, `src/components/reader/markdown.tsx`, `code-block.tsx`, `margin-note.tsx`, `src/styles/prose.css`, `src/styles/code.css`.

1. Add the five new plugins in the exact order in §3.6: heading normalize, smartypants, prose-runs, nbsp, external links.
2. Remove `style` from the `"*"`, `span`, `pre` sanitize allowances.
3. Shiki dual themes with `defaultColor: false`; the four-way CSS rule (base, `prefers-color-scheme`, `html.dark`, `html.light`) so the class strategy and the media query cannot fight. Module-level singleton highlighter; preload the ~12 languages skills repos actually use, lazy-load the tail.
4. Emit `repairs[]` and `codeRatio`.
5. Code blocks: horizontal scroll with a fade affordance, never wrap by default, copy button, `font-variant-ligatures: none`, `tabIndex={0}` on the scroll container (2.1.1).

**Done when:** the `anthropics/skills` `skill-creator` chapter renders with colored code in both schemes, a valid heading outline (no skipped levels), working TOC anchors, and zero `dangerouslySetInnerHTML` in the tree; the sanitize-order unit tests pass.

---

### WS-3 · Theming and design.md  *(depends: WS-0)*

**Owns:** `src/lib/color.ts`, `src/lib/design/*`, `src/styles/theme-modes.css`, `src/components/providers/theme-provider.tsx`, `src/components/chrome/theme-toggle.tsx`, `scripts/audit-contrast.mts`.

1. Complete the tier chain; gate on Content-Type + first byte (the `linear.app` trap).
2. Pointer chasing depth 1, with the **GitHub-tree fallback** — Resend's own links 404 and the real tokens are at `resend-brand/SKILL.md`, reachable only by listing the tree.
3. External CSS chasing for Vercel's `vercel-brand.css` (108 KB of `light-dark()` oklch); normalize both oklch dialects (unit and percent) and 3/4/6/8-digit hex.
4. Implement the three-axis model (§4.1) in `theme-modes.css`, including the mandatory forced-colors / prefers-contrast / reduced-transparency resets.
5. `audit-contrast.mts` sweeps all 360 hues and fails below 4.5:1; wire it into `pnpm verify`.

**Done when:** vercel, resend, clerk, dreambase, anthropics, and an unknown owner all produce a valid `IssueTheme`; `auditIssueTheme` reports ≥4.5:1 for all four accents on all six; the HCM reset is verified in an emulated Windows High Contrast run.

---

### WS-4 · Book shell and chrome  *(depends: WS-0, WS-1, WS-2, WS-3)*

**Owns:** `src/app/[owner]/[repo]/**` (except `opengraph-image.tsx`), `src/components/book/*`, `src/components/chrome/{skip-links,site-header,live-regions}.tsx`, `src/hooks/use-active-heading.ts`.

1. `page.tsx` / `[skill]/page.tsx` with the **params-promise-into-Suspense** pattern. `generateStaticParams` returns 8 showcase repos (never `[]`).
2. **`BookSkeleton` gets first-class design attention** — it is the App Shell.
3. Candidate C grid, sticky rails, chapter openers, running heads, folios, drop cap with the `initial-letter` + float fallback (Firefox has zero `initial-letter` support).
4. Colophon: layouts observed, license, provenance, theme origin, heading repairs, accessibility report.
5. `catchError()` boundary with a working `retry()` for transient GitHub failures; a designed empty state for zero-skill repos.
6. Landmarks, skip links, live regions per §7.1.

**Done when:** `/anthropics/skills` and `/anthropics/skills/skill-creator` render at 1440/1024/768/390; the shell paints before any GitHub call resolves for a cold, unlisted repo; axe reports zero violations on our chrome.

---

### WS-5 · Reader controls and preferences  *(depends: WS-0; integrates with WS-4)*

**Owns:** `src/lib/reader/*`, `src/lib/shortcuts.ts`, `src/components/reader/controls/*`, `reading-progress.tsx`, `reading-ruler.tsx`, `focus-mode.tsx`, `src/components/providers/reader-prefs-provider.tsx`, `src/components/chrome/shortcuts-dialog.tsx`, `src/hooks/*` (except `use-active-heading`), `src/styles/reader.css`, `public/fonts/*`.

1. `fonts.ts` — exactly three preloaded; every verified `next/font` trap encoded as a comment next to the call.
2. `metrics.ts` — the verified avg-char / x-height / cap-height / OpenType-feature tables, as data, with a unit test asserting Newsreader's `--font-caps` is `""`.
3. Six presets, then the 14 Tier-1 controls. Cookie codec ≤400 bytes; SSR from the cookie so there is no flash.
4. Shortcut engine with all three 2.1.4 escapes and the help dialog.
5. Reduced-motion override in both directions.

**Done when:** switching from Literata to EB Garamond to OpenDyslexic keeps the *apparent* size and CPL stable; a hard reload preserves preferences with no flash; the 1.4.12 injection test passes at every preset; every control announces through the live region.

---

### WS-6 · Agent surfaces  *(depends: WS-0, WS-1, WS-2)*

**Owns:** `src/proxy.ts`, `src/app/api/md/**`, `src/app/api/well-known/**`, `src/app/api/v1/**` (except `revalidate`), `src/app/llms.txt/route.ts`, `robots.ts`, `sitemap.ts`, `manifest.ts`, every `opengraph-image.tsx`, `src/lib/serialize.ts`, `src/lib/jsonld.ts`, `public/og/*`.

1. `proxy.ts` — **not `middleware.ts`** (deprecated in Next 16). Handles `.md` rewrites, q-value-aware `Accept` negotiation, `.well-known` rewrites, and the discovery `Link` + `X-Llms-Txt` headers. The rewrite is unavoidable: `[repo]` happily matches `skills.md`.
2. Markdown serializers with verbatim bodies + provenance headers.
3. Per-book agent-skills manifest with real `sha256` digests over the raw bytes.
4. JSON-LD, OG images (Satori constraints), robots with `Content-Signal`, sitemap.
5. Route-handler `params` is a **Promise** in Next 16.

**Done when:** `curl -sI https://localhost:3000/anthropics/skills.md` returns `text/markdown` + a canonical `Link`; `curl -H 'Accept: text/markdown'` on the HTML URL returns markdown with `Vary: Accept`; the per-book manifest validates and its digests match the raw GitHub bytes; every JSON-LD block passes a schema.org validator.

---

### WS-7 · Charts and data-viz  *(depends: WS-0, WS-3)*

**Owns:** `src/components/dither-kit/*`, `src/components/charts/*`, `src/components/providers/motion-provider.tsx`, `src/styles/chart.css`.

1. Install the three registry items; **patch `palette.ts` on day one** to accept a `Seed` alongside the named union.
2. Build `AccessibleChart` and route every chart through it.
3. Feed chart colors from `IssueTheme.chartLight/chartDark`, resolved server-side into RGB triples and passed as props (canvas cannot read CSS variables).
4. Light-mode seeds; `bloom="off"` in light mode (`plus-lighter` is additive and only works on dark grounds).
5. HCM fallback: `forced-color-adjust: none` + monochrome + pattern/dash differentiation.
6. Fixed-height wrappers everywhere to prevent CLS.

**Done when:** the installs bar, category donut, and 8-week sparkline all render on-brand in both schemes; axe finds no chart violations; each chart exposes an `sr-only` data table; a bundle analysis confirms whether `motion` tree-shakes when `<Tooltip>` is unused (record the answer).

---

### WS-8 · A11y harness and QA  *(depends: WS-0; gates everything before launch)*

**Owns:** `eslint.config.mjs`, `playwright.config.ts`, `.lighthouserc.json`, `vitest.config.ts`, `tests/**`, the `verify` script in `package.json`, `.github/workflows/a11y.yml`.

Strict jsx-a11y; the 6-project Playwright matrix; Lighthouse `accessibility: 1.0`; the 1.4.12 injection test; the clean-book fixture; `accented` dev overlay.

**Done when:** `pnpm verify` runs green headless in CI and fails on a deliberately introduced contrast regression, a missing focus ring, and a missing dialog title.

---

### WS-9 · Home, directory, and search  *(depends: WS-0, WS-1)*

**Owns:** `src/app/page.tsx`, `not-found.tsx`, `error-boundary.tsx`, `src/app/search/page.tsx`, `src/components/home/*`, `src/components/chrome/command-palette.tsx`, `src/lib/search.ts`.

Featured grid from `SEED_REPOS` merged with the live leaderboard; `weeklyInstalls` sparklines; `featuredRepo`/`featuredSkill` as the per-brand cover story; a "paste any github.com/owner/repo" form that routes straight to the book.

**Done when:** the home page renders 89 seeded books with live install counts, degrades cleanly to the snapshot when skills.sh is unreachable, and `⌘K` searches chapters across featured books.

---

## Phasing

| Phase | Workstreams | Outcome |
|---|---|---|
| **P0** | WS-0 | Foundation merged; everything else unblocked |
| **P1** | WS-1, WS-2, WS-3 in parallel | Data, prose, and theme all real |
| **P2** | WS-4, WS-5, WS-6, WS-7, WS-8, WS-9 in parallel | Shippable product |
| **P3** | Hardening | Manual AT pass, Lighthouse budgets, remote cache handler, counsel review |
| **P4** | Deferred | Spread mode, Tier-2 controls, TTS, MCP server, Fixation emphasis (gated on counsel) |

---

# 9. Open risks and mitigations

| # | Risk | Severity | Mitigation | Owner |
|---|---|---|---|---|
| 1 | **`use cache` defaults to in-memory** and is discarded on instance teardown. GitHub allows 5,000 req/hr authenticated; a cold fleet could burn it in minutes. | 🔴 | Set `GITHUB_TOKEN` in all environments. Ship a **`'use cache: remote'` or explicit cache handler (KV/Redis) before any public launch** — this is a P3 blocker, not a nice-to-have. `/api/v1/health` exposes the live budget; alert at 20% remaining. | WS-1 |
| 2 | **dither-kit has no `license` field** in its registry JSON and no source headers. | 🔴 | Because registry components are copied into our repo as source, we own the files — but **get written confirmation from the author (`ripgrim`) before commercial launch.** If it doesn't arrive, the three charts are individually replaceable with hand-rolled SVG in ~2 days; keep `AccessibleChart` as the stable seam that makes the swap cheap. | PM |
| 3 | **Bionic Reading is patent/trademark-protected** (USPTO 5557651) with a commercial-use prohibition. | 🔴 | Feature deferred to P4 and gated on counsel. The strings "bionic"/"Bionic Reading" are banned from the codebase — add a CI grep that fails on them. | WS-8 |
| 4 | **We republish third-party content** under unknown licenses. | 🔴 | Bodies verbatim, frontmatter intact, upstream URL + SPDX license on every surface. Unlicensed repos are linked but omitted from the agent-skills manifest and the full-book `.md`. A takedown path in the footer. | WS-6 |
| 5 | **skills.sh RSC payloads are undocumented internals** and can change shape without notice. | 🟠 | Every parse in try/catch → committed snapshot fallback. `scripts/sync-skills-sh.mts` refreshed weekly. A shape change degrades install counts to stale, never breaks a page. | WS-1 |
| 6 | **Translucent menus in Windows High Contrast Mode** — `backdrop-filter` is ignored, surfaces render transparent over content. | 🟠 | The §4.5 reset is mandatory and has a dedicated Playwright project. Not optional, not deferred. | WS-3 / WS-8 |
| 7 | **Install count ≠ content.** `vercel-labs/next-skills`: 136,219 installs, zero `SKILL.md` on `main`. | 🟠 | `getBook` never throws on empty; a designed empty state ships in WS-4; `scripts/probe-repos.mts` re-verifies seeds. | WS-1 / WS-4 |
| 8 | **`RouteContext<'/route'>` was inferred, not verified.** | 🟡 | WS-0 confirms it after the first `next dev` writes `.next/types` and records the answer in this document. If absent, hand-write the params types. | WS-0 |
| 9 | **A dot-prefixed `.well-known` directory inside `app/` may be excluded by the router.** | 🟡 | Sidestepped entirely: all `.well-known` URLs are proxy rewrites to `/api/well-known/*`. Never create `src/app/.well-known/`. | WS-6 |
| 10 | **`<Activity>` navigation keeps the previous route mounted-but-hidden** under `cacheComponents`. Reader scroll position, open popovers, and picker state survive back/forward. | 🟡 | Mostly a feature. Explicitly test: controls panel open → navigate → back; the panel must not reappear stranded. Add to the Playwright keyboard tour. | WS-5 / WS-8 |
| 11 | **`generateStaticParams` returning `[]` is now a build error.** | 🟡 | The 8-repo showcase list is a hard dependency of the build; `featured.ts` must never return empty even when skills.sh is down (the snapshot guarantees this). | WS-1 |
| 12 | **Cyan/teal brands read muted in light mode** — hues 180–220 cap at chroma 0.088–0.095 at L=0.52. | 🟢 | Accepted; still ≥5.0:1. If a hero brand seeds there, lean on the dark issue in marketing rather than forcing chroma out of gamut. | WS-3 |
| 13 | **FNV-1a hue distribution is imperfect** — 10 of 19 adjacent pairs in a 20-org sample fell within 12°. | 🟢 | If two neighbouring issues look alike in practice, quantize to 24 fixed hues 15° apart and index the bin. One-line change, deferred until observed. | WS-3 |
| 14 | **Shiki cold-start and memory** on serverless. | 🟢 | Module-level singleton, ~12 preloaded languages, lazy tail. Client cost is 0 KB — the bundle-size reputation is a client concern and does not apply in RSC. | WS-2 |
| 15 | **`schemas.agentskills.io/discovery/0.2.0/schema.json` returned an empty body** during research. | 🟢 | Only field names verified from Mintlify's live manifest (`name`, `type`, `description`, `url`, `digest`) are emitted. Do not invent fields. Re-validate before P3. | WS-6 |

---

# 10. Decision log (conflicts resolved)

| # | Conflict | Decision | Rationale |
|---|---|---|---|
| 1 | Desktop layout: spread vs magazine vs scroll+rails | **Scroll column + sticky editorial rails (C).** Spread is P4, opt-in, ≥1280px, auto-off above 25% code. | Skills repos are 30–50% fenced code; multicol fragments it, and pagination invalidates on every slider tick — the exact controls that are our differentiator. |
| 2 | 8 paper themes vs "don't theme the neutrals" vs a separate contrast control | **Three orthogonal axes:** scheme (chrome) × paper (reading surface only) × contrast. | Keeps the magazine one product across issues, lets paper compose with dark mode, and removes the theme/contrast duplication. |
| 3 | 37 readability controls | **6 presets + 14 Tier-1 controls in v1.** | Nobody moves eight sliders. Presets are what people use; sliders make them credible. |
| 4 | Accent from `colors.primary` vs highest-chroma token | **Highest-chroma token.** `primary` becomes `--issue-ink` (masthead only). | 46% of registry primaries are achromatic. |
| 5 | One accent vs two | **Two tones, L=0.52 / L=0.70, C≤0.19, gamut-clamped.** | A single AA-passing accent on both stone grounds is arithmetically impossible (max 4.35:1). |
| 6 | `.md` suffix vs `/md` segment vs `Accept` only | **`.md` canonical, `Accept` as a bonus.** | `/md` collides with the skill namespace; `Vary: Accept` fragments CDN caches (Anthropic had to set `no-store` to cope). |
| 7 | Per-book `llms.txt` / `llms-full.txt` | **Dropped.** `/{owner}/{repo}.md` *is* the full corpus. | The namespace rule forbids new segments under `/[owner]/[repo]/`, and the `.md` route already does the job. |
| 8 | `.well-known` as an app directory | **Proxy rewrite to `/api/well-known/*`.** | Dot-directory handling in `app/` is unverified; the rewrite is deterministic. |
| 9 | `loading.tsx` vs inline Suspense | **Inline Suspense boundaries; `BookSkeleton` is the App Shell.** | Partial Prefetching in 16.3 extracts shells from inline boundaries; finer-grained and the framework's direction. |
| 10 | `unstable_cache` vs `use cache` | **`use cache` + `cacheTag` + `cacheLife` (stable names, no `unstable_` prefix in 16.3).** | The migration guide states `unstable_cache` "is replaced by the `use cache` directive." |
| 11 | MDX for rendering | **Rejected.** Bespoke `unified` pipeline. | `next-mdx-remote` is MPL-2.0, *and* MDX compiles untrusted markdown into executable JavaScript. |
| 12 | Sanitize order | **sanitize → heading-normalize → slug → shiki.** | Sanitize after Shiki strips every token color; slug before sanitize gets every anchor rewritten by `clobberPrefix`. |
| 13 | axe / pa11y licensing | **axe as `devDependency` only; drop `@axe-core/react`; drop pa11y entirely; add `accented` (MIT).** | MPL-2.0 is file-level copyleft — no obligation for unmodified dev-only use. LGPL-3.0 pa11y adds nothing. |
| 14 | CI failing on third-party a11y violations | **CI gates our chrome + a clean fixture; content violations become a per-book Accessibility report.** | Turns a compliance burden into a product feature and stops arbitrary repos from holding the pipeline hostage. |
| 15 | dither-kit chart colors | **Patch `palette.ts` to accept a `Seed`; feed RGB triples from `IssueTheme`, resolved server-side.** | `DitherColor` is a closed 7-name union because charts paint to canvas, which cannot read CSS variables. |
| 16 | Font loading for 12+ selectable families | **Variable fonts only, exactly 3 preloaded, rest `preload:false` + CSS-variable swap. No `@fontsource` for anything Google Fonts carries.** | 10+ preload tags on every page is 200–400 KB of wasted blocking fetches; fontsource forfeits fallback-metric generation. |
| 17 | Brand fonts at request time | **Match against a build-time Google Fonts snapshot; swap only to pre-declared families; otherwise substitute and note it in the colophon. Never inject a runtime font `<link>`.** | Avoids a third-party CSP origin and an attacker-controlled string in `<head>`. |
| 18 | Domain | **`skillsdocs.com`, read from `SITE_URL`.** | `.book` is not generally registrable; one constant means one change. |
| 19 | Install command | **`npx skills add <owner>/<repo>` only.** | The per-skill form is unverified; only the repo form is observed in the wild. |
| 20 | `SkillResource` vs `SkillFile` | **Keep `SkillResource`; add `SkillFile` as an alias; new code uses `SkillFile`.** | The shipped name wins; the alias avoids a pointless rename. |
| 21 | Bionic Reading | **Deferred to P4, self-implemented, named "Fixation emphasis", default off, CI grep bans the word.** | Patent + trademark + commercial-use prohibition, and weak efficacy evidence. |

---

# 11. WS-0 addendum — decisions resolved during implementation

| # | Item | Resolution |
|---|---|---|
| R8 | `RouteContext<'/route'>` was unverified | **Confirmed present.** `.next/types/routes.d.ts` declares `PageProps`, `LayoutProps`, and `RouteContext` globally after the first build. Use them; do not hand-write params types. |
| — | Reader prefs via `cookies()` in the root layout | **Reversed.** `cookies()` in the root layout opts *every* route out of prerendering under `cacheComponents`, and makes the HTML vary per reader, forfeiting CDN caching. Replaced with `ReaderPrefsScript` — a blocking inline script in `<head>` generated from the same constants as the codec. Still no flash (it runs before first paint); the HTML stays static and identical for everyone. Cost: readers with JS disabled get the defaults, which are a good reading experience. |
| — | `next/font` argument form | Every option must be an inline literal. `subsets: [...latin]` fails the build with "Unexpected spread". No variables, no spreads, no computed values. |
| — | TypeScript target | Raised `ES2017` → `ES2022`. Named capture groups in the design.md parser require ES2018+. |
| — | `@types/mdast`, `@types/hast`, `@types/unist` | Required as devDependencies; the unified ecosystem ships its types separately. |
| — | Contrast serialization margin | `formatOklch` rounds L to 4dp and H to 2dp, which can move a ratio by a few thousandths and land a "solved for exactly 7.0" accent at 6.998. `deriveIssueTheme` now solves for `target + 0.05`. Caught by `pnpm verify:contrast`. |
| — | Atkinson Hyperlegible Next/Mono | `next/font` has no fallback-metric override data for these two, so it skips fallback generation and emits a build warning. Accepted — they are opt-in accessibility faces, not the default. |
| — | Hairline rules vs WCAG 1.4.11 | Decorative separators are not "graphical objects required to understand content", so 3:1 does not bind. The audit holds them to an editorial 1.7:1 as an advisory check. |

## Risk 2 — dither-kit licensing: RESOLVED (downgraded 🔴 → 🟢)

The registry item JSONs at `tripwire.sh/r/*.json` carry no `license` field and
the component sources carry no headers, which is what raised the flag. Tracing
it upstream:

| Source | Declared licence |
|---|---|
| `registry.npmjs.org/@dither-kit/cli` | **MIT** |
| `Boring-Software-Inc/dither-kit` root `package.json` | **MIT** |
| `packages/cli/package.json` | **MIT** |
| `packages/registry-core/package.json` | **MIT** |

The repo has no `LICENSE` *file*, which is why the GitHub API reports
`license: none` — but MIT is declared at the monorepo root that contains the
`registry/` sources the CLI copies. That is a licence grant.

**Decision: proceed.** Vendor the components with an attribution header naming
the project, the author (`ripgrim` / Boring Software Inc), the upstream URL, and
MIT. Courtesy follow-up: open an issue asking them to add a `LICENSE` file, and
keep `AccessibleChart` as the seam that would make a swap cheap if the grant
were ever withdrawn.
