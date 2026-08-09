/**
 * The keymap, and the three WCAG 2.1.4 escapes.
 *
 * These are conformance tests, not preference tests. If one of them fails the
 * product has a Level A accessibility defect, not a rough edge.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  bindingsFor,
  buildKeymap,
  conflictFor,
  DEFAULT_SHORTCUT_SETTINGS,
  emitShortcut,
  formatKey,
  hasShortcutListener,
  isEditableTarget,
  normalizeKey,
  onShortcut,
  onShortcutRegistryChange,
  parseBindings,
  resetShortcutListeners,
  serializeBindings,
  SHORTCUTS,
  type ShortcutAction,
  type ShortcutSettings,
  shouldHandle,
} from "./shortcuts";

/** A KeyboardEvent-shaped object. `document` does not exist in this runner. */
function key(
  k: string,
  mods: Partial<Record<"shiftKey" | "metaKey" | "ctrlKey" | "altKey", boolean>> = {},
  extra: Partial<{ target: unknown; repeat: boolean; defaultPrevented: boolean }> = {},
): KeyboardEvent {
  return {
    key: k,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    repeat: false,
    defaultPrevented: false,
    target: null,
    ...mods,
    ...extra,
  } as unknown as KeyboardEvent;
}

const ON: ShortcutSettings = { enabled: true, bindings: {} };

