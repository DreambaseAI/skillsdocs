"use client";

import { Home01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AccountButton } from "@/components/chrome/account-button";
import { ThemeToggleButton } from "@/components/chrome/theme-toggle";
import { useHideOnScroll } from "@/hooks/use-hide-on-scroll";
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
        // 94/88, not 85/70. At 70% over a blur the body text underneath stayed
        // legible as a grey smear inside the header band — measured on a scrolled
        // chapter at 1440, worse in dark. A header is chrome; you should not be
        // able to read the page through it.
        "bg-background/94 border-border sticky top-0 z-50 border-b transition-transform duration-200",
        "supports-backdrop-filter:bg-background/88 supports-backdrop-filter:backdrop-blur-xl",
        hidden ? "-translate-y-full lg:translate-y-0" : "translate-y-0",
      )}
      style={{ height: "var(--header-h)" }}
    >
      {/* Same box as `.book-frame` in book.css — 96rem wide, and the identical
          gutter ladder — so the brand sits on the same vertical as the left
          rail instead of 30px inside it. One gutter per page, not two. */}
      <div className="mx-auto flex h-full max-w-[96rem] items-center gap-2 px-[max(1.25rem,5vw)] lg:px-10 xl:px-12">
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
          <AccountButton />
        </div>
      </div>
    </header>
  );
}
