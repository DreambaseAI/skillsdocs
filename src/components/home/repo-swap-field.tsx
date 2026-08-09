"use client";

/**
 * The hero, which has exactly one job: teach the URL swap.
 *
 * Everything else on this page is a directory. This is the product: take any
 * `github.com/owner/repo` and change the host. The control therefore shows
 * the substitution happening — the old host struck through, ours in its place
 * — and rewrites the path live as the reader types, so the rule is learned by
 * watching rather than by reading a sentence about it.
 *
 * It is a real `<form method="get" action="/search">`. With JavaScript,
 * submitting a recognisable repo reference goes straight to the book and
 * anything else goes to search. Without JavaScript, everything goes to search,
 * which puts a link to the book at the top of the results. No dead control.
 */

import { ArrowRight02Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { announce } from "@/components/chrome/live-regions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { paths, parseRepoReference } from "@/lib/site";
import { cn } from "@/lib/utils";

/** The forms a reader might paste, in the order they are likely to try them. */
const EXAMPLES = [
  "github.com/anthropics/skills",
  "openai/skills",
  "npx skills add mattpocock/skills",
] as const;

export interface RepoSwapFieldProps {
  /**
   * Our host, resolved on the server. Not read from `SITE_URL` here: the
   * production origin comes from a non-public env var, so the client would
   * compute `localhost:3000`, disagree with the server, and break hydration.
   */
  host: string;
  /** Shown before the reader types anything. */
  placeholderOwner?: string;
  placeholderRepo?: string;
}

export function RepoSwapField({
  host,
  placeholderOwner = "anthropics",
  placeholderRepo = "skills",
}: RepoSwapFieldProps) {
  const router = useRouter();
  const inputId = useId();
  const hintId = useId();
  const statusId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [value, setValue] = useState("");
  const parsed = parseRepoReference(value);
  const typing = value.trim().length > 0;

  const owner = parsed?.owner ?? (typing ? null : placeholderOwner);
  const repo = parsed?.repo ?? (typing ? null : placeholderRepo);
  const destination = parsed ? paths.book(parsed.owner, parsed.repo) : null;

  /**
   * The destination line changes on every keystroke, so announcing it live
   * would talk over the reader. Settle first, then say it once.
   */
  const [status, setStatus] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!typing) setStatus("");
      else if (parsed) setStatus(`Opens ${host}/${parsed.owner}/${parsed.repo}`);
      else setStatus("Not a repository reference yet. Enter will search instead.");
    }, 600);
    return () => window.clearTimeout(id);
  }, [host, parsed, typing]);

  const submit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      if (!parsed) return; // Let the GET form fall through to /search.
      event.preventDefault();
      announce(`Opening ${parsed.owner}/${parsed.repo}`);
      router.push(paths.book(parsed.owner, parsed.repo));
    },
    [parsed, router],
  );

  const fill = useCallback((example: string) => {
    setValue(example);
    inputRef.current?.focus();
  }, []);

  return (
    <form action={paths.search()} method="get" onSubmit={submit} className="flex flex-col gap-5">
      {/* ---------------------------------------------- the swap, made visible */}
      <p
        className="font-display text-ink-strong flex flex-wrap items-end text-[clamp(1.3rem,3.8vw,2.15rem)] leading-[1.15] tracking-[-0.02em]"
        aria-hidden="true"
      >
        {/* Two indivisible units in a wrapping flex row, rather than one run of
            inline text. Left to normal inline wrapping the browser breaks
            wherever a slash falls — which splits the substitution from the
            path, or worse, splits the owner name in half. */}
        <span className="max-w-full truncate">
          {/* Full `--ink-muted`, not `/70`: the tint measured 3.73:1 against
              paper in dark mode and 20.8px normal weight is not "large text".
              The strike already carries the de-emphasis. */}
          <span className="text-ink-muted decoration-ink-muted/70 line-through decoration-[0.09em]">
            github.com
          </span>
          <span className="text-issue-accent ml-[0.14em]">{host}</span>
        </span>
        <span
          className={cn(
            "max-w-full truncate",
            parsed || !typing ? "text-ink" : "text-ink-muted/50",
          )}
        >
          /{owner ?? "…"}/{repo ?? "…"}
        </span>
      </p>

      {/* ------------------------------------------------------------- control */}
      <Field>
        <FieldLabel
          htmlFor={inputId}
          className="text-ink-muted text-[0.78rem] font-semibold tracking-[0.14em] uppercase"
        >
          Paste a repo
        </FieldLabel>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="border-rule bg-paper-raised focus-within:border-issue-accent focus-within:ring-issue-accent/25 flex h-12 flex-1 items-center gap-2 rounded-2xl border px-4 transition-colors focus-within:ring-3">
            <HugeiconsIcon
              icon={Search01Icon}
              className="text-ink-muted size-4 shrink-0"
              aria-hidden
            />
            <input
              id={inputId}
              ref={inputRef}
              name="q"
              type="text"
              inputMode="url"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="go"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="github.com/anthropics/skills"
              // The status node is empty until there is something to say, and
              // an `aria-describedby` that resolves to an empty element is a
              // description that silently disappears. Point at it only when it
              // has text.
              aria-describedby={status ? `${hintId} ${statusId}` : hintId}
              className="text-ink placeholder:text-ink-muted/60 h-full min-w-0 flex-1 bg-transparent text-base outline-none"
            />
          </div>

          <Button type="submit" size="lg" className="h-12 shrink-0 px-5">
            {parsed ? "Open the book" : "Search"}
            <HugeiconsIcon icon={ArrowRight02Icon} data-icon="inline-end" aria-hidden />
          </Button>
        </div>

        <FieldDescription id={hintId} className="text-ink-muted">
          A URL, an <code className="font-mono text-[0.9em]">owner/repo</code> slug, or a whole{" "}
          <code className="font-mono text-[0.9em]">npx skills add</code> command — all of them
          work.
        </FieldDescription>

        {/* The one thing a screen-reader user cannot get from the display line. */}
        <p id={statusId} role="status" aria-live="polite" className="sr-only">
          {status}
        </p>

        {destination && (
          <p className="text-ink-muted text-sm">
            Goes to{" "}
            <span className="text-issue-accent font-mono text-[0.92em]">
              {host}
              {destination}
            </span>
          </p>
        )}
      </Field>

      {/* --------------------------------------------------------- try one */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink-muted text-xs tracking-[0.12em] uppercase">Try</span>
        {EXAMPLES.map((example) => (
          <Button
            key={example}
            type="button"
            variant="outline"
            size="xs"
            className="border-rule text-ink-muted hover:text-ink font-mono"
            onClick={() => fill(example)}
          >
            {example}
          </Button>
        ))}
      </div>
    </form>
  );
}
