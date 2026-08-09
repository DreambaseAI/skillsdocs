import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { cacheKeyFor, findSkill, getBook, type Book } from "@/lib/book";
import { fetchRawText, rawUrl, repoTag } from "@/lib/github";
import { renderMarkdown, type RenderedMarkdown } from "@/lib/markdown";
import type { Skill } from "@/lib/skills";
import {
  findResource,
  formatBytes,
  previewHead,
  resourceDir,
  resourceNav,
  resourcePath,
  resourceTitle,
  type ClassifiedResource,
} from "@/lib/resources";
import { external, paths } from "@/lib/site";

/**
 * One bundled file of one skill, loaded and prepared for the subchapter route.
 *
 * ## The whitelist is the security boundary
 *
 * The route is a catch-all: `/[owner]/[repo]/[skill]/[...file]`. Whatever the
 * caller types lands in `segments`, so the one rule this module exists to
 * enforce is that **no path the caller supplies is ever fetched.** A request
 * is resolved by looking the joined path up in `skill.resources`, which is
 * built from the repository's own recursive git tree. A path that is not in
 * that list has no URL built for it, no cache entry minted for it, and no
 * request made on its behalf — it is simply absent, and the route 404s.
 *
 * `safeRelPath` refuses `..`, absolute paths, backslashes and control
 * characters before the lookup as well. That is belt-and-braces on purpose:
 * the whitelist already makes traversal structurally impossible, but rejecting
 * early keeps a hostile path out of the cache key space and gives the rule a
 * unit test that needs no network.
 *
 * ## Why it is cached the way it is
 *
 * Same reason as `render.ts`: under Cache Components a prerender fails if
 * anything in the tree reads an unstable value, and the unified/Shiki pipeline
 * does. Everything expensive therefore happens behind `"use cache"`, keyed on
 * the case-folded `owner/repo` so `/MattPocock/Skills` and `/mattpocock/skills`
 * share one entry and one revalidation tag.
 */

/**
 * How much of an oversized file we pull for its preview.
 *
 * `fetchRawText` refuses anything over 512 KB outright, which is correct for
 * a document we intend to render whole and useless for a 2 MB generated index
 * whose first forty lines are the only part anybody reads. A ranged request
 * gets those lines for 64 KB of transfer, from a CDN that does not touch the
 * API quota.
 */
const PREVIEW_BYTES = 64 * 1024;

/**
 * What the page should draw.
 *
 * Prose arrives rendered because the markdown pipeline is a server-side
 * transform with no useful intermediate form. Source arrives as **text**,
 * deliberately: `components/ai-elements/code-block.tsx` does its own
 * highlighting off the same Shiki singleton, and it needs the bytes to build a
 * line gutter, `#L42` anchors and a copy button that puts the original on the
 * clipboard. Handing it pre-rendered HAST would throw all four away — which is
 * exactly what the first cut of this route did.
 */
export type ResourceBody =
  /** Markdown, through the same pipeline as a chapter. */
  | { view: "prose"; rendered: RenderedMarkdown }
  /** Source, as fetched. Highlighted by `CodeBlock` on the page. */
  | { view: "code"; source: string; lines: number }
  /** Text too large to render whole: the head of it, and a way upstream. */
  | { view: "preview"; source: string; lines: number }
  /** Bytes. Described and linked, never decoded. */
  | { view: "binary" }
  /** Text we should have been able to read and could not. */
  | { view: "unavailable" };

export interface ResourceNeighbour {
  relPath: string;
  title: string;
  href: string;
  /** "Reference", "Script", … — the group the file sits in. */
  group: string;
}

export interface LoadedResource {
  owner: string;
  repo: string;
  ref: string;
  /** Chapter this subchapter belongs to. */
  skill: {
    slug: string;
    title: string;
    /** 1-based chapter position, and the book's chapter count. */
    index: number;
    total: number;
    href: string;
  };
  resource: ClassifiedResource;
  title: string;
  href: string;
  /** Human size, already formatted — the page never does arithmetic. */
  size: string;
  blobUrl: string;
  body: ResourceBody;
  /** 1-based position among this skill's bundled files. */
  position: number;
  total: number;
  prev: ResourceNeighbour | null;
  next: ResourceNeighbour | null;
}

