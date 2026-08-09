"use client";

import { useEffect, useRef, useState } from "react";

/**
 * True while the reader is scrolling *down* past `after` pixels.
 *
 * The Safari/Instapaper pattern, and the site header has used it since the
 * first build. It moved out of `site-header.tsx` because the floating reading
 * pill needs exactly the same behaviour and for exactly the same reason: on a
 * phone, furniture that stays put while the text under it moves is furniture
 * that is over a line of prose most of the time.
 *
 * The 4px dead-band is not cosmetic. Without it, momentum scrolling on iOS
 * flips the sign of the delta on every rubber-band frame and the bar strobes.
 */
export function useHideOnScroll(enabled: boolean, after = 120): boolean {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  /*
   * `enabled` is applied on the way *out* rather than by resetting state inside
   * the effect. A `setHidden(false)` in the effect body is a cascading render —
   * React lints it, and it is avoidable: the only thing the disabled case needs
   * is for the answer to be `false`, which is a derivation, not a state
   * transition. The stale `hidden` is harmless because nothing reads it while
   * the hook is disabled.
   */

  useEffect(() => {
    if (!enabled) return;
    lastY.current = window.scrollY;

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        const delta = y - lastY.current;
        if (Math.abs(delta) > 4) {
          setHidden(y > after && delta > 0);
          lastY.current = y;
        }
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [enabled, after]);

  return enabled && hidden;
}