describe("the keymap", () => {
  it("binds every action in ARCHITECTURE §5.6", () => {
    const actions = SHORTCUTS.map((s) => s.action).sort();
    expect(actions).toEqual(
      [
        "nextChapter",
        "prevChapter",
        "pageDown",
        "pageUp",
        "toc",
        "search",
        "controls",
        "themeCycle",
        "copyInstall",
        "copyLink",
        "immersive",
        "sizeUp",
        "sizeDown",
        "goCover",
        "goGitHub",
        "help",
      ].sort(),
    );
  });

  it("leaves J and K unbound", () => {
    // Readers expect them as next/prev *item*, and `k` is NVDA's link key in
    // browse mode: binding it means the shortcut works for everyone except the
    // people it was supposed to help.
    const everyToken = SHORTCUTS.flatMap((s) => s.keys).flatMap((k) => k.split(" "));
    expect(everyToken).not.toContain("j");
    expect(everyToken).not.toContain("k");

    // `h` survives only as the second half of the `G H` chord, where NVDA's
    // heading key never reaches us because `G` armed the sequence first.
    const bareKeys = SHORTCUTS.flatMap((s) => s.keys).filter((k) => !k.includes(" "));
    expect(bareKeys).not.toContain("h");
  });

  it("never binds a bare Escape — Escape belongs to whatever is open", () => {
    const bound = SHORTCUTS.flatMap((s) => s.keys);
    expect(bound).not.toContain("escape");
  });

  it("assigns each key to exactly one action", () => {
    const seen = new Map<string, ShortcutAction>();
    for (const def of SHORTCUTS) {
      for (const k of def.keys) {
        expect(seen.get(k), `${k} is bound twice`).toBeUndefined();
        seen.set(k, def.action);
      }
    }
  });

  it("keeps the browser's own chords free", () => {
    // `Cmd+=` must stay browser zoom, which is why size stepping is unmodified.
    const bound = SHORTCUTS.flatMap((s) => s.keys);
    expect(bound).not.toContain("mod+=");
    expect(bound).not.toContain("mod+-");
  });

  /**
   * The round trip that would have caught the dead size shortcuts.
   *
   * `sizeUp` was bound to `"shift+="`, which `normalizeKey` can never produce:
   * Shift is only recorded for keys whose character does not already encode it,
   * so a US keyboard emits `"+"`. Two independent snapshot tests — one
   * asserting the binding string, one asserting the normalisation rule — were
   * both green while the feature was broken. Synthesising the event and looking
   * the result up in the keymap is the only test that cannot pass while the key
   * is dead.
   */
  it("every default binding is reachable from a real keyboard event", () => {
    const { direct, chords } = buildKeymap(ON);

    /** The KeyboardEvent a browser emits for a normalised binding token. */
    const eventFor = (token: string): KeyboardEvent => {
      // `"+"` is a binding, not a separator, so a one-character token is the
      // key itself.
      const parts = token.length === 1 ? [token] : token.split("+");
      const base = parts[parts.length - 1];
      const mods = {
        metaKey: parts.includes("mod"),
        altKey: parts.includes("alt"),
        shiftKey: parts.includes("shift"),
      };
      const literal =
        base === "space"
          ? " "
          : base === "arrowleft"
            ? "ArrowLeft"
            : base === "arrowright"
              ? "ArrowRight"
              : base;
      return key(literal, mods);
    };

    for (const def of SHORTCUTS) {
      for (const binding of def.keys) {
        const [first, second] = binding.split(" ");
        expect(
          normalizeKey(eventFor(first)),
          `${def.action}: "${first}" does not normalise to itself`,
        ).toBe(first);
        if (second === undefined) {
          expect(direct.get(first), `${def.action}: "${binding}" is unreachable`).toBe(
            def.action,
          );
        } else {
          expect(normalizeKey(eventFor(second))).toBe(second);
          expect(chords.get(first)?.get(second)).toBe(def.action);
        }
      }
    }
  });

  it("steps the text size from the characters a US keyboard actually sends", () => {
    const { direct } = buildKeymap(ON);
    // Shift+Equal emits "+", Shift+Minus emits "_".
    expect(direct.get(normalizeKey(key("+", { shiftKey: true })))).toBe("sizeUp");
    expect(direct.get(normalizeKey(key("_", { shiftKey: true })))).toBe("sizeDown");
    // …and the unshifted characters work too, for layouts where they are.
    expect(direct.get(normalizeKey(key("=")))).toBe("sizeUp");
    expect(direct.get(normalizeKey(key("-")))).toBe("sizeDown");
  });

  it("routes both chords through the same first key", () => {
    const { chords, direct } = buildKeymap(ON);
    expect(chords.get("g")?.get("b")).toBe("goCover");
    expect(chords.get("g")?.get("h")).toBe("goGitHub");
    // `g` alone must not fire anything, or the chord could never resolve.
    expect(direct.has("g")).toBe(false);
  });

  it("indexes every direct binding", () => {
    const { direct } = buildKeymap(ON);
    expect(direct.get("]")).toBe("nextChapter");
    expect(direct.get("[")).toBe("prevChapter");
    expect(direct.get(",")).toBe("controls");
    expect(direct.get("/")).toBe("search");
    expect(direct.get("mod+k")).toBe("search");
    expect(direct.get("?")).toBe("help");
    expect(direct.get("shift+c")).toBe("copyLink");
    expect(direct.get("c")).toBe("copyInstall");
  });
});

describe("normalizeKey", () => {
  it("lowercases letters and ignores the shift that made them uppercase", () => {
    expect(normalizeKey(key("C", { shiftKey: true }))).toBe("shift+c");
    expect(normalizeKey(key("c"))).toBe("c");
  });

  it("does not double-encode a character shift already produced", () => {
    // `?` is Shift+/ on a US layout but a plain key elsewhere; recording the
    // modifier would make the binding layout-dependent.
    expect(normalizeKey(key("?", { shiftKey: true }))).toBe("?");
    expect(normalizeKey(key("=", { shiftKey: true }))).toBe("=");
  });

  it("keeps shift for space and for named keys", () => {
    expect(normalizeKey(key(" ", { shiftKey: true }))).toBe("shift+space");
    expect(normalizeKey(key(" "))).toBe("space");
    expect(normalizeKey(key("ArrowLeft"))).toBe("arrowleft");
  });

  it("folds Cmd and Ctrl into one mod", () => {
    expect(normalizeKey(key("k", { metaKey: true }))).toBe("mod+k");
    expect(normalizeKey(key("k", { ctrlKey: true }))).toBe("mod+k");
  });

  it("returns nothing for a bare modifier press", () => {
    expect(normalizeKey(key("Shift", { shiftKey: true }))).toBe("");
    expect(normalizeKey(key("Meta", { metaKey: true }))).toBe("");
  });
});

