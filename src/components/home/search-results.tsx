/**
 * The `/search` results list.
 *
 * Ranking is cross-type by design — someone typing `pdf` wants the chapter and
 * someone typing `anthropics` wants the book — so the *ordering* stays a single
 * ranked list. What changed is the *grouping*: eight hits inside
 * `anthropics/skills` used to read as eight unrelated rows, one per line, each
 * repeating the same repo slug underneath a 15px title. They are now one entry
 * with eight chapters under it, headed by the book, in the order the best hit
 * in each book earned.
 *
 * Three other things this file used to get wrong, all measured:
 *
 * - The matched title was ~15px, barely larger than the 14px slug beneath it.
 *   There was no hierarchy to scan. The title is now display serif at 1.3rem.
 * - The `CHAPTER` label was `text-issue-accent` and the `<mark>` tint followed
 *   the row's issue, so both flickered red → green → purple → orange down six
 *   rows. Highlighting is a reading aid, not branding: one neutral
 *   `--selection-bg` for every row, and the label in `--ink-muted`.
 * - There was no context at all — nothing said *why* a row matched. Each hit
 *   now carries the one line of prose we hold about it.
 */

import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import { InlineMarkup } from "@/components/book/deck";
import { compact } from "@/components/home/format";
import { ownerAccentStyle } from "@/components/home/issue-accent";
import { dekOf } from "@/lib/deck";
import { highlight, type SearchDoc, type SearchHit } from "@/lib/search";
import { paths } from "@/lib/site";

function Marked({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((segment, i) => (
        <Fragment key={i}>
          {segment.hit ? (
            <mark className="search-mark">{segment.text}</mark>
          ) : (
            segment.text
          )}
        </Fragment>
      ))}
    </>
  );
}

/**
 * The one line of prose we hold about a hit.
 *
 * For a book that is its own description. For a chapter the index has no body
 * — chapter records come from skills.sh, which publishes names and install
 * counts and nothing else — so the honest context is the book it belongs to,
 * which `search-index.ts` already carries as the chapter's first keyword.
 * Saying "part of X, which is Y" is a fact; inventing an excerpt is not.
 */
function contextOf(doc: SearchDoc): string {
  const raw = doc.kind === "book" ? doc.subtitle : (doc.keywords[0] ?? doc.subtitle);
  if (!raw) return "";
  // A chapter's fallback subtitle *is* the repo slug, which the group heading
  // two lines above already says. Repeating it is noise, not context.
  if (raw.trim().toLowerCase() === `${doc.owner}/${doc.repo}`.toLowerCase()) return "";
  return dekOf(raw, 150);
}

interface Group {
  owner: string;
  repo: string;
  avatar: string;
  installs: number;
  docs: SearchDoc[];
}

/** One group per book, ordered by the best-ranked hit each book contributed. */
function groupHits(hits: SearchHit[]): Group[] {
  const groups = new Map<string, Group>();
  for (const { doc } of hits) {
    const key = `${doc.owner}/${doc.repo}`.toLowerCase();
    const existing = groups.get(key);
    if (existing) existing.docs.push(doc);
    else {
      groups.set(key, {
        owner: doc.owner,
        repo: doc.repo,
        avatar: doc.avatar,
        installs: doc.kind === "book" ? doc.installs : 0,
        docs: [doc],
      });
    }
  }
  return [...groups.values()];
}

export function SearchResults({ hits, query }: { hits: SearchHit[]; query: string }) {
  const groups = groupHits(hits);

  return (
    <ul className="flex flex-col gap-8">
      {groups.map((group) => {
        const slug = `${group.owner}/${group.repo}`;
        return (
          <li
            key={slug}
            data-issue={group.owner.toLowerCase()}
            style={ownerAccentStyle(group.owner)}
          >
            {/* The book the hits below belong to, named once instead of once
                per row. A small-caps rule is the contents-page device for
                exactly this, and it is already the house style here. */}
            <p className="border-rule text-ink-muted flex items-center gap-2.5 border-b pb-2 text-[0.7rem] font-semibold tracking-[0.14em] uppercase">
              <Image
                src={group.avatar}
                alt=""
                width={20}
                height={20}
                className="border-rule bg-paper-raised size-5 shrink-0 rounded-full border"
                aria-hidden
              />
              <Link href={paths.book(group.owner, group.repo)} className="hover:text-ink truncate">
                {slug}
              </Link>
              {group.docs.length > 1 && (
                <span className="text-ink-muted shrink-0 tabular-nums">
                  {group.docs.length} matches
                </span>
              )}
            </p>

            <ul className="flex flex-col">
              {group.docs.map((doc) => {
                const context = contextOf(doc);
                return (
                  <li
                    key={doc.href}
                    className="border-rule/50 hover:bg-paper-raised/60 group/hit relative border-b py-3.5 pr-2 pl-1 transition-colors last:border-b-0"
                  >
                    <p className="text-ink-muted text-[0.68rem] font-semibold tracking-[0.14em] uppercase">
                      {doc.kind === "book" ? "Book" : "Chapter"}
                      {doc.installs > 0 && (
                        <span className="text-ink-muted ml-2.5 font-normal tracking-normal normal-case tabular-nums">
                          {compact(doc.installs)} installs
                        </span>
                      )}
                    </p>

                    <h3 className="font-display text-ink-strong mt-0.5 text-[1.3rem] leading-tight tracking-[-0.015em]">
                      <Link
                        href={doc.href}
                        className="group-hover/hit:text-issue-accent transition-colors after:absolute after:inset-0 after:content-['']"
                      >
                        <Marked text={doc.title} query={query} />
                      </Link>
                    </h3>

                    {context && (
                      <p className="text-ink-muted mt-1 max-w-prose text-sm leading-relaxed">
                        <InlineMarkup text={context} />
                      </p>
                    )}

                    <HugeiconsIcon
                      icon={ArrowRight02Icon}
                      className="text-ink-muted absolute top-4 right-2 size-4 opacity-0 transition-opacity group-hover/hit:opacity-100"
                      aria-hidden
                    />
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
