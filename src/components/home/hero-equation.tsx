"use client";

/**
 * The hero, which has exactly one job: teach the URL swap — now as the
 * headline itself rather than a card beside one.
 *
 * The `<h1>` is a standing two-line equation. The top line cycles through the
 * three places a skills repo already lives (a GitHub URL, an `npx skills add`
 * command, a plugin-marketplace line); the bottom line never changes. The
 * pedagogy is in what doesn't move: whatever form you're holding, the same
 * address reads it as a book. `owner/repo` never leaves the line — only the
 * packaging around it rolls, and the token slides to its new seat (a FLIP
 * transform) so it reads as one address being re-wrapped, not two strings.
 *
 * It is still a real `<form method="get" action="/search">`. With JavaScript,
 * a recognisable repo reference goes straight to the book, an empty submit
 * opens the repo currently on display (the call to action is never dead), and
 * anything else goes to search. Without JavaScript everything goes to search,
 * which puts a link to the book at the top of the results, and the equation
 * renders frozen on its first frame. No dead control.
 *
 * Motion notes: WAAPI, transform/opacity/filter only, no library. Out-rolls
 * hold their last frame (`fill: "forwards"`) across the React commit and are
 * cancelled in a layout effect *before* paint, so the swap is flash-free. The
 * cycle pauses on hover, focus, typing, and hidden tabs (WCAG 2.2.2 — the
 * form pills are the manual override), and `prefers-reduced-motion` swaps
 * text instantly instead of rolling it.
 */

