/**
 * The site 404.
 *
 * A directory's 404 has one job beyond apologising: get the reader to the
 * thing they wanted. So it states what was asked for, explains the two reasons
 * a repository path can miss — no such repo, or a repo with no `SKILL.md` —
 * and puts the swap field right there rather than a link back to the home
 * page.
 *
 * Suggestions come from the seed catalogue synchronously. This page must
 * render with no network at all: it is what a reader sees when something has
 * already gone wrong.
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { AttemptedPath } from "@/components/home/attempted-path";
import { IssueAccentRules } from "@/components/home/issue-accent";
import { Masthead } from "@/components/home/masthead";
import { PaletteFallback, PaletteSlot } from "@/components/home/palette-slot";
import { RepoSwapField } from "@/components/home/repo-swap-field";
import { SiteFooter } from "@/components/home/site-footer";
import { SEED_REPOS } from "@/lib/data/seed-repos";
import { SITE_URL, paths } from "@/lib/site";

export const metadata: Metadata = {
  title: "Not found",
  robots: { index: false, follow: false },
};

const HOST = new URL(SITE_URL).host;

/** Six well-known books, network-free, straight out of the seed catalogue. */
const SUGGESTIONS = [...SEED_REPOS]
  .sort((a, b) => b.installs - a.installs)
  .filter((seed) => seed.skillCount > 1)
  .slice(0, 6);

export default function NotFound() {
  return (
    <>
      <IssueAccentRules />

      <Masthead
        palette={
          <Suspense fallback={<PaletteFallback />}>
            <PaletteSlot />
          </Suspense>
        }
      />

      <main id="main" tabIndex={-1} className="bg-paper text-ink flex-1">
        <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
          <p className="text-ink-muted text-[0.72rem] font-semibold tracking-[0.2em] uppercase">
            404 · Not in this issue
          </p>
          <h1 className="font-display text-ink-strong mt-4 text-[clamp(2.2rem,6vw,3.5rem)] leading-[1.02] tracking-[-0.03em] text-balance">
            There is no book at this address.
          </h1>

          <div className="mt-8">
            <AttemptedPath />
          </div>

          <div className="border-rule bg-paper-raised/50 mt-6 rounded-3xl border p-5 sm:p-7">
            <RepoSwapField host={HOST} />
          </div>

          <section aria-labelledby="suggestions-heading" className="mt-12">
            <h2
              id="suggestions-heading"
              className="border-rule text-ink-muted border-b pb-2 text-[0.7rem] font-semibold tracking-[0.16em] uppercase"
            >
              Or start with one of these
            </h2>
            <ul className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
              {SUGGESTIONS.map((seed) => (
                <li key={`${seed.owner}/${seed.repo}`}>
                  <Link
                    href={paths.book(seed.owner, seed.repo)}
                    className="text-ink hover:text-issue-accent flex items-baseline gap-3 py-1.5 transition-colors"
                  >
                    <span className="truncate">
                      <span className="text-ink-muted">{seed.owner}/</span>
                      <span className="font-medium">{seed.repo}</span>
                    </span>
                    <span className="text-ink-muted ml-auto shrink-0 text-xs tabular-nums">
                      {seed.skillCount} ch
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm">
              <Link
                href={paths.home()}
                className="text-issue-accent underline decoration-1 underline-offset-4"
              >
                See the full index
              </Link>
            </p>
          </section>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
