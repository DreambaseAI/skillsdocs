"use client";

import { ArrowUp01Icon, Menu01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState, type ReactNode } from "react";
import { useHideOnScroll } from "@/hooks/use-hide-on-scroll";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * The mobile contents control.
 *
 * A single pill in the thumb zone, 24px above the safe-area inset. Not a
 * top-right icon: on a 6.7-inch phone the top-right corner is the hardest
 * point on the screen to reach one-handed, and contents is the control a
 * reader reaches for most.
 *
 * **No horizontal swipe is bound.** A left-edge swipe to open the sheet would
 * collide with the iOS interactive back gesture, and losing back navigation is
 * a far worse trade than a tap.
 *
 * The reading-controls trigger (`Aa`, WS-5) belongs in this same pill; the
 * `slot` prop is where it goes.
 */

export interface MobileContentsProps {
  /** The contents list, rendered on the server. */
  children: ReactNode;
  title: string;
  subtitle?: string;
  /** Extra controls placed to the right of Contents inside the pill. */
  slot?: ReactNode;
}

export function MobileContents({
  children,
  title,
  subtitle,
  slot,
}: MobileContentsProps) {
  const [open, setOpen] = useState(false);
  // Scrolling down is reading; a control parked over the paragraph you are
  // reading is the one thing a floating control must never be. Mirrors the
  // site header exactly, and never hides while the sheet is open.
  const hidden = useHideOnScroll(!open);

  return (
    <>
      <div
        className="book-pill"
        data-print="hide"
        data-hidden={hidden ? "true" : undefined}
      >
        <div className="book-pill__inner translucent-surface">
          <button
            type="button"
            className="book-pill__button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
          >
            <HugeiconsIcon icon={Menu01Icon} className="size-4" aria-hidden />
            Contents
          </button>

          {/* WS-5's `Aa` trigger portals itself in here on phones. Rendered as
              a real element rather than a conditional so the portal target
              exists on first paint. */}
          <span id="reader-controls-slot" className="contents">
            {slot}
          </span>

          <span aria-hidden="true" className="bg-rule h-5 w-px" />

          <button
            type="button"
            className="book-pill__button"
            onClick={() =>
              window.scrollTo({
                top: 0,
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                  .matches
                  ? "auto"
                  : "smooth",
              })
            }
          >
            <HugeiconsIcon icon={ArrowUp01Icon} className="size-4" aria-hidden />
            <span className="sr-only">Back to the top of the page</span>
          </button>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="w-[min(20rem,88vw)] sm:max-w-none"
          // The reading surface follows the reader into the sheet; a stone
          // panel over paper reads as a different application.
        >
          <SheetHeader className="pb-2">
            <SheetTitle>{title}</SheetTitle>
            {subtitle ? <SheetDescription>{subtitle}</SheetDescription> : null}
          </SheetHeader>
          {/* Delegated so the sheet closes with the navigation it started.
              Every interactive descendant is a real anchor, so keyboard users
              reach this handler through the link's own activation — there is
              no interaction here that a key press cannot perform. */}
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
          <div
            className="reader min-h-0 flex-1 overflow-y-auto px-6"
            style={{ fontSize: "1rem" }}
            onClick={(event) => {
              // A tap on a chapter link should close the sheet with the
              // navigation, not leave it hanging over the page it opened.
              if ((event.target as HTMLElement).closest("a")) setOpen(false);
            }}
          >
            {children}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
