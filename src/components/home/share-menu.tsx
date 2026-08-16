"use client";

/**
 * Share, with the platform sheet when the platform has one.
 *
 * The trigger always opens our own menu rather than firing `navigator.share`
 * directly. Two reasons: `navigator.share` exists on desktop Chrome for
 * Windows and ChromeOS but not Linux, and on Safari macOS but not Firefox, so
 * a "native or nothing" button is a control that silently does nothing for a
 * large minority of readers; and the destinations a developer actually wants
 * — Hacker News, Bluesky — are not in the OS sheet anyway. When the API is
 * present it becomes the first item, which is where a system sheet belongs.
 *
 * Nothing here calls `window.open`. Every destination is a real anchor with
 * `target="_blank"` and `rel="noopener noreferrer"`, so it survives a popup
 * blocker, offers a middle-click, and shows its target in the status bar.
 */

import {
  BlueskyIcon,
  Copy01Icon,
  Linkedin01Icon,
  Mail01Icon,
  News01Icon,
  NewTwitterIcon,
  Share08Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useSyncExternalStore, type ReactNode } from "react";
import { toast } from "sonner";
import { announce } from "@/components/chrome/live-regions";
import { Button } from "@/components/ui/button";
import { capture } from "@/lib/analytics";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NEVER = () => () => {};

/** True only once the browser has taken over — `navigator` is not on the server. */
function useNativeShare(): boolean {
  return useSyncExternalStore(
    NEVER,
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false,
  );
}

export interface ShareMenuProps {
  /** Absolute URL. A relative one would break every destination below. */
  url: string;
  title: string;
  /** One line of context for the post body. */
  summary?: string;
  className?: string;
  /** Show a text label next to the icon. */
  label?: string;
  /** The menu group's accessible name and visible heading. */
  menuLabel?: string;
  /** Extra menu items rendered after the destinations, behind a separator —
   * the homepage puts its "Save to your library" action here. */
  footer?: ReactNode;
}

interface Destination {
  id: string;
  label: string;
  icon: typeof Share08Icon;
  href: string;
}

function destinations(url: string, title: string, summary: string): Destination[] {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const post = encodeURIComponent(`${title} — ${summary}`);

  return [
    {
      id: "x",
      label: "Post on X",
      icon: NewTwitterIcon,
      href: `https://x.com/intent/post?url=${u}&text=${t}`,
    },
    {
      id: "bluesky",
      label: "Post on Bluesky",
      icon: BlueskyIcon,
      // Bluesky's intent takes one text field; the URL has to live inside it.
      href: `https://bsky.app/intent/compose?text=${post}%20${u}`,
    },
    {
      id: "linkedin",
      label: "Share on LinkedIn",
      icon: Linkedin01Icon,
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    },
    {
      id: "hn",
      label: "Submit to Hacker News",
      icon: News01Icon,
      href: `https://news.ycombinator.com/submitlink?u=${u}&t=${t}`,
    },
    {
      id: "email",
      label: "Email a link",
      icon: Mail01Icon,
      href: `mailto:?subject=${t}&body=${post}%0A%0A${u}`,
    },
  ];
}

export function ShareMenu({
  url,
  title,
  summary = "",
  className,
  label,
  menuLabel = "Share this book",
  footer,
}: ShareMenuProps) {
  const native = useNativeShare();

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      capture("link_copied");
      announce("Link copied to clipboard");
      toast.success("Link copied", { description: url });
    } catch {
      // Clipboard access can be refused outright (permissions policy, an
      // insecure origin, Firefox without user activation). Showing the URL is
      // a worse experience than copying it, and a better one than silence.
      announce("Could not copy automatically. The link is shown on screen.", "assertive");
      toast.error("Could not copy", { description: url, duration: 20_000 });
    }
  }, [url]);

  const share = useCallback(async () => {
    try {
      await navigator.share({ title, text: summary || undefined, url });
      capture("link_shared", { method: "native" });
    } catch (error) {
      // The reader dismissing the sheet rejects with AbortError. That is a
      // completed interaction, not a failure, and must stay silent.
      if (error instanceof DOMException && error.name === "AbortError") return;
      await copy();
    }
  }, [copy, summary, title, url]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size={label ? "sm" : "icon-sm"}
            className={className}
            aria-label={label ? undefined : `Share ${title}`}
          />
        }
      >
        <HugeiconsIcon icon={Share08Icon} data-icon="inline-start" aria-hidden />
        {label}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        {/* `Menu.GroupLabel` throws outside a `Menu.Group`; it is not decorative
            markup, it is the group's accessible name. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>{menuLabel}</DropdownMenuLabel>

          {native && (
            <DropdownMenuItem onClick={share}>
              <HugeiconsIcon icon={Share08Icon} aria-hidden />
              Share…
            </DropdownMenuItem>
          )}

          <DropdownMenuItem onClick={copy}>
            <HugeiconsIcon icon={Copy01Icon} aria-hidden />
            Copy link
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {destinations(url, title, summary).map((destination) => (
            <DropdownMenuLinkItem
              key={destination.id}
              href={destination.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <HugeiconsIcon icon={destination.icon} aria-hidden />
              {destination.label}
            </DropdownMenuLinkItem>
          ))}

          {footer && (
            <>
              <DropdownMenuSeparator />
              {footer}
            </>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
