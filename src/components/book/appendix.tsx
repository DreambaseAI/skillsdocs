import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";

import { plural } from "@/components/book/format";
import {
  clusterFiles,
  describeBinaries,
  extractCandidates,
  firstSentence,
  subchapterGroups,
  whyNotShown,
  BINARY_LIST_MAX,
  EXPANDED_MAX,
  type Subchapter,
  type SubchapterCluster,
  type SubchapterGroup,
} from "@/components/book/subchapters";
import type { Book } from "@/lib/book";
import { fetchRawTextBatch, repoTag } from "@/lib/github";
import { formatBytes } from "@/lib/resources";
import type { Skill } from "@/lib/skills";
import { external } from "@/lib/site";

/**
 * The appendix.
 *
 * A skill's bundled files are 96% renderable text — 1,812 markdown documents
 * and 611 source files across the 170 skills surveyed — and every other skills
 * browser throws them behind a link to GitHub. Here they are subchapters:
 * chapter 4 with three references gives 4.1, 4.2 and 4.3, and the folio is the
 * whole argument. A number says "this is in the book"; a hostname says it is
 * not.
 *
 * Three densities, because the corpus is three different problems:
 *
 *   - **three files** (the median skill ships six) — generous rows, each with
 *     a one-line extract pulled from the document itself;
 *   - **thirty-five** (`supabase-postgres-best-practices`) — the extract goes,
 *     the rows pair into two columns, and 34 references become 17 scannable
 *     lines instead of a page of scrolling;
 *   - **eighty-two** (`canvas-design`, 54 of them TrueType fonts) — the
 *     binaries collapse into one honest sentence, and files that share a
 *     directory cluster under it.
 *
 * The one thing it never does is pretend. A font is not reproduced here and
 * the appendix says so, with its size and its type, rather than offering a
 * link that looks like every other link and then fails to be a page.
 */

export interface AppendixProps {
  book: Book;
  skill: Skill;
  /** Chapter position, 1-based. */
  index: number;
}

export async function Appendix({ book, skill, index }: AppendixProps) {
  const { owner, repo, defaultBranch } = book.repo;
  if (skill.resources.length === 0) return null;

  const groups = subchapterGroups(skill.resources, {
    owner,
    repo,
    slug: skill.slug,
    chapter: index,
  });
  if (groups.length === 0) return null;

  const numbered = groups.flatMap((group) => group.readable);
  const omitted = groups.flatMap((group) => group.binaries);
  const extracts = await loadExtracts(
    owner,
    repo,
    defaultBranch,
    extractCandidates(groups).map((file) => file.path),
  );

  const first = numbered[0]?.number;
  const last = numbered[numbered.length - 1]?.number;
  const range = first && last ? (first === last ? first : `${first}–${last}`) : null;
  const bytes = skill.resources.reduce((sum, r) => sum + r.size, 0);

  const dirUrl = external.file(
    owner,
    repo,
    defaultBranch,
    skill.dir || skill.skillMdPath,
  );

  return (
    <section
      id="chapter-appendix"
      className="book-appendix"
      aria-labelledby="chapter-appendix-title"
    >
      <div className="book-appendix__head">
        <h2 id="chapter-appendix-title" className="book-appendix__label m-0">
          Appendix{range ? <> {range}</> : null}
        </h2>
        <p className="book-appendix__tally">
          {skill.resources.length} {plural(skill.resources.length, "file")} ·{" "}
          {formatBytes(bytes)}
        </p>
      </div>

      <p className="book-appendix__intro">
        {numbered.length > 0 ? (
          <>
            Everything this skill ships beside its prose.{" "}
            {numbered.length === skill.resources.length ? (
              <>All of it is set here, as {plural(numbered.length, "a subchapter", "subchapters")} of chapter {index}.</>
            ) : (
              <>
                {numbered.length}{" "}
                {plural(numbered.length, "of them is", "of them are")} set here
                as {plural(numbered.length, "a subchapter", "subchapters")} of
                chapter {index}; the other {omitted.length}{" "}
                {plural(omitted.length, "is", "are")} described rather than
                reproduced.
              </>
            )}
          </>
        ) : (
          <>
            Everything this skill ships beside its prose. None of it is text, so
            none of it is set here — the descriptions below say what each file
            is.
          </>
        )}
      </p>

      {groups.map((group) => (
        <AppendixGroup
          key={group.kind}
          group={group}
          extracts={extracts}
          dirUrl={dirUrl}
          fileUrl={(file) =>
            external.file(owner, repo, defaultBranch, file.path)
          }
        />
      ))}
    </section>
  );
}

