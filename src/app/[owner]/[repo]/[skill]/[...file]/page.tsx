import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { SubchapterRail } from "@/components/book/chapter-rail";
import { dropCapMode } from "@/components/book/dropcap";
import { MobileContents } from "@/components/book/mobile-contents";
import { BookContentsList, RailLeft } from "@/components/book/rail-left";
import { RateLimited, UpstreamFailure } from "@/components/book/states";
import {
  codeOutline,
  findSubchapter,
  subchapterList,
  type RailOutlineEntry,
} from "@/components/book/subchapters";
import { Markdown } from "@/components/reader/markdown";
import { chapterNav, findSkill } from "@/lib/book";
import { getResource, getResourceMeta, type LoadedResource } from "@/lib/resource-loader";
import { resourcePath, safeRelPath } from "@/lib/resources";
import { paths, SITE_NAME } from "@/lib/site";
import { loadBook } from "../../loader";
import { SubchapterAnnouncer } from "./announcer";
import { CachedCodeBlock } from "./code";
import {
  BinaryNotice,
  PreviewNotice,
  SubchapterNav,
  SubchapterOpener,
  UnavailableNotice,
} from "./parts";
import { SubchapterSkeleton } from "./skeleton";

/**
 * A subchapter — one bundled file of one skill, set as a page of the book.
 *
 * ## Why this route exists
 *
 * A skill is not just its `SKILL.md`. Across the 170 skills surveyed there are
 * 2,518 bundled files and 96% of them are renderable text — 1,812 markdown
 * references and 611 source files. Every other skills browser links those out
 * to GitHub. Here they are pages: numbered, navigable, and typeset in the same
 * measure as the chapter they belong to.
 *
 * ## Why a catch-all is the only safe shape
 *
 * ARCHITECTURE §1.3: *the third path segment namespace belongs entirely to
 * skill slugs.* A static sibling under `/[owner]/[repo]/` would shadow a real
 * skill named `files` or `colophon`. A fourth-and-deeper catch-all cannot —
 * a skill slug is exactly one segment, so nothing it could ever be named
 * reaches this route.
 *
 * ## The security boundary is in the loader, not here
 *
 * Whatever the caller types lands in `params.file`. `safeRelPath` refuses
 * traversal, absolute paths and control characters before the value is used
 * for anything at all, and `getResource` then resolves it by exact match
 * against the skill's declared resources — which come from the repository's
 * own git tree. A path this skill does not ship has no URL built for it and
 * no fetch made on its behalf. See `lib/resource-loader.ts`.
 */

/**
 * The catch-all deliberately has no `generateStaticParams`.
 *
 * The showcase repositories ship 1,400-odd bundled files between them, and
 * prerendering every one would trade a build that takes minutes for a
 * `Cache-Control` improvement on pages that are, by construction, the long
 * tail of the site. The shell below is prerendered for all of them; the body
 * streams and is cached upstream by `getResource`'s own `use cache` entry.
 */

