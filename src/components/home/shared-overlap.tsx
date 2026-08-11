"use client";

/**
 * The shared shelf's closing line: how many of these books the visitor has
 * already starred. Client-side because the answer lives in `localStorage`,
 * and live because starring a spine on this very page should move the count.
 */

import { favoriteKey, useFavorites } from "@/hooks/use-favorites";

export function SharedOverlap({
  books,
}: {
  books: Array<{ owner: string; repo: string }>;
}) {
  const { has, ready } = useFavorites();
  if (!ready) return null;

  const count = books.filter((book) =>
    has(favoriteKey(book.owner, book.repo)),
  ).length;
  if (count === 0) return null;

  return (
    <span>
      {count} of these {count === 1 ? "is" : "are"} already on your shelf
    </span>
  );
}
