/**
 * Cross-book search: index shape and matching.
 *
 * Deliberately dependency-free and side-effect-free. The whole corpus is ~90
 * books and ~2,200 chapter titles — about 110 KB of short strings. A real
 * search library (lunr, minisearch, fuse) would add 15–40 KB of runtime, an
 * inverted-index build step and a scoring model tuned for documents that are
 * paragraphs long, in exchange for nothing measurable at this size: a linear
 * scan over 2,300 records with four scored fields runs in well under a
 * millisecond.
 *
 * This module is imported by both server and client code, so it must never
 * import `next/cache`, `next/headers`, or anything that reaches the network.
 * Index *assembly* lives in `components/home/search-index.ts`.
 */

/** Longer queries are user error or an attack; nothing useful matches. */
export const MAX_QUERY = 128;

export interface SearchDoc {
  /** A whole repo, or one chapter inside it. */
  kind: "book" | "chapter";
  owner: string;
  repo: string;
  /** Chapter slug; null for a book. */
  slug: string | null;
  /** What the result is called. */
  title: string;
  /** One line under the title — the repo description, or the book it is in. */
  subtitle: string | null;
  /** Extra matchable text: headings, topics, layout shapes. */
  keywords: string[];
  installs: number;
  official: boolean;
  avatar: string;
  href: string;
}

/** Which field produced the strongest match, so the UI can say why. */
export type MatchField = "title" | "path" | "subtitle" | "keywords";

export interface SearchHit {
  doc: SearchDoc;
  score: number;
  field: MatchField;
}

/* ------------------------------------------------------------- normalising */

/**
 * Fold a string to the form the matcher compares against: lowercase, no
 * diacritics, and every run of punctuation collapsed to a single space.
 *
 * Collapsing punctuation is what makes `skill-creator`, `skill_creator` and
 * `skill creator` the same query. It also means a token can be matched at a
 * word boundary with a plain `indexOf(" " + token)` rather than a RegExp built
 * from user input.
 */
export function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Split a query into the tokens that must *all* match. */
export function tokenize(query: string): string[] {
  const normalized = normalize(query.slice(0, MAX_QUERY));
  if (!normalized) return [];
  // De-duplicate so "test test" is not twice as hard to satisfy as "test".
  return [...new Set(normalized.split(" "))].filter(Boolean).slice(0, 8);
}

/* ---------------------------------------------------------------- matching */

/**
 * The length of the tightest window of `haystack` containing every character
 * of `token` in order, or `null` if there is none.
 *
 * The span, not the bare yes/no, is what makes the fuzzy tier usable. Scan
 * forward to find where the match can end, then scan back from there to pull
 * the start as late as possible — the standard minimum-window-subsequence
 * tightening. Without it, "echarts" is a subsequence of
 * "better auth skills two factor authentication best practices" spread over 55
 * characters, which is not a typo, it is a coincidence.
 */
function subsequenceSpan(haystack: string, token: string): number | null {
  let i = 0;
  let end = -1;
  for (let j = 0; j < haystack.length && i < token.length; j++) {
    if (haystack[j] === token[i]) {
      i++;
      end = j;
    }
  }
  if (i < token.length) return null;

  let k = token.length - 1;
  let start = end;
  for (let j = end; j >= 0 && k >= 0; j--) {
    if (haystack[j] === token[k]) {
      k--;
      start = j;
    }
  }
  return end - start + 1;
}

/**
 * How many characters a fuzzy match may skip over.
 *
 * A budget, not a ratio. A ratio scales the wrong way: it is *long* queries
 * that need tightening — "sct" spread over 13 characters of "skill creator" is
 * a plausible acronym, "echarts" spread over 31 characters of
 * "obra superpowers dispatching parallel agents" is not, and 5× admits both.
 * Twelve skipped characters covers every acronym and deletion typo in the
 * corpus and nothing longer.
 */
const MAX_FUZZY_SKIPPED = 12;

/**
 * How well a single token matches one field, 0–1.
 *
 * The ladder is ordered by how much the match tells you the reader meant this
 * result: an exact field is unambiguous, a prefix is what someone typing has
 * produced so far, an interior substring is weaker, and a subsequence is the
 * "did you mean" tier that only ever breaks ties.
 *
 * `fuzzy` gates that last tier. It is right for a title or a path — `sct`
 * should still find `skill-creator` — and badly wrong for a sentence: almost
 * every three-letter query is a subsequence of a forty-word description, so
 * enabling it there turns every long repo blurb into a match for everything.
 * Even on a path it is bounded by `MAX_FUZZY_SKIPPED`.
 */
export function fieldScore(haystack: string, token: string, fuzzy = true): number {
  if (!haystack || !token) return 0;
  if (haystack === token) return 1;
  if (haystack.startsWith(token)) return 0.8;
  if (haystack.includes(` ${token}`)) return 0.65;
  if (haystack.includes(token)) return 0.45;
  if (fuzzy && token.length >= 3) {
    const span = subsequenceSpan(haystack, token);
    if (span !== null && span - token.length <= MAX_FUZZY_SKIPPED) return 0.16;
  }
  return 0;
}

/** Field weights. Title dominates; keywords only ever break a tie. */
const WEIGHTS: Record<MatchField, number> = {
  title: 10,
  path: 6,
  subtitle: 3,
  keywords: 2,
};

