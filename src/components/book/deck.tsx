import { Fragment } from "react";

import { deckTokens, inlineTokens, type InlineToken } from "@/lib/deck";
import { cn } from "@/lib/utils";

/**
 * Typeset a frontmatter string.
 *
 * Frontmatter never enters the remark pipeline, so before this component the
 * chapter opener printed `` `anthropic` `` with its backticks visible at 24px
 * and set `skill's` with a straight U+0027 two inches above a body that set
 * `user’s` with a curly one. `deckTokens` does the punctuation and the inline
 * markup; this only decides which element each token gets.
 *
 * Links are flattened to their label on purpose. A deck is a promise about the
 * chapter below it, and a link out of it is a promise broken.
 */

function render(tokens: InlineToken[]) {
  return tokens.map((token, i) => {
    switch (token.type) {
      case "code":
        return <code key={i}>{token.value}</code>;
      case "strong":
        return <strong key={i}>{token.value}</strong>;
      case "em":
        return <em key={i}>{token.value}</em>;
      default:
        return <Fragment key={i}>{token.value}</Fragment>;
    }
  });
}

export interface DeckProps {
  /** The raw frontmatter description. */
  text: string;
  /** Character budget for the deck. */
  max?: number;
  className?: string;
}

/** The bounded, typeset opening line of a chapter or a book. */
export function Deck({ text, max, className }: DeckProps) {
  const tokens = deckTokens(text, max === undefined ? {} : { max });
  if (tokens.length === 0) return null;
  return <p className={cn("book-standfirst", className)}>{render(tokens)}</p>;
}

export interface InlineProps {
  text: string;
  className?: string;
}

/**
 * The same typesetting with no bounding, for places that have already decided
 * how much text to show (a contents dek, an index row, a search snippet).
 */
export function InlineMarkup({ text, className }: InlineProps) {
  const tokens = inlineTokens(text);
  if (tokens.length === 0) return null;
  if (!className) return <>{render(tokens)}</>;
  return <span className={className}>{render(tokens)}</span>;
}
