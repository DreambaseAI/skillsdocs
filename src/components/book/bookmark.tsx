"use client";

/**
 * Bookmarking a skill, and the ribbon that shows it.
 *
 * Two components around one `localStorage` list (`useBookmarks`):
 *
 * - `BookmarkButton` is the toggle, and lives on the skill page itself.
 *   Bookmarking a skill auto-stars its book — a bookmark without the book on
 *   your shelf would be a page number without the book — and the announcement
 *   says so when it happens, because the shelf just changed somewhere else on
 *   the site.
 * - `BookmarkMark` is the passive ribbon shown beside a bookmarked skill in
 *   the contents rail and the cover spread. It renders nothing until the list
 *   is known (SSR and the hydrating render), so the server HTML never
 *   disagrees with the first client paint.
 */

import { Bookmark01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { announce } from "@/components/chrome/live-regions";
import { Button } from "@/components/ui/button";
import { bookmarkKey, favoriteKey, useBookmarks, useFavorites } from "@/hooks/use-favorites";
import { capture } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export interface BookmarkButtonProps {
  owner: string;
  repo: string;
  slug: string;
  /** The skill's display title, for the accessible name and announcements. */
  title: string;
  className?: string;
}

export function BookmarkButton({ owner, repo, slug, title, className }: BookmarkButtonProps) {
  const { has, toggle, ready } = useBookmarks();
  const favorites = useFavorites();
  const key = bookmarkKey(owner, repo, slug);
  const bookmarked = has(key);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-pressed={bookmarked}
      aria-label={`${bookmarked ? "Remove bookmark from" : "Bookmark"} ${title}`}
      className={cn(
        "text-ink-muted hover:text-issue-accent",
        bookmarked && "text-issue-accent",
        className,
      )}
      onClick={() => {
        const wasStarred = favorites.has(favoriteKey(owner, repo));
        const next = toggle(key);
        capture("skill_bookmark_toggled", { action: next ? "added" : "removed" });
        announce(
          next
            ? wasStarred
              ? `${title} bookmarked`
              : `${title} bookmarked — ${owner}/${repo} added to your shelf`
            : `Bookmark removed from ${title}`,
        );
      }}
    >
      <HugeiconsIcon
        icon={Bookmark01Icon}
        data-icon="inline-start"
        className={cn(ready && bookmarked && "fill-current")}
        aria-hidden
      />
    </Button>
  );
}

export interface BookmarkMarkProps {
  owner: string;
  repo: string;
  slug: string;
  className?: string;
}

/**
 * The ribbon beside a bookmarked skill in a list. Not a control — the toggle
 * lives on the skill's own page — so it carries its meaning as text for a
 * screen reader and stays out of the tab order.
 */
export function BookmarkMark({ owner, repo, slug, className }: BookmarkMarkProps) {
  const { has, ready } = useBookmarks();
  if (!ready || !has(bookmarkKey(owner, repo, slug))) return null;

  return (
    <span className={cn("text-issue-accent inline-flex shrink-0 items-center", className)}>
      <HugeiconsIcon icon={Bookmark01Icon} className="size-3.5 fill-current" aria-hidden />
      <span className="sr-only">(bookmarked)</span>
    </span>
  );
}
