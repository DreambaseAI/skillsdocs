/**
 * Attribution: which book does a credited skill actually come from?
 *
 * Two tiers, in order of trust:
 *
 *   1. **The repo's own `skills-lock.json`** (see `skills-lock.ts`) — the
 *      skills CLI records the exact source repository at install time. No
 *      guessing.
 *   2. **A skills.sh name match, verified.** The leaderboard and owners
 *      payloads map skill names to publishing repos. A name alone is not an
 *      attribution — facebook/react ships internal skills named `fix` and
 *      `test`, and pinning those on whichever repo happens to publish a
 *      same-named skill would be a lie with an avatar on it. So a candidate
 *      only survives if its own book (the same cached `getBook` the reader
 *      uses) contains an *authored* skill with that name whose description
 *      agrees with the installed copy's.
 *
 * Either way the winning origin's book supplies everything the UI needs —
 * the owner avatar, the origin's issue accents, and the chapter slug for a
 * deep link — so a credit is only ever rendered for a book we can actually
 * open.
 */

import { cacheLife, cacheTag } from "next/cache";
import { getBook } from "./book";
import {
  fetchLeaderboard,
  fetchOfficialOwners,
  type SkillsShOwner,
  type SkillsShSkill,
} from "./skills-sh";

/** A verified origin for one credited skill. */
export interface SkillCredit {
  owner: string;
  repo: string;
  /** `owner/repo`, as the origin book resolves it (renames followed). */
  fullName: string;
  avatar: string | null;
  /** The origin issue's proven accent pair, for the row tint. */
  accentLight: string;
  accentDark: string;
}

/* ---------------------------------------------------------- pure helpers */

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Do two descriptions describe the same skill?
 *
 * Installed copies are verbatim, so equality is the common case; the prefix
 * rule absorbs an origin that extended its description after the install.
 * Two empty descriptions agree on nothing and verify nothing.
 */
export function descriptionsAgree(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  return short.length >= 40 && long.startsWith(short);
}

/**
 * Repos that publish a skill with this name, best-installed first.
 *
 * Pure over the two skills.sh payloads so it can be tested without a scrape.
 */
export function skillSourceCandidates(
  name: string,
  skills: SkillsShSkill[],
  owners: SkillsShOwner[],
): string[] {
  const wanted = name.toLowerCase();
  const installsBySource = new Map<string, number>();

  const record = (source: string, installs: number) => {
    const key = source.toLowerCase();
    installsBySource.set(key, Math.max(installsBySource.get(key) ?? 0, installs));
  };

  for (const s of skills) {
    if (s.name.toLowerCase() === wanted || s.skillId.toLowerCase() === wanted) {
      record(s.source, s.installs);
    }
  }
  for (const o of owners) {
    for (const r of o.repos) {
      for (const s of r.skills) {
        if (s.name.toLowerCase() === wanted) record(r.repo, s.installs);
      }
    }
  }

  return [...installsBySource.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([source]) => source);
}

/* ------------------------------------------------------------- resolution */

/** How many name-match candidates are worth a book fetch each. */
const MAX_CANDIDATES = 2;

/**
 * Resolve one credited skill to its origin book, or null.
 *
 * Arguments are primitives on purpose — this is a `use cache` boundary.
 * `lockSource` (from the repo's committed `skills-lock.json`) short-circuits
 * the candidate search; without it, skills.sh candidates each get one cached
 * book fetch and must pass the description check. The book the skill sits
 * *in* is never its own origin.
 */
export async function resolveSkillCredit(
  bookFullName: string,
  skillName: string,
  description: string,
  lockSource: string | null,
): Promise<SkillCredit | null> {
  "use cache";
  cacheLife("repo");
  cacheTag("credit");

  const wanted = skillName.toLowerCase();
  const self = bookFullName.toLowerCase();

  const candidates = lockSource
    ? [lockSource]
    : skillSourceCandidates(
        skillName,
        await fetchLeaderboard().catch(() => []),
        await fetchOfficialOwners().catch(() => []),
      ).slice(0, MAX_CANDIDATES);

  for (const candidate of candidates) {
    if (candidate.toLowerCase() === self) continue;
    const [owner, repo] = candidate.split("/");
    if (!owner || !repo) continue;

    let book;
    try {
      book = await getBook(owner, repo);
    } catch {
      continue;
    }
    if (book.repo.fullName.toLowerCase() === self) continue;

    const skill = book.skills.find(
      (s) => s.name.toLowerCase() === wanted && s.origin === "authored",
    );
    if (!skill) continue;
    // The lock file *is* the provenance; a name match still has to prove it.
    if (!lockSource && !descriptionsAgree(description, skill.description)) {
      continue;
    }

    return {
      owner: book.repo.owner,
      repo: book.repo.repo,
      fullName: book.repo.fullName,
      avatar: book.repo.ownerAvatar || null,
      accentLight: book.theme.accentLight,
      accentDark: book.theme.accentDark,
    };
  }

  return null;
}
