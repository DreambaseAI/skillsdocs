/**
 * `GET /api/v1/books/{owner}/{repo}` — the book manifest, no chapter bodies.
 *
 * Read-only, unauthenticated, CORS-open. Error envelope is
 * `{ error: { code, message, hint? } }` everywhere in v1: a machine-readable
 * code, a human-readable message, and something actionable.
 */

import { createHash } from "node:crypto";
import { getBook } from "@/lib/book";
import { fetchRawTextBatch, fetchRepoTree } from "@/lib/github";
import { serveJson } from "@/lib/http";
import {
  chapterLicence,
  repoLicence,
  TAKEDOWN_CONTACT,
} from "@/lib/serialize";
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
  ctx: RouteContext<"/api/v1/books/[owner]/[repo]">,
): Promise<Response> {
  const { owner, repo } = await ctx.params;
  if (!isValidOwner(owner) || !isValidRepo(repo)) {
    return fail(
      400,
      "bad_request",
      `Not a valid GitHub repository reference: ${owner}/${repo}.`,
      "Expected /api/v1/books/{owner}/{repo}.",
    );
  }

  try {
    const book = await getBook(owner, repo);
    const { owner: o, repo: r, defaultBranch: ref } = book.repo;
    const licence = repoLicence(book.repo);

    // Blob SHAs are already in the cached tree; they are git's own content
    // identifier and cost nothing extra here.
    const tree = await fetchRepoTree(o, r, ref);
    const shaByPath = new Map(
      tree.entries.filter((e) => e.type === "blob").map((e) => [e.path, e.sha]),
    );

    const bodies = await fetchRawTextBatch(
      o,
      r,
      ref,
      book.skills.map((s) => s.skillMdPath),
    );

    const chapters = book.skills.map((skill, i) => {
      const source = bodies[i];
      const chapterUrl = absoluteUrl(paths.chapter(o, r, skill.slug));
      const cl = chapterLicence(book, skill);
      const bytes = source != null ? Buffer.byteLength(source, "utf8") : null;

      return {
        position: i + 1,
        name: skill.name,
        slug: skill.slug,
        title: skill.title,
        description: skill.description,
        group: skill.group || null,
        // "authored" — published from this repo; "credited" — installed into
        // it, in use here but written elsewhere.
        origin: skill.origin,
        path: skill.skillMdPath,
        html: chapterUrl,
        markdown: `${chapterUrl}.md`,
        json: absoluteUrl(paths.chapterJson(o, r, skill.slug)),
        source: external.file(o, r, ref, skill.skillMdPath),
        gitBlobSha: shaByPath.get(skill.skillMdPath) ?? null,
        digest:
          source != null
            ? `sha256:${createHash("sha256").update(source, "utf8").digest("hex")}`
            : null,
        bytes,
        wordCount: skill.wordCount,
        readingMinutes: skill.readingMinutes,
        estimatedTokens: bytes != null ? Math.ceil(bytes / 4) : null,
        license: {
          spdx: cl.spdx,
          name: cl.name,
          url: cl.url,
          scope: cl.scope,
          redistributable: cl.redistributable,
        },
        frontmatter: skill.frontmatter,
        allowedTools: skill.allowedTools,
        compatibility: skill.compatibility,
        // A count, not the outline — `headings` read like the array that
        // `/skills/{skill}` returns as `outline`, which is a different thing.
        headingCount: skill.headings.length,
        resources: {
          scripts: skill.resources.filter((x) => x.kind === "script").map((x) => x.relPath),
          references: skill.resources.filter((x) => x.kind === "reference").map((x) => x.relPath),
          assets: skill.resources.filter((x) => x.kind === "asset").map((x) => x.relPath),
          other: skill.resources.filter((x) => x.kind === "other").map((x) => x.relPath),
        },
        variants: skill.variants,
        issues: skill.issues,
      };
    });

    const payload = {
      schemaVersion: "1.0",
      id: `${o}/${r}`,
      owner: o,
      repo: r,
      title: book.owner?.name ? `${book.owner.name} — ${r}` : `${o}/${r}`,
      description: book.repo.description,
      issueNumber: book.issueNumber,
      // "authored" | "credited" | "mixed". A credited book is the repo's
      // working library: skills installed into it, not published from it.
      provenance: book.provenance,
      homepage: absoluteUrl(paths.book(o, r)),
      markdown: absoluteUrl(paths.bookMarkdown(o, r)),
      agentSkillsIndex: absoluteUrl(paths.bookManifest(o, r)),
      openGraphImage: `${absoluteUrl(paths.book(o, r))}/opengraph-image`,
      source: {
        provider: "github",
        url: external.repo(o, r),
        defaultBranch: ref,
        license: {
          spdx: licence.spdx,
          name: licence.name,
          url: licence.url,
          scope: licence.scope,
          redistributable: licence.redistributable,
        },
        stars: book.repo.stars,
        forks: book.repo.forks,
        topics: book.repo.topics,
        archived: book.repo.archived,
        isFork: book.repo.isFork,
        pushedAt: book.repo.pushedAt,
        createdAt: book.repo.createdAt,
        treeTruncated: book.truncated,
      },
      stats: {
        skillCount: book.skills.length,
        /**
         * What the repository actually contains, which is not always what we
         * serve: we read at most 200 chapters. `github/awesome-copilot` has
         * 419 and `ComposioHQ/awesome-claude-skills` has 864, and both were
         * published as "200 chapters" with nothing marking the cut.
         */
        skillTotal: book.skillsTotal,
        truncated: book.capped || book.unreadable.length > 0,
        unreadable: book.unreadable.length,
        republishable: chapters.filter((c) => c.license.redistributable).length,
        totalWords: book.totalWords,
        totalReadingMinutes: book.totalReadingMinutes,
        layouts: book.layouts,
      },
      signal: book.signal,
      marketplace: book.marketplace,
      theme: {
        origin: book.theme.origin,
        hue: book.theme.hue,
        accentLight: book.theme.accentLight,
        accentDark: book.theme.accentDark,
        displayFont: book.theme.displayFont,
        bodyFont: book.theme.bodyFont,
      },
      // Omitted for a credited book: installing from here would republish
      // other authors' skills under this repository's name.
      ...(book.provenance !== "credited"
        ? { install: { all: installCommand(o, r) } }
        : {}),
      parts: book.parts.map((p) => ({
        group: p.group,
        title: p.title,
        credited: p.credited ?? false,
        skills: p.skills.map((s) => s.slug),
      })),
      chapters,
      attribution: {
        notice:
          "Content is mirrored from a public GitHub repository and is owned by its authors. Skill bodies are served verbatim. Skills with no detectable licence are linked but never inlined.",
        upstream: external.repo(o, r),
        takedown: TAKEDOWN_CONTACT,
      },
      // No `generatedAt`. It changed on every request, which made the payload
      // byte-unstable and an `ETag` impossible; `source.pushedAt` already
      // reports the only timestamp that means anything about this content.
    };

    return serveJson(request, payload, {
      ...JSON_HEADERS,
      link: [
        `<${absoluteUrl(paths.book(o, r))}>; rel="canonical"`,
        `<${absoluteUrl(paths.bookMarkdown(o, r))}>; rel="alternate"; type="text/markdown"`,
        `<${absoluteUrl(paths.bookManifest(o, r))}>; rel="agent-skills"`,
        `<${absoluteUrl("/api/v1/books")}>; rel="collection"`,
        `<${absoluteUrl("/api/v1/openapi.json")}>; rel="service-desc"`,
      ].join(", "),
      "x-skills-withheld": String(
        book.skills.length - chapters.filter((c) => c.license.redistributable).length,
      ),
    });
  } catch (error) {
    const failure = await resolveUpstreamFailure(error, owner, repo);
    const hint =
      failure.code === "not_found"
        ? `Open ${absoluteUrl(paths.book(owner, repo))} to index it, or check the spelling.`
        : failure.code === "rate_limited"
          ? `Check ${absoluteUrl("/api/v1/health")} for the current budget and reset time.`
          : undefined;
    return fail(
      failure.status,
      failure.code,
      failure.code === "not_found"
        ? `No repository at github.com/${owner}/${repo}.`
        : failure.message,
      hint,
    );
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}