/**
 * Load one bundled file, or `null` when this skill does not ship it.
 *
 * `null` rather than `notFound()`: this runs inside a cache scope, and a
 * thrown navigation signal does not survive one intact. The route raises the
 * 404 on the other side of the boundary.
 */
export async function getResource(
  ownerParam: string,
  repoParam: string,
  slug: string,
  relPath: string,
): Promise<LoadedResource | null> {
  const [owner, repo] = cacheKeyFor(ownerParam, repoParam);
  return getResourceCached(owner, repo, slug, relPath);
}

async function getResourceCached(
  owner: string,
  repo: string,
  slug: string,
  relPath: string,
): Promise<LoadedResource | null> {
  "use cache";
  cacheLife("repo");
  cacheTag(repoTag(owner, repo), `skill:${owner}/${repo}/${slug}`);

  const book = await getBook(owner, repo);
  const skill = findSkill(book, slug);
  if (!skill) return null;

  const resource = findResource(skill.resources, relPath);
  if (!resource) return null;

  const { owner: realOwner, repo: realRepo, defaultBranch: ref } = book.repo;
  const nav = resourceNav(skill.resources, relPath);
  const chapterIndex = book.skills.findIndex((s) => s.slug === slug);

  return {
    owner: realOwner,
    repo: realRepo,
    ref,
    skill: {
      slug,
      title: skill.title,
      index: chapterIndex + 1,
      total: book.skills.length,
      href: paths.chapter(realOwner, realRepo, slug),
    },
    resource,
    title: resourceTitle(relPath),
    href: resourcePath(realOwner, realRepo, slug, relPath),
    size: formatBytes(resource.size),
    blobUrl: external.file(realOwner, realRepo, ref, resource.path),
    body: await loadBody(
      realOwner,
      realRepo,
      ref,
      resource,
      internalResolver(book, skill),
    ),
    position: nav.position,
    total: nav.total,
    prev: neighbour(realOwner, realRepo, slug, nav.prev),
    next: neighbour(realOwner, realRepo, slug, nav.next),
  };
}

function neighbour(
  owner: string,
  repo: string,
  slug: string,
  resource: ClassifiedResource | null,
): ResourceNeighbour | null {
  if (!resource) return null;
  return {
    relPath: resource.relPath,
    title: resourceTitle(resource.relPath),
    href: resourcePath(owner, repo, slug, resource.relPath),
    group: GROUP_NOUN[resource.kind],
  };
}

const GROUP_NOUN: Record<ClassifiedResource["kind"], string> = {
  reference: "Reference",
  script: "Script",
  asset: "Asset",
  other: "Bundled file",
};

/* ------------------------------------------------------------------ body */

/**
 * Where an in-repo link inside a bundled file should point.
 *
 * A reference that links to `./OTHER.md` is the commonest shape in the corpus,
 * and until now every one of them left the site. Sibling resources of the same
 * skill resolve to their own subchapter; another skill's directory or
 * `SKILL.md` resolves to that chapter. Everything else falls through to
 * `rehypeResolveLinks`, which sends it to GitHub.
 */
function internalResolver(book: Book, skill: Skill) {
  const { owner, repo } = book.repo;
  return (repoPath: string): string | null => {
    const chapter = book.skills.find(
      (s) => s.skillMdPath === repoPath || s.dir === repoPath,
    );
    if (chapter) return paths.chapter(owner, repo, chapter.slug);

    const sibling = skill.resources.find((r) => r.path === repoPath);
    return sibling
      ? resourcePath(owner, repo, skill.slug, sibling.relPath)
      : null;
  };
}

