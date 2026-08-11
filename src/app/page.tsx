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
import { HeroEquation } from "@/components/home/hero-equation";
import { IssueAccentRules } from "@/components/home/issue-accent";
import { Masthead } from "@/components/home/masthead";
import { PaletteFallback, PaletteSlot } from "@/components/home/palette-slot";
import { Shelf } from "@/components/home/shelf";
import { SiteFooter } from "@/components/home/site-footer";
import { getFeaturedBooks } from "@/lib/featured";
import { JsonLd, siteJsonLd } from "@/lib/jsonld";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
} from "@/lib/site";

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
        <section
          aria-labelledby="hero-heading"
          className="border-rule/70 border-b"
        >
          {/* Single column: the equation is the headline, so it gets the full
              measure instead of sharing the fold with a card. */}
          <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-10 sm:gap-7 sm:px-8 sm:py-20">
            <p className="text-ink-muted text-[0.72rem] font-semibold tracking-[0.2em] uppercase">
              Turn a repo of skills into a book
            </p>
            <HeroEquation host={HOST} />
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
