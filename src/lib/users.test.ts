import { describe, expect, it } from "vitest";
import {
  isValidUsername,
  normalizeUsername,
  usernameFromEmail,
} from "@/lib/users";

describe("isValidUsername", () => {
  it("accepts the shapes readers will actually pick", () => {
    expect(isValidUsername("kyleledbetter")).toBe(true);
    expect(isValidUsername("kyle-2")).toBe(true);
    expect(isValidUsername("abc")).toBe(true);
  });

  it("rejects grammar violations", () => {
    expect(isValidUsername("ab")).toBe(false); // too short
    expect(isValidUsername("Kyle")).toBe(false); // uppercase
    expect(isValidUsername("-kyle")).toBe(false);
    expect(isValidUsername("kyle-")).toBe(false);
    expect(isValidUsername("a".repeat(31))).toBe(false);
    expect(isValidUsername("kyle.ledbetter")).toBe(false);
  });

  it("rejects every first segment the site already owns", () => {
    for (const reserved of ["api", "share", "bookmarks", "library", "search", "repos", "skills"]) {
      expect(isValidUsername(reserved)).toBe(false);
    }
  });
});

describe("normalizeUsername", () => {
  it("lowercases and trims", () => {
    expect(normalizeUsername("  KyleLedbetter ")).toBe("kyleledbetter");
  });
});

describe("usernameFromEmail", () => {
  it("takes the local part, folded to the grammar", () => {
    expect(usernameFromEmail("kyle@dreambase.com")).toBe("kyle");
    expect(usernameFromEmail("kyle.ledbetter+test@x.com")).toBe("kyle-ledbetter-test");
  });

  it("returns empty when nothing survives", () => {
    expect(usernameFromEmail("@x.com")).toBe("");
  });
});
