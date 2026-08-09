import { describe, expect, it } from "vitest";

import {
  DECK_MAX_CHARS,
  deckOf,
  deckTokens,
  dekOf,
  inlineTokens,
  stripInlineMarkup,
  truncateWords,
} from "./deck";

/**
 * The deck exists because a `SKILL.md` frontmatter `description` is written
 * for a router, not a reader. Measured before this module, the `claude-api`
 * chapter of `anthropics/skills` set 1,068 characters of trigger conditions —
 * including a raw `grep -rE '…'` with its backticks visible — at 23.75px under
 * a 46.4px title: a 758px standfirst, 23.7× the height of the title.
 */

const CLAUDE_API =
  "Reference for the Claude API / Anthropic SDK. Covers model ids, pricing, " +
  "params, streaming, tool use, MCP, agents, caching, token counting, model " +
  "migration. TRIGGER — read BEFORE opening the target file; don't skip " +
  "because it \"looks like a one-liner\" — whenever the prompt names Claude in " +
  "any form. SKIP only when another provider is being worked on.";

describe("deckOf", () => {
  it("cuts a router description down to the sentences that fit", () => {
    // 1,068 characters in, 155 out — and the trigger clause, the shouting and
    // the `grep` are all left for the apparatus block at the foot of the
    // chapter, where a machine instruction belongs.
    expect(deckOf(CLAUDE_API)).toBe(
      "Reference for the Claude API / Anthropic SDK. Covers model ids, pricing, " +
        "params, streaming, tool use, MCP, agents, caching, token counting, " +
        "model migration.",
    );
    expect(deckOf(CLAUDE_API)).not.toContain("TRIGGER");
  });

  it("never exceeds the budget, whatever the source", () => {
    const runOn = "word ".repeat(400);
    expect(deckOf(runOn).length).toBeLessThanOrEqual(DECK_MAX_CHARS);
    expect(deckOf(CLAUDE_API).length).toBeLessThanOrEqual(DECK_MAX_CHARS);
  });

  it("keeps a second sentence when the first is too short to stand alone", () => {
    // `skill-creator`'s real description: a 63-character opener.
    expect(
      deckOf("Create new skills. Measure their performance with evals."),
    ).toBe("Create new skills. Measure their performance with evals.");
  });

  it("does not split on an abbreviation or an initialism", () => {
    expect(deckOf("Use this skill when e.g. the user asks for a chart.")).toBe(
      "Use this skill when e.g. the user asks for a chart.",
    );
  });

  it("does not split inside a dotted identifier", () => {
    expect(deckOf("Edit SKILL.md files in place. Then validate them.")).toBe(
      "Edit SKILL.md files in place. Then validate them.",
    );
  });

  it("returns an empty string for nothing", () => {
    expect(deckOf("")).toBe("");
    expect(deckOf(null)).toBe("");
    expect(deckOf(undefined)).toBe("");
  });
});

describe("truncateWords", () => {
  it("cuts on a word boundary, never mid-token", () => {
    const out = truncateWords("Community-contributed instructions for agents", 30);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/instr…$/);
  });

  it("never leaves a hyphen or a space before the ellipsis", () => {
    // Both were real outputs: `Anthropic's look-…` and `… asks …`.
    expect(truncateWords("Anthropic's look- and-feel guide for decks", 20)).not.toMatch(
      /-…$/,
    );
    expect(truncateWords("you should use this skill when the user asks", 40)).not.toMatch(
      / …$/,
    );
  });

  it("leaves text inside the budget completely alone", () => {
    expect(truncateWords("Short enough.", 40)).toBe("Short enough.");
  });

  it("collapses whitespace", () => {
    expect(truncateWords("a  \n b", 40)).toBe("a b");
  });
});

describe("inlineTokens", () => {
  it("typesets a code span instead of printing its backticks", () => {
    expect(inlineTokens("use `npx skills add` first")).toEqual([
      { type: "text", value: "use " },
      { type: "code", value: "npx skills add" },
      { type: "text", value: " first" },
    ]);
  });

  it("leaves the inside of a code span literal", () => {
    expect(inlineTokens("`**not bold**`")).toEqual([
      { type: "code", value: "**not bold**" },
    ]);
  });

  it("curls the apostrophe the body pipeline would have curled", () => {
    // `skill's` used to render with U+0027 two inches above a body that set
    // `user’s` with U+2019, because frontmatter never enters remark.
    expect(stripInlineMarkup("the skill's name")).toBe("the skill’s name");
  });

  it("reduces a link to its label", () => {
    expect(stripInlineMarkup("see [the spec](https://example.com/x)")).toBe(
      "see the spec",
    );
  });

  it("marks emphasis without printing the asterisks", () => {
    expect(inlineTokens("**always** run it")).toEqual([
      { type: "strong", value: "always" },
      { type: "text", value: " run it" },
    ]);
  });
});

describe("deckTokens", () => {
  it("bounds in plain-text space so markup never counts against the budget", () => {
    const text = "`a`".repeat(80);
    const plain = deckTokens(text)
      .map((t) => t.value)
      .join("");
    expect(plain.length).toBeLessThanOrEqual(DECK_MAX_CHARS);
  });

  it("never cuts inside a code span", () => {
    const tokens = deckTokens(`${"word ".repeat(40)}\`an-identifier-that-is-long\``);
    for (const token of tokens) {
      if (token.type === "code") {
        expect("an-identifier-that-is-long").toContain(token.value);
      }
    }
  });
});

describe("dekOf", () => {
  it("uses a tighter budget than the chapter deck", () => {
    const long = "A ".repeat(300);
    expect(dekOf(long).length).toBeLessThan(DECK_MAX_CHARS);
  });
});
