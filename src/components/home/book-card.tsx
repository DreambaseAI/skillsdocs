/**
 * The three ways a book appears on the contents page.
 *
 * A magazine's contents page is not a grid — it is a lead story, a few
 * secondary features, and then an index set in small type with folios. These
 * are those three treatments, and they share the row data rather than the
 * layout, which is the point: nine identical cards would tell a reader that
 * nine repos are equally worth their time, and they are not.
 *
 * Every treatment carries `data-issue` and the owner's accent variables, so
 * the page reads as a newsstand of different mastheads rather than one
 * template repeated. Server components throughout; only the star and the
 * share menu are interactive.
 */

import { Book02Icon, Download04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import Link from "next/link";
import { InlineMarkup } from "@/components/book/deck";
import { FavoriteButton } from "@/components/home/favorite-button";
import { ownerAccentStyle } from "@/components/home/issue-accent";
import { ShareMenu } from "@/components/home/share-menu";
import { Sparkline, trendGlyph, trendLabel } from "@/components/home/sparkline";
import { compact } from "@/components/home/format";
import { dekOf } from "@/lib/deck";
import type { FeaturedBook } from "@/lib/featured";
import { absoluteUrl, external, installCommand, paths } from "@/lib/site";
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
      className={cn("border-rule bg-paper-raised shrink-0 rounded-xl border object-cover", className)}
      // Decorative: the owner's login is always adjacent in text.
      aria-hidden
    />
  );
}

/* ------------------------------------------------------------- lead story */

export interface LeadStoryProps {
  book: FeaturedBook;
  /** Its rank in the index, printed as the issue folio. */
  issue: number;
}

export function LeadStory({ book, issue }: LeadStoryProps) {
  const href = paths.book(book.owner, book.repo);
  const trend = trendLabel(book.weeklyInstalls);

  return (
    <article
      data-issue={book.owner.toLowerCase()}
      style={ownerAccentStyle(book.owner)}
      className="border-rule bg-paper-raised/60 relative rounded-3xl border p-6 sm:p-9"
    >
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-12">
        <div className="min-w-0 flex-1">
          <p className="text-issue-accent flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.72rem] font-semibold tracking-[0.18em] uppercase">
            <span>Cover story</span>
            <span className="bg-issue-accent/40 hidden h-px w-8 sm:block" aria-hidden />
            <span className="text-ink-muted">Issue {String(issue).padStart(2, "0")}</span>
          </p>

          <div className="mt-5 flex items-start gap-4">
            <OwnerAvatar book={book} size={64} className="size-14 rounded-2xl sm:size-16" />
            <div className="min-w-0">
              {/* `break-words`: at 320 CSS px (1280 at 400% zoom, WCAG
                  1.4.10) `microsoft/azure-skills` set at 30px is 230px wide in
                  a 158px column and pushed the document to 347px of horizontal
                  scroll. A repo name has no spaces to break at. */}
              <h3 className="font-display text-ink-strong text-[clamp(1.9rem,5vw,3.25rem)] leading-[1.02] tracking-[-0.025em] break-words text-balance">
                <Link href={href} className="hover:text-issue-accent transition-colors">
                  <span className="text-ink-muted font-normal">{book.owner}/</span>
                  {book.repo}
                </Link>
              </h3>
              {book.official && (
                <p className="text-ink-muted mt-2 text-xs tracking-[0.12em] uppercase">
                  Official on skills.sh
                </p>
              )}
            </div>
          </div>

          {book.description && (
            // Through `deckOf`, like every other description surface: bounded
            // on a word boundary rather than a pixel column, typeset with real
            // apostrophes, and with inline code set as code instead of printed
            // with its backticks.
            <p className="text-ink mt-5 max-w-prose text-lg leading-[1.5] text-pretty sm:text-xl">
              <InlineMarkup text={dekOf(book.description, 220)} />
            </p>
          )}

          {book.featuredSkill && (
            <p className="text-ink-muted mt-4 text-sm">
              Editor&rsquo;s pick:{" "}
              <Link
                href={paths.chapter(book.owner, book.repo, book.featuredSkill)}
                className="text-issue-accent font-medium underline decoration-1 underline-offset-4"
              >
                {book.featuredSkill}
              </Link>
            </p>
          )}

          <dl className="text-ink-muted mt-7 flex flex-wrap items-center gap-x-7 gap-y-3 text-sm">
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Book02Icon} className="size-4" aria-hidden />
              <dt className="sr-only">Chapters</dt>
              <dd>
                <span className="text-ink-strong font-medium">{book.skillCount}</span>{" "}
                {book.skillCount === 1 ? "chapter" : "chapters"}
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Download04Icon} className="size-4" aria-hidden />
              <dt className="sr-only">Installs</dt>
              <dd>
                <span className="text-ink-strong font-medium">{compact(book.installs)}</span>{" "}
                installs
              </dd>
            </div>
            {trend && (
              <div className="text-issue-accent flex items-center gap-2">
                <Sparkline values={book.weeklyInstalls} area className="h-6 w-20" />
                <dt className="sr-only">Trend</dt>
                <dd className="text-ink-muted">{trend}</dd>
              </div>
            )}
          </dl>

          <div className="mt-8 flex flex-wrap items-center gap-2">
            <Link
              href={href}
              className="bg-issue-accent text-issue-accent-foreground focus-visible:ring-issue-accent/40 inline-flex h-11 items-center rounded-full px-6 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:ring-3"
            >
              Read the issue
            </Link>
            <FavoriteButton owner={book.owner} repo={book.repo} size="icon" />
            <ShareMenu
              url={absoluteUrl(href)}
              title={`${book.owner}/${book.repo}`}
              summary={book.description ?? "Agent skills, read as a book."}
            />
            <a
              href={external.repo(book.owner, book.repo)}
              className="text-ink-muted hover:text-ink ml-auto text-sm underline decoration-1 underline-offset-4"
            >
              On GitHub
            </a>
          </div>
        </div>

        <aside className="border-rule bg-paper w-full shrink-0 rounded-2xl border p-5 lg:w-72">
          <p className="text-ink-muted text-[0.7rem] font-semibold tracking-[0.16em] uppercase">
            Install
          </p>
          <code className="text-ink mt-3 block font-mono text-[0.82rem] leading-relaxed break-all">
            {installCommand(book.owner, book.repo)}
          </code>
          <dl className="border-rule text-ink-muted mt-5 grid grid-cols-2 gap-y-3 border-t pt-5 text-xs">
            <dt>Stars</dt>
            <dd className="text-ink text-right">{compact(book.stars)}</dd>
            <dt>Licence</dt>
            <dd className="text-ink truncate text-right">{book.license ?? "None declared"}</dd>
            <dt>Layout</dt>
            <dd className="text-ink truncate text-right font-mono text-[0.7rem]">{book.layout}</dd>
          </dl>
        </aside>
      </div>
    </article>
  );
}

