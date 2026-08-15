/**
 * A saved shelf: `/share/<slug>` or `/share/<uuid>`.
 *
 * The collection lives in Postgres, named and slugged by its owner on
 * `/library`. Rendering is identical to the stateless `/share?repos=` form —
 * same bookcase, same spines — only the keys' provenance and the hero's title
 * differ. The uuid form of the URL survives any slug rename, so the canonical
 * always points at the slug.
 *
 * Cache Components: the page reads `params`, so the shelf sits inside
 * `<Suspense>`; the chrome prerenders as the shell. The DB read is dynamic
 * and uncached — a saved shelf must show its latest edit immediately.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cache } from "react";
import { IssueAccentRules } from "@/components/home/issue-accent";
import { Masthead } from "@/components/home/masthead";
import { PaletteFallback, PaletteSlot } from "@/components/home/palette-slot";
import { SiteFooter } from "@/components/home/site-footer";
import { getCollectionByHandle } from "@/lib/collections";
import { parseShareRepos } from "@/lib/share";
import { absoluteUrl, paths, SITE_NAME } from "@/lib/site";
import { BookcaseFallback, ShelfView } from "../shelf-view";

/** One DB read per request, shared by metadata and page. */
const loadShelf = cache((handle: string) =>
  getCollectionByHandle("shelf", handle),
);

export async function generateMetadata(props: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await props.params;
  const shelf = await loadShelf(handle);
  if (!shelf) return { robots: { index: false } };

  const count = shelf.items.length;
  const description =
    count > 0
      ? `${count} ${count === 1 ? "book" : "books"} of agent skills, hand-picked and shared as a shelf.`
      : "A hand-picked shelf of agent-skills books, shared as a single link.";

  return {
    title: shelf.name,
    description,
    // Reader content, not catalogue content — same policy as /share?repos=.
    robots: { index: false, follow: true },
    // The slug is the address; the uuid is the backup key.
    alternates: { canonical: paths.sharedShelf(shelf.slug) },
    openGraph: {
      title: `${shelf.name} — a shared shelf`,
      description,
      siteName: SITE_NAME,
      ...(count > 0
        ? {
            images: [
              {
                url: `/api/og/share?handle=${encodeURIComponent(shelf.slug)}`,
                width: 1200,
                height: 630,
                alt: `A shelf of ${count} agent-skills ${count === 1 ? "book" : "books"}`,
              },
            ],
          }
        : {}),
    },
    twitter: { card: count > 0 ? "summary_large_image" : "summary" },
  };
}

export default function SavedShelfPage(props: PageProps<"/share/[handle]">) {
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
            <SavedShelf params={props.params} />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

async function SavedShelf({
  params,
}: Pick<PageProps<"/share/[handle]">, "params">) {
  const { handle } = await params;
  const shelf = await loadShelf(handle);
  if (!shelf) notFound();

  // Items are already validated on write; parsing again costs nothing and
  // keeps this page honest about what it will render.
  const rows = parseShareRepos(shelf.items.join(","));

  return (
    <ShelfView
      rows={rows}
      label="A saved shelf"
      title={shelf.name}
      shareUrl={absoluteUrl(paths.sharedShelf(shelf.slug))}
      empty={<>This shelf is empty — its owner has not put any books on it yet.</>}
    />
  );
}
