import { CheckmarkBadge01Icon, StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import {
  compactCount,
  editorialDate,
  licenceLabel,
  plural,
  readingTime,
} from "@/components/book/format";
import { InstallCommand } from "@/components/book/install-command";
import { Sparkline } from "@/components/book/sparkline";
import type { Book } from "@/lib/book";
import { external, installCommand, marketplaceCommand } from "@/lib/site";

/**
 * The cover and masthead.
 *
 * A cover has one job: to say what this is, whose it is, and why it is worth
 * the next ten minutes — and to do it at a scale that a contents list cannot.
 * Everything here is set against the reading surface, so an issue's accent
 * appears exactly three times (issue number, rule, install sigil) and nowhere
 * else. Restraint is the whole effect; an accent used five times is a theme,
 * used twice it is a signature.
 */

export interface BookCoverProps {
  book: Book;
}

export function BookCover({ book }: BookCoverProps) {
  const { repo, owner, signal, marketplace, theme } = book;
  const updated = editorialDate(repo.pushedAt);
  const chapters = book.skills.length;

  const rows = [
    { label: "Install command", command: installCommand(repo.owner, repo.repo) },
    ...(marketplace
      ? [
          {
            label: "Marketplace command",
            command: marketplaceCommand(repo.owner, repo.repo),
            sigil: "»",
          },
        ]
      : []),
  ];

  return (
    <header className="book-cover book-measure">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="book-mark">
          {repo.ownerAvatar ? (
            <Image
              src={repo.ownerAvatar}
              alt=""
              width={128}
              height={128}
              priority
              unoptimized={false}
            />
          ) : (
            <span className="book-mark__fallback" aria-hidden="true">
              {repo.owner.slice(0, 2)}
            </span>
          )}
        </span>

        <div className="flex min-w-0 flex-col gap-0.5">
          {/* The issue number is a magazine affectation and says so: it is a
              stable hash of owner/repo, not a sequence anyone can count. */}
          <span className="book-eyebrow book-eyebrow--accent">
            Issue No.&nbsp;{book.issueNumber}
          </span>
          <span className="text-ink-muted truncate text-sm">
            {owner?.name ?? repo.owner}
            {signal?.official ? (
              <>
                {" · "}
                <span className="text-ink-strong inline-flex items-center gap-1 align-baseline">
                  <HugeiconsIcon
                    icon={CheckmarkBadge01Icon}
                    className="size-3.5 translate-y-0.5"
                    aria-hidden
                  />
                  Official
                </span>
              </>
            ) : null}
          </span>
        </div>
      </div>

      <h1 className="book-cover__title">
        <span className="book-cover__owner">{repo.owner} /</span>
        {repo.repo}
      </h1>

      <hr className="book-rule book-rule--strong" />

      {repo.description ? (
        <p className="book-standfirst">{repo.description}</p>
      ) : (
        <p className="book-standfirst text-ink-muted">
          {chapters > 0
            ? `${chapters} ${plural(chapters, "skill")} published from this repository. No description was given upstream, so this issue takes its voice from the chapters themselves.`
            : "This repository publishes no description."}
        </p>
      )}

      {chapters > 0 ? (
        <p className="book-caption">
          {chapters} {plural(chapters, "chapter")} · {readingTime(book.totalReadingMinutes)}{" "}
          · {book.totalWords.toLocaleString("en-GB")} words
          {book.parts.length > 1 ? ` · ${book.parts.length} parts` : ""}
        </p>
      ) : null}

      <InstallCommand rows={rows} />

      <dl className="book-masthead">
        <MastheadCell label="Owner">
          <a
            className="hover:text-issue-accent underline-offset-4 hover:underline"
            href={external.owner(repo.owner)}
          >
            {repo.owner}
          </a>
          <span className="text-ink-muted"> · {repo.ownerType}</span>
        </MastheadCell>

        <MastheadCell label="Licence">{licenceLabel(repo.license)}</MastheadCell>

        <MastheadCell label="Last updated">
          {updated ? (
            <time dateTime={repo.pushedAt ?? undefined}>{updated}</time>
          ) : (
            "Unknown"
          )}
        </MastheadCell>

        <MastheadCell label="Stars">
          <span className="inline-flex items-center gap-1.5">
            <HugeiconsIcon
              icon={StarIcon}
              className="text-ink-muted size-3.5"
              aria-hidden
            />
            {compactCount(repo.stars)}
          </span>
        </MastheadCell>

        {signal && signal.installs > 0 ? (
          <MastheadCell label="Installs">
            {compactCount(signal.installs)}
            <span className="text-ink-muted text-xs"> via skills.sh</span>
          </MastheadCell>
        ) : null}

        <MastheadCell label="Published from">
          <a
            className="hover:text-issue-accent underline-offset-4 hover:underline"
            href={repo.htmlUrl}
          >
            {/* Break at the slashes, never inside a name. */}
            github.com/<wbr />
            {repo.owner}/<wbr />
            {repo.repo}
          </a>
        </MastheadCell>
      </dl>

      {signal && signal.weeklyInstalls.length > 1 ? (
        <div className="flex items-end gap-4">
          <div className="min-w-0 flex-1">
            <Sparkline
              values={signal.weeklyInstalls}
              label={`Weekly installs of ${repo.fullName}`}
            />
          </div>
          <p className="book-caption shrink-0">Eight weeks of installs</p>
        </div>
      ) : null}

      {theme.origin !== "name-hash" ? (
        <p className="book-caption">
          Typeset in this issue&rsquo;s own colours, resolved from{" "}
          <span className="text-ink-strong">{describeOrigin(theme.origin)}</span>.
        </p>
      ) : null}
    </header>
  );
}

function MastheadCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="book-masthead__cell">
      <dt className="book-masthead__label">{label}</dt>
      <dd className="book-masthead__value">{children}</dd>
    </div>
  );
}

export function describeOrigin(origin: string): string {
  switch (origin) {
    case "curated":
      return "a curated brand profile";
    case "owner-site":
      return "the owner’s published design.md";
    case "apex":
      return "the owner’s apex domain design.md";
    case "registry":
      return "the awesome-design-md registry";
    case "repo-local":
      return "a design.md in this repository";
    default:
      return "a deterministic hash of the owner name";
  }
}
