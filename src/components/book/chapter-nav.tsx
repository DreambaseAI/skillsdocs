import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { folio } from "@/components/book/format";
import type { Book } from "@/lib/book";
import type { Skill } from "@/lib/skills";
import { paths } from "@/lib/site";

/**
 * Prev / next.
 *
 * Its own `navigation` landmark with its own name, because a page that has two
 * unlabelled navigation regions gives a screen-reader user a menu reading
 * "navigation, navigation" — the table of contents is one, this is the other,
 * and they are not interchangeable.
 *
 * The chapter titles are in the links, not "Previous" and "Next": a link list
 * read out of context has to say where it goes.
 */

export interface ChapterNavProps {
  book: Book;
  prev: Skill | null;
  next: Skill | null;
  index: number;
}

export function ChapterNav({ book, prev, next, index }: ChapterNavProps) {
  if (!prev && !next) return null;
  const { owner, repo } = book.repo;

  return (
    <nav
      aria-label="Skill navigation"
      className="book-measure mt-14"
      data-print="hide"
    >
      <div className="book-chapternav">
        {prev ? (
          <Link
            href={paths.chapter(owner, repo, prev.slug)}
            className="book-chapternav__link"
            rel="prev"
          >
            <span className="book-eyebrow flex items-center gap-1.5">
              <HugeiconsIcon
                icon={ArrowLeft01Icon}
                className="size-3.5"
                aria-hidden
              />
              Skill {folio(index - 1)}
            </span>
            <span className="book-chapternav__title">{prev.title}</span>
          </Link>
        ) : (
          <span className="book-chapternav__link">
            <span className="book-eyebrow">Beginning of the issue</span>
            <Link
              href={paths.book(owner, repo)}
              className="book-chapternav__title hover:text-issue-accent underline-offset-4 hover:underline"
            >
              Back to the cover
            </Link>
          </span>
        )}

        {next ? (
          <Link
            href={paths.chapter(owner, repo, next.slug)}
            className="book-chapternav__link book-chapternav__link--next"
            rel="next"
          >
            <span className="book-eyebrow flex items-center gap-1.5">
              Skill {folio(index + 1)}
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                className="size-3.5"
                aria-hidden
              />
            </span>
            <span className="book-chapternav__title">{next.title}</span>
          </Link>
        ) : (
          <span className="book-chapternav__link book-chapternav__link--next">
            <span className="book-eyebrow">End of the issue</span>
            <Link
              href={`${paths.book(owner, repo)}#colophon`}
              className="book-chapternav__title hover:text-issue-accent underline-offset-4 hover:underline"
            >
              Read the colophon
            </Link>
          </span>
        )}
      </div>
    </nav>
  );
}