export async function generateMetadata(
  props: PageProps<"/[owner]/[repo]/[skill]/[...file]">,
): Promise<Metadata> {
  const { owner, repo, skill: slug, file } = await props.params;
  const relPath = safeRelPath(file);

  if (!relPath) {
    return {
      title: `Not found · ${owner}/${repo}`,
      alternates: { canonical: paths.chapter(owner, repo, slug) },
      robots: { index: false, follow: false },
    };
  }

  const canonical = resourcePath(owner, repo, slug, relPath);
  const meta = await safeMeta(owner, repo, slug, relPath);

  if (!meta) {
    // See the book route: a `notFound()` raised inside the Suspense boundary
    // cannot change an already-streamed 200, so metadata degrades on its own.
    return {
      title: `${relPath} · ${owner}/${repo}`,
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }

  const title = `${meta.title} · ${meta.skillTitle} · ${owner}/${repo}`;
  const description = `${meta.resource.label} bundled with the ${meta.skillTitle} skill in ${owner}/${repo}, at ${relPath}.`;

  return {
    title,
    description,
    alternates: { canonical },
    /*
     * Markdown references are editorial content and are indexed. Source files
     * are not: a search engine indexing 611 copies of somebody else's Python
     * competes with the repository itself for its own code, and the reader who
     * wanted that file wanted it from the repository. Binaries and oversized
     * previews are partial by definition, which is worse than either.
     */
    robots:
      meta.resource.render === "prose"
        ? undefined
        : { index: false, follow: true },
    openGraph: {
      type: "article",
      title: `${meta.title} — ${meta.skillTitle}`,
      description,
      url: canonical,
      siteName: SITE_NAME,
    },
  };
}

/**
 * `getResourceMeta` reaches `getBook`, which throws a typed `GitHubError` for
 * a missing repository or a spent quota. `generateMetadata` has no designed
 * state to render, so an upstream failure degrades to the un-indexed title
 * above rather than taking the whole route to the error boundary — the body,
 * which goes through `loadBook`, still renders the state that explains it.
 */
async function safeMeta(
  owner: string,
  repo: string,
  slug: string,
  relPath: string,
) {
  try {
    return await getResourceMeta(owner, repo, slug, relPath);
  } catch {
    return null;
  }
}

export default function SubchapterPage(
  props: PageProps<"/[owner]/[repo]/[skill]/[...file]">,
) {
  return (
    <main id="main" tabIndex={-1} className="flex flex-1 flex-col">
      <Suspense fallback={<SubchapterSkeleton />}>
        <SubchapterBody params={props.params} />
      </Suspense>
    </main>
  );
}

async function SubchapterBody({
  params,
}: Pick<PageProps<"/[owner]/[repo]/[skill]/[...file]">, "params">) {
  const { owner, repo, skill: slug, file } = await params;

  // Refused before a cache key or a fetch URL is built from it.
  const relPath = safeRelPath(file);
  if (!relPath) notFound();

  const result = await loadBook(owner, repo);
  if (result.kind === "not-found") notFound();
  if (result.kind === "rate-limited") {
    return <RateLimited owner={owner} repo={repo} resetAt={result.resetAt} />;
  }
  if (result.kind === "error") {
    return <UpstreamFailure owner={owner} repo={repo} detail={result.detail} />;
  }

  const { book } = result;
  const skill = findSkill(book, slug);
  if (!skill) notFound();

  const loaded = await getResource(owner, repo, slug, relPath);
  if (!loaded) notFound();

  // The folio comes from the shared numbering, not from a local counter: the
  // appendix, the contents rail and this page must all call the same file 4.2.
  const chapter = chapterNav(book, slug).index + 1;
  const number =
    findSubchapter(
      subchapterList(skill.resources, {
        owner: book.repo.owner,
        repo: book.repo.repo,
        slug,
        chapter,
      }),
      relPath,
    )?.number ?? null;

  return (
    <>
      <SubchapterAnnouncer
        title={loaded.title}
        chapter={loaded.skill.title}
        position={loaded.position}
        total={loaded.total}
      />

      <div className="book-frame">
        <RailLeft book={book} currentSlug={slug} currentFile={relPath} />

        {/* `<section>` with the DPUB role, same as a chapter: ARIA in HTML
            does not permit `doc-chapter` on `article`, and a subchapter is a
            division of the book rather than a syndicable document. */}
        <section
          className="book-column reader"
          data-running-head=""
          role="doc-chapter"
          aria-labelledby="subchapter-title"
        >
          <SubchapterOpener loaded={loaded} number={number} />

          <SubchapterContent loaded={loaded} />

          <SubchapterNav loaded={loaded} />
        </section>

        <SubchapterRail loaded={loaded} number={number} outline={outlineOf(loaded)} />
      </div>

      <MobileContents
        title={book.repo.fullName}
        subtitle={
          loaded.position > 0
            ? `${loaded.skill.title} · file ${loaded.position} of ${loaded.total}`
            : `${loaded.skill.title} · bundled file`
        }
      >
        <BookContentsList
          book={book}
          currentSlug={slug}
          currentFile={relPath}
          inSheet
        />
      </MobileContents>
    </>
  );
}

/**
 * The jump list for the right rail, when the file is one that has one.
 *
 * Only code has an outline: prose already gives the rail real headings through
 * `OnThisPage`, and a preview is forty lines the reader can see all at once.
 * `codeOutline` returns `[]` for a language it has no pattern for, and the
 * rail draws nothing rather than an empty box.
 */
function outlineOf(loaded: LoadedResource): RailOutlineEntry[] {
  return loaded.body.view === "code"
    ? codeOutline(loaded.body.source, loaded.resource.language)
    : [];
}

/**
 * The five shapes a bundled file can take.
 *
 * Prose goes through `<Markdown>`, the chapter pipeline. Source goes through
 * `<CodeBlock>`, which is the *file* treatment rather than the quotation
 * treatment a fence in a chapter gets: a header naming the file, a gutter of
 * ordinals, an `#L42` target on every line, an opt-in wrap and a clip past 300
 * lines. Both highlight against the one Shiki singleton in
 * `lib/markdown/highlighter.ts`, so there is still a single theme pair.
 *
 * There is no `dangerouslySetInnerHTML` anywhere on this route and there must
 * never be one: every byte here is third-party. Both paths build React
 * elements from HAST, so React's escaping is the last line of defence.
 */
function SubchapterContent({ loaded }: { loaded: LoadedResource }) {
  const { body, resource } = loaded;

  if (body.view === "binary") return <BinaryNotice loaded={loaded} />;
  if (body.view === "unavailable") return <UnavailableNotice loaded={loaded} />;

  if (body.view === "prose") {
    return (
      <Markdown
        rendered={body.rendered}
        dropCap={dropCapMode(body.rendered.tree)}
        className="mt-8"
      />
    );
  }

  if (body.view === "preview") {
    return (
      <>
        <CachedCodeBlock
          owner={loaded.owner}
          repo={loaded.repo}
          code={body.source}
          language={resource.language}
          label={resource.label}
          path={resource.relPath}
          sourceUrl={loaded.blobUrl}
          // A preview is already the head of the file. Clipping the clip, and
          // anchoring lines that stop at 40 when the reader's `#L900` link
          // points past the end, would both be lies about what is here.
          clip={false}
          lineAnchors={false}
          className="mt-8"
        />
        <div className="book-measure">
          <PreviewNotice loaded={loaded} lines={body.lines} />
        </div>
      </>
    );
  }

  return (
    <CachedCodeBlock
      owner={loaded.owner}
      repo={loaded.repo}
      code={body.source}
      language={resource.language}
      label={resource.label}
      path={resource.relPath}
      size={resource.size}
      sourceUrl={loaded.blobUrl}
      className="mt-8"
    />
  );
}
