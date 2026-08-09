/**
 * The `/search` results list.
 *
 * One ranked list rather than a "Books" section above a "Chapters" section:
 * the ranking is cross-type by design — someone typing `pdf` wants the chapter
 * and someone typing `anthropics` wants the book — and splitting the list
 * would force the second-best answer above the best one whenever the query
 * leaned the other way. The kind is a label on the row instead.
 *
 * Matched runs are marked with `<mark>`, which carries the semantics for free
 * and is styled rather than left to the UA's default yellow.
 */

import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import { compact } from "@/components/home/format";
import { ownerAccentStyle } from "@/components/home/issue-accent";
import { highlight, type SearchHit } from "@/lib/search";

function Marked({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((segment, i) => (
        <Fragment key={i}>
          {segment.hit ? (
            <mark className="bg-issue-accent/18 text-ink-strong rounded-[3px] px-0.5">
              {segment.text}
            </mark>
          ) : (
            segment.text
          )}
        </Fragment>
      ))}
    </>
  );
}

export function SearchResults({ hits, query }: { hits: SearchHit[]; query: string }) {
  return (
    <ul className="flex flex-col">
      {hits.map(({ doc }) => (
        <li
          key={doc.href}
          data-issue={doc.owner.toLowerCase()}
          style={ownerAccentStyle(doc.owner)}
          className="border-rule/60 hover:bg-paper-raised/60 group/hit relative flex items-center gap-4 border-b py-3.5 pr-2 pl-1 transition-colors last:border-b-0"
        >
          {doc.avatar ? (
            <Image
              src={doc.avatar}
              alt=""
              width={36}
              height={36}
              className="border-rule bg-paper-raised size-9 shrink-0 rounded-lg border"
              aria-hidden
            />
          ) : (
            <span className="bg-paper-raised size-9 shrink-0 rounded-lg" aria-hidden />
          )}

          <span className="min-w-0 flex-1">
            <Link
              href={doc.href}
              className="text-ink group-hover/hit:text-issue-accent block truncate font-medium transition-colors after:absolute after:inset-0 after:content-['']"
            >
              <Marked text={doc.title} query={query} />
            </Link>
            <span className="text-ink-muted block truncate text-sm">
              <span className="text-issue-accent mr-2 text-[0.7rem] font-semibold tracking-[0.12em] uppercase">
                {doc.kind}
              </span>
              {doc.subtitle && <Marked text={doc.subtitle} query={query} />}
            </span>
          </span>

          {doc.installs > 0 && (
            <span className="text-ink-muted hidden shrink-0 text-xs tabular-nums sm:block">
              {compact(doc.installs)} installs
            </span>
          )}

          <HugeiconsIcon
            icon={ArrowRight02Icon}
            className="text-ink-muted size-4 shrink-0 opacity-0 transition-opacity group-hover/hit:opacity-100"
            aria-hidden
          />
        </li>
      ))}
    </ul>
  );
}
