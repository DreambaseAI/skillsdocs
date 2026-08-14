/**
 * A shared shelf.
 *
 * `/share?repos=anthropics/skills,vercel/ai` renders the named books as a
 * bookcase — one shelf per twelve spines, in each owner's own colours. The
 * whole shelf lives in the URL: no account, no database, nothing stored.
 * Starring any spine copies it onto the visitor's own device shelf, which is
 * the entire "import" story.
 *
 * Cache Components: the page reads `searchParams`, so everything derived from
 * it sits inside a `<Suspense>` boundary; the chrome prerenders as the shell.
 * Robots are told not to index — these are reader-generated permutations, not
 * canonical pages.
 */

import { StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { IssueAccentRules, ownerAccentStyle } from "@/components/home/issue-accent";
import { Masthead } from "@/components/home/masthead";
import { PaletteFallback, PaletteSlot } from "@/components/home/palette-slot";
import { ShareMenu } from "@/components/home/share-menu";
import { SharedOverlap } from "@/components/home/shared-overlap";
import { Spine, type ShelfRow } from "@/components/home/shelf";
import { SiteFooter } from "@/components/home/site-footer";
import { getFeaturedBooks } from "@/lib/featured";
import { parseShareRepos } from "@/lib/share";
import { absoluteUrl, paths, SITE_NAME } from "@/lib/site";

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
      ? `${rows.length} ${rows.length === 1 ? "book" : "books"} of agent skills, hand-picked and shared as a shelf.`
      : "A hand-picked shelf of agent-skills books, shared as a single link.";

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
                alt: `A shelf of ${rows.length} agent-skills ${rows.length === 1 ? "book" : "books"}`,
              },
            ],
          }
        : {}),
    },
    twitter: { card: rows.length > 0 ? "summary_large_image" : "summary" },
  };
}

const MONO_LABEL =
  "font-mono text-[0.62rem] font-medium tracking-[0.18em] uppercase";

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
  const rows: ShelfRow[] = parseShareRepos(repos).map((row) => ({
    ...row,
    accent: ownerAccentStyle(row.owner),
  }));

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-start gap-5">
        <h1 className="font-display text-ink-strong text-4xl tracking-[-0.02em]">
          An empty shelf
        </h1>
        <p className="text-ink-muted max-w-prose">
          This link names no books — it may have been trimmed in transit. A
          shared shelf looks like{" "}
          <code className="text-ink font-mono text-[0.85em]">
            /share?repos=anthropics/skills,vercel/ai
          </code>
          .
        </p>
        <Link
          href={paths.home()}
          className="text-issue-accent font-medium underline decoration-1 underline-offset-4"
        >
          Browse the catalogue instead
        </Link>
      </div>
    );
  }

  // Chapter counts for the books we have verified; unknown repos still get a
  // spine — the shelf is the reader's, not the catalogue's.
  const catalogue = await getFeaturedBooks();
  const known = new Map(
    catalogue.map((book) => [
      `${book.owner}/${book.repo}`.toLowerCase(),
      book.skillCount,
    ]),
  );
  const chapters = rows.reduce(
    (sum, row) => sum + (known.get(`${row.owner}/${row.repo}`.toLowerCase()) ?? 0),
    0,
  );

  const shareUrl = absoluteUrl(
    paths.share(rows.map((row) => `${row.owner}/${row.repo}`)),
  );

  return (
    <div
      data-issue="skillsdocs"
      style={ownerAccentStyle("skillsdocs")}
      className="flex flex-col"
    >
      {/* ------------------------------------------------------------ hero */}
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-5">
        <div className="flex min-w-0 items-center gap-5">
          <span
            className="cover-face cover-face--flat flex size-14 shrink-0 items-center justify-center rounded-2xl sm:size-16"
            aria-hidden
          >
            <HugeiconsIcon icon={StarIcon} className="size-6 fill-current" />
          </span>
          <div className="min-w-0">
            <p className={`${MONO_LABEL} text-issue-accent`}>Shared skills</p>
            <h1 className="font-display text-ink-strong mt-1 text-[clamp(2rem,6vw,3.2rem)] leading-none tracking-[-0.02em]">
              Favorite skills
            </h1>
            {/* No shelf count: the case reflows with the window, so how many
                boards it takes is the browser's business, not a fact. */}
            <p className={`${MONO_LABEL} text-ink-muted mt-2.5`}>
              {rows.length} {rows.length === 1 ? "book" : "books"}
              {chapters > 0 ? <> · {chapters.toLocaleString("en-GB")} skills</> : null}
            </p>
          </div>
        </div>

        <ShareMenu
          url={shareUrl}
          title={`Favorite skills — a shared shelf on ${SITE_NAME}`}
          summary={`${rows.length} ${rows.length === 1 ? "book" : "books"} of agent skills, shared as a shelf.`}
          label="Share"
          className="border-rule text-ink hover:text-issue-accent rounded-full border"
        />
      </div>

      {/* ------------------------------------------------------- the case */}
      {/* One grid, not chunked rows: books wrap with the window and every
          wrapped row stands on a painted board — narrower case, more shelves,
          for free. */}
      <div className="shelf-case border-rule mt-8 overflow-hidden rounded-lg border sm:mt-10">
        <ul
          aria-label="Books on this shelf"
          className="bookcase px-4 sm:px-6"
        >
          {rows.map((row) => (
            <Spine key={`${row.owner}/${row.repo}`} row={row} />
          ))}
        </ul>
      </div>

      {/* -------------------------------------------------------- captions */}
      <div className="text-ink-muted mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 font-mono text-[0.62rem] tracking-[0.14em] uppercase">
        <span>Star any spine to copy it onto your own shelf</span>
        <SharedOverlap books={rows} />
      </div>
    </div>
  );
}

/** The case before the params resolve: the furniture, no books yet. */
function BookcaseFallback() {
  return (
    <div aria-hidden className="flex flex-col">
      <div className="flex items-center gap-5">
        <span className="bg-ink/10 size-14 rounded-2xl sm:size-16" />
        <div className="flex flex-col gap-2.5">
          <span className="bg-ink/10 h-2.5 w-24 rounded-xs" />
          <span className="bg-ink/10 h-9 w-56 rounded-sm" />
          <span className="bg-ink/10 h-2.5 w-40 rounded-xs" />
        </div>
      </div>
      <div className="shelf-case border-rule mt-8 h-80 rounded-lg border sm:mt-10" />
    </div>
  );
}
