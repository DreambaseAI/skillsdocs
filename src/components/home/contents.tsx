/**
 * The contents page.
 *
 * Order of operations is editorial, not alphabetical: a cover story, three
 * secondary features, then the full index. The index repeats the four books
 * above it — a real contents page lists everything, including the cover story,
 * and a reader scanning for a specific repo should not have to know it was
 * promoted.
 *
 * The cover story is skills.sh's own editor's pick where there is one. That is
 * a deliberate choice to inherit someone else's editorial judgement rather
 * than invent ours: `featuredRepo`/`featuredSkill` is maintained by the people
 * who run the install registry, and it moves.
 *
 * ## The index is banded
 *
 * Eighty-nine rows at one weight is a wall, not an index. It is now a lead
 * band — the issues that carry the catalogue, given room to be read — and then
 * a set-solid index in two columns under band rules by order of magnitude. The
 * bands come from the install figures themselves rather than from a rank
 * cutoff, so the label a row sits under is a fact about the row.
 */

import { FeatureCard, IndexLeadRow, IndexTailRow, LeadStory } from "@/components/home/book-card";
import { chartSeedsFromTheme, InstallsBarChart } from "@/components/charts";
import { compact } from "@/components/home/format";
import { curatedManifest } from "@/components/home/issue-accent";
import { deriveIssueTheme } from "@/lib/design/theme";
import type { FeaturedBook } from "@/lib/featured";

export interface ContentsProps {
  books: FeaturedBook[];
}

/**
 * House colours for the one chart on this page.
 *
 * The book pages paint charts in their issue's own accent. The directory has no
 * single issue, so it uses the house identity — the curated `skillsdocs` seed,
 * run through the same `deriveIssueTheme` and therefore under the same contrast
 * guarantees as every other chart in the product.
 *
 * Curated, not hashed: with no manifest this falls through to an FNV hue off
 * the name, so the house colour would change the next time the name did.
 */
const HOUSE = "skillsdocs";
const HOUSE_CHART_SEEDS = chartSeedsFromTheme(
  deriveIssueTheme(HOUSE, curatedManifest(HOUSE)),
);

/** How many books the installs chart compares. Beyond this the bars are noise. */
const CHART_TOP_N = 12;

function pickLead(books: FeaturedBook[]): FeaturedBook {
  // Books arrive sorted by installs, so the first pick that carries an
  // editor's nomination is both endorsed and consequential.
  return books.find((book) => book.featuredSkill && book.skillCount > 1) ?? books[0];
}

/* ------------------------------------------------------------------ bands */

/** The lead band never collapses to nothing and never swallows the index. */
const LEAD_MIN = 6;
const LEAD_MAX = 12;

interface Band {
  id: string;
  label: string;
  /** Inclusive floor, in installs. */
  floor: number;
}

const BANDS: Band[] = [
  { id: "millions", label: "Millions", floor: 1_000_000 },
  { id: "hundred-thousands", label: "Hundreds of thousands", floor: 100_000 },
  { id: "ten-thousands", label: "Tens of thousands", floor: 10_000 },
  { id: "long-tail", label: "The long tail", floor: 0 },
];

function bandOf(installs: number): Band {
  return BANDS.find((band) => installs >= band.floor) ?? BANDS[BANDS.length - 1];
}

/**
 * How many books go in the lead band.
 *
 * Everything above a million installs, clamped, so the split is a property of
 * the catalogue rather than a number someone typed. With the current data that
 * is eleven; if skills.sh moves, the band moves with it and never becomes a
 * lone row or half the page.
 */
function leadCount(books: FeaturedBook[]): number {
  const millions = books.filter((book) => book.installs >= 1_000_000).length;
  return Math.min(LEAD_MAX, Math.max(LEAD_MIN, millions));
}

/** The column header a table this dense needs and did not have. */
function IndexHeader() {
  return (
    <div
      className="border-rule bg-paper/94 text-ink-muted sticky top-14 z-10 flex items-baseline gap-2 border-b py-1.5 pr-1 pl-1 text-[0.62rem] font-semibold tracking-[0.14em] uppercase backdrop-blur-sm"
      aria-hidden
    >
      <span className="w-6 shrink-0" />
      <span>Repository</span>
      <span className="flex-1" />
      <span className="w-10 shrink-0 text-right">Ch</span>
      <span className="w-12 shrink-0 text-right">Installs</span>
      <span className="w-9 shrink-0 sm:w-8" />
    </div>
  );
}

