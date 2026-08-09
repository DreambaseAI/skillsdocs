"use client";

/**
 * The `Aa` affordance and the surface behind it.
 *
 * Two surfaces, one panel:
 *
 * - **Desktop: a non-modal `Popover`.** Non-modal is the whole design. Every
 *   control here changes the text behind the panel, and a modal surface — with
 *   its backdrop, its focus trap and its scroll lock — would hide the only
 *   feedback the controls have. A reader dragging the measure slider has to be
 *   able to watch the column reflow.
 * - **Mobile: a `Drawer` with snap points.** 40% leaves the paragraph above it
 *   visible; 92% is for the reader who came to change six things.
 *
 * The trigger follows the same logic. Top-right on desktop, where it sits with
 * the rest of the chrome; a floating pill 20px above the safe-area inset on a
 * phone, because a settings button in the top-right corner of a 6-inch screen
 * is a settings button most people never press.
 */

import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { announce } from "@/components/chrome/live-regions";
import { ShortcutsDialog } from "@/components/chrome/shortcuts-dialog";
import { FocusMode } from "@/components/reader/focus-mode";
import { ReaderPanel } from "@/components/reader/controls/panel";
import { sizeAnnouncement } from "@/components/reader/controls/size-stepper";
import { useReaderPrefs } from "@/components/providers/reader-prefs-provider";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useShortcut } from "@/hooks/use-shortcut";
import { SIZE_STEPS } from "@/lib/reader/prefs";
import { cn } from "@/lib/utils";

const TITLE = "Reading controls";
const DESCRIPTION = "Changes apply as you make them. Nothing here needs saving.";

/**
 * The id the reading routes render inside their mobile pill. When it is on the
 * page the phone trigger moves into that pill rather than floating a second
 * one over it — two fixed pills, both bottom-centre, would sit on top of each
 * other. Home and search have no pill, so the trigger floats there instead.
 */
const PILL_SLOT_ID = "reader-controls-slot";

/** The skip-link target and the a11y suite's `controlsTrigger` contract. */
const TRIGGER_ID = "reader-controls";

/**
 * Resolves the mobile pill's slot element.
 *
 * The controls mount in the layout; the pill is in the page body behind a
 * Suspense boundary, so on a cold load at phone width the slot does not exist
 * yet when this first runs. A single `getElementById` at mount silently loses
 * that race and the reader gets no `Aa` button at all — observed. The observer
 * closes the gap and disconnects the moment the slot appears.
 */
function subscribeToPillSlot(onChange: () => void): () => void {
  if (typeof document === "undefined") return () => {};

  // Never stops watching. A first-match-then-disconnect observer looked
  // cheaper and was wrong: navigating cover → chapter swaps the pill for a new
  // element, and a disconnected observer leaves the portal pointing at the
  // removed node, so the `Aa` button vanishes on every route change after the
  // first. Observed. Re-reads are coalesced to one per frame and the snapshot
  // is compared by identity, so a quiet page costs nothing.
  let frame = 0;
  const observer = new MutationObserver(() => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      onChange();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
  };
}

function readPillSlot(): HTMLElement | null {
  if (typeof document === "undefined") return null;

  // Next 16 keeps the previous route mounted under `display: none` for instant
  // back-navigation, so there can legitimately be two slots on the page and
  // `getElementById` would hand back the dead one.
  const slots = document.querySelectorAll<HTMLElement>(`#${PILL_SLOT_ID}`);
  for (const slot of slots) {
    let node: HTMLElement | null = slot;
    let hidden = false;
    while (node && !hidden) {
      if (getComputedStyle(node).display === "none") hidden = true;
      node = node.parentElement;
    }
    if (!hidden) return slot;
  }
  return slots[0] ?? null;
}

function usePillSlot(active: boolean): HTMLElement | null {
  // The DOM is the external store: `useSyncExternalStore` re-reads only when
  // the observer fires, and re-renders only when the element identity changes.
  const node = useSyncExternalStore(subscribeToPillSlot, readPillSlot, () => null);
  return active ? node : null;
}

export interface ReaderControlsProps {
  className?: string;
}

