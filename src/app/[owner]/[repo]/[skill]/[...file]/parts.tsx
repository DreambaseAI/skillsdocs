import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  BinaryCodeIcon,
  File01Icon,
  Scissor01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";

import { folio } from "@/components/book/format";
import type { LoadedResource, ResourceNeighbour } from "@/lib/resource-loader";
import { PREVIEW_LINES } from "@/lib/resources";
import { external } from "@/lib/site";

/**
 * The furniture of a subchapter.
 *
 * A bundled file is not a "file view" — it is a page of the book, and it has
 * to carry the same apparatus a chapter does: an opener that says where you
 * are, a provenance line that says what you are looking at, and prev/next
 * within the same skill. The only thing it says differently is *whose* chapter
 * it belongs to, because that is the one fact a reader who arrived here from a
 * search result does not have.
 *
 * The right rail is **not** here: it is `SubchapterRail` in
 * `components/book/chapter-rail.tsx`, beside the chapter rail it has to look
 * like. This file briefly carried a second, thinner copy of it, and the two
 * disagreed — the copy had no parent-chapter link and no jump list.
 */

/* ---------------------------------------------------------------- opener */

export interface SubchapterOpenerProps {
  loaded: LoadedResource;
  /** "4.2" — the folio the appendix and the rail print for this file. */
  number: string | null;
}

export function SubchapterOpener({ loaded, number }: SubchapterOpenerProps) {
  const { skill } = loaded;

  return (
    <header className="book-opener book-measure">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        {/*
          The eyebrow is a link, not a label. This page is reachable from a
          search result and from an external link, so the parent chapter is
          frequently the thing the reader most needs and has no other route to.
        */}
        <p className="book-eyebrow book-eyebrow--accent m-0 min-w-0">
          <Link
            href={skill.href}
            className="hover:text-issue-accent inline-flex max-w-full items-baseline gap-1.5 no-underline"
          >
            <span aria-hidden="true">↖</span>
            <span className="truncate">
              Chapter {folio(skill.index)} · {skill.title}
            </span>
          </Link>
        </p>

        <p className="book-opener__folio m-0">
          <span aria-hidden="true">{number ?? "—"}</span>
          <span className="sr-only">
            {number
              ? `Subchapter ${number}`
              : "Bundled file, not set in the book"}
          </span>
        </p>
      </div>

      <h1 id="subchapter-title" className="book-opener__title mt-3">
        {loaded.title}
      </h1>

      {/*
        A source file states its own provenance. `CodeBlock` puts the path,
        the language, the line count and the size in the frame's header, four
        centimetres below this line — printing them twice made the opener read
        like a rendering fault. Prose has no such header, and a preview's frame
        counts the excerpt rather than the file, so both keep the caption.
      */}
      {loaded.body.view === "code" ? null : <Provenance loaded={loaded} />}

      <hr className="book-rule book-rule--strong mt-6" />
    </header>
  );
}

/**
 * Path, type, size, and the way upstream — one line, in that order.
 *
 * The path comes first and is set in the mono face because it is the only
 * identifier that is unambiguous: two skills in one repository can both ship a
 * `README.md`, and the title alone would not tell them apart.
 */
