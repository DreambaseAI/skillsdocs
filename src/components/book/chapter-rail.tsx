import {
  ArrowUpRight01Icon,
  Copy01Icon,
  File01Icon,
  GithubIcon,
  SourceCodeIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { compactCount, plural, shortReadingTime } from "@/components/book/format";
import { OnThisPage, type RailHeading } from "@/components/book/rail-right";
import type { RailOutlineEntry } from "@/components/book/subchapters";
import type { Book } from "@/lib/book";
import type {
  LoadedResource,
  ResourceNeighbour,
} from "@/lib/resource-loader";
import type { Skill } from "@/lib/skills";
import { external, paths } from "@/lib/site";

/**
 * The right rail on a chapter: where you are, what this costs to read, and how
 * to get at the source. Sticky, scrollable, and contained — a rail that
 * scroll-chains into the article behind it is worse than no rail.
 */

export interface ChapterRailProps {
  book: Book;
  skill: Skill;
  headings: RailHeading[];
  /** Chapter position, 1-based. */
  index: number;
}

export function ChapterRail({ book, skill, headings, index }: ChapterRailProps) {
  const { owner, repo, defaultBranch } = book.repo;
  const installs = book.signal?.perSkillInstalls?.[skill.name];

  /*
   * The appendix is a section of the chapter, so it belongs in the chapter's
   * contents. It has no heading in the rendered markdown — it is furniture we
   * add after the pipeline — so it is appended here rather than discovered.
   */
  const railHeadings: RailHeading[] =
    skill.resources.length > 0
      ? [...headings, { id: "chapter-appendix-title", text: "Appendix", depth: 2 }]
      : headings;

  return (
    <aside className="book-rail" aria-label="Chapter details" data-print="hide">
      <OnThisPage headings={railHeadings} id="contents" />

      <div className="border-rule mt-7 border-t pt-4">
        <p className="book-rail__title border-none pb-2">This chapter</p>
        <dl className="book-stats">
          <Stat label="Position">
            {index} of {book.skills.length}
          </Stat>
          <Stat label="Reading time">{shortReadingTime(skill.readingMinutes)}</Stat>
          <Stat label="Words">{skill.wordCount.toLocaleString("en-GB")}</Stat>
          {skill.resources.length > 0 ? (
            <Stat label="Bundled files">
              <a href="#chapter-appendix-title" className="book-rail__statlink">
                {skill.resources.length}{" "}
                {plural(skill.resources.length, "file")}
              </a>
            </Stat>
          ) : null}
          {typeof installs === "number" && installs > 0 ? (
            <Stat label="Installs">{compactCount(installs)}</Stat>
          ) : null}
        </dl>
      </div>

      <div className="border-rule mt-7 border-t pt-4">
        <p className="book-rail__title border-none pb-2">Source</p>
        <ul className="grid gap-1">
          <RailLink
            href={external.file(owner, repo, defaultBranch, skill.skillMdPath)}
            icon={File01Icon}
            external
          >
            View SKILL.md
          </RailLink>
          <RailLink href={external.repo(owner, repo)} icon={GithubIcon} external>
            {owner}/{repo}
          </RailLink>
          <RailLink
            href={paths.chapterMarkdown(owner, repo, skill.slug)}
            icon={Copy01Icon}
          >
            Markdown for agents
          </RailLink>
        </ul>
      </div>
    </aside>
  );
}

/* -------------------------------------------------------- the subchapter */

export interface SubchapterRailProps {
  /**
   * The loaded file, exactly as the subchapter route already has it.
   *
   * The prop is the route's own value object rather than a spread of eight
   * scalars for one reason: this rail and the page must never disagree about
   * which file is open, and the cheapest way to guarantee that is to give them
   * one object between them.
   */
  loaded: LoadedResource;
  /** "10.5" — the folio the appendix printed for this file, when it has one. */
  number?: string | null;
  /**
   * Jump-to-line outline of a code subchapter, from `codeOutline`.
   *
   * Optional because `LoadedResource` carries the *rendered* body and not the
   * source text, and the outline is a function of the source. Until the loader
   * hands it over, a code subchapter's rail simply has no jump list — which is
   * the honest state, not a broken one. `codeOutline` in `subchapters.ts` is
   * the function that produces it.
   */
  outline?: RailOutlineEntry[];
}

export function SubchapterRail({
  loaded,
  number,
  outline = [],
}: SubchapterRailProps) {
  const { skill, resource, body } = loaded;
  const headings = body.view === "prose" ? body.rendered.headings : [];
  const lines = body.view === "code" || body.view === "preview" ? body.lines : null;

  // `OnThisPage` holds its own bar: depths 2-4, at least two of them. Knowing
  // whether it will render is what decides who carries the `#contents` skip
  // target, so the test is duplicated rather than guessed at.
  const usable = headings.filter((h) => h.depth >= 2 && h.depth <= 4);
  const hasHeadings = usable.length >= 2;

  return (
    <aside className="book-rail" aria-label="Subchapter details" data-print="hide">
      <nav aria-label="Parent chapter" className="book-rail__up">
        <Link href={skill.href} className="book-rail__uplink">
          <span className="book-rail__upfolio" aria-hidden="true">
            {skill.index}
          </span>
          <span className="min-w-0">
            <span className="book-rail__uplabel">Up to chapter {skill.index}</span>
            <span className="book-rail__uptitle">{skill.title}</span>
          </span>
        </Link>
      </nav>

      {hasHeadings ? (
        <OnThisPage headings={headings} id="contents" className="mt-6" />
      ) : outline.length > 0 ? (
        <FileOutline outline={outline} className="mt-6" />
      ) : null}

      <div className="border-rule mt-7 border-t pt-4">
        <p className="book-rail__title border-none pb-2">This file</p>
        <dl className="book-stats">
          {number ? <Stat label="Number">{number}</Stat> : null}
          {/* A font is bundled with the chapter but is not a page of it, and a
              position would promise a folio the appendix never printed. */}
          <Stat label="Position">
            {loaded.position > 0
              ? `${loaded.position} of ${loaded.total}`
              : "Not set in the book"}
          </Stat>
          <Stat label="Type">{resource.label}</Stat>
          <Stat label="Size">{loaded.size}</Stat>
          {lines !== null && lines > 0 ? (
            <Stat label="Lines">{lines.toLocaleString("en-GB")}</Stat>
          ) : null}
        </dl>
      </div>

      {loaded.prev || loaded.next ? (
        <div className="border-rule mt-7 border-t pt-4">
          <p className="book-rail__title border-none pb-2">Nearby</p>
          <ul className="grid gap-1">
            {loaded.prev ? (
              <SiblingLink rel="Previous" neighbour={loaded.prev} />
            ) : null}
            {loaded.next ? <SiblingLink rel="Next" neighbour={loaded.next} /> : null}
          </ul>
        </div>
      ) : null}

      <div className="border-rule mt-7 border-t pt-4">
        <p className="book-rail__title border-none pb-2">Source</p>
        <ul className="grid gap-1">
          <RailLink
            href={loaded.blobUrl}
            icon={resource.render === "prose" ? File01Icon : SourceCodeIcon}
            external
          >
            {resource.relPath}
          </RailLink>
          <RailLink
            href={external.raw(loaded.owner, loaded.repo, loaded.ref, resource.path)}
            icon={Copy01Icon}
            external
          >
            Raw file
          </RailLink>
          <RailLink
            href={external.repo(loaded.owner, loaded.repo)}
            icon={GithubIcon}
            external
          >
            {loaded.owner}/{loaded.repo}
          </RailLink>
        </ul>
      </div>
    </aside>
  );
}

/**
 * "In this file" — a code subchapter's jump list.
 *
 * Not `OnThisPage`: there is no scroll spy here on purpose. The anchors are
 * `#L<n>` on the code block's own line gutter, and a marker that tracked the
 * viewport across 700 lines of Python would flicker through a dozen entries
 * per scroll gesture. A jump list is what a file browser gives you, and it is
 * the right amount of furniture for a file.
 */
export function FileOutline({
  outline,
  className,
}: {
  outline: RailOutlineEntry[];
  className?: string;
}) {
  if (outline.length < 2) return null;
  return (
    <nav id="contents" tabIndex={-1} aria-label="In this file" className={className}>
      <p className="book-rail__title">In this file</p>
      <ul className="mt-2">
        {outline.map((entry) => (
          <li key={entry.line}>
            <a href={`#L${entry.line}`} className="book-rail__jump">
              <span className="book-rail__jumpline" aria-hidden="true">
                {entry.line}
              </span>
              <span className="book-rail__jumptext">{entry.text}</span>
              <span className="sr-only"> — line {entry.line}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SiblingLink({
  rel,
  neighbour,
}: {
  rel: string;
  neighbour: ResourceNeighbour;
}) {
  return (
    <li>
      <Link href={neighbour.href} className="book-rail__sibling">
        <span className="book-rail__siblingrel">{rel}</span>
        <span className="book-rail__siblingtitle">
          <span className="book-rail__subfolio" aria-hidden="true">
            {neighbour.group}
          </span>{" "}
          {neighbour.title}
        </span>
      </Link>
    </li>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="book-stat">
      <dt>{label}</dt>
      <dd className="book-stat__value">{children}</dd>
    </div>
  );
}

function RailLink({
  href,
  icon,
  external: isExternal,
  children,
}: {
  href: string;
  icon: typeof File01Icon;
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li>
      <a
        href={href}
        className="text-ink-muted hover:text-ink-strong focus-visible:outline-issue-accent flex items-center gap-2 rounded-sm py-1 text-sm no-underline"
        {...(isExternal
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
      >
        <HugeiconsIcon icon={icon} className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 truncate">{children}</span>
        {isExternal ? (
          <>
            <HugeiconsIcon
              icon={ArrowUpRight01Icon}
              className="size-3 shrink-0 opacity-60"
              aria-hidden
            />
            <span className="sr-only">(opens in a new tab)</span>
          </>
        ) : null}
      </a>
    </li>
  );
}
