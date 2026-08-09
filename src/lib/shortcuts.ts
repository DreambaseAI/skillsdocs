/**
 * The reader keymap (ARCHITECTURE §5.6) and the three escapes WCAG 2.1.4
 * makes non-negotiable.
 *
 * Single-character shortcuts are a genuine accessibility hazard: speech-input
 * users say words, and words are made of characters. SC 2.1.4 therefore
 * requires at least one of *turn it off*, *remap it*, or *scope it to a focused
 * component*. We ship all three, because each one fails differently:
 *
 * 1. **Scoping** (`isEditableTarget`) is automatic and invisible, and covers the
 *    common case — typing in the search box must not turn the page.
 * 2. **The global switch** (`enabled`) is the only thing that helps a speech-
 *    input user who never focuses an input at all.
 * 3. **Remapping** is the only thing that helps someone whose assistive
 *    technology has already claimed the key we wanted.
 *
 * `J` and `K` are deliberately absent from this file. Too many readers expect
 * them as next/prev *item* rather than next/prev page, and `k` is NVDA's link
 * navigation key in browse mode — binding it means the shortcut fires for
 * sighted users and silently never fires for the readers who need it most.
 * `H` is never a bare binding for the same reason (NVDA heading navigation);
 * it survives only as the second half of the `G H` chord, which NVDA cannot
 * intercept because `G` has already armed the sequence.
 */

export type ShortcutGroup = "navigation" | "reading" | "display" | "actions";

export type ShortcutAction =
  | "nextChapter"
  | "prevChapter"
  | "pageDown"
  | "pageUp"
  | "toc"
  | "search"
  | "controls"
  | "themeCycle"
  | "copyInstall"
  | "copyLink"
  | "immersive"
  | "sizeUp"
  | "sizeDown"
  | "goCover"
  | "goGitHub"
  | "help";

export interface ShortcutDef {
  action: ShortcutAction;
  label: string;
  group: ShortcutGroup;
  /**
   * Default bindings, in the normalised form `normalizeKey` produces. A
   * two-token string separated by a space is a chord: `"g b"` means `g` then
   * `b` inside the chord window.
   */
  keys: string[];
  /** Shown next to the row when the binding needs defending. */
  note?: string;
}

/**
 * How long a chord's first key stays armed. 1500ms is slow enough to be
 * reachable one-handed and fast enough that a stray `g` does not swallow the
 * next real keystroke.
 */
export const CHORD_WINDOW_MS = 1500;

export const SHORTCUTS: ShortcutDef[] = [
  {
    action: "nextChapter",
    label: "Next chapter",
    group: "navigation",
    keys: ["]"],
    note: "Editor tab muscle memory; avoids Cmd+[",
  },
  { action: "prevChapter", label: "Previous chapter", group: "navigation", keys: ["["] },
  { action: "pageDown", label: "Page down", group: "navigation", keys: ["arrowright", "space"] },
  {
    action: "pageUp",
    label: "Page up",
    group: "navigation",
    keys: ["arrowleft", "shift+space"],
  },
  { action: "toc", label: "Table of contents", group: "navigation", keys: ["t"] },
  { action: "goCover", label: "Go to cover", group: "navigation", keys: ["g b"] },
  { action: "goGitHub", label: "Open on GitHub", group: "navigation", keys: ["g h"] },

  { action: "search", label: "Search", group: "actions", keys: ["/", "mod+k"] },
  { action: "copyInstall", label: "Copy install command", group: "actions", keys: ["c"] },
  { action: "copyLink", label: "Copy link to chapter", group: "actions", keys: ["shift+c"] },
  { action: "help", label: "Keyboard shortcuts", group: "actions", keys: ["?"] },

  { action: "controls", label: "Reading controls", group: "display", keys: [","] },
  { action: "themeCycle", label: "Cycle theme", group: "display", keys: ["d"] },
  { action: "immersive", label: "Hide chrome", group: "display", keys: ["z"] },
  /*
   * `+` / `=` and `_` / `-`, not `shift+=` and `shift+-`.
   *
   * `normalizeKey` deliberately does not record Shift for a printable
   * character that already encodes its own shift state, so a US keyboard emits
   * `key: "+"` for Shift+= and the binding `"shift+="` could never match
   * anything — measured: pressing Shift+Equal, `+` and `=` all left the body
   * size at 19px. Binding both the shifted and unshifted characters keeps the
   * pair working across layouts where `+` is unshifted.
   *
   * `Cmd+=` is untouched either way, so browser zoom still belongs to the
   * browser. `buildKeymap` round-trips every default binding through
   * `normalizeKey` in the unit suite, so a binding that cannot fire is now a
   * test failure rather than a silently dead key cap.
   */
  {
    action: "sizeUp",
    label: "Larger text",
    group: "reading",
    keys: ["+", "="],
    note: "Cmd+= stays browser zoom",
  },
  { action: "sizeDown", label: "Smaller text", group: "reading", keys: ["_", "-"] },
];

export const SHORTCUT_GROUP_LABELS: Record<ShortcutGroup, string> = {
  navigation: "Navigation",
  reading: "Reading",
  display: "Display",
  actions: "Actions",
};

