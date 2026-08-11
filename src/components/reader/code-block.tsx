"use client";

import { useEffect, useRef, useState } from "react";
import posthog from "posthog-js";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";

import { announce } from "@/components/chrome/live-regions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A fenced code block: Shiki's tokens, our chrome.
 *
 * Three decisions worth knowing about.
 *
 * **It never wraps.** A wrapped shell command is a broken shell command — the
 * reader cannot tell whether the line break is real. So the block scrolls
 * horizontally instead, with a fade mask on the right edge as the affordance
 * that there is more to see.
 *
 * **The scroll container is focusable.** WCAG 2.1.1: a region that scrolls
 * must be reachable and operable from the keyboard, and a `tabIndex` of 0 is
 * what gives a keyboard user arrow-key control of it. It carries a role and an
 * accessible name so it is not an unlabelled stop in the tab order.
 *
 * The role is `group`, not `region`. `region` is a landmark, and a chapter
 * with nine code blocks then exposes nine landmarks all named "Code block,
 * scrollable" — axe `landmark-unique`, measured at four instances on
 * `/anthropics/skills/skill-creator`. `group` is nameable, focusable, and not
 * a landmark, which is what this is.
 *
 * **Copy uses the source the pipeline attached**, not the DOM text, so what
 * lands on the clipboard is byte-identical to the file even though what is on
 * screen has been split into a few thousand token spans.
 */

const RESET_MS = 2000;

export interface CodeBlockProps {
  /** Language label, already normalised by the pipeline. */
  lang: string;
  /** Exact fence contents, from `data-source`. */
  source: string;
  /** Shiki's class list from the original `pre`; `.shiki` drives `code.css`. */
  shikiClassName?: string;
  children: React.ReactNode;
}

export function CodeBlock({ lang, source, shikiClassName, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(source);
      posthog.capture("code_copied", {
        language: lang === "text" ? "plain_text" : lang,
      });
      setCopied(true);
      announce(`Copied ${lang === "text" ? "code" : lang} to the clipboard`);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), RESET_MS);
    } catch {
      announce("Could not copy — your browser blocked clipboard access", "assertive");
    }
  }

  const label = lang === "text" ? "Code" : lang;
  // `text` is the pipeline's word for "this fence carried no language", not a
  // language. Printing `CODE` above a fence tells the reader something they
  // can already see; printing `BASH` tells them something they cannot. When
  // there is nothing to say, the bar carries the Copy button alone.
  const named = lang !== "text";

  return (
    // `data-slot` is the selector contract theme-modes.css targets for print
    // and forced-colors; `className` is what code.css styles. Both are needed.
    <figure className="code-block" data-slot="code-block" data-lang={lang}>
      <div className="code-block__bar" data-named={named ? "true" : undefined}>
        {named ? (
          <span className="code-block__lang" aria-hidden="true">
            {label}
          </span>
        ) : null}
        <Button
          variant="ghost"
          size="xs"
          className="code-block__copy"
          onClick={copy}
          aria-label={`Copy ${label.toLowerCase()} to clipboard`}
        >
          <HugeiconsIcon
            icon={copied ? Tick02Icon : Copy01Icon}
            data-icon="inline-start"
            strokeWidth={2}
          />
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <div
        className="code-block__scroll"
        tabIndex={0}
        role="group"
        aria-label={`${label} block, scrollable`}
      >
        <pre className={cn("code-block__pre", shikiClassName)}>{children}</pre>
      </div>
    </figure>
  );
}