import { ArrowRight02Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { announce } from "@/components/chrome/live-regions";
import { Button } from "@/components/ui/button";
import { paths, parseRepoReference } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * The trailing spaces are non-breaking on purpose: each half of the source
 * line is its own flex item, and a normal space at the end of an inline
 * formatting context is collapsed away, printing "npx skills addanthropics".
 */
const FORMS = [
  { id: "url", label: "GitHub URL", prefix: "github.com/" },
  { id: "npx", label: "npx install", prefix: "npx skills add\u00A0" },
  {
    id: "plugin",
    label: "Plugin marketplace",
    prefix: "/plugin marketplace add\u00A0",
  },
] as const;

/** Real repos, rotated once per full cycle of the three forms. */
const REPOS = [
  { owner: "anthropics", repo: "skills" },
  { owner: "openai", repo: "skills" },
  { owner: "mattpocock", repo: "skills" },
] as const;

/** One form per beat; the pill's progress bar is the visible clock. */
const BEAT_MS = 4000;

/** Mirrors `--ease-out-quint` in tokens.css — WAAPI cannot read CSS vars. */
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const OUT_FRAMES: Keyframe[] = [
  { transform: "translateY(0)", opacity: 1, filter: "blur(0px)" },
  { transform: "translateY(-0.45em)", opacity: 0, filter: "blur(5px)" },
];
const IN_FRAMES: Keyframe[] = [
  { transform: "translateY(0.45em)", opacity: 0, filter: "blur(5px)" },
  { transform: "translateY(0)", opacity: 1, filter: "blur(0px)" },
];

/** Which form the reader's own input is shaped like, so the equation mirrors it. */
function detectForm(input: string): number {
  if (/^\s*(?:npx|pnpm\s+dlx|bunx)\s+skills\s+add/i.test(input)) return 1;
  if (/^\s*\/?plugin\s+marketplace\s+add/i.test(input)) return 2;
  return 0;
}

/**
 * Entrance stagger via `@starting-style` — pure CSS, so the prerendered page
 * animates without waiting for hydration and no-JS visitors just see content.
 * Reduced motion keeps the fade and drops the movement.
 */
const REVEAL =
  "transition-[opacity,translate] duration-500 ease-(--ease-out-quint) starting:opacity-0 motion-safe:starting:translate-y-2";

/**
 * The clipping boxes (`truncate`) cut at the line box, which amputates
 * descenders at display sizes; padding gives them room inside the box and the
 * negative margin cancels the layout cost so baselines stay put.
 */
const TOKEN = "inline-block max-w-full truncate py-[0.2em] -my-[0.2em]";

export interface HeroEquationProps {
  /**
   * Our host, resolved on the server. Not read from `SITE_URL` here: the
   * production origin comes from a non-public env var, so the client would
   * compute `localhost:3000`, disagree with the server, and break hydration.
   */
  host: string;
}

export function HeroEquation({ host }: HeroEquationProps) {
  const router = useRouter();
  const inputId = useId();
  const hintId = useId();
  const statusId = useId();

  const inputRef = useRef<HTMLInputElement>(null);
  const prefixRef = useRef<HTMLSpanElement>(null);
  const srcRepoRef = useRef<HTMLSpanElement>(null);
  const dstPathRef = useRef<HTMLSpanElement>(null);
  const sweepRef = useRef<HTMLSpanElement>(null);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const [value, setValue] = useState("");
  const [formIdx, setFormIdx] = useState(0);
  const [repoIdx, setRepoIdx] = useState(0);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);
  const [hidden, setHidden] = useState(false);

  const parsed = parseRepoReference(value);
  const typing = value.trim().length > 0;
  /** What the equation displays: the reader's repo, or the rotating example. */
  const shown = parsed ?? (typing ? null : REPOS[repoIdx]);
  const paused = hoverPaused || focusPaused || typing || hidden;

  const reducedRef = useRef(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reducedRef.current = mq.matches;
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  /**
   * A swap in flight between the out-roll and the commit. The out animations
   * hold their last frame across the render so the old text never flashes
   * back; the layout effect cancels them and rolls the new text in.
   */
  const pendingRef = useRef<{
    outAnims: Animation[];
    rollRepo: boolean;
    flipFrom: DOMRect | null;
  } | null>(null);

  const beginSwap = useCallback((next: number, rollRepo: boolean) => {
    const prefix = prefixRef.current;
    const srcRepo = srcRepoRef.current;
    const dstPath = dstPathRef.current;
    const commit = (outAnims: Animation[]) => {
      pendingRef.current = {
        outAnims,
        rollRepo,
        // Captured before the commit renders, so it is the "before" rect.
        flipFrom: !rollRepo && srcRepo ? srcRepo.getBoundingClientRect() : null,
      };
      setFormIdx(next);
      if (rollRepo) setRepoIdx((r) => (r + 1) % REPOS.length);
    };
    if (reducedRef.current || !prefix || !srcRepo || !dstPath) {
      commit([]);
      return;
    }
    const out = (el: HTMLElement) =>
      el.animate(OUT_FRAMES, { duration: 160, easing: EASE, fill: "forwards" });
    const anims = rollRepo
      ? [out(prefix), out(srcRepo), out(dstPath)]
      : [out(prefix)];
    anims[0].onfinish = () => commit(anims);
  }, []);

  /** Roll the committed text in — runs before paint, so the swap is seamless. */
  useLayoutEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    for (const anim of pending.outAnims) anim.cancel();
    if (reducedRef.current) return;
    const prefix = prefixRef.current;
    const srcRepo = srcRepoRef.current;
    const dstPath = dstPathRef.current;
    if (!prefix || !srcRepo || !dstPath) return;
    prefix.animate(IN_FRAMES, { duration: 240, easing: EASE });
    if (pending.rollRepo) {
      srcRepo.animate(IN_FRAMES, { duration: 240, easing: EASE });
      // The stagger is the "carry": the destination follows a beat later.
      dstPath.animate(IN_FRAMES, {
        duration: 240,
        delay: 120,
        easing: EASE,
        fill: "backwards",
      });
    } else if (pending.flipFrom) {
      // FLIP: the repo token slides to its new seat instead of teleporting.
      const after = srcRepo.getBoundingClientRect();
      const dx = pending.flipFrom.left - after.left;
      if (pending.flipFrom.top === after.top && Math.abs(dx) > 1) {
        srcRepo.animate(
          [
            { transform: `translateX(${dx}px)` },
            { transform: "translateX(0)" },
          ],
          { duration: 260, easing: EASE }
        );
      }
    }
    // The quiet "still works": a thin underline sweeps beneath the host.
    sweepRef.current?.animate(
      [
        { transform: "scaleX(0)", opacity: 1 },
        { transform: "scaleX(1)", opacity: 1, offset: 0.55 },
        { transform: "scaleX(1)", opacity: 0 },
      ],
      { duration: 900, easing: EASE }
    );
  }, [formIdx, repoIdx]);

  /** The clock. The active pill's progress bar makes the beat visible. */
  useEffect(() => {
    if (paused) return;
    const bar = barRefs.current[formIdx];
    const barAnim = bar?.animate(
      [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
      { duration: BEAT_MS, easing: "linear", fill: "forwards" }
    );
    const next = (formIdx + 1) % FORMS.length;
    const timer = window.setTimeout(() => beginSwap(next, next === 0), BEAT_MS);
    return () => {
      window.clearTimeout(timer);
      barAnim?.cancel();
    };
  }, [paused, formIdx, repoIdx, beginSwap]);

  /**
   * The destination changes on every keystroke, so announcing it live would
   * talk over the reader. Settle first, then say it once.
   */
  const destination = parsed ? paths.book(parsed.owner, parsed.repo) : null;
  const [status, setStatus] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!typing) setStatus("");
      else if (destination) setStatus(`Opens ${host}${destination}`);
      else
        setStatus("Not a repository reference yet. Enter will search instead.");
    }, 600);
    return () => window.clearTimeout(id);
  }, [host, destination, typing]);

  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value;
      setValue(next);
      if (!next.trim()) return;
      // Paste an npx command and the equation flips to the npx form itself.
      const detected = detectForm(next);
      if (detected !== formIdx) beginSwap(detected, false);
    },
    [beginSwap, formIdx]
  );

  const submit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      // Empty field: act on the repo currently on display, so the call to
      // action is never dead. (The no-JS GET falls through to /search.)
      const target = parsed ?? (typing ? null : REPOS[repoIdx]);
      if (!target) return; // Let the GET form fall through to /search.
      event.preventDefault();
      announce(`Opening ${target.owner}/${target.repo}`);
      router.push(paths.book(target.owner, target.repo));
    },
    [parsed, typing, repoIdx, router]
  );

  /** Clicking the rotating line drops it into the field, ready to edit. */
  const insertCurrent = useCallback(() => {
    const example = parsed ?? REPOS[repoIdx];
    setValue(
      `${FORMS[formIdx].prefix}${example.owner}/${example.repo}`.replace(
        /\u00A0/g,
        " "
      )
    );
    inputRef.current?.focus();
  }, [formIdx, parsed, repoIdx]);

  return (
    <>
      {/* ------------------------------------------------------ the equation */}
      <h1
        id="hero-heading"
        aria-label={`Replace github.com with ${host} in any skills repo URL — or point an npx skills add command or a plugin marketplace line here — and read it as a book.`}
        onPointerEnter={() => setHoverPaused(true)}
        onPointerLeave={() => setHoverPaused(false)}
        className={cn(
          "font-display text-ink-strong flex flex-col gap-[0.45em] text-[clamp(1.5rem,4.5vw,3.25rem)] leading-[1.12] tracking-[-0.022em]",
          REVEAL
        )}
      >
        <span
          aria-hidden="true"
          title="Click to put this in the field"
          onClick={(event) => {
            event.stopPropagation();
            insertCurrent();
          }}
          className="group/src flex max-w-full cursor-pointer flex-wrap items-baseline font-normal"
        >
          <span
            ref={prefixRef}
            className={cn(
              TOKEN,
              "text-ink-muted decoration-ink-muted/55 decoration-dotted decoration-[0.035em] underline-offset-[0.16em] group-hover/src:underline"
            )}
          >
            {FORMS[formIdx].prefix}
          </span>
          <span
            ref={srcRepoRef}
            className={cn(
              TOKEN,
              "decoration-ink-muted/55 decoration-dotted decoration-[0.035em] underline-offset-[0.16em] group-hover/src:underline",
              shown ? "text-ink-strong" : "text-ink-muted/50"
            )}
          >
            {shown ? `${shown.owner}/${shown.repo}` : "…"}
          </span>
        </span>

        <span
          aria-hidden="true"
          className="flex max-w-full flex-wrap items-baseline font-semibold"
        >
          <span className="text-ink-muted mr-[0.3em] inline-block translate-y-[-0.08em] text-[0.72em] font-normal">
            ↳
          </span>
          <span className={cn(TOKEN, "text-issue-accent relative")}>
            {host}
            <span
              ref={sweepRef}
              className="bg-issue-accent absolute inset-x-0 bottom-[0.2em] h-[0.045em] origin-left scale-x-0 opacity-0"
            />
          </span>
          <span
            ref={dstPathRef}
            className={cn(
              TOKEN,
              shown ? "text-ink-strong" : "text-ink-muted/50"
            )}
          >
            {shown ? `/${shown.owner}/${shown.repo}` : "/…"}
          </span>
        </span>
      </h1>

      {/* ------------------------- the three forms, doubling as the narrator */}
      <div
        role="group"
        aria-label="Where your repo lives"
        className={cn("flex flex-wrap gap-2", REVEAL, "delay-[70ms]")}
      >
        {FORMS.map((form, i) => (
          <Button
            key={form.id}
            type="button"
            variant="outline"
            size="xs"
            aria-pressed={i === formIdx}
            onClick={() => {
              if (i !== formIdx) beginSwap(i, false);
            }}
            className={cn(
              "border-rule text-ink-muted hover:text-ink relative overflow-hidden px-3 font-mono",
              i === formIdx && "text-ink-strong border-issue-accent/45"
            )}
          >
            {form.label}
            <span
              ref={(el) => {
                barRefs.current[i] = el;
              }}
              aria-hidden="true"
              className="bg-issue-accent absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0"
            />
          </Button>
        ))}
      </div>

      {/* ------------------------------------------------------- the control */}
      <form
        action={paths.search()}
        method="get"
        onSubmit={submit}
        className={cn(
          "flex w-full max-w-2xl flex-col gap-2 sm:flex-row",
          REVEAL,
          "delay-[140ms]"
        )}
      >
        <label htmlFor={inputId} className="sr-only">
          Paste a repo reference
        </label>
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
            onChange={onChange}
            onFocus={() => setFocusPaused(true)}
            onBlur={() => setFocusPaused(false)}
            placeholder="Paste a URL, an npx command, or owner/repo"
            aria-describedby={status ? `${hintId} ${statusId}` : hintId}
            className="text-ink placeholder:text-ink-muted/60 h-full min-w-0 flex-1 bg-transparent text-base outline-none"
          />
        </div>

        <Button type="submit" size="lg" className="h-12 shrink-0 px-5">
          {typing && !parsed ? "Search" : "Build skill book"}
          <HugeiconsIcon
            icon={ArrowRight02Icon}
            data-icon="inline-end"
            aria-hidden
          />
        </Button>
      </form>

      <p
        id={hintId}
        className={cn("text-ink-muted text-sm", REVEAL, "delay-[210ms]")}
      >
        Anything with an owner/repo works — paste it and press Enter.
      </p>

      {/* The one thing a screen-reader user cannot get from the display. */}
      <p id={statusId} role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
    </>
  );
}
