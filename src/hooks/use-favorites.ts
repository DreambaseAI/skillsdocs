"use client";

/**
 * The reader's library, in `localStorage`: two flat lists.
 *
 * - `gsb:shelf` — starred books, exactly `owner/repo`. This is the shelf, the
 *   share link, and the spines; its shape is already on readers' devices and
 *   in shared URLs, so it never changes.
 * - `gsb:bookmarks` — bookmarked skills, exactly `owner/repo/skill-slug`.
 *
 * Deliberately two keys rather than one nested structure: every consumer of a
 * list gets a flat array of strings with the same toggle/dedupe semantics, and
 * neither list's format can break the other's. The relationship between them —
 * a bookmarked skill implies a starred book — is enforced where the lists
 * change, not in the data shape: bookmarking auto-stars the book, unstarring a
 * book drops its bookmarks, clearing the shelf clears both.
 *
 * There is no account system and there is not going to be one, so the library
 * is device-local by design. Three constraints shape the implementation:
 *
 * 1. **Several components read it at once** — a star on a card, a star in the
 *    shelf, a bookmark in the rail — and they must never disagree. One
 *    module-level store per list with `useSyncExternalStore` gives every
 *    subscriber the same snapshot in the same render.
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

const EMPTY: readonly string[] = Object.freeze([]);

function createListStore(storageKey: string, keyRe: RegExp, maxEntries: number) {
  let snapshot: readonly string[] | null = null;
  let storageBound = false;
  const listeners = new Set<() => void>();

  function read(): readonly string[] {
    if (typeof window === "undefined") return EMPTY;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return EMPTY;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return EMPTY;
      const clean = [
        ...new Set(parsed.filter((v): v is string => typeof v === "string" && keyRe.test(v))),
      ].slice(0, maxEntries);
      return clean.length === 0 ? EMPTY : Object.freeze(clean);
    } catch {
      // A quota error, a private-mode throw, or someone else's JSON under our
      // key. An empty list is a working page; a thrown render is not.
      return EMPTY;
    }
  }

  function notify() {
    for (const listener of listeners) listener();
  }

  function write(next: readonly string[]) {
    // The in-memory snapshot updates first, so the session behaves correctly
    // even when persisting fails (quota, private mode) — it simply does not
    // survive a reload.
    snapshot = next.length === 0 ? EMPTY : Object.freeze([...next]);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Not persisted; the snapshot above still carries this session.
    }
    notify();
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
      // Another tab wrote. `storage` does not fire in the tab that wrote,
      // which is exactly right — that tab already has the fresh snapshot.
      window.addEventListener("storage", (event) => {
        if (event.key === null || event.key === storageKey) {
          snapshot = null;
          notify();
        }
      });
    }
    return () => {
      listeners.delete(listener);
    };
  }

  /** Add if absent (case-insensitively); newest first, capped. */
  function add(key: string) {
    if (!keyRe.test(key)) return;
    const current = getSnapshot();
    const lower = key.toLowerCase();
    if (current.some((k) => k.toLowerCase() === lower)) return;
    write([key, ...current].slice(0, maxEntries));
  }

  /** Toggle; returns the new "on" state. */
  function toggle(key: string): boolean {
    if (!keyRe.test(key)) return false;
    const current = getSnapshot();
    const on = current.includes(key);
    // Newest first: the list reads as a stack, and the cap drops the oldest.
    const next = on
      ? current.filter((k) => k !== key)
      : [key, ...current].slice(0, maxEntries);
    write(next);
    return !on;
  }

  function removeWhere(predicate: (key: string) => boolean) {
    const current = getSnapshot();
    const next = current.filter((k) => !predicate(k));
    if (next.length !== current.length) write(next);
  }

  /** Replace the whole list — used to persist a reorder. Validated, deduped,
   * capped, so a bad caller can at worst shrink the list, never corrupt it. */
  function replace(next: readonly string[]) {
    const clean = [...new Set(next.filter((k) => keyRe.test(k)))].slice(
      0,
      maxEntries,
    );
    write(clean);
  }

  function clear() {
    write(EMPTY);
  }

  return {
    getSnapshot,
    getServerSnapshot,
    subscribe,
    add,
    toggle,
    removeWhere,
    replace,
    clear,
  };
}

