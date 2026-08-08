# skills.sh Data Access + Curated Skills-Repo Catalog

**Researched:** 2026-08-08 · **Method:** live `curl` against skills.sh + authenticated `gh api` against GitHub.
**Scope verified:** 157 candidate repos fetched, 4,039 `SKILL.md` files enumerated, 153 repos confirmed to contain at least one non-fixture `SKILL.md`. 89 selected for the seed catalog.

Everything below marked **VERIFIED** was executed during this research. Anything marked **INFERRED** is reasoning on top of verified data.

---

## 1. Getting skills.sh leaderboard data without auth

### 1.1 What does NOT work

| Attempt | Result |
|---|---|
| `https://skills.sh/api/v1/skills` | **401** — requires `Authorization: Bearer $VERCEL_OIDC_TOKEN`. Confirmed by `/docs/api`. |
| `https://www.skills.sh/leaderboard` | **404** (no such route; leaderboard lives at `/`) |
| `https://www.skills.sh/llms.txt` | **404** |
| `https://www.skills.sh/topics` | **404** (the real route is `/topic/<slug>`) |
| `?page=1`, `?view=trending`, `?view=hot` on `/` | HTTP 200 but **byte-identical payload** — the view switch is client-side over one preloaded dataset. No server pagination. |

The API docs at `https://www.skills.sh/docs/api` spell out the auth model verbatim:

> If your app is deployed on Vercel, you can authenticate using the project's OIDC token… Vercel mints a short-lived JWT per request, scoped to your team and project, and we verify it against `oidc.vercel.com`.

Documented endpoints (all OIDC-gated, 600 req/min per team+project):
`GET /api/v1/skills`, `/api/v1/skills/search`, `/api/v1/skills/curated`, `/api/v1/skills/{source}/{skill}`, `/api/v1/skills/audit/{source}/{skill}`.

`github.com/mastra-ai/skills-api` ("skills.sh as an API", 34 stars, default branch `main`) has **`homepage: null`** — no public hosted endpoint. Not usable as a drop-in.

### 1.2 What DOES work — the RSC flight payload (VERIFIED, this is the answer)

skills.sh is a Next.js App Router app. Sending the `RSC: 1` header to any route returns the raw React Flight payload (`Content-Type: text/x-component`) with **no authentication at all**, and the leaderboard data is embedded in it as plain JSON.

**Working command — top 600 skills with install counts:**

```bash
curl -s -H 'RSC: 1' https://www.skills.sh/ \
  | grep -o '"initialSkills":\[.*' \
  | head -c 2000
```

Better, a robust extractor (balanced-bracket scan, since the payload is not a single JSON doc):

```bash
curl -s -H 'RSC: 1' https://www.skills.sh/ > /tmp/rsc.txt
python3 - <<'EOF'
import json
t = open('/tmp/rsc.txt').read()
key = '"initialSkills":'
start = t.find(key) + len(key)
d = 0; j = start; instr = False; esc = False
while j < len(t):
    c = t[j]
    if instr:
        if esc: esc = False
        elif c == '\\': esc = True
        elif c == '"': instr = False
    else:
        if c == '"': instr = True
        elif c == '[': d += 1
        elif c == ']':
            d -= 1
            if d == 0: j += 1; break
    j += 1
print(json.dumps(json.loads(t[start:j])[:2], indent=2))
EOF
```

**Real sample output** (verbatim from the live payload):

```json
[
 {
  "source": "vercel-labs/skills",
  "skillId": "find-skills",
  "name": "find-skills",
  "installs": 2870782,
  "weeklyInstalls": [118887, 110834, 113781, 109199, 109085, 115475, 107969, 101120],
  "isOfficial": true
 },
 {
  "source": "mattpocock/skills",
  "skillId": "grill-me",
  "name": "grill-me",
  "installs": 798974,
  "weeklyInstalls": [41774, 46900, 47001, 49104, 70968, 69550, 67971, 64738]
 }
]
```

- Payload size: **137,315 bytes**. Contains exactly **600 skill records** across **91 distinct sources**.
- Fields: `source` (either `owner/repo` or a bare domain like `open.feishu.cn`), `skillId`, `name`, `installs` (int), `weeklyInstalls` (8-element array — this is the "8W Activity" sparkline), optional `isOfficial: true`.
- The React component consuming it is `SkillsLeaderboardBySource`.

**INFERRED but important:** `weeklyInstalls` gives us a free 8-week sparkline per skill with zero extra requests. That is a strong magazine-TOC visual.

### 1.3 The `/official` route — the richest source (VERIFIED)

```bash
curl -s -H 'RSC: 1' https://www.skills.sh/official > /tmp/official.txt
# then extract the "owners": [...] array with the same balanced-bracket scan
```

310,058 bytes. Contains an `"owners"` array under a `CuratedList` component:

- **98 owners**, **475 repos**, each with per-skill install counts.
- Shape:

```json
{
  "owner": "anthropics",
  "repos": [
    {
      "repo": "anthropics/skills",
      "totalInstalls": 1526645,
      "skills": [{ "name": "frontend-design", "installs": 755481 }, ...]
    },
    { "repo": "anthropics/claude-quickstarts", "totalInstalls": 6, "skills": [{"name":"first-run","installs":6}] }
  ],
  "totalInstalls": 1942411,
  "featuredRepo": "anthropics/skills",
  "featuredSkill": "frontend-design"
}
```

The same payload carries an `"avatars"` map and a `"generatedAt"` timestamp:

```json
"avatars": {
  "anthropics": "/api/image-proxy?url=https%3A%2F%2Fgithub.com%2Fanthropics.png%3Fsize%3D48&s=2762c092c14e9456",
  ...
}
```

**Recommendation:** ignore `image-proxy` and use `https://avatars.githubusercontent.com/<owner>` or `https://github.com/<owner>.png?size=128` directly — no hash param, no coupling to their deploy.

`featuredRepo` + `featuredSkill` are literally an editor's pick per brand. That is our magazine cover story field, free.

Top official repos by installs (verified from this payload):

| Repo | Installs | Skills |
|---|---:|---:|
| microsoft/azure-skills | 7,040,427 | 52 |
| github/awesome-copilot | 1,999,270 | 362 |
| vercel-labs/skills | 1,533,550 | 4 |
| anthropics/skills | 1,526,645 | 21 |
| vercel-labs/agent-skills | 1,120,153 | 18 |
| firebase/agent-skills | 678,643 | 22 |
| vercel-labs/agent-browser | 353,207 | 10 |
| firecrawl/cli | 350,715 | 14 |
| remotion-dev/skills | 298,983 | 1 |
| flutter/skills | 285,910 | 76 |

### 1.4 The badge endpoint (VERIFIED, works, but low value)

```bash
curl -sL https://skills.sh/b/anthropics/skills
```

Returns a shields-style SVG. The count is in the `aria-label` and `<title>`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="93" height="20" role="img" aria-label="Skills: 2.7M">
<title>Skills: 2.7M</title>...
```

Extract with:

```bash
curl -sL "https://skills.sh/b/anthropics/skills" | sed -n 's/.*aria-label="Skills: \([^"]*\)".*/\1/p'
# -> 2.7M
```

**Only rounded to 2 significant figures** (`2.7M`, not `2738696`) and costs one request per repo. Use the RSC payload instead; keep the badge as a fallback for a repo absent from the top-600.

Also verified working: the whole site is SSR'd, so plain `curl https://www.skills.sh/` (956 KB HTML) contains the rendered leaderboard table as text. That is a viable but far uglier fallback vs. the RSC JSON.

### 1.5 Firm recommendation

Build one server-side fetcher, `lib/skills-sh.ts`:

