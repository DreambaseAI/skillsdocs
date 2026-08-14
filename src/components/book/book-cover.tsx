import { BookBookmark02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { AllChaptersLink } from "@/components/book/all-chapters-link";
import { ChapterCredit } from "@/components/book/chapter-credit";
import { SkillsPreview } from "@/components/book/skills-preview";
import { CreditedRibbon } from "@/components/book/credited-ribbon";
import { InlineMarkup } from "@/components/book/deck";
import {
  editorialDate,
  licenceLabel,
  plural,
  readingTime,
  shortReadingTime,
} from "@/components/book/format";
import { InstallCommand } from "@/components/book/install-command";
import { chartSeedsFromTheme, InstallSparkline } from "@/components/charts";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
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

  // A credited edition is the repo's working library: every skill is
  // installed here, written elsewhere. It gets the credit plate and a credits
  // section where the install block would be — `npx skills add` against this
  // repo would republish other people's work under this owner's name.
  const credited = book.provenance === "credited";
  const creditedCount = book.skills.filter(
    (s) => s.origin === "credited"
  ).length;

  const installRows = [
    {
      label: "Install command",
      command: installCommand(repo.owner, repo.repo),
    },
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
            Repo No.&nbsp;{book.issueNumber}
          </span>
          <span className="bg-rule/80 h-px min-w-6 flex-1" aria-hidden />
          <span
            className={cn(MONO_LABEL, "text-ink-muted truncate text-right")}
          >
            {owner?.name ?? repo.owner}
            {updated ? <> · Updated {updated}</> : null}
            {credited ? <> · Credited</> : null}
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
              {/* The credited edition's bookmark ribbon, wrapping in from
                  the fore-edge on this line. In flow, so a long owner name
                  truncates instead of running under the cloth. */}
              {credited ? <CreditedRibbon /> : null}
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
                {chapters} {plural(chapters, "skill")}{" "}
                {credited
                  ? "in use in this repository, read as one issue."
                  : "published from this repository, read as one issue."}
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
              "cover-muted relative flex justify-between gap-4"
            )}
          >
            <span>
              {credited ? (
                <>
                  {chapters} credited {plural(chapters, "skill")}
                </>
              ) : (
                <>
                  {chapters - creditedCount}{" "}
                  {plural(chapters - creditedCount, "skill")}
                  {creditedCount > 0 ? <> + {creditedCount} credited</> : null}
                </>
              )}
            </span>
            <span>{book.totalWords.toLocaleString("en-GB")} words</span>
          </div>
        </div>

        {/* ------------------------------------------------ the inside page */}
        <div className="book-spread__inside">
          <div
            className={cn(
              MONO_LABEL,
              "text-ink-muted border-rule flex items-baseline justify-between gap-4 border-b pb-3.5"
            )}
          >
            <span>Inside this issue</span>
            <span aria-hidden>p. i</span>
          </div>

          {/* 1 — install; or, on a credited edition, the credit line. An
              install command here would republish other people's skills under
              this repo's name, so the credits state the relationship instead. */}
          <section aria-labelledby="masthead-title" className="mt-7">
            <h2
              id="masthead-title"
              className={cn(MONO_LABEL, "text-issue-accent scroll-mt-24")}
            >
              {credited ? "1 — Credits" : "1 — Install"}
            </h2>
            {credited ? (
              <Item variant="outline" size="sm" className="mt-3.5">
                <ItemMedia variant="icon">
                  <HugeiconsIcon
                    icon={BookBookmark02Icon}
                    className="text-issue-accent"
                    aria-hidden
                  />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>Skills in use, not published</ItemTitle>
                  <ItemDescription className="line-clamp-none text-pretty">
                    These skills are installed in {repo.repo}&rsquo;s working
                    tree, the book you are reading is the repository&rsquo;s
                    working library. Each skill remains its author&rsquo;s work,
                    so there is no install command on this page.
                  </ItemDescription>
                </ItemContent>
              </Item>
            ) : (
              <>
                <InstallCommand rows={installRows} className="mt-3.5" />
                <p
                  className={cn(
                    MONO_LABEL,
                    "text-ink-muted mt-3.5 flex flex-wrap gap-x-5 gap-y-1.5 normal-case"
                  )}
                >
                  <span>{licenceLabel(repo.license)}</span>
                  <span>{compact(repo.stars)} stars</span>
                  <span className="max-sm:hidden">
                    {book.totalWords.toLocaleString("en-GB")} words
                  </span>
                  {updated ? <span>Updated {updated}</span> : null}
                </p>
              </>
            )}
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
                2 — Skills
              </h2>
              <span className={cn(MONO_LABEL, "text-ink-muted")}>
                {credited ? (
                  <>
                    {chapters} credited {plural(chapters, "skill")}
                  </>
                ) : creditedCount > 0 ? (
                  <>
                    {chapters - creditedCount}{" "}
                    {plural(chapters - creditedCount, "skill")} +{" "}
                    {creditedCount} credited
                  </>
                ) : (
                  <>
                    {chapters} {plural(chapters, "skill")}
                  </>
                )}{" "}
                · {readingTime(book.totalReadingMinutes)}
              </span>
            </div>

            {/* Client list: bookmarked skills claim the preview's slots
                first, the rest fill from the top of the book. The credit
                nodes — a streamed server lookup each — are rendered here for
                the default rows only and handed in by slug. */}
            <SkillsPreview
              owner={repo.owner}
              repo={repo.repo}
              credited={credited}
              max={PREVIEW_CHAPTERS}
              skills={book.skills.map((skill, index) => ({
                slug: skill.slug,
                title: skill.title,
                dek: skill.description ? dekOf(skill.description, 110) : null,
                minutes: skill.readingMinutes,
                origin: skill.origin,
                position: index + 1,
              }))}
              credits={Object.fromEntries(
                preview
                  .filter((skill) => skill.origin === "credited")
                  .map((skill) => [
                    skill.slug,
                    /* A credited chapter's origin, when it verified: the
                       origin's mark and accent, deep-linking to this skill in
                       its own book. A sibling of the row link, never nested
                       inside it, and streamed so the lookup cannot hold up
                       the spread. */
                    <Suspense key={skill.slug} fallback={null}>
                      <ChapterCredit book={book} skill={skill} />
                    </Suspense>,
                  ])
              )}
            />

            {chapters > preview.length ? (
              <AllChaptersLink chapters={chapters} />
            ) : null}
          </section>

          {/* the folio line */}
          <div
            className={cn(
              MONO_LABEL,
              "text-ink-muted/80 border-rule mt-9 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5 border-t pt-4"
            )}
          >
            <span>
              {SITE_NAME} · Repo No.&nbsp;{book.issueNumber}
            </span>
            <a
              href={paths.bookMarkdown(repo.owner, repo.repo)}
              className="hover:text-issue-accent transition-colors"
            >
              Whole repo as markdown <span aria-hidden>↗</span>
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
  const creditedCount = book.skills.filter(
    (s) => s.origin === "credited"
  ).length;

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

        <MastheadCell label="Licence">
          {licenceLabel(repo.license)}
        </MastheadCell>

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
            github.com/
            <wbr />
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
            <span className="text-ink-muted">
              {" "}
              — the skills here originate elsewhere
            </span>
          </MastheadCell>
        ) : null}

        {/* Authorship is provenance in the most literal sense: whether the
            repo wrote what this book prints, or installed it. */}
        {book.provenance === "credited" ? (
          <MastheadCell label="Authorship">
            <span className="text-ink-strong">Credited</span>
            <span className="text-ink-muted">
              {" "}
              — skills in use here, not published from here
            </span>
          </MastheadCell>
        ) : null}

        {book.provenance === "mixed" ? (
          <MastheadCell label="Authorship">
            <span className="text-ink-strong">Mixed</span>
            <span className="text-ink-muted">
              {" "}
              — includes {creditedCount} credited{" "}
              {plural(creditedCount, "skill")} in use here
            </span>
          </MastheadCell>
        ) : null}
      </dl>

      {signal && signal.weeklyInstalls.length > 1 ? (
        /*
         * "The wire" — the repo's one real data graphic, painted in the
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
          <span className="text-ink-strong">
            {describeOrigin(theme.origin)}
          </span>
          .
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
