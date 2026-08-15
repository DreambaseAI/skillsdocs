/**
 * The reader's library: every saved shelf and board, with the controls that
 * make them theirs — rename, edit the slug, sync from the device library,
 * copy the link, delete.
 *
 * Cache Components: the session cookie is request data, so the whole
 * signed-in surface sits inside `<Suspense>`; the chrome prerenders as the
 * shell. The list itself is loaded server-side and handed to the client
 * manager, which owns it from there — mutations go through the server
 * actions and refresh in place.
 */

import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { IssueAccentRules, ownerAccentStyle } from "@/components/home/issue-accent";
import { Masthead } from "@/components/home/masthead";
import { PaletteFallback, PaletteSlot } from "@/components/home/palette-slot";
import { SiteFooter } from "@/components/home/site-footer";
import { auth } from "@/lib/auth";
import { listCollections, summarize } from "@/lib/collections";
import { LibraryManager } from "./manager";

export const metadata: Metadata = {
  title: "Your library",
  description: "Saved shelves and skill boards, named and shareable.",
  robots: { index: false, follow: true },
};

export default function LibraryPage() {
  return (
    <>
      <IssueAccentRules />
      <Masthead
        strapline="Your library"
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
          <Suspense fallback={<LibraryFallback />}>
            <LibraryGate />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

async function LibraryGate() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return (
      <div className="flex flex-col items-start gap-5">
        <h1 className="font-display text-ink-strong text-4xl tracking-[-0.02em]">
          Your library
        </h1>
        <p className="text-ink-muted max-w-prose">
          Saved shelves and boards belong to an account. Sign in with GitHub or
          Google — the person icon in the header — and your device library can
          be saved, named, and shared at its own address.
        </p>
      </div>
    );
  }

  const collections = await listCollections(session.user.id);
  return <LibraryManager initial={collections.map(summarize)} />;
}

/** The library before the session resolves: headings, no cards yet. */
function LibraryFallback() {
  return (
    <div aria-hidden className="flex flex-col gap-8">
      <div className="flex flex-col gap-2.5">
        <span className="bg-ink/10 h-2.5 w-24 rounded-xs" />
        <span className="bg-ink/10 h-9 w-56 rounded-sm" />
      </div>
      <span className="bg-ink/10 h-40 rounded-lg" />
      <span className="bg-ink/10 h-40 rounded-lg" />
    </div>
  );
}
