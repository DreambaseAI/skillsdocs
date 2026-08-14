"use client";

/**
 * The board's data: bookmark keys only store `owner/repo/slug`, so titles,
 * deks, minutes and issue numbers come from the site's own public book JSON —
 * one fetch per distinct repo, cached at module level so the homepage strip
 * and the board page share results within a session, and CDN-cached above
 * that. A repo that fails to load still gets a card; it just wears its slug.
 */

import { useEffect, useState } from "react";
import { dekOf } from "@/lib/deck";
import { paths } from "@/lib/site";

export interface BoardSkillMeta {
  title: string;
  dek: string | null;
  minutes: number;
  /** 1-based position in the book — the "CH 07" on the sheet. */
  position: number;
}

export interface BoardBook {
  issueNumber: number;
  /** By lower-cased slug. */
  skills: Record<string, BoardSkillMeta>;
}

/** `owner/repo` (lower-cased) → in-flight or settled lookup. */
const cache = new Map<string, Promise<BoardBook | null>>();

interface ApiChapter {
  slug: string;
  title: string;
  description: string | null;
  readingMinutes: number;
  position: number;
}

function load(owner: string, repo: string): Promise<BoardBook | null> {
  const key = `${owner}/${repo}`.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;

  const promise = fetch(paths.bookJson(owner, repo))
    .then((res) => (res.ok ? res.json() : null))
    .then((json: { issueNumber?: number; chapters?: ApiChapter[] } | null) => {
      if (!json || !Array.isArray(json.chapters)) return null;
      return {
        issueNumber: json.issueNumber ?? 0,
        skills: Object.fromEntries(
          json.chapters.map((c) => [
            c.slug.toLowerCase(),
            {
              title: c.title,
              dek: c.description ? dekOf(c.description, 90) : null,
              minutes: c.readingMinutes,
              position: c.position,
            },
          ]),
        ),
      };
    })
    .catch(() => null);

  cache.set(key, promise);
  return promise;
}

/**
 * Resolve book data for a set of `owner/repo` keys. An absent entry is still
 * loading; `null` is a repo that could not be loaded.
 */
export function useBoardBooks(
  repoKeys: readonly string[],
): Record<string, BoardBook | null> {
  const [books, setBooks] = useState<Record<string, BoardBook | null>>({});
  const signature = repoKeys.join(",");

  useEffect(() => {
    let alive = true;
    for (const repoKey of signature.split(",").filter(Boolean)) {
      const [owner, repo] = repoKey.split("/");
      load(owner, repo).then((book) => {
        if (!alive) return;
        setBooks((prev) =>
          repoKey.toLowerCase() in prev
            ? prev
            : { ...prev, [repoKey.toLowerCase()]: book },
        );
      });
    }
    return () => {
      alive = false;
    };
  }, [signature]);

  return books;
}