function Provenance({ loaded }: { loaded: LoadedResource }) {
  const { resource } = loaded;

  return (
    <p className="book-caption mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="text-ink-strong font-mono break-all">
        {resource.relPath}
      </span>
      <Sep />
      <span>{resource.label}</span>
      <Sep />
      <span>{loaded.size}</span>
      <Sep />
      <a
        href={loaded.blobUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-issue-accent inline-flex items-baseline gap-1 underline-offset-4 hover:underline"
      >
        View on GitHub
        <HugeiconsIcon
          icon={ArrowUpRight01Icon}
          className="size-3 self-center"
          aria-hidden
        />
      </a>
    </p>
  );
}

function Sep() {
  return (
    <span className="text-ink-muted/50" aria-hidden="true">
      ·
    </span>
  );
}

/* ---------------------------------------------------------------- notices */

/**
 * A framed statement about the file, for the three cases where the content is
 * not the whole story. Never an error banner: none of these is the
 * repository's fault or the reader's, and a red box on someone else's file
 * would be a scold.
 */
function Notice({
  icon,
  title,
  children,
}: {
  icon: typeof File01Icon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <aside className="border-rule bg-paper-raised mt-8 flex gap-4 rounded-xl border p-5">
      <HugeiconsIcon
        icon={icon}
        className="text-ink-muted mt-0.5 size-5 shrink-0"
        strokeWidth={1.5}
        aria-hidden
      />
      <div className="min-w-0">
        <p className="book-eyebrow">{title}</p>
        <div className="text-ink-muted mt-2 flex flex-col gap-3 text-[0.9375rem]">
          {children}
        </div>
      </div>
    </aside>
  );
}

/** Bytes. Described, linked, never decoded. */
export function BinaryNotice({ loaded }: { loaded: LoadedResource }) {
  const { resource } = loaded;
  const raw = external.raw(
    loaded.owner,
    loaded.repo,
    loaded.ref,
    resource.path,
  );

  return (
    <Notice icon={BinaryCodeIcon} title="Not reproduced here">
      <p>
        <strong className="text-ink-strong">{resource.relPath}</strong> is a{" "}
        {loaded.size} {resource.label.toLowerCase()}. It is bundled with this
        skill, but it is bytes rather than text — there is nothing for a
        reading surface to set, and pretending otherwise would give you a page
        of replacement characters.
      </p>
      <SourceLinks blobUrl={loaded.blobUrl} rawUrl={raw} />
    </Notice>
  );
}

/** Text we could read but decline to set whole. */
export function PreviewNotice({
  loaded,
  lines,
}: {
  loaded: LoadedResource;
  lines: number;
}) {
  const raw = external.raw(
    loaded.owner,
    loaded.repo,
    loaded.ref,
    loaded.resource.path,
  );

  return (
    <Notice icon={Scissor01Icon} title={`First ${lines} lines`}>
      <p>
        This file is {loaded.size} — past the point where setting it whole
        costs more than the rest of the page and stops being something anybody
        reads in a book. The opening {PREVIEW_LINES} lines are above; the rest
        is upstream, unaltered.
      </p>
      <SourceLinks blobUrl={loaded.blobUrl} rawUrl={raw} />
    </Notice>
  );
}

/** We should have been able to read it, and could not. */
export function UnavailableNotice({ loaded }: { loaded: LoadedResource }) {
  return (
    <Notice icon={File01Icon} title="Could not be read">
      <p>
        The repository&rsquo;s tree lists{" "}
        <strong className="text-ink-strong">{loaded.resource.relPath}</strong>,
        but fetching it from{" "}
        <span className="font-mono">raw.githubusercontent.com</span> failed.
        That is usually a transient upstream error rather than a missing file —
        the copy on GitHub is authoritative either way.
      </p>
      <SourceLinks
        blobUrl={loaded.blobUrl}
        rawUrl={external.raw(
          loaded.owner,
          loaded.repo,
          loaded.ref,
          loaded.resource.path,
        )}
      />
    </Notice>
  );
}

function SourceLinks({ blobUrl, rawUrl }: { blobUrl: string; rawUrl: string }) {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1">
      <a
        href={blobUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-ink-strong hover:text-issue-accent inline-flex items-baseline gap-1 underline underline-offset-4"
      >
        View on GitHub
        <HugeiconsIcon
          icon={ArrowUpRight01Icon}
          className="size-3 self-center"
          aria-hidden
        />
      </a>
      <a
        href={rawUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-ink-strong hover:text-issue-accent inline-flex items-baseline gap-1 underline underline-offset-4"
      >
        Download the raw file
        <HugeiconsIcon
          icon={ArrowUpRight01Icon}
          className="size-3 self-center"
          aria-hidden
        />
      </a>
    </p>
  );
}

/* ------------------------------------------------------------------- nav */

/**
 * Prev / next *within the same skill*.
 *
 * The sequence is `resourceOrder`, which is the flattened appendix — so paging
 * from here walks the list the reader was just looking at, in the order they
 * saw it. At either end it hands back to the chapter rather than dead-ending,
 * because the chapter is what an appendix is an appendix to.
 */
export function SubchapterNav({ loaded }: { loaded: LoadedResource }) {
  const { prev, next, skill } = loaded;

  return (
    <nav
      aria-label="Bundled file navigation"
      className="book-measure mt-14"
      data-print="hide"
    >
      <div className="book-chapternav">
        {prev ? (
          <NeighbourLink neighbour={prev} direction="prev" />
        ) : (
          <span className="book-chapternav__link">
            <span className="book-eyebrow">First file of the chapter</span>
            <Link
              href={skill.href}
              className="book-chapternav__title hover:text-issue-accent underline-offset-4 hover:underline"
            >
              Back to {skill.title}
            </Link>
          </span>
        )}

        {next ? (
          <NeighbourLink neighbour={next} direction="next" />
        ) : (
          <span className="book-chapternav__link book-chapternav__link--next">
            <span className="book-eyebrow">Last file of the chapter</span>
            <Link
              href={skill.href}
              className="book-chapternav__title hover:text-issue-accent underline-offset-4 hover:underline"
            >
              Back to {skill.title}
            </Link>
          </span>
        )}
      </div>
    </nav>
  );
}

function NeighbourLink({
  neighbour,
  direction,
}: {
  neighbour: ResourceNeighbour;
  direction: "prev" | "next";
}) {
  const isNext = direction === "next";
  return (
    <Link
      href={neighbour.href}
      rel={direction}
      className={
        isNext
          ? "book-chapternav__link book-chapternav__link--next"
          : "book-chapternav__link"
      }
    >
      <span className="book-eyebrow flex items-center gap-1.5">
        {isNext ? null : (
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" aria-hidden />
        )}
        {neighbour.group}
        {isNext ? (
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className="size-3.5"
            aria-hidden
          />
        ) : null}
      </span>
      <span className="book-chapternav__title">{neighbour.title}</span>
    </Link>
  );
}
