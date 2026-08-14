"use client";

/**
 * "Your shelf" — the reader's starred books standing as spines on a board.
 *
 * Two states, one piece of furniture:
 *
 * - **Empty.** The case stands open: the catalogue's lead books are racked as
 *   ghost spines — ink drained, waking on hover — behind a plate that reads
 *   "Your favorite skills". Every ghost's star is live; starring one is what
 *   fills the shelf, so the empty state is the tutorial.
 * - **Starred.** The reader's books stand at the front in full ink, the
 *   heading becomes "Your favorite skills", and a Share control publishes the
 *   shelf as a `/share` link built from nothing but the `owner/repo` keys.
 *
 * The featured rows arrive from the server (`ShelfBooks`) with their owner
 * accents already derived; anything the reader has starred that is *not* in
 * that list gets a spine from the `localStorage` key alone —
 * `github.com/<owner>.png` is a stable avatar endpoint, so a book starred
 * from any repo on GitHub still renders, in the house colours.
 *
 * Spine geometry is a hash of the repo name: real shelves are ragged, and a
 * deterministic hash keeps them ragged the same way on every render.
 */

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { BoardStrip } from "@/components/home/board-strip";
import { announce } from "@/components/chrome/live-regions";
import { COVER_STAR_CLASS } from "@/components/home/cover-star";
import { FavoriteButton } from "@/components/home/favorite-button";
import { ownerAccentStyle } from "@/components/home/issue-accent";
import { ShareMenu } from "@/components/home/share-menu";
import { Button } from "@/components/ui/button";
import { favoriteKey, useFavorites } from "@/hooks/use-favorites";
import { capture } from "@/lib/analytics";
import { absoluteUrl, external, paths, SITE_NAME } from "@/lib/site";
import { cn } from "@/lib/utils";

export interface ShelfRow {
  owner: string;
  repo: string;
  /** Owner accent custom properties, derived server-side. */
  accent?: CSSProperties;
}

/** FNV-1a, for spine geometry. Deterministic: no layout shift, ever. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Three typographic voices, hash-assigned, the way a real shelf mixes
 * publishers: the display serif, a mono label, a grotesque caption. Each
 * carries its ceiling size and an average-glyph factor so the title can be
 * scaled to the spine — a long name gets smaller type, never an amputation.
 */
const SPINE_VOICES = [
  // Glyph factors are average advance widths with ~12% slack: a title cut off
  // at the board is an amputation, so the estimate must always err small.
  { className: "font-display font-normal", max: 21, glyph: 0.6 },
  {
    className: "font-mono font-medium tracking-[0.16em] uppercase",
    max: 13.5,
    glyph: 0.88,
  },
  {
    className: "font-semibold tracking-[0.13em] uppercase",
    max: 14.5,
    glyph: 0.85,
  },
] as const;

/** Vertical room the star, the avatar and the padding take from the title. */
const SPINE_FURNITURE = 110;

/** One book as a spine. Shared with the `/share` bookcase. */
export function Spine({
  row,
  ghost,
  className,
}: {
  row: ShelfRow;
  ghost?: boolean;
  className?: string;
}) {
  const hash = fnv1a(`${row.owner}/${row.repo}`);
  // Unsigned shifts: `>>` on a hash above 2^31 goes negative, and a negative
  // index into the voices array is an `undefined` voice and a crashed shelf.
  const width = 62 + (hash % 35); // 62–96px
  const height = 240 + ((hash >>> 5) % 84); // 240–323px
  const voice = SPINE_VOICES[(hash >>> 11) % SPINE_VOICES.length];
  // A repo just called "skills" is anonymous on a shelf; bind the owner in.
  const label = /^(agent-)?skills$/i.test(row.repo)
    ? `${row.owner}/${row.repo}`
    : row.repo;
  const fontSize = Math.max(
    10,
    Math.min(voice.max, (height - SPINE_FURNITURE) / (label.length * voice.glyph)),
  );

  return (
    <li
      data-issue={row.owner.toLowerCase()}
      style={{ ...row.accent, width, height }}
      className={cn("spine", ghost && "spine--ghost", className)}
    >
      <FavoriteButton
        owner={row.owner}
        repo={row.repo}
        className={cn(COVER_STAR_CLASS, "relative z-1")}
      />
      <Link
        href={paths.book(row.owner, row.repo)}
        className={cn("spine__title", voice.className)}
        style={{ fontSize }}
      >
        {label}
      </Link>
      <Image
        src={external.avatar(row.owner, 64)}
        alt=""
        width={28}
        height={28}
        className="spine__avatar size-7 shrink-0"
        aria-hidden
      />
    </li>
  );
}

export interface SpineRailProps {
  rows: ShelfRow[];
  /** Size of the whole catalogue, for the "browse all" line. */
  total: number;
}

