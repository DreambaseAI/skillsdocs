/**
 * `GET /api/v1/books` — the catalog.
 *
 * The first question any agent asks is "what do you have?", and until this
 * route existed the JSON API could not answer it. `llms.txt` listed 25 of the
 * 89 books, `sitemap.xml` had all 89 but only as XML, and `/api/v1/books`
 * itself returned **200 text/html** — the `[owner]/[repo]` catch-all rendering
 * a reader page for a repository called `v1/books`. A route handler here also
 * removes that soft-404.
 *
 * Cheap by construction: `getFeaturedBooks()` is the same cached, network-light
 * seed catalog the home page renders, so enumerating the site costs zero GitHub
 * API calls. Numbers here are *catalog* numbers — verified at seed time and
 * refreshed from skills.sh — not a live tree scan. `stats.source` says so, and
 * the per-book `json` link is where an agent goes for the authoritative count.
 */

import { serveJson } from "@/lib/http";
import { getFeaturedBooks } from "@/lib/featured";
import { external, absoluteUrl, installCommand, paths } from "@/lib/site";

const JSON_HEADERS: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "x-robots-tag": "all",
};

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

function fail(status: number, code: string, message: string, hint?: string) {
  return Response.json(
    { error: { code, message, ...(hint ? { hint } : {}) } },
    { status, headers: JSON_HEADERS },
  );
}

/** A cursor is an offset. Reject anything else rather than silently rewinding. */
function parseCursor(raw: string | null): number | null | "invalid" {
  if (raw === null || raw === "") return null;
  if (!/^\d{1,7}$/.test(raw)) return "invalid";
  return Number(raw);
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);

  const cursor = parseCursor(url.searchParams.get("cursor"));
  if (cursor === "invalid") {
    return fail(
      400,
      "invalid_cursor",
      "`cursor` must be a non-negative integer taken from a previous `nextCursor`.",
      "Omit it to start from the beginning.",
    );
  }
  const offset = cursor ?? 0;

  const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, rawLimit))
    : DEFAULT_LIMIT;

  const ownerFilter = (url.searchParams.get("owner") ?? "").trim().toLowerCase();

  const all = await getFeaturedBooks();
  const filtered = ownerFilter
    ? all.filter((b) => b.owner.toLowerCase() === ownerFilter)
    : all;

  const page = filtered.slice(offset, offset + limit);
  const nextCursor =
    offset + limit < filtered.length ? String(offset + limit) : null;

  const books = page.map((b) => ({
    id: `${b.owner}/${b.repo}`,
    owner: b.owner,
    repo: b.repo,
    description: b.description,
    official: b.official,
    skillCount: b.skillCount,
    installs: b.installs,
    stars: b.stars,
    license: b.license,
    layouts: b.layouts,
    html: absoluteUrl(paths.book(b.owner, b.repo)),
    markdown: absoluteUrl(paths.bookMarkdown(b.owner, b.repo)),
    json: absoluteUrl(paths.bookJson(b.owner, b.repo)),
    manifest: absoluteUrl(paths.bookManifest(b.owner, b.repo)),
    source: external.repo(b.owner, b.repo),
    install: installCommand(b.owner, b.repo),
  }));

  return serveJson(request, {
    schemaVersion: "1.0",
    total: filtered.length,
    limit,
    cursor: offset,
    nextCursor,
    stats: {
      source: "catalog",
      note: "skillCount, stars and installs come from the verified seed catalog merged with skills.sh. Fetch a book's `json` for a live tree scan.",
      live: page.some((b) => b.live),
    },
    books,
  }, {
    ...JSON_HEADERS,
    link: [
      `<${absoluteUrl("/api/v1/openapi.json")}>; rel="service-desc"`,
      `<${absoluteUrl("/llms.txt")}>; rel="llms-txt"`,
      ...(nextCursor
        ? [`<${absoluteUrl(`/api/v1/books?limit=${limit}&cursor=${nextCursor}`)}>; rel="next"`]
        : []),
    ].join(", "),
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}
