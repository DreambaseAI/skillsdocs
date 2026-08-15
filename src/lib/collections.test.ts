import { describe, expect, it } from "vitest";
import {
  cleanItems,
  isUuidHandle,
  isValidName,
  isValidSlug,
  MAX_ITEMS,
  slugify,
} from "@/lib/collections";

describe("slugify", () => {
  it("folds a display name to the slug grammar", () => {
    expect(slugify("My Favourite Skills!")).toBe("my-favourite-skills");
    expect(slugify("  Weekend   reading  ")).toBe("weekend-reading");
  });

  it("strips accents rather than dropping the letters", () => {
    expect(slugify("Café Décor")).toBe("cafe-decor");
  });

  it("returns empty when nothing survives, for the caller to fall back", () => {
    expect(slugify("🎉🎉🎉")).toBe("");
    expect(slugify("   ")).toBe("");
  });

  it("caps at 60 characters without a trailing hyphen", () => {
    const long = slugify(`${"a".repeat(59)} b c`);
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith("-")).toBe(false);
  });
});

describe("isValidSlug", () => {
  it("accepts the shapes users will actually type", () => {
    expect(isValidSlug("my-shelf")).toBe(true);
    expect(isValidSlug("agents-2026")).toBe(true);
    expect(isValidSlug("abc")).toBe(true);
  });

  it("rejects the shapes that would break routing or reads", () => {
    expect(isValidSlug("ab")).toBe(false); // too short
    expect(isValidSlug("My-Shelf")).toBe(false); // uppercase
    expect(isValidSlug("-leading")).toBe(false);
    expect(isValidSlug("trailing-")).toBe(false);
    expect(isValidSlug("a/b")).toBe(false);
    expect(isValidSlug("a".repeat(61))).toBe(false);
  });

  it("rejects reserved words and uuid-shaped slugs", () => {
    expect(isValidSlug("new")).toBe(false);
    expect(isValidSlug("library")).toBe(false);
    // A uuid-shaped slug would be unreachable — handles check uuid first.
    expect(isValidSlug("123e4567-e89b-12d3-a456-426614174000")).toBe(false);
  });
});

describe("isUuidHandle", () => {
  it("recognises uuids in either case", () => {
    expect(isUuidHandle("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(isUuidHandle("123E4567-E89B-12D3-A456-426614174000")).toBe(true);
  });

  it("does not mistake slugs for uuids", () => {
    expect(isUuidHandle("my-shelf")).toBe(false);
    expect(isUuidHandle("123e4567-e89b-12d3-a456")).toBe(false);
  });
});

describe("isValidName", () => {
  it("wants something visible within the cap", () => {
    expect(isValidName("Weekend reading")).toBe(true);
    expect(isValidName("   ")).toBe(false);
    expect(isValidName("x".repeat(81))).toBe(false);
  });
});

describe("cleanItems", () => {
  it("keeps the grammar of the kind and preserves order", () => {
    expect(
      cleanItems("shelf", ["anthropics/skills", "vercel/ai", "not a key"]),
    ).toEqual(["anthropics/skills", "vercel/ai"]);
    expect(
      cleanItems("board", ["anthropics/skills/frontend-design", "a/b"]),
    ).toEqual(["anthropics/skills/frontend-design"]);
  });

  it("dedupes case-insensitively, first occurrence wins", () => {
    expect(
      cleanItems("shelf", ["Anthropics/Skills", "anthropics/skills"]),
    ).toEqual(["Anthropics/Skills"]);
  });

  it("rejects board keys on a shelf and vice versa", () => {
    expect(cleanItems("shelf", ["a/b/c"])).toEqual([]);
    expect(cleanItems("board", ["a/b"])).toEqual([]);
  });

  it("caps at the localStorage limits, not the URL limits", () => {
    const many = Array.from({ length: 600 }, (_, i) => `owner/repo-${i}/skill`);
    expect(cleanItems("board", many)).toHaveLength(MAX_ITEMS.board);
    expect(MAX_ITEMS.board).toBe(500);
  });
});
