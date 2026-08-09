import "server-only";

import { getBook, type Book } from "@/lib/book";
import { GitHubError } from "@/lib/github";
import { isValidOwner, isValidRepo } from "@/lib/site";

/**
 * One place where a failed book becomes a *state* instead of an exception.
 *
 * `getBook` throws a typed `GitHubError` for the three upstream conditions
 * that are not bugs — the repository does not exist, the API quota is gone,
 * the network moved. Letting those reach the error boundary would be wrong
 * twice over: a 404 would render as "something went wrong", and a rate-limited
 * build would fail rather than shipping eight prerendered pages that recover
 * on their next revalidation.
 *
 * So every route calls this, matches on `kind`, and renders the designed state
 * for it. The error boundary is left for what it is actually for: the failures
 * we did not anticipate.
 *
 * **`instanceof` is not enough here, and that is not a style preference.**
 * `getBook` is a `"use cache"` function, so anything it throws crosses a
 * serialization boundary before we see it. What arrives is a structurally
 * similar object — `name`, `message`, and own enumerable fields survive — but
 * its prototype does not, so `error instanceof GitHubError` is `false` for
 * every upstream failure that happens inside the cache. Classifying on shape
 * as well as identity is what makes a 404 render as a 404 instead of taking
 * the whole route to the error boundary.
 */

export type BookResult =
  | { kind: "ok"; book: Book }
  | { kind: "not-found" }
  | { kind: "rate-limited"; resetAt: string | null }
  | { kind: "error"; detail: string };

type UpstreamKind = GitHubError["kind"];

export async function loadBook(
  owner: string,
  repo: string,
): Promise<BookResult> {
  // A slug GitHub itself would reject can only 404; refusing it here saves the
  // round trip and keeps malformed paths out of the cache key space.
  if (!isValidOwner(owner) || !isValidRepo(repo)) return { kind: "not-found" };

  try {
    return { kind: "ok", book: await getBook(owner, repo) };
  } catch (error) {
    const kind = upstreamKindOf(error);
    if (kind === "not-found") return { kind: "not-found" };
    if (kind === "rate-limited") {
      return { kind: "rate-limited", resetAt: resetAtOf(error) };
    }
    if (kind) return { kind: "error", detail: messageOf(error) };

    // Not one of ours: a bug in our own pipeline. Hand it to the boundary,
    // which has a real retry and reports the digest.
    throw error;
  }
}

/** `GitHubError["kind"]` when the error came from the GitHub layer, else null. */
function upstreamKindOf(error: unknown): UpstreamKind | null {
  if (error instanceof GitHubError) return error.kind;
  if (typeof error !== "object" || error === null) return null;

  const shape = error as { name?: unknown; kind?: unknown; message?: unknown };
  if (shape.name !== "GitHubError") return null;

  if (
    shape.kind === "not-found" ||
    shape.kind === "rate-limited" ||
    shape.kind === "network" ||
    shape.kind === "other"
  ) {
    return shape.kind;
  }

  // Production strips custom fields from a cached rejection and can redact the
  // message down to a digest. The message is checked last and only as a hint;
  // an unrecognised GitHub failure still lands on the designed error state
  // rather than the boundary, which is the right default for an upstream we
  // do not control.
  const message = typeof shape.message === "string" ? shape.message : "";
  if (/not found/i.test(message)) return "not-found";
  if (/rate limit/i.test(message)) return "rate-limited";
  return "other";
}

function messageOf(error: unknown): string {
  const message = (error as { message?: unknown })?.message;
  return typeof message === "string" && message ? message : "Upstream failure.";
}

/**
 * The reset time only ever exists inside the message text — `GitHubError`
 * carries a status and a kind, not the header. Parsing it is best-effort by
 * design: the state renders fine without it.
 */
function resetAtOf(error: unknown): string | null {
  const message = messageOf(error);
  const iso = /(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/.exec(message);
  if (iso) return iso[1];

  const epoch = /reset[^\d]*(\d{10,13})/i.exec(message);
  if (!epoch) return null;
  const value = Number(epoch[1]);
  const date = new Date(value > 1e12 ? value : value * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
