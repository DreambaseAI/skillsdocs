/**
 * The pure half of the chapter-context keyboard layer.
 *
 * The handlers themselves are asserted in a real browser by
 * `scripts/check-shortcuts.mts` — that is the only place a "does this shortcut
 * work" claim means anything. What is worth pinning here is the arithmetic
 * those handlers depend on, because each of these three functions has a wrong
 * answer that looks right: a prefix match that swallows a neighbouring repo, a
 * page-turn with no overlap, and a motion override that the OS quietly wins.
 */

import { describe, expect, it } from "vitest";
import {
  chapterSlugFromPath,
  motionIsReduced,
  pageScrollDistance,
} from "./book-shortcuts";

describe("which chapter a reading URL is in", () => {
  const cover = "/anthropics/skills";

  it("returns null on the cover", () => {
    expect(chapterSlugFromPath("/anthropics/skills", cover)).toBeNull();
    expect(chapterSlugFromPath("/anthropics/skills/", cover)).toBeNull();
  });

  it("reads the slug on a chapter", () => {
    expect(chapterSlugFromPath("/anthropics/skills/skill-creator", cover)).toBe(
      "skill-creator",
    );
  });

  it("reads the chapter's slug from inside a subchapter file", () => {
    // `]` has to work while you are reading a bundled script, three segments
    // deep, and the chapter is still the third segment.
    expect(
      chapterSlugFromPath(
        "/anthropics/skills/pdf/scripts/fill_fillable_fields.py",
        cover,
      ),
    ).toBe("pdf");
  });

  it("does not match a neighbouring repository", () => {
    // The reason this is segment-wise and not `pathname.startsWith(coverHref)`.
    expect(chapterSlugFromPath("/anthropics/skills-archive/foo", cover)).toBeNull();
    expect(chapterSlugFromPath("/anthropic/skills/foo", cover)).toBeNull();
  });

  it("compares decoded segments on both sides", () => {
    expect(chapterSlugFromPath("/anthropics/skills/a%20b", cover)).toBe("a b");
    expect(chapterSlugFromPath("/anthropics/skills/x", "/anthropics/skills")).toBe("x");
  });

  it("survives a malformed percent escape rather than throwing", () => {
    expect(chapterSlugFromPath("/anthropics/skills/%E0%A4%A", cover)).toBe("%E0%A4%A");
  });
});

describe("how far one page-turn moves", () => {
  it("leaves an overlap rather than turning a whole screen", () => {
    expect(pageScrollDistance(1000)).toBe(900);
    expect(pageScrollDistance(720)).toBe(648);
  });

  it("always moves at least one pixel", () => {
    // A zero-height viewport is a headless-measurement artefact, not a reason
    // for the key to become a no-op.
    expect(pageScrollDistance(0)).toBe(1);
  });
});

describe("the tri-state motion preference", () => {
  it("lets an explicit override beat the OS in both directions", () => {
    expect(motionIsReduced("reduce", false)).toBe(true);
    expect(motionIsReduced("allow", true)).toBe(false);
  });

  it("falls back to the OS when the reader has not chosen", () => {
    expect(motionIsReduced(undefined, true)).toBe(true);
    expect(motionIsReduced(null, false)).toBe(false);
    // "system" is written as the *absence* of the attribute, so an unexpected
    // value must behave like no value rather than like "allow".
    expect(motionIsReduced("system", true)).toBe(true);
  });
});
