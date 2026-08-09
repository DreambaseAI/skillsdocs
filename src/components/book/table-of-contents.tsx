import Link from "next/link";
import { InlineMarkup } from "@/components/book/deck";
import {
  folio,
  plural,
  roman,
  shortReadingTime,
} from "@/components/book/format";
import type { Book } from "@/lib/book";
import { dekOf } from "@/lib/deck";
import { paths } from "@/lib/site";
import { chartSeedsFromTheme, ChaptersDonut } from "@/components/charts";

/**
 * The contents.
 *
 * A magazine's table of contents is the second-most-designed page in the
 * issue, and it is the one page that has to work as a *list* and as a
 * *landscape* at the same time: scannable top to bottom, but with enough
 * hierarchy that the eye can land anywhere and know where it is.
 *
 * Three devices carry that here. Parts are numbered in Roman and ruled with a
 * heavy line, so they read as divisions rather than as headings. Chapters are
 * numbered continuously across parts in Arabic — a reader who is told
 * "chapter 7" must be able to find chapter 7 without knowing which part it is
 * in. Reading time sits on the right, tabular, so the column of numbers is a
 * column.
 */

export interface TableOfContentsProps {
  book: Book;
  /** Slug of the chapter currently being read, when rendered inside one. */
  currentSlug?: string;
  /** Heading level for the part titles. */
  headingLevel?: 2 | 3;
}

export function TableOfContents({
  book,
  currentSlug,
  headingLevel = 2,
}: TableOfContentsProps) {
  const PartHeading = headingLevel === 2 ? "h2" : "h3";
  const grouped = book.parts.length > 1 || book.parts[0]?.group !== "";

  const anyNotes = book.skills.some((skill) => skill.issues.length > 0);

  // Chapter numbers run across the whole book, not within a part.
  let counter = 0;
  const numbered = book.parts.map((part) => ({
    ...part,
    entries: part.skills.map((skill) => ({ skill, number: ++counter })),
  }));

  return (
    <nav
      id="contents"
      // Skip-link target: Safari and Firefox scroll to a fragment without
      // moving focus unless the target is programmatically focusable.
      tabIndex={-1}
      aria-label="Table of contents"
      className="book-contents book-measure"
      // Additive only: the nav element and its label already carry the meaning.
      role="doc-toc"
    >
      {/*
       * Only worth drawing when the book genuinely divides. One part is a
       * full circle, which tells the reader nothing they cannot read in the
       * chapter count directly above it.
       */}
      {book.parts.length > 1 ? (
        <ChaptersDonut
          parts={book.parts.map((part) => ({
            title: part.title,
            chapters: part.skills.length,
          }))}
          seeds={chartSeedsFromTheme(book.theme)}
          subject={book.repo.fullName}
          className="book-contents__shape"
        />
      ) : null}

      {numbered.map((part, partIndex) => (
        <section key={part.group || "all"} className="book-part">
          <div className="book-part__head">
            {grouped ? (
              <span className="book-eyebrow book-eyebrow--accent">
                Part {roman(partIndex + 1)}
              </span>
            ) : null}
            <PartHeading className="font-display text-ink-strong text-lg leading-tight font-medium tracking-tight">
              {part.title}
            </PartHeading>
            <span className="book-eyebrow book-part__count">
              {part.skills.length} {plural(part.skills.length, "chapter")}
            </span>
          </div>

          {part.entries.map(({ skill, number }) => (
            <Link
              key={skill.slug}
              href={paths.chapter(book.repo.owner, book.repo.repo, skill.slug)}
              className="book-entry"
              aria-current={skill.slug === currentSlug ? "page" : undefined}
            >
              <span className="book-entry__folio" aria-hidden="true">
                {folio(number)}
              </span>

              <span className="min-w-0">
                <span className="book-entry__title block">
                  <span className="sr-only">Chapter {number}: </span>
                  {skill.title}
                </span>
                {/* Through `dekOf`: a sentence, cut on a word boundary, with
                    real apostrophes and inline code set as code. The old path
                    printed straight quotes and raw backticks and cut
                    mid-token — `Anthropic’s look-…`. */}
                {skill.description ? (
                  <span className="book-entry__dek">
                    <InlineMarkup text={dekOf(skill.description)} />
                  </span>
                ) : null}
                {skill.variants.length > 0 ? (
                  <span className="book-caption mt-1 block text-[0.78rem]">
                    Also published for{" "}
                    {skill.variants.map((v) => v.label).join(", ")}
                  </span>
                ) : null}
              </span>

              <span className="book-entry__meta book-caption">
                {skill.issues.length > 0 ? (
                  <span
                    className="text-issue-accent"
                    title={`${skill.issues.length} editorial ${plural(skill.issues.length, "note")}`}
                  >
                    <span aria-hidden="true">※</span>
                    <span className="sr-only">
                      {skill.issues.length} editorial{" "}
                      {plural(skill.issues.length, "note")}
                    </span>
                  </span>
                ) : null}
                <span>{shortReadingTime(skill.readingMinutes)}</span>
              </span>
            </Link>
          ))}
        </section>
      ))}

      {/* The mark had no key anywhere on the page. One line of legend is the
          difference between an ornament and a glyph nobody can read. */}
      {anyNotes ? (
        <p className="book-caption mt-3">
          <span className="text-issue-accent" aria-hidden="true">
            ※
          </span>{" "}
          carries an editor&rsquo;s note.
        </p>
      ) : null}
    </nav>
  );
}
