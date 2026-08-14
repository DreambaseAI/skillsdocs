"use client";

/**
 * The submission line: `github.com/` set large in the display face, with the
 * reader's repo completing the address on one shared baseline rule.
 *
 * The contract is unchanged from the hero it replaces. It is a real
 * `<form method="get" action="/search">`: with JavaScript, a recognisable repo
 * reference goes straight to the book, an empty submit opens the example on
 * display (the call to action is never dead), and anything else goes to
 * search. Without JavaScript everything goes to search, which puts a link to
 * the book at the top of the results. Pasted `npx skills add …` and
 * `/plugin marketplace add …` lines parse too — `parseRepoReference` strips
 * every wrapper (and any flags) the caption promises.
 *
 * A paste that resolves to a repo is rewritten to the bare `owner/repo` in
 * place, so the display line always reads as one coherent address instead of
 * `github.com/https://github.com/…`. When the paste was the install command
 * itself, the static prefix switches from `github.com/` to `npx skills add`,
 * teaching the swap in the command's own terms. Paste only — rewriting on
 * change would yank text out from under a typing reader's caret.
 */

import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { announce } from "@/components/chrome/live-regions";
import { capture } from "@/lib/analytics";
import {
  isGistId,
  isInstallCommand,
  parseRepoReference,
  paths,
} from "@/lib/site";

export interface TypesetterProps {
  /** The repo the empty field opens, and the ghost text in it. */
  exampleOwner?: string;
  exampleRepo?: string;
}

export function Typesetter({
  exampleOwner = "anthropics",
  exampleRepo = "skills",
}: TypesetterProps) {
  const router = useRouter();
  const inputId = useId();
  const hintId = useId();
  const statusId = useId();

  // The example is real text in the field, not a placeholder: the address is
  // complete and submittable as it stands, and the resting caret says "edit
  // me". `dirty` remembers whether the reader ever did, for the analytics
  // event and so the status line stays quiet until they type.
  const [value, setValue] = useState(`${exampleOwner}/${exampleRepo}`);
  const [dirty, setDirty] = useState(false);
  // Set by a recognised paste: the static prefix restates what was pasted —
  // `npx skills add` for an install command, `gist.github.com/` for a gist —
  // until the field is cleared. Everything else keeps `github.com/`.
  const [prefix, setPrefix] = useState<"url" | "npx" | "gist">("url");
  const parsed = parseRepoReference(value);
  const typing = value.trim().length > 0;

  /**
   * A paste that resolves to a repo collapses to the bare `owner/repo`, so
   * `npx skills add https://github.com/remotion-dev/skills --skill x` lands
   * as `remotion-dev/skills`. Only ever on paste — a change handler doing
   * this would rewrite half-typed input out from under the caret.
   */
  const paste = useCallback(
    (event: React.ClipboardEvent<HTMLInputElement>) => {
      const text = event.clipboardData.getData("text");
      const ref = parseRepoReference(text);
      if (!ref) return;
      event.preventDefault();
      setDirty(true);
      // An install command wrapping a gist URL is still shown as the command:
      // it is what the reader actually pasted.
      setPrefix(
        isInstallCommand(text) ? "npx" : isGistId(ref.repo) ? "gist" : "url"
      );
      setValue(`${ref.owner}/${ref.repo}`);
    },
    []
  );

  /**
   * The destination changes on every keystroke, so announcing it live would
   * talk over the reader. Settle first, then say it once.
   */
  const [status, setStatus] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!dirty || !typing) setStatus("");
      else if (parsed)
        setStatus(`Opens ${paths.book(parsed.owner, parsed.repo)}`);
      else
        setStatus("Not a repository reference yet. Enter will search instead.");
    }, 600);
    return () => window.clearTimeout(id);
  }, [parsed, typing, dirty]);

  const submit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      const target =
        parsed ?? (typing ? null : { owner: exampleOwner, repo: exampleRepo });
      if (!target) return; // Let the GET form fall through to /search.
      event.preventDefault();
      capture("repository_opened", {
        entry_point: dirty ? "repository_reference" : "hero_example",
      });
      announce(`Opening ${target.owner}/${target.repo}`);
      router.push(paths.book(target.owner, target.repo));
    },
    [parsed, typing, dirty, exampleOwner, exampleRepo, router]
  );

  return (
    <form action={paths.search()} method="get" onSubmit={submit}>
      <label
        htmlFor={inputId}
        className="text-ink-muted block font-mono text-[0.62rem] font-medium tracking-[0.2em] uppercase sm:text-[0.66rem]"
      >
        Paste any skills user/repo or org/repo
      </label>

      <div className="group/field border-ink focus-within:border-issue-accent mt-4 flex max-w-xl items-baseline border-b-2 pb-2 transition-colors">
        <span
          aria-hidden
          className="font-display text-ink-muted/60 shrink-0 text-[clamp(1.4rem,3.4vw,2.125rem)] leading-none"
        >
          {/* Non-breaking space: a trailing normal space collapses against the
              flex item boundary and the command runs into the slug. */}
          {prefix === "npx"
            ? "npx skills add\u00A0"
            : prefix === "gist"
              ? "gist.github.com/"
              : "github.com/"}
        </span>
        {/* `field-sizing-content` shrink-wraps the input to its text so the
            resting caret sits right after the last glyph; the `size` attribute
            is the approximation browsers without it fall back to. */}
        <input
          id={inputId}
          name="q"
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          value={value}
          onChange={(event) => {
            setDirty(true);
            setValue(event.target.value);
            // An emptied field starts over as an address, not a command.
            if (event.target.value.trim() === "") setPrefix("url");
          }}
          onPaste={paste}
          placeholder="org/repo"
          size={Math.max(value.length, 8)}
          aria-describedby={status ? `${hintId} ${statusId}` : hintId}
          className="font-display text-ink placeholder:text-ink-muted/50 caret-issue-accent field-sizing-content min-w-0 max-w-full bg-transparent text-[clamp(1.4rem,3.4vw,2.125rem)] leading-none outline-none"
        />
        {/* The resting caret. The real caret takes over on focus. */}
        <span
          aria-hidden
          className="bg-issue-accent ml-0.5 inline-block h-[1em] w-0.75 shrink-0 text-[clamp(1.4rem,3.4vw,2.125rem)] leading-none group-focus-within/field:hidden motion-safe:animate-[caret-blink_1.1s_steps(1,end)_infinite]"
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <button
          type="submit"
          className="bg-issue-accent text-issue-accent-foreground focus-visible:ring-issue-accent/40 inline-flex h-12 shrink-0 cursor-pointer items-center gap-2 rounded-full px-7 text-sm font-medium transition-opacity outline-none hover:opacity-90 focus-visible:ring-3 max-sm:h-13 max-sm:w-full max-sm:justify-center"
        >
          {typing && !parsed ? "Search" : "Load skills"}
          <HugeiconsIcon
            icon={ArrowRight02Icon}
            data-icon="inline-end"
            aria-hidden
          />
        </button>
        <p
          id={hintId}
          className="text-ink-muted/80 font-mono text-[0.66rem] leading-relaxed tracking-[0.08em] uppercase"
        >
          <span aria-hidden>* </span>also accepts npx skills command
        </p>
      </div>

      {/* The one thing a screen-reader user cannot get from the display. */}
      <p id={statusId} role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
    </form>
  );
}
