"use client";

/**
 * `motion`'s reduced-motion bridge. Owner: WS-7.
 *
 * **Mount this only if something on the page actually uses `motion`.**
 *
 * The chart pack does not. dither-kit's canvas painters check the preference
 * themselves (see the WS-7 patch to `prefersReducedMotion` in
 * `dither-kit/dither-paint.ts`, which also honours our tri-state `data-motion`)
 * and the one component that imports `motion/react` — `dither-kit/tooltip.tsx`
 * — is deliberately never composed: it is wired to pointer events only, a WCAG
 * 2.1.1 failure. With nothing importing it, `motion` drops out of the client
 * bundle entirely; measured at 0 bytes across all client chunks. Mounting this
 * provider at the root would put it back — roughly 34 KB of first-load
 * JavaScript bought for a feature nobody is using.
 *
 * So: keep it in the tree the day a real `motion` animation ships, and not
 * before. When that day comes it belongs in the root layout, inside
 * `ThemeProvider`, wrapping everything.
 *
 * `reducedMotion="user"` makes motion honour the OS media query for transform
 * and layout animations. It cannot see our `data-motion` override — that axis
 * is CSS, handled by the `[data-motion]` rules in `theme-modes.css`, which zero
 * out durations on anything motion renders to the DOM.
 */

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