/* ---------------------------------------------------------------- groups */

interface GroupProps {
  group: SubchapterGroup;
  extracts: Record<string, string>;
  dirUrl: string;
  fileUrl: (file: Subchapter) => string;
}

function AppendixGroup({ group, extracts, dirUrl, fileUrl }: GroupProps) {
  const clusters = clusterFiles(group.readable);
  const listBinaries = group.binaries.length <= BINARY_LIST_MAX;

  /*
   * When every readable file in a group is the same kind of file — and in a
   * References group it almost always is — the type belongs in the group's
   * heading, once, not repeated down thirty-four rows. It also buys back the
   * width that lets those rows pair into two columns.
   */
  const labels = new Set(group.readable.map((file) => file.label));
  const uniform = labels.size === 1 ? [...labels][0] : null;

  /*
   * The type may only be hoisted into the heading when it is true of the whole
   * count printed beside it. `canvas-design` is the case that forced this: its
   * "Also bundled" group is 28 text files and 54 TrueType fonts, and hoisting
   * the readable files' shared label produced the heading "Text · 82 files" —
   * an appendix whose entire argument is that it never pretends, claiming 54
   * fonts were text. When binaries are present the label stays on the rows.
   */
  const headingLabel = group.binaries.length === 0 ? uniform : null;

  return (
    <section className="book-appendix__group">
      <h3 className="book-appendix__grouptitle">
        {group.title}
        <span className="book-appendix__count">
          {headingLabel ? `${headingLabel} · ` : ""}
          {group.files.length} {plural(group.files.length, "file")}
        </span>
      </h3>
      <p className="book-appendix__note">{group.note}</p>

      {clusters.map((cluster) => (
        <AppendixCluster
          key={cluster.dir || "."}
          cluster={cluster}
          named={clusters.length > 1}
          extracts={extracts}
          uniform={headingLabel !== null}
        />
      ))}

      {group.binaries.length === 0 ? null : listBinaries ? (
        <ul className="book-appendix__list" data-density="expanded">
          {group.binaries.map((file) => (
            <li key={file.relPath}>
              <OmittedEntry file={file} href={fileUrl(file)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="book-appendix__omitted">
          <span className="book-appendix__folio" aria-hidden="true">
            —
          </span>
          <span>
            {describeBinaries(group.binaries)} ·{" "}
            {formatBytes(group.binaries.reduce((s, f) => s + f.size, 0))}. Bytes
            rather than text, so they are not reproduced here.{" "}
            <a
              className="book-appendix__out"
              href={dirUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Browse them on GitHub
              <ExternalMark />
            </a>
          </span>
        </p>
      )}
    </section>
  );
}

function AppendixCluster({
  cluster,
  named,
  extracts,
  uniform,
}: {
  cluster: SubchapterCluster;
  named: boolean;
  extracts: Record<string, string>;
  /** The group heading already stated the file type; rows print size only. */
  uniform: boolean;
}) {
  if (cluster.files.length === 0) return null;

  const compact = cluster.files.length > EXPANDED_MAX;
  const list = (
    <ol
      className="book-appendix__list"
      data-density={compact ? "compact" : "expanded"}
    >
      {cluster.files.map((file) => (
        <li key={file.relPath}>
          <Entry
            file={file}
            extract={compact ? undefined : extracts[file.path]}
            path={compact || extracts[file.path] ? undefined : file.relPath}
            meta={uniform ? formatBytes(file.size) : file.meta}
          />
        </li>
      ))}
    </ol>
  );

  if (!named || !cluster.dir) return list;

  const summary = (
    <>
      <code className="book-appendix__dirpath">{cluster.dir}/</code>
      <span className="book-appendix__dircount">
        {cluster.files.length} {plural(cluster.files.length, "file")} ·{" "}
        {formatBytes(cluster.bytes)}
      </span>
    </>
  );

  /*
   * A directory of forty-four XML schemas is a fact about the skill, not forty-
   * four things to read. It gets one line that states what it is and opens on
   * demand; the fifteen scripts next to it stay in the open, which is the whole
   * point of clustering them apart.
   */
  return cluster.collapsed ? (
    <details className="book-appendix__cluster">
      <summary className="book-appendix__dir">{summary}</summary>
      {list}
    </details>
  ) : (
    <div className="book-appendix__cluster">
      <p className="book-appendix__dir" data-static="">
        {summary}
      </p>
      {list}
    </div>
  );
}

/* --------------------------------------------------------------- entries */

function Entry({
  file,
  extract,
  path,
  meta,
}: {
  file: Subchapter;
  extract?: string;
  path?: string;
  meta: string;
}) {
  if (!file.href) return null;
  return (
    <Link className="book-appendix__entry" href={file.href}>
      <Folio number={file.number} />
      <span className="book-appendix__body">
        <span className="book-appendix__title">{file.title}</span>
        {/* An extract if the document offered one; otherwise its path, which
            is what tells `scripts/convert.py` from `scripts/office/convert.py`
            after `resourceTitle` has thrown the directory away. A script never
            has a first sentence, so in practice these never compete. */}
        {extract ? (
          <span className="book-appendix__extract">{extract}</span>
        ) : path ? (
          <span className="book-appendix__path">{path}</span>
        ) : null}
      </span>
      <span className="book-appendix__meta">{meta}</span>
    </Link>
  );
}

function OmittedEntry({ file, href }: { file: Subchapter; href: string }) {
  return (
    <a
      className="book-appendix__entry"
      data-omitted=""
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="book-appendix__folio" aria-hidden="true">
        —
      </span>
      <span className="book-appendix__body">
        <span className="book-appendix__title">{file.title}</span>
        <span className="book-appendix__extract">{whyNotShown(file)}</span>
      </span>
      <span className="book-appendix__meta">
        GitHub
        <ExternalMark />
      </span>
    </a>
  );
}

/**
 * `4.7`, with the chapter half held back.
 *
 * The subchapter is what distinguishes one row from the next — twelve rows all
 * beginning "4." in full accent read as a coloured stripe rather than as
 * numbers, so the chapter is set quiet and only the leaf carries the ink.
 */
function Folio({ number }: { number: string | null }) {
  if (!number) {
    return (
      <span className="book-appendix__folio" aria-hidden="true">
        —
      </span>
    );
  }
  const dot = number.indexOf(".");
  return (
    <span className="book-appendix__folio">
      <span className="book-appendix__folio-chapter">
        {number.slice(0, dot + 1)}
      </span>
      {number.slice(dot + 1)}
    </span>
  );
}

function ExternalMark() {
  return (
    <>
      <HugeiconsIcon
        icon={ArrowUpRight01Icon}
        className="ml-0.5 inline size-3 shrink-0 align-[-0.1em] opacity-70"
        aria-hidden
      />
      <span className="sr-only"> (opens in a new tab)</span>
    </>
  );
}

/* -------------------------------------------------------------- extracts */

/**
 * One line of each markdown resource, fetched from raw.githubusercontent.
 *
 * Bounded by `extractCandidates` at forty files and 640 KB, which covers every
 * skill in the corpus that has markdown resources at all — the largest,
 * `supabase-postgres-best-practices`, is 35 files and 58 KB. Behind
 * `"use cache"` for the usual two reasons: the raw reads are the expensive part
 * of this page, and anything unstable in the fetch path would otherwise fail
 * the prerender outright.
 */
async function loadExtracts(
  owner: string,
  repo: string,
  ref: string,
  paths: string[],
): Promise<Record<string, string>> {
  "use cache";
  cacheLife("repo");
  cacheTag(repoTag(owner, repo), "book");

  if (paths.length === 0) return {};

  const sources = await fetchRawTextBatch(owner, repo, ref, paths);
  const out: Record<string, string> = {};
  paths.forEach((path, i) => {
    const source = sources[i];
    if (!source) return;
    const line = firstSentence(source);
    if (line) out[path] = line;
  });
  return out;
}
