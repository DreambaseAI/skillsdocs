/**
 * The bookcase, shared by both shelf pages: `/share?repos=…` (the stateless
 * URL form) and `/share/[handle]` (a saved collection). The two differ only
 * in where the keys came from and what the hero says — the case, the spines,
 * the captions and the empty state are one implementation.
 *
 * Server component: chapter counts come from `getFeaturedBooks()`, and the
 * accent styles are computed here so the client bundle never sees the theme
 * derivation.
 */

import { StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { EditCollectionButton } from "@/components/home/edit-collection-button";
import { ownerAccentStyle } from "@/components/home/issue-accent";
import { ShareMenu } from "@/components/home/share-menu";
import { SharedOverlap } from "@/components/home/shared-overlap";
import { Spine, type ShelfRow } from "@/components/home/shelf";
import { getFeaturedBooks } from "@/lib/featured";
import { paths, SITE_NAME } from "@/lib/site";

const MONO_LABEL =
  "font-mono text-[0.62rem] font-medium tracking-[0.18em] uppercase";

export interface ShelfViewProps {
  /** Validated `owner`/`repo` pairs, in shelf order. */
  rows: readonly { owner: string; repo: string }[];
  /** The mono eyebrow above the title. */
  label: string;
  /** The h1 — "Favorite skills" for the URL form, the name for a saved one. */
  title: string;
  /** Absolute URL the share menu offers. */
  shareUrl: string;
  /** Body of the empty state, under the "An empty shelf" heading. */
  empty: ReactNode;
  /** Present only for the signed-in owner of a saved shelf: the edit popover
   * (rename, re-slug, delete). */
  edit?: { id: string; name: string; slug: string };
}

export async function ShelfView({
  rows: bare,
  label,
  title,
  shareUrl,
  empty,
  edit,
}: ShelfViewProps) {
  if (bare.length === 0) {
    return (
      <div className="flex flex-col items-start gap-5">
        <h1 className="font-display text-ink-strong text-4xl tracking-[-0.02em]">
          An empty shelf
        </h1>
        <p className="text-ink-muted max-w-prose">{empty}</p>
        <Link
          href={paths.home()}
          className="text-issue-accent font-medium underline decoration-1 underline-offset-4"
        >
          Browse the catalogue instead
        </Link>
      </div>
    );
  }

  const rows: ShelfRow[] = bare.map((row) => ({
    ...row,
    accent: ownerAccentStyle(row.owner),
  }));

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
            <p className={`${MONO_LABEL} text-issue-accent`}>{label}</p>
            <h1 className="font-display text-ink-strong mt-1 text-[clamp(2rem,6vw,3.2rem)] leading-none tracking-[-0.02em]">
              {title}
            </h1>
            {/* No shelf count: the case reflows with the window, so how many
                boards it takes is the browser's business, not a fact. */}
            <p className={`${MONO_LABEL} text-ink-muted mt-2.5`}>
              {rows.length} {rows.length === 1 ? "repo" : "repos"}
              {chapters > 0 ? <> · {chapters.toLocaleString("en-GB")} skills</> : null}
            </p>
          </div>
        </div>

        <span className="flex items-center gap-2">
          <ShareMenu
            url={shareUrl}
            title={`${title} — a shared shelf on ${SITE_NAME}`}
            summary={`${rows.length} ${rows.length === 1 ? "repo" : "repos"} of agent skills, shared as a shelf.`}
            label="Share"
            menuLabel="Share this shelf"
            className="border-rule text-ink hover:text-issue-accent rounded-full border"
          />
          {edit && (
            <EditCollectionButton
              kind="shelf"
              id={edit.id}
              name={edit.name}
              slug={edit.slug}
              className="border-rule text-ink hover:text-issue-accent rounded-full border"
            />
          )}
        </span>
      </div>

      {/* ------------------------------------------------------- the case */}
      {/* One grid, not chunked rows: books wrap with the window and every
          wrapped row stands on a painted board — narrower case, more shelves,
          for free. */}
      <div className="shelf-case border-rule mt-8 overflow-hidden rounded-lg border sm:mt-10">
        <ul aria-label="Repos on this shelf" className="bookcase px-4 sm:px-6">
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

/** The case before the data resolves: the furniture, no books yet. */
export function BookcaseFallback() {
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
