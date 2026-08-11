/**
 * The nameplate: the publication's own front-page masthead.
 *
 * A giant display-face wordmark, a rule-flanked mission line, and a dateline
 * of the catalogue's real numbers. The wordmark and the two fixed cells paint
 * with the shell; only the counted cells wait on the catalogue, which is why
 * `Dateline` is an async island the page wraps in `<Suspense>` with
 * `DatelineFallback` — the strip never reflows, the figures just land.
 */

import { getFeaturedBooks } from "@/lib/featured";
import { SITE_NAME } from "@/lib/site";

/** Entrance: pure CSS via `@starting-style`, so no hydration is waited on. */
const REVEAL =
  "transition-[opacity,translate] duration-500 ease-(--ease-out-quint) starting:opacity-0 motion-safe:starting:translate-y-2";

export function Nameplate() {
  return (
    <div className="flex flex-col items-center gap-6 pt-8 text-center sm:gap-8 sm:pt-12">
      <h1
        className={`font-display text-ink-strong text-[clamp(3.8rem,13.5vw,10.5rem)] leading-[0.88] tracking-tight text-balance ${REVEAL}`}
      >
        {SITE_NAME}
      </h1>

      <div
        className={`flex w-full items-center gap-4 sm:gap-6 ${REVEAL} delay-70`}
      >
        <span className="bg-rule/80 h-px flex-1" aria-hidden />
        <p
          data-issue="skillsdocs"
          className="text-issue-accent font-mono text-[0.62rem] font-medium tracking-[0.22em] uppercase sm:text-[0.68rem]"
        >
          Turn a repo of skills into a book
        </p>
        <span className="bg-rule/80 h-px flex-1" aria-hidden />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- dateline */

function DatelineCell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`text-ink-muted border-rule/70 py-3.5 text-center font-mono text-[0.6rem] tracking-[0.14em] uppercase sm:text-[0.66rem] ${className}`}
    >
      {children}
    </div>
  );
}

/** The strip itself, so the async and fallback variants share one geometry. */
function DatelineStrip({
  issues,
  chapters,
}: {
  issues: React.ReactNode;
  chapters: React.ReactNode;
}) {
  return (
    <div className="border-rule/70 grid grid-cols-2 border-b sm:grid-cols-4">
      <DatelineCell>{issues} repos</DatelineCell>
      <DatelineCell className="border-rule/70 border-l">
        {chapters} skills
      </DatelineCell>
      <DatelineCell className="border-rule/70 border-t sm:border-t-0 sm:border-l">
        Loads any skills
      </DatelineCell>
      <DatelineCell className="border-rule/70 border-t border-l sm:border-t-0">
        No account needed
      </DatelineCell>
    </div>
  );
}

export async function Dateline() {
  const books = await getFeaturedBooks();
  const chapters = books.reduce((sum, book) => sum + book.skillCount, 0);

  return (
    <DatelineStrip
      issues={
        <span className="text-ink tabular-nums">
          {books.length.toLocaleString("en-GB")}
        </span>
      }
      chapters={
        <span className="text-ink tabular-nums">
          {chapters.toLocaleString("en-GB")}
        </span>
      }
    />
  );
}

/** Same strip, figures not yet inked. */
export function DatelineFallback() {
  const ghost = (
    <span
      className="bg-ink/10 inline-block h-[0.9em] w-8 translate-y-[0.12em] rounded-xs"
      aria-hidden
    />
  );
  return <DatelineStrip issues={ghost} chapters={ghost} />;
}
