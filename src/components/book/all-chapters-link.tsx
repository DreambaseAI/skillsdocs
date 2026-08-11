"use client";

/**
 * "All N chapters →" on the opening spread.
 *
 * The full chapter list lives in exactly two places: the contents rail
 * (≥1280px) and the floating pill's sheet (below that). This control routes to
 * whichever one exists at the current width — focus the rail where it is
 * visible, open the sheet where it is not — instead of anchoring to a list
 * the page no longer prints in its column.
 */

import { announce } from "@/components/chrome/live-regions";

/** Fired to ask `MobileContents` to open its sheet. */
export const OPEN_CONTENTS_EVENT = "book:open-contents";

/** The contents rail's `<nav>`; see `rail-left.tsx`. */
const RAIL_ID = "book-rail-contents";

/** Must match the `--book-rail-left` breakpoint in book.css. */
const RAIL_QUERY = "(min-width: 80rem)";

export function AllChaptersLink({ chapters }: { chapters: number }) {
  return (
    <button
      type="button"
      onClick={() => {
        const rail = document.getElementById(RAIL_ID);
        if (window.matchMedia(RAIL_QUERY).matches && rail) {
          rail.scrollIntoView({
            block: "start",
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
              .matches
              ? "auto"
              : "smooth",
          });
          rail.focus({ preventScroll: true });
          announce("Contents rail");
        } else {
          window.dispatchEvent(new Event(OPEN_CONTENTS_EVENT));
        }
      }}
      className="text-ink hover:text-issue-accent flex w-full cursor-pointer items-center justify-between gap-4 pt-4 text-sm font-medium transition-colors"
    >
      All {chapters} chapters
      <span aria-hidden>→</span>
    </button>
  );
}
