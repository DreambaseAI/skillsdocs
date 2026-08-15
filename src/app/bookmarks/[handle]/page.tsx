/**
 * A saved board: `/bookmarks/<slug>` or `/bookmarks/<uuid>`.
 *
 * The collection lives in Postgres. Rendering reuses `SkillBoard` in its
 * saved mode: everyone can drag, but only the owner's order reaches the
 * server — ownership is decided here, server-side, by comparing the session
 * to the row, and travels to the client as a boolean.
 *
 * Cache Components: params and the session cookie are both request data, so
 * the board sits inside `<Suspense>`; the chrome prerenders as the shell.
 */

import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cache } from "react";
import { SkillBoard } from "@/components/board/skill-board";
import { IssueAccentRules, ownerAccentStyle } from "@/components/home/issue-accent";
import { Masthead } from "@/components/home/masthead";
import { PaletteFallback, PaletteSlot } from "@/components/home/palette-slot";
import { SiteFooter } from "@/components/home/site-footer";
import { auth } from "@/lib/auth";
import { getCollectionByHandle } from "@/lib/collections";
import { paths, SITE_NAME } from "@/lib/site";

/** One DB read per request, shared by metadata and page. */
const loadBoard = cache((handle: string) =>
  getCollectionByHandle("board", handle),
);

export async function generateMetadata(props: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await props.params;
  const board = await loadBoard(handle);
  if (!board) return { robots: { index: false } };

  const count = board.items.length;
  const description =
    count > 0
      ? `${count} bookmarked ${count === 1 ? "skill" : "skills"}, pinned to a board and shared as a single link.`
      : "Bookmarked skills, pinned as pages on a board — stacked by repo, in each repo's own colours.";

  return {
    title: board.name,
    description,
    robots: { index: false, follow: true },
    alternates: { canonical: paths.sharedBoard(board.slug) },
    openGraph: {
      title: `${board.name} — a skill board`,
      description,
      siteName: SITE_NAME,
      ...(count > 0
        ? {
            images: [
              {
                url: `/api/og/board?handle=${encodeURIComponent(board.slug)}`,
                width: 1200,
                height: 630,
                alt: `A board of ${count} bookmarked ${count === 1 ? "skill" : "skills"}`,
              },
            ],
          }
        : {}),
    },
    twitter: { card: count > 0 ? "summary_large_image" : "summary" },
  };
}

export default function SavedBoardPage(props: PageProps<"/bookmarks/[handle]">) {
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
            <SavedBoard params={props.params} />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

async function SavedBoard({
  params,
}: Pick<PageProps<"/bookmarks/[handle]">, "params">) {
  const { handle } = await params;
  const board = await loadBoard(handle);
  if (!board) notFound();

  const session = await auth.api.getSession({ headers: await headers() });
  const canEdit = session?.user.id === board.userId;

  return (
    <div data-issue="skillsdocs" style={ownerAccentStyle("skillsdocs")}>
      <SkillBoard
        initialKeys={board.items}
        saved={{
          id: board.id,
          name: board.name,
          slug: board.slug,
          canEdit,
        }}
      />
    </div>
  );
}

/** The board before the data resolves: cork, no paper yet. */
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