1. `GET https://www.skills.sh/ -H 'RSC: 1'` → parse `initialSkills` → 600 skills / 91 sources with installs + 8-week sparkline.
2. `GET https://www.skills.sh/official -H 'RSC: 1'` → parse `owners` → 475 repos, per-skill installs, `featuredRepo`/`featuredSkill`, official badge.
3. Merge on `owner/repo`. Cache with `next: { revalidate: 3600 }`.
4. Filter out non-GitHub sources — `open.feishu.cn`, `larksuite/cli` is real GitHub but `agent.qq.com` and `uizze.com` are bare domains. Rule: keep a source only if it matches `^[\w.-]+/[\w.-]+$` **and** the owner segment contains no `.`.

Caveat to code around: these are undocumented internals. Wrap the parse in a try/catch and fall back to the static seed catalog in §5 if the shape changes. The seed catalog is not a bootstrap throwaway — it is the resilience layer.

---

## 2. Directory layout variants (VERIFIED across 4,039 real `SKILL.md` paths in 157 repos)

This is the section the fetcher must be written against. **Do not hardcode `skills/*/SKILL.md`** — it is only 38% of files.

| # | Family | Files | Repos | Real examples |
|---|---|---:|---:|---|
| A | **repo root** `SKILL.md` | 3 | 3 | `temporalio/skill-temporal-developer`, `nozomio-labs/nia-skill`, `datadog-labs/agent-skills` |
| B | `<slug>/SKILL.md` (top-level dirs) | 296 | 15 | `prisma/skills` → `prisma-cli/SKILL.md`; `skills-collective/skills` → `ace-step/SKILL.md`; `nexscope-ai/amazon-skills` (52 of them) |
| C | `skills/<slug>/SKILL.md` | 1,528 | 102 | `anthropics/skills` → `skills/xlsx/SKILL.md`; `DreambaseAI/skills`; `cloudflare/skills`; `shadcn/ui` → `skills/shadcn/SKILL.md` |
| D | `<dotdir>/skills/<slug>/SKILL.md` | 104 | 20 | `.claude/`, `.agents/`, `.cursor/`, `.gemini/`, `.github/`, `.opencode/`, `.codex/` |
| E | `plugins/<plugin>/skills/<slug>/SKILL.md` | 678 | 22 | `expo/skills` → `plugins/expo/skills/*/SKILL.md`; `anthropics/claude-code` → `plugins/plugin-dev/skills/*` |
| F | `skills/<group>/<slug>/SKILL.md` | 270 | 9 | `mattpocock/skills` → `skills/engineering/*`, `skills/productivity/*`, `skills/in-progress/*`, `skills/misc/*` |
| G | `skills/` deep-nested (4+ levels) | 283 | 10 | `posthog/skills` → `skills/posthog/all/skills/<slug>/SKILL.md` |
| H | arbitrary other prefix | 877 | 40 | see below |

Depth histogram (slashes in path): `0→3, 1→296, 2→1678, 3→868, 4→719, 5→450, 6→13, 7→5, 8→4, 9→1, 10→1, 12→1`.

### 2.1 The awkward real cases you must handle

**Root-level `SKILL.md`** (family A) — a repo that *is* one skill:
- `temporalio/skill-temporal-developer` → exactly `SKILL.md`
- `nozomio-labs/nia-skill` → exactly `SKILL.md`
- `datadog-labs/agent-skills` → has a root `SKILL.md` **plus** 39 others (`agent-observability/*/SKILL.md`, `dd-apm/k8s-ssi/*/SKILL.md`, …). Mixed root + nested in one repo.

**Non-`skills/` custom prefixes** — real, and there is no pattern to guess:
- `vercel-labs/agent-browser` → **`skill-data/<slug>/SKILL.md`** (7 files)
- `better-auth/skills` → **`better-auth/<slug>/SKILL.md`** (5 files)
- `encoredev/skills` → **`encore/<slug>/SKILL.md`** (28 files)
- `langchain-ai/langchain-skills` → **`config/skills/<slug>/SKILL.md`** (22 files)
- `magentosh/skills` and `101-skills/skills` → **`tools/audio/*`, `tools/image/*`, `tools/video/*`**
- `browser-act/skills` → **`solutions/ecommerce/*`, `solutions/social-listening/*`, `solutions/video-platforms/*`, `solutions/lead-generation/*`**
- `anthropics/knowledge-work-plugins` → `small-business/skills/*`, `partner-built/zoom-plugin/skills/*`
- `stripe/ai` → `providers/claude/plugin/skills/<slug>/SKILL.md`
- `google/agents-cli` → `codex/<slug>/SKILL.md`
- `openai/skills` → **`skills/.curated/<slug>/SKILL.md`** (39) and `skills/.system/<slug>/SKILL.md` (5) — **dot-prefixed directory segments**, which many glob libraries silently skip by default.

**Hidden-directory layouts** (family D) — the agent-config convention:
- `.claude/skills/` → `convex-dev/convex` (20), `facebook/react` (6), `microsoft/playwright-cli`, `base/skills`, `expo/skills`, `auth0/agent-skills`, `wix/skills`, `jimliu/baoyu-skills`, `dbt-labs/dbt-agent-skills`, `nextlevelbuilder/ui-ux-pro-max-skill`
- `.agents/skills/` → `n8n-io/n8n` (21), `elevenlabs/skills`, `clerk/skills`, `sveltejs/ai-tools`, `pbakaus/impeccable`
- `.gemini/skills/` → `google-gemini/gemini-cli` (13)
- `.cursor/skills/` → `langfuse/skills`
- `.github/skills/` → `github/awesome-copilot`, `pbakaus/impeccable`
- `.opencode/skills/` → `n8n-io/n8n`
- `pbakaus/impeccable` ships **five parallel copies** of the same skills — `.agents/`, `.claude/`, `.cursor/`, `.gemini/`, `.github/`. Deduplicate by skill slug or the TOC will show each skill 5×.
- `facebook/react` has **two** `.claude/skills` roots: `.claude/skills/*` (6) and `compiler/.claude/skills/*` (7) — monorepo, both legitimate.

**Deeply nested monorepo paths** — real maxima:
- `microsoft/azure-skills`: `.github/plugins/azure-skills/skills/microsoft-foundry/models/deploy-model/preset/SKILL.md` (8 slashes). Same repo also has a plain `skills/<slug>/SKILL.md` tree (28 files) — **the same skills exist twice**.
- `aws/agent-toolkit-for-aws`: `plugins/aws-agents/skills/agents-pay/packages/openclaw/skills/agents-pay/SKILL.md` (8) — a `skills/` inside a vendored package inside a `skills/`.
- `google-gemini/gemini-cli`: `tools/caretaker-agent/cloudrun/triage-worker/.gemini/skills/quality/SKILL.md` (7).

