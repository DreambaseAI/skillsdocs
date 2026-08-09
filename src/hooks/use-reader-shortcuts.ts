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
  ownsKeyNatively,
  type ShortcutAction,
  type ShortcutSettings,
  shouldHandle,
} from "@/lib/shortcuts";

/**
 * Actions whose key would otherwise do something in the browser we do not want.
 *
 * The page-turn pair is in here now, and that is a reversal worth stating.
 * While nothing implemented `pageDown`/`pageUp` the honest thing was to leave
 * Space and the arrows to the browser — native scrolling *is* a page turn.
 * Now that `BookShortcuts` owns the scroll (a measured 90% of the viewport,
 * smooth or instant according to the tri-state motion preference), leaving the
 * default in place would run both: measured, Space moved the document 1.9
 * viewports in one press.
 *
 * The two things that made the old comment right are preserved, but by
 * `ownsKeyNatively` rather than by declining to act: Space still activates the
 * focused button, and the arrow keys still belong to any slider, radio group
 * or tab list that has focus.
 */
const PREVENT_DEFAULT: ReadonlySet<ShortcutAction> = new Set([
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

      // Escape (a) again, one level finer. `shouldHandle` asks "is this text?";
      // this asks "does the focused control already mean something by this
      // key?" — Space on a button, `→` on a slider. Both must reach the widget
      // untouched, and neither is an editable target.
      if (ownsKeyNatively(key, event.target)) {
        if (pendingRef.current) clearChord();
        return;
      }

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
