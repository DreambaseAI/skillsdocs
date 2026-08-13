import {
  ArrowUpRight01Icon,
  Copy01Icon,
  GithubIcon,
  Rocket01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { compactCount, plural, readingTime } from "@/components/book/format";
import type { Book } from "@/lib/book";
import { paths, SKILLS_SH } from "@/lib/site";

/**
 * The right rail on the cover page: the issue at a glance, and the four URLs
 * a reader or an agent might want next.
 *
 * The anchors below deliberately point at sections rather than at routes. The
 * colophon and the accessibility report are parts of this page, not pages of
 * their own — the third path segment belongs entirely to skill slugs, and a
 * repository that publishes a skill called `colophon` must not be shadowed by
 * our furniture.
 */

export interface BookRailProps {
  book: Book;
  /** Section anchors present on the page, in reading order. */
  sections: Array<{ id: string; label: string }>;
}

export function BookRail({ book, sections }: BookRailProps) {
  const { repo, signal } = book;

  return (
    <aside className="book-rail" aria-label="Issue details" data-print="hide">
      <nav aria-label="Sections of this issue">
        <p className="book-rail__title">In this issue</p>
        <ul className="mt-2">
          {sections.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className="book-rail__link">
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-rule mt-7 border-t pt-4">
        <p className="book-rail__title border-none pb-2">At a glance</p>
        <dl className="book-stats">
          <Stat label="Chapters">
            {book.skills.length} {plural(book.skills.length, "chapter")}
          </Stat>
          <Stat label="Reading time">{readingTime(book.totalReadingMinutes)}</Stat>
          <Stat label="Words">{book.totalWords.toLocaleString("en-GB")}</Stat>
          <Stat label="Stars">{compactCount(repo.stars)}</Stat>
          {book.provenance !== "authored" ? (
            <Stat label="Authorship">
              {book.provenance === "credited" ? "Credited" : "Mixed"}
            </Stat>
          ) : null}
          {signal && signal.installs > 0 ? (
            <Stat label="Installs">{compactCount(signal.installs)}</Stat>
          ) : null}
          {book.parts.length > 1 ? (
            <Stat label="Parts">{book.parts.length}</Stat>
          ) : null}
        </dl>
      </div>

      <div className="border-rule mt-7 border-t pt-4">
        <p className="book-rail__title border-none pb-2">Elsewhere</p>
        <ul className="grid gap-1">
          <RailLink href={repo.htmlUrl} icon={GithubIcon} external>
            {repo.fullName}
          </RailLink>
          {signal ? (
            <RailLink
              href={`${SKILLS_SH}/${repo.fullName}`}
              icon={Rocket01Icon}
              external
            >
              On skills.sh
            </RailLink>
          ) : null}
          {repo.homepage ? (
            <RailLink href={repo.homepage} icon={ArrowUpRight01Icon} external>
              {hostOf(repo.homepage)}
            </RailLink>
          ) : null}
          <RailLink
            href={paths.bookMarkdown(repo.owner, repo.repo)}
            icon={Copy01Icon}
          >
            Whole issue as markdown
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
  icon: typeof GithubIcon;
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li>
      <a
        href={href}
        className="text-ink-muted hover:text-ink-strong flex items-center gap-2 rounded-sm py-1 text-sm no-underline"
        {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
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

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
