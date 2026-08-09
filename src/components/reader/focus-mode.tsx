"use client";

/**
 * Focus mode: the rails recede as you read on, and come back when you look up.
 *
 * ## Two designs that did not work
 *
 * First it dimmed every block except the one crossing the middle of the
 * viewport. That fought the reader's own eye — you could not skim or glance
 * back at the line above — and because dimming *is* a contrast reduction it
 * had to switch itself off at `data-contrast="high"`, so the readers most
 * likely to want fewer distractions were the only ones who could not have it.
 *
 * Then it collapsed the rails to a hover strip and widened the column. Two
 * problems, both fair: the target was invisible, so there was nothing to tell
 * you *where* to hover; and animating grid tracks moves the text you are
 * reading, which is the one thing a reading mode must never do.
 *
 * ## What it does now
 *
 * Nothing moves. The rails keep their width and their place, and only their
 * opacity changes — driven by scroll direction, continuously. Read on and they
 * recede; scroll back and they return. The gesture is one you are already
 * making, so there is no target to find.
 *
 * Coming back is deliberately about twice as fast as going away: receding
 * should be gradual enough that you do not notice it happening, but wanting
 * the contents back is an intention, and an intention should be answered at
 * once.
 *
 * `book.css` owns the opacity; this component owns the number it reads.
 */

import { useCallback, useEffect, useRef } from "react";
import { announce } from "@/components/chrome/live-regions";

export interface FocusModeProps {
  enabled: boolean;
  /** Called when the reader escapes. Must actually turn the mode off. */
  onExit: () => void;
}

/** Downward pixels to fade the rails out completely. */
const FADE_OUT_PX = 340;
/** Upward pixels to bring them fully back. */
const FADE_IN_PX = 150;
/**
 * Above this scroll position the rails are always shown. The top of a chapter
 * is where the contents are most useful, and fading them there would mean the
 * mode's first act is to hide something you have not started reading past.
 */
const ALWAYS_VISIBLE_ABOVE = 200;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export function FocusMode({ enabled, onExit }: FocusModeProps) {
  /*
   * Held in a ref so an inline `onExit` closure from the caller does not tear
   * the listeners down and rebuild them on every unrelated render of the
   * controls tree.
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
      root.style.removeProperty("--rail-veil");
      return;
    }

    root.setAttribute("data-focus-mode", "on");

    let veil = 1;
    let lastY = window.scrollY;
    let frame = 0;

    const write = () => {
      frame = 0;
      root.style.setProperty("--rail-veil", veil.toFixed(3));
    };

    function onScroll() {
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;

      if (y <= ALWAYS_VISIBLE_ABOVE) {
        veil = 1;
      } else if (dy > 0) {
        veil = clamp01(veil - dy / FADE_OUT_PX);
      } else if (dy < 0) {
        veil = clamp01(veil - dy / FADE_IN_PX);
      }

      // One write per frame: a scroll handler that touches style on every
      // event is how a reading page starts dropping frames.
      if (!frame) frame = requestAnimationFrame(write);
    }

    /*
     * Escape exits — but only when nothing else wants it. A dialog, popover or
     * drawer open on top has the stronger claim, and stealing Escape from it
     * would strand the reader inside the overlay.
     */
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      event.preventDefault();
      exit();
      announce("Focus mode off.");
    }

    write();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("keydown", onKeyDown);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("keydown", onKeyDown);
      root.removeAttribute("data-focus-mode");
      root.style.removeProperty("--rail-veil");
    };
  }, [enabled, exit]);

  return null;
}
