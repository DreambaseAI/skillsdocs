import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import {
  classifyUpstreamError,
  failureFromProbe,
  type RepoStatus,
  type UpstreamFailure,
} from "./serialize";

export type { RepoStatus };

/**
 * Turning a failed `getBook()` into an honest HTTP status.
 *
 * WHY THIS FILE EXISTS. `getBook` is a `"use cache"` function, and in a
 * production build a rejection that crosses that boundary **from a route
 * handler with dynamic params** is replaced wholesale by React's redacted
 * error:
 *
 *   name:    "Error"                       (was "GitHubError")
 *   message: "An error occurred in the Server Components render…"
 *   keys:    ["digest"]                    (`kind` and `status` are gone)
 *
 * Measured on `next build && next start`, Next 16.3: a route handler that
 * calls `getBook("anthropics", "does-not-exist-repo-xyz")` with *literal*
 * arguments catches the real `GitHubError` (`kind: "not-found"`), while the
 * identical handler reading `owner`/`repo` from `ctx.params` catches the
 * redacted one. Every agent surface is the second shape, which is why they all
 * answered 502 for a repository that simply does not exist.
 *
 * No amount of duck-typing recovers a field that was deleted. So when the
 * shape-based classifier cannot name the failure, we ask GitHub again —
 * outside the cache, with a plain `fetch` whose rejection nothing can rewrite.
 * That probe only ever runs on the error path, and a GitHub 404 does not
 * consume core quota (verified: `/rate_limit` core `remaining` is unchanged
 * across a direct 404), so the common case — a crawler walking made-up URLs —
 * is free.
 */

const API = "https://api.github.com";


function headers(): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "github-skills-book",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/**
 * Does this repository exist, and can we reach GitHub at all?
 *
 * Never throws — the whole point is to produce a value that survives the cache
 * boundary intact. Cached on the short `probe` profile so a crawler hammering
 * `/x/y` costs one upstream call per five minutes rather than one per hit.
 */
export async function probeRepoStatus(
  owner: string,
  repo: string,
): Promise<RepoStatus> {
  "use cache";
  cacheLife("probe");
  cacheTag(`repo:${owner}/${repo}`);

  let res: Response;
  try {
    res = await fetch(`${API}/repos/${owner}/${repo}`, { headers: headers() });
  } catch (cause) {
    return { kind: "error", detail: `Could not reach GitHub: ${(cause as Error).message}` };
  }

  if (res.ok) return { kind: "ok" };
  if (res.status === 404) return { kind: "not-found" };
  if (
    (res.status === 403 || res.status === 429) &&
    res.headers.get("x-ratelimit-remaining") === "0"
  ) {
    const reset = Number(res.headers.get("x-ratelimit-reset") ?? 0) * 1000;
    return {
      kind: "rate-limited",
      resetAt: reset ? new Date(reset).toISOString() : null,
    };
  }
  return { kind: "error", detail: `GitHub responded ${res.status}.` };
}

/**
 * The status, code and message an agent surface should answer with.
 *
 * Tries the cheap shape-based classification first — it is correct whenever
 * the error survived — and only pays for a probe when the answer would
 * otherwise be a generic 502.
 */
export async function resolveUpstreamFailure(
  error: unknown,
  owner: string,
  repo: string,
): Promise<UpstreamFailure> {
  const direct = classifyUpstreamError(error);
  if (direct.status !== 502) return direct;
  return failureFromProbe(await probeRepoStatus(owner, repo), owner, repo);
}

