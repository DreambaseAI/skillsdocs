"use client";

import { useActiveHeading } from "@/hooks/use-active-heading";
import { cn } from "@/lib/utils";

/**
 * "On this page" — the only piece of furniture that moves as you read.
 *
 * Depths 2 and 3 only. The rendered heading pipeline shifts every document's
 * headings down by one, so a chapter's own sections are h2 and their
 * subsections h3; going deeper turns the rail into a second copy of the
 * article, which is exactly the failure mode of every docs sidebar.
 *
 * The marker follows `useActiveHeading`, which resolves to the last heading
 * the reader has passed rather than the last one visible — a section's body is
 * usually taller than the viewport, and a marker that blanks out for the whole
 * body of a section is worse than no marker.
 */

export interface RailHeading {
  id: string;
  text: string;
  depth: number;
}

export interface OnThisPageProps {
  headings: RailHeading[];
  /** Id for the skip-link target, when this rail is the page's contents. */
  id?: string;
  className?: string;
}

export function OnThisPage({ headings, id, className }: OnThisPageProps) {
  const usable = headings.filter((h) => h.depth >= 2 && h.depth <= 4);
  const active = useActiveHeading(usable.map((h) => h.id));

  if (usable.length < 2) return null;

  return (
    <nav
      id={id}
      // See `table-of-contents.tsx`: this is the chapter's `#contents`.
      tabIndex={id ? -1 : undefined}
      aria-label="On this page"
      className={cn(className)}
    >
      <p className="book-rail__title">On this page</p>
      <ul className="mt-2">
        {usable.map((heading) => (
          <li key={heading.id}>
            <a
              href={`#${heading.id}`}
              className="book-rail__link"
              data-depth={heading.depth}
              // `aria-current="true"` rather than "location": Safari + VoiceOver
              // announce the generic value reliably, the location token not so.
              aria-current={heading.id === active ? "true" : undefined}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
