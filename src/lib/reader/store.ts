/**
 * Where reading preferences live between visits, and how they reach the DOM.
 *
 * Two stores, on purpose:
 *
 * - **The cookie** is the one the *server* can see. It is the entire reason
 *   there is no flash of default typography, and it is capped at 400 bytes
 *   because it rides on every request including the ones for images.
 * - **`localStorage`** carries everything the cookie cannot afford: the
 *   shortcut remappings, the switch state, focus mode. None of that changes
 *   the first paint, so none of it needs to be on the wire.
 *
 * The cookie is authoritative for anything both stores hold. If they disagree
 * the cookie won the race to `<head>`, and quietly re-rendering the page to
 * agree with `localStorage` instead would be exactly the flash this design
 * exists to prevent.
 */

import {
  DEFAULT_SHORTCUT_SETTINGS,
  parseBindings,
  serializeBindings,
  type ShortcutSettings,
} from "@/lib/shortcuts";
import { metricsFor } from "./metrics";
import {
  DEFAULT_PREFS,
  PREFS_COOKIE,
  PREFS_COOKIE_MAX_AGE,
  parsePrefs,
  prefsToDataAttributes,
  prefsToStyle,
  type ReaderPrefs,
  serializePrefs,
} from "./prefs";

/** Extras that are not worth a byte of every HTTP request. */
export interface ReaderExtras {
  shortcuts: ShortcutSettings;
  focusMode: boolean;
}

export const DEFAULT_EXTRAS: ReaderExtras = {
  shortcuts: DEFAULT_SHORTCUT_SETTINGS,
  focusMode: false,
};

export interface ReaderState {
  prefs: ReaderPrefs;
  extras: ReaderExtras;
}

export const DEFAULT_STATE: ReaderState = {
  prefs: DEFAULT_PREFS,
  extras: DEFAULT_EXTRAS,
};

const STORAGE_KEY = "githubskills:reader:1";

/* ----------------------------------------------------------------- cookie */

export function readPrefsCookie(cookieString: string): string | null {
  for (const part of cookieString.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== PREFS_COOKIE) continue;
    return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

/**
 * The `Set-Cookie`-shaped value, exported so a test can assert the attributes
 * rather than trusting a template literal buried in an effect.
 *
 * `Secure` is conditional: setting it on `http://localhost` makes the browser
 * drop the cookie silently, and a developer whose preferences never persist
 * will conclude the feature is broken.
 */
export function prefsCookieString(prefs: ReaderPrefs, secure: boolean): string {
  const value = serializePrefs(prefs);
  const attrs = [
    `${PREFS_COOKIE}=${value}`,
    "Path=/",
    `Max-Age=${value === "" ? 0 : PREFS_COOKIE_MAX_AGE}`,
    "SameSite=Lax",
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

/* ------------------------------------------------------------------ read */

/**
 * Load the saved state.
 *
 * Order matters. `localStorage` is read first for the extras, then the cookie
 * overwrites the prefs, because the cookie is what the pre-paint script
 * already applied.
 */
export function loadState(): ReaderState {
  if (typeof document === "undefined") return DEFAULT_STATE;

  let extras = DEFAULT_EXTRAS;
  let prefs = DEFAULT_PREFS;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        prefs?: string;
        shortcuts?: string;
        focusMode?: boolean;
      };
      if (typeof parsed.prefs === "string") prefs = parsePrefs(parsed.prefs);
      extras = {
        shortcuts: parseBindings(parsed.shortcuts),
        focusMode: parsed.focusMode === true,
      };
    }
  } catch {
    // A corrupt or blocked store is not an error worth surfacing; the defaults
    // are a good reading experience.
  }

  const cookie = readPrefsCookie(document.cookie);
  if (cookie !== null) prefs = parsePrefs(cookie);

  return { prefs, extras };
}

/* ----------------------------------------------------------------- write */

export function saveState(state: ReaderState): void {
  if (typeof document === "undefined") return;

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        prefs: serializePrefs(state.prefs),
        shortcuts: serializeBindings(state.extras.shortcuts),
        focusMode: state.extras.focusMode,
      }),
    );
  } catch {
    // Private browsing, a full quota, or a blocked origin. The cookie below is
    // the one that actually matters.
  }

  document.cookie = prefsCookieString(state.prefs, window.location.protocol === "https:");
}

/* -------------------------------------------------------------- to the DOM */