async function loadBody(
  owner: string,
  repo: string,
  ref: string,
  resource: ClassifiedResource,
  resolveInternal: (repoPath: string) => string | null,
): Promise<ResourceBody> {
  // Bytes. Never decoded, never fetched — a 4 MB TrueType font read as text
  // is 4 MB of replacement characters and a wasted round trip.
  if (resource.render === "binary" && !resource.oversized) {
    return { view: "binary" };
  }

  if (resource.oversized) {
    const head = await fetchRawHead(owner, repo, ref, resource.path);
    if (head === null) return { view: "unavailable" };

    // `>=` because a range served exactly to the budget is indistinguishable
    // from one that was cut at it.
    const { source, lines } = previewHead(head, head.length >= PREVIEW_BYTES);

    return { view: "preview", source, lines };
  }

  const source = await fetchRawText(owner, repo, ref, resource.path);
  if (source === null) return { view: "unavailable" };

  if (resource.render === "prose") {
    return {
      view: "prose",
      rendered: await renderMarkdown(source, {
        owner,
        repo,
        ref,
        // The file's own directory, not the skill's: a reference in
        // `references/` that links to `./OTHER.md` or `../assets/logo.png`
        // has to resolve the way it does on disk.
        baseDir: resourceDir(resource.path),
        title: resourceTitle(resource.relPath),
        resolveInternal,
      }),
    };
  }

  /*
   * Not wrapped in a fence and pushed through `renderMarkdown`.
   *
   * That was the first shape of this function and it was wrong twice. It cost
   * a whole markdown parse of somebody else's Python to produce one node, and
   * it landed the file in the *quotation* renderer — the lean block a fence in
   * a chapter gets, with no filename, no ordinals, no `#L42`, no wrap toggle
   * and no clip. A whole file is a document, not a quotation. `CodeBlock`
   * highlights it off the same Shiki singleton the prose pipeline uses, so
   * there is still exactly one highlighter and one theme pair.
   */
  return { view: "code", source, lines: source.split("\n").length };
}

/**
 * The first `PREVIEW_BYTES` of a file, by HTTP range.
 *
 * Not in `github.ts` because it is not a general-purpose read: it returns a
 * deliberately truncated string, which every other caller in the codebase
 * would be wrong to accept. Uncached in itself — it only ever runs inside
 * `getResourceCached`, whose entry is what the CDN and the reader see.
 */
async function fetchRawHead(
  owner: string,
  repo: string,
  ref: string,
  path: string,
): Promise<string | null> {
  try {
    const res = await fetch(rawUrl(owner, repo, ref, path), {
      headers: {
        "User-Agent": "github-skills-book",
        Range: `bytes=0-${PREVIEW_BYTES - 1}`,
      },
    });
    // 206 for a served range, 200 when the origin ignores the header and the
    // file is small enough to arrive whole. Both are usable.
    if (!res.ok) return null;
    const text = await res.text();
    return text.slice(0, PREVIEW_BYTES);
  } catch {
    return null;
  }
}

/**
 * Everything the metadata needs, without loading a byte of the file.
 *
 * `generateMetadata` and the page body both run, and both need the title and
 * the classification; only the page body needs the contents. Splitting them
 * keeps a `<head>` from paying for a Shiki pass.
 */
export async function getResourceMeta(
  ownerParam: string,
  repoParam: string,
  slug: string,
  relPath: string,
): Promise<{
  title: string;
  skillTitle: string;
  resource: ClassifiedResource;
} | null> {
  const [owner, repo] = cacheKeyFor(ownerParam, repoParam);
  return getResourceMetaCached(owner, repo, slug, relPath);
}

async function getResourceMetaCached(
  owner: string,
  repo: string,
  slug: string,
  relPath: string,
): Promise<{
  title: string;
  skillTitle: string;
  resource: ClassifiedResource;
} | null> {
  "use cache";
  cacheLife("repo");
  cacheTag(repoTag(owner, repo));

  const book = await getBook(owner, repo);
  const skill = findSkill(book, slug);
  if (!skill) return null;

  const resource = findResource(skill.resources, relPath);
  if (!resource) return null;

  return { title: resourceTitle(relPath), skillTitle: skill.title, resource };
}
