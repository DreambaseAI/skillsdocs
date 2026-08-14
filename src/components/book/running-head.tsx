"use client";

import { useEffect, useState } from "react";
import { announce } from "@/components/chrome/live-regions";
import { folio } from "@/components/book/format";
import type { RailHeading } from "@/components/book/rail-right";
import { ReadingProgress } from "@/components/reader/reading-progress";
import { useActiveHeading } from "@/hooks/use-active-heading";

/**
 * The running head and folio.
 *
 * In a printed book this is the line at the top of every page: the chapter on
 * the verso, the section on the recto, the page number in small caps. On the
 * web the equivalent is a hairline strip that sticks under the chrome and
 * changes as you pass each heading — which is the one piece of the "where am
 * I" problem that a scrolling column genuinely loses to a paginated one.
 *
 * It hides itself while the opener is still on screen. A running head printed
 * directly under the title it repeats is a redundancy that every book design
 * manual warns about, and it steals 2.25rem from the first screen — which on a
 * phone is a whole line of type.
 */

const REVEAL_AFTER = 260;

export interface RunningHeadProps {
  chapter: string;
  /** 1-based position in the book. */
  index: number;
  total: number;
  headings: RailHeading[];
}

export function RunningHead({
  chapter,
  index,
  total,
  headings,
}: RunningHeadProps) {
  const usable = headings.filter((h) => h.depth === 2 || h.depth === 3);
  const active = useActiveHeading(usable.map((h) => h.id));
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setRevealed(window.scrollY > REVEAL_AFTER);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const section = usable.find((h) => h.id === active)?.text ?? null;

  return (
    <>
      {/*
        The 2px progress bar is §5.1's very first desktop element and it was
        built, tested and then never mounted — querying
        `[role=progressbar], progress, [class*=progress]` on an 8,011-word
        chapter scrolled to 45% returned `[]`. It lives here rather than in the
        layout because "45% read" has to mean 45% of *this chapter*, which is
        what the running head beside it claims to be measuring.
      */}
      <ReadingProgress />
      <RunningHeadBar
        revealed={revealed}
        index={index}
        total={total}
        chapter={chapter}
        section={section}
      />
    </>
  );
}

function RunningHeadBar({
  revealed,
  index,
  total,
  chapter,
  section,
}: {
  revealed: boolean;
  index: number;
  total: number;
  chapter: string;
  section: string | null;
}) {
  return (
    <div
      data-print="hide"
      aria-hidden="true"
      // 95%, not 85%. At 15% over a blur the paragraph passing underneath
      // stayed legible *inside* the running head — measured at 1024 with the
      // line "…figure out how they want to evaluate" crossing the head's own
      // rule. A running head is the page's furniture; the page must not show
      // through it.
      className="book-runninghead border-rule bg-paper supports-backdrop-filter:bg-paper/95 pointer-events-none -mx-1 flex items-baseline gap-3 border-b px-1 py-2.5 transition-opacity duration-200 supports-backdrop-filter:backdrop-blur-md"
      style={{
        opacity: revealed ? 1 : 0,
        visibility: revealed ? "visible" : "hidden",
      }}
    >
      <span className="book-eyebrow shrink-0">
        {folio(index)} / {folio(total)}
      </span>
      <span className="text-ink-muted min-w-0 flex-1 truncate text-[0.8125rem]">
        {chapter}
      </span>
      {section ? (
        <span className="text-ink-strong hidden min-w-0 max-w-[45%] truncate text-[0.8125rem] sm:block">
          {section}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Announces the chapter once, politely, after a client-side navigation.
 *
 * A route change in the App Router moves neither focus nor the virtual cursor,
 * so without this a screen-reader user pressing "next chapter" hears nothing
 * at all and has no way to know the page changed.
 */
export function ChapterAnnouncer({
  chapter,
  index,
  total,
}: {
  chapter: string;
  index: number;
  total: number;
}) {
  useEffect(() => {
    announce(`Skill ${index} of ${total}: ${chapter}`);
  }, [chapter, index, total]);

  return null;
}
