"use client";

/**
 * "Your shelf" — the starred books, held in `localStorage`.
 *
 * Takes no props on purpose. A shelf row needs an owner, a repo and an avatar,
 * and all three are derivable from the stored `owner/repo` key —
 * `github.com/<owner>.png` is a stable, CDN-served avatar endpoint. Passing
 * the catalogue down instead would put ~12 KB of book records in the RSC
 * payload of every visitor, including the large majority whose shelf is empty.
 *
 * It also means a book starred from anywhere — including a repo that is not in
 * the featured catalogue at all — renders correctly here.
 *
 * The section renders server-side with an empty shelf and fills in after
 * hydration; see `hooks/use-favorites.ts` for why that is the right shape
 * rather than a mismatch to paper over. The heading is always present so the
 * page does not reflow a section into existence under the reader.
 */

import { StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import Link from "next/link";
import posthog from "posthog-js";
import { announce } from "@/components/chrome/live-regions";
import { FavoriteButton } from "@/components/home/favorite-button";
import { Button } from "@/components/ui/button";
import { useFavorites } from "@/hooks/use-favorites";
import { external, paths } from "@/lib/site";

export function Shelf() {
  const { keys, clear, ready } = useFavorites();

  const rows = keys
    .map((key) => {
      const [owner, repo] = key.split("/");
      return owner && repo ? { key, owner, repo } : null;
    })
    .filter((row): row is { key: string; owner: string; repo: string } => row !== null);

  return (
    <section aria-labelledby="shelf-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2
          id="shelf-heading"
          className="font-display text-ink-strong flex items-center gap-2.5 text-2xl tracking-[-0.015em]"
        >
          <HugeiconsIcon icon={StarIcon} className="text-ink-muted size-5" aria-hidden />
          Your shelf
          {rows.length > 0 && (
            <span className="text-ink-muted font-sans text-sm font-normal tabular-nums">
              {rows.length}
            </span>
          )}
        </h2>

        {rows.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-ink-muted hover:text-ink"
            onClick={() => {
              const itemCount = rows.length;
              clear();
              posthog.capture("shelf_cleared", { item_count: itemCount });
              announce("Shelf cleared");
            }}
          >
            Clear shelf
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-ink-muted border-rule/70 rounded-2xl border border-dashed px-5 py-6 text-sm">
          {ready
            ? "Star any book below and it stays here, on this device. No account, no sync — just a shelf."
            : "Reading your shelf…"}
        </p>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <li
              key={row.key}
              className="border-rule hover:border-issue-accent/50 relative flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors"
            >
              <Image
                src={external.avatar(row.owner, 64)}
                alt=""
                width={32}
                height={32}
                className="border-rule bg-paper-raised size-8 shrink-0 rounded-lg border"
                aria-hidden
              />

              <span className="min-w-0 flex-1">
                <Link
                  href={paths.book(row.owner, row.repo)}
                  className="text-ink hover:text-issue-accent block truncate text-sm transition-colors after:absolute after:inset-0 after:content-['']"
                >
                  <span className="text-ink-muted">{row.owner}/</span>
                  <span className="font-medium">{row.repo}</span>
                </Link>
              </span>

              <span className="z-1 shrink-0">
                <FavoriteButton owner={row.owner} repo={row.repo} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
