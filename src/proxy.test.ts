/**
 * `Accept` negotiation is the one part of the proxy with real logic in it, and
 * the one place a plausible-looking shortcut breaks every browser: a naive
 * `accept.includes("text/markdown")` is fine, but any check that treats `*​/*`
 * as a markdown request would serve plain text to Chrome.
 */

import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { decodedPath, prefersMarkdown, proxy } from "./proxy";

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

describe("decodedPath", () => {
  it("leaves a plain path untouched", () => {
    expect(decodedPath("/anthropics/skills/skill-creator.md")).toBe(
      "/anthropics/skills/skill-creator.md",
    );
  });

  /**
   * `paths.chapterMarkdown()` percent-encodes the slug, and that URL is what
   * `<link rel="alternate">`, `llms.txt`, the book's table of contents and the
   * agent-skills manifest all print. `%` is not in `READER_ROUTE`'s character
   * class, so the rewrite was skipped and the advertised URL served HTML.
   */
  it("decodes escapes so an encoded slug still matches the reader route", () => {
    expect(decodedPath("/anthropics/skills/skill%2Dcreator.md")).toBe(
      "/anthropics/skills/skill-creator.md",
    );
    expect(decodedPath("/acme/skills/caf%C3%A9.md")).toBe("/acme/skills/café.md");
  });

  it("refuses to let %2F invent a path segment", () => {
    expect(decodedPath("/acme/sk%2Fills")).toBe("/acme/sk%2Fills");
  });

  it("survives a malformed escape", () => {
    expect(decodedPath("/acme/%zz")).toBe("/acme/%zz");
  });
});

describe("proxy routing", () => {
  const req = (path: string, accept?: string) =>
    new NextRequest(`https://example.test${path}`, {
      headers: accept ? { accept } : undefined,
    });

  const rewriteTarget = (res: Response) =>
    res.headers.get("x-middleware-rewrite");

  it("rewrites a percent-encoded chapter .md onto the markdown handler", () => {
    const target = rewriteTarget(proxy(req("/anthropics/skills/skill%2Dcreator.md")));
    expect(target).toContain("/api/md/anthropics/skills/skill-creator");
  });

  it("sets Vary: Accept on the HTML variant, not only the markdown one", () => {
    const html = proxy(req("/anthropics/skills"));
    expect(html.headers.get("vary")).toBe("Accept");

    const md = proxy(req("/anthropics/skills", "text/markdown"));
    expect(md.headers.get("vary")).toBe("Accept");
    expect(rewriteTarget(md)).toContain("/api/md/anthropics/skills");
  });

  it("advertises the book's own machine twins on the HTML response", () => {
    const link = proxy(req("/anthropics/skills")).headers.get("link") ?? "";
    expect(link).toContain('</anthropics/skills.md>; rel="alternate"; type="text/markdown"');
    expect(link).toContain(
      '</anthropics/skills/.well-known/agent-skills/index.json>; rel="agent-skills"',
    );
    expect(link).toContain('</api/v1/books/anthropics/skills>');
  });
});

describe("reserved first segments are not books", () => {
  const req = (path: string, accept?: string) =>
    new NextRequest(`https://example.test${path}`, {
      headers: accept ? { accept } : undefined,
    });

  /**
   * `/api/v1/health` fits the shape of `/owner/repo/skill` exactly, so the
   * reader branch claimed it: the health endpoint advertised
   * `</api/v1/health.md>` and `</api/v1/.well-known/agent-skills/index.json>`,
   * and `Accept: text/markdown` on it rewrote to `/api/md/api/v1/health`.
   */
  it("leaves /api/* alone", () => {
    const res = proxy(req("/api/v1/health"));
    expect(res.headers.get("link")).not.toContain("/api/v1/health.md");
    expect(proxy(req("/api/v1/health", "text/markdown")).headers.get("x-middleware-rewrite"))
      .toBeNull();
  });

  it("leaves /search alone", () => {
    expect(proxy(req("/search/foo")).headers.get("link")).not.toContain(
      "/search/foo.md",
    );
  });
});
