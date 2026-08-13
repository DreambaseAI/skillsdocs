/**
 * URL and reference parsing.
 *
 * `parseRepoReference` is the product's headline promise — "swap github.com
 * for this site" — expressed as a function, so every form the homepage tells a
 * reader to try is pinned here.
 */

import { describe, expect, it } from "vitest";
import {
  isInstallCommand,
  isValidOwner,
  isValidRepo,
  parseRepoReference,
} from "./site";

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
      "/plugin marketplace add anthropics/skills",
      "plugin marketplace add anthropics/skills",
      "anthropics/skills",
      "/anthropics/skills",
    ]) {
      expect(parseRepoReference(input), input).toEqual({
        owner: "anthropics",
        repo: "skills",
      });
    }
  });

  it("parses install commands wrapping a full URL, flags and all", () => {
    // What `skills.sh` puts on the clipboard: the command, a URL, sometimes
    // flags. The flag's value must never be mistaken for the repo.
    for (const input of [
      "npx skills add https://github.com/remotion-dev/skills",
      "npx skills add https://github.com/remotion-dev/skills --skill remotion-best-practices",
      "npx skills add remotion-dev/skills -g",
      "npx skills add --all remotion-dev/skills",
      "bunx skills add remotion-dev/skills --all --skill foo",
    ]) {
      expect(parseRepoReference(input), input).toEqual({
        owner: "remotion-dev",
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

describe("isInstallCommand", () => {
  // The homepage swaps its `github.com/` prefix for `npx skills add` on
  // paste, keyed off this predicate.
  it("recognises the skills add family", () => {
    expect(isInstallCommand("npx skills add remotion-dev/skills")).toBe(true);
    expect(isInstallCommand("  pnpm dlx skills add a/b --all")).toBe(true);
    expect(isInstallCommand("bunx skills add a/b")).toBe(true);
    expect(isInstallCommand("skills add a/b")).toBe(true);
  });

  it("rejects plain references", () => {
    expect(isInstallCommand("github.com/anthropics/skills")).toBe(false);
    expect(isInstallCommand("anthropics/skills")).toBe(false);
    expect(isInstallCommand("/plugin marketplace add a/b")).toBe(false);
  });
});

describe("the swap accepts our own URLs", () => {
  // A reader who copies a Skills Docs URL and pastes it back into the hero
  // must get the book, not a search for the hostname.
  it.each([
    "skillsdocs.com/anthropics/skills",
    "https://skillsdocs.com/anthropics/skills",
    "https://www.skillsdocs.com/anthropics/skills",
    "http://localhost:3150/anthropics/skills",
    "https://skillsdocs.com/anthropics/skills/pdf",
  ])("parses %s", (input) => {
    expect(parseRepoReference(input)).toEqual({ owner: "anthropics", repo: "skills" });
  });
});
