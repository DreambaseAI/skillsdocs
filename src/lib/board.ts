/**
 * The skill board's contract: `?skills=` is one or more `owner/repo/slug`
 * keys, comma-joined — the same shape the bookmarks list stores. Order is
 * meaning: it is the order of the pinned pages, and dragging a stack writes a
 * new order back into the URL.
 */

import { isValidOwner, isValidRepo } from "@/lib/site";

export interface BoardSkill {
  owner: string;
  repo: string;
  slug: string;
}

/** Ceiling on how many skills one link may pin; beyond it is abuse, not a board. */
export const MAX_BOARD_SKILLS = 100;

/** A slug is a URL segment: anything printable that is not a slash. */
const SLUG_RE = /^[^/\s]{1,200}$/;

/**
 * Parse the `skills` parameter: comma-joined `owner/repo/slug` keys,
 * deduplicated case-insensitively, validated, capped, order preserved.
 */
export function parseBoardSkills(
  raw: string | string[] | undefined,
): BoardSkill[] {
  const joined = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  const seen = new Set<string>();
  const rows: BoardSkill[] = [];

  for (const entry of joined.split(",")) {
    const [owner, repo, slug, ...rest] = entry.trim().split("/").filter(Boolean);
    if (!owner || !repo || !slug || rest.length > 0) continue;
    if (!isValidOwner(owner) || !isValidRepo(repo) || !SLUG_RE.test(slug)) continue;
    const key = `${owner}/${repo}/${slug}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ owner, repo, slug });
    if (rows.length >= MAX_BOARD_SKILLS) break;
  }

  return rows;
}
