/**
 * A shared board, the stateless form.
 *
 * `/share/skills?skills=a/b/c,…` pins the exact skills the link names, in the
 * link's order. Dragging rearranges and writes the new order back into the
 * URL — no account, no database. The visitor's own device board lives at
 * `/bookmarks`; saved, named boards at `/username/skills/<slug>`.
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
import { SITE_NAME } from "@/lib/site";

export async function generateMetadata(props: {
  searchParams: Promise<{ skills?: string | string[] }>;
}): Promise<Metadata> {
  const { skills } = await props.searchParams;
  const rows = parseBoardSkills(skills);

  const title = "Skill board";
  const description =
    rows.length > 0
      ? `${rows.length} bookmarked ${rows.length === 1 ? "skill" : "skills"}, pinned to a board and shared as a single link.`
      : "Bookmarked skills, pinned as pages on a board — stacked by repo, in each repo's own colours.";

  return {
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: {
      title: "Skill board — bookmarked skills",
      description,
      siteName: SITE_NAME,
      ...(rows.length > 0
        ? {
            images: [
              {
                url: `/api/og/board?skills=${rows
                  .map((row) => `${row.owner}/${row.repo}/${row.slug}`)
                  .join(",")}`,
                width: 1200,
                height: 630,
                alt: `A board of ${rows.length} bookmarked ${rows.length === 1 ? "skill" : "skills"}`,
              },
            ],
          }
        : {}),
    },
    twitter: { card: rows.length > 0 ? "summary_large_image" : "summary" },
  };
}

export default function SharedSkillsPage(props: {
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
  const initialKeys = parseBoardSkills(skills).map(
    (s) => `${s.owner}/${s.repo}/${s.slug}`,
  );

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
