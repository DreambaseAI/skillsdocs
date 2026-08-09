/**
 * Decks, deks and dot-leader labels — turning a router string into a sentence.
 *
 * A `SKILL.md` frontmatter `description` is written for a model, not a reader.
 * The measured corpus is brutal about this: across the 17 chapters of
 * `anthropics/skills` the description averaged 9.5× the height of the title it
 * sat under, and `claude-api` set 1,068 characters — 22 lines, including a raw
 * `grep -rE '…'` — before a single word of the chapter. Rendered verbatim at
 * 1.25em it is not a standfirst, it is a wall.
 *
 * So the description gets two jobs instead of one:
 *
 *   - a **deck**, bounded to a sentence or two and at most `DECK_MAX_CHARS`,
 *     typeset like editorial copy, at the top of the chapter;
 *   - the **trigger**, the full untouched string, set in mono in the chapter's
 *     apparatus where a reader who wants to know exactly what fires this skill
 *     can read exactly what fires it.
 *
 * Everything here is pure and unit-tested. The React side is
 * `src/components/book/deck.tsx`.
 */

import { smartenText } from "@/lib/markdown/typography";

/** A deck longer than this stops being a deck and starts being the article. */
export const DECK_MAX_CHARS = 180;

/** Truncation budget for a one-line dek in a contents row or an index row. */
export const DEK_MAX_CHARS = 132;

/**
 * Abbreviations whose full stop is not the end of a sentence.
 *
 * Without this, "Use this skill when e.g. the user asks…" decks as
 * "Use this skill when e.g." — which is worse than not truncating at all.
 */
const ABBREVIATIONS = new Set([
  "e.g",
  "i.e",
  "etc",
  "vs",
  "cf",
  "approx",
  "no",
  "fig",
  "mr",
  "mrs",
  "ms",
  "dr",
  "st",
  "inc",
  "ltd",
  "jr",
  "sr",
]);

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Is the full stop at `i` a sentence boundary?
 *
 * Requires whitespace and then an opening character after it, and refuses the
 * three shapes that produce false positives in this corpus: a single-letter
 * initialism (`e.g.`), a known abbreviation, and a dotted identifier
 * (`SKILL.md`, `package.json`, `v1.2`) where the stop has no space after it —
 * that last case is already excluded by the whitespace requirement.
 */
