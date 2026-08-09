"use client";

/**
 * The three runtime facts every chart needs and none of them can be known on
 * the server. Owner: WS-7.
 *
 * - which ground it is painting on (canvas colours are literals, so the chart
 *   has to choose a seed set itself),
 * - whether motion is wanted,
 * - whether we have hydrated yet.
 *
 * All three are read with `useSyncExternalStore` against the live DOM rather
 * than from a React context, because the values are written to
 * `documentElement` before first paint — `ThemeProvider` sets `.dark`,
 * `ReaderPrefsScript` sets `data-motion` — and a context would lag them by a
 * render.
 */

import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ChartScheme } from "./seeds";

/** Attribute/class mutations on `<html>`, shared by both observers below. */
function subscribeToRoot(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-motion"],
  });
  return () => observer.disconnect();
}

function readScheme(): ChartScheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * The colour scheme the chart is painting onto.
 *
 * The server snapshot is `"light"`, which would be a hydration mismatch if the
 * value reached the SSR markup — it does not: charts render their frame and
 * data table on the server and only mount the canvas after
 * {@link useChartMounted} flips. Read this inside the client tree only.
 */
export function useChartScheme(): ChartScheme {
  return useSyncExternalStore(subscribeToRoot, readScheme, () => "light");
}

function subscribeToMotion(onChange: () => void): () => void {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  const stopObserving = subscribeToRoot(onChange);
  return () => {
    query.removeEventListener("change", onChange);
    stopObserving();
  };
}

function readReducedMotion(): boolean {
  // Tri-state, matching `lib/reader/prefs.ts`: an explicit choice wins over the
  // OS, in both directions. Absent attribute means "system".
  const mode = document.documentElement.dataset.motion;
  if (mode === "reduce") return true;
  if (mode === "allow") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Whether entrance animation and sparkle should be suppressed.
 *
 * Defaults to `true` on the server and on the very first client render: a chart
 * that appears without animating is always acceptable, one that animates
 * against an explicit preference is not.
 */
export function useChartReducedMotion(): boolean {
  return useSyncExternalStore(subscribeToMotion, readReducedMotion, () => true);
}

const NEVER = () => () => {};

/**
 * False during SSR and the hydration render, true afterwards.
 *
 * The canvas charts measure their container in a layout effect and paint from a
 * rAF loop, so they contribute nothing to the server HTML anyway. Holding them
 * back until after hydration means the seed colour, the bloom mode and the
 * motion preference — all of which differ between the server's assumptions and
 * the reader's actual settings — can never produce a mismatch. The fixed-height
 * frame is server-rendered, so nothing shifts when they arrive.
 */
export function useChartMounted(): boolean {
  return useSyncExternalStore(
    NEVER,
    () => true,
    () => false,
  );
}

/** Advance width of one character in the 10px monospace face the axes use. */
const AXIS_CHAR_PX = 6.4;

/**
 * Measure an element's CSS width.
 *
 * Returns the ref and the width as two separate values rather than one object:
 * a ref bundled into a returned object trips `react-hooks/refs`, which reads
 * any property access on it as a read of `.current` during render.
 */
export function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () =>
      setWidth((prev) =>
        prev === element.clientWidth ? prev : element.clientWidth,
      );
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

/**
 * How many characters of an axis label fit in one of `slots` equal columns.
 *
 * A category axis cannot solve this with a media query. The same chart appears
 * in a full-bleed spread and in a third of a directory grid, and the number of
 * categories is data, not layout — five repos at 1440px have room for the whole
 * name, five repos at 375px have room for eight characters. Dropping ticks
 * instead (dither-kit's `maxTicks`) leaves bars with no label at all, which is
 * worse than a short one. So: measure, then truncate to fit.
 *
 * Returns a generous default before the first measurement lands; the charts do
 * not draw until they are measured either, so nothing renders at that size.
 */
export function axisLabelChars(
  width: number,
  slots: number,
  gutterPx: number,
): number {
  if (width === 0 || slots === 0) return 24;
  return Math.max(4, Math.floor((width - gutterPx) / slots / AXIS_CHAR_PX));
}