/** Only short, name-like fields are worth fuzzy-matching. See `fieldScore`. */
const FUZZY: Record<MatchField, boolean> = {
  title: true,
  path: true,
  subtitle: false,
  keywords: false,
};

interface Folded {
  doc: SearchDoc;
  title: string;
  path: string;
  subtitle: string;
  keywords: string;
  /** log10(installs) capped — a popularity nudge, never a rank override. */
  popularity: number;
}

/**
 * Pre-fold an index so a query does not re-normalise 2,300 records per
 * keystroke. Cheap enough to do inline for a one-shot search, worth hoisting
 * for a palette.
 */
export function foldIndex(docs: readonly SearchDoc[]): Folded[] {
  return docs.map((doc) => ({
    doc,
    title: normalize(doc.title),
    path: normalize(`${doc.owner} ${doc.repo}${doc.slug ? ` ${doc.slug}` : ""}`),
    subtitle: normalize(doc.subtitle ?? ""),
    keywords: normalize(doc.keywords.join(" ")),
    popularity: Math.min(4, Math.log10(doc.installs + 1)),
  }));
}

export type FoldedIndex = ReturnType<typeof foldIndex>;

/** Below this ratio a match is the fuzzy "did you mean" tier. */
const STRONG = 0.45;

interface Scored extends SearchHit {
  /** At least one token matched as a real substring, not a subsequence. */
  strong: boolean;
}

function scoreOne(entry: Folded, tokens: string[]): Scored | null {
  let total = 0;
  let best = 0;
  let bestField: MatchField = "title";
  let strong = false;

  for (const token of tokens) {
    let tokenBest = 0;
    let tokenRatio = 0;
    let tokenField: MatchField = "title";

    for (const field of ["title", "path", "subtitle", "keywords"] as const) {
      const ratio = fieldScore(entry[field], token, FUZZY[field]);
      const value = WEIGHTS[field] * ratio;
      if (value > tokenBest) {
        tokenBest = value;
        tokenRatio = ratio;
        tokenField = field;
      }
    }

    // Every token must land somewhere, or this is not a result — an OR match
    // over a corpus this small returns the whole corpus for any two words.
    if (tokenBest === 0) return null;
    if (tokenRatio >= STRONG) strong = true;

    total += tokenBest;
    if (tokenBest > best) {
      best = tokenBest;
      bestField = tokenField;
    }
  }

  // A book outranks its own chapters at equal textual strength: someone who
  // typed the repo name wants the book, and the chapters are one click away.
  if (entry.doc.kind === "book") total += 1.5;
  if (entry.doc.official) total += 0.5;
  total += entry.popularity;

  return { doc: entry.doc, score: Math.round(total * 1000) / 1000, field: bestField, strong };
}

export interface SearchOptions {
  limit?: number;
  /** Restrict to books or to chapters. */
  kind?: SearchDoc["kind"];
}

/** Rank a pre-folded index. Empty query returns nothing, never everything. */
export function searchFolded(
  index: FoldedIndex,
  query: string,
  options: SearchOptions = {},
): SearchHit[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const scored: Scored[] = [];
  let anyStrong = false;
  for (const entry of index) {
    if (options.kind && entry.doc.kind !== options.kind) continue;
    const hit = scoreOne(entry, tokens);
    if (!hit) continue;
    anyStrong ||= hit.strong;
    scored.push(hit);
  }

  // The fuzzy tier exists to rescue a typo, not to pad a good result set. Once
  // anything matched properly, "pdf" must stop offering `expo-cicd-workflows`
  // on the grounds that p, d and f appear in it in that order.
  const hits: SearchHit[] = (anyStrong ? scored.filter((hit) => hit.strong) : scored).map(
    ({ doc, score, field }) => ({ doc, score, field }),
  );

  hits.sort(
    (a, b) =>
      b.score - a.score ||
      b.doc.installs - a.doc.installs ||
      a.doc.title.localeCompare(b.doc.title) ||
      a.doc.href.localeCompare(b.doc.href),
  );

  return typeof options.limit === "number" ? hits.slice(0, options.limit) : hits;
}

/** Convenience wrapper for one-shot searches over a raw index. */
export function search(
  docs: readonly SearchDoc[],
  query: string,
  options: SearchOptions = {},
): SearchHit[] {
  return searchFolded(foldIndex(docs), query, options);
}

/* -------------------------------------------------------------- highlights */

export interface Segment {
  text: string;
  hit: boolean;
}

/**
 * Split `text` so matched runs can be marked up.
 *
 * Works on the original string, not the folded one, so the returned segments
 * concatenate back to exactly what was passed in — the results page renders
 * these directly and must not silently alter a repo's own words.
 */
export function highlight(text: string, query: string): Segment[] {
  const tokens = tokenize(query).filter((t) => t.length >= 2);
  if (tokens.length === 0 || !text) return [{ text, hit: false }];

  const folded = text.toLowerCase();
  const marks = new Uint8Array(text.length);
  let matched = false;

  for (const token of tokens) {
    let from = folded.indexOf(token);
    while (from !== -1) {
      marks.fill(1, from, from + token.length);
      matched = true;
      from = folded.indexOf(token, from + token.length);
    }
  }
  if (!matched) return [{ text, hit: false }];

  const segments: Segment[] = [];
  let start = 0;
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || marks[i] !== marks[start]) {
      segments.push({ text: text.slice(start, i), hit: marks[start] === 1 });
      start = i;
    }
  }
  return segments;
}
