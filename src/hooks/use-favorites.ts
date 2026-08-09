"use client";

/**
 * "Your shelf" — the books a reader has starred, in `localStorage`.
 *
 * There is no account system and there is not going to be one, so the shelf is
 * device-local by design. Three constraints shape the implementation:
 *
 * 1. **Several components read it at once** — a star on a card, a star in the
 *    shelf, the shelf's own count — and they must never disagree. One
 *    module-level store with `useSyncExternalStore` gives every subscriber the
 *    same snapshot in the same render.
 * 2. **The server cannot know it.** `getServerSnapshot` returns a frozen empty
 *    list, so the server HTML and the first client render agree; React then
 *    re-renders with the real value after hydration. A `useEffect`-plus-state
 *    version would produce the same pixels but with a hydration mismatch
 *    warning and an extra cascading render.
 * 3. **The snapshot must be referentially stable.** `getSnapshot` is called on
 *    every render and React bails out only if the reference is unchanged, so
 *    the parsed array is memoised and invalidated on write, never re-parsed
 *    per call.
 */

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "gsb:shelf";

/** A shelf entry is exactly `owner/repo`, validated on read and on write. */
const KEY_RE = /^[\w.-]{1,39}\/[\w.-]{1,100}$/;

/** Enough for any real reader; a cap stops a corrupt value growing forever. */
const MAX_ENTRIES = 200;

const EMPTY: readonly string[] = Object.freeze([]);

let snapshot: readonly string[] | null = null;
let storageBound = false;
const listeners = new Set<() => void>();

export function favoriteKey(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

function read(): readonly string[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    const clean = [
      ...new Set(parsed.filter((v): v is string => typeof v === "string" && KEY_RE.test(v))),
    ].slice(0, MAX_ENTRIES);
    return clean.length === 0 ? EMPTY : Object.freeze(clean);
  } catch {
    // A quota error, a private-mode throw, or someone else's JSON under our
    // key. An empty shelf is a working page; a thrown render is not.
    return EMPTY;
  }
}

function invalidate() {
  snapshot = null;
  for (const listener of listeners) listener();
}

function write(next: readonly string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Out of quota or storage denied: the in-memory snapshot below still
    // updates, so the session behaves correctly and simply does not persist.
  }
  invalidate();
}

function getSnapshot(): readonly string[] {
  if (snapshot === null) snapshot = read();
  return snapshot;
}

function getServerSnapshot(): readonly string[] {
  return EMPTY;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!storageBound && typeof window !== "undefined") {
    storageBound = true;
    // Another tab starred something. `storage` does not fire in the tab that
    // wrote, which is exactly right — that tab already invalidated.
    window.addEventListener("storage", (event) => {
      if (event.key === null || event.key === STORAGE_KEY) invalidate();
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

export interface Favorites {
  /** `owner/repo` keys, most recently starred first. */
  keys: readonly string[];
  has: (key: string) => boolean;
  /** Star or unstar; returns the new starred state. */
  toggle: (key: string) => boolean;
  clear: () => void;
  /** False during SSR and the hydrating render, when `keys` is always empty. */
  ready: boolean;
}

export function useFavorites(): Favorites {
  const keys = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const has = useCallback((key: string) => keys.includes(key), [keys]);

  const toggle = useCallback((key: string) => {
    if (!KEY_RE.test(key)) return false;
    const current = getSnapshot();
    const starred = current.includes(key);
    // Newest first: the shelf reads as a stack, and the cap drops the oldest.
    const next = starred
      ? current.filter((k) => k !== key)
      : [key, ...current].slice(0, MAX_ENTRIES);
    write(next);
    return !starred;
  }, []);

  const clear = useCallback(() => write(EMPTY), []);

  return { keys, has, toggle, clear, ready };
}
