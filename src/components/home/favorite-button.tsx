"use client";

/**
 * The star that puts a book on your shelf.
 *
 * `aria-pressed` rather than a checkbox: this is a toggle button whose label
 * ("Add to your shelf") stays constant while its state changes, which is
 * exactly the case `aria-pressed` exists for. The accessible name names the
 * book, because a page with 89 stars on it would otherwise present 89
 * identically-named controls to anyone navigating by form control.
 *
 * The state announcement is explicit. Screen readers do announce a changed
 * `aria-pressed`, but only if focus is on the button — and the shelf section
 * elsewhere on the page has just gained or lost a row, which is the part
 * worth hearing.
 */

import { StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { announce } from "@/components/chrome/live-regions";
import { Button } from "@/components/ui/button";
import { favoriteKey, useFavorites } from "@/hooks/use-favorites";
import { cn } from "@/lib/utils";

export interface FavoriteButtonProps {
  owner: string;
  repo: string;
  className?: string;
  size?: "icon-sm" | "icon";
}

export function FavoriteButton({ owner, repo, className, size = "icon-sm" }: FavoriteButtonProps) {
  const { has, toggle, ready } = useFavorites();
  const key = favoriteKey(owner, repo);
  const starred = has(key);

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      aria-pressed={starred}
      // Never disabled before hydration: a disabled control that silently
      // enables itself is worse than one that briefly reports "not starred".
      aria-label={`${starred ? "Remove" : "Add"} ${owner}/${repo} ${starred ? "from" : "to"} your shelf`}
      className={cn("text-ink-muted hover:text-issue-accent", starred && "text-issue-accent", className)}
      onClick={() => {
        const next = toggle(key);
        announce(
          next
            ? `${owner}/${repo} added to your shelf`
            : `${owner}/${repo} removed from your shelf`,
        );
      }}
    >
      <HugeiconsIcon
        icon={StarIcon}
        data-icon="inline-start"
        className={cn(ready && starred && "fill-current")}
        aria-hidden
      />
    </Button>
  );
}