export function Contents({ books }: ContentsProps) {
  const lead = pickLead(books);
  const rank = new Map(books.map((book, i) => [`${book.owner}/${book.repo}`, i + 1]));
  const features = books.filter((book) => book !== lead).slice(0, 3);

  const chapters = books.reduce((sum, book) => sum + book.skillCount, 0);
  const installs = books.reduce((sum, book) => sum + book.installs, 0);
  const live = books.some((book) => book.live);

  const topInstalled = [...books]
    .sort((a, b) => b.installs - a.installs)
    .slice(0, CHART_TOP_N);

  const split = leadCount(books);
  const front = books.slice(0, split);
  const tail = books.slice(split);

  const grouped = BANDS.map((band) => ({
    band,
    rows: tail.filter((book) => bandOf(book.installs) === band),
  })).filter((group) => group.rows.length > 0);

  return (
    <div className="flex flex-col gap-16 sm:gap-20">
      {/* ------------------------------------------------------- cover story */}
      <section aria-labelledby="cover-heading">
        <h2 id="cover-heading" className="sr-only">
          Cover story
        </h2>
        <LeadStory book={lead} issue={rank.get(`${lead.owner}/${lead.repo}`) ?? 1} />
      </section>

      {/* --------------------------------------------------------- features */}
      {/*
        "Also in this issue" was wrong on its own terms: one repo is one issue,
        so three other repos are three other issues, and the cards under that
        heading each printed their own global folio — `01`, `03`, `04` — under
        a section that had just called itself `ISSUE 02`. The skipped number
        read as a card that failed to render.
      */}
      <section aria-labelledby="features-heading" className="flex flex-col gap-5">
        <div className="border-rule flex items-baseline justify-between gap-4 border-b pb-3">
          <h2
            id="features-heading"
            className="font-display text-ink-strong text-2xl tracking-[-0.015em]"
          >
            Also on the shelf
          </h2>
          <p className="text-ink-muted text-xs tracking-[0.12em] uppercase">Most installed</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {features.map((book, i) => (
            <FeatureCard key={`${book.owner}/${book.repo}`} book={book} issue={i + 1} />
          ))}
        </div>

        {/*
         * The one full chart on the homepage. The index rows below use a
         * word-sized inline SVG instead: eighty-nine canvases, each with a
         * mount-time measurement pass, is a performance problem rather than a
         * data graphic, and at that size a sparkline is typographic furniture.
         * Here the comparison between books is the actual point, so it earns
         * axes, a caption, and the data table underneath.
         */}
        <InstallsBarChart
          items={topInstalled.map((book) => ({
            label: `${book.owner}/${book.repo}`,
            installs: book.installs,
          }))}
          seeds={HOUSE_CHART_SEEDS}
          subject="the most-installed books on the shelf"
          className="mt-2"
        />
      </section>

      {/* ------------------------------------------------------------ index */}
      <section id="contents" aria-labelledby="index-heading" className="flex flex-col gap-5">
        <div className="border-ink-strong/80 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b-2 pb-3">
          <h2
            id="index-heading"
            className="font-display text-ink-strong text-3xl tracking-[-0.02em]"
          >
            The index
          </h2>
          <p className="text-ink-muted text-sm">
            <span className="text-ink-strong font-medium tabular-nums">{books.length}</span> books ·{" "}
            <span className="text-ink-strong font-medium tabular-nums">{chapters}</span> chapters ·{" "}
            <span className="text-ink-strong font-medium tabular-nums">{compact(installs)}</span>{" "}
            installs
          </p>
        </div>

        {/* --------------------------------------------------- the lead band */}
        <section aria-labelledby="index-lead-heading">
          <h3
            id="index-lead-heading"
            className="text-ink-muted mb-1 text-[0.66rem] font-semibold tracking-[0.16em] uppercase"
          >
            The front of the book · {front.length} most installed
          </h3>
          <ul className="flex flex-col">
            {front.map((book) => (
              <IndexLeadRow
                key={`${book.owner}/${book.repo}`}
                book={book}
                issue={rank.get(`${book.owner}/${book.repo}`) ?? 0}
              />
            ))}
          </ul>
        </section>

        {/* ------------------------------------------------ the set-solid index */}
        {grouped.length > 0 && (
          <section aria-labelledby="index-rest-heading" className="mt-6">
            <h3 id="index-rest-heading" className="sr-only">
              The rest of the index
            </h3>
            <IndexHeader />

            {grouped.map(({ band, rows }) => (
              <section key={band.id} aria-labelledby={`band-${band.id}`} className="mt-5">
                <h4
                  id={`band-${band.id}`}
                  className="border-rule text-ink-muted flex items-baseline justify-between gap-3 border-b pb-1 text-[0.66rem] font-semibold tracking-[0.16em] uppercase"
                >
                  <span>{band.label}</span>
                  <span className="text-ink-muted tabular-nums">{rows.length}</span>
                </h4>
                {/*
                  Two columns, not three. At 1152px three columns leave 384px a
                  row, and a 30-character repo name plus a leader plus two
                  figures does not fit in it. CSS columns keep DOM order, so
                  find-in-page and the accessibility tree still read straight
                  down the list.
                */}
                <ul className="mt-1 lg:columns-2 lg:gap-x-10">
                  {rows.map((book) => (
                    <IndexTailRow
                      key={`${book.owner}/${book.repo}`}
                      book={book}
                      issue={rank.get(`${book.owner}/${book.repo}`) ?? 0}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </section>
        )}

        <p className="text-ink-muted mt-2 text-xs">
          Chapter counts are verified against each repository&rsquo;s tree. Install counts come
          from skills.sh
          {live ? " and are live." : " and are the last good snapshot — the live feed is unreachable."}
          {" "}Arrows are the direction of the last eight weeks: <span aria-hidden>↑</span> up,{" "}
          <span aria-hidden>↓</span> down, <span aria-hidden>→</span> level within 5%.
        </p>
      </section>
    </div>
  );
}
