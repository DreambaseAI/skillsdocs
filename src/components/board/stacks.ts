"use client";

/**
 * Grouping bookmark keys into board stacks: one stack per repo, in first-seen
 * order, each repo's internal order preserved. Shared by the board page and
 * the homepage strip so the two always agree on what a stack is.
 */

export interface Stack {
  owner: string;
  repo: string;
  /** Lower-cased `owner/repo` — the stack's identity in ordering. */
  repoKey: string;
  /** This repo's pinned slugs, in key order; `[0]` is the top page. */
  slugs: string[];
}

export function stacksOf(keys: readonly string[]): Stack[] {
  const map = new Map<string, Stack>();
  for (const key of keys) {
    const [owner, repo, slug] = key.split("/");
    if (!owner || !repo || !slug) continue;
    const repoKey = `${owner}/${repo}`.toLowerCase();
    let stack = map.get(repoKey);
    if (!stack) {
      stack = { owner, repo, repoKey, slugs: [] };
      map.set(repoKey, stack);
    }
    stack.slugs.push(slug);
  }
  return [...map.values()];
}

export function keysOf(stacks: readonly Stack[]): string[] {
  return stacks.flatMap((s) =>
    s.slugs.map((slug) => `${s.owner}/${s.repo}/${slug}`),
  );
}
