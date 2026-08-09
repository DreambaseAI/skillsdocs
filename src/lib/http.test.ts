/**
 * Conditional-request behaviour on the agent surfaces.
 *
 * Before this, no `.md`, JSON or `.well-known` response carried an `ETag`,
 * `Last-Modified` or `Content-Length`, while `cache-control: max-age=0`
 * instructed every client to revalidate — with nothing to revalidate against.
 * An agent polling `anthropics/skills.md` re-downloaded 240,952 bytes each
 * time.
 */

import { describe, expect, it } from "vitest";
import { etagOf, matchesEtag, serveBody, serveJson } from "./http";

const GET = (headers?: Record<string, string>) =>
  new Request("https://example.test/anthropics/skills.md", { headers });

describe("etagOf", () => {
  it("is stable for identical bytes and distinct for different ones", () => {
    expect(etagOf("hello")).toBe(etagOf("hello"));
    expect(etagOf("hello")).not.toBe(etagOf("hello "));
    expect(etagOf("hello")).toMatch(/^"[0-9a-f]{32}"$/);
  });
});

describe("matchesEtag", () => {
  const tag = etagOf("body");

  it("matches an exact tag, a weak tag and a wildcard", () => {
    expect(matchesEtag(GET({ "if-none-match": tag }), tag)).toBe(true);
    expect(matchesEtag(GET({ "if-none-match": `W/${tag}` }), tag)).toBe(true);
    expect(matchesEtag(GET({ "if-none-match": "*" }), tag)).toBe(true);
    expect(matchesEtag(GET({ "if-none-match": `"other", ${tag}` }), tag)).toBe(true);
  });

  it("does not match a stale tag or an absent header", () => {
    expect(matchesEtag(GET({ "if-none-match": '"stale"' }), tag)).toBe(false);
    expect(matchesEtag(GET(), tag)).toBe(false);
  });
});

describe("serveBody", () => {
  it("sets ETag and Content-Length on a 200", async () => {
    const res = serveBody(GET(), "hello ✓", { "content-type": "text/markdown" });
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toBe(etagOf("hello ✓"));
    // Bytes, not code units: the tick is three bytes in UTF-8.
    expect(res.headers.get("content-length")).toBe("9");
    expect(await res.text()).toBe("hello ✓");
  });

  it("answers 304 with no body when the caller already holds the bytes", async () => {
    const body = "the whole book";
    const res = serveBody(GET({ "if-none-match": etagOf(body) }), body, {});
    expect(res.status).toBe(304);
    expect(res.headers.get("etag")).toBe(etagOf(body));
    expect(res.headers.get("content-length")).toBeNull();
    expect(await res.text()).toBe("");
  });

  it("does not short-circuit an error response", () => {
    const res = serveBody(GET({ "if-none-match": "*" }), "nope", {}, 404);
    expect(res.status).toBe(404);
  });
});

describe("serveJson", () => {
  it("hashes the serialised bytes, so an unchanged payload keeps its tag", () => {
    const payload = { id: "anthropics/skills", chapters: 17 };
    const a = serveJson(GET(), payload, {});
    const b = serveJson(GET(), { ...payload }, {});
    expect(a.headers.get("etag")).toBe(b.headers.get("etag"));
  });
});
