/**
 * `GET /api/v1/health` — liveness plus the live upstream budget.
 *
 * Deliberately uncached at every layer. `rateLimitBudget()` does not itself
 * consume GitHub quota, and a cached rate-limit number is worse than none: an
 * agent checks this endpoint precisely when book requests started failing, and
 * a five-minute-old "4,900 remaining" would send it straight back into the
 * wall.
 *
 * `connection()` is what tells Cache Components this handler must not
 * prerender — without it the uncached fetch below fails the build.
 */

import { connection } from "next/server";
import { rateLimitBudget } from "@/lib/github";
import { absoluteUrl } from "@/lib/site";

const NO_STORE: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, max-age=0",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "x-robots-tag": "noindex",
};

export async function GET(): Promise<Response> {
  await connection();

  const startedAt = Date.now();
  const github = await rateLimitBudget();
  const latencyMs = Date.now() - startedAt;

  // `remaining: -1` means the probe itself failed — GitHub unreachable, or a
  // shape we did not recognise. That is degraded, not down: cached books still
  // serve.
  const reachable = github.remaining >= 0;
  const exhausted = reachable && github.remaining === 0;
  const status = !reachable || exhausted ? "degraded" : "ok";

  return Response.json(
    {
      status,
      service: "githubskills-api",
      version: "1.0",
      time: new Date().toISOString(),
      upstream: {
        provider: "github",
        reachable,
        probeLatencyMs: latencyMs,
        authenticated: github.authenticated,
        limit: github.limit,
        remaining: reachable ? github.remaining : null,
        resetAt: github.resetAt || null,
        note: github.authenticated
          ? "Authenticated: 5,000 requests/hour."
          : "Unauthenticated: 60 requests/hour. A book costs two calls, plus one per new owner.",
      },
      budget: {
        // Measured, not aspirational. `getBook` makes three core calls — repo
        // metadata, one recursive tree, and owner metadata — and the design
        // chain adds up to four more recursive-tree calls when it chases a
        // `design.md` pointer. Owner metadata is amortised across an owner's
        // books, so a cold book costs 3 in the common case and up to 7 in the
        // worst. Publishing `2` overstated capacity by 1.5–2x for an agent
        // pacing itself against this number.
        callsPerBook: { typical: 3, worstCase: 7 },
        booksRemaining: reachable ? Math.floor(github.remaining / 3) : null,
        note: "booksRemaining assumes the typical cost. Owner metadata is shared across one owner's books; a repository whose design.md chases pointers costs more.",
      },
      links: {
        openapi: absoluteUrl("/api/v1/openapi.json"),
        llmsTxt: absoluteUrl("/llms.txt"),
        agentSkills: absoluteUrl("/.well-known/agent-skills/index.json"),
      },
    },
    { status: status === "ok" ? 200 : 503, headers: NO_STORE },
  );
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: NO_STORE });
}
