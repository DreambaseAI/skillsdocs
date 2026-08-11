import Link from "next/link";
import { folio, plural } from "@/components/book/format";
import {
  clusterFiles,
  subchapterGroups,
  RAIL_MAX,
  type Subchapter,
} from "@/components/book/subchapters";
import type { Book } from "@/lib/book";
import type { Skill } from "@/lib/skills";
import { paths } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * The contents rail (desktop ≥1280px) and the body of the mobile contents
 * sheet. One component for both, because a reader who has learnt the rail
 * should not have to learn a second list on their phone.
 *
 * Server-rendered: the current chapter is known from the route, so there is
 * nothing here for JavaScript to decide.
 */

/**
 * The word every entry in a part begins with, when there is one.
 *
 * `microsoft/azure-skills` puts thirty consecutive entries in this rail whose
 * first six characters are `Azure `, which makes the rail unscannable: the eye
 * has nothing to land on until character seven. When a clear majority of a
 * part shares a leading word, the word moves up to the part heading and comes
 * out of the entries — the same thing a printed index does with a repeated
 * headword. Below five entries it is not worth the indirection, and below 60%
 * it would be a lie about the rest of the list.
 */
export function sharedLead(titles: string[]): string | null {
  if (titles.length < 5) return null;

  const counts = new Map<string, number>();
  for (const title of titles) {
    const word = title.split(" ")[0] ?? "";
    // A two-letter headword saves nothing and reads as a typo once removed.
    if (word.length < 3) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  let best: [string, number] | null = null;
  for (const entry of counts) {
    if (!best || entry[1] > best[1]) best = [entry[0], entry[1]];
  }
  if (!best || best[1] / titles.length < 0.6) return null;

  // Never strip a word that leaves an entry with nothing.
  const wouldEmpty = titles.some((t) => t === best[0]);
  return wouldEmpty ? null : best[0];
}

export interface RailLeftProps {
  book: Book;
  currentSlug?: string;
  /**
   * The open subchapter, as a path relative to the skill directory — e.g.
   * `references/FORMS.md`. Set by the subchapter route; the rail marks it and
   * scrolls it into view instead of marking its parent chapter.
   */
  currentFile?: string;
  /** Rendered inside a Sheet rather than the sticky rail. */
  inSheet?: boolean;
}

export function BookContentsList({
  book,
  currentSlug,
  currentFile,
  inSheet,
}: RailLeftProps) {
  const { owner, repo } = book.repo;

  /*
   * Folios come from `book.skills`, not from a counter that walks the parts.
   *
   * Parts are sorted by title, so in a multi-part issue a part-relative
   * counter numbers the chapters in a different order from `chapterNav` — and
   * `chapterNav` is what the chapter opener prints and what the appendix
   * numbers its subchapters against. The rail used to disagree with both, which
   * only became visible once the rail started printing `4.1` under a chapter it
   * had labelled `07`.
   */
  const chapterNumbers = new Map(book.skills.map((s, i) => [s.slug, i + 1]));

  const current = currentSlug
    ? book.skills.find((skill) => skill.slug === currentSlug)
    : undefined;

  const leads = book.parts.map((part) => sharedLead(part.skills.map((s) => s.title)));

  return (
    <nav
      aria-label="Chapters"
      className={cn(inSheet && "pb-8")}
      id={inSheet ? undefined : "book-rail-contents"}
      // Programmatically focusable: the spread's "All N chapters" control
      // sends focus here so a keyboard or screen-reader user lands in the
      // list they asked for, not back where they were.
      tabIndex={inSheet ? undefined : -1}
    >
      {/*
        The head states where you *are*; the link goes where you are not.
        These used to be the same element, so on every chapter page the rail's
        running head — set in the same small-caps-and-rule treatment the right
        rail uses for "ON THIS PAGE" — asserted "Cover" while you were reading
        chapter four. Furniture that lies about your location is worse than no
        furniture.
      */}
      <p className="book-rail__title">
        Issue No.&nbsp;{book.issueNumber}
        {current ? <> · {current.title}</> : <> · Cover</>}
      </p>

      {currentSlug ? (
        <Link
          href={paths.book(owner, repo)}
          className="book-rail__link text-ink-muted hover:text-ink-strong mt-1 flex items-baseline gap-1.5 no-underline"
        >
          <span aria-hidden="true">↖</span>
          Back to the cover
        </Link>
      ) : null}

      {book.parts.map((part, partIndex) => {
        const lead = leads[partIndex];
        const heading = lead ? `${part.title} · ${lead}…` : part.title;
        return (
          <div key={part.group || "all"} className="mt-4">
            {book.parts.length > 1 || part.group || lead ? (
              <p className="book-eyebrow mt-3 mb-1.5">{heading}</p>
            ) : null}
            <ul>
              {part.skills.map((skill) => {
                const counter = chapterNumbers.get(skill.slug) ?? 0;
                const isCurrent = skill.slug === currentSlug;
                const stripped =
                  lead && skill.title.startsWith(`${lead} `)
                    ? skill.title.slice(lead.length + 1)
                    : null;
                return (
                  <li key={skill.slug}>
                    <Link
                      href={paths.chapter(owner, repo, skill.slug)}
                      className="book-rail__link flex gap-2"
                      // On a subchapter the *file* is the page; the chapter is
                      // the branch you are inside. `aria-current="page"` on
                      // both would be a lie about one of them.
                      aria-current={
                        isCurrent ? (currentFile ? "true" : "page") : undefined
                      }
                      data-open={isCurrent ? "" : undefined}
                    >
                      <span
                        className="text-ink-muted shrink-0 tabular-nums"
                        aria-hidden="true"
                      >
                        {folio(counter)}
                      </span>
                      <span className="min-w-0">
                        {/* The headword is only hidden visually: a screen
                            reader still hears the chapter's whole name. */}
                        {stripped ? <span className="sr-only">{lead} </span> : null}
                        {stripped ?? skill.title}
                      </span>
                    </Link>

                    {/* Only the chapter you are in expands. Every chapter
                        expanded would put 82 rows under `canvas-design` alone,
                        and the rail would stop being a contents. */}
                    {isCurrent ? (
                      <SubchapterBranch
                        owner={owner}
                        repo={repo}
                        skill={skill}
                        chapter={counter}
                        currentFile={currentFile}
                        max={inSheet ? SHEET_MAX : RAIL_MAX}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <p className="book-caption border-rule mt-5 border-t pt-3">
        {book.skills.length} {plural(book.skills.length, "chapter")} ·{" "}
        {book.totalReadingMinutes} min
      </p>
    </nav>
  );
}

/* ---------------------------------------------------------- subchapters */

/**
 * A gap in a windowed rail: "…, and 68 more".
 *
 * Modelled rather than rendered inline so the window is a pure function that
 * can be reasoned about — and tested — without a DOM.
 */
export interface RailGap {
  gap: number;
}

/**
 * A directory the rail names instead of enumerating.
 *
 * `canvas-design` bundles 27 font licences in `canvas-fonts/`, all of them
 * readable text and therefore all of them numbered subchapters. The appendix
 * already puts them behind one disclosure; before this the rail printed the
 * first thirteen — `Arsenal SC OFL`, `Big Shoulders OFL`, `Boldonse OFL`, … —
 * and pushed the one file at the skill's own root out of the window entirely.
 * The two surfaces disagreed about what the chapter contains, and the one that
 * is supposed to be scannable lost.
 */
export interface RailCluster {
  dir: string;
  count: number;
}

export type RailRow = Subchapter | RailGap | RailCluster;

export function isGap(row: RailRow): row is RailGap {
  return "gap" in row;
}

export function isCluster(row: RailRow): row is RailCluster {
  return "dir" in row && !("relPath" in row);
}

/** Files a row stands for: one, or a whole directory. */
function weightOf(row: RailRow): number {
  return isCluster(row) ? row.count : 1;
}

/**
 * Fold a group's readable files into rows, collapsing the directories the
 * appendix collapses.
 *
 * The clustering decision itself is `clusterFiles`, shared with the appendix —
 * the rail must never invent a grouping the appendix does not show, or a
 * reader following `canvas-fonts/` from the rail would arrive at a page that
 * has no such heading.
 *
 * The file you are *reading* is always a row of its own, even when it lives
 * inside a collapsed directory. It sits directly under the directory it
 * belongs to, which is also the sentence a printed index would use.
 */
export function collapseClusters(
  files: Subchapter[],
  currentFile?: string,
): Array<Subchapter | RailCluster> {
  const out: Array<Subchapter | RailCluster> = [];

  for (const cluster of clusterFiles(files)) {
    if (!cluster.collapsed || !cluster.dir) {
      out.push(...cluster.files);
      continue;
    }
    out.push({ dir: cluster.dir, count: cluster.files.length });
    const open = cluster.files.find((file) => file.relPath === currentFile);
    if (open) out.push(open);
  }

  return out;
}

/**
 * Which rows the rail prints, and how many files it admits to hiding.
 *
 * `canvas-design` ships 82 resources and `supabase-postgres-best-practices`
 * 35; printing either in full turns the contents rail into the appendix, which
 * is the one thing a contents must not become. So the rail prints the first
 * `max` and defers.
 *
 * The exception is the file you are *reading*. A rail that omits the current
 * page is worse than a rail that is too long: it tells the reader they are
 * nowhere. When the open file falls outside the window it displaces the last
 * printed row, and the gap moves above it.
 *
 * The count in the gap is files, not rows — a dropped directory row takes its
 * whole directory with it, and "3 more" over 27 hidden licences would be the
 * one number on this page a reader could catch us on.
 */
export function railWindow(
  rows: readonly RailRow[],
  currentFile: string | undefined,
  max = RAIL_MAX,
): { rows: RailRow[]; hidden: number } {
  if (rows.length <= max) return { rows: [...rows], hidden: 0 };

  const currentIndex = currentFile
    ? rows.findIndex((row) => !isCluster(row) && !isGap(row) && row.relPath === currentFile)
    : -1;

  const tally = (dropped: readonly RailRow[]) =>
    dropped.reduce((sum, row) => sum + weightOf(row), 0);

  // One row of the budget is spent on the gap itself.
  const head = rows.slice(0, max - 1);
  if (currentIndex === -1 || currentIndex < head.length) {
    const hidden = tally(rows.slice(head.length));
    return { rows: [...head, { gap: hidden }], hidden };
  }

  const kept = head.slice(0, head.length - 1);
  const hidden = tally(rows.slice(kept.length)) - 1;
  return {
    rows: [...kept, { gap: hidden }, rows[currentIndex]],
    hidden,
  };
}

/**
 * The branch is shorter in the phone sheet than in the desktop rail.
 *
 * Same list, different budget. A 390 × 844 sheet fits about fourteen rows
 * before the fold, and spending all of them on one chapter's subchapters means
 * a reader who opened contents to reach chapter 12 has to scroll past chapter
 * 1's appendix to find out chapter 12 exists. Eight leaves the chapters either
 * side of you visible, which is what a contents is for.
 */
const SHEET_MAX = 8;

interface BranchProps {
  owner: string;
  repo: string;
  skill: Skill;
  /** Chapter position, 1-based — the left half of every folio below. */
  chapter: number;
  currentFile?: string;
  max: number;
}

/**
 * The open chapter's subchapters, indented under it.
 *
 * This is the argument the appendix makes, made a second time where it counts:
 * a reader scanning the contents sees `4.1 Forms`, `4.2 Reference` sitting in
 * the same list as the chapters, in the same folio treatment, one indent in.
 * Bundled files stop being an attachment and become pages.
 *
 * Groups are named only when there is more than one, and only as a hairline
 * label — inside a rail, "References" above four entries is orientation;
 * "References" above *all* the entries is furniture.
 */
function SubchapterBranch({
  owner,
  repo,
  skill,
  chapter,
  currentFile,
  max,
}: BranchProps) {
  const groups = subchapterGroups(skill.resources, {
    owner,
    repo,
    slug: skill.slug,
    chapter,
  });
  const readable = groups.flatMap((g) => g.readable);
  if (readable.length === 0) return null;

  const named = groups.filter((g) => g.readable.length > 0).length > 1;
  const appendixHref = `${paths.chapter(owner, repo, skill.slug)}#chapter-appendix-title`;

  /*
   * Rows are folded per group, then concatenated — never folded across the
   * whole chapter. `docx` puts its scripts and its schemas in the same
   * directory tree, and clustering the two groups together would file fifteen
   * Python scripts under the same heading as forty-four XML schemas.
   */
  const folded: RailRow[] = [];
  const labels = new Map<RailRow, string>();
  for (const group of groups) {
    if (group.readable.length === 0) continue;
    const rows = collapseClusters(group.readable, currentFile);
    if (named && rows[0]) labels.set(rows[0], group.title);
    folded.push(...rows);
  }

  const { rows, hidden } = railWindow(folded, currentFile, max);

  /*
   * `docx` numbers `scripts/__init__.py` 6.1 and
   * `scripts/office/helpers/__init__.py` 6.5, and `resourceTitle` reduces both
   * to "Init". Two identical rows in a contents are worse than a longer one,
   * so where a title repeats the row earns the directory that tells them
   * apart. Only where it repeats — the appendix carries the full path already,
   * and a rail that printed one under every entry would be the appendix.
   */
  const seen = new Map<string, number>();
  for (const row of folded) {
    if (isCluster(row) || isGap(row)) continue;
    seen.set(row.title, (seen.get(row.title) ?? 0) + 1);
  }
  const ambiguous = new Set(
    [...seen].filter(([, count]) => count > 1).map(([title]) => title),
  );

  return (
    <div className="book-rail__branch">
      <ul>
        {rows.map((row) => {
          if (isGap(row)) {
            return (
              <li key="gap">
                <Link className="book-rail__more" href={appendixHref}>
                  <span aria-hidden="true">⋯</span>
                  {row.gap} more in the appendix
                </Link>
              </li>
            );
          }
          if (isCluster(row)) {
            return (
              <ClusterRow
                key={`dir:${row.dir}`}
                cluster={row}
                label={labels.get(row) ?? null}
                href={appendixHref}
              />
            );
          }
          return (
            <SubchapterRow
              key={row.relPath}
              file={row}
              label={labels.get(row) ?? null}
              qualifier={ambiguous.has(row.title) ? qualifierFor(row) : null}
              current={row.relPath === currentFile}
            />
          );
        })}
      </ul>
      {hidden === 0 && readable.length > 3 ? (
        <Link className="book-rail__more" href={appendixHref}>
          Appendix · {readable.length} {plural(readable.length, "subchapter")}
        </Link>
      ) : null}
    </div>
  );
}

/**
 * A directory row: named, counted, and pointed at the appendix.
 *
 * Deliberately not a folio. These files *have* numbers — the appendix prints
 * them — but a range in a rail row would read as a page reference to something
 * that is one line long. The count is the honest summary.
 */
function ClusterRow({
  cluster,
  label,
  href,
}: {
  cluster: RailCluster;
  label: string | null;
  href: string;
}) {
  return (
    <li>
      {label ? <p className="book-rail__branchlabel">{label}</p> : null}
      <Link href={href} className="book-rail__sub" data-cluster="">
        <span className="book-rail__subfolio" aria-hidden="true">
          ⋯
        </span>
        <span className="min-w-0">
          <code className="book-rail__subdir">{cluster.dir}/</code>
          <span className="book-rail__subcount">
            {cluster.count} {plural(cluster.count, "file")}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** The innermost directory of a file, which is what tells two of them apart. */
export function qualifierFor(file: Subchapter): string | null {
  const cut = file.relPath.lastIndexOf("/");
  if (cut === -1) return null;
  const dir = file.relPath.slice(0, cut);
  const leaf = dir.slice(dir.lastIndexOf("/") + 1);
  return leaf || null;
}

function SubchapterRow({
  file,
  label,
  qualifier,
  current,
}: {
  file: Subchapter;
  label: string | null;
  qualifier: string | null;
  current: boolean;
}) {
  if (!file.href) return null;
  return (
    <li>
      {label ? <p className="book-rail__branchlabel">{label}</p> : null}
      <Link
        href={file.href}
        className="book-rail__sub"
        aria-current={current ? "page" : undefined}
      >
        <span className="book-rail__subfolio" aria-hidden="true">
          {file.number}
        </span>
        {/* Names only. The size, the type and the extract are the appendix's
            job; a contents that carries them stops being scannable, which is
            the one thing thirty-five indented rows cannot afford. */}
        <span className="min-w-0">
          {file.title}
          {qualifier ? (
            <span className="book-rail__subqual">
              <span aria-hidden="true"> · </span>
              {qualifier}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

export function RailLeft(props: RailLeftProps) {
  return (
    <aside
      className="book-rail book-rail--left"
      // Two unlabelled `complementary` landmarks on one page announce as
      // "complementary, complementary"; the label is what makes the rail
      // navigable rather than just present.
      aria-label="Issue contents"
      data-print="hide"
    >
      <BookContentsList {...props} />
    </aside>
  );
}
