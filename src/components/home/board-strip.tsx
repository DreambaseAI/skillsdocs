"use client";

/**
 * The homepage's preview of the skill board: the same paper stacks, small,
 * in one horizontally scrolling rail under the shelf. Renders nothing until
 * bookmarks exist — the shelf's empty state already explains the shelf, and
 * a second empty state under it would be furniture.
 */

import { useMemo } from "react";
import { PaperStack } from "@/components/board/paper-stack";
import { stacksOf } from "@/components/board/stacks";
import { useBoardBooks } from "@/components/board/use-board-books";
import { FavoritesShare } from "@/components/home/favorites-share";
import { useBookmarks } from "@/hooks/use-favorites";
import { paths } from "@/lib/site";

const MONO_LABEL =
  "font-mono text-[0.62rem] font-medium tracking-[0.18em] uppercase";

export function BoardStrip() {
  const { keys, ready } = useBookmarks();
  const stacks = useMemo(() => stacksOf(keys), [keys]);
  const books = useBoardBooks(stacks.map((s) => s.repoKey));

  if (!ready || stacks.length === 0) return null;

  return (
    <section aria-labelledby="board-strip-heading" className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <h3 id="board-strip-heading" className={`${MONO_LABEL} text-ink-muted`}>
          Bookmarked skills
        </h3>
        <FavoritesShare kind="board" keys={keys} />
      </div>
      <ul aria-label="Bookmarked skills, stacked by repo" className="paper-strip">
        {stacks.map((stack) => {
          const book = books[stack.repoKey];
          const top = stack.slugs[0];
          return (
            <PaperStack
              key={stack.repoKey}
              owner={stack.owner}
              repo={stack.repo}
              slug={top}
              count={stack.slugs.length}
              meta={
                book === undefined
                  ? undefined
                  : (book?.skills[top.toLowerCase()] ?? null)
              }
              issueNumber={book?.issueNumber}
              href={paths.chapter(stack.owner, stack.repo, top)}
            />
          );
        })}
      </ul>
    </section>
  );
}
