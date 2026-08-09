/**
 * skills.sh install data, scraped from the site's React Flight payloads.
 *
 * There is no public API: `skills.sh/api/v1/*` is gated behind a Vercel OIDC
 * token. But skills.sh is a Next.js App Router app, so sending `RSC: 1` to any
 * route returns the raw Flight payload (`text/x-component`) with no auth, and
 * the leaderboard data sits inside it as plain JSON.
 *
 *   GET /          -> "initialSkills":[...]   600 skills / 91 sources / ~137 KB
 *   GET /official  -> "owners":[...]          98 owners / 475 repos / ~310 KB
 *
 * The payload is NOT a single JSON document — it is a stream of numbered rows
 * with embedded JSON — so the arrays are located by key and extracted with a
 * balanced-bracket scan rather than `JSON.parse` on the whole body.
 *
 * These are undocumented internals. Every parse is wrapped and falls back to
 * `data/skills-sh-snapshot.json`, a committed last-good scrape refreshed by
 * `scripts/sync-skills-sh.mts`. A shape change must degrade install counts to
 * stale, never break a page.
 */

import { cacheLife, cacheTag } from "next/cache";
import snapshot from "./data/skills-sh-snapshot.json";

const HOME_URL = "https://www.skills.sh/";
const OFFICIAL_URL = "https://www.skills.sh/official";
const TIMEOUT_MS = 8000;
/** The observed payloads are 137 KB and 310 KB; 8 MB is a runaway guard. */
const MAX_BYTES = 8 * 1024 * 1024;

/* ------------------------------------------------------------------ types */

export interface SkillsShSkill {
  /** `owner/repo`, already filtered to real GitHub sources. */
  source: string;
  skillId: string;
  name: string;
  installs: number;
  /** Eight buckets, oldest to newest. `[]` when the field is absent. */
  weeklyInstalls: number[];
  isOfficial?: boolean;
}

export interface SkillsShOwner {
  owner: string;
  totalInstalls: number;
  featuredRepo: string | null;
  featuredSkill: string | null;
  repos: Array<{
    repo: string;
    totalInstalls: number;
    skills: Array<{ name: string; installs: number }>;
  }>;
}

/** skills.sh signal, merged onto a book when available. */
export interface RepoSignal {
  installs: number;
  weeklyInstalls: number[];
  official: boolean;
  featuredSkill: string | null;
  perSkillInstalls: Record<string, number>;
}

export interface SkillsShSnapshot {
  generatedAt: string;
  skills: SkillsShSkill[];
  owners: SkillsShOwner[];
}

const SNAPSHOT = snapshot as SkillsShSnapshot;

/* --------------------------------------------------------------- extraction */

/**
 * Extract the JSON array that follows `"<key>":` in `text`.
 *
 * Scans for balanced brackets while tracking string state, because the Flight
 * payload contains `[`/`]` inside quoted strings (and escaped quotes inside
 * those). Returns null rather than throwing on any malformed input.
 */
export function extractJsonArray(text: string, key: string): unknown[] | null {
  const marker = `"${key}":`;
  let from = 0;

  // The key can appear more than once (e.g. inside a prop-types blob); take
  // the first occurrence that actually parses.
  for (;;) {
    const at = text.indexOf(marker, from);
    if (at === -1) return null;

    const start = at + marker.length;
    if (text[start] !== "[") {
      from = at + marker.length;
      continue;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;

    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }

    if (end !== -1) {
      try {
        const parsed: unknown = JSON.parse(text.slice(start, end));
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Fall through and try the next occurrence of the key.
      }
    }
    from = at + marker.length;
  }
}

/**
 * Keep only sources that name a real GitHub repo.
 *
 * skills.sh lists bare domains (`open.feishu.cn`, `agent.qq.com`, `uizze.com`)
 * alongside `owner/repo`. A dot in the owner segment is the discriminator —
 * GitHub logins cannot contain one, but `larksuite/cli` must survive.
 */
const GITHUB_SOURCE = /^[\w.-]+\/[\w.-]+$/;

