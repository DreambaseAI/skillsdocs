"use client";

import { Home01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ThemeToggleButton } from "@/components/chrome/theme-toggle";
import { SITE_NAME } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * The banner landmark.
 *
 * Chrome, not paper: it uses the stone tokens and looks the same in every
 * issue. Twenty repositories rendered as twenty differently-coloured websites
 * would stop reading as one publication, so per-issue branding is confined to
 * the surface below this bar.
 *
 * On a phone the bar translates out on scroll-down past 120px and returns on
 * any scroll-up — the Safari/Instapaper pattern. It is only worth doing where
 * 3.5rem is a real fraction of the viewport, so it is disabled from `lg` up
 * where the rails are sticky to `--header-h` and a moving header would make
 * them jump.
 */

const HIDE_AFTER = 120;

function useHideOnScroll(enabled: boolean): boolean {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

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
        // A 4px dead-band: without it, momentum scrolling on iOS toggles the
        // bar on every rubber-band frame.
        if (Math.abs(delta) > 4) {
          setHidden(y > HIDE_AFTER && delta > 0);
          lastY.current = y;
        }
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [enabled]);

  return hidden;
}

export interface SiteHeaderProps {
  /** The identity slot — a server component streamed in by the route. */
  children?: ReactNode;
  /** Trailing actions, right of the theme toggle. */
  actions?: ReactNode;
  /** Disable the mobile hide-on-scroll behaviour. */
  pinned?: boolean;
}

export function SiteHeader({ children, actions, pinned = false }: SiteHeaderProps) {
  const hidden = useHideOnScroll(!pinned);

  return (
    <header
      data-print="hide"
      className={cn(
        "bg-background/85 border-border sticky top-0 z-50 border-b transition-transform duration-200",
        "supports-backdrop-filter:bg-background/70 supports-backdrop-filter:backdrop-blur-xl",
        hidden ? "-translate-y-full lg:translate-y-0" : "translate-y-0",
      )}
      style={{ height: "var(--header-h)" }}
    >
      <div className="mx-auto flex h-full max-w-[96rem] items-center gap-2 px-[max(0.75rem,3vw)] lg:px-6">
        <Link
          href="/"
          className="text-foreground hover:bg-muted focus-visible:ring-ring/40 focus-visible:border-ring -ml-1.5 flex h-8 shrink-0 items-center gap-2 rounded-full border border-transparent px-2 text-sm font-medium focus-visible:ring-3"
        >
          <HugeiconsIcon icon={Home01Icon} className="size-4" aria-hidden />
          <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
            {SITE_NAME}
          </span>
        </Link>

        <span
          aria-hidden="true"
          className="bg-border hidden h-4 w-px shrink-0 sm:block"
        />

        <div className="flex min-w-0 flex-1 items-center">{children}</div>

        <div className="flex shrink-0 items-center gap-1">
          {actions}
          <ThemeToggleButton />
        </div>
      </div>
    </header>
  );
}
