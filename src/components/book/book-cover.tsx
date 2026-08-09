import { ArrowDown01Icon, CheckmarkBadge01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import { Deck } from "@/components/book/deck";
import {
  editorialDate,
  licenceLabel,
  plural,
  readingTime,
} from "@/components/book/format";
import { InstallCommand } from "@/components/book/install-command";
import { chartSeedsFromTheme, InstallSparkline } from "@/components/charts";
import type { Book } from "@/lib/book";
import { external, installCommand, marketplaceCommand } from "@/lib/site";

/**
 * The cover, and the masthead that follows it.
 *
 * ## Why the cover is a band and not a block
 *
 * It used to be a headline inside the reading column: the same 692px measure
 * as body text, flanked on the left by a 17-item contents rail and on the
 * right by a stats rail of comparable visual mass. Measured, the title block
 * occupied 3.8% of the first viewport at 1920 and the composition was
 * byte-identical at 1024, 1440 and 1920 apart from the margins — zero art
 * direction. The eye path on `/anthropics/skills` went: 96px title, then the
 * 17-line rail (the largest text mass on screen), then the stats table, and
 * only *fourth* the one sentence that says what the book is.
 *
 * So the cover now escapes the three-track grid entirely. It is a full-bleed
 * band rendered above `.book-frame`, which means the rails do not exist inside
 * it — they begin where the contents begins, which is where they are useful.
 * Order on the band is: mark and issue line, title, accent rule, standfirst,
 * one line of scale, scroll cue. The install commands and the masthead table
 * are demoted below it, into the column, where a reader who has decided to
 * stay can find them.
 *
 * ## Why the title has a step-down
 *
 * `clamp()` alone does not know how many characters it is setting. At
 * `stripe/ai` a two-letter repo name at the clamp ceiling left 85% of the line
 * empty while the rule beneath still ran the full width. `--cover-cap` is a
 * per-length ceiling so a short name is set large but not absurd, and a
 * 24-character name is set to fit.
 */

export interface BookCoverProps {
  book: Book;
}

/**
 * Ceiling for the display title, by name length.
 *
 * Two decisions in one table: very short names must not float in an empty
 * line, and very long ones must not need three lines at 1440. The break points
 * were read off the real corpus — `ai` (2), `skills` (6), `azure-skills` (12),
 * `agent-toolkit-for-aws` (21).
 */
function titleCap(name: string): string {
  const n = name.length;
  if (n <= 4) return "7rem";
  if (n <= 10) return "9rem";
  if (n <= 16) return "7rem";
  if (n <= 24) return "5.5rem";
  return "4.25rem";
}

export function BookCoverBand({ book }: BookCoverProps) {
  const { repo, owner, signal } = book;
  const chapters = book.skills.length;

  return (
    <header
      id="cover"
      className="book-coverband scroll-mt-24"
      style={{ "--cover-cap": titleCap(repo.repo) } as React.CSSProperties}
    >
      <div className="book-coverband__inner">
        <div className="book-coverband__masthead">
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

        {/* The rule is the issue's, not the house's. It is the single largest
            piece of accent ink on the page and it costs nothing. */}
        <hr className="book-rule book-rule--issue" />

        {/* Second in the visual order now, and set larger: this is the one
            sentence that says what the book *is*, and it used to land fourth. */}
        {repo.description ? (
          <Deck text={repo.description} max={220} className="book-coverband__deck" />
        ) : (
          <p className="book-standfirst book-coverband__deck text-ink-muted">
            {chapters > 0
              ? `${chapters} ${plural(chapters, "skill")} published from this repository. No description was given upstream, so this issue takes its voice from the chapters themselves.`
              : "This repository publishes no description."}
          </p>
        )}

        {chapters > 0 ? (
          <p className="book-caption book-coverband__scale">
            {chapters} {plural(chapters, "chapter")} · {readingTime(book.totalReadingMinutes)}{" "}
            · {book.totalWords.toLocaleString("en-GB")} words
            {book.parts.length > 1 ? ` · ${book.parts.length} parts` : ""}
          </p>
        ) : null}
      </div>

      {/* A band this tall has to say that something follows it. */}
      <a href="#contents" className="book-coverband__cue">
        <span className="book-eyebrow m-0">Contents</span>
        <HugeiconsIcon icon={ArrowDown01Icon} className="size-4" aria-hidden />
      </a>
    </header>
  );
}

/**
 * The masthead: install commands, provenance, and the install curve.
 *
 * Split out of the cover so the band above can be a cover. Stars and installs
 * are deliberately *not* repeated here — the right rail's At-a-glance table
 * already states both, and printing five numbers three times on one page is
 * how a masthead turns into a dashboard.
 */
export function BookMasthead({ book }: BookCoverProps) {
  const { repo, signal, marketplace, theme } = book;
  const updated = editorialDate(repo.pushedAt);

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
    <section className="book-measure flex flex-col gap-6" aria-labelledby="masthead-title">
      <h2 id="masthead-title" className="book-eyebrow m-0">
        Install and provenance
      </h2>

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
            needs, and nothing on the page said either. */}
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
         * issue's own colours. Unlike the word-sized sparklines in the
         * homepage index, this is a single instance on a page the reader has
         * chosen to be on, so it can afford a canvas, a caption, and the
         * accessible data table that `AccessibleChart` puts under every chart.
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
