/**
 * A featured book rendered as a physical magazine cover.
 *
 * The plate is a `.cover-face` — dark stock washed with the issue's accent —
 * so it reads as an object lying on the page rather than a card in the
 * layout, and it keeps its own ink in both colour schemes the way print does.
 * Everything on it is real data: the stable issue number, the owner's mark,
 * the dek, the chapter and install counts.
 */

import Image from "next/image";
import Link from "next/link";
import { COVER_STAR_CLASS } from "@/components/home/cover-star";
import { FavoriteButton } from "@/components/home/favorite-button";
import { compact } from "@/components/home/format";
import { ownerAccentStyle } from "@/components/home/issue-accent";
import { issueNumberFor } from "@/lib/book";
import { dekOf } from "@/lib/deck";
import type { FeaturedBook } from "@/lib/featured";
import { paths, SITE_NAME } from "@/lib/site";
import { cn } from "@/lib/utils";

const MONO_LABEL =
  "font-mono text-[0.6rem] font-medium tracking-[0.18em] uppercase";

/** Display size by name length, so `ai` and `agent-toolkit-for-aws` both sit. */
function titleSize(name: string): string {
  const n = name.length;
  if (n <= 10) return "text-[2.6rem] leading-[0.98]";
  if (n <= 16) return "text-[2.1rem] leading-[1.02]";
  return "text-[1.6rem] leading-[1.08]";
}

export interface CoverPlateProps {
  book: FeaturedBook;
  className?: string;
}

export function CoverPlate({ book, className }: CoverPlateProps) {
  const href = paths.book(book.owner, book.repo);
  const issue = issueNumberFor(`${book.owner}/${book.repo}`);

  return (
    <article
      data-issue={book.owner.toLowerCase()}
      style={ownerAccentStyle(book.owner)}
      className={cn(
        "cover-face flex aspect-330/500 w-full max-w-84 flex-col justify-between gap-4 rounded-md p-6 pl-8 shadow-[0_40px_80px_-20px_var(--cover-shade-strong)]",
        className
      )}
    >
      <div className={cn("cover-muted flex justify-between gap-3", MONO_LABEL)}>
        <span>Repo No.&nbsp;{issue}</span>
        <span>{SITE_NAME}</span>
      </div>

      <div className="min-w-0">
        <div className="mb-3.5 flex items-center gap-2.5">
          <Image
            src={book.avatar}
            alt=""
            width={68}
            height={68}
            className="cover-avatar size-8.5 shrink-0"
            aria-hidden
          />
          <span className={cn("cover-muted truncate", MONO_LABEL)}>
            {book.owner}
          </span>
        </div>

        <h3
          className={cn(
            "font-display font-normal tracking-[-0.01em] wrap-break-word",
            titleSize(book.repo)
          )}
        >
          <Link
            href={href}
            className="hover:text-(--cover-ink) focus-visible:outline-(--cover-ink) focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            {book.repo}
          </Link>
        </h3>

        <hr className="cover-rule mt-3.5" />

        {book.description ? (
          <p className="cover-muted mt-3 text-[0.8rem] leading-normal text-pretty">
            {dekOf(book.description, 90)}
          </p>
        ) : null}

        <div className="mt-5 flex items-center gap-2.5">
          <Link
            href={href}
            className="cover-cta h-10 px-5 text-[0.8rem]"
            data-issue-cta
          >
            View skills
          </Link>
          <FavoriteButton
            owner={book.owner}
            repo={book.repo}
            size="icon"
            className={COVER_STAR_CLASS}
          />
        </div>
      </div>

      <div className={cn("cover-muted flex justify-between gap-3", MONO_LABEL)}>
        <span>
          {book.skillCount} {book.skillCount === 1 ? "skill" : "skills"}
        </span>
        <span>{compact(book.installs)} installs</span>
      </div>
    </article>
  );
}
