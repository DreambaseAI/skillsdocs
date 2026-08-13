/**
 * `skills-lock.json` — the skills CLI's committed provenance record.
 *
 * `npx skills add owner/repo` writes a project-scoped lock file at the repo
 * root ("meant to be checked into version control", per the CLI source:
 * vercel-labs/skills `src/local-lock.ts`), mapping each installed skill name
 * to `{ source, sourceType, skillPath, ref }`. When a repository commits it,
 * a credited skill's origin stops being a guess: the lock names the exact
 * repository it was installed from.
 *
 * Kept import-free of `book.ts` so the book builder can parse locks without
 * a cycle — the attribution resolver imports both.
 */

/** Where one installed skill came from, per the lock file. */
export interface LockedSkillSource {
  /** `owner/repo` on GitHub. */
  source: string;
  /** Path of the skill's SKILL.md within the source repo, when recorded. */
  skillPath: string | null;
}

/** `owner/repo` and nothing else — the only source shape we can link to. */
const GITHUB_SOURCE = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

/**
 * Parse one `skills-lock.json`, keeping only entries that point at GitHub.
 *
 * Keys are lowercased skill names. Malformed JSON (including files with merge
 * conflict markers, which the CLI itself tolerates) yields an empty map
 * rather than an error — a broken lock must not cost anyone a book.
 */
export function parseSkillsLock(text: string): Map<string, LockedSkillSource> {
  const out = new Map<string, LockedSkillSource>();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return out;
  }
  if (typeof parsed !== "object" || parsed === null) return out;

  const skills = (parsed as { skills?: unknown }).skills;
  if (typeof skills !== "object" || skills === null) return out;

  for (const [name, entry] of Object.entries(skills as Record<string, unknown>)) {
    if (typeof entry !== "object" || entry === null) continue;
    const { source, sourceType, skillPath } = entry as {
      source?: unknown;
      sourceType?: unknown;
      skillPath?: unknown;
    };
    if (typeof source !== "string" || !GITHUB_SOURCE.test(source)) continue;
    // "github" is what the CLI writes for repo installs; "local" and
    // "node_modules" sources have no book to link to.
    if (sourceType !== undefined && sourceType !== "github") continue;
    out.set(name.toLowerCase(), {
      source,
      skillPath: typeof skillPath === "string" ? skillPath : null,
    });
  }

  return out;
}

/**
 * Fold several lock files (a monorepo can hold one per package) into one
 * name → source record, later files winning ties. Plain object, not a Map,
 * because it rides on the cached `Book` and must serialize.
 */
export function mergeSkillsLocks(
  texts: Array<string | null>,
): Record<string, LockedSkillSource> {
  const merged: Record<string, LockedSkillSource> = {};
  for (const text of texts) {
    if (text === null) continue;
    for (const [name, entry] of parseSkillsLock(text)) merged[name] = entry;
  }
  return merged;
}
