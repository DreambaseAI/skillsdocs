/**
 * The featured-books list: the verified seed catalog merged with live
 * skills.sh install data.
 *
 * HARD CONTRACT: this module never returns an empty array. `SEED_REPOS` is a
 * static import, so `getFeaturedBooks()` degrades to 89 books with stale
 * install counts when skills.sh is unreachable, and `showcaseParams()` is
 * synchronous and network-free. `generateStaticParams` returning `[]` is a
 * build error in Next 16, so an empty result here would break the build, not
 * just the home page.
 */

import { cacheLife, cacheTag } from "next/cache";
import {
  SEED_REPOS,
  SHOWCASE,
  seedFor,
  type SeedRepo,
} from "./data/seed-repos";
import {
  buildRepoSignal,
  fetchLeaderboard,
  fetchOfficialOwners,
  snapshotLeaderboard,
  snapshotOwners,
  type SkillsShOwner,
  type SkillsShSkill,
} from "./skills-sh";

export interface FeaturedBook extends SeedRepo {
  /** Live install count when available, otherwise the seeded one. */
  installs: number;
  /** 8-week sparkline, oldest to newest. Empty when unranked. */
  weeklyInstalls: number[];
  /** skills.sh editor's pick for this repo — our cover story. */
  featuredSkill: string | null;
  /** True when the numbers came from a live scrape rather than the snapshot. */
  live: boolean;
}

function merge(
  seeds: readonly SeedRepo[],
  skills: SkillsShSkill[],
  owners: SkillsShOwner[],
  live: boolean,
): FeaturedBook[] {
  return seeds
    .map((seed) => {
      const signal = buildRepoSignal(seed.owner, seed.repo, skills, owners);
      return {
        ...seed,
        installs: Math.max(seed.installs, signal?.installs ?? 0),
        weeklyInstalls: signal?.weeklyInstalls ?? [],
        featuredSkill: signal?.featuredSkill ?? null,
        official: seed.official || Boolean(signal?.official),
        live,
      };
    })
    .sort((a, b) => b.installs - a.installs);
}

/**
 * Every seeded book, ordered by installs, with live signal folded in.
 *
 * Only seeded repos appear. skills.sh ranks sources we have not verified —
 * `vercel-labs/next-skills` has 136k installs and zero SKILL.md on its default
 * branch — and install count is not evidence of content.
 */
export async function getFeaturedBooks(): Promise<FeaturedBook[]> {
  "use cache";
  cacheLife("leaderboard");
  cacheTag("featured", "skills-sh");

  try {
    const [skills, owners] = await Promise.all([
      fetchLeaderboard(),
      fetchOfficialOwners(),
    ]);
    const merged = merge(SEED_REPOS, skills, owners, true);
    if (merged.length > 0) return merged;
  } catch {
    // Fall through to the snapshot.
  }
  return merge(SEED_REPOS, snapshotLeaderboard(), snapshotOwners(), false);
}

/** The top `n` featured books. Never empty for n >= 1. */
export async function getTopFeatured(n = 12): Promise<FeaturedBook[]> {
  const all = await getFeaturedBooks();
  return all.slice(0, Math.max(1, n));
}

/**
 * The params `generateStaticParams` prerenders.
 *
 * Synchronous and network-free on purpose: the build must not be able to fail
 * because skills.sh timed out. `dynamicParams: true` covers everything else.
 */
export function showcaseParams(): Array<{ owner: string; repo: string }> {
  const params = SHOWCASE.map((full) => {
    const [owner, repo] = full.split("/");
    return { owner, repo };
  }).filter((p) => p.owner && p.repo && seedFor(p.owner, p.repo));

  // Belt and braces: SHOWCASE is a hand-written list of keys into SEED_REPOS,
  // and a typo there must not produce the one value Next 16 rejects.
  return params.length > 0
    ? params
    : [{ owner: SEED_REPOS[0].owner, repo: SEED_REPOS[0].repo }];
}

/** Every seeded book as `{ owner, repo }`, for the sitemap. */
export function allSeedParams(): Array<{ owner: string; repo: string }> {
  return SEED_REPOS.map((s) => ({ owner: s.owner, repo: s.repo }));
}

export { SEED_REPOS, seedFor, type SeedRepo };
