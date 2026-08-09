"use client";

/**
 * Skip links (WCAG 2.4.1).
 *
 * Visually hidden until focused, then pinned to the top-left.
 *
 * **A link is only rendered when its target exists on this page.** The set used
 * to be fixed, on the theory that a link whose target is absent "simply does
 * nothing" — but doing nothing is precisely the failure 2.4.1 is about. On the
 * homepage "Skip to reading controls" pointed at `#reader-controls`, which only
 * the book shell renders; on `/search` two of the three were dead. They are the
 * first three tab stops on every page, so that was two keystrokes into the
 * site's most-visited route spent on links that move nothing and announce
 * nothing.
 *
 * The targets are resolved on the client because they are owned by routes, not
 * by this layout, and because PPR streams the shell before the page body: a
 * single `getElementById` at mount would report `#contents` missing on a cold
 * book load. The observer closes that race, and the server render keeps all
 * three so the links still work with JavaScript off.
 */

import { useEffect, useRef, useState } from "react";

const LINKS = [
  { href: "#main", label: "Skip to content" },
  { href: "#contents", label: "Skip to contents" },
  { href: "#reader-controls", label: "Skip to reading controls" },
] as const;

const ALL = LINKS.map((link) => link.href);

function livingTargets(): string[] {
  return ALL.filter((href) => document.querySelector(href) !== null);
}

export function SkipLinks() {
  const nav = useRef<HTMLElement>(null);
  // Starts as "all of them", which is what the server rendered — anything else
  // would be a hydration mismatch, and is also the right no-JS answer.
  const [live, setLive] = useState<string[]>(ALL);
  /**
   * True while something has marked this nav `aria-hidden` — which Base UI
   * does to the whole page behind an open dialog.
   *
   * A link that is hidden from assistive technology and still in the tab order
   * is the 4.1.2 hazard axe reports as `aria-hidden-focus`: a keyboard user
   * lands on a control a screen-reader user cannot be told about. Measured
   * with the command palette open — Tab walked straight onto "Skip to
   * content" inside the hidden subtree.
   */
  const [hidden, setHidden] = useState(false);
  const hiddenRef = useRef(false);

  useEffect(() => {
    let current = "";
    const check = () => {
      const found = livingTargets();
      const key = found.join(" ");
      const isHidden = Boolean(nav.current?.closest('[aria-hidden="true"]'));
      if (key === current && isHidden === hiddenRef.current) return;
      current = key;
      hiddenRef.current = isHidden;
      setLive(found);
      setHidden(isHidden);
    };

    check();
    // Three `querySelector`s on ids; cheap enough to run per mutation batch.
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-hidden"],
    });
    return () => observer.disconnect();
    // Deliberately no `usePathname()` dependency. This component renders in the
    // root layout, and under `cacheComponents` any URL hook read outside a
    // <Suspense> boundary marks EVERY route a blocking route and kills
    // prerendering site-wide. The hook was redundant anyway: a client-side
    // navigation replaces the page subtree, which the observer below already
    // sees as a childList mutation on <body>.
  }, []);

  return (
    <nav aria-label="Skip links" ref={nav}>
      <ul className="contents">
        {LINKS.filter((link) => live.includes(link.href)).map((link) => (
          <li key={link.href} className="contents">
            <a
              href={link.href}
              tabIndex={hidden ? -1 : undefined}
              className="bg-background text-foreground ring-ring sr-only rounded-md px-4 py-2 text-sm font-medium shadow-lg ring-2 focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-100"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
