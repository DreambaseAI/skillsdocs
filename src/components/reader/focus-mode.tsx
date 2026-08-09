"use client";

/**
 * Focus mode: the rails step back, the page keeps reading.
 *
 * ## What changed, and why
 *
 * This used to dim every block except the one crossing the middle of the
 * viewport. That is a demo, not a reading mode. It fought the reader's own
 * eye — you cannot skim, you cannot glance back at the sentence above, and
 * anyone reading faster than the IntersectionObserver saw the paragraph they
 * were on go grey. It also had to switch itself off entirely at
 * `data-contrast="high"`, because dimming *is* a contrast reduction, which
 * meant the feature simply did not exist for the readers most likely to want
 * fewer distractions.
 *
 * What actually distracts is the furniture: a contents rail on the left and a
 * heading rail on the right, both moving as you scroll. So focus mode now
 * retires the rails and gives the column their room. The prose is never
 * touched, so it works identically at high contrast.
 *
 * ## Getting back
 *
 * A mode that hides navigation has to make it obvious how to get it back, or
 * it is a trap. Three ways, all of them cheap:
 *
 * 1. **Hover either edge.** Each rail keeps a narrow live strip, so moving the
 *    pointer toward where the rail *was* brings it back — the affordance is in
 *    the place you already reached for.
 * 2. **Tab into it.** `:focus-within` reveals the rail, so a keyboard user
 *    never focuses something invisible. This is the difference between a
 *    reading mode and a WCAG 2.4.7 failure.
 * 3. **Escape**, the toolbar button, or `z`. All three exit and all three say
 *    so out loud.
 *
 * The reveal is CSS — `book.css` owns it. This component only owns the state:
 * the attribute, the escape hatch, and the announcement.
 */

import { useCallback, useEffect, useRef } from "react";
import { announce } from "@/components/chrome/live-regions";

export interface FocusModeProps {
  enabled: boolean;
  /** Called when the reader escapes. Must actually turn the mode off. */
  onExit: () => void;
}

export function FocusMode({ enabled, onExit }: FocusModeProps) {
  /*
   * Held in a ref so an inline `onExit` closure from the caller does not tear
   * the listener down and rebuild it on every unrelated render of the
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
      return;
    }

    root.setAttribute("data-focus-mode", "on");

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

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      root.removeAttribute("data-focus-mode");
    };
  }, [enabled, exit]);

  return null;
}