export const SHORTCUT_BY_ACTION: Record<ShortcutAction, ShortcutDef> = Object.fromEntries(
  SHORTCUTS.map((s) => [s.action, s]),
) as Record<ShortcutAction, ShortcutDef>;

/* ------------------------------------------------------------- settings */

export interface ShortcutSettings {
  /** Escape (b): one switch that silences every single-character shortcut. */
  enabled: boolean;
  /** Escape (c): only the actions the reader actually rebound are stored. */
  bindings: Partial<Record<ShortcutAction, string[]>>;
}

export const DEFAULT_SHORTCUT_SETTINGS: ShortcutSettings = {
  enabled: true,
  bindings: {},
};

/** The effective bindings for an action: the override if any, else the default. */
export function bindingsFor(
  action: ShortcutAction,
  settings: ShortcutSettings,
): string[] {
  const override = settings.bindings[action];
  return override && override.length > 0
    ? override
    : (SHORTCUT_BY_ACTION[action]?.keys ?? []);
}

/**
 * Reverse index from a normalised key (or a chord's first token) to the
 * action it fires. Built once per settings object by the hook, not per event.
 */
export function buildKeymap(settings: ShortcutSettings): {
  direct: Map<string, ShortcutAction>;
  chords: Map<string, Map<string, ShortcutAction>>;
} {
  const direct = new Map<string, ShortcutAction>();
  const chords = new Map<string, Map<string, ShortcutAction>>();

  for (const def of SHORTCUTS) {
    for (const key of bindingsFor(def.action, settings)) {
      const [first, second] = key.split(" ");
      if (second === undefined) {
        // First binding wins, so a remap can shadow a default without the
        // default silently firing too.
        if (!direct.has(key)) direct.set(key, def.action);
      } else {
        const branch = chords.get(first) ?? new Map<string, ShortcutAction>();
        if (!branch.has(second)) branch.set(second, def.action);
        chords.set(first, branch);
      }
    }
  }
  return { direct, chords };
}

/* ------------------------------------------------------ key normalisation */

/** The modifier that means "the platform's command key". */
export function isModKey(event: Pick<KeyboardEvent, "metaKey" | "ctrlKey">): boolean {
  return event.metaKey || event.ctrlKey;
}

/**
 * A keyboard event as a stable, comparable string.
 *
 * `event.key` rather than `event.code`, because a shortcut is a *character* the
 * reader typed, not a physical key position — `Shift+=` must keep working on a
 * layout where `+` is unshifted. Shift is only recorded for keys where it does
 * not already change the character, which is why `?` is `"?"` and not
 * `"shift+/"`, but `Shift+Space` is `"shift+space"`.
 */
export function normalizeKey(event: KeyboardEvent): string {
  const key = event.key;
  if (key === "Shift" || key === "Control" || key === "Alt" || key === "Meta") return "";

  // Space is spelled out. The chord separator is a space, so a binding that
  // contained a literal " " could not be split back apart.
  const lower = key === " " ? "space" : key.toLowerCase();
  const parts: string[] = [];
  if (isModKey(event)) parts.push("mod");
  if (event.altKey) parts.push("alt");
  // A printable character already encodes its own shift state, with two
  // exceptions: letters (which only differ in case) and space.
  const shiftIsMeaningful =
    event.shiftKey && (key.length > 1 || key === " " || /^[a-z]$/i.test(key));
  if (shiftIsMeaningful) parts.push("shift");
  parts.push(lower);
  return parts.join("+");
}

/** Human-facing rendering of a normalised key, for the dialog and tooltips. */
export function formatKey(key: string, platform: "mac" | "other" = "other"): string[] {
  return key.split(" ").flatMap((token) =>
    token.split("+").map((part) => {
      if (part === "mod") return platform === "mac" ? "⌘" : "Ctrl";
      if (part === "alt") return platform === "mac" ? "⌥" : "Alt";
      if (part === "shift") return "⇧";
      if (part === "space") return "Space";
      if (part === "arrowright") return "→";
      if (part === "arrowleft") return "←";
      if (part === "arrowup") return "↑";
      if (part === "arrowdown") return "↓";
      if (part === "escape") return "Esc";
      return part.length === 1 ? part.toUpperCase() : part;
    }),
  );
}

/* --------------------------------------------------------------- escapes */

/**
 * Escape (a): is focus somewhere a single character means "a character"?
 *
 * Dialogs are included because a modal surface owns its own key handling; a
 * reader tabbing through the shortcuts dialog must be able to type into the
 * rebinding field without turning the page behind it.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  /*
   * Duck-typed rather than `instanceof Element`. `instanceof` is false for a
   * node from another realm — an iframe, a same-origin popup — which is
   * exactly the case where a keystroke we must not steal arrives. It also
   * makes the escape testable without a DOM.
   */
  if (!target || typeof target !== "object") return false;
  const el = target as Partial<HTMLElement>;
  if (typeof el.tagName !== "string") return false;

  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  if (typeof el.closest !== "function") return false;
  if (el.closest("[contenteditable]:not([contenteditable='false'])")) return true;
  if (el.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'))
    return true;
  return false;
}

