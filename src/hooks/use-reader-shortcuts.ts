"use client";

/**
 * The one keyboard listener.
 *
 * Exactly one, mounted by `ReaderPrefsProvider`, because a second listener
 * would double-fire every action and because the three WCAG 2.1.4 escapes have
 * to be enforced in a single place or they are not enforced at all.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildKeymap,
  CHORD_WINDOW_MS,
  emitShortcut,
  hasShortcutListener,
  normalizeKey,
  type ShortcutAction,
  type ShortcutSettings,
  shouldHandle,
} from "@/lib/shortcuts";

/**
 * Actions whose key would otherwise do something in the browser we do not want.
 *
 * The page-turn aliases are deliberately absent: Space and the arrow keys
 * already scroll, and scrolling is what "next page" means in a scroll-mode
 * reader. Cancelling the native behaviour to reimplement it would break
 * momentum, spatial navigation and every AT that drives the caret.
 */
const PREVENT_DEFAULT: ReadonlySet<ShortcutAction> = new Set([
  "nextChapter",
  "prevChapter",
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
]);

/** Arming `g` is only worth stealing the key for if some branch is handled. */
function chordIsLive(branch: Map<string, ShortcutAction> | undefined): boolean {
  if (!branch) return false;
  for (const action of branch.values()) {
    if (hasShortcutListener(action)) return true;
  }
  return false;
}

export interface ReaderShortcutsState {
  /** The armed first key of a chord, e.g. `"g"`, or null. Render it as a hint. */
  pending: string | null;
}

export function useReaderShortcuts(settings: ShortcutSettings): ReaderShortcutsState {
  const [pending, setPending] = useState<string | null>(null);
  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearChord = useCallback(() => {
    clearTimeout(timerRef.current);
    pendingRef.current = null;
    setPending(null);
  }, []);

  useEffect(() => {
    const { direct, chords } = buildKeymap(settings);

    /**
     * Fire an action, or decline it.
     *
     * Returns false when nothing on this page handles the action, and in that
     * case the browser keeps the keystroke. This is the difference between a
     * shortcut that is unavailable here and a shortcut that steals the key and
     * does nothing: `/` used to be in `PREVENT_DEFAULT` with no subscriber
     * anywhere, so pressing it cancelled the browser's own quick-find and left
     * the reader with neither.
     */
    function fire(action: ShortcutAction, event: KeyboardEvent): boolean {
      if (!hasShortcutListener(action)) return false;
      if (PREVENT_DEFAULT.has(action)) event.preventDefault();
      emitShortcut(action);
      return true;
    }

    function onKeyDown(event: KeyboardEvent) {
      // Escape always closes whatever is open, disabled switch or not: a
      // shortcut you cannot turn off is the problem, an escape hatch you
      // cannot reach is a worse one.
      if (event.key === "Escape") {
        clearChord();
        return;
      }

      if (!shouldHandle(event, settings)) {
        if (pendingRef.current) clearChord();
        return;
      }

      const key = normalizeKey(event);
      if (!key) return;

      const armed = pendingRef.current;
      if (armed) {
        const action = chords.get(armed)?.get(key);
        clearChord();
        if (action && fire(action, event)) return;
        // A chord that did not resolve falls through: `g` then `t` should open
        // the contents rather than silently eating the keystroke.
      }

      const action = direct.get(key);
      if (action && fire(action, event)) return;

      if (chords.has(key) && chordIsLive(chords.get(key))) {
        event.preventDefault();
        pendingRef.current = key;
        setPending(key);
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(clearChord, CHORD_WINDOW_MS);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      clearTimeout(timerRef.current);
    };
  }, [settings, clearChord]);

  return { pending };
}
