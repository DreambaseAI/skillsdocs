import { InlineMarkup } from "@/components/book/deck";
import { plural } from "@/components/book/format";
import { AGENT_SKILLS_SPEC } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * Editor's notes.
 *
 * `skill.issues` holds real Agent Skills spec violations we detected — a
 * missing `name`, a description over 1024 characters, a name that disagrees
 * with its directory. Every instinct says "render them red". Don't.
 *
 * These are someone else's repositories, and a red banner on a stranger's work
 * is a scold that also makes our page ugly. Set as marginalia in the caption
 * style, the same information reads as an editor's pencil mark: noticed,
 * recorded, not shouted. It is the single cheapest way to turn a validator
 * into a feature, and it is the form in which a repo owner will actually act
 * on it.
 *
 * Never `role="alert"`, never `aria-live`: nothing here is urgent, and an
 * assertive announcement on page load is exactly the interruption that makes
 * screen-reader users leave.
 */

export interface EditorNoteProps {
  issues: string[];
  /** Float into the right gutter where the column is wide enough. */
  margin?: boolean;
  className?: string;
  label?: string;
}

export function EditorNote({
  issues,
  margin = false,
  className,
  label,
}: EditorNoteProps) {
  if (issues.length === 0) return null;

  return (
    <aside
      className={cn("book-note", margin && "book-note--margin", className)}
      aria-label={label ?? `Editor\u2019s ${plural(issues.length, "note")}`}
    >
      <span className="book-note__label">
        {label ?? `Editor\u2019s ${plural(issues.length, "note")}`}
      </span>
      {/* The notes name front-matter keys — `description`, `name` — so they
          carry inline code spans, and printing the backticks was the same
          defect the deck had. */}
      {issues.length === 1 ? (
        <p className="m-0">
          <InlineMarkup text={issues[0]} />
        </p>
      ) : (
        <ul>
          {issues.map((issue) => (
            <li key={issue}>
              <InlineMarkup text={issue} />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 mb-0">
        <a
          className="hover:text-issue-accent underline underline-offset-3"
          href={AGENT_SKILLS_SPEC}
          target="_blank"
          rel="noopener noreferrer"
        >
          Agent Skills specification
        </a>
      </p>
    </aside>
  );
}