/**
 * Should this event be allowed to fire a shortcut at all?
 *
 * `mod`-prefixed bindings survive the editable check — `⌘K` from inside a text
 * field is what everybody expects — but bare characters never do.
 */
export function shouldHandle(event: KeyboardEvent, settings: ShortcutSettings): boolean {
  if (event.defaultPrevented || event.repeat) return false;
  // The off switch is escape (b) of 2.1.4, which is about *single-character*
  // shortcuts: the hazard is a speech-input user saying a word made of keys.
  // A modifier combo cannot be spoken by accident, and ⌘K is the only way into
  // search from the keyboard, so the switch leaves it alone. Bare characters —
  // including the first key of a chord — are silenced completely.
  if (!settings.enabled) return isModKey(event);
  if (isModKey(event)) return true;
  return !isEditableTarget(event.target);
}

/* ---------------------------------------------------------- persistence */

/**
 * Bindings serialise as `action:key|key`, joined by `;`. Terse because this
 * rides in `localStorage` next to the prefs and is dumped into the same
 * versioned blob.
 */
export function serializeBindings(settings: ShortcutSettings): string {
  const parts: string[] = [];
  if (!settings.enabled) parts.push("off");
  for (const [action, keys] of Object.entries(settings.bindings)) {
    if (keys && keys.length > 0) parts.push(`${action}:${keys.join("|")}`);
  }
  return parts.join(";");
}

export function parseBindings(raw: string | null | undefined): ShortcutSettings {
  if (!raw) return { ...DEFAULT_SHORTCUT_SETTINGS, bindings: {} };

  const known = new Set(SHORTCUTS.map((s) => s.action));
  const settings: ShortcutSettings = { enabled: true, bindings: {} };

  for (const part of raw.split(";")) {
    if (part === "off") {
      settings.enabled = false;
      continue;
    }
    const at = part.indexOf(":");
    if (at < 0) continue;
    const action = part.slice(0, at);
    if (!known.has(action as ShortcutAction)) continue;
    const keys = part
      .slice(at + 1)
      .split("|")
      .filter(Boolean);
    if (keys.length > 0) settings.bindings[action as ShortcutAction] = keys;
  }
  return settings;
}

/**
 * Which other action already owns this key, if any. The rebinding UI refuses
 * duplicates rather than letting one key fire two things in an order nobody
 * can predict.
 */
export function conflictFor(
  key: string,
  action: ShortcutAction,
  settings: ShortcutSettings,
): ShortcutAction | null {
  for (const def of SHORTCUTS) {
    if (def.action === action) continue;
    if (bindingsFor(def.action, settings).includes(key)) return def.action;
  }
  return null;
}

/* ------------------------------------------------------------- dispatch */

type Listener = () => void;

/**
 * One global bus rather than a context, and keyed by action rather than a flat
 * list.
 *
 * The pieces that respond to a shortcut — the controls panel, the theme
 * toggle, the chapter nav — are scattered across three workstreams' component
 * trees and several portals. A context would force all of them under one
 * provider for no benefit.
 *
 * **Keying by action is what makes the keymap honest.** A flat listener set
 * cannot answer "does anything actually handle `]`?", so the dispatcher
 * happily called `preventDefault()` for eleven actions nobody had implemented:
 * pressing `/` on a chapter page suppressed the browser's own quick-find and
 * then did nothing — a net removal of function — and the shortcuts dialog
 * advertised a key cap for every one of them. With a per-action registry the
 * dispatcher can leave an unclaimed key to the browser, and the dialog can say
 * which shortcuts are live on this page.
 */
const listeners = new Map<ShortcutAction, Set<Listener>>();
const registryWatchers = new Set<() => void>();

function notifyRegistry(): void {
  for (const watcher of registryWatchers) watcher();
}

export function onShortcut(action: ShortcutAction, listener: Listener): () => void {
  let set = listeners.get(action);
  if (!set) {
    set = new Set();
    listeners.set(action, set);
  }
  set.add(listener);
  notifyRegistry();

  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(action);
    notifyRegistry();
  };
}

/** True when something on this page is listening for `action`. */
export function hasShortcutListener(action: ShortcutAction): boolean {
  return (listeners.get(action)?.size ?? 0) > 0;
}

/** Subscribe to registry changes, for UI that reports which keys are live. */
export function onShortcutRegistryChange(watcher: () => void): () => void {
  registryWatchers.add(watcher);
  return () => {
    registryWatchers.delete(watcher);
  };
}

/** Fire `action`. Returns false when nothing was listening. */
export function emitShortcut(action: ShortcutAction): boolean {
  const set = listeners.get(action);
  if (!set || set.size === 0) return false;
  // Copied: a handler may unmount another subscriber mid-iteration.
  for (const listener of [...set]) listener();
  return true;
}

/** Test-only: drop every subscription. */
export function resetShortcutListeners(): void {
  listeners.clear();
  notifyRegistry();
}