export function isGitHubSource(source: string): boolean {
  if (!GITHUB_SOURCE.test(source)) return false;
  const owner = source.slice(0, source.indexOf("/"));
  return !owner.includes(".");
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Coerce the `initialSkills` array. Rows that do not fit the shape are dropped. */
export function parseSkillsPayload(text: string): SkillsShSkill[] {
  const rows = extractJsonArray(text, "initialSkills");
  if (!rows) return [];

  const out: SkillsShSkill[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    const source = str(r.source);
    const skillId = str(r.skillId) ?? str(r.name);
    if (!source || !skillId || !isGitHubSource(source)) continue;

    const weekly = Array.isArray(r.weeklyInstalls)
      ? r.weeklyInstalls.filter((n): n is number => typeof n === "number")
      : [];

    out.push({
      source,
      skillId,
      name: str(r.name) ?? skillId,
      installs: num(r.installs),
      weeklyInstalls: weekly,
      ...(r.isOfficial === true ? { isOfficial: true as const } : {}),
    });
  }
  return out;
}

/** Coerce the `/official` `owners` array. */
export function parseOwnersPayload(text: string): SkillsShOwner[] {
  const rows = extractJsonArray(text, "owners");
  if (!rows) return [];

  const out: SkillsShOwner[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    const owner = str(r.owner);
    if (!owner || owner.includes(".")) continue;

    const repos: SkillsShOwner["repos"] = [];
    if (Array.isArray(r.repos)) {
      for (const repoRow of r.repos) {
        if (typeof repoRow !== "object" || repoRow === null) continue;
        const rr = repoRow as Record<string, unknown>;
        const repo = str(rr.repo);
        if (!repo || !isGitHubSource(repo)) continue;
        const skills: Array<{ name: string; installs: number }> = [];
        if (Array.isArray(rr.skills)) {
          for (const s of rr.skills) {
            if (typeof s !== "object" || s === null) continue;
            const sr = s as Record<string, unknown>;
            const name = str(sr.name);
            if (name) skills.push({ name, installs: num(sr.installs) });
          }
        }
        repos.push({ repo, totalInstalls: num(rr.totalInstalls), skills });
      }
    }

    out.push({
      owner,
      totalInstalls: num(r.totalInstalls),
      featuredRepo: str(r.featuredRepo),
      featuredSkill: str(r.featuredSkill),
      repos,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ network */

async function fetchFlight(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        // The one header that matters: it asks the App Router for the Flight
        // payload instead of the HTML document.
        RSC: "1",
        "User-Agent": "github-skills-book",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = await res.text();
    return body.length > MAX_BYTES ? null : body;
  } catch {
    return null;
  }
}

/**
 * Live scrape, no caching layer. Exported so `scripts/sync-skills-sh.mts` can
 * refresh the snapshot without a Next.js runtime.
 */
export async function scrapeLeaderboard(): Promise<SkillsShSkill[]> {
  try {
    const body = await fetchFlight(HOME_URL);
    return body ? parseSkillsPayload(body) : [];
  } catch {
    return [];
  }
}

export async function scrapeOfficialOwners(): Promise<SkillsShOwner[]> {
  try {
    const body = await fetchFlight(OFFICIAL_URL);
    return body ? parseOwnersPayload(body) : [];
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------- cached API */

/**
 * How much of the committed snapshot a live scrape has to reproduce before we
 * believe it.
 *
 * `live.length > 0` was too weak a test. A partial shape change that still
 * parsed three rows out of 569 would have silently replaced the whole
 * leaderboard, and the site would have looked like it had lost 99% of its
 * corpus with nothing in the logs. A scrape that small is a parser failure, not
 * a smaller leaderboard.
 */
const LIVE_FLOOR = 0.5;

export function preferLive<T>(live: T[], snapshot: T[]): T[] {
  if (live.length === 0) return snapshot;
  return live.length >= Math.floor(snapshot.length * LIVE_FLOOR) ? live : snapshot;
}

export async function fetchLeaderboard(): Promise<SkillsShSkill[]> {
  "use cache";
  cacheLife("leaderboard");
  cacheTag("skills-sh", "leaderboard");

  // An empty or implausibly small result means the shape moved or the site is
  // down. Either way the committed snapshot is strictly better.
  return preferLive(await scrapeLeaderboard(), SNAPSHOT.skills);
}

export async function fetchOfficialOwners(): Promise<SkillsShOwner[]> {
  "use cache";
  cacheLife("leaderboard");
  cacheTag("skills-sh", "leaderboard");

  return preferLive(await scrapeOfficialOwners(), SNAPSHOT.owners);
}

/** The last-good committed scrape. Never hits the network. */
export function snapshotLeaderboard(): SkillsShSkill[] {
  return SNAPSHOT.skills;
}

export function snapshotOwners(): SkillsShOwner[] {
  return SNAPSHOT.owners;
}

export function snapshotGeneratedAt(): string {
  return SNAPSHOT.generatedAt;
}

/* ---------------------------------------------------------------- assembly */

/**
 * Fold the two payloads into one signal for a single repo.
 *
 * Pure, so it can be unit-tested and reused by `featured.ts` without a second
 * scrape. Both inputs may be stale snapshots; neither may be null.
 */
export function buildRepoSignal(
  owner: string,
  repo: string,
  skills: SkillsShSkill[],
  owners: SkillsShOwner[],
): RepoSignal | null {
  const full = `${owner}/${repo}`.toLowerCase();

  const rows = skills.filter((s) => s.source.toLowerCase() === full);
  const ownerRow = owners.find((o) => o.owner.toLowerCase() === owner.toLowerCase());
  const repoRow = ownerRow?.repos.find((r) => r.repo.toLowerCase() === full);

  if (rows.length === 0 && !repoRow) return null;

  const perSkillInstalls: Record<string, number> = {};
  for (const s of repoRow?.skills ?? []) perSkillInstalls[s.name] = s.installs;
  // The homepage leaderboard is fresher than /official for ranked skills.
  for (const s of rows) perSkillInstalls[s.skillId] = s.installs;

  // `weeklyInstalls` only exists on the homepage payload, per skill. Sum the
  // repo's ranked skills element-wise to get a repo-level 8-week sparkline.
  const weeklyInstalls: number[] = [];
  for (const s of rows) {
    s.weeklyInstalls.forEach((n, i) => {
      weeklyInstalls[i] = (weeklyInstalls[i] ?? 0) + n;
    });
  }

  const leaderboardTotal = rows.reduce((n, s) => n + s.installs, 0);

  return {
    // /official carries the whole repo; the homepage carries only the top 600
    // skills. Take the larger — neither is a superset of the other.
    installs: Math.max(leaderboardTotal, repoRow?.totalInstalls ?? 0),
    weeklyInstalls,
    official: Boolean(repoRow) || rows.some((s) => s.isOfficial),
    featuredSkill:
      ownerRow?.featuredRepo?.toLowerCase() === full
        ? ownerRow.featuredSkill
        : null,
    perSkillInstalls,
  };
}

export async function getRepoSignal(
  owner: string,
  repo: string,
): Promise<RepoSignal | null> {
  "use cache";
  cacheLife("leaderboard");
  cacheTag("skills-sh", `signal:${owner}/${repo}`);

  const [skills, owners] = await Promise.all([
    fetchLeaderboard(),
    fetchOfficialOwners(),
  ]);
  return buildRepoSignal(owner, repo, skills, owners);
}
