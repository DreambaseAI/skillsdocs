"use client";

/**
 * The interactive shell around a server-highlighted file.
 *
 * Everything expensive — Shiki, the grammar, the line decoration — already ran
 * on the server (`./code-block.tsx`). This module is only the three things
 * that genuinely need a client: copy, wrap, and expand. The highlighted tokens
 * arrive as `children` and are never re-rendered here.
 *
 * Descended from the ai-elements `CodeBlockCopyButton` (Vercel, Apache-2.0);
 * the copy semantics — copy the *source*, flip the icon, reset on a timer —
 * are theirs. The announcement, the accessible name, the HugeIcons and the
 * failure path are ours. See the ledger at the top of `./code-block.tsx`.
 */

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  ArrowUpRight01Icon,
  Copy01Icon,
  Tick02Icon,
  TextWrapIcon,
} from "@hugeicons/core-free-icons";

import { announce } from "@/components/chrome/live-regions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const RESET_MS = 2000;

/* ------------------------------------------------------------ copy */

export interface CodeBlockCopyButtonProps {
  /** Exactly what lands on the clipboard. Never read from the DOM. */
  source: string;
  /** What the button says it is copying, e.g. "extract.py" or "bash". */
  what: string;
  /** Icon-only, for a header that is already crowded. */
  compact?: boolean;
  className?: string;
}

/**
 * Copy the source the server attached, not the DOM text.
 *
 * What is on screen has been split into a few thousand token spans and, in a
 * file view, carries a gutter of ordinals. Reading `textContent` back would
 * put line numbers on the clipboard and lose the trailing newline. The source
 * prop is the bytes as fetched.
 */
export function CodeBlockCopyButton({
  source,
  what,
  compact = false,
  className,
}: CodeBlockCopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      announce(`Copied ${what} to the clipboard`);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), RESET_MS);
    } catch {
      announce("Could not copy — your browser blocked clipboard access", "assertive");
    }
  }

  return (
    <Button
      variant="ghost"
      size={compact ? "icon-xs" : "xs"}
      className={cn("code-block__copy", className)}
      onClick={copy}
      aria-label={`Copy ${what} to clipboard`}
    >
      <HugeiconsIcon
        icon={copied ? Tick02Icon : Copy01Icon}
        data-icon={compact ? undefined : "inline-start"}
        strokeWidth={2}
      />
      {compact ? null : copied ? "Copied" : "Copy"}
    </Button>
  );
}

/* ------------------------------------------------------------ frame */

/**
 * The URL fragment, read as what it is: an external store.
 *
 * The obvious shape for "expand the clip if the URL points inside it" is an
 * effect that calls `setExpanded(true)`, and it is wrong twice over. It is a
 * cascading render on every mount (`react-hooks/set-state-in-effect`), and it
 * only ever runs once — click a second `#L420` link on the same page and the
 * clip stays shut, because nothing re-ran. `useSyncExternalStore` reads the
 * hash where it lives, re-reads it on `hashchange`, and hands the server a
 * snapshot of `false` so hydration has nothing to disagree about.
 */
const LINE_HASH = /^#[A-Za-z]*\d+$/;

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function hashTargetsALine(): boolean {
  return LINE_HASH.test(window.location.hash);
}

/** The server has no fragment; it never reaches the request. */
function noHash(): boolean {
  return false;
}

