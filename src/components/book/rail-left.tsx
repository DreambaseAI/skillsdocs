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

/**
 * The word every entry in a part begins with, when there is one.
 *
 * `microsoft/azure-skills` puts thirty consecutive entries in this rail whose
 * first six characters are `Azure `, which makes the rail unscannable: the eye
 * has nothing to land on until character seven. When a clear majority of a
 * part shares a leading word, the word moves up to the part heading and comes
 * out of the entries — the same thing a printed index does with a repeated
 * headword. Below five entries it is not worth the indirection, and below 60%
 * it would be a lie about the rest of the list.
 */
export function sharedLead(titles: string[]): string | null {
  if (titles.length < 5) return null;

  const counts = new Map<string, number>();
  for (const title of titles) {
    const word = title.split(" ")[0] ?? "";
    // A two-letter headword saves nothing and reads as a typo once removed.
    if (word.length < 3) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  let best: [string, number] | null = null;
  for (const entry of counts) {
    if (!best || entry[1] > best[1]) best = [entry[0], entry[1]];
  }
  if (!best || best[1] / titles.length < 0.6) return null;

  // Never strip a word that leaves an entry with nothing.
  const wouldEmpty = titles.some((t) => t === best[0]);
  return wouldEmpty ? null : best[0];
}

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

  const current = currentSlug
    ? book.skills.find((skill) => skill.slug === currentSlug)
    : undefined;

  const leads = book.parts.map((part) => sharedLead(part.skills.map((s) => s.title)));

  return (
    <nav
      aria-label="Chapters"
      className={cn(inSheet && "pb-8")}
      id={inSheet ? undefined : "book-rail-contents"}
    >
      {/*
        The head states where you *are*; the link goes where you are not.
        These used to be the same element, so on every chapter page the rail's
        running head — set in the same small-caps-and-rule treatment the right
        rail uses for "ON THIS PAGE" — asserted "Cover" while you were reading
        chapter four. Furniture that lies about your location is worse than no
        furniture.
      */}
      <p className="book-rail__title">
        Issue No.&nbsp;{book.issueNumber}
        {current ? <> · {current.title}</> : <> · Cover</>}
      </p>

      {currentSlug ? (
        <Link
          href={paths.book(owner, repo)}
          className="book-rail__link text-ink-muted hover:text-ink-strong mt-1 flex items-baseline gap-1.5 no-underline"
        >
          <span aria-hidden="true">↖</span>
          Back to the cover
        </Link>
      ) : null}

      {book.parts.map((part, partIndex) => {
        const lead = leads[partIndex];
        const heading = lead ? `${part.title} · ${lead}…` : part.title;
        return (
          <div key={part.group || "all"} className="mt-4">
            {book.parts.length > 1 || part.group || lead ? (
              <p className="book-eyebrow mt-3 mb-1.5">{heading}</p>
            ) : null}
            <ul>
              {part.skills.map((skill, index) => {
                const counter = partOffsets[partIndex] + index + 1;
                const isCurrent = skill.slug === currentSlug;
                const stripped =
                  lead && skill.title.startsWith(`${lead} `)
                    ? skill.title.slice(lead.length + 1)
                    : null;
                return (
                  <li key={skill.slug}>
                    <Link
                      href={paths.chapter(owner, repo, skill.slug)}
                      className="book-rail__link flex gap-2"
                      aria-current={isCurrent ? "page" : undefined}
                    >
                      <span
                        className="text-ink-muted shrink-0 tabular-nums"
                        aria-hidden="true"
                      >
                        {folio(counter)}
                      </span>
                      <span className="min-w-0">
                        {/* The headword is only hidden visually: a screen
                            reader still hears the chapter's whole name. */}
                        {stripped ? <span className="sr-only">{lead} </span> : null}
                        {stripped ?? skill.title}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

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