/**
 * The inline custom properties for a state, minus every one that equals the
 * stylesheet's own default.
 *
 * This is not micro-optimisation. `reader.css` lowers the default size to 17px
 * under 480px, and an inline `--reader-size-step: 19px` on `<html>` — which is
 * what `prefsToStyle` unconditionally produces — would beat that media query
 * for every reader who never touched the control. Writing only the deltas
 * means the responsive default survives until somebody actually overrides it,
 * and it is the same rule `serializePrefs` already applies to the cookie.
 */
export function styleDeltas(prefs: ReaderPrefs): {
  set: Record<string, string>;
  remove: string[];
} {
  const wanted = prefsToStyle(prefs);
  const baseline = prefsToStyle(DEFAULT_PREFS);
  const set: Record<string, string> = {};
  const remove: string[] = [];

  for (const [key, value] of Object.entries(wanted)) {
    if (baseline[key] === value) remove.push(key);
    else set[key] = value;
  }
  // `--reader-lh-manual` is absent from `prefsToStyle` in auto mode, so it has
  // to be cleared explicitly when the reader goes back to auto.
  for (const key of Object.keys(baseline)) {
    if (!(key in wanted)) remove.push(key);
  }
  if (!("--reader-lh-manual" in wanted)) remove.push("--reader-lh-manual");

  return { set, remove };
}

/**
 * Push a state onto `<html>`. Idempotent, and safe to call on every keystroke
 * of a slider drag — it writes attributes and custom properties, both of which
 * the browser diffs internally.
 */
export function applyToDocument(prefs: ReaderPrefs, root?: HTMLElement): void {
  const el = root ?? (typeof document === "undefined" ? undefined : document.documentElement);
  if (!el) return;

  for (const [name, value] of Object.entries(prefsToDataAttributes(prefs))) {
    el.setAttribute(name, value);
  }
  if (prefs.paper === "system") el.removeAttribute("data-paper");
  if (prefs.motion === "system") el.removeAttribute("data-motion");

  /*
   * `data-font-caps` is an attribute rather than a custom property because
   * `prose.css` selects on it — CSS cannot branch on a custom property's value.
   * It is derived, never stored: it is a fact about the font file, not a
   * preference, so it has no business in the cookie.
   */
  el.setAttribute("data-font-caps", metricsFor(prefs.font).caps);

  const { set, remove } = styleDeltas(prefs);
  for (const name of remove) el.style.removeProperty(name);
  for (const [name, value] of Object.entries(set)) el.style.setProperty(name, value);
}

/* ---------------------------------------------------------- the instance */

/**
 * A module singleton rather than React state.
 *
 * Preferences are a property of the document, not of a subtree: the pre-paint
 * script has already written them onto `<html>` before React exists, and the
 * panel, the keyboard layer and the progress bar all live in different portals.
 * A `useSyncExternalStore` over one mutable object keeps every consumer in step
 * without threading a provider through three workstreams' component trees, and
 * — unlike `useState` + `useEffect` — it does not schedule a cascading render
 * on mount.
 */
class ReaderStore {
  private state: ReaderState = DEFAULT_STATE;
  private hydrated = false;
  private listeners = new Set<() => void>();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  getState = (): ReaderState => this.state;

  isHydrated = (): boolean => this.hydrated;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Read storage once, on mount. Safe to call twice — StrictMode does. */
  hydrate = (): void => {
    if (this.hydrated) return;
    this.hydrated = true;
    this.state = loadState();
    applyToDocument(this.state.prefs);
    this.emit();
  };

  setPrefs = (prefs: ReaderPrefs): void => {
    this.state = { ...this.state, prefs };
    applyToDocument(prefs);
    this.persist();
    this.emit();
  };

  setExtras = (patch: Partial<ReaderExtras>): void => {
    this.state = { ...this.state, extras: { ...this.state.extras, ...patch } };
    this.persist();
    this.emit();
  };

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  /**
   * Writing a cookie is a synchronous string parse in the browser and a
   * `localStorage` write can hit disk; a slider drag fires both forty times a
   * second. The DOM is updated immediately — that is what "live" means — and
   * only the durable copy waits for the reader to stop moving.
   */
  private persist(): void {
    if (typeof window === "undefined") return;
    clearTimeout(this.saveTimer);
    const snapshot = this.state;
    this.saveTimer = setTimeout(() => saveState(snapshot), 250);
  }
}

export const readerStore = new ReaderStore();

/** The snapshot `useSyncExternalStore` renders on the server and at hydration. */
export function serverSnapshot(): ReaderState {
  return DEFAULT_STATE;
}