function isSentenceEnd(text: string, i: number): boolean {
  const ch = text[i];
  if (ch !== "." && ch !== "!" && ch !== "?") return false;

  // Consume a closing quote or bracket that belongs to the sentence.
  let j = i + 1;
  while (j < text.length && /[)\]"'”’]/.test(text[j])) j++;

  if (j >= text.length) return true;
  if (text[j] !== " ") return false;

  const next = text.slice(j + 1);
  // A new sentence opens on a capital, a digit, a quote or a bracket.
  if (!/^[A-Z0-9"“'‘(\[`]/.test(next)) return false;

  if (ch === ".") {
    const before = text.slice(0, i);
    const word = /([A-Za-z.]+)$/.exec(before)?.[1] ?? "";
    if (word.length === 1) return false;
    if (ABBREVIATIONS.has(word.toLowerCase())) return false;
  }
  return true;
}

/** Index just past the end of the first sentence, or -1. */
function firstSentenceEnd(text: string, from = 0): number {
  for (let i = from; i < text.length; i++) {
    if (isSentenceEnd(text, i)) {
      let j = i + 1;
      while (j < text.length && /[)\]"'”’]/.test(text[j])) j++;
      return j;
    }
  }
  return -1;
}

/**
 * Truncate on a word boundary and append a true ellipsis.
 *
 * Never mid-token, never after a hyphen (`Anthropic's look-…` was a real
 * output), never with a space before the ellipsis.
 */
export function truncateWords(text: string, max: number): string {
  const clean = collapse(text);
  if (clean.length <= max) return clean;

  // Leave room for the ellipsis itself.
  const budget = Math.max(1, max - 1);
  let cut = clean.lastIndexOf(" ", budget);
  if (cut < Math.floor(budget * 0.5)) cut = budget;

  let head = clean.slice(0, cut);
  // Trailing punctuation before an ellipsis reads as a typo; a trailing hyphen
  // reads as a broken compound.
  head = head.replace(/[\s,;:.!?/–—-]+$/u, "");
  if (head === "") head = clean.slice(0, budget).trimEnd();
  return `${head}…`;
}

export interface DeckOptions {
  /** Hard character budget. Defaults to {@link DECK_MAX_CHARS}. */
  max?: number;
}

/**
 * The deck as plain text: the first sentence of a description, bounded.
 *
 * A very short opening sentence ("Create Excel files.") is joined to the one
 * after it when both still fit — one four-word deck under a 46px title looks
 * like a mistake, two sentences look like a decision.
 */
export function deckOf(
  description: string | null | undefined,
  options: DeckOptions = {},
): string {
  return deckTokens(description, options)
    .map((t) => t.value)
    .join("");
}

/**
 * The deck as inline tokens, so the renderer can typeset code spans and
 * emphasis instead of printing backticks at 24px.
 *
 * Bounding happens in *plain-text* space — the markup characters do not count
 * against the budget, and the cut can never land inside a code span, because
 * the tokens are sliced rather than the source string.
 */
export function deckTokens(
  description: string | null | undefined,
  options: DeckOptions = {},
): InlineToken[] {
  const max = options.max ?? DECK_MAX_CHARS;
  const source = collapse(description ?? "");
  if (source === "") return [];

  const tokens = inlineTokens(source);
  const plain = tokens.map((t) => t.value).join("");

  let cut = firstSentenceEnd(plain);
  if (cut === -1) cut = plain.length;
  if (cut < 64) {
    const second = firstSentenceEnd(plain, cut);
    const extended = second === -1 ? plain.length : second;
    if (extended <= max) cut = extended;
  }

  const head = plain.slice(0, cut).trimEnd();
  const bounded = truncateWords(head, max);
  const truncated = bounded.endsWith("…") && !head.endsWith("…");
  const keep = truncated ? bounded.length - 1 : bounded.length;

  const out = sliceTokens(tokens, keep);
  if (truncated) out.push({ type: "text", value: "…" });
  return out;
}

/** Take the first `count` plain-text characters, preserving token kinds. */
function sliceTokens(tokens: InlineToken[], count: number): InlineToken[] {
  const out: InlineToken[] = [];
  let taken = 0;
  for (const token of tokens) {
    if (taken >= count) break;
    const room = count - taken;
    if (token.value.length <= room) {
      out.push(token);
      taken += token.value.length;
    } else {
      out.push({ ...token, value: token.value.slice(0, room) });
      taken = count;
    }
  }
  return out;
}

/**
 * A one-line dek for a contents row or an index row.
 *
 * Same sentence logic, a tighter budget, and the leading "Use this skill
 * when…" boilerplate left intact — it is the single most useful thing a
 * router-written description says, and cutting it would be editorialising
 * someone else's repository.
 */
export function dekOf(description: string | null | undefined, max = DEK_MAX_CHARS): string {
  return deckOf(description, { max });
}

/* --------------------------------------------------------------- markup */

export type InlineToken =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "strong"; value: string }
  | { type: "em"; value: string };

const CODE = /`+([^`]+?)`+/;
const LINK = /!?\[([^\]]*)\]\((?:[^()\s]|\([^()]*\))*\)/;
const STRONG = /(\*\*|__)(?=\S)([\s\S]*?\S)\1/;
const EM = /(?<![*\w])(\*|_)(?=\S)([^*_]*?\S)\1(?![*\w])/;

/**
 * Tokenise the inline markdown a frontmatter description may contain.
 *
 * Deliberately tiny: code spans, emphasis, strong, and links reduced to their
 * label. It does not need to be a markdown parser — it needs to stop backticks
 * and asterisks from being printed as literal characters in 24px display type,
 * which is what was happening.
 *
 * Order matters. Code is matched first because its contents are literal, so
 * `` `**not bold**` `` stays as written.
 */
export function inlineTokens(input: string): InlineToken[] {
  const out: InlineToken[] = [];
  let rest = input;

  const push = (token: InlineToken) => {
    if (token.value === "") return;
    const last = out[out.length - 1];
    if (token.type === "text" && last?.type === "text") last.value += token.value;
    else out.push(token);
  };

  while (rest !== "") {
    const code = CODE.exec(rest);
    const link = LINK.exec(rest);
    const strong = STRONG.exec(rest);
    const em = EM.exec(rest);

    interface Candidate {
      at: number;
      len: number;
      token: InlineToken;
    }

    const candidates: Candidate[] = [];
    if (code) {
      candidates.push({
        at: code.index,
        len: code[0].length,
        token: { type: "code", value: code[1] },
      });
    }
    if (link) {
      candidates.push({
        at: link.index,
        len: link[0].length,
        token: { type: "text", value: link[1] },
      });
    }
    if (strong) {
      candidates.push({
        at: strong.index,
        len: strong[0].length,
        token: { type: "strong", value: strong[2] },
      });
    }
    if (em) {
      candidates.push({
        at: em.index,
        len: em[0].length,
        token: { type: "em", value: em[2] },
      });
    }

    if (candidates.length === 0) {
      push({ type: "text", value: smartenText(rest) });
      break;
    }

    candidates.sort((a, b) => a.at - b.at || b.len - a.len);
    const hit = candidates[0];
    if (hit.at > 0) push({ type: "text", value: smartenText(rest.slice(0, hit.at)) });
    push(
      hit.token.type === "code"
        ? hit.token
        : { ...hit.token, value: smartenText(hit.token.value) },
    );
    rest = rest.slice(hit.at + hit.len);
  }

  return out;
}

/**
 * Flatten inline markup to plain text.
 *
 * Used where the destination cannot carry elements — `<title>`, an OG
 * description, an `aria-label`, the sentence-splitting pass above.
 */
export function stripInlineMarkup(
  input: string,
  options: { keepText?: boolean } = {},
): string {
  if (input === "") return "";
  const tokens = inlineTokens(input);
  const text = tokens.map((t) => t.value).join("");
  return options.keepText ? text : collapse(text);
}