**False positives you MUST exclude** — these are template/fixture files, not real skills:
- `DreambaseAI/skills` → `skills/dreambase-skill-creator/assets/skill-template/SKILL.md` (the skill-creator's own template)
- `langchain-ai/deepagents` → `libs/cli/tests/unit_tests/deploy/fixtures/projects/subagent_with_local_skills/subagents/researcher/skills/note/SKILL.md` (12 slashes — a test fixture)
- `google-gemini/gemini-cli` → `packages/cli/src/commands/extensions/examples/skills/skills/greeter/SKILL.md`

Exclusion regex that cleared all observed false positives without dropping a real skill:

```ts
const NOISE = /(^|\/)(assets|templates?|fixtures|examples?|tests?|__tests__|node_modules)(\/|$)/;
```

Applying it dropped `pytorch/pytorch`, `drizzle-team/drizzle-orm`, `e2b-dev/fragments`, `vercel-labs/next-skills` to zero real skills — see §4.

### 2.2 The generic algorithm we should ship

Do not pattern-match paths. Do this instead:

```ts
// One call, whole repo, ~1 request per repo.
// GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1
const paths = tree.tree
  .filter((n) => n.type === "blob" && n.path.endsWith("SKILL.md"))
  .map((n) => n.path)
  .filter((p) => !NOISE.test(p));

// A skill's identity is its containing directory; root SKILL.md falls back to repo name.
const skills = paths.map((p) => {
  const dir = p.slice(0, -"SKILL.md".length).replace(/\/$/, "");
  return {
    path: p,
    dir,                                   // "" for a root SKILL.md
    slug: dir === "" ? repo : dir.split("/").pop()!,
    group: dir.split("/").slice(0, -1).join("/") || null, // for section headings
  };
});
```

Then derive the *display* grouping from the longest common prefix of all `dir`s, stripped. For `mattpocock/skills` that yields sections `engineering / productivity / in-progress / misc` for free — which is exactly the magazine chapter structure we want. For `posthog/skills` it yields `omnibus / posthog·all / posthog·integration / posthog·feature-flags`.

**Dedupe rule (required):** key on `slug`; when two paths share a slug, prefer the shallowest path, then prefer a non-dot-directory path. This correctly collapses `pbakaus/impeccable` (5×) and `microsoft/azure-skills` (2×).

**Truncation:** the trees API caps at 100k entries and sets `"truncated": true`. **Zero of the 157 repos we fetched were truncated**, including `n8n-io/n8n` and `facebook/react`. Still check the flag and fall back to the Search API (`q=filename:SKILL.md+repo:owner/name`) if it ever trips.

---

## 3. Plugin marketplace manifests (VERIFIED)

**83 of 157 repos** ship `.claude-plugin/marketplace.json`. Sibling variants observed: `.cursor-plugin/marketplace.json` (28), `.agents/plugins/marketplace.json` (21), `.codex-plugin/marketplace.json` (3), `.grok-plugin/marketplace.json` (2), `.factory-plugin/marketplace.json` (1), `.github/plugin/marketplace.json` (`github/awesome-copilot`, `upstash/context7`).

Non-standard locations that would break a naive lookup:
- `n8n-io/n8n` → `.claude/plugins/n8n/.claude-plugin/marketplace.json`
- `getsentry/sentry-for-ai` → `src/plugins/claude/marketplace.json`, `src/plugins/codex/…`, `src/plugins/cursor/…`
- `stablyai/orca` → `resources/plugins/launch/orca-marketplace.json`
- `launchdarkly/agent-skills` → per-skill `skills/feature-flags/<slug>/marketplace.json`
- `anthropics/knowledge-work-plugins` → root manifest **plus** `partner-built/brand-voice/.claude-plugin/marketplace.json`

### Real manifest shapes

`anthropics/skills` — plugin bundles that enumerate skill dirs explicitly:

```json
{
  "name": "anthropic-agent-skills",
  "owner": { "name": "Keith Lazuka", "email": "klazuka@anthropic.com" },
  "metadata": { "description": "Anthropic example skills", "version": "1.0.0" },
  "plugins": [
    {
      "name": "document-skills",
      "description": "Collection of document processing suite including Excel, Word, PowerPoint, and PDF capabilities",
      "source": "./",
      "strict": false,
      "skills": ["./skills/xlsx", "./skills/docx", "./skills/pptx", "./skills/pdf"]
    }
  ]
}
```

`cloudflare/skills` — minimal form, with the schema URL and an owner `url` (useful for branding):

```json
{
  "$schema": "https://code.claude.com/schemas/marketplace.json",
  "name": "cloudflare",
  "owner": { "name": "Cloudflare", "url": "https://workers.cloudflare.com" },
  "plugins": [
    { "name": "cloudflare", "source": "./", "description": "Skills for the Cloudflare developer platform" }
  ]
}
```

`stripe/ai` — `source` points at a subdirectory, and carries `version` + `author`:

```json
{
  "name": "stripe",
  "owner": { "name": "Stripe", "email": "support@stripe.com" },
  "plugins": [
    {
      "name": "stripe",
      "source": "./providers/claude/plugin/",
      "description": "Stripe",
      "version": "0.5.0",
      "author": { "name": "Stripe" }
    }
  ]
}
```

**Field contract (INFERRED from the 3 above + path survey):** `name` (required), `owner: {name, email?, url?}`, `metadata?: {description, version}`, `plugins[]` with `name` (required), `description?`, `source` (relative dir, default `./`), `version?`, `author?`, `strict?`, `skills?: string[]` (relative dirs).

**Recommendation:** treat `marketplace.json` as *editorial metadata, never as the skill index.* Only `anthropics/skills` enumerates `skills[]`; `cloudflare` and `stripe` do not, so the tree scan remains the source of truth. Use the manifest for: publisher display name, `owner.url` (brand/design lookup), plugin-level grouping into magazine chapters, and a "verified plugin" badge.

---

## 4. Repos that look right but have NO skills (VERIFIED — do not seed these)

| Repo | Why |
|---|---|
| `drizzle-team/drizzle-orm` | 0 `SKILL.md` anywhere on `main` |
| `drizzle-team/drizzle-orm-docs` | 0 |
| `e2b-dev/e2b`, `e2b-dev/fragments` | 0 — e2b has no skills repo yet |
| `tanstack/router` | 0 |
| `vercel-labs/next-skills` | 0 on default branch, despite 136,219 installs on skills.sh — **INFERRED:** skills live on a non-default branch or were moved |
| `pytorch/pytorch` | 1 `SKILL.md`, all under test paths → filtered as noise |

The `vercel-labs/next-skills` case is the important one: **skills.sh install counts can outlive the default-branch layout.** Always verify against the tree before rendering, and render a graceful empty state.

---

## 5. Seed catalog — 89 verified repos

Every entry below was confirmed via `gh api repos/<owner>/<repo>` and `gh api repos/<owner>/<repo>/git/trees/<branch>?recursive=1`. `skillCount` is post-noise-filter. `installs` is the max of the homepage leaderboard total and the `/official` repo total. `layout` is the dominant pattern; `layouts` lists every pattern present in that repo.

```ts
export type SeedRepo = {
  owner: string;
  repo: string;
  branch: string;
  /** Verified count of real SKILL.md files (noise-filtered) */
  skillCount: number;
  /** Dominant directory pattern */
  layout: string;
  /** Every pattern present in the repo (a repo can mix several) */
  layouts: string[];
  stars: number;
  /** skills.sh install count, 0 if not ranked */
  installs: number;
  /** listed on skills.sh /official */
  official: boolean;
  license: string | null;
  /** ships a plugin marketplace manifest */
  marketplace: boolean;
  avatar: string;
  /** repo homepage, falling back to owner blog — use for design.md lookup */
  site: string | null;
  description: string | null;
};

export const SEED_REPOS: SeedRepo[] = [
  {
    owner: "anthropics", repo: "skills", branch: "main",
    skillCount: 17, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 167036, installs: 2738696, official: true,
    license: null, marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/76263028?v=4",
    site: "https://anthropic.com",
    description: "Public repository for Agent Skills",
  },
  {
    owner: "vercel-labs", repo: "skills", branch: "main",
    skillCount: 1, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 28359, installs: 2870782, official: true,
    license: "MIT", marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/108547162?v=4",
    site: "https://skills.sh",
    description: "The open agent skills tool - npx skills",
  },
  {
    owner: "vercel-labs", repo: "agent-skills", branch: "main",
    skillCount: 9, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 29867, installs: 1973216, official: true,
    license: null, marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/108547162?v=4",
    site: "https://skills.sh/vercel-labs/agent-skills",
    description: "Vercel's official collection of agent skills",
  },
  {
    owner: "vercel-labs", repo: "agent-browser", branch: "main",
    skillCount: 8, layout: "skill-data/*/SKILL.md",
    layouts: ["skill-data/*/SKILL.md", "skills/*/SKILL.md"],
    stars: 40202, installs: 644491, official: true,
    license: "Apache-2.0", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/108547162?v=4",
    site: "https://agent-browser.dev",
    description: "Browser automation CLI for AI agents",
  },
  {
    owner: "mattpocock", repo: "skills", branch: "main",
    skillCount: 35, layout: "skills/engineering/*/SKILL.md",
    layouts: ["skills/engineering/*/SKILL.md", "skills/productivity/*/SKILL.md", "skills/in-progress/*/SKILL.md", "skills/misc/*/SKILL.md"],
    stars: 209866, installs: 14357419, official: false,
    license: "MIT", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/28293365?v=4",
    site: "https://aihero.dev/skills",
    description: "Skills for Real Engineers. Straight from my .agents directory.",
  },
  {
    owner: "microsoft", repo: "azure-skills", branch: "main",
    skillCount: 74, layout: ".github/plugins/azure-skills/skills/*/SKILL.md",
    layouts: [".github/plugins/azure-skills/skills/*/SKILL.md", "skills/*/SKILL.md", ".github/plugins/azure-skills/skills/azure-app-onboard/*/SKILL.md", ".github/plugins/azure-skills/skills/microsoft-foundry/models/deploy-model/*/SKILL.md"],
    stars: 1363, installs: 12344057, official: true,
    license: "MIT", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/6154722?v=4",
    site: "https://opensource.microsoft.com",
    description: "Official agent plugin providing skills and MCP server configurations for Azure scenarios.",
  },
  {
    owner: "github", repo: "awesome-copilot", branch: "main",
    skillCount: 419, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md", "skills/qdrant-scaling/*/SKILL.md", "skills/qdrant-scaling/scaling-data-volume/*/SKILL.md", "skills/qdrant-performance-optimization/*/SKILL.md"],
    stars: 37586, installs: 1999270, official: true,
    license: "MIT", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/9919?v=4",
    site: "https://awesome-copilot.github.com/",
    description: "Community-contributed instructions, agents, skills, and configurations to help you make the most of GitHub Copilot.",
  },
  {
    owner: "obra", repo: "superpowers", branch: "main",
    skillCount: 14, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 269254, installs: 2656690, official: false,
    license: "MIT", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/45416?v=4",
    site: "http://fsck.com",
    description: "An agentic skills framework & software development methodology that works.",
  },
  {
    owner: "openai", repo: "skills", branch: "main",
    skillCount: 44, layout: "skills/.curated/*/SKILL.md",
    layouts: ["skills/.curated/*/SKILL.md", "skills/.system/*/SKILL.md"],
    stars: 24639, installs: 66234, official: true,
    license: null, marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/14957082?v=4",
    site: "https://openai.com/",
    description: "Skills Catalog for Codex",
  },
  {
    owner: "anthropics", repo: "claude-code", branch: "main",
    skillCount: 10, layout: "plugins/plugin-dev/skills/*/SKILL.md",
    layouts: ["plugins/plugin-dev/skills/*/SKILL.md", "plugins/claude-opus-4-5-migration/skills/*/SKILL.md", "plugins/frontend-design/skills/*/SKILL.md", "plugins/hookify/skills/*/SKILL.md"],
    stars: 140718, installs: 113906, official: true,
    license: null, marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/76263028?v=4",
    site: "https://code.claude.com/docs/en/overview",
    description: "Claude Code is an agentic coding tool that lives in your terminal, understands your codebase, and helps you code faster by executing routine tasks, explaining complex code, and handling git workflows - all through natural language commands.",
  },
  {
    owner: "anthropics", repo: "knowledge-work-plugins", branch: "main",
    skillCount: 212, layout: "small-business/skills/*/SKILL.md",
    layouts: ["small-business/skills/*/SKILL.md", "partner-built/zoom-plugin/skills/*/SKILL.md", "data/skills/*/SKILL.md", "engineering/skills/*/SKILL.md"],
    stars: 23371, installs: 215821, official: true,
    license: "Apache-2.0", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/76263028?v=4",
    site: "https://anthropic.com",
    description: "Open source repository of plugins primarily intended for knowledge workers to use in Claude Cowork",
  },
  {
    owner: "firebase", repo: "agent-skills", branch: "main",
    skillCount: 12, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 401, installs: 1416942, official: true,
    license: "Apache-2.0", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/1335026?v=4",
    site: "firebase.google.com",
    description: "Agent Skills for Firebase",
  },
  {
    owner: "prisma", repo: "skills", branch: "main",
    skillCount: 9, layout: "<slug>/SKILL.md",
    layouts: ["<slug>/SKILL.md"],
    stars: 50, installs: 1189288, official: true,
    license: "MIT", marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/17219288?v=4",
    site: "https://www.prisma.io",
    description: null,
  },
  {
    owner: "googleworkspace", repo: "cli", branch: "main",
    skillCount: 95, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 30269, installs: 911481, official: false,
    license: "Apache-2.0", marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/3708359?v=4",
    site: "https://developers.google.com/workspace",
    description: "Google Workspace CLI — one command-line tool for Drive, Gmail, Calendar, Sheets, Docs, Chat, Admin, and more. Dynamically built from Google Discovery Service. Includes AI agent skills.",
  },
  {
    owner: "remotion-dev", repo: "skills", branch: "main",
    skillCount: 12, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 4245, installs: 686300, official: true,
    license: null, marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/85344006?v=4",
    site: "https://remotion.dev",
    description: "Agent Skills",
  },
  {
    owner: "firecrawl", repo: "cli", branch: "main",
    skillCount: 10, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 572, installs: 664321, official: true,
    license: null, marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/135057108?v=4",
    site: "http://docs.firecrawl.dev/cli",
    description: "CLI and Agent Skill for Firecrawl - Add scrape, search, and browsing capabilities to your AI agents",
  },
  {
    owner: "firecrawl", repo: "skills", branch: "main",
    skillCount: 7, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 68, installs: 229063, official: true,
    license: "ISC", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/135057108?v=4",
    site: "firecrawl.dev",
    description: null,
  },
  {
    owner: "supabase", repo: "agent-skills", branch: "main",
    skillCount: 2, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 2485, installs: 542039, official: true,
    license: "MIT", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/54469796?v=4",
    site: "https://supabase.com/docs/guides/getting-started/ai-skills",
    description: "Agent Skills to help developers using AI agents with Supabase",
  },
  {
    owner: "expo", repo: "skills", branch: "main",
    skillCount: 23, layout: "plugins/expo/skills/*/SKILL.md",
    layouts: ["plugins/expo/skills/*/SKILL.md", ".claude/skills/*/SKILL.md", "plugins/expo-experiments/skills/*/SKILL.md"],
    stars: 2382, installs: 395301, official: true,
    license: "MIT", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/12504344?v=4",
    site: "https://expo.dev",
    description: "A collection of AI agent skills for working with Expo projects and Expo Application Services",
  },
  {
    owner: "cloudflare", repo: "skills", branch: "main",
    skillCount: 13, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 2583, installs: 321219, official: true,
    license: "Apache-2.0", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/314135?v=4",
    site: "https://www.cloudflare.com",
    description: "Skills for teaching agents how to build on Cloudflare.",
  },
  {
    owner: "flutter", repo: "skills", branch: "main",
    skillCount: 36, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md", ".agents/agents/reidbaker-agent/skills/*/SKILL.md", "tool/dart_skills_lint/.agents/skills/*/SKILL.md", "tool/dart_skills_lint/skills/*/SKILL.md"],
    stars: 2803, installs: 285910, official: true,
    license: "BSD-3-Clause", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/14101776?v=4",
    site: "https://flutter.dev",
    description: null,
  },
  {
    owner: "shadcn-ui", repo: "ui", branch: "main",
    skillCount: 2, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 120834, installs: 271674, official: false,
    license: "MIT", marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/139895814?v=4",
    site: "https://ui.shadcn.com",
    description: "A set of beautifully-designed, accessible components and a code distribution platform. Works with your favorite frameworks. Open Source. Open Code.",
  },
  {
    owner: "google-labs-code", repo: "stitch-skills", branch: "main",
    skillCount: 15, layout: "plugins/stitch-design/skills/*/SKILL.md",
    layouts: ["plugins/stitch-design/skills/*/SKILL.md", "plugins/stitch-build/skills/*/SKILL.md", "plugins/stitch-utilities/skills/*/SKILL.md"],
    stars: 7962, installs: 296829, official: true,
    license: "Apache-2.0", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/161364575?v=4",
    site: "https://stitch.withgoogle.com/docs/mcp/setup",
    description: "A library of Agent Skills designed to work with the Stitch MCP server. Each skill follows the Agent Skills open standard, for compatibility with coding agents such as Antigravity, Gemini CLI, Claude Code, Cursor.",
  },
  {
    owner: "stripe", repo: "ai", branch: "main",
    skillCount: 35, layout: "providers/claude/plugin/skills/*/SKILL.md",
    layouts: ["providers/claude/plugin/skills/*/SKILL.md", "providers/codex/plugin/skills/*/SKILL.md", "providers/cursor/plugin/skills/*/SKILL.md", "providers/grok/plugin/skills/*/SKILL.md"],
    stars: 1729, installs: 179642, official: true,
    license: "MIT", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/856813?v=4",
    site: "https://docs.stripe.com/agents",
    description: "One-stop shop for building AI-powered products and businesses with Stripe.",
  },
  {
    owner: "better-auth", repo: "skills", branch: "main",
    skillCount: 6, layout: "better-auth/*/SKILL.md",
    layouts: ["better-auth/*/SKILL.md", "<slug>/SKILL.md"],
    stars: 206, installs: 131063, official: true,
    license: null, marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/163827765?v=4",
    site: "https://better-auth.com",
    description: null,
  },
  {
    owner: "aws", repo: "agent-toolkit-for-aws", branch: "main",
    skillCount: 146, layout: "skills/core-skills/*/SKILL.md",
    layouts: ["skills/core-skills/*/SKILL.md", "plugins/aws-core/skills/*/SKILL.md", "skills/specialized-skills/database-skills/*/SKILL.md", "plugins/aws-agents-for-devsecops/skills/*/SKILL.md"],
    stars: 2271, installs: 113497, official: true,
    license: "Apache-2.0", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/2232217?v=4",
    site: "https://amazon.com/aws",
    description: "Official, AWS-supported MCP servers, skills, and plugins to help AI agents build on AWS",
  },
  {
    owner: "microsoft", repo: "playwright-cli", branch: "main",
    skillCount: 2, layout: ".claude/skills/*/SKILL.md",
    layouts: [".claude/skills/*/SKILL.md", "skills/*/SKILL.md"],
    stars: 12402, installs: 113158, official: true,
    license: "Apache-2.0", marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/6154722?v=4",
    site: "https://playwright.dev",
    description: "CLI for common Playwright actions. Record and generate Playwright code, inspect selectors and take screenshots.",
  },
  {
    owner: "neondatabase", repo: "agent-skills", branch: "main",
    skillCount: 17, layout: "plugins/neon-postgres/skills/*/SKILL.md",
    layouts: ["plugins/neon-postgres/skills/*/SKILL.md", "skills/*/SKILL.md", "evals/neon-postgres-egress-optimizer/.claude/skills/*/SKILL.md"],
    stars: 82, installs: 110844, official: true,
    license: "Apache-2.0", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/77690634?v=4",
    site: "https://neon.tech",
    description: "Agent Skills for Neon Severless Postgres",
  },
  {
    owner: "tavily-ai", repo: "skills", branch: "main",
    skillCount: 8, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 446, installs: 92635, official: true,
    license: "MIT", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/170207473?v=4",
    site: "https://skills.sh/tavily-ai/skills",
    description: null,
  },
  {
    owner: "browser-use", repo: "browser-use", branch: "main",
    skillCount: 7, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md", "browser_use/skills/*/SKILL.md"],
    stars: 108339, installs: 90007, official: true,
    license: "MIT", marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/192012301?v=4",
    site: "https://browser-use.com",
    description: "🌐 Make websites accessible for AI agents. Automate tasks online with ease.",
  },
  {
    owner: "clerk", repo: "skills", branch: "main",
    skillCount: 22, layout: "skills/frameworks/*/SKILL.md",
    layouts: ["skills/frameworks/*/SKILL.md", "skills/core/*/SKILL.md", "skills/features/*/SKILL.md", "skills/mobile/*/SKILL.md"],
    stars: 66, installs: 82166, official: true,
    license: null, marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/49538330?v=4",
    site: "https://clerk.com",
    description: "AI Skills to enhance working with Clerk",
  },
  {
    owner: "langchain-ai", repo: "langchain-skills", branch: "main",
    skillCount: 22, layout: "config/skills/*/SKILL.md",
    layouts: ["config/skills/*/SKILL.md"],
    stars: 1111, installs: 76048, official: true,
    license: null, marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/126733545?v=4",
    site: "https://www.langchain.com",
    description: null,
  },
  {
    owner: "Shopify", repo: "shopify-ai-toolkit", branch: "main",
    skillCount: 21, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 491, installs: 69885, official: true,
    license: "MIT", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/8085?v=4",
    site: "https://shopify.engineering/",
    description: "Agent plugins/extensions for CLIs and IDEs",
  },
  {
    owner: "parallel-web", repo: "parallel-agent-skills", branch: "main",
    skillCount: 10, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 65, installs: 67241, official: true,
    license: "MIT", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/210743255?v=4",
    site: "https://parallel.ai",
    description: null,
  },
  {
    owner: "getsentry", repo: "skills", branch: "main",
    skillCount: 28, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 904, installs: 42264, official: true,
    license: "Apache-2.0", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/1396951?v=4",
    site: "https://sentry.io",
    description: "Agent Skills used by the Sentry team for development.",
  },
  {
    owner: "browserbase", repo: "skills", branch: "main",
    skillCount: 16, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 3680, installs: 19112, official: true,
    license: null, marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/158221360?v=4",
    site: "https://www.browserbase.com/SKILL.md",
    description: "Browserbase's official collection of agent skills to access the web.",
  },
  {
    owner: "mastra-ai", repo: "skills", branch: "main",
    skillCount: 1, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 72, installs: 16872, official: true,
    license: "NOASSERTION", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/149120496?v=4",
    site: "https://mastra.ai",
    description: "Official agent skills for coding agents working with the Mastra AI framework",
  },
  {
    owner: "resend", repo: "resend-skills", branch: "main",
    skillCount: 5, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 159, installs: 16418, official: true,
    license: "MIT", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/109384852?v=4",
    site: "https://resend.com",
    description: "Agent Skills for working with Resend to send and receive emails.",
  },
  {
    owner: "PostHog", repo: "skills", branch: "main",
    skillCount: 254, layout: "skills/omnibus/*/SKILL.md",
    layouts: ["skills/omnibus/*/SKILL.md", "skills/posthog/all/skills/*/SKILL.md", "skills/posthog/integration/skills/*/SKILL.md", "skills/posthog/feature-flags/skills/*/SKILL.md"],
    stars: 58, installs: 10544, official: true,
    license: "MIT", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/60330232?v=4",
    site: "https://posthog.com",
    description: "PostHog skills (under construction)",
  },
  {
    owner: "huggingface", repo: "skills", branch: "main",
    skillCount: 26, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md", "hf-mcp/skills/*/SKILL.md"],
    stars: 10909, installs: 8552, official: true,
    license: "Apache-2.0", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/25720743?v=4",
    site: "https://huggingface.co",
    description: "Give your agents the power of the Hugging Face ecosystem",
  },
  {
    owner: "upstash", repo: "context7", branch: "master",
    skillCount: 8, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md", "packages/pi/skills/*/SKILL.md", "plugins/claude/context7/skills/*/SKILL.md", "plugins/codex/context7/skills/*/SKILL.md"],
    stars: 60437, installs: 7554, official: true,
    license: "MIT", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/74989412?v=4",
    site: "https://context7.com",
    description: "Context7 Platform -- Up-to-date code documentation for LLMs and AI code editors",
  },
  {
    owner: "Convex-Dev", repo: "convex", branch: "develop",
    skillCount: 20, layout: ".claude/skills/*/SKILL.md",
    layouts: [".claude/skills/*/SKILL.md"],
    stars: 117, installs: 54, official: true,
    license: "NOASSERTION", marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/64296104?v=4",
    site: "https://convex.world",
    description: "Convex Main Repository - Decentralised platform for the Internet of Value",
  },
  {
    owner: "vercel", repo: "ai", branch: "main",
    skillCount: 12, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 26085, installs: 46240, official: true,
    license: "NOASSERTION", marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/14985020?v=4",
    site: "https://ai-sdk.dev",
    description: "The AI Toolkit for TypeScript. From the creators of Next.js, the AI SDK is a free open-source library for building AI-powered applications and agents ",
  },
  {
    owner: "vercel", repo: "turborepo", branch: "main",
    skillCount: 1, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 30873, installs: 59974, official: true,
    license: "MIT", marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/14985020?v=4",
    site: "https://turborepo.dev",
    description: "Build system optimized for JavaScript and TypeScript, written in Rust",
  },
  {
    owner: "apollographql", repo: "skills", branch: "main",
    skillCount: 14, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 102, installs: 24824, official: true,
    license: "MIT", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/17189275?v=4",
    site: "https://skills.sh/apollographql/skills",
    description: "Apollo GraphQL Agent Skills",
  },
  {
    owner: "hashicorp", repo: "agent-skills", branch: "main",
    skillCount: 17, layout: "terraform/provider-development/skills/*/SKILL.md",
    layouts: ["terraform/provider-development/skills/*/SKILL.md", "terraform/code-generation/skills/*/SKILL.md", "packer/builders/skills/*/SKILL.md", "terraform/module-generation/skills/*/SKILL.md"],
    stars: 788, installs: 24123, official: true,
    license: "MPL-2.0", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/761456?v=4",
    site: "https://hashicorp.com",
    description: "A collection of Agent skills and Claude Code plugins for HashiCorp products.",
  },
  {
    owner: "mongodb", repo: "agent-skills", branch: "main",
    skillCount: 34, layout: "plugins/mongodb/.agy-plugin/skills/*/SKILL.md",
    layouts: ["plugins/mongodb/.agy-plugin/skills/*/SKILL.md", "plugins/mongodb/skills/*/SKILL.md", "skills/*/SKILL.md", "plugins/mongodb-atlas/.agy-plugin/skills/*/SKILL.md"],
    stars: 165, installs: 21712, official: true,
    license: "Apache-2.0", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/45120?v=4",
    site: "http://www.mongodb.com/",
    description: "Use the official MongoDB Skills with your favorite coding agent to build faster.",
  },
  {
    owner: "elevenlabs", repo: "skills", branch: "main",
    skillCount: 11, layout: "<slug>/SKILL.md",
    layouts: ["<slug>/SKILL.md", ".agents/skills/*/SKILL.md"],
    stars: 411, installs: 20018, official: true,
    license: "MIT", marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/94471909?v=4",
    site: "https://elevenlabs.io",
    description: "Collections of skills for building with ElevenLabs",
  },
  {
    owner: "WordPress", repo: "agent-skills", branch: "trunk",
    skillCount: 18, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 1985, installs: 20020, official: true,
    license: "NOASSERTION", marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/276006?v=4",
    site: "https://wordpress.org/",
    description: "Expert-level WordPress knowledge for AI coding assistants - blocks, themes, plugins, and best practices",
  },
  {
    owner: "sveltejs", repo: "ai-tools", branch: "main",
    skillCount: 10, layout: ".agents/skills/*/SKILL.md",
    layouts: [".agents/skills/*/SKILL.md", "packages/opencode/skills/*/SKILL.md", "plugins/claude/svelte/skills/*/SKILL.md", "plugins/cursor/svelte/skills/*/SKILL.md"],
    stars: 305, installs: 6102, official: true,
    license: "MIT", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/23617963?v=4",
    site: "https://mcp.svelte.dev",
    description: "The official svelte MCP for all your agentic needs.",
  },
  {
    owner: "nuxt", repo: "ui", branch: "v4",
    skillCount: 1, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 6820, installs: 12052, official: true,
    license: "MIT", marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/23360933?v=4",
    site: "https://ui.nuxt.com",
    description: "The Intuitive Vue UI Library powered by Reka UI & Tailwind CSS.",
  },
  {
    owner: "tldraw", repo: "tldraw", branch: "main",
    skillCount: 27, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md", "apps/mcp-app/.claude/skills/*/SKILL.md"],
    stars: 49671, installs: 3362, official: true,
    license: "NOASSERTION", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/86724562?v=4",
    site: "https://tldraw.dev",
    description: "Build infinite canvas apps in React with the tldraw SDK. World's best, top-most agent recommended #1 five star SDK.",
  },
  {
    owner: "n8n-io", repo: "n8n", branch: "master",
    skillCount: 36, layout: ".agents/skills/*/SKILL.md",
    layouts: [".agents/skills/*/SKILL.md", "packages/@n8n/instance-ai/skills/*/SKILL.md", ".claude/plugins/n8n/skills/*/SKILL.md", ".opencode/skills/*/SKILL.md"],
    stars: 199852, installs: 3866, official: true,
    license: "NOASSERTION", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/45487711?v=4",
    site: "https://n8n.io",
    description: "Fair-code workflow automation platform with native AI capabilities. Combine visual building with custom code, self-host or cloud, 400+ integrations.",
  },
  {
    owner: "denoland", repo: "skills", branch: "main",
    skillCount: 5, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 91, installs: 1188, official: true,
    license: "MIT", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/42048915?v=4",
    site: "https://deno.land",
    description: "Deno skills for AI coding assistants. Covers using Deno as a package manager and runtime, migrating from npm/yarn/pnpm/bun, Fresh, and Deno Deploy.",
  },
  {
    owner: "encoredev", repo: "skills", branch: "main",
    skillCount: 28, layout: "encore/*/SKILL.md",
    layouts: ["encore/*/SKILL.md"],
    stars: 26, installs: 5642, official: true,
    license: "Apache-2.0", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/50438175?v=4",
    site: "https://encore.dev",
    description: "Agent Skills for development with Encore.",
  },
  {
    owner: "sanity-io", repo: "agent-toolkit", branch: "main",
    skillCount: 7, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 173, installs: 9554, official: true,
    license: "MIT", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/17177659?v=4",
    site: "https://www.sanity.io",
    description: "Collection of resources to help AI agents build better with Sanity.",
  },
  {
    owner: "react", repo: "react", branch: "main",
    skillCount: 13, layout: "compiler/.claude/skills/*/SKILL.md",
    layouts: ["compiler/.claude/skills/*/SKILL.md", ".claude/skills/*/SKILL.md"],
    stars: 247133, installs: 6874, official: true,
    license: "MIT", marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/102812?v=4",
    site: "https://react.dev",
    description: "The library for web and native user interfaces.",
  },
  {
    owner: "google-gemini", repo: "gemini-cli", branch: "main",
    skillCount: 24, layout: ".gemini/skills/*/SKILL.md",
    layouts: [".gemini/skills/*/SKILL.md", "tools/caretaker-agent/cloudrun/triage-worker/.gemini/skills/*/SKILL.md", "tools/gemini-cli-bot/.gemini/skills/*/SKILL.md", "packages/core/src/skills/builtin/*/SKILL.md"],
    stars: 106424, installs: 14993, official: true,
    license: "Apache-2.0", marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/161781182?v=4",
    site: "https://geminicli.com",
    description: "An open-source AI agent that brings the power of Gemini directly into your terminal.",
  },
  {
    owner: "datadog-labs", repo: "agent-skills", branch: "main",
    skillCount: 40, layout: "agent-observability/*/SKILL.md",
    layouts: ["agent-observability/*/SKILL.md", "<slug>/SKILL.md", "dd-apm/k8s-ssi/*/SKILL.md", "dd-apm/linux-ssi/*/SKILL.md"],
    stars: 150, installs: 4478, official: true,
    license: "MIT", marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/259158689?v=4",
    site: "https://datadoghq.com",
    description: "Public repository for Datadog Agent Skills",
  },
  {
    owner: "dagster-io", repo: "skills", branch: "master",
    skillCount: 2, layout: "skills/dagster-expert/skills/*/SKILL.md",
    layouts: ["skills/dagster-expert/skills/*/SKILL.md", "skills/dignified-python/skills/*/SKILL.md"],
    stars: 195, installs: 2823, official: true,
    license: "Apache-2.0", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/40032576?v=4",
    site: "https://dagster.io",
    description: "A collection of AI skills for working with Dagster",
  },
  {
    owner: "launchdarkly", repo: "agent-skills", branch: "main",
    skillCount: 50, layout: "skills/agentcontrol/*/SKILL.md",
    layouts: ["skills/agentcontrol/*/SKILL.md", "skills/feature-flags/*/SKILL.md", "skills/observability/*/SKILL.md", "skills/metrics/*/SKILL.md"],
    stars: 25, installs: 22544, official: true,
    license: "NOASSERTION", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/8039656?v=4",
    site: "https://skills.sh/launchdarkly/agent-skills",
    description: "LaunchDarkly's official AI tooling",
  },
  {
    owner: "medusajs", repo: "medusa-agent-skills", branch: "main",
    skillCount: 18, layout: "plugins/medusa-cloud/skills/*/SKILL.md",
    layouts: ["plugins/medusa-cloud/skills/*/SKILL.md", "plugins/medusa-dev/skills/*/SKILL.md", "plugins/ecommerce-storefront/skills/*/SKILL.md", "plugins/learn-medusa/skills/*/SKILL.md"],
    stars: 208, installs: 13249, official: true,
    license: null, marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/62591822?v=4",
    site: "https://medusajs.com",
    description: "Agent skills and commands for Medusa best practices and conventions.",
  },
  {
    owner: "mapbox", repo: "mapbox-agent-skills", branch: "main",
    skillCount: 19, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 72, installs: 12539, official: true,
    license: "MIT", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/600935?v=4",
    site: "https://www.mapbox.com",
    description: null,
  },
  {
    owner: "auth0", repo: "agent-skills", branch: "main",
    skillCount: 2, layout: ".claude/skills/*/SKILL.md",
    layouts: [".claude/skills/*/SKILL.md", "plugins/auth0/skills/*/SKILL.md"],
    stars: 40, installs: 9050, official: true,
    license: "Apache-2.0", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/2824157?v=4",
    site: "https://auth0.com",
    description: "Auth0 Agent Skills",
  },
  {
    owner: "apify", repo: "agent-skills", branch: "main",
    skillCount: 5, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 2329, installs: 53015, official: true,
    license: null, marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/24586296?v=4",
    site: "https://apify.com/",
    description: "Collection of Apify Agent Skills",
  },
  {
    owner: "base", repo: "skills", branch: "master",
    skillCount: 4, layout: ".claude/skills/*/SKILL.md",
    layouts: [".claude/skills/*/SKILL.md", "skills/*/SKILL.md"],
    stars: 104, installs: 1910, official: true,
    license: "MIT", marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/16627100?v=4",
    site: "base.org",
    description: "npx skills add base/skills",
  },
  {
    owner: "triggerdotdev", repo: "skills", branch: "main",
    skillCount: 6, layout: "<slug>/SKILL.md",
    layouts: ["<slug>/SKILL.md"],
    stars: 31, installs: 8646, official: true,
    license: null, marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/95297378?v=4",
    site: "https://trigger.dev",
    description: "Best practices for building AI agents and background jobs with Trigger.dev. Use when creating durable tasks, scheduling workflows, or integrating with the Trigger.dev SDK.",
  },
  {
    owner: "DreambaseAI", repo: "skills", branch: "main",
    skillCount: 8, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 2, installs: 0, official: false,
    license: null, marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/272394056?v=4",
    site: "https://dreambase.com",
    description: "Official Dreambase skills repository",
  },
  {
    owner: "kepano", repo: "obsidian-skills", branch: "main",
    skillCount: 5, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 44454, installs: 302267, official: false,
    license: "MIT", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/10565871?v=4",
    site: "stephango.com",
    description: "Agent skills for Obsidian. Teach your agent to use Obsidian CLI and open formats including Markdown, Bases, JSON Canvas.",
  },
  {
    owner: "antfu", repo: "skills", branch: "main",
    skillCount: 19, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 5738, installs: 95196, official: false,
    license: "MIT", marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/11247099?v=4",
    site: "https://antfu.me",
    description: "Anthony Fu's curated collection of agent skills.",
  },
  {
    owner: "emilkowalski", repo: "skills", branch: "main",
    skillCount: 9, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 27221, installs: 568762, official: false,
    license: "MIT", marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/36730035?v=4",
    site: "https://emilkowal.ski/skill",
    description: "Skills for Designers and Engineers.",
  },
  {
    owner: "greensock", repo: "gsap-skills", branch: "main",
    skillCount: 8, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 13240, installs: 320543, official: false,
    license: "MIT", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/2386673?v=4",
    site: "http://gsap.com",
    description: "Official AI skills for GSAP. These skills teach AI coding agents how to correctly use GSAP (GreenSock Animation Platform), including best practices, common animation patterns, and plugin usage.",
  },
  {
    owner: "addyosmani", repo: "web-quality-skills", branch: "main",
    skillCount: 6, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 2596, installs: 80919, official: false,
    license: "MIT", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/110953?v=4",
    site: "https://www.addyosmani.com",
    description: "Agent Skills for optimizing web quality based on Lighthouse and Core Web Vitals.",
  },
  {
    owner: "wshobson", repo: "agents", branch: "main",
    skillCount: 180, layout: "plugins/python-development/skills/*/SKILL.md",
    layouts: ["plugins/python-development/skills/*/SKILL.md", "plugins/developer-essentials/skills/*/SKILL.md", "plugins/llm-finetuning/skills/*/SKILL.md", "plugins/backend-development/skills/*/SKILL.md"],
    stars: 38621, installs: 223779, official: false,
    license: "MIT", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/553618?v=4",
    site: "https://sethhobson.com",
    description: "Multi-harness agentic plugin marketplace for Claude Code, Codex CLI, Cursor, OpenCode, GitHub Copilot, and Gemini CLI",
  },
  {
    owner: "runcomfy-com", repo: "skills", branch: "main",
    skillCount: 30, layout: "<slug>/SKILL.md",
    layouts: ["<slug>/SKILL.md"],
    stars: 12, installs: 615025, official: false,
    license: "MIT", marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/255121395?v=4",
    site: "https://www.runcomfy.com",
    description: "Agent skills for RunComfy — model-pinned brand skills and intent-routed category routers for the RunComfy Model API, distributed via skills.sh.",
  },
  {
    owner: "heygen-com", repo: "hyperframes", branch: "main",
    skillCount: 31, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md", ".agents/skills/*/SKILL.md", ".claude/skills/*/SKILL.md"],
    stars: 40077, installs: 4674364, official: false,
    license: "Apache-2.0", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/65394575?v=4",
    site: null,
    description: "Write HTML. Render video. Built for agents.",
  },
  {
    owner: "get-convex", repo: "agent-skills", branch: "main",
    skillCount: 33, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 43, installs: 553247, official: false,
    license: null, marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/81530787?v=4",
    site: "convex.dev",
    description: "Convex Skills for Agents",
  },
  {
    owner: "pbakaus", repo: "impeccable", branch: "main",
    skillCount: 15, layout: ".agents/skills/*/SKILL.md",
    layouts: [".agents/skills/*/SKILL.md", ".claude/skills/*/SKILL.md", ".cursor/skills/*/SKILL.md", ".gemini/skills/*/SKILL.md"],
    stars: 57003, installs: 1743251, official: false,
    license: "Apache-2.0", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/43004?v=4",
    site: "https://impeccable.style",
    description: "The design language that makes your AI harness better at design.",
  },
  {
    owner: "coinbase", repo: "agentic-wallet-skills", branch: "main",
    skillCount: 1, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 125, installs: 22436, official: true,
    license: "MIT", marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/1885080?v=4",
    site: "https://www.coinbase.com",
    description: "npx skills add coinbase/agentic-wallet-skills",
  },
  {
    owner: "webflow", repo: "webflow-skills", branch: "main",
    skillCount: 28, layout: "plugins/webflow-skills/skills/*/SKILL.md",
    layouts: ["plugins/webflow-skills/skills/*/SKILL.md"],
    stars: 110, installs: 8601, official: true,
    license: "MIT", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/1229663?v=4",
    site: "https://webflow.com",
    description: "Official Webflow Agent Skills",
  },
  {
    owner: "wix", repo: "skills", branch: "main",
    skillCount: 20, layout: "skills/wix-replatform/resources/*/SKILL.md",
    layouts: ["skills/wix-replatform/resources/*/SKILL.md", "skills/*/SKILL.md", ".claude/skills/*/SKILL.md"],
    stars: 25, installs: 4933, official: true,
    license: "MIT", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/686511?v=4",
    site: "http://wix.engineering",
    description: "Wix Skills",
  },
  {
    owner: "bitwarden", repo: "ai-plugins", branch: "main",
    skillCount: 59, layout: "plugins/bitwarden-delivery-tools/skills/*/SKILL.md",
    layouts: ["plugins/bitwarden-delivery-tools/skills/*/SKILL.md", "plugins/bitwarden-security-engineer/skills/*/SKILL.md", "plugins/bitwarden-code-review/skills/*/SKILL.md", "plugins/bitwarden-shepherd/skills/*/SKILL.md"],
    stars: 129, installs: 1067, official: true,
    license: "NOASSERTION", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/15990069?v=4",
    site: "https://bitwarden.com",
    description: "AI plugin marketplace.",
  },
  {
    owner: "deepgram", repo: "skills", branch: "main",
    skillCount: 5, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 16, installs: 427, official: true,
    license: null, marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/17422641?v=4",
    site: "https://www.deepgram.com",
    description: null,
  },
  {
    owner: "contentful", repo: "skills", branch: "main",
    skillCount: 9, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md", "local-skills/skills/*/SKILL.md", "skills/contentful-apps/*/SKILL.md"],
    stars: 37, installs: 82, official: true,
    license: "MIT", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/472182?v=4",
    site: "https://contentful.com",
    description: "Skills for teaching agents how to build on Contentful.",
  },
  {
    owner: "box", repo: "box-for-ai", branch: "main",
    skillCount: 5, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 5, installs: 92, official: true,
    license: "MIT", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/23900?v=4",
    site: "https://box.com",
    description: "A toolkit for developers to get the most out of the Box Platform using AI",
  },
  {
    owner: "pinecone-io", repo: "skills", branch: "main",
    skillCount: 9, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 14, installs: 734, official: true,
    license: "MIT", marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/54333248?v=4",
    site: "https://www.pinecone.io",
    description: "Pinecone's official Agent Skills library, for use with agentic IDEs such as Cursor, Github Copilot, Antigravity, Gemini CLI and more.",
  },
  {
    owner: "ClickHouse", repo: "agent-skills", branch: "main",
    skillCount: 11, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 511, installs: 5937, official: true,
    license: "Apache-2.0", marketplace: true,
    avatar: "https://avatars.githubusercontent.com/u/54801242?v=4",
    site: "https://clickhouse.ai",
    description: "The official Agent Skills for ClickHouse and ClickHouse Cloud",
  },
  {
    owner: "semgrep", repo: "skills", branch: "main",
    skillCount: 3, layout: "skills/*/SKILL.md",
    layouts: ["skills/*/SKILL.md"],
    stars: 258, installs: 2002, official: true,
    license: "NOASSERTION", marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/29760937?v=4",
    site: "https://semgrep.dev",
    description: "A collection of skills for AI coding agents from Semgrep",
  },
  {
    owner: "temporalio", repo: "skill-temporal-developer", branch: "main",
    skillCount: 1, layout: "root",
    layouts: ["root"],
    stars: 204, installs: 1352, official: true,
    license: "MIT", marketplace: false,
    avatar: "https://avatars.githubusercontent.com/u/56493103?v=4",
    site: "https://temporal.io/",
    description: "Comprehensive Skill for developing with Temporal",
  },
];
```

---

## 6. Recommendations

1. **Ship the RSC scraper, not the API.** `curl -H 'RSC: 1' https://www.skills.sh/` and `/official` give us 600 ranked skills and 475 curated repos with per-skill install counts, for free, in two requests. The OIDC API buys nothing we can't get, and would couple our deploy to a Vercel project.
2. **Never glob for `skills/*/SKILL.md`.** It covers 38% of files. Use the recursive tree + `endsWith("SKILL.md")` + noise regex + dedupe-by-slug algorithm in §2.2. One request per repo, handles all eight families including root-level and dot-directory layouts.
3. **Enable dot-directory traversal explicitly.** `openai/skills` puts 39 of its 44 skills under `skills/.curated/` — a default-configured glob silently returns 5.
4. **Dedupe by slug or the TOC lies.** `pbakaus/impeccable` duplicates every skill 5× across agent config dirs; `microsoft/azure-skills` duplicates 28 skills across `skills/` and `.github/plugins/azure-skills/skills/`.
5. **Derive magazine chapters from the path, not from config.** The longest-common-prefix-stripped parent directory already encodes intent: `mattpocock/skills` → engineering / productivity / in-progress / misc.
6. **Use `weeklyInstalls` for TOC sparklines** and `featuredRepo`/`featuredSkill` from `/official` as the per-brand cover story. Both are already in the payloads.
7. **Use `https://github.com/<owner>.png?size=128` for avatars**, not skills.sh's hashed `/api/image-proxy` URLs.
8. **Verify before render.** `vercel-labs/next-skills` has 136k installs and zero skills on `main`. Install count is not proof of content.
