import {
  ArrowUpRight01Icon,
  Copy01Icon,
  File01Icon,
  GithubIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { compactCount, plural, shortReadingTime } from "@/components/book/format";
import { OnThisPage, type RailHeading } from "@/components/book/rail-right";
import type { Book } from "@/lib/book";
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

  return (
    <aside className="book-rail" aria-label="Chapter details" data-print="hide">
      <OnThisPage headings={headings} id="contents" />

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
              {skill.resources.length}{" "}
              {plural(skill.resources.length, "file")}
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
