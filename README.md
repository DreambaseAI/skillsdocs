# Skills Docs

**Change `github.com` to this site, and read the repo as a book.**

```
github.com/anthropics/skills   →   skillsdocs.com/anthropics/skills
```

Agent skills ship as folders of `SKILL.md` files. They are written to be read —
by agents, and by the people maintaining them — and then they are read on a grey
file-listing page in a monospace column 1,400 pixels wide. This turns any such
repository into a typeset publication: a cover, a table of contents, chapters,
running heads, a colophon, and typography that was actually designed.

Each repository becomes its own **issue**, branded from the owner's published
`design.md` — so an Anthropic issue and a Supabase issue look like they came
from the same press but not from the same template.

---

## What it does

**Reads any skills repository.** Discovery is layout-agnostic on purpose:
`skills/<slug>/SKILL.md` accounts for only 38% of real files across the 157
repositories surveyed. Any directory containing a `SKILL.md` is a skill,
wherever it lives — `.claude/skills/`, `plugins/<plugin>/skills/`,
`providers/codex/plugin/skills/`, `skills/.curated/`, or the repository root.

**Collapses the copies.** Repositories routinely publish the same skill once per
agent runtime. `stripe/agent-toolkit` ships 35 `SKILL.md` files that are really
7 skills; `pbakaus/impeccable` ships 14 copies of one skill under 14 different
dot-directories, with 14 different content hashes. Duplicates collapse on two
keys — identical content, and identical position once the mirror prefix is
stripped — and the alternates are surfaced as "also published for Codex, Cursor,
Grok" rather than as noise in the contents.

**Themes each issue from the brand.** `design.md` is an emerging sibling to
`llms.txt`: a design system published as markdown for agents to read. Where a
brand publishes one, we parse it; where it doesn't, we fall back through a
community registry of 74 brands and finally to a hue derived from the owner's
name. Theming never fails and never produces an unreadable accent.

**Reads well on a phone, a tablet, and a wide screen** — three genuinely
different treatments, not one layout with breakpoints bolted on.

**Is built for agents too.** Append `.md` to any URL for clean markdown, or send
`Accept: text/markdown`. There is an `llms.txt`, a JSON API, and a per-book
agent-skills discovery manifest with content digests.

---

## Two things that turned out not to be true

Both were assumed during design and both were false when measured. They shaped
the whole colour system.

**1. You cannot theme an issue from a brand's `primary` colour.** 46% of the
brands in the reference registry publish an achromatic primary — Vercel's is
`#171717`, Figma's `#000000`, Resend's `#fcfdff`. Seeding from `primary` gives
you a grey magazine. The hue comes from the *most chromatic* token in the
document instead; `primary` is kept only for the masthead logotype.

**2. One accent colour cannot pass WCAG AA on both light and dark.** Against
stone-50 (relative luminance 0.9553) and stone-950 (0.0031), 4.5:1 on both would
require a luminance simultaneously ≥ 0.1892 and ≤ 0.1734. The best any single
colour achieves is 4.35:1. Every issue therefore ships two tones of its accent,
at L=0.52 and L=0.70, chroma capped at 0.19 and gamut-clamped.

`pnpm verify:contrast` re-proves both on every run, sweeping 1,440 hue/chroma
combinations and every token pair in every paper mode. It fails the build on
regression.

---

## Running it

```bash
pnpm install
pnpm dev
```

Then open any repository: <http://localhost:3000/anthropics/skills>

```bash
export GITHUB_TOKEN=$(gh auth token)   # 60 req/hr → 5,000 req/hr
```

Not required, but recommended — a book costs two GitHub API calls.

### Scripts

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` | Dev server / production build |
| `pnpm test` | Unit tests |
| `pnpm verify:contrast` | WCAG audit of every token pair + a 1,440-point hue sweep |
| `pnpm probe [owner/repo …]` | Run skill discovery against live repositories |
| `pnpm probe:design [owner …]` | Resolve `design.md` and audit the derived theme |

---

## Built with

[Next.js 16.3](https://nextjs.org) · [React 19](https://react.dev) ·
[Tailwind CSS v4](https://tailwindcss.com) ·
[shadcn/ui](https://ui.shadcn.com) on [Base UI](https://base-ui.com) ·
[HugeIcons](https://hugeicons.com) · [Shiki](https://shiki.style) ·
[unified](https://unifiedjs.com) · [dither-kit](https://tripwire.sh/dither-kit)

Typeset in [Literata](https://fonts.google.com/specimen/Literata), with fourteen
further OFL faces selectable in the reader — including
[Atkinson Hyperlegible Next](https://www.brailleinstitute.org/freefont/).

Skills data from [skills.sh](https://www.skills.sh). The Agent Skills format is
specified at [agentskills.io](https://agentskills.io/specification).

---

## Licence

Source code MIT © 2026 [Dream, Inc.](https://github.com/DreambaseAI/skillsdocs). See
[LICENSE](./LICENSE).

Skill documents rendered here belong to their authors and remain under whatever
licence their source repository specifies. They are reproduced verbatim, with
frontmatter intact, and every surface links back to the source and its licence.

Brought to you by the team behind **[Dreambase](https://dreambase.com)**.
