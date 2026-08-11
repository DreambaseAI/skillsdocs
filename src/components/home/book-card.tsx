/**
 * The two ways a book appears in the index.
 *
 * The cover story lives in the hero now (`cover-plate.tsx`), so what remains
 * here is the index proper: a front-of-book row with room to breathe, and a
 * set-solid tail row. Both carry `data-issue` and the owner's accent
 * variables, so the page reads as a newsstand of different mastheads rather
 * than one template repeated. Server components throughout; only the star is
 * interactive.
 */

import Image from "next/image";
import Link from "next/link";
import { InlineMarkup } from "@/components/book/deck";
import { FavoriteButton } from "@/components/home/favorite-button";
import { ownerAccentStyle } from "@/components/home/issue-accent";
import { Sparkline, trendGlyph } from "@/components/home/sparkline";
import { compact } from "@/components/home/format";
import { dekOf } from "@/lib/deck";
import type { FeaturedBook } from "@/lib/featured";
import { paths } from "@/lib/site";
import { cn } from "@/lib/utils";

/* --------------------------------------------------------------- utilities */

function OwnerAvatar({
  book,
  size,
  className,
}: {
  book: FeaturedBook;
  size: number;
  className?: string;
}) {
  return (
    <Image
      src={book.avatar}
      alt=""
      width={size}
      height={size}
      className={cn(
        "border-rule bg-paper-raised shrink-0 rounded-xl border object-cover",
        className
      )}
      // Decorative: the owner's login is always adjacent in text.
      aria-hidden
    />
  );
}

/**
 * The index is two treatments, not one.
 *
 * It used to be 89 identical 53px rows — a wall. Every row carried the same
 * furniture at the same weight: an always-visible star, a 52×20px sparkline in
 * its own hue auto-scaled to its own extrema, a dot leader that never touched
 * anything, and two bare figures (`35 ch`, `14M`) that nothing on the page
 * named. Rank 01 with 14M installs and rank 89 with 0 got identical
 * typographic weight, and rank 89 printed a naked right-aligned `0`.
 *
 * A real index has a front of the book and a back of the book:
 *
 * - {@link IndexLeadRow} — the issues that matter, given room: a display-serif
 *   folio, the dek on its own line, one *neutral* sparkline so the shape can be
 *   compared row to row instead of competing for attention.
 * - {@link IndexTailRow} — set solid at 15px, in two columns, under band rules
 *   by order of magnitude, with the trend reduced to a single glyph.
 *
 * The star is hover- and focus-gated in both.
 */

function Folio({ issue, className }: { issue: number; className?: string }) {
  return (
    <span
      className={cn(
        "text-ink-muted font-display shrink-0 text-right tabular-nums",
        className
      )}
      aria-hidden
    >
      {String(issue).padStart(2, "0")}
    </span>
  );
}

/** The star, hidden until the row is hovered or focused — unless it is set. */
function RowStar({
  book,
  className,
}: {
  book: FeaturedBook;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "z-1 shrink-0 opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 has-aria-pressed:opacity-100",
        // Touch has no hover, so on a phone the resting state is the only
        // state and the control has to stay visible.
        "max-md:opacity-100",
        className
      )}
    >
      <FavoriteButton
        owner={book.owner}
        repo={book.repo}
        className="size-9 sm:size-8"
      />
    </span>
  );
}

