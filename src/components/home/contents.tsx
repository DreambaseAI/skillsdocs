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
 */

import { FeatureCard, IndexRow, LeadStory } from "@/components/home/book-card";
import { compact } from "@/components/home/format";
import type { FeaturedBook } from "@/lib/featured";

export interface ContentsProps {
  books: FeaturedBook[];
}

function pickLead(books: FeaturedBook[]): FeaturedBook {
  // Books arrive sorted by installs, so the first pick that carries an
  // editor's nomination is both endorsed and consequential.
  return books.find((book) => book.featuredSkill && book.skillCount > 1) ?? books[0];
}

export function Contents({ books }: ContentsProps) {
  const lead = pickLead(books);
  const rank = new Map(books.map((book, i) => [`${book.owner}/${book.repo}`, i + 1]));
  const features = books.filter((book) => book !== lead).slice(0, 3);

  const chapters = books.reduce((sum, book) => sum + book.skillCount, 0);
  const installs = books.reduce((sum, book) => sum + book.installs, 0);
  const live = books.some((book) => book.live);

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
      <section aria-labelledby="features-heading" className="flex flex-col gap-5">
        <div className="border-rule flex items-baseline justify-between gap-4 border-b pb-3">
          <h2
            id="features-heading"
            className="font-display text-ink-strong text-2xl tracking-[-0.015em]"
          >
            Also in this issue
          </h2>
          <p className="text-ink-muted text-xs tracking-[0.12em] uppercase">Most installed</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {features.map((book) => (
            <FeatureCard
              key={`${book.owner}/${book.repo}`}
              book={book}
              issue={rank.get(`${book.owner}/${book.repo}`) ?? 0}
            />
          ))}
        </div>
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

        <ul className="flex flex-col">
          {books.map((book) => (
            <IndexRow
              key={`${book.owner}/${book.repo}`}
              book={book}
              issue={rank.get(`${book.owner}/${book.repo}`) ?? 0}
            />
          ))}
        </ul>

        <p className="text-ink-muted text-xs">
          Chapter counts are verified against each repository&rsquo;s tree. Install counts come
          from skills.sh
          {live ? " and are live." : " and are the last good snapshot — the live feed is unreachable."}
        </p>
      </section>
    </div>
  );
}
