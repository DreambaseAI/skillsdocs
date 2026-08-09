/**
 * `GET /{owner}/{repo}/.well-known/agent-skills/index.json`
 *
 * The differentiator: an agent that lands on a rendered repo can enumerate and
 * install every chapter without cloning. Reached through the `proxy.ts` rewrite
 * because a literal `.well-known` directory under `app/` is not a routable
 * segment.
 *
 * Each entry carries two verifiable pairs: `url` + `digest` over the bytes this
 * site serves, and `source` + `sourceDigest` over the raw upstream file. Both
 * are real sha256s of documents an agent can fetch, which is the whole point —
 * the previous shape hashed the raw bytes and attached the hash to the `.md`
 * twin, so `curl <url> | shasum -a 256` failed on every entry of every book.
 * A chapter whose bytes we could not read is dropped rather than listed with a
 * digest we invented.
 */

import { createHash } from "node:crypto";
import { getBook } from "@/lib/book";
import { fetchRawTextBatch } from "@/lib/github";
import { serveJson } from "@/lib/http";
import {
  DISCOVERY_LINK,
  bookToAgentSkills,
  isRepublishable,
  skillToMarkdown,
  type ChapterDigests,
} from "@/lib/serialize";
import { absoluteUrl, isValidOwner, isValidRepo, paths } from "@/lib/site";
import { resolveUpstreamFailure } from "@/lib/upstream";

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

const JSON_HEADERS: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "x-robots-tag": "all",
};

function fail(
  status: number,
  code: string,
  message: string,
  hint?: string,
): Response {
  return Response.json(
    { error: { code, message, ...(hint ? { hint } : {}) } },
    { status, headers: JSON_HEADERS },
  );
}

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/well-known/agent-skills/[owner]/[repo]">,
): Promise<Response> {
  const { owner, repo } = await ctx.params;
  if (!isValidOwner(owner) || !isValidRepo(repo)) {
    return fail(
      400,
      "bad_request",
      `Not a valid GitHub repository reference: ${owner}/${repo}.`,
      "Expected /{owner}/{repo}/.well-known/agent-skills/index.json.",
    );
  }
  return build(request, owner, repo);
}

async function build(
  request: Request,
  owner: string,
  repo: string,
): Promise<Response> {
  try {
    const book = await getBook(owner, repo);
    const { owner: o, repo: r, defaultBranch: ref } = book.repo;

    const eligible = book.skills.filter((s) => isRepublishable(book, s));
    const bodies = await fetchRawTextBatch(
      o,
      r,
      ref,
      eligible.map((s) => s.skillMdPath),
    );

    const digests = new Map<string, ChapterDigests>();
    eligible.forEach((skill, i) => {
      const source = bodies[i];
      if (source == null) return;
      // The bytes at `url`. `skillToMarkdown` is what the `.md` route serves,
      // so hashing its output here is hashing the response an agent will get.
      const raw = new Map([[skill.slug, source]]);
      digests.set(skill.slug, {
        document: sha256(skillToMarkdown(book, skill, { raw })),
        source: sha256(source),
      });
    });

    const manifest = bookToAgentSkills(book, digests);
    const omitted = book.skills.length - manifest.skills.length;

    return serveJson(request, manifest, {
      ...JSON_HEADERS,
      link: [
        `<${absoluteUrl(paths.book(o, r))}>; rel="canonical"`,
        `<${absoluteUrl(paths.bookMarkdown(o, r))}>; rel="llms-full-txt"`,
        `<${absoluteUrl(paths.bookJson(o, r))}>; rel="describedby"`,
        ...DISCOVERY_LINK,
      ].join(", "),
      // Chapters dropped for a missing licence or unreadable bytes. Zero is
      // the happy path; a non-zero value is why a chapter you can see in the
      // reader is not listed here.
      "x-skills-omitted": String(omitted),
    });
  } catch (error) {
    const failure = await resolveUpstreamFailure(error, owner, repo);
    const hint =
      failure.code === "not_found"
        ? `Check the owner and repository name, or open ${absoluteUrl(paths.book(owner, repo))} to index it.`
        : failure.code === "rate_limited"
          ? "Retry after the reset time in the message."
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
