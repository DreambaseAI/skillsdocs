import Image from "next/image";
import Link from "next/link";
import { AllChaptersLink } from "@/components/book/all-chapters-link";
import { InlineMarkup } from "@/components/book/deck";
import {
  editorialDate,
  folio,
  licenceLabel,
  plural,
  readingTime,
  shortReadingTime,
} from "@/components/book/format";
import { InstallCommand } from "@/components/book/install-command";
import { chartSeedsFromTheme, InstallSparkline } from "@/components/charts";
import { COVER_STAR_CLASS } from "@/components/home/cover-star";
import { FavoriteButton } from "@/components/home/favorite-button";
import { compact } from "@/components/home/format";
import type { Book } from "@/lib/book";
import { dekOf } from "@/lib/deck";
import {
  external,
  installCommand,
  marketplaceCommand,
  paths,
  SITE_NAME,
} from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * The issue's opening spread.
 *
 * Left page: the cover — dark stock washed with the issue accent, the owner's
 * mark, the display title, the dek, and one action: start reading. Right
 * page: "Inside this issue" — the install command, the provenance line, and
 * the first chapters, with the full contents one anchor away. The spread
 * replaces the old full-bleed cover band: the same facts, but composed as a
 * magazine opened flat rather than a title page followed by furniture.
 *
 * The cover is a `.cover-face` (cover.css): it keeps its own ink in both
 * colour schemes, because a printed cover does not change colour with the
 * room's lights. Everything on the right page sits on ordinary paper tokens.
 */

export interface BookCoverProps {
  book: Book;
}

const MONO_LABEL =
  "font-mono text-[0.62rem] font-medium tracking-[0.18em] uppercase";

/**
 * Ceiling for the display title, by name length, tuned to the cover column
 * rather than the old full-bleed band. Break points read off the real corpus —
 * `ai` (2), `skills` (6), `azure-skills` (12), `agent-toolkit-for-aws` (21).
 */
function titleCap(name: string): string {
  const n = name.length;
  if (n <= 4) return "5.5rem";
  if (n <= 10) return "4.6rem";
  if (n <= 16) return "3.4rem";
  if (n <= 24) return "2.8rem";
  return "2.3rem";
}

/** How many chapters the inside page previews before deferring to the TOC. */
const PREVIEW_CHAPTERS = 5;

