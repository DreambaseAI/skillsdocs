/**
 * `GET /api/v1/books/{owner}/{repo}/skills/{skill}` — one chapter, with body.
 *
 * `content.raw` is the verbatim upstream file, frontmatter included, so a
 * caller can verify `digest` against it locally:
 *
 *   curl -s .../skills/skill-creator | jq -r .content.raw | shasum -a 256
 *
 * A chapter with no detectable licence returns metadata with `content: null`
 * and a `licenseNotice`, never a body.
 */

import { createHash } from "node:crypto";
import { chapterNav, findSkill, getBook } from "@/lib/book";
import { fetchRawText, rawUrl } from "@/lib/github";
import { serveJson } from "@/lib/http";
import { chapterLicence, TAKEDOWN_CONTACT } from "@/lib/serialize";
import { resolveUpstreamFailure } from "@/lib/upstream";
import {
  absoluteUrl,
  external,
  installCommand,
  isValidOwner,
  isValidRepo,
  paths,
} from "@/lib/site";

const JSON_HEADERS: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "x-robots-tag": "all",
};

function fail(status: number, code: string, message: string, hint?: string) {
  return Response.json(
    { error: { code, message, ...(hint ? { hint } : {}) } },
    { status, headers: JSON_HEADERS },
  );
}

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/v1/books/[owner]/[repo]/skills/[skill]">,
): Promise<Response> {
  const { owner, repo, skill: slug } = await ctx.params;
  if (!isValidOwner(owner) || !isValidRepo(repo)) {
    return fail(
      400,
      "bad_request",
      `Not a valid GitHub repository reference: ${owner}/${repo}.`,
    );
  }

  try {
    const book = await getBook(owner, repo);
    const skill = findSkill(book, slug);
    if (!skill) {
      return fail(
        404,
        "not_found",
        `No skill "${slug}" in ${book.repo.fullName}.`,
        `Chapters: ${book.skills.map((s) => s.slug).join(", ") || "none"}.`,
      );
    }

    const { owner: o, repo: r, defaultBranch: ref } = book.repo;
    const licence = chapterLicence(book, skill);
    const nav = chapterNav(book, slug);
    const chapterUrl = absoluteUrl(paths.chapter(o, r, skill.slug));
    const source = licence.redistributable
      ? await fetchRawText(o, r, ref, skill.skillMdPath)
      : null;
    const bytes = source != null ? Buffer.byteLength(source, "utf8") : null;

    const payload = {
      schemaVersion: "1.0",
      book: {
        id: `${o}/${r}`,
        title: `${o}/${r}`,
        url: absoluteUrl(paths.book(o, r)),
        json: absoluteUrl(paths.bookJson(o, r)),
        markdown: absoluteUrl(paths.bookMarkdown(o, r)),
      },
      position: nav.index + 1,
      chapterCount: book.skills.length,
      name: skill.name,
      slug: skill.slug,
      title: skill.title,
      description: skill.description,
      group: skill.group || null,
      path: skill.skillMdPath,
      links: {
        canonical: chapterUrl,
        markdown: `${chapterUrl}.md`,
        source: external.file(o, r, ref, skill.skillMdPath),
        raw: rawUrl(o, r, ref, skill.skillMdPath),
        openGraphImage: `${chapterUrl}/opengraph-image`,
        prev: nav.prev ? absoluteUrl(paths.chapter(o, r, nav.prev.slug)) : null,
        next: nav.next ? absoluteUrl(paths.chapter(o, r, nav.next.slug)) : null,
      },
      frontmatter: skill.frontmatter,
      allowedTools: skill.allowedTools,
      compatibility: skill.compatibility,
      wordCount: skill.wordCount,
      readingMinutes: skill.readingMinutes,
      outline: skill.headings.map((h) => ({
        level: h.depth,
        text: h.text,
        id: h.id,
      })),
      resources: skill.resources.map((x) => ({
        path: x.relPath,
        kind: x.kind,
        bytes: x.size,
        url: external.file(o, r, ref, x.path),
        raw: rawUrl(o, r, ref, x.path),
      })),
      variants: skill.variants,
      issues: skill.issues,
      license: {
        spdx: licence.spdx,
        name: licence.name,
        url: licence.url,
        scope: licence.scope,
        redistributable: licence.redistributable,
      },
      licenseNotice: licence.redistributable
        ? null
        : `No licence could be detected for this skill at either the repository or the skill level, so its body is not served here. Read it upstream at ${rawUrl(o, r, ref, skill.skillMdPath)}.`,
      content:
        source != null
          ? {
              format: "markdown",
              raw: source,
              bytes,
              estimatedTokens: bytes != null ? Math.ceil(bytes / 4) : null,
              digest: `sha256:${createHash("sha256").update(source, "utf8").digest("hex")}`,
            }
          : null,
      install: { all: installCommand(o, r) },
      attribution: {
        notice:
          "Served verbatim from a public GitHub repository and owned by its authors.",
        upstream: external.file(o, r, ref, skill.skillMdPath),
        takedown: TAKEDOWN_CONTACT,
      },
      // No `generatedAt`: it made the payload byte-unstable, so no `ETag`
      // could ever match. Nothing about this chapter changes per request.
    };

    return serveJson(request, payload, {
      ...JSON_HEADERS,
      link: [
        `<${chapterUrl}>; rel="canonical"`,
        `<${chapterUrl}.md>; rel="alternate"; type="text/markdown"`,
        `<${rawUrl(o, r, ref, skill.skillMdPath)}>; rel="describedby"; type="text/markdown"`,
        `<${absoluteUrl(paths.bookJson(o, r))}>; rel="up"`,
      ].join(", "),
    });
  } catch (error) {
    const failure = await resolveUpstreamFailure(error, owner, repo);
    return fail(
      failure.status,
      failure.code,
      failure.code === "not_found"
        ? `No repository at github.com/${owner}/${repo}.`
        : failure.message,
    );
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}
