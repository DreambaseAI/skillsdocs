"use client";

/**
 * Focus mode: everything dims except the block you are reading.
 *
 * Three rules make this safe rather than hostile:
 *
 * 1. **It is escapable.** `Escape` exits, the panel switch exits, and both say
 *    so. A reading mode that dims the page and traps you in it is a bug report.
 * 2. **It never dims at high contrast.** Reducing contrast is the entire
 *    mechanism, so under `data-contrast="high"` `reader.css` pins every block
 *    back to full opacity and the mode becomes a no-op rather than a
 *    regression.
 * 3. **It marks blocks, it does not hide them.** The dimmed content stays in
 *    the DOM, in order, selectable and searchable; `opacity` is the only thing
 *    that changes, so nothing is removed from the accessibility tree.
 *
 * The active block is chosen by an IntersectionObserver with a one-line band
 * across the middle of the viewport, not by pointer position: keyboard and
 * screen-reader users scroll too.
 */

import { useCallback, useEffect, useRef } from "react";

export interface FocusModeProps {
  enabled: boolean;
  /** Called when the reader escapes. Must actually turn the mode off. */
  onExit: () => void;
  /** The blocks that can hold focus. Defaults to the rendered prose. */
  selector?: string;
}

const DEFAULT_SELECTOR = ".reader .prose > *";

export function FocusMode({ enabled, onExit, selector = DEFAULT_SELECTOR }: FocusModeProps) {
  /*
   * Held in a ref so an inline `onExit` closure from the caller does not tear
   * the mode down and rebuild it — observer, listener and all — on every
   * unrelated render of the controls tree.
   */
  const onExitRef = useRef(onExit);
  useEffect(() => {
    onExitRef.current = onExit;
  });
  const exit = useCallback(() => onExitRef.current(), []);

  useEffect(() => {
    const root = document.documentElement;
    if (!enabled) {
      root.removeAttribute("data-focus-mode");
      return;
    }

    root.setAttribute("data-focus-mode", "on");

    const blocks = Array.from(document.querySelectorAll<HTMLElement>(selector));
    let active: HTMLElement | null = null;

    function setActive(next: HTMLElement | null) {
      if (next === active) return;
      active?.removeAttribute("data-focus-active");
      next?.setAttribute("data-focus-active", "");
      active = next;
    }

    /*
     * A 1px band across the vertical centre. The observer fires only for blocks
     * crossing that line, so "which paragraph am I reading" costs nothing per
     * frame — unlike measuring every block on every scroll event.
     */
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target as HTMLElement);
        }
      },
      { rootMargin: "-50% 0px -50% 0px", threshold: 0 },
    );

    for (const block of blocks) observer.observe(block);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      exit();
    }

    // The switch already announced the change; saying it again here would
    // double up every time the effect re-ran.
    document.addEventListener("keydown", onKeyDown);

    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", onKeyDown);
      setActive(null);
      root.removeAttribute("data-focus-mode");
    };
  }, [enabled, exit, selector]);

  if (!enabled) return null;

  /*
   * A real button, not just the Escape key. Escape is discoverable only if you
   * already know it is there, and this mode has no other visible chrome.
   */
  return (
    <button
      type="button"
      onClick={exit}
      className="bg-popover text-popover-foreground ring-foreground/10 fixed right-4 bottom-4 z-50 rounded-2xl px-3 py-2 text-xs font-medium shadow-lg ring-1"
    >
      Exit focus mode
      <span className="sr-only"> (or press Escape)</span>
    </button>
  );
}
