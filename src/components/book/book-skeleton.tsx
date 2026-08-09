/**
 * The App Shell.
 *
 * Every uncached repository on GitHub renders this before a single byte of its
 * content is known — which makes it the most-viewed component in the product
 * and the one place where "it's just a loading state" is the wrong instinct.
 *
 * So it is not a spinner and not a grey rectangle. It is the same page: same
 * grid, same rules, same folio positions, same masthead strip, same contents
 * rhythm. The only difference is that the ink has not landed yet. A reader who
 * sees it for 400ms should register "the book is here" rather than "the site
 * is thinking", and a reader who sees it for four seconds on a cold edge
 * should still be looking at something composed.
 *
 * Purely presentational and server-rendered: no client JavaScript reaches the
 * shell, because the shell's whole job is to exist before JavaScript does.
 */

import { cn } from "@/lib/utils";

function Ghost({
  className,
  width,
  pulse = true,
}: {
  className?: string;
  /** Content-shaped widths are data, not a scale step, so they stay inline. */
  width?: string;
  pulse?: boolean;
}) {
  return (
    <span
      className={cn("book-ghost", pulse && "book-ghost--pulse", className)}
      style={width ? { width } : undefined}
      aria-hidden="true"
    />
  );
}

/**
 * Widths that read as language rather than as a progress bar.
 *
 * The rail used to be six equal-length full-width bars where the real rail is
 * a ragged numbered list of seventeen, and the title was two rounded slabs
 * that read as buttons rather than as one 96px display line. Ragged is the
 * whole point: a placeholder whose silhouette matches the text it replaces
 * makes hydration a fill rather than a jump.
 */
const RAIL_WIDTHS = [
  "78%", "56%", "91%", "63%", "72%", "48%", "85%", "59%", "94%",
  "67%", "55%", "81%", "70%", "88%", "61%", "76%", "52%",
];
const DECK_LINES = ["92%", "84%", "47%"];
const ENTRY_TITLE_WIDTHS = ["46%", "58%", "39%", "63%", "44%", "52%"];
const ENTRY_DEK_WIDTHS = ["92%", "78%", "86%", "70%", "89%", "74%"];

/** The real folio, set in the real face — the one fact available for free. */
function RailFolio({ n }: { n: number }) {
  return (
    <span className="text-ink-muted/50 font-display w-6 shrink-0 text-[0.7rem] tabular-nums">
      {String(n).padStart(2, "0")}
    </span>
  );
}

