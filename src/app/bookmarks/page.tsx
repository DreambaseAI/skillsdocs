/**
 * The skill board.
 *
 * `/bookmarks` is the visitor's own board — their bookmarked skills, read
 * from the device, pinned as paper stacks. `/bookmarks?skills=a/b/c,…` is a
 * *shared* board: the exact pages the link names, in the link's order.
 * Dragging rearranges; in the shared form the new order is written back into
 * the URL, which is the whole persistence story — no account, no database.
 *
 * Cache Components: the page reads `searchParams`, so the board sits inside
 * `<Suspense>`; the chrome prerenders as the shell. Robots are told not to
 * index — boards are reader-generated permutations, not canonical pages.
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import { SkillBoard } from "@/components/board/skill-board";
import { IssueAccentRules, ownerAccentStyle } from "@/components/home/issue-accent";
import { Masthead } from "@/components/home/masthead";
import { PaletteFallback, PaletteSlot } from "@/components/home/palette-slot";
import { SiteFooter } from "@/components/home/site-footer";
import { parseBoardSkills } from "@/lib/board";

export const metadata: Metadata = {
  title: "Skill board",
  description:
    "Bookmarked skills, pinned as pages on a board — stacked by repo, in each repo's own colours.",
  robots: { index: false, follow: true },
};

export default function BookmarksPage(props: {
  searchParams: Promise<{ skills?: string | string[] }>;
}) {
  return (
    <>
      <IssueAccentRules />
      <Masthead
        strapline="Skill board"
        palette={
          <Suspense fallback={<PaletteFallback />}>
            <PaletteSlot />
          </Suspense>
        }
      />
      <main id="main" tabIndex={-1} className="bg-paper text-ink flex-1">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
          <Suspense fallback={<BoardFallback />}>
            <BoardFromParams searchParams={props.searchParams} />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

async function BoardFromParams({
  searchParams,
}: {
  searchParams: Promise<{ skills?: string | string[] }>;
}) {
  const { skills } = await searchParams;
  // Param absent → the visitor's own device board; param present → the
  // shared board it names, even when it names nothing valid.
  const initialKeys =
    skills === undefined
      ? null
      : parseBoardSkills(skills).map((s) => `${s.owner}/${s.repo}/${s.slug}`);

  return (
    <div data-issue="skillsdocs" style={ownerAccentStyle("skillsdocs")}>
      <SkillBoard initialKeys={initialKeys} />
    </div>
  );
}

/** The board before the params resolve: cork, no paper yet. */
function BoardFallback() {
  return (
    <div aria-hidden className="flex flex-col">
      <div className="flex flex-col gap-2.5">
        <span className="bg-ink/10 h-2.5 w-24 rounded-xs" />
        <span className="bg-ink/10 h-9 w-56 rounded-sm" />
        <span className="bg-ink/10 h-2.5 w-40 rounded-xs" />
      </div>
      <div className="pin-board mt-8 h-96 rounded-lg sm:mt-10" />
    </div>
  );
}
