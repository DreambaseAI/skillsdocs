/**
 * Persistence and the DOM handoff.
 *
 * The load-bearing behaviour here is `styleDeltas`. `prefsToStyle` emits every
 * property unconditionally, and writing them all inline onto `<html>` would
 * silently defeat `reader.css`'s responsive 17px mobile default for every
 * reader who never touched the size control — an inline declaration beats a
 * media query, always.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, PREFS_COOKIE, parsePrefs, SIZE_STEPS } from "./prefs";
import { prefsCookieString, readPrefsCookie, styleDeltas } from "./store";

describe("styleDeltas", () => {
  it("writes nothing at all for the factory state", () => {
    const { set, remove } = styleDeltas(DEFAULT_PREFS);
    expect(set).toEqual({});
    // …and actively clears anything a previous state left behind.
    expect(remove).toContain("--reader-size-step");
    expect(remove).toContain("--reader-measure-cpl");
  });

  it("writes only the properties that actually differ", () => {
    const { set } = styleDeltas({ ...DEFAULT_PREFS, cpl: 80 });
    expect(set).toEqual({ "--reader-measure-cpl": "80" });
  });

  it("leaves the mobile size default reachable until the reader overrides it", () => {
    // The whole point: at the default step, no inline `--reader-size-step` is
    // written, so the `max-width: 479px` rule in reader.css still applies.
    expect(styleDeltas(DEFAULT_PREFS).set["--reader-size-step"]).toBeUndefined();
    const bumped = styleDeltas({ ...DEFAULT_PREFS, sizeIndex: 8 });
    expect(bumped.set["--reader-size-step"]).toBe("22px");
  });

  it("clears the manual line height when the reader goes back to auto", () => {
    const manual = styleDeltas({ ...DEFAULT_PREFS, lineHeight: 1.9 });
    expect(manual.set["--reader-lh-manual"]).toBe("1.9");
    expect(manual.remove).not.toContain("--reader-lh-manual");

    const auto = styleDeltas(DEFAULT_PREFS);
    expect(auto.remove).toContain("--reader-lh-manual");
  });

  it("carries the WCAG 1.4.12 maxima through unchanged", () => {
    const { set } = styleDeltas({
      ...DEFAULT_PREFS,
      tracking: 0.16,
      wordSpacing: 0.32,
      paraGap: 2,
    });
    expect(set["--reader-tracking"]).toBe("0.16em");
    expect(set["--reader-word-spacing"]).toBe("0.32em");
    expect(set["--reader-para-gap"]).toBe("2em");
  });

  it("never sets and removes the same property", () => {
    for (const index of SIZE_STEPS.keys()) {
      const { set, remove } = styleDeltas({ ...DEFAULT_PREFS, sizeIndex: index });
      for (const name of remove) expect(set[name]).toBeUndefined();
    }
  });
});

describe("the cookie", () => {
  it("carries the attributes the spec requires", () => {
    const cookie = prefsCookieString({ ...DEFAULT_PREFS, cpl: 80 }, true);
    expect(cookie.startsWith(`${PREFS_COOKIE}=`)).toBe(true);
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=31536000"); // one year
    expect(cookie).toContain("Secure");
  });

  it("omits Secure off https, where the browser would drop it", () => {
    expect(prefsCookieString(DEFAULT_PREFS, false)).not.toContain("Secure");
  });

  it("expires itself when the state is back to the defaults", () => {
    const cookie = prefsCookieString(DEFAULT_PREFS, false);
    expect(cookie).toContain(`${PREFS_COOKIE}=;`);
    expect(cookie).toContain("Max-Age=0");
  });

  it("stays inside the 400-byte budget at the extremes", () => {
    const worst = prefsCookieString(
      {
        font: "instrument-serif",
        codeFont: "atkinson-mono",
        sizeIndex: 16,
        lineHeight: 2.2,
        cpl: 100,
        tracking: 0.16,
        wordSpacing: 0.32,
        paraGap: 2,
        paraStyle: "indented",
        align: "justify",
        paper: "midnight",
        contrast: "high",
        motion: "reduce",
        preset: "accessible",
      },
      true,
    );
    expect(worst.length).toBeLessThan(400);
  });

  it("round-trips through the codec", () => {
    const prefs = { ...DEFAULT_PREFS, font: "atkinson", cpl: 58, lineHeight: 1.75 };
    const value = prefsCookieString(prefs, false).split(";")[0].slice(PREFS_COOKIE.length + 1);
    expect(parsePrefs(value)).toEqual(prefs);
  });
});

describe("readPrefsCookie", () => {
  it("finds the value among other cookies", () => {
    expect(readPrefsCookie(`theme=dark; ${PREFS_COOKIE}=f=inter&m=80; other=1`)).toBe(
      "f=inter&m=80",
    );
  });

  it("is null when the cookie is absent", () => {
    expect(readPrefsCookie("theme=dark")).toBeNull();
    expect(readPrefsCookie("")).toBeNull();
  });

  it("does not match a cookie whose name merely ends with ours", () => {
    expect(readPrefsCookie(`not-${PREFS_COOKIE}=f=inter`)).toBeNull();
  });
});