export function BookCoverSpread({ book }: BookCoverProps) {
  const { repo, owner, marketplace } = book;
  const chapters = book.skills.length;
  const first = book.skills[0];
  const updated = editorialDate(repo.pushedAt);
  const preview = book.skills.slice(0, PREVIEW_CHAPTERS);

  const installRows = [
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
    <header
      id="cover"
      className="book-spread scroll-mt-24"
      style={{ "--cover-cap": titleCap(repo.repo) } as React.CSSProperties}
    >
      {/* ------------------------------------------------- the issue rule */}
      <div className="book-spread__head">
        <div className="book-spread__headinner">
          <span className={cn(MONO_LABEL, "text-issue-accent shrink-0")}>
            Issue No.&nbsp;{book.issueNumber}
          </span>
          <span className="bg-rule/80 h-px min-w-6 flex-1" aria-hidden />
          <span
            className={cn(MONO_LABEL, "text-ink-muted truncate text-right")}
          >
            {owner?.name ?? repo.owner}
            {updated ? <> · Updated {updated}</> : null}
            <span className="max-sm:hidden">
              {" "}
              · {repo.archived ? "Archived" : "In print"}
            </span>
          </span>
        </div>
      </div>

      <div className="book-spread__grid">
        {/* ------------------------------------------------------ the cover */}
        <div className="book-spread__cover cover-face">
          <div className="relative flex items-center justify-between gap-4">
            <span className={cn(MONO_LABEL, "cover-muted")}>
              {SITE_NAME} · No.&nbsp;{book.issueNumber}
            </span>
            <FavoriteButton
              owner={repo.owner}
              repo={repo.repo}
              size="icon"
              className={COVER_STAR_CLASS}
            />
          </div>

          <div className="relative min-w-0">
            <div className="mb-4 flex items-center gap-3">
              {repo.ownerAvatar ? (
                <Image
                  src={repo.ownerAvatar}
                  alt=""
                  width={128}
                  height={128}
                  priority
                  className="cover-avatar size-10 shrink-0"
                  aria-hidden
                />
              ) : null}
              <span className={cn(MONO_LABEL, "cover-muted truncate")}>
                {owner?.name ?? repo.owner}
              </span>
            </div>

            <h1 className="book-spread__title">
              <span className="sr-only">{repo.owner} / </span>
              {repo.repo}
            </h1>

            <hr className="cover-rule mt-5" />

            {repo.description ? (
              <p className="cover-muted mt-4 max-w-prose text-[0.95rem] leading-normal text-pretty">
                <InlineMarkup text={dekOf(repo.description, 160)} />
              </p>
            ) : (
              <p className="cover-muted mt-4 max-w-prose text-[0.95rem] leading-normal text-pretty">
                {chapters} {plural(chapters, "skill")} published from this
                repository, read as one issue.
              </p>
            )}

            {first ? (
              <Link
                href={paths.chapter(repo.owner, repo.repo, first.slug)}
                className="cover-cta mt-6 h-12 px-6 text-[0.85rem]"
              >
                Start reading — {shortReadingTime(first.readingMinutes)}
                <span aria-hidden>→</span>
              </Link>
            ) : null}
          </div>

          <div
            className={cn(
              MONO_LABEL,
              "cover-muted relative flex justify-between gap-4",
            )}
          >
            <span>
              {chapters} {plural(chapters, "chapter")}
            </span>
            <span>{book.totalWords.toLocaleString("en-GB")} words</span>
          </div>
        </div>

        {/* ------------------------------------------------ the inside page */}
        <div className="book-spread__inside">
          <div
            className={cn(
              MONO_LABEL,
              "text-ink-muted border-rule flex items-baseline justify-between gap-4 border-b pb-3.5",
            )}
          >
            <span>Inside this issue</span>
            <span aria-hidden>p. i</span>
          </div>

          {/* 1 — install */}
          <section aria-labelledby="masthead-title" className="mt-7">
            <h2
              id="masthead-title"
              className={cn(MONO_LABEL, "text-issue-accent scroll-mt-24")}
            >
              1 — Install
            </h2>
            <InstallCommand rows={installRows} className="mt-3.5" />
            <p
              className={cn(
                MONO_LABEL,
                "text-ink-muted mt-3.5 flex flex-wrap gap-x-5 gap-y-1.5 normal-case",
              )}
            >
              <span>{licenceLabel(repo.license)}</span>
              <span>{compact(repo.stars)} stars</span>
              <span className="max-sm:hidden">
                {book.totalWords.toLocaleString("en-GB")} words
              </span>
              {updated ? <span>Updated {updated}</span> : null}
            </p>
          </section>

          {/* 2 — chapters. Carries `#contents`: this preview is the page's
              contents now, so the skip link, the `T` shortcut and the section
              rail all land here. */}
          <section
            id="contents"
            tabIndex={-1}
            aria-labelledby="spread-chapters"
            className="mt-9 scroll-mt-24"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2
                id="spread-chapters"
                className={cn(MONO_LABEL, "text-issue-accent")}
              >
                2 — Chapters
              </h2>
              <span className={cn(MONO_LABEL, "text-ink-muted")}>
                {chapters} {plural(chapters, "skill")} ·{" "}
                {readingTime(book.totalReadingMinutes)}
              </span>
            </div>

            <ol className="mt-1">
              {preview.map((skill, index) => (
                <li key={skill.slug} className="border-rule/80 border-b">
                  <Link
                    href={paths.chapter(repo.owner, repo.repo, skill.slug)}
                    className="group/ch hover:bg-paper-raised/60 grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-baseline gap-x-4 py-4 transition-colors"
                  >
                    <span
                      className="text-issue-accent font-mono text-[0.78rem] font-medium"
                      aria-hidden
                    >
                      {folio(index + 1)}
                    </span>
                    <span className="min-w-0">
                      <span className="font-display text-ink-strong group-hover/ch:text-issue-accent block text-[1.35rem] leading-snug tracking-[-0.012em] text-balance transition-colors">
                        {skill.title}
                      </span>
                      {skill.description ? (
                        <span className="text-ink-muted mt-1 block text-sm leading-snug text-pretty">
                          <InlineMarkup text={dekOf(skill.description, 110)} />
                        </span>
                      ) : null}
                    </span>
                    <span className="text-ink-muted font-mono text-[0.72rem] tabular-nums">
                      {shortReadingTime(skill.readingMinutes)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>

            {chapters > preview.length ? (
              <AllChaptersLink chapters={chapters} />
            ) : null}
          </section>

          {/* the folio line */}
          <div
            className={cn(
              MONO_LABEL,
              "text-ink-muted/80 border-rule mt-9 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5 border-t pt-4",
            )}
          >
            <span>
              {SITE_NAME} · Issue No.&nbsp;{book.issueNumber}
            </span>
            <a
              href={paths.bookMarkdown(repo.owner, repo.repo)}
              className="hover:text-issue-accent transition-colors"
            >
              Whole issue as markdown <span aria-hidden>↗</span>
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * The provenance table, in the reading column below the contents.
 *
 * The install commands moved up onto the opening spread, where a reader
 * decides; what stays here is what a reader *evaluating* wants — owner,
 * licence, dates, origin, the install curve — stated once, in one place.
 */
export function BookMasthead({ book }: BookCoverProps) {
  const { repo, signal, theme } = book;
  const updated = editorialDate(repo.pushedAt);

  return (
    <section
      className="book-measure flex flex-col gap-6"
      aria-labelledby="provenance-title"
    >
      <h2 id="provenance-title" className="book-eyebrow m-0">
        Provenance
      </h2>

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

        {/* Archived and fork are provenance a reader evaluating a repository
            needs, and nothing else on the page says either. */}
        {repo.archived ? (
          <MastheadCell label="Status">
            <span className="text-ink-strong">Archived upstream</span>
            <span className="text-ink-muted"> — read-only on GitHub</span>
          </MastheadCell>
        ) : null}

        {repo.isFork ? (
          <MastheadCell label="Status">
            <span className="text-ink-strong">A fork</span>
            <span className="text-ink-muted"> — the skills here originate elsewhere</span>
          </MastheadCell>
        ) : null}
      </dl>

      {signal && signal.weeklyInstalls.length > 1 ? (
        /*
         * "The wire" — the issue's one real data graphic, painted in the
         * issue's own colours, with the accessible data table that
         * `AccessibleChart` puts under every chart.
         */
        <InstallSparkline
          weeklyInstalls={signal.weeklyInstalls}
          seeds={chartSeedsFromTheme(theme)}
          subject={repo.fullName}
          installs={signal.installs}
        />
      ) : null}

      {theme.origin !== "name-hash" ? (
        <p className="book-caption">
          Typeset in this issue&rsquo;s own colours, resolved from{" "}
          <span className="text-ink-strong">{describeOrigin(theme.origin)}</span>.
        </p>
      ) : null}
    </section>
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
