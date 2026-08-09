import { folio, readingTime } from "@/components/book/format";
import { EditorNote } from "@/components/book/editor-note";
import type { Book } from "@/lib/book";
import type { Skill } from "@/lib/skills";

/**
 * The chapter opener.
 *
 * This is where the "book feeling" is actually made — not by turning pages.
 * Five elements in a fixed order, each doing one job: an eyebrow that says
 * which part you are in, a folio that says where you are in the whole, a
 * display-face title, a standfirst that earns the next paragraph, and a rule
 * that closes the opener so the body can begin. The drop cap belongs to the
 * first paragraph of the prose, not here, which is why the rule is the last
 * thing this component renders.
 */

export interface ChapterOpenerProps {
  book: Book;
  skill: Skill;
  /** 1-based position in the whole book. */
  index: number;
}

export function ChapterOpener({ book, skill, index }: ChapterOpenerProps) {
  const part = book.parts.find((p) =>
    p.skills.some((s) => s.slug === skill.slug),
  );
  const eyebrow = part && part.group ? part.title : "Skills";

  return (
    <header className="book-opener book-measure">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="book-eyebrow book-eyebrow--accent m-0">{eyebrow}</p>
        <p className="book-opener__folio m-0">
          <span aria-hidden="true">
            {folio(index)} / {folio(book.skills.length)}
          </span>
          <span className="sr-only">
            Chapter {index} of {book.skills.length}
          </span>
        </p>
      </div>

      <h1 id="chapter-title" className="book-opener__title mt-3">{skill.title}</h1>

      {skill.description ? (
        <p className="book-standfirst mt-4">{skill.description}</p>
      ) : null}

      <p className="book-caption mt-3">
        {readingTime(skill.readingMinutes)} ·{" "}
        {skill.wordCount.toLocaleString("en-GB")} words
        {skill.headings.length > 0
          ? ` · ${skill.headings.length} sections`
          : ""}
      </p>

      {/* The editor's marks sit between the standfirst and the rule: read
          before the chapter, never mixed into it. */}
      <EditorNote issues={skill.issues} className="mt-4" />

      <hr className="book-rule book-rule--strong mt-6" />
    </header>
  );
}
