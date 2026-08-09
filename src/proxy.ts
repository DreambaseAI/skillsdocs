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
const DISCOVERY_RELATIONS = [
  '</llms.txt>; rel="llms-txt"',
  '</.well-known/api-catalog>; rel="api-catalog"',
  '</api/v1/openapi.json>; rel="service-desc"',
  '</api/v1/books>; rel="collection"',
  '</sitemap.xml>; rel="sitemap"',
] as const;

/** Everything, including the site's own manifest. For non-book URLs. */
const DISCOVERY_LINK = [
  '</.well-known/agent-skills/index.json>; rel="agent-skills"',
  ...DISCOVERY_RELATIONS,
].join(", ");

/**
 * For a book or chapter URL, where the *book's* manifest is the one an agent
 * wants and a second `rel="agent-skills"` would make it choose.
 */
const BOOK_DISCOVERY_LINK = DISCOVERY_RELATIONS;

/**
 * `owner/repo` and `owner/repo/skill`.
 *
 * Owner follows GitHub's own rule (1–39 chars, alphanumerics and internal
 * hyphens). Repo and skill segments allow dots, which is exactly why the `.md`
 * check has to run against the *stripped* path rather than a negative lookahead.
 *
 * `api/` and `search/` are excluded because they are ours, not owners'.
 * Without that, `/api/v1/health` matched as owner `api`, repo `v1`, chapter
 * `health` — so the health endpoint advertised `</api/v1/health.md>` and
 * `</api/v1/.well-known/agent-skills/index.json>`, and an `Accept:
 * text/markdown` request to it would have been rewritten to
 * `/api/md/api/v1/health`.
 */
const READER_ROUTE =
  /^\/(?!api\/|search\/)[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}(?:\/[A-Za-z0-9._-]{1,100})?$/;

/** `/{owner}/{repo}/.well-known/agent-skills/index.json` */
const BOOK_MANIFEST =
  /^\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})\/\.well-known\/agent-skills\/index\.json$/;

const SITE_WELL_KNOWN: Record<string, string> = {
  "/.well-known/agent-skills/index.json": "/api/well-known/agent-skills",
  "/.well-known/agent-skills/skills-docs/skill.md":
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

/**
 * The pathname with percent-escapes resolved, for matching only.
 *
 * `request.nextUrl.pathname` is percent-encoded, and `%` is not in
 * `READER_ROUTE`'s character class, so any non-ASCII slug failed to match and
 * its `.md` twin was never rewritten — while `paths.chapterMarkdown()`
 * percent-encodes the slug and prints exactly that URL in
 * `<link rel="alternate">`, in `llms.txt`, in the book's table of contents and
 * in the agent-skills manifest. Verified: `/anthropics/skills/skill-creator.md`
 * → `text/markdown`, `/anthropics/skills/skill%2Dcreator.md` → `text/html`.
 *
 * Decoding can throw on a malformed escape; a path we cannot decode is a path
 * we do not rewrite.
 */
export function decodedPath(pathname: string): string {
  if (!pathname.includes("%")) return pathname;
  try {
    const decoded = decodeURIComponent(pathname);
    // A `%2F` must not be allowed to invent a path segment.
    const slashes = (s: string) => (s.match(/\//g) ?? []).length;
    return slashes(decoded) === slashes(pathname) ? decoded : pathname;
  } catch {
    return pathname;
  }
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const decoded = decodedPath(pathname);

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
  if (decoded.endsWith(".md")) {
    const bare = decoded.slice(0, -3);
    if (READER_ROUTE.test(bare)) {
      const url = request.nextUrl.clone();
      url.pathname = `/api/md${bare}`;
      return withDiscovery(NextResponse.rewrite(url), { link: false });
    }
  }

  // 4. Content negotiation on the HTML reader routes. A convenience path: the
  //    `.md` URL is canonical and carries the cache, this one carries `Vary`.
  if (READER_ROUTE.test(decoded)) {
    if (prefersMarkdown(request.headers.get("accept") ?? "")) {
      const url = request.nextUrl.clone();
      url.pathname = `/api/md${decoded}`;
      const res = withDiscovery(NextResponse.rewrite(url), { link: false });
      res.headers.set("Vary", "Accept");
      return res;
    }

    // The HTML half of the same negotiation. `Vary: Accept` was set only on
    // the markdown branch, so a shared cache that stored the HTML first would
    // keep serving HTML to every later `Accept: text/markdown` request for the
    // life of the `s-maxage=3600` entry. One URL, two media types, one `Vary`
    // — it has to be on both.
    //
    // Book-specific relations go on the response too: `<link rel="alternate">`
    // is in `<head>`, but an agent doing the cheap, correct thing — `HEAD`
    // first — never parses the body, and until now got only the five
    // site-wide relations that every URL carries.
    const res = withDiscovery(NextResponse.next(), { link: false });
    const [owner, repo] = pathname.split("/").filter(Boolean);
    res.headers.set(
      "Link",
      [
        `<${pathname}.md>; rel="alternate"; type="text/markdown"`,
        // The *book's* manifest, not the site's. Two links with the same
        // relation make the caller guess, so the site-wide `agent-skills`
        // entry is dropped from `DISCOVERY_LINK` here — the same rule
        // `lib/serialize.ts` follows on the routes that set their own `Link`.
        `</${owner}/${repo}/.well-known/agent-skills/index.json>; rel="agent-skills"`,
        `</api/v1/books/${owner}/${repo}>; rel="alternate"; type="application/json"`,
        ...BOOK_DISCOVERY_LINK,
      ].join(", "),
    );
    // `Vary: Accept` is *also* declared in `next.config.ts` `headers()`: Next
    // rewrites the `Vary` of an app-router response after the proxy has run, so
    // a value set here on `NextResponse.next()` does not survive. Measured —
    // the header is kept on the rewrite branch above and lost on this one.
    res.headers.append("Vary", "Accept");
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
