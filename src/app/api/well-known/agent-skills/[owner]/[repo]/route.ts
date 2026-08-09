/**
 * `GET /{owner}/{repo}/.well-known/agent-skills/index.json`
 *
 * The differentiator: an agent that lands on a rendered repo can enumerate and
 * install every chapter without cloning. Reached through the `proxy.ts` rewrite
 * because a literal `.well-known` directory under `app/` is not a routable
 * segment.
 *
 * The digest is a real sha256 over the raw upstream bytes — the same bytes the
 * matching `.md` route serves after its provenance header, and the same bytes
 * `shasum -a 256` produces against raw.githubusercontent. A chapter whose bytes
 * we could not read is dropped rather than listed with a digest we invented.
 */

import { createHash } from "node:crypto";
import { getBook } from "@/lib/book";
import { fetchRawTextBatch } from "@/lib/github";
import {
  DISCOVERY_LINK,
  bookToAgentSkills,
  classifyUpstreamError,
  isRepublishable,
} from "@/lib/serialize";
import { absoluteUrl, isValidOwner, isValidRepo, paths } from "@/lib/site";

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
  _request: Request,
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
  return build(owner, repo);
}

async function build(owner: string, repo: string): Promise<Response> {
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

    const digests = new Map<string, string>();
    eligible.forEach((skill, i) => {
      const source = bodies[i];
      if (source == null) return;
      digests.set(
        skill.slug,
        createHash("sha256").update(source, "utf8").digest("hex"),
      );
    });

    const manifest = bookToAgentSkills(book, digests);
    const omitted = book.skills.length - manifest.skills.length;

    return Response.json(manifest, {
      headers: {
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
      },
    });
  } catch (error) {
    const failure = classifyUpstreamError(error);
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
