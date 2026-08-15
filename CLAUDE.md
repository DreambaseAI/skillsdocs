# Skills Docs

Turns any GitHub repo of agent skills into a typeset, branded reading experience.
`/anthropics/skills` renders `github.com/anthropics/skills` as a book.

`docs/ARCHITECTURE.md` is the source of truth. Read it before changing anything
structural. `docs/research/` holds the verified research it was built on — those
reports contain measured numbers, not guesses, and are worth consulting before
re-deriving something.

## Commands

```bash
pnpm dev                 # dev server
pnpm build               # production build (Cache Components enabled)
pnpm test                # vitest
pnpm tsc --noEmit        # typecheck
pnpm verify:contrast     # WCAG audit of every token pair + a 1,440-point hue sweep
pnpm probe [owner/repo]  # run skill discovery against live repos
pnpm probe:design [org]  # resolve design.md and audit the derived theme
pnpm db:push             # apply db/schema.sql to the Postgres named by POSTGRES_*
```

## Database

Postgres backs only the account layer (Better Auth sign-in + saved
collections); the whole site runs without it. `docs/DATABASE.md` is the
runbook — local dev is a clickhousectl-managed Docker Postgres named
`githubskills`, production is ClickHouse Cloud managed Postgres (per-service
CA → `POSTGRES_CA`). Two schema owners, never mixed: Better Auth's tables via
`npx @better-auth/cli migrate`, app tables via idempotent DDL in
`db/schema.sql` + `pnpm db:push`. Adding a top-level route? `src/proxy.ts`
`READER_ROUTE` and `next.config.ts` `NOT_OWNER` must both exclude it, or
`/newroute/x` is treated as a book.

## Stack

Next.js 16.3 App Router · React 19 · Tailwind v4 · shadcn/ui `base-luma` preset
(**Base UI** primitives, not Radix) · stone base colour · **HugeIcons** · Shiki ·
unified/remark/rehype.

## Conventions that are easy to get wrong

- **Base UI, not Radix.** Custom triggers use the `render` prop, not `asChild`.
  Check an existing file in `src/components/ui/` before guessing an API.
- **HugeIcons, not Lucide.** `<HugeiconsIcon icon={SearchIcon} />`. Icons inside
  a `Button` use `data-icon="inline-start"` and never a sizing class.
- **`src/styles/tokens.css` is the only file allowed a raw colour literal.**
  Everywhere else uses semantic tokens: `bg-paper`, `text-ink`,
  `text-muted-foreground`, `text-issue-accent`.
- **Theming is three orthogonal axes**, not a list of themes: colour scheme
  (`.dark`, the chrome) × paper mode (`data-paper`, the reading surface only) ×
  contrast (`data-contrast`). Per-issue branding overlays all three but may only
  touch `--issue-*`, `--radius`, and `--font-display`.
- **Measure is expressed in characters-per-line, never `ch`.** `1ch` is the width
  of a zero, and that ratio swings from 0.84 to 1.47 across our font set.
- **`cacheComponents: true` is on.** Reading params/searchParams/cookies/headers
  or doing an uncached fetch outside `<Suspense>` fails the build. Cache with
  `"use cache"` + `cacheLife` + `cacheTag`, or pass the params *promise* into a
  Suspense-wrapped child.
- **`next/font` options must be inline literals.** A spread fails the build.

## Data refresh

Three separate things, often confused:

| What | How it updates | You do |
|---|---|---|
| Install counts on the site | Live scrape of skills.sh, hourly cache | nothing |
| `data/skills-sh-snapshot.json` | `pnpm sync:skills-sh` | **rarely** — see below |
| Which repos are on the front page | `pnpm sync:seeds --write` | review, then commit |

The snapshot is a **fallback**, not the source. It is a build-time import so it
must stay committed, but refreshing it changes nothing a visitor sees — the
live path already refreshes hourly. It is 369KB on one line, so every refresh
rewrites the whole file in git history. Run it before a launch, after a
skills.sh shape change, or if the leaderboard shrinks a lot (`preferLive`
rejects a live scrape smaller than half the snapshot, so a stale-and-too-large
snapshot is the one failure mode that bites).

`sync:skills-sh` cannot add a repo. The front page is built from `SEED_REPOS`,
so a repo trending on skills.sh stays invisible there until `sync:seeds` adds
it — though it is readable at its URL immediately.

## Data model

One repo = one issue. One `SKILL.md` = one skill (the UI says "skill", never
"chapter"; internal identifiers still use the old `chapter` names).

Discovery is deliberately layout-agnostic — `skills/<slug>/SKILL.md` is only 38%
of real files across the 157 repos surveyed. Any directory containing a
`SKILL.md` is a skill. Duplicates collapse on two keys: identical content SHA,
and identical position once a leading per-agent mirror prefix (`.claude/`,
`.cursor/`, `providers/codex/`, …) is stripped. `pbakaus/impeccable` publishes
fourteen copies with fourteen different SHAs, which is why the second key exists.

A whole book costs **one REST call** (the recursive tree) plus **one GraphQL
point** (repo + owner metadata, on GraphQL's separate 5,000-point budget) —
plus raw.githubusercontent reads, which are CDN-served and not metered.
Unauthenticated there is no GraphQL, so a book falls back to three REST calls
out of 60/hr. Set `GITHUB_TOKEN` to get 5,000/hr on each budget.

## Verify, don't assume

There are three probes and an audit for a reason. Before claiming a repo has N
skills, run `pnpm probe`. Before claiming a colour passes AA, run
`pnpm verify:contrast`. Several "obvious" facts in this codebase turned out to
be false when measured — 46% of brand `primary` colours are achromatic, and no
single accent can pass AA on both light and dark stone.
