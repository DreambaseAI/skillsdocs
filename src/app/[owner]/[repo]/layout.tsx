import Link from "next/link";
import { Suspense } from "react";
import {
  BookShortcuts,
  type BookShortcutsProps,
} from "@/components/book/book-shortcuts";
import { SiteHeader } from "@/components/chrome/site-header";
import { PaletteFallback, PaletteSlot } from "@/components/home/palette-slot";
import { ReaderControls } from "@/components/reader/controls";
import { loadBook } from "./loader";
import { issueThemeCss } from "@/lib/design/theme";
import { external, installCommand, paths } from "@/lib/site";
import "./book.css";

/**
 * The issue frame.
 *
 * **Nothing in this file awaits `params` above a Suspense boundary.** Doing so
 * would tie this layout's App Shell to one URL and destroy shell reuse across
 * every repository on GitHub — which is the difference between a cold, unknown
 * repo painting a composed page instantly and painting nothing for two
 * seconds. The two things that do need the route (the issue's colours and the
 * header's identity line) are each their own streamed island.
 *
 * The theme is emitted as a `<style>` scoped to `.book-issue`, the wrapper
 * this layout renders, rather than to `[data-issue="<owner>"]`. The attribute
 * form would require the owner's name on an *ancestor* of the style — which
 * means awaiting params in the layout, which is the thing we cannot do. The
 * class is a stable, static selector that is already an ancestor, so the
 * cascade lands identically and the shell stays URL-free. Until the style
 * streams in, the neutral `--issue-*` defaults from tokens.css apply, which is
 * exactly right for a page that has not chosen its colours yet.
 */

export default function BookLayout(props: LayoutProps<"/[owner]/[repo]">) {
  return (
    <div className="book-issue">
      {/* Streams independently of the body: the colours can land before, with,
          or after the content and nothing reflows either way. */}
      <Suspense fallback={null}>
        <IssueTheme params={props.params} />
      </Suspense>

      {/* The chapter-context keys — `]` `[` `→` `←` `T` `G B` `G H` `C` `⇧C`.
          Same reason as the controls below: the layout is on the cover, on a
          chapter and on a subchapter file exactly once, so one subscriber owns
          each action and no action double-fires across a route change. It
          renders nothing; the Suspense boundary is here because the island
          awaits `params`, not because there is anything to see. */}
      <Suspense fallback={null}>
        <BookKeys params={props.params} />
      </Suspense>

      {/* The reading controls mount here, not on the page, so they survive
          navigation between the cover and every chapter — and so exactly one
          instance owns the `,` / `+` / `-` shortcuts. On a phone the trigger
          portals itself into the contents pill.

          The palette rides alongside them, and that is the fix for `/` and
          `⌘K` being dead on every reading route: `CommandPalette` owns the
          `search` action and was mounted only by the homepage and `/search`.
          It belongs in the header rather than the root layout because the root
          layout is shared with API-ish and error routes that must not pull the
          ~20 KB corpus, and because this is where the affordance was missing —
          a reader inside a book had no search button at all. Its own Suspense
          boundary keeps a cold skills.sh scrape off the critical path. */}
      <SiteHeader
        actions={
          <>
            <Suspense fallback={<PaletteFallback />}>
              <PaletteSlot />
            </Suspense>
            <ReaderControls />
          </>
        }
      >
        <Suspense fallback={<IdentityFallback />}>
          <Identity params={props.params} />
        </Suspense>
      </SiteHeader>

      {props.children}
    </div>
  );
}

async function IssueTheme({
  params,
}: Pick<LayoutProps<"/[owner]/[repo]">, "params">) {
  const { owner, repo } = await params;

  // Nothing thrown in a layout can be caught by that segment's own `error.tsx`
  // — it escapes to the parent boundary and takes the entire book down. A
  // missing accent colour must never cost the reader the page, so this island
  // swallows everything and falls back to the neutral tokens.
  let css = "";
  try {
    const result = await loadBook(owner, repo);
    if (result.kind !== "ok") return null;
    css = issueThemeCss(result.book.theme, ".book-issue");
  } catch {
    return null;
  }
  if (!css) return null;

  // The string is built by `issueThemeCss` from re-validated tokens only — no
  // value from a third-party design.md reaches this element unsanitised.
  return <style>{css}</style>;
}

/**
 * Hands the keyboard layer the book, as plain data.
 *
 * Everything crossing into `BookShortcuts` is a string or an array of strings,
 * so the client bundle never sees a `Book`. Failures are swallowed for the same
 * reason `IssueTheme` swallows them: a layout that throws takes the whole book
 * down, and no shortcut is worth the page.
 */
async function BookKeys({
  params,
}: Pick<LayoutProps<"/[owner]/[repo]">, "params">) {
  const requested = await params;

  // Resolved outside the JSX, because an exception thrown while *constructing*
  // an element is the only kind this catch could ever see — React renders the
  // component later, where only an error boundary can reach it.
  let props: BookShortcutsProps | null = null;
  try {
    const result = await loadBook(requested.owner, requested.repo);
    if (result.kind !== "ok") return null;

    // The resolved identity, not the URL's: GitHub follows renames, and a
    // `G H` that opened the pre-rename path would 404 on GitHub itself.
    const { owner, repo } = result.book.repo;

    props = {
      coverHref: paths.book(owner, repo),
      githubUrl: external.repo(owner, repo),
      installCommand: installCommand(owner, repo),
      chapters: result.book.skills.map((skill) => ({
        slug: skill.slug,
        href: paths.chapter(owner, repo, skill.slug),
        title: skill.title,
      })),
    };
  } catch {
    return null;
  }

  return <BookShortcuts {...props} />;
}

async function Identity({
  params,
}: Pick<LayoutProps<"/[owner]/[repo]">, "params">) {
  const requested = await params;

  // GitHub follows renames, so `/stripe/agent-toolkit` resolves to `stripe/ai`
  // — and the cover, the install commands and every outbound link say `ai`
  // while the breadcrumb said `agent-toolkit`. Prefer the resolved identity;
  // `loadBook` is the same cached call the theme island already makes, so this
  // costs nothing. Fall back to the URL when the repo did not resolve.
  let owner = requested.owner;
  let repo = requested.repo;
  try {
    const result = await loadBook(requested.owner, requested.repo);
    if (result.kind === "ok") {
      owner = result.book.repo.owner;
      repo = result.book.repo.repo;
    }
  } catch {
    // The breadcrumb is not worth a blank header.
  }

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-baseline gap-1.5 text-sm">
        <li className="text-muted-foreground hidden shrink-0 md:block">
          <a
            className="hover:text-foreground underline-offset-4 hover:underline"
            href={`https://github.com/${owner}`}
          >
            {owner}
          </a>
        </li>
        <li aria-hidden="true" className="text-muted-foreground hidden md:block">
          /
        </li>
        <li className="min-w-0">
          <Link
            href={paths.book(owner, repo)}
            className="text-foreground hover:text-foreground block truncate font-medium underline-offset-4 hover:underline"
          >
            <span className="text-muted-foreground md:hidden">{owner}/</span>
            {repo}
          </Link>
        </li>
      </ol>
    </nav>
  );
}

function IdentityFallback() {
  return (
    <span
      className="book-ghost book-ghost--pulse h-3.5 w-40"
      aria-hidden="true"
    />
  );
}
