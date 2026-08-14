import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Appendix } from "@/components/book/appendix";
import { ChapterCredit } from "@/components/book/chapter-credit";
import { ChapterNav } from "@/components/book/chapter-nav";
import { ChapterOpener } from "@/components/book/chapter-opener";
import { ChapterRail } from "@/components/book/chapter-rail";
import { ChapterSkeleton } from "@/components/book/book-skeleton";
import { Colophon, describeRepair } from "@/components/book/colophon";
import { dropCapMode } from "@/components/book/dropcap";
import { EditorNote } from "@/components/book/editor-note";
import { InstallCommand } from "@/components/book/install-command";
import { MobileContents } from "@/components/book/mobile-contents";
import { BookContentsList, RailLeft } from "@/components/book/rail-left";
import { ChapterAnnouncer, RunningHead } from "@/components/book/running-head";
import { SkillApparatus } from "@/components/book/skill-meta";
import { RateLimited, UpstreamFailure } from "@/components/book/states";
import { Markdown } from "@/components/reader/markdown";
import { chapterNav, findSkill, getBook } from "@/lib/book";
import { showcaseParams } from "@/lib/featured";
import { chapterJsonLd, JsonLd } from "@/lib/jsonld";
import {
  installCommand,
  marketplaceCommand,
  paths,
  SITE_NAME,
  skillInstallCommand,
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
 * `generateStaticParams` enumerates the showcase books' chapters, and the
 * reason is not build-time rendering — it is `Cache-Control`. A PPR-resumed
 * response ships `private, no-cache, no-store, max-age=0, must-revalidate`, so
 * before this every chapter view was origin-only: no CDN, no shared cache, no
 * `stale-while-revalidate`. A prerendered chapter answers
 * `s-maxage=3600, stale-while-revalidate=82800` instead. The objected-to cost —
 * "a tree fetch per showcase repository" — is not paid: the book route already
 * prerenders these nine repositories, so every `getBook` here is a warm
 * `use cache` hit. Everything outside the showcase still streams.
 */

export async function generateStaticParams(): Promise<
  Array<{ owner: string; repo: string; skill: string }>
> {
  const books = await Promise.all(
    showcaseParams().map(async ({ owner, repo }) => {
      try {
        const book = await getBook(owner, repo);
        return book.skills.map((s) => ({ owner, repo, skill: s.slug }));
      } catch {
        // A rate-limited or unreachable build still ships: these are an
        // optimisation, and `dynamicParams` covers every one of them.
        return [];
      }
    }),
  );
  return books.flat();
}

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
    `The ${skill.title} skill, ${
      skill.origin === "credited" ? "in use in" : "published by"
    } ${owner}/${repo}.`;

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
    // `--skill` filters by the skill's *name* (frontmatter, dir fallback) —
    // never its URL slug, which diverges when a slug is group-qualified.
    {
      label: "Skill install command",
      command: skillInstallCommand(owner, repo, skill.name),
    },
    { label: "Repository install command", command: installCommand(owner, repo) },
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

          {/* The install panel leads the page: the reader who arrived to get
              this skill should not have to scroll past its prose to take it.
              A credited skill has no command — see the credit block after the
              appendix. */}
          {skill.origin !== "credited" ? (
            <div className="book-measure mt-8">
              <p className="book-eyebrow mb-2">Install</p>
              <InstallCommand rows={installRows} />
              <p className="book-caption mt-2">
                The first command installs just this skill, by the name in its{" "}
                <code>SKILL.md</code>; the second installs the whole repository.
              </p>
            </div>
          ) : null}

          <Markdown
            rendered={rendered}
            dropCap={dropCapMode(rendered.tree)}
            className="mt-8"
          />

          {/*
            The appendix follows the prose, before the apparatus and before the
            install block, because 4.1 follows 4 — it is the next thing to read,
            not a footnote about the chapter. Streamed on its own boundary: it
            fetches a raw file per markdown resource to write its extracts, and
            nothing above it should wait on that.
          */}
          <Suspense fallback={null}>
            <Appendix book={book} skill={skill} index={position} />
          </Suspense>

          {skill.origin === "credited" ? (
            /* A credited chapter gets no install command: `npx skills add`
               against this repo would republish someone else's skill under
               this owner's name. The credit is the apparatus instead. */
            <div className="book-measure mt-14">
              <p className="book-eyebrow mb-2">Credited</p>
              <p className="book-caption">
                This skill is installed in {owner}/{repo} — in use here rather
                than published from here — so there is no install command for
                it on this page.
              </p>
              {/* The verified origin, when there is one: a way to this
                  skill's own book, where the install command lives. */}
              <Suspense fallback={null}>
                <ChapterCredit book={book} skill={skill} variant="line" />
              </Suspense>
            </div>
          ) : null}

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
              repairScope="this skill"
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
        subtitle={`Skill ${position} of ${book.skills.length}`}
      >
        <BookContentsList book={book} currentSlug={slug} inSheet />
      </MobileContents>
    </>
  );
}