export function IndexLeadRow({
  book,
  issue,
}: {
  book: FeaturedBook;
  issue: number;
}) {
  const href = paths.book(book.owner, book.repo);
  const dek = book.description ? dekOf(book.description) : "";

  return (
    <li
      data-issue={book.owner.toLowerCase()}
      style={ownerAccentStyle(book.owner)}
      className="border-rule/60 hover:bg-paper-raised/50 group/row relative flex items-start gap-3 border-b py-3.5 pr-1 pl-1 transition-colors last:border-b-0 sm:gap-4"
    >
      <Folio issue={issue} className="w-8 text-[1.5rem] leading-none" />

      <OwnerAvatar book={book} size={36} className="mt-0.5 size-9 rounded-xl" />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[1.0625rem] leading-snug">
          <Link
            href={href}
            className="text-ink-strong group-hover/row:text-issue-accent transition-colors after:absolute after:inset-0 after:content-['']"
          >
            <span className="text-ink-muted font-normal">{book.owner}/</span>
            <span className="font-medium">{book.repo}</span>
          </Link>
        </span>
        {dek && (
          <span className="text-ink-muted mt-0.5 block text-sm leading-snug">
            <InlineMarkup text={dek} />
          </span>
        )}
      </span>

      {/*
        One ink, not 89 hues. The sparkline is here to be compared with the row
        above it; painting each one in its owner's accent made the column read
        as decoration and made two adjacent shapes incomparable.
      */}
      <span className="text-ink-muted mt-1 hidden shrink-0 md:block">
        <Sparkline values={book.weeklyInstalls} className="h-5 w-16" />
      </span>

      <span className="text-ink-muted mt-0.5 hidden w-14 shrink-0 text-right text-xs tabular-nums sm:block">
        {book.skillCount} ch
      </span>
      <span className="text-ink mt-0.5 w-14 shrink-0 text-right text-xs tabular-nums sm:w-16">
        {compact(book.installs)}
      </span>

      <RowStar book={book} className="-mt-0.5" />
    </li>
  );
}

export function IndexTailRow({
  book,
  issue,
}: {
  book: FeaturedBook;
  issue: number;
}) {
  const href = paths.book(book.owner, book.repo);
  const trend = trendGlyph(book.weeklyInstalls);

  return (
    <li
      data-issue={book.owner.toLowerCase()}
      style={ownerAccentStyle(book.owner)}
      className="border-rule/40 hover:bg-paper-raised/50 group/row relative flex items-baseline gap-2 border-b py-1.5 pr-1 pl-1 text-[0.9375rem] transition-colors last:border-b-0"
    >
      <Folio issue={issue} className="w-6 text-[0.72rem]" />

      {/*
        `flex-none` + `min-w-0`, and the leader takes `flex-1`.
        This span and the leader used to be two siblings both set `flex-1`, so
        each took exactly half the free space no matter how long the name was —
        the leader began at a fixed x on every single row and left gaps of up
        to 159px between an entry and its own dots. A leader that does not
        connect the entry to its figure is a rendering fault, not an ornament.
      */}
      {/* `flex-initial`, not `flex-none`: `flex: none` also switches off
          shrinking, so at 320px (1280 at 400% zoom) a long `owner/repo` pushed
          the row — and the page — 141px sideways, WCAG 1.4.10. `flex-initial`
          keeps the leader starting where the name ends while still letting the
          name truncate when there is no room. */}
      <span className="min-w-0 flex-initial truncate">
        <Link
          href={href}
          className="text-ink group-hover/row:text-issue-accent transition-colors after:absolute after:inset-0 after:content-['']"
        >
          <span className="text-ink-muted">{book.owner}/</span>
          <span className="font-medium">{book.repo}</span>
        </Link>
      </span>

      <span
        className="border-rule/70 min-w-3 flex-1 translate-y-[-0.28em] border-b border-dotted"
        aria-hidden
      />

      {/* A fixed slot, present whether or not there is a trend to print, so
          every leader in the column terminates on the same vertical. */}
      <span className="text-ink-muted w-3 shrink-0 text-center text-xs">
        {trend && (
          <>
            <span aria-hidden>{trend.glyph}</span>
            <span className="sr-only">{trend.label}</span>
          </>
        )}
      </span>

      <span className="text-ink-muted w-10 shrink-0 text-right text-xs tabular-nums">
        {book.skillCount}
      </span>
      <span className="text-ink w-12 shrink-0 text-right text-xs tabular-nums">
        {book.installs > 0 ? (
          compact(book.installs)
        ) : (
          <span className="text-ink-muted">—</span>
        )}
      </span>

      <RowStar book={book} className="self-center" />
    </li>
  );
}
