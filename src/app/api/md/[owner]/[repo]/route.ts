/**
 * `GET /{owner}/{repo}.md` — the whole book as one markdown document.
 *
 * Reached through the `proxy.ts` rewrite, never linked directly. This document
 * *is* the book's `llms-full.txt`: repository README plus every licensed
 * chapter, bodies verbatim, in reading order.
 *
 * No `export const revalidate` — Cache Components owns freshness. `getBook` is
 * a `use cache` function on the `repo` profile, so the expensive half is shared
 * with the HTML route; the `Cache-Control` below is for the CDN in front of us.
 */

import { getBook } from "@/lib/book";
import { fetchRawTextBatch } from "@/lib/github";
import { DISCOVERY_LINK, bookToMarkdown, classifyUpstreamError } from "@/lib/serialize";
import { absoluteUrl, isValidOwner, isValidRepo, paths } from "@/lib/site";

const MARKDOWN_HEADERS: Record<string, string> = {
  "content-type": "text/markdown; charset=utf-8",
  "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
  "x-robots-tag": "all",
  "access-control-allow-origin": "*",
};

function textError(message: string, status: number): Response {
  return new Response(`${message}\n`, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=60",
    },
  });
}

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/md/[owner]/[repo]">,
): Promise<Response> {
  const { owner, repo } = await ctx.params;
  if (!isValidOwner(owner) || !isValidRepo(repo)) {
    return textError(`Not a valid GitHub repository reference: ${owner}/${repo}`, 400);
  }

  let body: string;
  let meta: { owner: string; repo: string };
  try {
    const book = await getBook(owner, repo);
    meta = { owner: book.repo.owner, repo: book.repo.repo };

    // Verbatim upstream bytes so frontmatter survives byte-for-byte. Every one
    // of these is already a warm `use cache` entry from `getBook`.
    const bodies = await fetchRawTextBatch(
      book.repo.owner,
      book.repo.repo,
      book.repo.defaultBranch,
      book.skills.map((s) => s.skillMdPath),
    );
    const raw = new Map<string, string>();
    book.skills.forEach((skill, i) => {
      const source = bodies[i];
      if (source != null) raw.set(skill.slug, source);
    });

    body = bookToMarkdown(book, { raw });
  } catch (error) {
    const failure = classifyUpstreamError(error);
    return textError(
      failure.code === "not_found"
        ? `No repository at github.com/${owner}/${repo}.`
        : failure.message,
      failure.status,
    );
  }

  return new Response(body, {
    headers: {
      ...MARKDOWN_HEADERS,
      link: [
        `<${absoluteUrl(paths.book(meta.owner, meta.repo))}>; rel="canonical"`,
        `<${absoluteUrl(paths.bookManifest(meta.owner, meta.repo))}>; rel="agent-skills"`,
        `<${absoluteUrl(paths.bookJson(meta.owner, meta.repo))}>; rel="alternate"; type="application/json"`,
        ...DISCOVERY_LINK,
      ].join(", "),
      // Lets an agent budget context before it downloads the body. ~4 chars
      // per token is the usual rule of thumb; this is an estimate, not a count.
      "x-content-tokens": String(Math.ceil(body.length / 4)),
    },
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      allow: "GET, HEAD, OPTIONS",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, HEAD, OPTIONS",
    },
  });
}
