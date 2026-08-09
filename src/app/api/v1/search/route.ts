/**
 * `GET /api/v1/search?q=` — cross-book search.
 *
 * Ranking is `lib/search.ts`, the same matcher the ⌘K palette and `/search`
 * use, over the same corpus from `getSearchIndex()`: every seeded book plus
 * every chapter skills.sh knows about, ~2,300 records. Two implementations of
 * "search" would eventually disagree, and an agent told a skill does not exist
 * will stop looking — so there is only one.
 *
 * That corpus carries titles, not bodies. Supplying both `owner` and `repo`
 * therefore adds a second pass over that one book's chapter descriptions,
 * headings and bodies, which also finds chapters skills.sh has never ranked.
 * The `sources` field says which passes actually ran; be honest about the
 * index or the caller cannot reason about a null result.
 */

import { getBook } from "@/lib/book";
import { getSearchIndex } from "@/components/home/search-index";
import {
  MAX_QUERY,
  fieldScore,
  normalize,
  search,
  tokenize,
  type SearchDoc,
} from "@/lib/search";
import {
  absoluteUrl,
  installCommand,
  isValidOwner,
  isValidRepo,
  paths,
} from "@/lib/site";

const JSON_HEADERS: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=0, s-maxage=600, stale-while-revalidate=86400",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "x-robots-tag": "all",
};

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;

function fail(status: number, code: string, message: string, hint?: string) {
  return Response.json(
    { error: { code, message, ...(hint ? { hint } : {}) } },
    { status, headers: JSON_HEADERS },
  );
}

interface Result {
  type: "book" | "skill";
  book: string;
  skill: string | null;
  title: string;
  description: string | null;
  score: number;
  matchedOn: string;
  snippet: string | null;
  html: string;
  markdown: string;
  json: string;
  install: string;
  installs: number | null;
  origin: "index" | "book";
}

/**
 * The lowest `fieldScore` tier that means the term is literally present.
 *
 * `fieldScore` returns 0.16 for a *subsequence* — "echarts" inside "Google
 * Dis**c**overy Service … skills" — which is the right "did you mean" tier for
 * someone typing into a palette and the wrong answer entirely for a machine.
 * An agent that gets `googleworkspace/cli` as the top hit for `echarts` will
 * conclude our index is noise. Substring (0.45) is the floor here.
 */
const LITERAL = 0.45;

/** Every query term appears verbatim in at least one of the doc's fields. */
function isLiteralMatch(doc: SearchDoc, tokens: string[]): boolean {
  const fields = [
    normalize(doc.title),
    normalize(`${doc.owner} ${doc.repo}${doc.slug ? ` ${doc.slug}` : ""}`),
    normalize(doc.subtitle ?? ""),
    normalize(doc.keywords.join(" ")),
  ];
  return tokens.every((token) =>
    fields.some((field) => fieldScore(field, token) >= LITERAL),
  );
}

/**
 * Which text a snippet should be cut from, given the field that matched.
 *
 * Falls back through the fields in weight order so a `headings` hit still
 * produces something when the heading text is shorter than the window.
 */
function snippetSource(
  matchedOn: string,
  skill: { description: string; body: string; headings: Array<{ text: string }> },
): string {
  if (matchedOn === "body") return skill.body;
  if (matchedOn === "headings") {
    return `${skill.headings.map((h) => h.text).join(" · ")}\n\n${skill.body}`;
  }
  return skill.description || skill.body;
}

