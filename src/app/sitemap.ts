/**
 * `/sitemap.xml`
 *
 * Every seeded book plus its Markdown twin, and — for the showcase set only —
 * every chapter.
 *
 * The chapter expansion is deliberately capped. Building a book costs two
 * GitHub API calls, and unauthenticated GitHub allows sixty an hour: expanding
 * all 89 seeds would need ~180 calls and would turn a missing `GITHUB_TOKEN`
 * into a failed deploy. So the showcase books expand, the rest are listed at
 * book level, and every lookup is individually guarded — a sitemap that loses a
 * few chapter URLs is a minor SEO cost, while a sitemap that throws is a broken
 * build.
 *
 * `getBook` is a `use cache` function, so this shares entries with the reader
 * routes rather than paying for them twice.
 */

import type { MetadataRoute } from "next";
import { getBook } from "@/lib/book";
import { allSeedParams, showcaseParams } from "@/lib/featured";
import { SITE_URL, paths } from "@/lib/site";

type Entry = MetadataRoute.Sitemap[number];

async function chaptersFor(owner: string, repo: string): Promise<Entry[]> {
  try {
    const book = await getBook(owner, repo);
    const lastModified = book.repo.pushedAt ?? undefined;
    return book.skills.map((skill) => ({
      url: `${SITE_URL}${paths.chapter(owner, repo, skill.slug)}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const seeds = allSeedParams();
  const showcase = showcaseParams();

  const chapterLists = await Promise.all(
    showcase.map(({ owner, repo }) => chaptersFor(owner, repo)),
  );

  const staticRoutes: Entry[] = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/llms.txt`, changeFrequency: "daily", priority: 0.5 },
    { url: `${SITE_URL}/api/v1/books`, changeFrequency: "daily", priority: 0.5 },
  ];

  // Book HTML only. The `.md` twin of every book used to be listed too, but
  // each of those responses carries `Link: <html>; rel="canonical"` — so the
  // sitemap was telling crawlers to index URLs that disown themselves. They
  // stay discoverable through that `Link`, through `<link rel="alternate">` in
  // the page head, and through `llms.txt`.
  const bookRoutes: Entry[] = seeds.map(({ owner, repo }) => ({
    url: `${SITE_URL}${paths.book(owner, repo)}`,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  // A repo can appear in both lists; the last write wins and URLs stay unique.
  const byUrl = new Map<string, Entry>();
  for (const entry of [...staticRoutes, ...bookRoutes, ...chapterLists.flat()]) {
    byUrl.set(entry.url, entry);
  }
  return [...byUrl.values()];
}
