import Image from "next/image";
import Link from "next/link";
import { resolveSkillCredit } from "@/lib/attribution";
import type { Book } from "@/lib/book";
import type { Skill } from "@/lib/skills";
import { paths } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * The credit line under a credited chapter row: the origin's mark, its name,
 * and a way into its *own* book — rendered only when the origin verified
 * (committed lock file, or a skills.sh match whose book agrees). Streamed
 * inside its own Suspense boundary so five cached book lookups never hold up
 * the spread; resolving nothing renders nothing.
 *
 * The origin's accent pair rides in as CSS custom properties — both tones,
 * because which one passes AA depends on the scheme the reader is in, and
 * `.chapter-credit` (book.css) picks the proven one the same way
 * `--issue-accent` is picked.
 */

export interface ChapterCreditProps {
  book: Book;
  skill: Skill;
  /** "row" under a contents entry; "line" inside the chapter's credit note. */
  variant?: "row" | "line";
}

export async function ChapterCredit({
  book,
  skill,
  variant = "row",
}: ChapterCreditProps) {
  // `?? {}`: a Book cached before `lockSources` existed deserializes without
  // the field, and a credit line is not worth crashing a spread over.
  const credit = await resolveSkillCredit(
    book.repo.fullName,
    skill.name,
    skill.description,
    (book.lockSources ?? {})[skill.name.toLowerCase()]?.source ?? null
  );
  if (!credit) return null;

  const anchor = (
    <Link
      href={paths.book(credit.owner, credit.repo)}
      className={cn(
        "chapter-credit inline-flex items-baseline gap-2 no-underline",
        variant === "row"
          ? "font-mono text-[0.68rem] font-medium tracking-[0.08em]"
          : "text-inherit underline-offset-4 hover:underline"
      )}
      style={
        {
          "--credit-accent-light": credit.accentLight,
          "--credit-accent-dark": credit.accentDark,
        } as React.CSSProperties
      }
    >
      {credit.avatar ? (
        <Image
          src={credit.avatar}
          alt=""
          width={32}
          height={32}
          className="chapter-credit__avatar size-3.5 shrink-0 self-center"
          aria-hidden
        />
      ) : null}
      <span>From {credit.fullName}</span>
      <span className="sr-only">— open that repository&rsquo;s book</span>
      <span aria-hidden>→</span>
    </Link>
  );

  if (variant === "line") {
    return <p className="book-caption mt-2">{anchor}</p>;
  }

  return <div className="-mt-2.5 pb-2 pl-13">{anchor}</div>;
}
