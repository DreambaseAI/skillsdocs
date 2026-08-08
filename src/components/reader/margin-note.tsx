import type { ReactNode } from "react";

/**
 * A footnote, promoted out of the basement.
 *
 * GFM renders footnotes as a numbered list at the end of the document, which
 * costs the reader a round trip and their place on the page. Above 1440px
 * there is an empty right gutter sitting there, so the note floats into it and
 * is simply *read*, the way a printed marginal gloss is. Below that width the
 * container query drops it back into the flow as an indented aside directly
 * under the paragraph that referenced it — still no round trip.
 *
 * ## Why this is a `span`, not an `aside`
 *
 * The reference lives inside a `<p>`, and `<aside>` is flow content: putting
 * one inside a paragraph makes the HTML parser close the paragraph early,
 * which server-renders one DOM and hydrates into a different one. A `span`
 * carrying `role="note"` is phrasing content, is valid there, and exposes the
 * same semantics to assistive technology. The same constraint is why
 * `markdown.tsx` only promotes footnotes whose body is a single paragraph.
 */

export interface MarginNoteProps {
  /** Element id, so the in-text marker can point at it. */
  id: string;
  /** Marker text, normally the footnote number. */
  marker: string;
  /** Id of the referencing marker, for the return link. */
  backref: string;
  children: ReactNode;
}

export function MarginNote({ id, marker, backref, children }: MarginNoteProps) {
  return (
    <span id={id} role="note" className="margin-note" aria-label={`Note ${marker}`}>
      <span className="margin-note__marker" aria-hidden="true">
        {marker}
      </span>
      <span className="margin-note__body">
        {children}{" "}
        <a href={`#${backref}`} className="margin-note__backref">
          <span aria-hidden="true">↩</span>
          <span className="sr-only">Back to reference {marker}</span>
        </a>
      </span>
    </span>
  );
}

/** The in-text reference that points at a `MarginNote`. */
export function MarginNoteRef({
  id,
  noteId,
  marker,
}: {
  id: string;
  noteId: string;
  marker: string;
}) {
  return (
    <a id={id} href={`#${noteId}`} className="margin-note__ref">
      <sup aria-hidden="true">{marker}</sup>
      <span className="sr-only">Note {marker}</span>
    </a>
  );
}
