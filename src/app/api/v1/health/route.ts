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
      service: "skillsdocs-api",
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
          ? "Authenticated: 5,000 REST requests/hour, plus a separate 5,000-point GraphQL budget carrying repo+owner metadata."
          : "Unauthenticated: 60 requests/hour. A book costs three calls; owner metadata is shared per owner.",
      },
      budget: {
        // Measured, not aspirational. Authenticated, repo + owner metadata
        // travel as one GraphQL point on a separate budget, so a cold book
        // costs 1 REST call (the recursive tree); the design chain adds up to
        // four more recursive-tree calls when it chases a `design.md` pointer.
        // Unauthenticated there is no GraphQL, so metadata comes back to REST
        // and a cold book costs 3 (up to 7 with design chases).
        callsPerBook: github.authenticated
          ? { typical: 1, worstCase: 5 }
          : { typical: 3, worstCase: 7 },
        booksRemaining: reachable
          ? Math.floor(github.remaining / (github.authenticated ? 1 : 3))
          : null,
        note: "REST calls only; booksRemaining assumes the typical cost. Repo and owner metadata ride the GraphQL budget when authenticated. A repository whose design.md chases pointers costs more.",
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