describe("formatKey", () => {
  it("renders a chord as two tokens", () => {
    expect(formatKey("g b")).toEqual(["G", "B"]);
  });

  it("uses the platform's modifier glyphs", () => {
    expect(formatKey("mod+k", "mac")).toEqual(["⌘", "K"]);
    expect(formatKey("mod+k", "other")).toEqual(["Ctrl", "K"]);
  });

  it("names the keys that have no glyph", () => {
    expect(formatKey("shift+space")).toEqual(["⇧", "Space"]);
    expect(formatKey("arrowright")).toEqual(["→"]);
  });
});

/* ─────────────────────────────────── WCAG 2.1.4 — all three escapes ── */

describe("escape (a): shortcuts are inert where a character is a character", () => {
  const editable = [
    { tagName: "INPUT", isContentEditable: false },
    { tagName: "TEXTAREA", isContentEditable: false },
    { tagName: "SELECT", isContentEditable: false },
  ];

  /**
   * A minimal element. The escape is duck-typed precisely so it can be checked
   * without a DOM — and so it keeps working on nodes from another realm, where
   * `instanceof Element` is false.
   */
  function element(shape: Record<string, unknown>): EventTarget {
    return { closest: () => null, ...shape } as unknown as EventTarget;
  }

  it("treats form controls as editable", () => {
    for (const shape of editable) {
      expect(isEditableTarget(element(shape))).toBe(true);
    }
  });

  it("treats a contenteditable host as editable", () => {
    expect(isEditableTarget(element({ tagName: "DIV", isContentEditable: true }))).toBe(
      true,
    );
  });

  it("treats anything inside a dialog as off-limits", () => {
    expect(
      isEditableTarget(
        element({ tagName: "BUTTON", isContentEditable: false, closest: () => ({}) }),
      ),
    ).toBe(true);
  });

  it("leaves ordinary reading content alone", () => {
    expect(isEditableTarget(element({ tagName: "P", isContentEditable: false }))).toBe(
      false,
    );
  });

  it("is false for a null target", () => {
    expect(isEditableTarget(null)).toBe(false);
  });

  it("still lets mod-chords through from inside a field", () => {
    const inInput = element({ tagName: "INPUT", isContentEditable: false });
    expect(shouldHandle(key("k", { metaKey: true }, { target: inInput }), ON)).toBe(true);
    expect(shouldHandle(key("t", {}, { target: inInput }), ON)).toBe(false);
  });
});

describe("escape (b): the global switch", () => {
  it("silences every single-character shortcut, chords included", () => {
    const off: ShortcutSettings = { enabled: false, bindings: {} };
    expect(shouldHandle(key("t"), off)).toBe(false);
    expect(shouldHandle(key("g"), off)).toBe(false);
    expect(shouldHandle(key("/"), off)).toBe(false);
  });

  it("leaves modifier combos alone — 2.1.4 is about single characters", () => {
    // The hazard the switch exists for is a speech-input user saying a word
    // made of keys. ⌘K cannot be said by accident, and it is the only keyboard
    // route into search; silencing it made the switch cost more than it saved.
    const off: ShortcutSettings = { enabled: false, bindings: {} };
    expect(shouldHandle(key("k", { metaKey: true }), off)).toBe(true);
  });

  it("defaults to on", () => {
    expect(DEFAULT_SHORTCUT_SETTINGS.enabled).toBe(true);
  });
});

