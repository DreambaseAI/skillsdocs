/**
 * The `D` cycle.
 *
 * `D` was reported dead. It was not: the listener was mounted, the keystroke
 * arrived, `setTheme` ran, and `localStorage.theme` changed on every press.
 * What did not change was the page — the old fixed order `light → dark →
 * system` started a reader on the default "system" setting by moving them to
 * "light", which on a light OS is the same class on `<html>` and the same
 * pixels. A key whose first press repaints nothing is indistinguishable from a
 * key nothing listens to.
 *
 * Two of the three states always render identically, so exactly one edge of any
 * 3-cycle over them must be a visual no-op. These tests pin *which* edge: the
 * return to "system", where nothing changing is the outcome the reader asked
 * for.
 */

import { describe, expect, it } from "vitest";
import { nextScheme, type ColorScheme } from "./theme-toggle";

/** What the page actually renders for a setting, given the OS preference. */
function rendered(value: ColorScheme, systemPrefersDark: boolean): "light" | "dark" {
  if (value === "system") return systemPrefersDark ? "dark" : "light";
  return value;
}

function cycle(from: ColorScheme, systemPrefersDark: boolean, steps: number) {
  const seen: ColorScheme[] = [from];
  let value = from;
  for (let i = 0; i < steps; i++) {
    value = nextScheme(value, systemPrefersDark);
    seen.push(value);
  }
  return seen;
}

describe("nextScheme", () => {
  for (const systemPrefersDark of [false, true]) {
    const os = systemPrefersDark ? "dark" : "light";

    describe(`on a ${os} system`, () => {
      it("reaches all three settings and returns to the start", () => {
        const seen = cycle("system", systemPrefersDark, 3);
        expect(new Set(seen)).toEqual(new Set(["system", "light", "dark"]));
        expect(seen[3]).toBe("system");
      });

      it("repaints the page on the first press from the default", () => {
        // The whole bug, in one assertion.
        const next = nextScheme("system", systemPrefersDark);
        expect(rendered(next, systemPrefersDark)).not.toBe(
          rendered("system", systemPrefersDark),
        );
      });

      it("puts the one unavoidable no-op on the return to system", () => {
        const seen = cycle("system", systemPrefersDark, 3);
        const noops = seen
          .slice(1)
          .map((value, i) => [seen[i], value] as const)
          .filter(([a, b]) => rendered(a, systemPrefersDark) === rendered(b, systemPrefersDark));

        expect(noops).toHaveLength(1);
        expect(noops[0][1]).toBe("system");
      });
    });
  }

  it("is a permutation — no setting is a dead end", () => {
    for (const systemPrefersDark of [false, true]) {
      const targets = (["light", "dark", "system"] as ColorScheme[]).map((v) =>
        nextScheme(v, systemPrefersDark),
      );
      expect(new Set(targets).size).toBe(3);
      expect(targets).not.toContain(undefined);
      // Nothing points at itself.
      for (const [i, value] of (["light", "dark", "system"] as ColorScheme[]).entries()) {
        expect(targets[i]).not.toBe(value);
      }
    }
  });
});
