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
import { FavoriteButton } from "@/components/home/favorite-button";
import { ownerAccentStyle } from "@/components/home/issue-accent";
import { ShareMenu } from "@/components/home/share-menu";
import { Sparkline, trendLabel } from "@/components/home/sparkline";
import { compact, plural } from "@/components/home/format";
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
            <p className="text-ink mt-5 max-w-prose text-lg leading-[1.5] text-pretty sm:text-xl">
              {book.description}
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
        <p className="text-ink-muted mt-2 line-clamp-3 text-sm leading-relaxed">
          {book.description}
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

export function IndexRow({ book, issue }: { book: FeaturedBook; issue: number }) {
  const href = paths.book(book.owner, book.repo);

  return (
    <li
      data-issue={book.owner.toLowerCase()}
      style={ownerAccentStyle(book.owner)}
      className="border-rule/60 hover:bg-paper-raised/60 group/row relative flex items-center gap-2 border-b py-2.5 pr-1 pl-1 transition-colors last:border-b-0 sm:gap-4"
    >
      <span
        className="text-ink-muted w-5 shrink-0 text-right font-mono text-[0.66rem] tabular-nums sm:w-7 sm:text-[0.7rem]"
        aria-hidden
      >
        {String(issue).padStart(2, "0")}
      </span>

      <OwnerAvatar book={book} size={28} className="size-7 rounded-lg" />

      <span className="min-w-0 flex-1">
        <span className="block truncate">
          <Link
            href={href}
            className="text-ink group-hover/row:text-issue-accent transition-colors after:absolute after:inset-0 after:content-['']"
          >
            <span className="text-ink-muted">{book.owner}/</span>
            <span className="font-medium">{book.repo}</span>
          </Link>
          {book.description && (
            <span className="text-ink-muted ml-3 hidden text-sm lg:inline">
              {book.description}
            </span>
          )}
        </span>
        {/* The chapter count has its own column from `sm` up; on a phone it
            rides under the name rather than stealing 64px from it. */}
        <span className="text-ink-muted block text-[0.68rem] tabular-nums sm:hidden">
          {plural(book.skillCount, "chapter")}
        </span>
      </span>

      {/* The dot leader: a contents page's one true ornament. */}
      <span
        className="border-rule/70 hidden min-w-6 flex-1 translate-y-[-0.2em] border-b border-dotted sm:block"
        aria-hidden
      />

      <span className="text-issue-accent hidden shrink-0 md:block">
        <Sparkline values={book.weeklyInstalls} className="h-5 w-14" />
      </span>

      <span className="text-ink-muted hidden w-16 shrink-0 text-right text-xs tabular-nums sm:block">
        {book.skillCount} ch
      </span>
      <span className="text-ink w-12 shrink-0 text-right text-xs tabular-nums sm:w-16">
        {compact(book.installs)}
      </span>

      <span className="z-1 shrink-0">
        {/* 36px on touch, where the row is the only thing near it. */}
        <FavoriteButton owner={book.owner} repo={book.repo} className="size-9 sm:size-8" />
      </span>
    </li>
  );
}