describe("escape (c): remapping", () => {
  it("overrides the default binding", () => {
    const settings: ShortcutSettings = { enabled: true, bindings: { toc: ["o"] } };
    const { direct } = buildKeymap(settings);
    expect(direct.get("o")).toBe("toc");
    expect(direct.get("t")).toBeUndefined();
    expect(bindingsFor("toc", settings)).toEqual(["o"]);
  });

  it("falls back to the default when the override is empty", () => {
    expect(bindingsFor("toc", { enabled: true, bindings: { toc: [] } })).toEqual(["t"]);
  });

  it("reports a conflict before it is committed", () => {
    expect(conflictFor("t", "toc", ON)).toBeNull();
    expect(conflictFor("]", "toc", ON)).toBe("nextChapter");
    // Once nextChapter has moved, its old key is free.
    expect(conflictFor("]", "toc", { enabled: true, bindings: { nextChapter: ["n"] } }))
      .toBeNull();
  });

  it("round-trips through the persisted form", () => {
    const settings: ShortcutSettings = {
      enabled: false,
      bindings: { toc: ["o"], search: ["s", "mod+k"] },
    };
    expect(parseBindings(serializeBindings(settings))).toEqual(settings);
  });

  it("serialises to nothing when nothing was changed", () => {
    expect(serializeBindings(DEFAULT_SHORTCUT_SETTINGS)).toBe("");
    expect(parseBindings("")).toEqual({ enabled: true, bindings: {} });
    expect(parseBindings(null)).toEqual({ enabled: true, bindings: {} });
  });

  it("drops entries for actions that no longer exist", () => {
    const parsed = parseBindings("toc:o;wormhole:w;garbage");
    expect(parsed.bindings).toEqual({ toc: ["o"] });
  });
});

describe("shouldHandle", () => {
  it("ignores auto-repeat so a held key does not fire forty times", () => {
    expect(shouldHandle(key("t", {}, { repeat: true }), ON)).toBe(false);
  });

  it("ignores an event something else already claimed", () => {
    expect(shouldHandle(key("t", {}, { defaultPrevented: true }), ON)).toBe(false);
  });
});

/* ------------------------------------------------------------- dispatch */

describe("the listener registry", () => {
  afterEach(() => resetShortcutListeners());

  it("reports whether an action has an owner", () => {
    expect(hasShortcutListener("toc")).toBe(false);
    const off = onShortcut("toc", () => {});
    expect(hasShortcutListener("toc")).toBe(true);
    off();
    expect(hasShortcutListener("toc")).toBe(false);
  });

  it("only runs the listeners for the action that fired", () => {
    const fired: string[] = [];
    onShortcut("toc", () => fired.push("toc"));
    onShortcut("search", () => fired.push("search"));
    emitShortcut("search");
    expect(fired).toEqual(["search"]);
  });

  it("tells the caller when nothing handled the action", () => {
    // This is what stops the dispatcher from cancelling a keystroke it cannot
    // act on: `/` used to suppress the browser's own quick-find and then do
    // nothing, because no component subscribed to `search`.
    expect(emitShortcut("nextChapter")).toBe(false);
    onShortcut("nextChapter", () => {});
    expect(emitShortcut("nextChapter")).toBe(true);
  });

  it("survives a listener that unsubscribes another mid-dispatch", () => {
    const fired: string[] = [];
    const off = onShortcut("help", () => fired.push("second"));
    onShortcut("help", () => {
      off();
      fired.push("first");
    });
    expect(() => emitShortcut("help")).not.toThrow();
    expect(fired).toContain("first");
  });

  it("notifies watchers when availability changes", () => {
    let changes = 0;
    const stop = onShortcutRegistryChange(() => changes++);
    const off = onShortcut("immersive", () => {});
    expect(changes).toBe(1);
    off();
    expect(changes).toBe(2);
    stop();
    onShortcut("immersive", () => {});
    expect(changes).toBe(2);
  });
});
