/**
 * The shared-shelf contract: `?repos=` is one or more `owner/repo` keys,
 * comma-joined. Parsed identically by the `/share` page and its OG image
 * route, so the card can never show a different shelf than the page.
 */

import { isValidOwner, isValidRepo } from "@/lib/site";

export interface SharedRepo {
  owner: string;
  repo: string;
}

/** Ceiling on how many books one link may name; beyond it is abuse, not a shelf. */
export const MAX_SHARED_BOOKS = 60;

/**
 * Parse the `repos` parameter: comma-joined `owner/repo` keys, deduplicated,
 * validated against GitHub's own naming rules, capped.
 */
export function parseShareRepos(
  raw: string | string[] | undefined,
): SharedRepo[] {
  const joined = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  const seen = new Set<string>();
  const rows: SharedRepo[] = [];

  for (const entry of joined.split(",")) {
    const [owner, repo, ...rest] = entry.trim().split("/").filter(Boolean);
    if (!owner || !repo || rest.length > 0) continue;
    if (!isValidOwner(owner) || !isValidRepo(repo)) continue;
    const key = `${owner}/${repo}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ owner, repo });
    if (rows.length >= MAX_SHARED_BOOKS) break;
  }

  return rows;
}
