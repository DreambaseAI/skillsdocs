/**
 * `/search?q=` — the full corpus, matched on the server.
 *
 * This is where the ⌘K palette's honesty lives. The palette carries a slice of
 * the index into the browser; this page queries all of it, so "search
 * everything" means what it says.
 *
 * Cache Components: `searchParams` is a promise and is awaited *inside* the
 * Suspense boundary, never above it. Awaiting it in the page component would
 * tie the route's prerendered shell to one query string.
 *
 * The form is a plain `GET` with no client JavaScript. Search that stops
 * working when a bundle fails to load is not search.
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { IssueAccentRules } from "@/components/home/issue-accent";
import { Masthead } from "@/components/home/masthead";
import { PaletteFallback, PaletteSlot } from "@/components/home/palette-slot";
import { getSearchIndex } from "@/components/home/search-index";
import { SearchResults } from "@/components/home/search-results";
import { SiteFooter } from "@/components/home/site-footer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MAX_QUERY, search } from "@/lib/search";
import { paths, parseRepoReference } from "@/lib/site";

/** Enough to be exhaustive without rendering 2,000 rows into the document. */
const RESULT_LIMIT = 80;

export const metadata: Metadata = {
  title: "Search",
  description: "Search every chapter and every book in the index.",
  // A results page is not a canonical document; keep it out of the index.
  robots: { index: false, follow: true },
};

function SearchField({ query }: { query: string }) {
  return (
    <form action={paths.search()} method="get" role="search" className="flex gap-2">
      <div className="border-rule bg-paper-raised focus-within:border-issue-accent focus-within:ring-issue-accent/25 flex h-12 flex-1 items-center gap-2 rounded-2xl border px-4 transition-colors focus-within:ring-3">
        <HugeiconsIcon icon={Search01Icon} className="text-ink-muted size-4 shrink-0" aria-hidden />
        <label htmlFor="search-q" className="sr-only">
          Search chapters and books
        </label>
        <input
          id="search-q"
          name="q"
          type="search"
          defaultValue={query}
          maxLength={MAX_QUERY}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder="Search chapters, books, or paste a repo URL…"
          className="text-ink placeholder:text-ink-muted/60 h-full min-w-0 flex-1 bg-transparent text-base outline-none"
        />
      </div>
      <Button type="submit" size="lg" className="h-12 shrink-0 px-5">
        Search
      </Button>
    </form>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/search">, "searchParams">) {
  const params = await searchParams;
  const raw = params.q;
  const query = (Array.isArray(raw) ? raw[0] : (raw ?? "")).slice(0, MAX_QUERY).trim();

  const docs = await getSearchIndex();
  const pasted = query ? parseRepoReference(query) : null;

  // A pasted URL tokenises to ["https", "github", "com", "expo", "skills"],
  // and requiring all five to match turns a clear intent into noise. Match on
  // the reference itself; the raw string stays in the field for the reader.
  const matched = pasted ? `${pasted.owner} ${pasted.repo}` : query;
  const hits = matched ? search(docs, matched, { limit: RESULT_LIMIT }) : [];
  const total = docs.length;

  return (
    <div className="flex flex-col gap-8">
      <SearchField query={query} />

      {query === "" ? (
        <p className="text-ink-muted text-sm">
          {total.toLocaleString("en-US")} chapters and books are indexed. Try a topic
          (&ldquo;pdf&rdquo;, &ldquo;testing&rdquo;), an owner (&ldquo;vercel&rdquo;), or paste a
          repository URL.
        </p>
      ) : (
        <>
          {/* A pasted reference is a destination, not a query — and it may well
              be a repo we have never indexed, which search alone cannot serve. */}
          {pasted && (
            <Link
              href={paths.book(pasted.owner, pasted.repo)}
              className="border-issue-accent/40 bg-paper-raised/60 hover:border-issue-accent flex items-center justify-between gap-4 rounded-2xl border p-5 transition-colors"
            >
              <span>
                <span className="text-ink-muted text-[0.7rem] font-semibold tracking-[0.14em] uppercase">
                  Open the book
                </span>
                <span className="font-display text-ink-strong mt-1 block text-2xl tracking-[-0.02em]">
                  <span className="text-ink-muted font-normal">{pasted.owner}/</span>
                  {pasted.repo}
                </span>
              </span>
              <span className="text-issue-accent shrink-0 text-sm">Read &rarr;</span>
            </Link>
          )}

          <p className="text-ink-muted text-sm" role="status">
            {hits.length === 0
              ? `No matches for “${query}”.`
              : `${hits.length}${hits.length === RESULT_LIMIT ? "+" : ""} ${
                  hits.length === 1 ? "match" : "matches"
                } for “${query}”.`}
          </p>

          {hits.length > 0 ? (
            <SearchResults hits={hits} query={matched} />
          ) : (
            !pasted && (
              <div className="border-rule/70 rounded-2xl border border-dashed p-8">
                <p className="text-ink">Nothing in the index matches that.</p>
                <ul className="text-ink-muted mt-4 flex list-disc flex-col gap-1.5 pl-5 text-sm">
                  <li>Chapter titles come from skills.sh, so a brand-new skill may not be listed yet.</li>
                  <li>
                    Paste the repository instead — <code className="font-mono">owner/repo</code>{" "}
                    opens any book, indexed or not.
                  </li>
                  <li>
                    Or start from{" "}
                    <Link href={paths.home()} className="text-issue-accent underline underline-offset-4">
                      the index
                    </Link>
                    .
                  </li>
                </ul>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-hidden="true">
      <Skeleton className="h-12 w-full rounded-2xl" />
      <Skeleton className="h-4 w-48" />
      <div className="flex flex-col gap-5">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="size-9 rounded-lg" />
            <div className="flex-1">
              <Skeleton className="h-4" style={{ maxWidth: `${60 - i * 4}%` }} />
              <Skeleton className="mt-2 h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SearchPage(props: PageProps<"/search">) {
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
        <div className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
          <h1 className="font-display text-ink-strong mb-8 text-4xl tracking-[-0.025em]">Search</h1>
          <Suspense fallback={<ResultsSkeleton />}>
            <Results searchParams={props.searchParams} />
          </Suspense>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