/** A window of `text` around the first token hit, with the hit emphasised. */
function snippet(text: string, tokens: string[], width = 180): string | null {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  const lower = flat.toLowerCase();
  const at = tokens
    .map((t) => lower.indexOf(t))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0];

  const start = at === undefined ? 0 : Math.max(0, at - Math.floor(width / 3));
  const end = Math.min(flat.length, start + width);
  const window = flat.slice(start, end);
  const marked = tokens.reduce(
    (acc, token) =>
      acc.replace(
        new RegExp(`(${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"),
        "**$1**",
      ),
    window,
  );
  return `${start > 0 ? "…" : ""}${marked}${end < flat.length ? "…" : ""}`;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const ownerFilter = (url.searchParams.get("owner") ?? "").trim();
  const repoFilter = (url.searchParams.get("repo") ?? "").trim();
  const kind = url.searchParams.get("kind");
  const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, rawLimit))
    : DEFAULT_LIMIT;
  // A cursor is an offset. A corrupt or stale one used to be coerced to 0 and
  // silently return page 1 with `nextCursor: "10"` — a resumable crawler that
  // persisted a cursor across a deploy re-ingested from the top forever.
  const rawCursor = url.searchParams.get("cursor");
  const cursorInvalid = rawCursor !== null && rawCursor !== "" && !/^\d{1,7}$/.test(rawCursor);
  const cursor = rawCursor && /^\d{1,7}$/.test(rawCursor) ? Number(rawCursor) : 0;

  if (!q) {
    return fail(
      400,
      "missing_query",
      "A `q` parameter is required.",
      "Try /api/v1/search?q=echarts. Add owner and repo to search inside one book's chapter bodies.",
    );
  }
  if (q.length > MAX_QUERY) {
    return fail(400, "query_too_long", `\`q\` is limited to ${MAX_QUERY} characters.`);
  }
  if (ownerFilter && !isValidOwner(ownerFilter)) {
    return fail(400, "bad_request", `Not a valid GitHub owner: ${ownerFilter}.`);
  }
  if (repoFilter && !isValidRepo(repoFilter)) {
    return fail(400, "bad_request", `Not a valid GitHub repository: ${repoFilter}.`);
  }
  if (kind && kind !== "book" && kind !== "skill") {
    return fail(400, "bad_request", "`kind` must be `book` or `skill`.");
  }
  if (cursorInvalid) {
    return fail(
      400,
      "invalid_cursor",
      "`cursor` must be a non-negative integer taken from a previous `nextCursor`.",
      "Omit it to start from the beginning of the result set.",
    );
  }

  const tokens = tokenize(q);
  if (tokens.length === 0) {
    return Response.json(
      {
        query: q,
        total: 0,
        limit,
        nextCursor: null,
        sources: [],
        note: "The query held no searchable terms.",
        results: [],
      },
      { headers: JSON_HEADERS },
    );
  }

  const results: Result[] = [];
  const sources: string[] = [];
  const deep = Boolean(ownerFilter && repoFilter);

  /* -------------------------------------------- deep pass: one book's bodies */

  if (deep) {
    try {
      const book = await getBook(ownerFilter, repoFilter);
      const { owner: o, repo: r } = book.repo;
      sources.push("book");

      for (const skill of book.skills) {
        const haystacks: Array<[string, string, number]> = [
          ["title", `${skill.name} ${skill.title}`, 1],
          ["description", skill.description, 0.8],
          ["headings", skill.headings.map((h) => h.text).join(" "), 0.55],
          ["body", skill.body, 0.4],
        ];

        let best = 0;
        let matchedOn = "";
        let matchedAll = true;
        for (const token of tokens) {
          let tokenBest = 0;
          let tokenField = "";
          for (const [field, text, weight] of haystacks) {
            if (!text.toLowerCase().includes(token)) continue;
            if (weight > tokenBest) {
              tokenBest = weight;
              tokenField = field;
            }
          }
          if (tokenBest === 0) {
            matchedAll = false;
            break;
          }
          if (tokenBest > best) {
            best = tokenBest;
            matchedOn = tokenField;
          }
        }
        if (!matchedAll) continue;

        const chapterUrl = absoluteUrl(paths.chapter(o, r, skill.slug));
        results.push({
          type: "skill",
          book: `${o}/${r}`,
          skill: skill.slug,
          title: skill.name,
          description: skill.description || null,
          score: Number(best.toFixed(3)),
          matchedOn,
          // Cut from whatever actually matched. `description` almost always
          // exists, so a `snippet(description || body)` never reached the
          // body — a query for `pdfplumber` came back with a description that
          // does not contain the word, and nothing highlighted.
          snippet: snippet(snippetSource(matchedOn, skill), tokens),
          html: chapterUrl,
          markdown: `${chapterUrl}.md`,
          json: absoluteUrl(paths.chapterJson(o, r, skill.slug)),
          install: installCommand(o, r),
          installs: book.signal?.perSkillInstalls?.[skill.name] ?? null,
          origin: "book",
        });
      }
    } catch {
      // A deep search that cannot reach GitHub — missing repo, exhausted
      // quota — still returns the wide results rather than failing the query.
      // `sources` will not list "book", which is how the caller can tell.
    }
  }

  /* ------------------------------------------------ wide pass: shared index */

  const index = await getSearchIndex();
  sources.push("index");

  const seen = new Set(results.map((r) => `${r.book}/${r.skill}`.toLowerCase()));

  for (const hit of search(index, q)) {
    const { doc } = hit;
    if (!isLiteralMatch(doc, tokens)) continue;
    if (ownerFilter && doc.owner.toLowerCase() !== ownerFilter.toLowerCase()) continue;
    if (repoFilter && doc.repo.toLowerCase() !== repoFilter.toLowerCase()) continue;
    if (kind === "book" && doc.kind !== "book") continue;
    if (kind === "skill" && doc.kind !== "chapter") continue;
    if (doc.slug && seen.has(`${doc.owner}/${doc.repo}/${doc.slug}`.toLowerCase())) {
      continue;
    }

    const isBook = doc.kind === "book";
    results.push({
      type: isBook ? "book" : "skill",
      book: `${doc.owner}/${doc.repo}`,
      skill: doc.slug,
      title: doc.title,
      description: doc.subtitle,
      score: hit.score,
      matchedOn: hit.field,
      snippet: doc.subtitle ? snippet(doc.subtitle, tokens) : null,
      html: absoluteUrl(doc.href),
      markdown: isBook
        ? absoluteUrl(paths.bookMarkdown(doc.owner, doc.repo))
        : `${absoluteUrl(doc.href)}.md`,
      json: isBook
        ? absoluteUrl(paths.bookJson(doc.owner, doc.repo))
        : absoluteUrl(paths.chapterJson(doc.owner, doc.repo, doc.slug ?? "")),
      install: installCommand(doc.owner, doc.repo),
      installs: doc.installs || null,
      origin: "index",
    });
  }

  // Deep hits are scored on a 0–1 scale and index hits on the shared matcher's
  // own scale, so a global sort would mix rulers. Deep results come first
  // because they are the only ones that read the actual text, then each group
  // keeps its own ordering.
  const page = results.slice(cursor, cursor + limit);
  const nextCursor = cursor + limit < results.length ? String(cursor + limit) : null;

  return Response.json(
    {
      query: q,
      total: results.length,
      limit,
      cursor: cursor || null,
      nextCursor,
      sources,
      note: deep
        ? undefined
        : "Chapter bodies are searched only when both `owner` and `repo` are given. Without them this ranks book and chapter titles from the shared index.",
      results: page,
    },
    { headers: JSON_HEADERS },
  );
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}
