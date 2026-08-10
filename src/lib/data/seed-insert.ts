/**
 * Where a generated `SeedRepo` literal goes in `seed-repos.ts`.
 *
 * Extracted from `scripts/sync-seeds.mts` because it shipped broken: the
 * script took the *last* `\n];` in the file, which is the end of `SHOWCASE`,
 * not `SEED_REPOS`. `--write` therefore appended object literals into a
 * `readonly string[]` and produced 51 type errors. The report-only default had
 * never exercised the write path, so nothing caught it.
 */

const DECL = "export const SEED_REPOS: SeedRepo[] = [";

/**
 * Index of the newline that begins the line closing `SEED_REPOS`.
 * Returns -1 when the declaration or its terminator cannot be found.
 */
export function seedArrayCloseIndex(source: string): number {
  const declAt = source.indexOf(DECL);
  if (declAt === -1) return -1;
  // The first `\n];` after the declaration closes that array and no other.
  return source.indexOf("\n];", declAt);
}

export function insertSeedEntries(source: string, literal: string): string {
  const close = seedArrayCloseIndex(source);
  if (close === -1) {
    throw new Error("Could not locate the end of SEED_REPOS");
  }
  return `${source.slice(0, close)}\n${literal}${source.slice(close)}`;
}
