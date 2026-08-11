"use client";

/**
 * "Your shelf" — the catalogue's lead books standing as spines on a board,
 * with the reader's starred repos racked at the front.
 *
 * The featured rows arrive from the server (`ShelfBooks`) with their owner
 * accents already derived; anything the reader has starred that is *not* in
 * that list is added client-side from the `localStorage` key alone —
 * `github.com/<owner>.png` is a stable avatar endpoint, so a book starred
 * from any repo on GitHub still gets a spine, in the house colours.
 *
 * Spine geometry is a hash of the repo name: real shelves are ragged, and a
 * deterministic hash keeps them ragged the same way on every render.
 */

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { announce } from "@/components/chrome/live-regions";
import { COVER_STAR_CLASS } from "@/components/home/cover-star";
import { FavoriteButton } from "@/components/home/favorite-button";
import { Button } from "@/components/ui/button";
import { favoriteKey, useFavorites } from "@/hooks/use-favorites";
import { capture } from "@/lib/analytics";
import { external, paths } from "@/lib/site";
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
  { className: "font-display font-normal", max: 21, glyph: 0.52 },
  {
    className: "font-mono font-medium tracking-[0.16em] uppercase",
    max: 13.5,
    glyph: 0.78,
  },
  {
    className: "font-semibold tracking-[0.13em] uppercase",
    max: 14.5,
    glyph: 0.75,
  },
] as const;

/** Vertical room the star, the avatar and the padding take from the title. */
const SPINE_FURNITURE = 110;

function Spine({ row }: { row: ShelfRow }) {
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
      className="spine"
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

export function SpineRail({ rows, total }: SpineRailProps) {
  const { keys, clear, ready } = useFavorites();

  // Books starred from anywhere — including repos not on the front page —
  // rack at the front of the shelf.
  const featured = new Set(rows.map((row) => favoriteKey(row.owner, row.repo)));
  const extras = keys
    .filter((key) => !featured.has(key))
    .map((key) => {
      const [owner, repo] = key.split("/");
      return owner && repo ? { owner, repo } : null;
    })
    .filter((row): row is ShelfRow => row !== null);

  const spines = [...extras, ...rows];

  return (
    <section aria-labelledby="shelf-heading" className="flex flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2
          id="shelf-heading"
          className="font-display text-ink-strong text-3xl tracking-[-0.02em]"
        >
          Your shelf
        </h2>
        <p className="text-ink-muted font-mono text-[0.62rem] tracking-[0.18em] uppercase">
          {ready ? `${keys.length} starred · ` : ""}on this device · tap ☆ on a
          spine
        </p>
      </div>

      <ul
        aria-label="Books on the shelf"
        className="mt-8 flex items-end gap-3.5 overflow-x-auto overscroll-x-contain px-1 pt-2"
      >
        {spines.map((row) => (
          <Spine key={`${row.owner}/${row.repo}`} row={row} />
        ))}
      </ul>
      <div className="shelf-board" aria-hidden />

      <div className="text-ink-muted mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 font-mono text-[0.62rem] tracking-[0.14em] uppercase">
        <span className="flex items-center gap-3">
          Starred books stay on this device — no account, no sync
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
    </section>
  );
}
