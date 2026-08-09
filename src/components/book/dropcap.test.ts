import { describe, expect, it } from "vitest";
import type { Root } from "hast";

import { dropCapMode, shouldDropCap } from "./dropcap";

/**
 * The old gate produced a decorated opener on chapter 01 and a bare paragraph
 * on chapter 02 with no explanation — measured at 39 of 111 chapters (35%)
 * across five repositories, and refusing `skill-creator`, the flagship, on a
 * 63-character opening sentence. Inconsistency is worse than absence.
 */

function root(...children: Root["children"]): Root {
  return { type: "root", children };
}

function p(text: string): Root["children"][number] {
  return {
    type: "element",
    tagName: "p",
    properties: {},
    children: [{ type: "text", value: text }],
  };
}

function el(tagName: string): Root["children"][number] {
  return { type: "element", tagName, properties: {}, children: [] };
}

const LONG = "A".repeat(95) + " " + "b".repeat(95);
const SHORT = "Create new skills, and improve existing ones.";

describe("dropCapMode", () => {
  it("sinks a cap when the opening paragraph can carry three lines", () => {
    expect(dropCapMode(root(p(LONG)))).toBe("sunk");
  });

  it("raises an initial when the opener is too short to sink one", () => {
    // 44 characters — `skill-creator`'s real opener is 63 and got nothing.
    expect(dropCapMode(root(p(SHORT)))).toBe("raised");
  });

  it("looks past a section heading to the first real paragraph", () => {
    // 11 of the 17 `anthropics/skills` chapters open `## Overview` and then
    // their first sentence. Refusing those held coverage at 35%.
    expect(dropCapMode(root(el("h2"), p(LONG)))).toBe("sunk");
    expect(dropCapMode(root(el("h2"), el("h3"), p(SHORT)))).toBe("raised");
  });

  it("refuses a document that opens on a fence, a table or a list", () => {
    for (const tag of ["pre", "table", "ul", "ol", "div", "figure"]) {
      expect(dropCapMode(root(el(tag), p(LONG)))).toBe("none");
    }
  });

  it("refuses a badge row, where ::first-letter would match nothing", () => {
    const badges: Root["children"][number] = {
      type: "element",
      tagName: "p",
      properties: {},
      children: [{ type: "element", tagName: "img", properties: {}, children: [] }],
    };
    expect(dropCapMode(root(badges))).toBe("none");
  });

  it("refuses an opener that does not begin on a word", () => {
    expect(dropCapMode(root(p(`"${LONG}`)))).toBe("none");
    expect(dropCapMode(root(p(`— ${LONG}`)))).toBe("none");
  });

  it("ignores the document-wide code ratio, which is not its business", () => {
    // The old gate vetoed the cap whenever fenced code was over 25% of the
    // document, which said nothing about whether *this* paragraph could carry
    // one and refused four otherwise perfect openers.
    expect(dropCapMode(root(p(LONG), el("pre"), el("pre"), el("pre")))).toBe("sunk");
  });

  it("keeps the boolean shim honest", () => {
    expect(shouldDropCap(root(p(LONG)))).toBe(true);
    expect(shouldDropCap(root(p(SHORT)))).toBe(false);
  });
});
