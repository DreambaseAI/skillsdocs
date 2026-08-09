/**
 * The newsstand.
 *
 * Three jobs, in order of importance:
 *
 * 1. Teach the URL swap. Everything above the fold exists to make one rule
 *    obvious — change `github.com` to this host and you get a book.
 * 2. Be a contents page, not a landing page. A lead story, three features, and
 *    a full typographic index of every verified repo.
 * 3. Never depend on a third party to render. `getFeaturedBooks()` is
 *    contractually non-empty and falls back to a committed snapshot, so the
 *    page has 89 books even with skills.sh unreachable.
 *
 * Cache Components: nothing here reads params, searchParams, cookies or
 * headers, and every data call is `use cache`, so the whole route prerenders.
 * The two Suspense boundaries exist for the cold-instance case, where the
 * cache misses and the catalogue has to be rebuilt from the network.
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import { Contents } from "@/components/home/contents";
import { ContentsSkeleton } from "@/components/home/contents-skeleton";
import { IssueAccentRules } from "@/components/home/issue-accent";
import { Masthead } from "@/components/home/masthead";
import { PaletteFallback, PaletteSlot } from "@/components/home/palette-slot";
import { RepoSwapField } from "@/components/home/repo-swap-field";
import { Shelf } from "@/components/home/shelf";
import { SiteFooter } from "@/components/home/site-footer";
import { getFeaturedBooks } from "@/lib/featured";
import { JsonLd, siteJsonLd } from "@/lib/jsonld";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: `${SITE_NAME} — ${SITE_TAGLINE}`,
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};

/** Bare host, so the hero can show the substitution rather than describe it. */
const HOST = new URL(SITE_URL).host;

async function ContentsSection() {
  const books = await getFeaturedBooks();
  return <Contents books={books} />;
}

export default function HomePage() {
  return (
    <>
      <JsonLd data={siteJsonLd()} />
      <IssueAccentRules />

      <Masthead
        strapline="Any skills repo, read as a book"
        palette={
          <Suspense fallback={<PaletteFallback />}>
            <PaletteSlot />
          </Suspense>
        }
      />

      <main id="main" tabIndex={-1} className="bg-paper text-ink flex-1">
        {/* ------------------------------------------------------------ hero */}
        {/* The gutter lives on the `max-w-6xl` box, not on the section around
            it. With the padding outside, the hero's content started 32px left
            of every other section on the page — `Your shelf`, `The index` and
            the masthead all measured 176 at 1440 while the hero measured 144,
            which reads as a misprint rather than as emphasis. */}
        <section aria-labelledby="hero-heading" className="border-rule/70 border-b">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start lg:gap-16">
            <div>
              <p className="text-ink-muted text-[0.72rem] font-semibold tracking-[0.2em] uppercase">
                One repo, one issue · One SKILL.md, one chapter
              </p>
              <h1
                id="hero-heading"
                className="font-display text-ink-strong mt-5 text-[clamp(2.4rem,6.5vw,4.25rem)] leading-[0.98] tracking-[-0.03em] text-balance"
              >
                Any repo of agent skills, read as a book.
              </h1>
              <p className="text-ink mt-6 max-w-xl text-lg leading-[1.55] text-pretty sm:text-xl">
                Typeset, branded to the owner&rsquo;s own design system, and served as clean
                markdown to whichever agent asks for it. No clone, no file browser, no
                twelve-point grey on white.
              </p>
            </div>

            <div className="border-rule bg-paper-raised/50 rounded-3xl border p-5 sm:p-7">
              <RepoSwapField host={HOST} />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- contents */}
        <div className="mx-auto flex max-w-6xl flex-col gap-16 px-5 py-14 sm:gap-20 sm:px-8 sm:py-20">
          <Shelf />

          <Suspense fallback={<ContentsSkeleton />}>
            <ContentsSection />
          </Suspense>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