/* ----------------------------------------------------------------- shelf */

/** A shelf entry is exactly `owner/repo`, validated on read and on write. */
const SHELF_KEY_RE = /^[\w.-]{1,39}\/[\w.-]{1,100}$/;

/** Enough for any real reader; a cap stops a corrupt value growing forever. */
const SHELF = createListStore("gsb:shelf", SHELF_KEY_RE, 200);

export function favoriteKey(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

export interface Favorites {
  /** `owner/repo` keys, most recently starred first. */
  keys: readonly string[];
  has: (key: string) => boolean;
  /** Star or unstar; returns the new starred state. Unstarring a book also
   * drops its skill bookmarks — a bookmark implies a starred book. */
  toggle: (key: string) => boolean;
  clear: () => void;
  /** False during SSR and the hydrating render, when `keys` is always empty. */
  ready: boolean;
}

export function useFavorites(): Favorites {
  const keys = useSyncExternalStore(
    SHELF.subscribe,
    SHELF.getSnapshot,
    SHELF.getServerSnapshot,
  );
  const ready = useSyncExternalStore(
    SHELF.subscribe,
    () => true,
    () => false,
  );

  const has = useCallback((key: string) => keys.includes(key), [keys]);

  const toggle = useCallback((key: string) => {
    const starred = SHELF.toggle(key);
    if (!starred) {
      const prefix = `${key.toLowerCase()}/`;
      BOOKMARKS.removeWhere((k) => k.toLowerCase().startsWith(prefix));
    }
    return starred;
  }, []);

  const clear = useCallback(() => {
    SHELF.clear();
    BOOKMARKS.clear();
  }, []);

  return { keys, has, toggle, clear, ready };
}

/* -------------------------------------------------------------- bookmarks */

/**
 * A bookmark is exactly `owner/repo/skill-slug`. The slug is the skill's URL
 * segment, so it can never contain a slash; everything else printable is
 * legal because slugs come from real directory names.
 */
const BOOKMARK_KEY_RE = /^[\w.-]{1,39}\/[\w.-]{1,100}\/[^/\s]{1,200}$/;

const BOOKMARKS = createListStore("gsb:bookmarks", BOOKMARK_KEY_RE, 500);

export function bookmarkKey(owner: string, repo: string, slug: string): string {
  return `${owner}/${repo}/${slug}`;
}

export interface Bookmarks {
  /** `owner/repo/skill-slug` keys, most recently bookmarked first. */
  keys: readonly string[];
  has: (key: string) => boolean;
  /** Bookmark or unbookmark; returns the new bookmarked state. Bookmarking a
   * skill auto-stars its book, so the shelf always holds the bookmark's home. */
  toggle: (key: string) => boolean;
  /** Persist a new order for the whole list — the board's drag writes here. */
  reorder: (next: readonly string[]) => void;
  /** False during SSR and the hydrating render, when `keys` is always empty. */
  ready: boolean;
}

export function useBookmarks(): Bookmarks {
  const keys = useSyncExternalStore(
    BOOKMARKS.subscribe,
    BOOKMARKS.getSnapshot,
    BOOKMARKS.getServerSnapshot,
  );
  const ready = useSyncExternalStore(
    BOOKMARKS.subscribe,
    () => true,
    () => false,
  );

  const has = useCallback((key: string) => keys.includes(key), [keys]);

  const toggle = useCallback((key: string) => {
    const bookmarked = BOOKMARKS.toggle(key);
    if (bookmarked) SHELF.add(key.split("/").slice(0, 2).join("/"));
    return bookmarked;
  }, []);

  const reorder = useCallback((next: readonly string[]) => {
    BOOKMARKS.replace(next);
  }, []);

  return { keys, has, toggle, reorder, ready };
}
