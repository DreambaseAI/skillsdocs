"use client";

/**
 * The spread's skills preview, reordered around the reader's bookmarks.
 *
 * Bookmarked skills take the preview's slots first (in reading order, so the
 * list still scans like a contents), and the remaining slots fill from the top
 * of the book — always the same total. Bookmarks live in `localStorage`, so
 * this is a client list; on the server and the hydrating render it shows the
 * first `max` skills, which is exactly what the no-bookmarks render shows, so
 * the HTML never disagrees with the first paint.
 *
 * The rows are the spread's own markup, moved client-side wholesale. The one
 * thing that cannot move is `ChapterCredit` — a streamed server lookup of a
 * credited skill's origin — so the server renders those nodes for the default
 * rows and passes them in by slug. A bookmarked credited skill promoted from
 * outside the default preview still gets its "Credited" chip; it just goes
 * without the origin line, which is a fair trade for not running an
 * attribution lookup per skill in a hundred-skill book.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { BookmarkMark } from "@/components/book/bookmark";
import { InlineMarkup } from "@/components/book/deck";
import { folio, shortReadingTime } from "@/components/book/format";
import { bookmarkKey, useBookmarks } from "@/hooks/use-favorites";
import { paths } from "@/lib/site";
import { cn } from "@/lib/utils";

const MONO_LABEL =
  "font-mono text-[0.62rem] font-medium tracking-[0.18em] uppercase";

export interface PreviewSkill {
  slug: string;
  title: string;
  /** Pre-cut dek — trimmed on the server so the payload never carries a
   * thousand-character trigger description per skill. */
  dek: string | null;
  minutes: number;
  origin: "authored" | "credited";
  /** 1-based position in the whole book — the folio the rail also prints. */
  position: number;
}

export interface SkillsPreviewProps {
  owner: string;
  repo: string;
  /** Whole-book credited edition: the spread already says it, so no chips. */
  credited: boolean;
  /** Every skill in the book, in reading order, lightweight. */
  skills: PreviewSkill[];
  /** How many rows the preview shows in total. */
  max: number;
  /** Server-rendered `ChapterCredit` nodes for the default rows, by slug. */
  credits: Record<string, ReactNode>;
}

export function SkillsPreview({
  owner,
  repo,
  credited,
  skills,
  max,
  credits,
}: SkillsPreviewProps) {
  const { has, ready } = useBookmarks();

  const marked = ready
    ? skills.filter((s) => has(bookmarkKey(owner, repo, s.slug))).slice(0, max)
    : [];
  const shown = [
    ...marked,
    ...skills
      .filter((s) => !marked.includes(s))
      .slice(0, max - marked.length),
  ];

  return (
    <ol className="mt-1">
      {shown.map((skill) => (
        <li key={skill.slug} className="border-rule/80 border-b">
          <Link
            href={paths.chapter(owner, repo, skill.slug)}
            className="group/ch hover:bg-paper-raised/60 grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-baseline gap-x-4 py-4 transition-colors"
          >
            <span
              className="text-issue-accent font-mono text-[0.78rem] font-medium"
              aria-hidden
            >
              {folio(skill.position)}
            </span>
            <span className="min-w-0">
              <span className="font-display text-ink-strong group-hover/ch:text-issue-accent block text-[1.35rem] leading-snug tracking-[-0.012em] text-balance transition-colors">
                {skill.title}
                {/* Marked per row only in a mixed book — on a credited
                    edition the whole spread already says it. */}
                {skill.origin === "credited" && !credited ? (
                  <span
                    className={cn(
                      MONO_LABEL,
                      "text-ink-muted ml-2.5 align-middle text-[0.56rem]"
                    )}
                  >
                    Credited
                  </span>
                ) : null}
              </span>
              {skill.dek ? (
                <span className="text-ink-muted mt-1 block text-sm leading-snug text-pretty">
                  <InlineMarkup text={skill.dek} />
                </span>
              ) : null}
            </span>
            <span className="text-ink-muted flex items-center gap-2 self-center font-mono text-[0.72rem] tabular-nums">
              <BookmarkMark owner={owner} repo={repo} slug={skill.slug} />
              {shortReadingTime(skill.minutes)}
            </span>
          </Link>
          {credits[skill.slug] ?? null}
        </li>
      ))}
    </ol>
  );
}
