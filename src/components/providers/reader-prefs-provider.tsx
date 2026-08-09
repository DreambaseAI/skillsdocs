"use client";

/**
 * The reading-preferences context.
 *
 * Thin by design: the state lives in `lib/reader/store.ts` because the
 * pre-paint script writes the same values onto `<html>` before React exists,
 * and two owners of one document attribute is a bug waiting for a slow
 * network. This component's whole job is to subscribe, to announce, and to
 * keep "which preset am I on" honest.
 */

import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { announce } from "@/components/chrome/live-regions";
import { useReaderShortcuts } from "@/hooks/use-reader-shortcuts";
import { formatKey } from "@/lib/shortcuts";
import {
  applyPreset as applyPresetTo,
  matchPreset,
  type ReaderPreset,
  resetAll,
  resetTypography,
} from "@/lib/reader/presets";
import { DEFAULT_PREFS, type ReaderPrefs } from "@/lib/reader/prefs";
import {
  DEFAULT_STATE,
  type ReaderExtras,
  readerStore,
  serverSnapshot,
} from "@/lib/reader/store";
import type { ShortcutSettings } from "@/lib/shortcuts";

export interface ReaderPrefsContextValue {
  prefs: ReaderPrefs;
  extras: ReaderExtras;
  /** False until storage has been read. Controls render defaults until then. */
  hydrated: boolean;
  /**
   * Change one or more preferences. Pass `say` to announce the result — the
   * caller knows how to phrase it ("Font size 21 pixels"), this does not.
   */
  update: (patch: Partial<ReaderPrefs>, say?: string) => void;
  applyPreset: (preset: ReaderPreset) => void;
  resetType: () => void;
  resetEverything: () => void;
  setShortcuts: (next: ShortcutSettings) => void;
  setFocusMode: (on: boolean) => void;
}

const ReaderPrefsContext = createContext<ReaderPrefsContextValue | null>(null);

export function useReaderPrefs(): ReaderPrefsContextValue {
  const value = useContext(ReaderPrefsContext);
  if (!value) {
    throw new Error("useReaderPrefs must be used inside <ReaderPrefsProvider>");
  }
  return value;
}

export function ReaderPrefsProvider({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(
    readerStore.subscribe,
    readerStore.getState,
    serverSnapshot,
  );
  const hydrated = useSyncExternalStore(
    readerStore.subscribe,
    readerStore.isHydrated,
    () => false,
  );
  const { setTheme } = useTheme();

  useEffect(() => {
    readerStore.hydrate();
  }, []);

  const update = useCallback((patch: Partial<ReaderPrefs>, say?: string) => {
    const current = readerStore.getState().prefs;
    const next = { ...current, ...patch };
    // Nudging one slider after applying "Novel" means you are no longer
    // reading Novel. Recomputing beats trusting a stale label.
    readerStore.setPrefs({ ...next, preset: matchPreset(next) });
    if (say) announce(say);
  }, []);

  const applyPreset = useCallback(
    (preset: ReaderPreset) => {
      const next = applyPresetTo(readerStore.getState().prefs, preset);
      readerStore.setPrefs(next);
      // Sepia under a dark chrome silently resolves to Night, so a preset that
      // only works in one scheme takes the scheme with it rather than
      // half-applying and looking broken.
      if (preset.scheme) setTheme(preset.scheme);
      announce(`${preset.label} preset applied. ${preset.hint}`);
    },
    [setTheme],
  );

  const resetType = useCallback(() => {
    readerStore.setPrefs(resetTypography(readerStore.getState().prefs));
    announce("Typography reset to defaults.");
  }, []);

  const resetEverything = useCallback(() => {
    readerStore.setPrefs(resetAll());
    setTheme("system");
    announce("All reading settings reset to defaults.");
  }, [setTheme]);

  const setShortcuts = useCallback((next: ShortcutSettings) => {
    readerStore.setExtras({ shortcuts: next });
  }, []);

  const setFocusMode = useCallback((on: boolean) => {
    readerStore.setExtras({ focusMode: on });
    announce(on ? "Focus mode on. Press Escape to exit." : "Focus mode off.");
  }, []);

  const value = useMemo<ReaderPrefsContextValue>(
    () => ({
      prefs: hydrated ? state.prefs : DEFAULT_STATE.prefs,
      extras: hydrated ? state.extras : DEFAULT_STATE.extras,
      hydrated,
      update,
      applyPreset,
      resetType,
      resetEverything,
      setShortcuts,
      setFocusMode,
    }),
    [
      state,
      hydrated,
      update,
      applyPreset,
      resetType,
      resetEverything,
      setShortcuts,
      setFocusMode,
    ],
  );

  return (
    <ReaderPrefsContext.Provider value={value}>
      {children}
      <ChordHint />
    </ReaderPrefsContext.Provider>
  );
}

/**
 * The keyboard layer, and the visible receipt that a chord is armed.
 *
 * Two-key sequences without feedback are indistinguishable from a dead
 * keyboard: you press `G`, nothing happens, and you press it again. The hint
 * is `aria-hidden` because the chord is a sighted-pointerless affordance and a
 * screen reader announcing "G pending" mid-sequence is noise.
 */
function ChordHint() {
  const { extras } = useReaderPrefs();
  const { pending } = useReaderShortcuts(extras.shortcuts);

  if (!pending) return null;

  return (
    <div
      aria-hidden
      className="bg-popover text-popover-foreground ring-foreground/10 pointer-events-none fixed bottom-6 left-6 z-60 rounded-2xl px-3 py-2 font-mono text-xs shadow-lg ring-1"
    >
      {formatKey(pending).join(" ")} …
    </div>
  );
}

/** The factory settings, re-exported so callers need one import, not two. */
export { DEFAULT_PREFS };
