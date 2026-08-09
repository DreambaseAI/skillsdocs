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

/** Widths that read as language rather than as a progress bar. */
const TITLE_LINES = ["62%", "38%"];
const STANDFIRST_LINES = ["94%", "88%", "51%"];
const ENTRY_TITLE_WIDTHS = ["46%", "58%", "39%", "63%", "44%", "52%"];
const ENTRY_DEK_WIDTHS = ["92%", "78%", "86%", "70%", "89%", "74%"];

export function BookSkeleton() {
  return (
    <div
      className="book-frame"
      role="status"
      aria-busy="true"
      aria-label="Setting the issue"
    >
      <span className="sr-only">Setting the issue. One moment.</span>

      <div aria-hidden="true" className="book-rail book-rail--left">
        <Ghost className="h-2.5 w-24" />
        <div className="mt-5 flex flex-col gap-3">
          {[64, 48, 72, 56, 44, 68].map((w, i) => (
            <Ghost key={i} className="h-3" pulse={i < 4} />
          ))}
        </div>
      </div>

      <div className="book-column">
        {/* Cover */}
        <div className="book-cover book-measure">
          <div className="flex items-center gap-4">
            <span className="book-mark" aria-hidden="true">
              <Ghost className="size-1/2 rounded-sm" />
            </span>
            <div className="flex flex-col gap-2">
              <Ghost className="h-2.5 w-20" />
              <Ghost className="h-3.5 w-32" />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {TITLE_LINES.map((w) => (
              <Ghost key={w} className="h-[clamp(2.5rem,8vw,5rem)] rounded-md" width={w} />
            ))}
          </div>

          <hr className="book-rule" />

          <div className="flex flex-col gap-2.5">
            {STANDFIRST_LINES.map((w) => (
              <Ghost key={w} className="h-4" width={w} />
            ))}
          </div>

          <div className="book-masthead mt-2">
            {["Owner", "Licence", "Updated", "Stars"].map((label) => (
              <div key={label} className="book-masthead__cell">
                <span className="book-masthead__label">{label}</span>
                <Ghost className="h-3.5 w-3/5" />
              </div>
            ))}
          </div>
        </div>

        {/* Contents */}
        <div className="book-measure mt-10">
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
          {[80, 62, 71].map((w, i) => (
            <Ghost key={w} className="h-3" pulse={i < 2} />
          ))}
        </div>
        <div className="border-rule mt-8 border-t pt-5">
          <Ghost className="h-16 w-full rounded-lg" pulse={false} />
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
