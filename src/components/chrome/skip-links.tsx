/**
 * Skip links (WCAG 2.4.1).
 *
 * Visually hidden until focused, then pinned to the top-left. The targets are
 * fixed ids that the book shell is required to provide; a link whose target is
 * absent on a given page simply does nothing, which is preferable to a
 * conditional set that moves under keyboard users between routes.
 */

const LINKS = [
  { href: "#main", label: "Skip to content" },
  { href: "#contents", label: "Skip to contents" },
  { href: "#reader-controls", label: "Skip to reading controls" },
] as const;

export function SkipLinks() {
  return (
    <nav aria-label="Skip links">
      <ul className="contents">
        {LINKS.map((link) => (
          <li key={link.href} className="contents">
            <a
              href={link.href}
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
