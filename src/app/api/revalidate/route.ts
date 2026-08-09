/**
 * On-demand cache invalidation.
 *
 *   curl -X POST https://githubskills.dev/api/revalidate \
 *     -H "Authorization: Bearer $REVALIDATE_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"repo":"anthropics/skills"}'
 *
 * Accepts either `{ "repo": "owner/name" }` (the common case — a GitHub push
 * webhook relay) or `{ "tags": ["skills-sh"] }` for the shared datasets.
 */

import { revalidateTag } from "next/cache";

/** Everything a caller is allowed to invalidate by name. */
const GLOBAL_TAGS = new Set(["book", "featured", "skills-sh", "leaderboard"]);

const FULL_NAME = /^[\w.-]+\/[\w.-]+$/;

function unauthorized(): Response {
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

/**
 * Constant-time-ish comparison. Not perfect (length leaks), but it removes the
 * trivial byte-by-byte early exit an attacker would otherwise time.
 */
function secretMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(request: Request): Promise<Response> {
  const expected = process.env.REVALIDATE_SECRET;
  // Refuse rather than run open. An unset secret in production would make this
  // an unauthenticated cache-purge endpoint.
  if (!expected) {
    return Response.json(
      { ok: false, error: "REVALIDATE_SECRET is not configured" },
      { status: 503 },
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const provided = bearer || request.headers.get("x-revalidate-secret") || "";
  if (!provided || !secretMatches(provided, expected)) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return Response.json({ ok: false, error: "expected an object" }, { status: 400 });
  }

  const { repo, tags } = body as { repo?: unknown; tags?: unknown };
  const revalidated: string[] = [];

  if (typeof repo === "string") {
    if (!FULL_NAME.test(repo)) {
      return Response.json(
        { ok: false, error: "repo must be `owner/name`" },
        { status: 400 },
      );
    }
    // Every cache tag is written lower-cased (`repoTag`), because GitHub is
    // case-insensitive and a mixed-case URL must not mint an unreachable
    // entry. The as-sent form is purged too, so any tag written before that
    // rule existed still clears.
    for (const form of new Set([repo, repo.toLowerCase()])) {
      revalidated.push(`repo:${form}`);
    }
    revalidated.push(`owner:${repo.slice(0, repo.indexOf("/")).toLowerCase()}`);
  }

  if (Array.isArray(tags)) {
    for (const tag of tags) {
      if (typeof tag === "string" && GLOBAL_TAGS.has(tag)) revalidated.push(tag);
    }
  }

  if (revalidated.length === 0) {
    return Response.json(
      { ok: false, error: "nothing to revalidate; send `repo` or `tags`" },
      { status: 400 },
    );
  }

  for (const tag of revalidated) {
    // The second argument is required in Next 16. "max" marks the entry stale
    // and serves it while refreshing, instead of forcing a blocking miss.
    revalidateTag(tag, "max");
  }

  return Response.json({ ok: true, revalidated });
}
