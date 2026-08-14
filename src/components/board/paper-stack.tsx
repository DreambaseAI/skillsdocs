"use client";

/**
 * One pinned stack of paper: a repo's bookmarked skills, top page showing.
 *
 * A printed object in the cover/spine family — light stock washed with the
 * owner's accent (`ownerAccentStyle` supplies `--accent-a`), a pin, ruled
 * lines, a turned corner, and ghost sheets behind when the repo pinned more
 * than one page. The title's typeface is a *voice* picked by owner hash from
 * the reader faces already mounted on `<html>`, so every stack keeps its own
 * hand without loading a font nobody uses.
 *
 * Purely presentational: the board passes drag wiring through `rootProps`,
 * the strip passes none.
 */

import Image from "next/image";
import Link from "next/link";
import type { ComponentPropsWithoutRef, Ref } from "react";
import type { BoardSkillMeta } from "@/components/board/use-board-books";
import { ownerAccentStyle } from "@/components/home/issue-accent";
import { external } from "@/lib/site";
import { cn } from "@/lib/utils";

const MONO_LABEL =
  "font-mono text-[0.6rem] font-medium tracking-[0.16em] uppercase";

/** FNV-1a, unsigned — the same hash the shelf spines draw their lot from. */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const VOICES = [
  "literata",
  "fraunces",
  "instrument",
  "newsreader",
  "garamond",
  "lora",
  "mono",
  "grotesk",
] as const;

/** Title-case a slug when the book data has not arrived (or never will). */
function slugTitle(slug: string): string {
  return slug
    .split(/[-_]+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export interface PaperStackProps {
  owner: string;
  repo: string;
  /** The top page's slug — the first of this repo's keys in board order. */
  slug: string;
  /** How many of this repo's skills are pinned (1 = a single sheet). */
  count: number;
  /** Book lookup result: undefined = loading, null = unavailable. */
  meta: BoardSkillMeta | undefined | null;
  issueNumber: number | undefined | null;
  href: string;
  className?: string;
  /** Drag wiring from the board — spread onto the root `<li>`. */
  rootProps?: ComponentPropsWithoutRef<"li"> & { ref?: Ref<HTMLLIElement> };
  children?: React.ReactNode;
}

export function PaperStack({
  owner,
  repo,
  slug,
  count,
  meta,
  issueNumber,
  href,
  className,
  rootProps,
  children,
}: PaperStackProps) {
  const hash = fnv1a(`${owner}/${repo}`);
  const voice = VOICES[hash % VOICES.length];
  // −2.4° … 2.4°, never exactly straight: pinned paper hangs, it is not set.
  const tilt = ((hash >>> 7) % 49) / 10 - 2.4;

  return (
    <li
      {...rootProps}
      className={cn("paper-stack list-none", className, rootProps?.className)}
      style={
        {
          ...ownerAccentStyle(owner),
          "--tilt": `${tilt.toFixed(1)}deg`,
          ...rootProps?.style,
        } as React.CSSProperties
      }
      data-depth={Math.min(count, 3)}
    >
      <span className="paper-pin" aria-hidden />
      <Link href={href} className="paper-card" data-voice={voice} draggable={false}>
        <span className="paper-head">
          <span className="flex min-w-0 items-center gap-2">
            <Image
              src={external.avatar(owner, 44)}
              alt=""
              width={22}
              height={22}
              className="paper-avatar shrink-0"
              unoptimized
            />
            <span
              className={cn(MONO_LABEL, "truncate")}
              style={{ color: "var(--sheet-accent)" }}
            >
              {owner}
            </span>
          </span>
          <span className={cn(MONO_LABEL, "shrink-0 opacity-70")}>
            {issueNumber ? <>No. {issueNumber}</> : null}
            {issueNumber && meta ? " · " : null}
            {meta ? <>CH {String(meta.position).padStart(2, "0")}</> : null}
          </span>
        </span>

        <span className="paper-title block">
          {meta ? meta.title : slugTitle(slug)}
        </span>

        {meta?.dek ? <span className="paper-dek block">{meta.dek}</span> : null}

        <span className="paper-foot">
          {/* A repo literally named "skills" says nothing alone — same rule
              as the shelf spines: generic names carry their owner. */}
          <span
            className={cn(MONO_LABEL, "truncate")}
            style={{ color: "var(--sheet-accent)" }}
          >
            {/^(agent-)?skills$/i.test(repo) ? `${owner}/${repo}` : repo}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {meta ? (
              <span className={cn(MONO_LABEL, "opacity-70")}>
                {meta.minutes} min
              </span>
            ) : null}
            <span className="paper-chip" aria-hidden />
          </span>
        </span>
      </Link>

      {count > 1 ? (
        <span className={cn(MONO_LABEL, "paper-more")}>
          +{count - 1} {count - 1 === 1 ? "skill" : "skills"}
        </span>
      ) : null}

      {children}
    </li>
  );
}