export function ReaderControls({ className }: ReaderControlsProps) {
  const { prefs, extras, update, setFocusMode } = useReaderPrefs();
  const [open, setOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const pillSlot = usePillSlot(!isDesktop);

  useShortcut("controls", () => setOpen((wasOpen) => !wasOpen));
  useShortcut("help", () => setShortcutsOpen(true));

  // `Z` — hide the chrome. Advertised in the keymap with a key cap since the
  // beginning and subscribed by nothing, so the key was cancelled and nothing
  // happened. This component already owns the switch.
  useShortcut("immersive", () => {
    const next = !extras.focusMode;
    setFocusMode(next);
    announce(next ? "Focus mode on. Press Escape to exit." : "Focus mode off.");
  });

  const stepSize = useCallback(
    (delta: number) => {
      const next = Math.min(
        SIZE_STEPS.length - 1,
        Math.max(0, prefs.sizeIndex + delta),
      );
      if (next === prefs.sizeIndex) {
        announce(
          delta > 0 ? "Already at the largest size" : "Already at the smallest size",
        );
        return;
      }
      update({ sizeIndex: next }, sizeAnnouncement(next, prefs.font));
    },
    [prefs.sizeIndex, prefs.font, update],
  );

  useShortcut("sizeUp", () => stepSize(1));
  useShortcut("sizeDown", () => stepSize(-1));

  const openShortcuts = useCallback(() => {
    setOpen(false);
    setShortcutsOpen(true);
  }, []);

  const panel = <ReaderPanel onOpenShortcuts={openShortcuts} />;

  return (
    <>
      {isDesktop ? (
        <Popover open={open} onOpenChange={setOpen} modal={false}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                id={TRIGGER_ID}
                data-slot="controls-trigger"
                variant="ghost"
                size="icon-sm"
                className={className}
                aria-label={TITLE}
                // The trigger opens a `role="dialog"`; without this a screen
                // reader announces "expanded" with no hint of what expands.
                // `MobileContents` already did this and these did not.
                aria-haspopup="dialog"
              />
            }
          >
            <TriggerGlyph />
          </PopoverTrigger>
          <PopoverContent
            align="end"
            side="bottom"
            sideOffset={8}
            // `76dvh` left 170px of a 900px viewport unused while cutting the
            // "Newsreader" and "EB Garamond" cards in half, with no fade, no
            // shadow and no visible scrollbar to say there was more. The panel
            // now takes everything under the header, and `reader-panel--scroll`
            // masks its bottom edge so the cut always reads as "continues".
            className="reader-panel reader-panel--scroll w-[min(24rem,calc(100vw-2rem))] max-h-[calc(100dvh-var(--header-h)-2rem)] overflow-y-auto overscroll-contain"
          >
            <PopoverHeader className="relative">
              <PopoverTitle>{TITLE}</PopoverTitle>
              <PopoverDescription>{DESCRIPTION}</PopoverDescription>
              <ClosePanelButton onClose={() => setOpen(false)} />
            </PopoverHeader>
            {panel}
          </PopoverContent>
        </Popover>
      ) : (
        <>
          {(() => {
            const trigger = (
              <Button
                type="button"
                id={TRIGGER_ID}
                data-slot="controls-trigger"
                variant={pillSlot ? "ghost" : "secondary"}
                size="sm"
                aria-label={TITLE}
                aria-expanded={open}
                aria-haspopup="dialog"
                className={cn(
                  // Inside the pill it has to match its neighbours' 44px tap
                  // target (2.5.5 AAA), which `size="sm"` alone does not give.
                  pillSlot
                    ? "min-h-11 min-w-11 rounded-full"
                    : "reader-controls-pill shadow-lg",
                  className,
                )}
                onClick={() => setOpen(true)}
              >
                <TriggerGlyph />
              </Button>
            );
            return pillSlot ? createPortal(trigger, pillSlot) : trigger;
          })()}

          <Drawer
            open={open}
            onOpenChange={setOpen}
            modal={false}
            showSwipeHandle
            snapPoints={[0.4, 0.92]}
          >
            <DrawerContent className="reader-panel">
              {/* Left-aligned on every width. The drawer centred its title on
                  a phone while the popover left-aligned the identical string,
                  so the same control had two different layouts. */}
              <DrawerHeader className="relative text-left group-data-[swipe-axis=y]/drawer-popup:text-left">
                <DrawerTitle>{TITLE}</DrawerTitle>
                <DrawerDescription>{DESCRIPTION}</DrawerDescription>
                <ClosePanelButton onClose={() => setOpen(false)} />
              </DrawerHeader>
              <div className="reader-panel--scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
                {panel}
              </div>
            </DrawerContent>
          </Drawer>
        </>
      )}

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      {/* Mounted here because this is the one component guaranteed to be on
          every reading route and to already own the switch that turns it on. */}
      <FocusMode enabled={extras.focusMode} onExit={() => setFocusMode(false)} />
    </>
  );
}

/**
 * The labelled way out, inside the popup.
 *
 * ARCHITECTURE §7.2 requires a `Close` *inside* every dialog/drawer popup, and
 * this panel was the one surface that shipped without one: the only ways out
 * were a backdrop tap and an `aria-hidden`, drag-only swipe handle. On iOS
 * VoiceOver there is no Escape key and no discoverable exit, so a reader who
 * opened the panel by touch had no announced way to leave it. `MobileContents`
 * got this right; these two did not.
 */
function ClosePanelButton({ onClose }: { onClose: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Close reading controls"
      className="absolute top-0 right-0"
      onClick={onClose}
    >
      <HugeiconsIcon icon={Cancel01Icon} aria-hidden />
    </Button>
  );
}

/**
 * `Aa` set in the reader's own face, so the button is a specimen of what it
 * controls. An icon would be one more glyph to learn; every reading app on the
 * phone already uses these two letters.
 */
function TriggerGlyph() {
  return (
    <span aria-hidden className="font-reader text-base leading-none">
      Aa
    </span>
  );
}
