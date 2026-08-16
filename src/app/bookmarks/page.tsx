/**
 * The skill board — the visitor's own, read from the device.
 *
 * Bookmarked skills pinned as paper stacks; dragging persists the new order
 * to `localStorage`. Sharing produces the stateless `/share/skills?skills=…`
 * form; saved, named boards live at `/username/skills/<slug>`.
 *
 * Nothing here reads params, cookies or headers — the board's contents are
 * client-side by nature, so the whole route prerenders as the shell and the
 * client fills it after hydration.
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import { SkillBoard } from "@/components/board/skill-board";
import { IssueAccentRules, ownerAccentStyle } from "@/components/home/issue-accent";
import { Masthead } from "@/components/home/masthead";
import { PaletteFallback, PaletteSlot } from "@/components/home/palette-slot";
import { SiteFooter } from "@/components/home/site-footer";

export const metadata: Metadata = {
  title: "Skill board",
  description:
    "Bookmarked skills, pinned as pages on a board — stacked by repo, in each repo's own colours.",
  robots: { index: false, follow: true },
};

export default function BookmarksPage() {
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
          <div data-issue="skillsdocs" style={ownerAccentStyle("skillsdocs")}>
            <SkillBoard initialKeys={null} />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
