/**
 * The masthead that sits above every page this workstream owns.
 *
 * Not `chrome/site-header.tsx` — that file belongs to the book shell, which
 * has a running head, a spine and per-issue branding to carry. This is the
 * publication's own nameplate: wordmark, a hairline, and the two controls a
 * directory needs.
 *
 * The ⌘K palette arrives as a node rather than as data so the caller can put
 * it behind its own `<Suspense>` boundary. The nameplate is static and must
 * paint with the shell; the 600-record search corpus must not hold it up.
 */

import { Github01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggleButton } from "@/components/chrome/theme-toggle";
import { Button } from "@/components/ui/button";
import { AUTHOR, SITE_NAME, paths } from "@/lib/site";

export interface MastheadProps {
  palette: ReactNode;
  /** The strapline, hidden below `md`. Omit on interior pages. */
  strapline?: string;
}

export function Masthead({ palette, strapline }: MastheadProps) {
  return (
    // 94%, not 85%: at 15% translucency over a blur the body text underneath
    // stayed legible as a grey smear inside the nameplate band. Chrome that you
    // can read the page through is not chrome.
    <header className="border-rule/70 bg-paper/94 sticky top-0 z-40 border-b backdrop-blur-md">
      {/* Same gutter as every section of the page below it (`px-5 sm:px-8`). */}
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-5 sm:gap-3 sm:px-8">
        {/* Tighter and shrinkable below `sm`. At 320 CSS px — 1280 at 400%
            zoom, WCAG 1.4.10 — a nowrap `shrink-0` wordmark at 0.2em tracking
            measures 230px, which with the action cluster pushed the document
            to 347px of horizontal scroll. It truncates rather than pushes. */}
        <Link
          href={paths.home()}
          className="text-ink-strong hover:text-issue-accent min-w-0 truncate text-[0.7rem] font-semibold tracking-[0.13em] uppercase transition-colors sm:text-[0.78rem] sm:tracking-[0.2em]"
        >
          {SITE_NAME}
        </Link>

        {strapline && (
          <>
            <span className="bg-rule/70 mx-1 hidden h-4 w-px sm:block" aria-hidden />
            <p className="text-ink-muted hidden truncate text-xs md:block">{strapline}</p>
          </>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {palette}
          <ThemeToggleButton className="text-ink-muted hover:text-ink" />
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-ink-muted hover:text-ink"
            // The rendered element is an anchor, so Base UI must not assert
            // native button semantics over it.
            nativeButton={false}
            render={
              <a
                href={AUTHOR.url}
                aria-label={`${SITE_NAME} on GitHub`}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            <HugeiconsIcon icon={Github01Icon} data-icon="inline-start" aria-hidden />
          </Button>
        </div>
      </div>
    </header>
  );
}
