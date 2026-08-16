/**
 * A shared shelf, the stateless form.
 *
 * `/share/repos?repos=anthropics/skills,vercel/ai` renders the named repos as
 * a bookcase — one shelf per twelve spines, in each owner's own colours. The
 * whole shelf lives in the URL: no account, no database, nothing stored.
 * Starring any spine copies it onto the visitor's own device shelf, which is
 * the entire "import" story. Saved, named shelves live at
 * `/username/repos/<slug>`.
 *
 * Cache Components: the page reads `searchParams`, so everything derived from
 * it sits inside a `<Suspense>` boundary; the chrome prerenders as the shell.
 * Robots are told not to index — these are reader-generated permutations, not
 * canonical pages.
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import { IssueAccentRules } from "@/components/home/issue-accent";
import { Masthead } from "@/components/home/masthead";
import { PaletteFallback, PaletteSlot } from "@/components/home/palette-slot";
import { SiteFooter } from "@/components/home/site-footer";
import { parseShareRepos } from "@/lib/share";
import { absoluteUrl, paths, SITE_NAME } from "@/lib/site";
import {
  BookcaseFallback,
  ShelfView,
} from "@/components/collections/shelf-view";

/**
 * Per-URL metadata: the OG card is the shelf itself, rendered by
 * `/api/og/share` from the same `repos` value, so the preview a link unfurls
 * with shows the actual books being shared.
 */
export async function generateMetadata(props: {
  searchParams: Promise<{ repos?: string | string[] }>;
}): Promise<Metadata> {
  const { repos } = await props.searchParams;
  const rows = parseShareRepos(repos);

  const title = "A shared shelf";
  const description =
    rows.length > 0
      ? `${rows.length} ${rows.length === 1 ? "repo" : "repos"} of agent skills, hand-picked and shared as a shelf.`
      : "A hand-picked shelf of agent-skills repos, shared as a single link.";

  return {
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: {
      title: `Favorite skills — a shared shelf`,
      description,
      siteName: SITE_NAME,
      ...(rows.length > 0
        ? {
            images: [
              {
                url: `/api/og/share?repos=${rows
                  .map((row) => `${row.owner}/${row.repo}`)
                  .join(",")}`,
                width: 1200,
                height: 630,
                alt: `A shelf of ${rows.length} agent-skills ${rows.length === 1 ? "repo" : "repos"}`,
              },
            ],
          }
        : {}),
    },
    twitter: { card: rows.length > 0 ? "summary_large_image" : "summary" },
  };
}

export default function SharePage(props: {
  searchParams: Promise<{ repos?: string | string[] }>;
}) {
  return (
    <>
      <IssueAccentRules />
      <Masthead
        strapline="A shared shelf"
        palette={
          <Suspense fallback={<PaletteFallback />}>
            <PaletteSlot />
          </Suspense>
        }
      />
      <main id="main" tabIndex={-1} className="bg-paper text-ink flex-1">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
          <Suspense fallback={<BookcaseFallback />}>
            <SharedShelf searchParams={props.searchParams} />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

async function SharedShelf({
  searchParams,
}: {
  searchParams: Promise<{ repos?: string | string[] }>;
}) {
  const { repos } = await searchParams;
  const rows = parseShareRepos(repos);

  return (
    <ShelfView
      rows={rows}
      label="Shared skills"
      title="Favorite skills"
      shareUrl={absoluteUrl(
        paths.share(rows.map((row) => `${row.owner}/${row.repo}`)),
      )}
      empty={
        <>
          This link names no repos — it may have been trimmed in transit. A
          shared shelf looks like{" "}
          <code className="text-ink font-mono text-[0.85em]">
            /share/repos?repos=anthropics/skills,vercel/ai
          </code>
          .
        </>
      }
    />
  );
}