export function BookSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Setting the issue">
      <span className="sr-only">Setting the issue. One moment.</span>

      {/*
        The cover band, at the real height, on the real (untinted, because the
        accent has not resolved) paper. Everything below it is the real frame.
      */}
      <div className="book-coverband" aria-hidden="true">
        <div className="book-coverband__inner">
          <div className="book-coverband__masthead">
            <span className="book-mark">
              <Ghost className="size-1/2 rounded-sm" />
            </span>
            <div className="flex flex-col gap-2">
              <Ghost className="h-2.5 w-20" />
              <Ghost className="h-3.5 w-32" />
            </div>
          </div>

          <Ghost className="h-4 w-32 rounded-sm" />
          {/* One bar at the display line's own height, not two button-shaped
              slabs. */}
          <Ghost className="h-[clamp(3rem,11vw,6rem)] w-3/5 rounded-md" />

          <hr className="book-rule book-rule--issue" />

          <div className="flex max-w-[46rem] flex-col gap-2.5">
            {DECK_LINES.map((w) => (
              <Ghost key={w} className="h-5" width={w} />
            ))}
          </div>

          <Ghost className="h-3 w-64" />
        </div>
      </div>

      <div className="book-frame">
        <div aria-hidden="true" className="book-rail book-rail--left">
          <Ghost className="h-2.5 w-24" />
          <div className="mt-5 flex flex-col gap-2.5">
            {RAIL_WIDTHS.map((w, i) => (
              <div key={i} className="flex items-center gap-2">
                <RailFolio n={i + 1} />
                <Ghost className="h-3 flex-none" pulse={i < 6} width={w} />
              </div>
            ))}
          </div>
        </div>

        <div className="book-column">
          {/* Contents */}
          <div className="book-measure pt-10">
            <div className="book-part__head">
              <span className="book-eyebrow">Contents</span>
            </div>
            {ENTRY_TITLE_WIDTHS.map((titleWidth, i) => (
              <div key={titleWidth} className="book-entry">
                <Ghost className="h-3.5 w-7 justify-self-start" pulse={i < 4} />
                <div className="flex flex-col gap-2">
                  <Ghost className="h-5" pulse={i < 4} width={titleWidth} />
                  <Ghost className="h-3" pulse={i < 4} width={ENTRY_DEK_WIDTHS[i]} />
                </div>
                <Ghost className="hidden h-3 w-12 md:block" pulse={i < 4} />
              </div>
            ))}
          </div>
        </div>

        <div aria-hidden="true" className="book-rail">
          <Ghost className="h-2.5 w-20" />
          <div className="mt-5 flex flex-col gap-3">
            {["80%", "62%", "71%", "58%"].map((w, i) => (
              <Ghost key={w} className="h-3" pulse={i < 2} width={w} />
            ))}
          </div>
          {/* The real At-a-glance labels: five rows of a two-column table, not
              one grey slab. */}
          <div className="border-rule mt-7 border-t pt-4">
            <span className="book-rail__title border-none pb-2">At a glance</span>
            <div className="mt-1 flex flex-col gap-2.5">
              {["Chapters", "Reading time", "Words", "Stars", "Installs"].map((label) => (
                <div key={label} className="flex items-baseline justify-between gap-3">
                  <span className="book-caption">{label}</span>
                  <Ghost className="h-3 w-10" pulse={false} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The chapter shell. Same frame, different rhythm: an opener block and a run
 * of paragraph lines, because that is what a chapter is.
 */
export function ChapterSkeleton() {
  return (
    <div
      className="book-frame"
      role="status"
      aria-busy="true"
      aria-label="Setting the chapter"
    >
      <span className="sr-only">Setting the chapter. One moment.</span>

      <div aria-hidden="true" className="book-rail book-rail--left">
        <Ghost className="h-2.5 w-24" />
        <div className="mt-5 flex flex-col gap-3">
          {[64, 48, 72, 56, 44].map((w, i) => (
            <Ghost key={w} className="h-3" pulse={i < 3} />
          ))}
        </div>
      </div>

      <div className="book-column">
        <div className="book-opener book-measure flex flex-col gap-5">
          <Ghost className="h-2.5 w-40" />
          <div className="flex flex-col gap-3">
            <Ghost className="h-[clamp(2rem,5vw,2.75rem)] w-4/5 rounded-md" />
            <Ghost className="h-[clamp(2rem,5vw,2.75rem)] w-2/5 rounded-md" />
          </div>
          <div className="flex flex-col gap-2.5">
            <Ghost className="h-4 w-11/12" />
            <Ghost className="h-4 w-3/5" />
          </div>
          <hr className="book-rule" />
        </div>

        <div className="book-measure mt-8 flex flex-col gap-8">
          {[0, 1, 2].map((block) => (
            <div key={block} className="flex flex-col gap-2.5">
              {["98%", "100%", "96%", "99%", "64%"].map((w, i) => (
                <Ghost key={w + i} className="h-4" pulse={block === 0} width={w} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div aria-hidden="true" className="book-rail">
        <Ghost className="h-2.5 w-24" />
        <div className="mt-5 flex flex-col gap-3">
          {[80, 62, 71, 55].map((w, i) => (
            <Ghost key={w} className="h-3" pulse={i < 2} />
          ))}
        </div>
      </div>
    </div>
  );
}
