/**
 * URL and reference parsing.
 *
 * `parseRepoReference` is the product's headline promise — "swap github.com
 * for this site" — expressed as a function, so every form the homepage tells a
 * reader to try is pinned here.
 */

import { describe, expect, it } from "vitest";
import { isValidOwner, isValidRepo, parseRepoReference } from "./site";

/** Kept in step with `EXAMPLES` in `components/home/repo-swap-field.tsx`. */
const HOMEPAGE_EXAMPLES = [
  "github.com/anthropics/skills",
  "openai/skills",
  "npx skills add mattpocock/skills",
];

describe("parseRepoReference", () => {
  it("accepts every example the homepage offers", () => {
    // Regression: the placeholder and the first example chip were both
    // `github.com/anthropics/skills`, which the parser rejected because the
    // host pattern required a scheme. Clicking the chip and submitting landed
    // on `/search?q=github.com%2Fanthropics%2Fskills` — "no matches" — for the
    // one string the product is named after.
    for (const example of HOMEPAGE_EXAMPLES) {
      expect(parseRepoReference(example), example).not.toBeNull();
    }
  });

  it("parses a scheme-less host, which is what people copy", () => {
    expect(parseRepoReference("github.com/anthropics/skills")).toEqual({
      owner: "anthropics",
      repo: "skills",
    });
    expect(parseRepoReference("www.github.com/anthropics/skills")).toEqual({
      owner: "anthropics",
      repo: "skills",
    });
    expect(parseRepoReference("raw.githubusercontent.com/acme/skills/main/a.md")).toEqual({
      owner: "acme",
      repo: "skills",
    });
    expect(parseRepoReference("skills.sh/acme/skills")).toEqual({
      owner: "acme",
      repo: "skills",
    });
  });

  it("still parses the fully qualified forms", () => {
    for (const input of [
      "https://github.com/anthropics/skills",
      "https://www.github.com/anthropics/skills/tree/main/skills/pdf",
      "git@github.com:anthropics/skills.git",
      "git+https://github.com/anthropics/skills.git",
      "npx skills add anthropics/skills",
      "pnpm dlx skills add anthropics/skills",
      "anthropics/skills",
      "/anthropics/skills",
    ]) {
      expect(parseRepoReference(input), input).toEqual({
        owner: "anthropics",
        repo: "skills",
      });
    }
  });

  it("refuses things that are not repository references", () => {
    for (const input of ["", "not a repo!!!", "anthropics", "https://example.com/a/b"]) {
      expect(parseRepoReference(input), input).toBeNull();
    }
  });

  it("never mistakes a bare host for an owner", () => {
    expect(parseRepoReference("github.com")).toBeNull();
    expect(isValidOwner("github.com")).toBe(false);
    expect(isValidRepo("skills.md")).toBe(true);
  });
});
