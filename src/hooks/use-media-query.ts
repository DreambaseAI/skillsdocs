"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A media query as React state.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: the server has
 * no viewport, so the server snapshot is always `false`, and the subscription
 * is the browser's own `MediaQueryList` rather than a copy of it that can drift.
 *
 * Callers must treat `false` as "not yet known" on the first client render, not
 * as "definitely narrow" — which is why the controls panel picks its surface
 * from a `min-width` query and renders the mobile pill only once the query has
 * actually reported.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** True when the OS asks for less motion. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
