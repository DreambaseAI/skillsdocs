"use client";

import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { announce } from "@/components/chrome/live-regions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The install panel.
 *
 * Only `npx skills add <owner>/<repo>` and, when the repo publishes a plugin
 * manifest, `/plugin marketplace add <owner>/<repo>` are ever offered — those
 * are the two forms observed in the wild. A per-skill install form exists in
 * nobody's documented CLI, so we do not invent one and put it on a copy
 * button where a reader would paste it into a terminal and be told it is not
 * a command.
 */

export interface InstallRow {
  label: string;
  command: string;
  /** Shell sigil or slash, set outside the copied string. */
  sigil?: string;
}

export interface InstallCommandProps {
  rows: InstallRow[];
  className?: string;
}

export function InstallCommand({ rows, className }: InstallCommandProps) {
  return (
    <div className={cn("book-install", className)}>
      {rows.map((row) => (
        <div key={row.command} className="book-install__row">
          <code className="book-install__code">
            <span className="book-install__sigil" aria-hidden="true">
              {row.sigil ?? "$"}&nbsp;
            </span>
            {row.command}
          </code>
          <CopyButton value={row.command} label={row.label} />
        </div>
      ))}
    </div>
  );
}

export interface CopyButtonProps {
  value: string;
  /** Goes into the accessible name and the announcement. */
  label: string;
  className?: string;
}

export function CopyButton({ value, label, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      announce(`${label} copied to the clipboard.`);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // A denied clipboard permission is silent otherwise, and the reader is
      // left looking at a button that appeared to do nothing.
      announce(
        `Could not copy automatically. Select the command and copy it manually.`,
        "assertive",
      );
    }
  }, [value, label]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={cn("shrink-0", className)}
      // The state lives in the name, not only in the glyph: an icon swap is
      // invisible to a screen reader and to anyone not looking at the button.
      aria-label={copied ? `${label} copied` : `Copy ${label.toLowerCase()}`}
      onClick={copy}
    >
      <HugeiconsIcon
        icon={copied ? Tick02Icon : Copy01Icon}
        data-icon="inline-start"
        aria-hidden
      />
    </Button>
  );
}
