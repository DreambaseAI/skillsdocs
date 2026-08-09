import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { cacheKeyFor, findSkill, getBook } from "@/lib/book";
import { repoTag } from "@/lib/github";
import { renderMarkdown, type RenderedMarkdown } from "@/lib/markdown";
import { paths } from "@/lib/site";

/**
 * Cached markdown rendering for the two documents a book route displays: the
 * README that serves as front matter, and one chapter's `SKILL.md`.
 *
 * **This wrapper is not an optimisation, it is a correctness requirement.**
 * Under Cache Components, a prerender fails outright if anything in the tree
 * reads an unstable value — and somewhere inside the unified/Shiki pipeline
 * something calls `Date.now()`. Rendering the README straight from the page
 * body therefore breaks `next build` for every repository in
 * `generateStaticParams` with "encountered the unstable value `Date.now()`
 * while prerendering". Moving the call behind `"use cache"` puts the unstable
 * read inside a cache scope, where Next's own guidance says it belongs.
 *
 * It happens to be the right call on cost too: Shiki highlighting a 4,000-word
 * chapter is by far the most expensive thing either route does, and it
 * produces the same bytes for an hour.
 *
 * Arguments are primitives only — the cache-key serialiser rejects functions,
 * so the internal-link resolver cannot be passed in and is rebuilt from the
 * book on the inside.
 */

/**
 * The repository's README, rendered. `null` when the repo has no README.
 *
 * The exported form folds the case of the arguments before they become a cache
 * key, so `/MattPocock/Skills` and `/mattpocock/skills` share one entry and one
 * revalidation tag. See `cacheKeyFor`.
 */
export async function renderFrontMatter(
  ownerParam: string,
  repoParam: string,
): Promise<RenderedMarkdown | null> {
  const [owner, repo] = cacheKeyFor(ownerParam, repoParam);
  return renderFrontMatterCached(owner, repo);
}

async function renderFrontMatterCached(
  owner: string,
  repo: string,
): Promise<RenderedMarkdown | null> {
  "use cache";
  cacheLife("repo");
  cacheTag(repoTag(owner, repo), "book");

  const book = await getBook(owner, repo);
  if (!book.readme) return null;

  return renderMarkdown(book.readme, {
    owner: book.repo.owner,
    repo: book.repo.repo,
    ref: book.repo.defaultBranch,
    baseDir: "",
    title: book.repo.repo,
    resolveInternal: (repoPath) => {
      const skill = book.skills.find((s) => s.skillMdPath === repoPath);
      return skill
        ? paths.chapter(book.repo.owner, book.repo.repo, skill.slug)
        : null;
    },
  });
}

/** One chapter's body, rendered. `null` when the slug is not in the book. */
export async function renderChapter(
  ownerParam: string,
  repoParam: string,
  slug: string,
): Promise<RenderedMarkdown | null> {
  const [owner, repo] = cacheKeyFor(ownerParam, repoParam);
  return renderChapterCached(owner, repo, slug);
}

async function renderChapterCached(
  owner: string,
  repo: string,
  slug: string,
): Promise<RenderedMarkdown | null> {
  "use cache";
  cacheLife("repo");
  cacheTag(repoTag(owner, repo), `skill:${repoTag(owner, repo).slice(5)}/${slug}`);

  const book = await getBook(owner, repo);
  const skill = findSkill(book, slug);
  if (!skill) return null;

  return renderMarkdown(skill.body, {
    owner: book.repo.owner,
    repo: book.repo.repo,
    ref: book.repo.defaultBranch,
    baseDir: skill.dir,
    // The opener already prints the title as this page's only h1, so a leading
    // duplicate in the source is stripped and everything below it shifts.
    title: skill.title,
    resolveInternal: (repoPath) => {
      const target = book.skills.find(
        (s) => s.skillMdPath === repoPath || s.dir === repoPath,
      );
      return target
        ? paths.chapter(book.repo.owner, book.repo.repo, target.slug)
        : null;
    },
  });
}
