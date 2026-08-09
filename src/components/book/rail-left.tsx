import Link from "next/link";
import { folio, plural } from "@/components/book/format";
import type { Book } from "@/lib/book";
import { paths } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * The contents rail (desktop ≥1280px) and the body of the mobile contents
 * sheet. One component for both, because a reader who has learnt the rail
 * should not have to learn a second list on their phone.
 *
 * Server-rendered: the current chapter is known from the route, so there is
 * nothing here for JavaScript to decide.
 */

export interface RailLeftProps {
  book: Book;
  currentSlug?: string;
  /** Rendered inside a Sheet rather than the sticky rail. */
  inSheet?: boolean;
}

export function BookContentsList({ book, currentSlug, inSheet }: RailLeftProps) {
  const { owner, repo } = book.repo;

  // Folios run continuously across parts, so each part needs to know how many
  // chapters preceded it. Derived up front rather than mutated during render:
  // a counter incremented inside `.map()` is a render-time side effect.
  const partOffsets: number[] = [];
  book.parts.reduce((total, part) => {
    partOffsets.push(total);
    return total + part.skills.length;
  }, 0);

  return (
    <nav
      aria-label="Chapters"
      className={cn(inSheet && "pb-8")}
      id={inSheet ? undefined : "book-rail-contents"}
    >
      <Link
        href={paths.book(owner, repo)}
        className={cn(
          "book-rail__title hover:text-ink-strong block no-underline",
          !currentSlug && "text-ink-strong",
        )}
        aria-current={currentSlug ? undefined : "page"}
      >
        Issue No.&nbsp;{book.issueNumber} · Cover
      </Link>

      {book.parts.map((part, partIndex) => (
        <div key={part.group || "all"} className="mt-4">
          {book.parts.length > 1 || part.group ? (
            <p className="book-eyebrow mt-3 mb-1.5">{part.title}</p>
          ) : null}
          <ul>
            {part.skills.map((skill, index) => {
              const counter = partOffsets[partIndex] + index + 1;
              const current = skill.slug === currentSlug;
              return (
                <li key={skill.slug}>
                  <Link
                    href={paths.chapter(owner, repo, skill.slug)}
                    className="book-rail__link flex gap-2"
                    aria-current={current ? "page" : undefined}
                  >
                    <span
                      className="text-ink-muted shrink-0 tabular-nums"
                      aria-hidden="true"
                    >
                      {folio(counter)}
                    </span>
                    <span className="min-w-0">{skill.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <p className="book-caption border-rule mt-5 border-t pt-3">
        {book.skills.length} {plural(book.skills.length, "chapter")} ·{" "}
        {book.totalReadingMinutes} min
      </p>
    </nav>
  );
}

export function RailLeft(props: RailLeftProps) {
  return (
    <aside
      className="book-rail book-rail--left"
      // Two unlabelled `complementary` landmarks on one page announce as
      // "complementary, complementary"; the label is what makes the rail
      // navigable rather than just present.
      aria-label="Issue contents"
      data-print="hide"
    >
      <BookContentsList {...props} />
    </aside>
  );
}
