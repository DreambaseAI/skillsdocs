/**
 * `Accept` negotiation is the one part of the proxy with real logic in it, and
 * the one place a plausible-looking shortcut breaks every browser: a naive
 * `accept.includes("text/markdown")` is fine, but any check that treats `*​/*`
 * as a markdown request would serve plain text to Chrome.
 */

import { describe, expect, it } from "vitest";
import { prefersMarkdown } from "./proxy";

/** What Chrome, Safari and Firefox actually send for a top-level navigation. */
const BROWSER =
  "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8";

describe("prefersMarkdown", () => {
  it("says no for a browser navigation", () => {
    expect(prefersMarkdown(BROWSER)).toBe(false);
  });

  it("says no for a missing or wildcard Accept", () => {
    expect(prefersMarkdown("")).toBe(false);
    expect(prefersMarkdown("*/*")).toBe(false);
    expect(prefersMarkdown("text/*")).toBe(false);
  });

  it("says yes when markdown is asked for outright", () => {
    expect(prefersMarkdown("text/markdown")).toBe(true);
    expect(prefersMarkdown("text/x-markdown")).toBe(true);
    expect(prefersMarkdown("text/markdown, */*;q=0.1")).toBe(true);
  });

  it("respects q-values in both directions", () => {
    expect(prefersMarkdown("text/markdown;q=0.9,text/html;q=0.8")).toBe(true);
    expect(prefersMarkdown("text/markdown;q=0.5,text/html;q=0.9")).toBe(false);
    // A tie goes to HTML: markdown has to actually outrank it.
    expect(prefersMarkdown("text/markdown;q=0.8,text/html;q=0.8")).toBe(false);
    expect(prefersMarkdown("text/markdown;q=0")).toBe(false);
  });

  it("ignores whitespace, casing and unrelated parameters", () => {
    expect(prefersMarkdown(" TEXT/MARKDOWN ; charset=utf-8 , text/html;q=0.4")).toBe(
      true,
    );
  });

  it("takes the best q-value when a type is listed twice", () => {
    expect(prefersMarkdown("text/markdown;q=0.1,text/markdown;q=1,text/html;q=0.9")).toBe(
      true,
    );
  });
});
