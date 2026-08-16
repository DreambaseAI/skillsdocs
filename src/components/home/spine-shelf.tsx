/**
 * The server half of the shelf: resolves the catalogue's lead books and their
 * owner accents, and hands the client rail plain rows. Only `owner`/`repo`
 * strings and accent custom properties cross the boundary — never a
 * `FeaturedBook`, which would put the catalogue in every visitor's payload.
 */

import { ownerAccentStyle } from "@/components/home/issue-accent";
import { SpineRail } from "@/components/home/shelf";
import { getFeaturedBooks } from "@/lib/featured";

/** How many featured books stand on the shelf. */
const SHELF_SIZE = 14;

export async function ShelfBooks() {
  const books = await getFeaturedBooks();
  const rows = books.slice(0, SHELF_SIZE).map((book) => ({
    owner: book.owner,
    repo: book.repo,
    accent: ownerAccentStyle(book.owner),
  }));

  return <SpineRail rows={rows} />;
}

/** The shelf before the catalogue resolves: heading, empty board. */
export function ShelfFallback() {
  return (
    <section aria-hidden className="flex flex-col">
      <h2 className="font-display text-ink-strong text-3xl tracking-[-0.02em]">
        Your favorites
      </h2>
      <div className="mt-8 flex items-end gap-3.5 px-1 pt-2">
        {[268, 300, 244, 316, 256, 288].map((height, i) => (
          <span
            key={i}
            className="bg-ink/8 block w-19 rounded-t-[3px] max-sm:nth-[n+5]:hidden"
            style={{ height }}
          />
        ))}
      </div>
      <div className="shelf-board" />
    </section>
  );
}