/* ---------------------------------------------------------- feature cards */

export function FeatureCard({ book, issue }: { book: FeaturedBook; issue: number }) {
  const href = paths.book(book.owner, book.repo);

  return (
    <article
      data-issue={book.owner.toLowerCase()}
      style={ownerAccentStyle(book.owner)}
      className="border-rule hover:border-issue-accent/50 group/card relative flex flex-col rounded-2xl border p-5 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <OwnerAvatar book={book} size={40} className="size-10" />
        <span className="text-ink-muted font-mono text-[0.7rem] tracking-widest">
          {String(issue).padStart(2, "0")}
        </span>
      </div>

      <h3 className="font-display text-ink-strong mt-4 text-xl leading-tight tracking-[-0.015em]">
        <Link href={href} className="after:absolute after:inset-0 after:content-['']">
          <span className="text-ink-muted font-normal">{book.owner}/</span>
          {book.repo}
        </Link>
      </h3>

      {book.description && (
        // No `line-clamp`: a fixed pixel column cuts mid-token (`Anthropic's
        // look-…`) and leaves dead space under a short description. The budget
        // is characters, applied on a word boundary, server-side.
        <p className="text-ink-muted mt-2 text-sm leading-relaxed">
          <InlineMarkup text={dekOf(book.description, 150)} />
        </p>
      )}

      <div className="text-ink-muted mt-auto flex items-end justify-between gap-3 pt-5 text-xs">
        <span>
          <span className="text-ink-strong font-medium">{book.skillCount}</span>{" "}
          {book.skillCount === 1 ? "chapter" : "chapters"} ·{" "}
          <span className="text-ink-strong font-medium">{compact(book.installs)}</span> installs
        </span>
        <span className="text-issue-accent">
          <Sparkline values={book.weeklyInstalls} className="h-5 w-16" />
        </span>
      </div>

      {/* Sits above the card-wide link overlay so the star stays clickable. */}
      <div className="absolute top-3 right-3 z-1 opacity-0 transition-opacity group-focus-within/card:opacity-100 group-hover/card:opacity-100">
        <FavoriteButton owner={book.owner} repo={book.repo} />
      </div>
    </article>
  );
}

/* ------------------------------------------------------------- index rows */

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
 * The star is hover- and focus-gated in both, which is what `FeatureCard`
 * already did correctly and these rows did not.
 */

function Folio({ issue, className }: { issue: number; className?: string }) {
  return (
    <span
      className={cn("text-ink-muted font-display shrink-0 text-right tabular-nums", className)}
      aria-hidden
    >
      {String(issue).padStart(2, "0")}
    </span>
  );
}

/** The star, hidden until the row is hovered or focused — unless it is set. */
function RowStar({ book, className }: { book: FeaturedBook; className?: string }) {
  return (
    <span
      className={cn(
        "z-1 shrink-0 opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 has-[[aria-pressed=true]]:opacity-100",
        // Touch has no hover, so on a phone the resting state is the only
        // state and the control has to stay visible.
        "max-md:opacity-100",
        className,
      )}
    >
      <FavoriteButton owner={book.owner} repo={book.repo} className="size-9 sm:size-8" />
    </span>
  );
}

export function IndexLeadRow({ book, issue }: { book: FeaturedBook; issue: number }) {
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

export function IndexTailRow({ book, issue }: { book: FeaturedBook; issue: number }) {
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
        {book.installs > 0 ? compact(book.installs) : <span className="text-ink-muted">—</span>}
      </span>

      <RowStar book={book} className="self-center" />
    </li>
  );
}
