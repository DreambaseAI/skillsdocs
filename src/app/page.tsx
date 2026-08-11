/**
 * The newsstand.
 *
 * Front-page order: the publication's own nameplate over a dateline of real
 * figures, then the fold — the submission line on the left, this week's cover
 * standing on the newsstand at the right — then the shelf of spines, then the
 * full contents. Everything above the fold exists to make one rule obvious:
 * change `github.com` to this host and you get a book.
 *
 * Never depends on a third party to render. `getFeaturedBooks()` is
 * contractually non-empty and falls back to a committed snapshot, so the page
 * has 89 books even with skills.sh unreachable.
 *
 * Cache Components: nothing here reads params, searchParams, cookies or
 * headers, and every data call is `use cache`, so the whole route prerenders.
 * The Suspense boundaries exist for the cold-instance case, where the cache
 * misses and the catalogue has to be rebuilt from the network — the dateline
 * figures, the cover plate and the shelf each land without reflowing the
 * furniture around them.
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import { Contents } from "@/components/home/contents";
import { ContentsSkeleton } from "@/components/home/contents-skeleton";
import { HeroCover, HeroCoverFallback } from "@/components/home/hero-cover";
import {
  IssueAccentRules,
  ownerAccentStyle,
} from "@/components/home/issue-accent";
import { Masthead } from "@/components/home/masthead";
import {
  Dateline,
  DatelineFallback,
  Nameplate,
} from "@/components/home/nameplate";
import { PaletteFallback, PaletteSlot } from "@/components/home/palette-slot";
import { SiteFooter } from "@/components/home/site-footer";
import { ShelfBooks, ShelfFallback } from "@/components/home/spine-shelf";
import { Typesetter } from "@/components/home/typesetter";
import { getFeaturedBooks } from "@/lib/featured";
import { JsonLd, siteJsonLd } from "@/lib/jsonld";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export const metadata: Metadata = {
  title: `${SITE_NAME} — ${SITE_TAGLINE}`,
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};

/** Entrance stagger: pure CSS via `@starting-style`, no hydration involved. */
const REVEAL =
  "transition-[opacity,translate] duration-500 ease-(--ease-out-quint) starting:opacity-0 motion-safe:starting:translate-y-2";

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
        strapline="Human readable skills"
        palette={
          <Suspense fallback={<PaletteFallback />}>
            <PaletteSlot />
          </Suspense>
        }
      />

      <main id="main" tabIndex={-1} className="bg-paper text-ink flex-1">
        {/* -------------------------------------------------- the nameplate */}
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <Nameplate />
          <div className="mt-6 sm:mt-8">
            <Suspense fallback={<DatelineFallback />}>
              <Dateline />
            </Suspense>
          </div>
        </div>

        {/* --------------------------------------------------------- the fold */}
        <section
          aria-labelledby="hero-heading"
          className="border-rule/70 border-b"
        >
          {/* `minmax(0, …)`: the field's intrinsic width must not steal track
              space from the headline's column. */}
          <div className="mx-auto grid max-w-6xl grid-cols-1 px-5 sm:px-8 lg:grid-cols-2">
            {/* The house side: headline and the submission line. */}
            <div
              data-issue="skillsdocs"
              style={ownerAccentStyle("skillsdocs")}
              className="flex flex-col justify-center gap-8 py-10 sm:gap-9 sm:py-14 lg:py-16 lg:pr-12"
            >
              <p
                className={`text-issue-accent flex items-center gap-3 font-mono text-[0.62rem] font-medium tracking-[0.22em] uppercase max-lg:hidden ${REVEAL}`}
              >
                <span className="bg-issue-accent h-px w-6" aria-hidden />
                Load skills here
              </p>

              <h2
                id="hero-heading"
                className={`font-display text-ink-strong text-[clamp(2rem,4.2vw,3rem)] leading-[1.05] tracking-[-0.022em] text-pretty ${REVEAL} delay-70`}
              >
                Human readable skills
                <br className="max-sm:hidden" /> for{" "}
                <em className="text-issue-accent italic">agents.</em>
              </h2>

              <div className={`${REVEAL} delay-140`}>
                <Typesetter />
              </div>
            </div>

            {/* The newsstand side: this week's cover, in its own colours. */}
            <div className="border-rule/70 max-lg:border-t lg:border-l">
              <Suspense fallback={<HeroCoverFallback />}>
                <HeroCover />
              </Suspense>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------- shelf and contents */}
        <div className="mx-auto flex max-w-6xl flex-col gap-16 px-5 py-14 sm:gap-20 sm:px-8 sm:py-20">
          <Suspense fallback={<ShelfFallback />}>
            <ShelfBooks />
          </Suspense>

          <Suspense fallback={<ContentsSkeleton />}>
            <ContentsSection />
          </Suspense>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