/** How many ghost spines rack the empty case. Fewer than the full rail: they
 * are set dressing behind the plate, not a listing. */
const GHOST_COUNT = 8;

export function SpineRail({ rows, total }: SpineRailProps) {
  const { keys, clear, ready } = useFavorites();

  // The filled shelf holds the starred books and nothing else — the featured
  // rows exist only to be ghosts in the empty case. A starred book that is in
  // the featured list keeps its server-derived accent; one starred from
  // anywhere else gets a spine from its `localStorage` key alone, with the
  // accent derived here. `ownerAccentStyle` is deterministic colour maths
  // (the same call the server makes), so a spine keeps the exact identity it
  // has on its book page and on `/share` — a starred book losing its colours
  // because it fell outside the front page's top rows read as a bug, and was.
  const featured = new Map(
    rows.map((row) => [favoriteKey(row.owner, row.repo), row]),
  );
  const spines = keys
    .map((key) => {
      const known = featured.get(key);
      if (known) return known;
      const [owner, repo] = key.split("/");
      return owner && repo
        ? { owner, repo, accent: ownerAccentStyle(owner) }
        : null;
    })
    .filter((row): row is ShelfRow => row !== null);

  const empty = ready && keys.length === 0;

  return (
    <section aria-labelledby="shelf-heading" className="flex flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <span className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h2
            id="shelf-heading"
            className="font-display text-ink-strong text-3xl tracking-[-0.02em]"
          >
            {ready && keys.length > 0 ? "Your favorite skills" : "Your shelf"}
          </h2>
          {ready && keys.length > 0 && (
            <ShareMenu
              url={absoluteUrl(paths.share(keys))}
              title={`Favorite skills — a shared shelf on ${SITE_NAME}`}
              summary={`${keys.length} ${keys.length === 1 ? "book" : "books"} of agent skills, shared as a shelf.`}
              label="Share"
              className="border-rule text-ink hover:text-issue-accent -translate-y-0.5 rounded-full border"
            />
          )}
        </span>
        <p className="text-ink-muted font-mono text-[0.62rem] tracking-[0.18em] uppercase">
          {ready ? `${keys.length} starred · ` : ""}on this device · tap ☆ on a
          spine
        </p>
      </div>

      {empty ? (
        /* The open case: ghost spines behind the plate. The overlay ignores
           the pointer so every ghost's star stays reachable through it. */
        <div className="shelf-case relative mt-8 overflow-hidden">
          <ul
            aria-label="Suggestions for your shelf"
            className="flex items-end justify-center gap-3.5 overflow-x-auto overscroll-x-contain px-4 pt-24"
          >
            {rows.slice(0, GHOST_COUNT).map((row) => (
              <Spine key={`${row.owner}/${row.repo}`} row={row} ghost />
            ))}
          </ul>
          <div className="pointer-events-none absolute inset-x-0 top-10 flex flex-col items-center gap-4 px-6 text-center sm:top-14">
            <p className="font-display text-ink-strong text-[clamp(2rem,5.5vw,3.4rem)] leading-none tracking-[-0.02em]">
              Your favorite skills
            </p>
            <p className="text-ink-muted flex w-full max-w-md items-center gap-4 font-mono text-[0.62rem] tracking-[0.22em] uppercase">
              <span className="bg-rule/80 h-px flex-1" aria-hidden />
              Curated with care
              <span className="bg-rule/80 h-px flex-1" aria-hidden />
            </p>
          </div>
        </div>
      ) : (
        <ul
          aria-label="Books on the shelf"
          className="mt-8 flex items-end gap-3.5 overflow-x-auto overscroll-x-contain px-1 pt-2"
        >
          {spines.map((row) => (
            <Spine key={`${row.owner}/${row.repo}`} row={row} />
          ))}
        </ul>
      )}
      <div className="shelf-board" aria-hidden />

      <div className="text-ink-muted mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 font-mono text-[0.62rem] tracking-[0.14em] uppercase">
        <span className="flex items-center gap-3">
          {empty
            ? "Star some skills to add to your shelf and share"
            : "Starred books stay on this device — no account, no sync"}
          {ready && keys.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-ink-muted hover:text-ink h-6 font-mono text-[0.62rem] tracking-[0.14em] uppercase"
              onClick={() => {
                const itemCount = keys.length;
                clear();
                capture("shelf_cleared", { item_count: itemCount });
                announce("Shelf cleared");
              }}
            >
              Clear
            </Button>
          )}
        </span>
        <a
          href="#contents"
          className="hover:text-issue-accent transition-colors"
        >
          Browse all {total} <span aria-hidden>→</span>
        </a>
      </div>

      {/* The board's preview: bookmarked skills as small paper stacks.
          Renders nothing until something is bookmarked. */}
      <BoardStrip />
    </section>
  );
}
