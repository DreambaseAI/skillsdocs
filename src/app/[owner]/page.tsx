/**
 * A reader's profile: `/kyleledbetter` — their saved shelves and boards.
 *
 * This route claims every single-segment path that isn't a static sibling.
 * Before it existed those paths were plain 404s (there has never been an
 * owner index page), so an unknown segment still ends at `notFound()` — the
 * only change is that a registered username now resolves first.
 *
 * Cache Components: the page reads `params`, so the profile sits inside
 * `<Suspense>`; the chrome prerenders as the shell.
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import {
  ProfileBody,
  resolveUser,
} from "@/components/collections/user-pages";
import { IssueAccentRules, ownerAccentStyle } from "@/components/home/issue-accent";
import { Masthead } from "@/components/home/masthead";
import { PaletteFallback, PaletteSlot } from "@/components/home/palette-slot";
import { SiteFooter } from "@/components/home/site-footer";
import { paths } from "@/lib/site";

export async function generateMetadata(props: {
  params: Promise<{ owner: string }>;
}): Promise<Metadata> {
  const { owner } = await props.params;
  const user = await resolveUser(owner.toLowerCase());
  if (!user) return { robots: { index: false } };

  return {
    title: user.displayUsername,
    description: `Saved shelves and skill boards by ${user.displayUsername}.`,
    robots: { index: false, follow: true },
    alternates: { canonical: paths.userProfile(user.username) },
  };
}

export default function ProfilePage(props: {
  params: Promise<{ owner: string }>;
}) {
  return (
    <>
      <IssueAccentRules />
      <Masthead
        strapline="A reader's library"
        palette={
          <Suspense fallback={<PaletteFallback />}>
            <PaletteSlot />
          </Suspense>
        }
      />
      <main id="main" tabIndex={-1} className="bg-paper text-ink flex-1">
        <div
          data-issue="skillsdocs"
          style={ownerAccentStyle("skillsdocs")}
          className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14"
        >
          <Suspense fallback={<ProfileFallback />}>
            <ProfileGate params={props.params} />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

async function ProfileGate({
  params,
}: {
  params: Promise<{ owner: string }>;
}) {
  const { owner } = await params;
  return <ProfileBody username={owner} />;
}

/** The profile before the lookup resolves: hero bones, no cards yet. */
function ProfileFallback() {
  return (
    <div aria-hidden className="flex flex-col gap-10">
      <div className="flex items-center gap-5">
        <span className="bg-ink/10 size-14 rounded-2xl sm:size-16" />
        <div className="flex flex-col gap-2.5">
          <span className="bg-ink/10 h-2.5 w-16 rounded-xs" />
          <span className="bg-ink/10 h-9 w-56 rounded-sm" />
          <span className="bg-ink/10 h-2.5 w-32 rounded-xs" />
        </div>
      </div>
      <span className="bg-ink/10 h-40 rounded-lg" />
    </div>
  );
}
