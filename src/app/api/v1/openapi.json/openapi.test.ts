/**
 * The OpenAPI document has to describe the API we actually serve.
 *
 * It validated cleanly as OpenAPI 3.1 while describing a different API:
 * `score` was declared `maximum: 1` against live values of 14.5, `origin`
 * enumerated three values the code never emits and omitted the two it does,
 * `Chapter` was declared as an extension of `ChapterSummary` when the two are
 * different shapes, and the Markdown routes declared JSON error bodies while
 * serving `text/plain`. A document that lies is worse than no document: a
 * generated client parses it and throws.
 *
 * These assertions pin each of those, and the shape checks below are written
 * against the response builders in the sibling route handlers.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, expect, it } from "vitest";
import { document } from "./route";

const doc = document() as any;

describe("openapi document", () => {
  it("is a 3.1 document with an explicit public security posture", () => {
    expect(doc.openapi).toBe("3.1.0");
    // Redocly's recommended ruleset reports eleven `security-defined` errors
    // without this; the API really is unauthenticated, so say so.
    expect(doc.security).toEqual([]);
  });

  it("describes the catalog endpoint an agent needs to enumerate the site", () => {
    expect(doc.paths["/api/v1/books"]).toBeDefined();
    expect(doc.paths["/api/v1/books"].get.operationId).toBe("listBooks");
    expect(doc.components.schemas.BookListing).toBeDefined();
  });

  describe("search", () => {
    const result =
      doc.components.schemas.SearchResponse.properties.results.items.properties;

    it("enumerates exactly the `origin` values the route emits", () => {
      expect(result.origin.enum).toEqual(["index", "book"]);
    });

    it("does not bound `score` at 1 — index hits are unbounded", () => {
      expect(result.score.maximum).toBeUndefined();
      expect(result.score.description).toMatch(/two incomparable scales/i);
    });

    it("declares the fields the route actually returns", () => {
      for (const key of ["matchedOn", "json", "snippet", "installs"]) {
        expect(result[key], key).toBeDefined();
      }
    });
  });

  describe("chapter", () => {
    it("is its own shape, not an extension of ChapterSummary", () => {
      expect(doc.components.schemas.Chapter.allOf).toBeUndefined();
      // The distinguishing detail: the chapter endpoint nests URLs.
      expect(doc.components.schemas.Chapter.properties.links).toBeDefined();
      expect(doc.components.schemas.Chapter.properties.markdown).toBeUndefined();
    });

    it("no longer promises a per-request `generatedAt`", () => {
      expect(doc.components.schemas.Book.properties.generatedAt).toBeUndefined();
    });

    it("names the heading count what the payload names it", () => {
      const summary = doc.components.schemas.ChapterSummary.properties;
      expect(summary.headingCount).toBeDefined();
      expect(summary.headings).toBeUndefined();
    });
  });

  describe("markdown routes", () => {
    const responses = doc.paths["/{owner}/{repo}.md"].get.responses;

    it("declare text/plain errors, because that is what they serve", () => {
      for (const status of ["400", "404", "429", "502"]) {
        expect(responses[status].$ref, status).toBe(
          "#/components/responses/TextError",
        );
      }
      expect(
        doc.components.responses.TextError.content["text/plain"],
      ).toBeDefined();
    });

    it("declare the 304 that If-None-Match now produces", () => {
      expect(responses["304"]).toBeDefined();
    });
  });

  it("describes the two digests a manifest entry carries", () => {
    const entry =
      doc.components.schemas.AgentSkillsManifest.properties.skills.items
        .properties;
    expect(entry.digest.description).toMatch(/bytes served at `url`/);
    expect(entry.source).toBeDefined();
    expect(entry.sourceDigest).toBeDefined();
  });

  it("lists `invalid_cursor` among the error codes it can return", () => {
    const codes =
      doc.components.schemas.Error.properties.error.properties.code.enum;
    expect(codes).toContain("invalid_cursor");
  });

  it("has no dangling $ref", () => {
    const refs = new Set<string>();
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object") return;
      for (const [k, v] of Object.entries(node)) {
        if (k === "$ref" && typeof v === "string") refs.add(v);
        else walk(v);
      }
    };
    walk(doc);
    for (const ref of refs) {
      const path = ref.replace(/^#\//, "").split("/");
      const resolved = path.reduce<any>((acc, key) => acc?.[key], doc);
      expect(resolved, ref).toBeDefined();
    }
  });
});
