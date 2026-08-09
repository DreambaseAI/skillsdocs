import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChapterNav } from "@/components/book/chapter-nav";
import { ChapterOpener } from "@/components/book/chapter-opener";
import { ChapterRail } from "@/components/book/chapter-rail";
import { ChapterSkeleton } from "@/components/book/book-skeleton";
import { Colophon, describeRepair } from "@/components/book/colophon";
import { shouldDropCap } from "@/components/book/dropcap";
import { EditorNote } from "@/components/book/editor-note";
import { InstallCommand } from "@/components/book/install-command";
import { MobileContents } from "@/components/book/mobile-contents";
import { BookContentsList, RailLeft } from "@/components/book/rail-left";
import { ChapterAnnouncer, RunningHead } from "@/components/book/running-head";
import { SkillApparatus } from "@/components/book/skill-meta";
import { RateLimited, UpstreamFailure } from "@/components/book/states";
import { Markdown } from "@/components/reader/markdown";
import { chapterNav, findSkill } from "@/lib/book";
import { chapterJsonLd, JsonLd } from "@/lib/jsonld";
import {
  installCommand,
  marketplaceCommand,
  paths,
  SITE_NAME,
} from "@/lib/site";
import { loadBook } from "../loader";
import { renderChapter } from "../render";

/**
 * A chapter.
 *
 * Same shell discipline as the book page: the route component never awaits
 * params, so the chapter skeleton is a prerendered shell for every skill in
 * every repository, not just the seeded ones.
 *
 * `generateStaticParams` is deliberately absent here. Enumerating skill slugs
 * costs a tree fetch per showcase repository at build time, and the reward
 * would be prerendering a few dozen chapters out of the millions this route
 * serves. The shell already paints instantly; the body streams and then caches
 * for an hour. Paying a build-time API budget for that trade is the wrong way
 * round.
 */

export async function generateMetadata(
  props: PageProps<"/[owner]/[repo]/[skill]">,
): Promise<Metadata> {
  const { owner, repo, skill: slug } = await props.params;
  const canonical = paths.chapter(owner, repo, slug);
  const result = await loadBook(owner, repo);
  const skill = result.kind === "ok" ? findSkill(result.book, slug) : undefined;

  if (!skill) {
    // See the note on the book route: a `notFound()` raised inside the
    // Suspense boundary cannot change an already-streamed 200.
    return {
      title: `${slug} · ${owner}/${repo}`,
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }

  const description =
    skill.description ||
    `The ${skill.title} skill, published by ${owner}/${repo}.`;

  return {
    title: `${skill.title} · ${owner}/${repo}`,
    description,
    alternates: {
      canonical,
      types: { "text/markdown": paths.chapterMarkdown(owner, repo, slug) },
    },
    openGraph: {
      type: "article",
      title: `${skill.title} — ${owner}/${repo}`,
      description,
      url: canonical,
      siteName: SITE_NAME,
    },
  };
}

export default function ChapterPage(
  props: PageProps<"/[owner]/[repo]/[skill]">,
) {
  return (
    <main id="main" tabIndex={-1} className="flex flex-1 flex-col">
      <Suspense fallback={<ChapterSkeleton />}>
        <ChapterBody params={props.params} />
      </Suspense>
    </main>
  );
}

async function ChapterBody({
  params,
}: Pick<PageProps<"/[owner]/[repo]/[skill]">, "params">) {
  const { owner, repo, skill: slug } = await params;
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

  const { index, prev, next } = chapterNav(book, slug);
  const position = index + 1;

  const rendered = await renderChapter(owner, repo, slug);
  if (!rendered) notFound();

  const installRows = [
    { label: "Install command", command: installCommand(owner, repo) },
    ...(book.marketplace
      ? [
          {
            label: "Marketplace command",
            command: marketplaceCommand(owner, repo),
            sigil: "»",
          },
        ]
      : []),
  ];

  return (
    <>
      <JsonLd data={chapterJsonLd(book, skill)} />

      <ChapterAnnouncer
        chapter={skill.title}
        index={position}
        total={book.skills.length}
      />

      <div className="book-frame">
        <RailLeft book={book} currentSlug={slug} />

        {/* `<section>`, not `<article>`: ARIA in HTML does not permit
            `doc-chapter` on `article` (axe `aria-allowed-role`), and the DPUB
            role is the more precise statement of what this is. */}
        <section
          className="book-column reader"
          data-running-head=""
          role="doc-chapter"
          aria-labelledby="chapter-title"
        >
          <RunningHead
            chapter={skill.title}
            index={position}
            total={book.skills.length}
            headings={rendered.headings}
          />

          <ChapterOpener book={book} skill={skill} index={position} />

          <Markdown
            rendered={rendered}
            dropCap={shouldDropCap(rendered.tree)}
            className="mt-8"
          />

          <div className="book-measure mt-14">
            <p className="book-eyebrow mb-2">Install this repository</p>
            <InstallCommand rows={installRows} />
            <p className="book-caption mt-2">
              Skills install per repository, not per chapter — the CLI has no
              documented per-skill form, so we do not print one.
            </p>
          </div>

          <SkillApparatus book={book} skill={skill} />

          {rendered.repairs.length > 0 ? (
            <div className="book-measure mt-10">
              <EditorNote
                label="Typesetting note"
                issues={rendered.repairs.map(describeRepair)}
              />
            </div>
          ) : null}

          <ChapterNav book={book} prev={prev} next={next} index={position} />

          <details className="book-measure border-rule mt-14 border-t pt-4">
            <summary className="book-eyebrow cursor-pointer list-none">
              Colophon for this issue
            </summary>
            <Colophon
              book={book}
              repairs={rendered.repairs}
              repairScope="this chapter"
            />
          </details>
        </section>

        <ChapterRail
          book={book}
          skill={skill}
          headings={rendered.headings}
          index={position}
        />
      </div>

      <MobileContents
        title={book.repo.fullName}
        subtitle={`Chapter ${position} of ${book.skills.length}`}
      >
        <BookContentsList book={book} currentSlug={slug} inSheet />
      </MobileContents>
    </>
  );
}