export interface CodeFileFrameProps {
  source: string;
  /** Directory part of the path, with its trailing slash. May be empty. */
  dir: string;
  /** Filename. */
  name: string;
  /** Human type label, e.g. "Python". */
  label: string;
  /** Shiki language id, for `data-lang`. */
  language: string;
  lines: number;
  sizeLabel?: string;
  sourceUrl?: string;
  showLineNumbers: boolean;
  /** Widest ordinal, in digits — the gutter is `Nch` wide. */
  digits: number;
  /** Start clipped, with a "show all" button. */
  clipped: boolean;
  /** How many lines stay visible while clipped. Drives the CSS clip height. */
  clipLines: number;
  preClassName: string;
  notice?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function CodeFileFrame({
  source,
  dir,
  name,
  label,
  language,
  lines,
  sizeLabel,
  sourceUrl,
  showLineNumbers,
  digits,
  clipped,
  clipLines,
  preClassName,
  notice,
  className,
  children,
}: CodeFileFrameProps) {
  const bodyId = useId();
  const [wrap, setWrap] = useState(false);

  /*
   * Three-valued on purpose. `null` is "the reader has not said", and the URL
   * decides; `true` and `false` are the reader's own answer, and they beat the
   * URL from the first click onwards.
   *
   * `false` is also not the same state as `null`, and the difference is
   * load-bearing. `code.css` opens a clipped body whenever `:has(.line:target)`
   * matches, so an `#L420` link into the hidden region works with JavaScript
   * off. Once the reader has explicitly asked for the file to be short again,
   * that rule has to stop firing, or the button says "show all" over a file
   * that is visibly already all there. `data-clipped="pinned"` is a value the
   * `:target` rule does not select, so the two can never contradict.
   */
  const [choice, setChoice] = useState<boolean | null>(null);
  const targeted = useSyncExternalStore(subscribeToHash, hashTargetsALine, noHash);

  const expanded = choice ?? targeted;
  const pinned = choice === false;

  function toggleWrap() {
    const next = !wrap;
    setWrap(next);
    announce(next ? "Long lines wrap" : "Long lines scroll");
  }

  function toggleExpanded() {
    const next = !expanded;
    setChoice(next);
    announce(
      next
        ? `Showing all ${lines.toLocaleString("en")} lines of ${name}`
        : `Collapsed ${name} to the first ${clipLines} lines`,
    );
  }

  const isClipped = clipped && !expanded;

  return (
    // `data-slot` is the contract `theme-modes.css` targets for print and
    // forced colours; the classes are what `code.css` styles. Both are needed.
    <figure
      className={cn("code-block code-file", className)}
      data-slot="code-block"
      data-lang={language}
      data-code-wrap={wrap ? "on" : "off"}
      style={
        {
          "--code-line-digits": digits,
          "--code-clip-lines": clipLines,
        } as React.CSSProperties
      }
    >
      <div className="code-file__head">
        <p className="code-file__path">
          {dir ? <span className="code-file__dir">{dir}</span> : null}
          <span className="code-file__name">{name}</span>
        </p>

        <p className="code-file__facts">
          <span>{label}</span>
          <span aria-hidden="true">·</span>
          <span>{lines.toLocaleString("en")} lines</span>
          {sizeLabel ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{sizeLabel}</span>
            </>
          ) : null}
        </p>

        <div className="code-file__actions">
          <Button
            variant="ghost"
            size="xs"
            className="code-block__copy"
            onClick={toggleWrap}
            aria-pressed={wrap}
            aria-label="Wrap long lines"
          >
            <HugeiconsIcon icon={TextWrapIcon} data-icon="inline-start" strokeWidth={2} />
            Wrap
          </Button>
          <CodeBlockCopyButton source={source} what={name} />
        </div>
      </div>

      <div
        id={bodyId}
        className="code-file__body"
        data-clipped={isClipped ? (pinned ? "pinned" : "true") : undefined}
      >
        <div
          className="code-block__scroll"
          tabIndex={0}
          role="group"
          aria-label={`${name}, ${lines.toLocaleString("en")} lines of ${label}, scrollable`}
        >
          <pre
            className={preClassName}
            data-line-numbers={showLineNumbers ? "true" : undefined}
          >
            {children}
          </pre>
        </div>
      </div>

      {clipped ? (
        <div className="code-file__more">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleExpanded}
            aria-expanded={expanded}
            aria-controls={bodyId}
          >
            <HugeiconsIcon
              icon={expanded ? ArrowUp01Icon : ArrowDown01Icon}
              data-icon="inline-start"
              strokeWidth={2}
            />
            {expanded
              ? `Collapse to the first ${clipLines} lines`
              : `Show all ${lines.toLocaleString("en")} lines`}
          </Button>
        </div>
      ) : null}

      {notice || sourceUrl ? (
        <figcaption className="code-file__foot">
          {notice}
          {sourceUrl ? (
            <a
              className="code-file__source"
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {name} on GitHub
              <HugeiconsIcon
                icon={ArrowUpRight01Icon}
                className="code-file__mark"
                aria-hidden="true"
              />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
        </figcaption>
      ) : null}
    </figure>
  );
}
