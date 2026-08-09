import { cn } from "@/lib/utils";

/**
 * The subchapter shell.
 *
 * A bundled file is the one page of the book whose *shape* is unknown before
 * it loads: `references/FORMS.md` is prose and `scripts/extract.py` is a code
 * block, and they look nothing alike. So the shell commits to the parts that
 * are certain — the frame, the eyebrow, the display title, the provenance
 * line, the rails — and leaves the body as a single generous block rather
 * than guessing at paragraphs and being wrong half the time.
 *
 * Server-rendered and purely presentational, like every other shell here: it
 * has to exist before JavaScript does.
 */

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

/** Ragged, because the rail it replaces is a ragged nested list. */
const RAIL_WIDTHS = ["74%", "58%", "88%", "62%", "81%", "49%", "70%"];
const BODY_WIDTHS = ["97%", "100%", "93%", "99%", "88%", "100%", "71%"];

export function SubchapterSkeleton() {
  return (
    <div
      className="book-frame"
      role="status"
      aria-busy="true"
      aria-label="Setting the file"
    >
      <span className="sr-only">Setting the file. One moment.</span>

      <div aria-hidden="true" className="book-rail book-rail--left">
        <Ghost className="h-2.5 w-28" />
        <div className="mt-5 flex flex-col gap-3">
          {RAIL_WIDTHS.map((w, i) => (
            <Ghost key={w} className="h-3" pulse={i < 3} width={w} />
          ))}
        </div>
      </div>

      <div className="book-column">
        <div className="book-opener book-measure flex flex-col gap-5">
          <div className="flex items-baseline justify-between gap-4">
            <Ghost className="h-2.5 w-44" />
            <Ghost className="h-3 w-8" pulse={false} />
          </div>
          <Ghost className="h-[clamp(2.1rem,5.4vw,2.9rem)] w-3/5 rounded-md" />
          {/* The provenance line: a long mono path, then three short facts. */}
          <div className="flex flex-wrap items-baseline gap-2">
            <Ghost className="h-3 w-52" />
            <Ghost className="h-3 w-16" pulse={false} />
            <Ghost className="h-3 w-12" pulse={false} />
            <Ghost className="h-3 w-24" pulse={false} />
          </div>
          <hr className="book-rule book-rule--strong" />
        </div>

        <div className="book-measure mt-8 flex flex-col gap-2.5">
          {BODY_WIDTHS.map((w, i) => (
            <Ghost key={w + i} className="h-4" pulse={i < 5} width={w} />
          ))}
        </div>
      </div>

      <div aria-hidden="true" className="book-rail">
        <Ghost className="h-2.5 w-20" />
        <div className="mt-5 flex flex-col gap-3">
          {["76%", "58%"].map((w, i) => (
            <Ghost key={w} className="h-3" pulse={i < 1} width={w} />
          ))}
        </div>
        {/* The real "This file" labels — four rows of a two-column table. */}
        <div className="border-rule mt-7 border-t pt-4">
          <span className="book-rail__title border-none pb-2">This file</span>
          <div className="mt-1 flex flex-col gap-2.5">
            {["Type", "Size", "Lines", "Position"].map((label) => (
              <div key={label} className="flex items-baseline justify-between gap-3">
                <span className="book-caption">{label}</span>
                <Ghost className="h-3 w-10" pulse={false} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
