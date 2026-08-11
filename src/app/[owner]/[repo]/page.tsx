import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BookCoverSpread, BookMasthead } from "@/components/book/book-cover";
import { BookRail } from "@/components/book/book-rail";
import { BookSkeleton } from "@/components/book/book-skeleton";
import { Colophon } from "@/components/book/colophon";
import { dropCapMode } from "@/components/book/dropcap";
import { MobileContents } from "@/components/book/mobile-contents";
import { BookContentsList, RailLeft } from "@/components/book/rail-left";
import {
  EmptyBook,
  RateLimited,
  UpstreamFailure,
} from "@/components/book/states";
import { Markdown } from "@/components/reader/markdown";
import { showcaseParams } from "@/lib/featured";
import { bookJsonLd, JsonLd } from "@/lib/jsonld";
import { paths, SITE_NAME } from "@/lib/site";
import { loadBook } from "./loader";
import { renderFrontMatter } from "./render";

/**
 * The book: cover, contents, front matter, colophon.
 *
 * The page component itself is synchronous and knows nothing about the URL —
 * it hands the params *promise* to a child inside a Suspense boundary. That is
 * the whole reason `BookSkeleton` can be a prerendered App Shell that every
 * uncached repository on GitHub paints before a single API call resolves.
 */

export function generateStaticParams() {
  // Synchronous and network-free by contract, and never empty — `[]` is a
  // build error in Next 16, and a build must not be able to fail because
  // skills.sh timed out.
  return showcaseParams();
}

export async function generateMetadata(
  props: PageProps<"/[owner]/[repo]">
): Promise<Metadata> {
  const { owner, repo } = await props.params;
  const result = await loadBook(owner, repo);
  const canonical = paths.book(owner, repo);
  const markdown = paths.bookMarkdown(owner, repo);

  if (result.kind !== "ok") {
    // The shell has already streamed by the time `notFound()` runs inside the
    // Suspense boundary, so the response is a 200 and no status code can say
    // "this is not a page". `noindex` is the only signal left that a crawler
    // will act on.
    return {
      title: `${owner}/${repo}`,
      description: `Agent skills published by ${owner}/${repo}, read as a book.`,
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }

  const { book } = result;
  const count = book.skills.length;
  const description =
    book.repo.description ??
    `${count} agent ${count === 1 ? "skill" : "skills"} published by ${
      book.repo.fullName
    }, typeset for reading.`;

  return {
    title: `${book.repo.fullName}`,
    description,
    alternates: {
      canonical,
      types: { "text/markdown": markdown },
    },
    openGraph: {
      type: "book",
      title: `${book.repo.fullName} — Repo No. ${book.issueNumber}`,
      description,
      url: canonical,
      siteName: SITE_NAME,
    },
  };
}

export default function BookPage(props: PageProps<"/[owner]/[repo]">) {
  return (
    <main id="main" tabIndex={-1} className="flex flex-1 flex-col">
      <Suspense fallback={<BookSkeleton />}>
        <BookBody params={props.params} />
      </Suspense>
    </main>
  );
}

async function BookBody({
  params,
}: Pick<PageProps<"/[owner]/[repo]">, "params">) {
  const { owner, repo } = await params;
  const result = await loadBook(owner, repo);

  if (result.kind === "not-found") notFound();
  if (result.kind === "rate-limited") {
    return <RateLimited owner={owner} repo={repo} resetAt={result.resetAt} />;
  }
  if (result.kind === "error") {
    return <UpstreamFailure owner={owner} repo={repo} detail={result.detail} />;
  }

  const { book } = result;

  if (book.skills.length === 0) {
    return (
      <EmptyBook
        owner={owner}
        repo={repo}
        description={book.repo.description}
        installs={book.signal?.installs}
        avatar={book.repo.ownerAvatar}
      />
    );
  }

  // The README is the issue's front matter. Rendering it here rather than as
  // a chapter keeps the chapter numbering honest: it is not a skill.
  const front = await renderFrontMatter(owner, repo);

  const sections = [
    { id: "cover", label: "Cover" },
    { id: "contents", label: "Contents" },
    { id: "provenance-title", label: "Provenance" },
    ...(front ? [{ id: "front-matter", label: "Front matter" }] : []),
    { id: "colophon", label: "Colophon" },
  ];

  return (
    <>
      {/* Inside the streamed body, not `generateMetadata`: the graph names
          every chapter, and only this branch knows the book resolved. */}
      <JsonLd data={bookJsonLd(book)} />

      {/* The cover is a spread, not a block: it escapes the three-track grid
          entirely so the rails start where the contents does. See the note at
          the top of `book-cover.tsx`. */}
      <div className="reader">
        <BookCoverSpread book={book} />
      </div>

      <div className="book-frame">
        <RailLeft book={book} />

        {/* `.reader` sits on the column, not the frame: WS-5 makes it the
            `reader` container query root, and the rails are not the column. */}
        {/* No chapter list here: the opening spread previews the chapters and
            the contents rail (or, below 1280px, the floating pill's sheet)
            carries the full list. Printing it a third time in the column made
            the same facts the largest text mass on the page. */}
        <div className="book-column reader">
          <div className="pt-10">
            <BookMasthead book={book} />
          </div>

          {front ? (
            <section
              id="front-matter"
              aria-labelledby="front-matter-title"
              className="mt-20 scroll-mt-24"
            >
              <div className="book-measure">
                <div className="book-part__head">
                  <h2
                    id="front-matter-title"
                    className="font-display text-ink-strong text-lg leading-tight font-medium tracking-tight"
                  >
                    Front matter
                  </h2>
                  <span className="book-eyebrow book-part__count">
                    From the README
                  </span>
                </div>
              </div>
              <Markdown
                rendered={front}
                dropCap={dropCapMode(front.tree)}
                className="mt-8"
              />
            </section>
          ) : null}

          <Colophon
            book={book}
            repairs={front?.repairs ?? []}
            repairScope="the front matter"
          />
        </div>

        <BookRail book={book} sections={sections} />
      </div>

      <MobileContents
        title={`${book.repo.fullName}`}
        subtitle={`Repo No. ${book.issueNumber} · ${book.skills.length} skills`}
      >
        <BookContentsList book={book} inSheet />
      </MobileContents>
    </>
  );
}
