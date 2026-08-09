/**
 * Request-edge routing for the agent surfaces.
 *
 * Next 16 renamed `middleware.ts` to `proxy.ts`; this file is the whole reason
 * `/anthropics/skills.md` can exist at all. `app/[owner]/[repo]/page.tsx`
 * matches `/anthropics/skills.md` with `repo === "skills.md"` — dynamic
 * segments happily contain dots — so without a rewrite the HTML page wins and
 * the markdown twin is unreachable. Same for `.well-known`: a dot-prefixed
 * directory under `app/` is not a routable segment, so those URLs are rewritten
 * onto ordinary route handlers under `/api/well-known/*`.
 *
 * Four jobs:
 *   1. `.md` suffix        → `/api/md/...`.
 *   2. `Accept` negotiation → the same handler, plus `Vary: Accept`.
 *   3. `.well-known/*`     → `/api/well-known/...`.
 *   4. Discovery headers on everything else.
 *
 * Runs before rendering and must stay dependency-free: the proxy is deployed
 * separately from the app, so importing anything from `src/lib` here would
 * either fail or quietly pull the world into the edge bundle. That is why
 * `DISCOVERY_LINK` is duplicated here and in `lib/serialize.ts` — the routes
 * cannot borrow this copy and this copy cannot borrow theirs.
 */

import { NextResponse, type NextRequest } from "next/server";

/**
 * Advertised on every response. Mirrors the shape Mintlify serves, minus the
 * two entries we do not implement (`mcp-server-card`, `agent-card`) — a
 * dangling `rel` is worse than a missing one.
 */
const DISCOVERY_LINK = [
  '</llms.txt>; rel="llms-txt"',
  '</.well-known/agent-skills/index.json>; rel="agent-skills"',
  '</.well-known/api-catalog>; rel="api-catalog"',
  '</api/v1/openapi.json>; rel="service-desc"',
  '</sitemap.xml>; rel="sitemap"',
].join(", ");

/**
 * `owner/repo` and `owner/repo/skill`.
 *
 * Owner follows GitHub's own rule (1–39 chars, alphanumerics and internal
 * hyphens). Repo and skill segments allow dots, which is exactly why the `.md`
 * check has to run against the *stripped* path rather than a negative lookahead.
 */
const READER_ROUTE =
  /^\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}(?:\/[A-Za-z0-9._-]{1,100})?$/;

/** `/{owner}/{repo}/.well-known/agent-skills/index.json` */
const BOOK_MANIFEST =
  /^\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})\/\.well-known\/agent-skills\/index\.json$/;

const SITE_WELL_KNOWN: Record<string, string> = {
  "/.well-known/agent-skills/index.json": "/api/well-known/agent-skills",
  "/.well-known/agent-skills/githubskills-book/skill.md":
    "/api/well-known/agent-skills/skill",
  "/.well-known/api-catalog": "/api/well-known/api-catalog",
};

/**
 * Quality value for one media type in an `Accept` header, or -1 when absent.
 *
 * Hand-rolled rather than regex-per-type: `Accept` is a comma-separated list of
 * `type/subtype;param=value` entries, and splitting on commas then trimming is
 * both cheaper and harder to get wrong than a pattern with alternation and
 * escaping in it.
 */
function acceptQuality(accept: string, type: string): number {
  let best = -1;
  for (const part of accept.split(",")) {
    const [rawType, ...params] = part.split(";");
    if (rawType.trim().toLowerCase() !== type) continue;
    let q = 1;
    for (const param of params) {
      const [key, value] = param.split("=");
      if (key?.trim().toLowerCase() === "q") {
        const parsed = Number.parseFloat(value ?? "");
        if (Number.isFinite(parsed)) q = parsed;
      }
    }
    if (q > best) best = q;
  }
  return best;
}

/**
 * True when the client asked for markdown *and* ranked it above HTML.
 *
 * Browsers send `text/html,application/xhtml+xml,…;q=0.9,*\/*;q=0.8`, so a
 * naive `includes("text/markdown")` would be safe but a naive `*\/*` check
 * would hand every browser a plain-text page. Markdown must win on q-value, and
 * a wildcard never counts as a markdown request.
 */
export function prefersMarkdown(accept: string): boolean {
  if (!accept) return false;
  const md = Math.max(
    acceptQuality(accept, "text/markdown"),
    acceptQuality(accept, "text/x-markdown"),
  );
  if (md <= 0) return false;
  const html = Math.max(
    acceptQuality(accept, "text/html"),
    acceptQuality(accept, "application/xhtml+xml"),
  );
  return md > html;
}

/**
 * Point at the machine-readable copies.
 *
 * A proxy header wins over one the route handler set, so `Link` is only
 * written here for responses no handler of ours produces. The `.md`, JSON and
 * `.well-known` handlers emit a `Link` that already carries `rel="canonical"`
 * plus book-specific relations, which is strictly more useful than this
 * site-wide list; overwriting it would trade information for uniformity.
 */
function withDiscovery(res: NextResponse, options: { link?: boolean } = {}): NextResponse {
  if (options.link !== false) res.headers.set("Link", DISCOVERY_LINK);
  res.headers.set("X-Llms-Txt", "/llms.txt");
  return res;
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // 1. Per-book agent-skills manifest. Checked before the generic reader match
  //    because its path has more segments than a chapter URL.
  const manifest = BOOK_MANIFEST.exec(pathname);
  if (manifest) {
    const url = request.nextUrl.clone();
    url.pathname = `/api/well-known/agent-skills/${manifest[1]}/${manifest[2]}`;
    return withDiscovery(NextResponse.rewrite(url), { link: false });
  }

  // 2. Site-level `.well-known` documents.
  const wellKnown = SITE_WELL_KNOWN[pathname];
  if (wellKnown) {
    const url = request.nextUrl.clone();
    url.pathname = wellKnown;
    return withDiscovery(NextResponse.rewrite(url), { link: false });
  }

  // 3. The canonical markdown twin: `/owner/repo.md`, `/owner/repo/skill.md`.
  if (pathname.endsWith(".md")) {
    const bare = pathname.slice(0, -3);
    if (READER_ROUTE.test(bare)) {
      const url = request.nextUrl.clone();
      url.pathname = `/api/md${bare}`;
      return withDiscovery(NextResponse.rewrite(url), { link: false });
    }
  }

  // 4. Content negotiation on the HTML reader routes. A convenience path: the
  //    `.md` URL is canonical and carries the cache, this one carries `Vary`.
  if (
    READER_ROUTE.test(pathname) &&
    prefersMarkdown(request.headers.get("accept") ?? "")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = `/api/md${pathname}`;
    const res = withDiscovery(NextResponse.rewrite(url), { link: false });
    res.headers.set("Vary", "Accept");
    return res;
  }

  // 5. Everything else still advertises where the machine-readable copies are.
  return withDiscovery(NextResponse.next());
}

export const config = {
  matcher: [
    // Skip Next's own assets and anything that is already a binary file.
    // `.md` is deliberately NOT excluded — it is the whole point.
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|woff|woff2|ttf|otf|txt|xml|webmanifest)$).*)",
  ],
};
