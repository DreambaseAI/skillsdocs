/**
 * `GET /{owner}/{repo}/{skill}.md` — one chapter.
 *
 * Reached through the `proxy.ts` rewrite. The response is a provenance
 * blockquote followed by the upstream `SKILL.md` verbatim, frontmatter
 * included. An agent that needs byte-exact input with no header at all follows
 * the `X-Skill-Raw` header straight to raw.githubusercontent.
 *
 * Three headers exist so an agent never has to parse English to know what it
 * got: `x-skill-body` says whether a body was served at all, and
 * `x-skill-license-scope` distinguishes "MIT at the repo root" from "a
 * LICENSE.txt inside this skill" from "nothing, so no body". Before them, the
 * only way to tell a served chapter from a withheld one was to look for the
 * sentence "so its body is not reproduced here" in the prose.
 */

import { findSkill, getBook, type Book } from "@/lib/book";
import { fetchRawText, rawUrl } from "@/lib/github";
import { serveBody } from "@/lib/http";
import {
  DISCOVERY_LINK,
  chapterLicence,
  skillToMarkdown,
} from "@/lib/serialize";
import type { Skill } from "@/lib/skills";
import { absoluteUrl, isValidOwner, isValidRepo, paths } from "@/lib/site";
import { resolveUpstreamFailure } from "@/lib/upstream";

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

/**
 * A slug may itself end in `.md` — the proxy strips the suffix before it gets
 * here, so a skill directory literally named `foo.md` was unreachable. Same
 * resolution order as the book route: stripped first, literal second.
 */
function resolveSkill(book: Book, slug: string): Skill | undefined {
  return findSkill(book, slug) ?? findSkill(book, `${slug}.md`);
}

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/md/[owner]/[repo]/[skill]">,
): Promise<Response> {
  const { owner, repo, skill: slug } = await ctx.params;
  if (!isValidOwner(owner) || !isValidRepo(repo)) {
    return textError(`Not a valid GitHub repository reference: ${owner}/${repo}`, 400);
  }

  try {
    const book = await getBook(owner, repo);
    const skill = resolveSkill(book, slug);
    if (!skill) {
      const known = book.skills.map((s) => s.slug).join(", ") || "none";
      return textError(
        `No skill "${slug}" in ${book.repo.fullName}. Chapters: ${known}`,
        404,
      );
    }

    const { owner: o, repo: r, defaultBranch: ref } = book.repo;
    const source = await fetchRawText(o, r, ref, skill.skillMdPath);
    const raw = new Map<string, string>();
    if (source != null) raw.set(skill.slug, source);

    const chapterUrl = absoluteUrl(paths.chapter(o, r, skill.slug));
    const licence = chapterLicence(book, skill);
    const body = skillToMarkdown(book, skill, { raw });

    return serveBody(request, body, {
      ...MARKDOWN_HEADERS,
      link: [
        `<${chapterUrl}>; rel="canonical"`,
        `<${absoluteUrl(paths.bookMarkdown(o, r))}>; rel="llms-full-txt"`,
        `<${absoluteUrl(paths.bookManifest(o, r))}>; rel="agent-skills"`,
        `<${absoluteUrl(paths.chapterJson(o, r, skill.slug))}>; rel="alternate"; type="application/json"`,
        `<${rawUrl(o, r, ref, skill.skillMdPath)}>; rel="describedby"; type="text/markdown"`,
        ...DISCOVERY_LINK,
      ].join(", "),
      "x-skill-raw": rawUrl(o, r, ref, skill.skillMdPath),
      // SPDX id only. The free-text fallback is third-party controlled and
      // may hold non-ASCII, which throws when set as a header value.
      "x-skill-license": licence.spdx ?? "unidentified",
      "x-skill-license-scope": licence.scope,
      "x-skill-body": licence.redistributable ? "inlined" : "omitted",
      "x-content-tokens": String(Math.ceil(body.length / 4)),
    });
  } catch (error) {
    const failure = await resolveUpstreamFailure(error, owner, repo);
    return textError(
      failure.code === "not_found"
        ? `No repository at github.com/${owner}/${repo}.`
        : failure.message,
      failure.status,
    );
  }
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
