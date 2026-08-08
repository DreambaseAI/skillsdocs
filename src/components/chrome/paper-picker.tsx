"use client";

/**
 * Axis B — paper mode.
 *
 * The reading surface only: `--paper`, `--ink`, `--ink-muted`, `--rule`. It
 * never touches a stone token, so it composes with the colour scheme instead
 * of fighting it.
 *
 * Two rules from ARCHITECTURE §4.1 are enforced here rather than left to the
 * caller:
 *
 * 1. **Only modes valid for the current scheme are offered.** Sepia paper
 *    under a dark chrome is incoherent, and the cascade in `tokens.css`
 *    silently resolves it to Night anyway — so offering it would be a control
 *    that appears to do nothing.
 * 2. **"Match system" is always available** and is the default. It means "do
 *    not assert a paper mode", which is why it serialises as no attribute at
 *    all rather than as a value.
 *
 * Presentational and controlled: WS-5 owns reader preferences and wires this
 * into the controls panel. Nothing here imports from
 * `components/reader/controls/`.
 */

import { ComputerIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTheme } from "next-themes";
import { announce } from "@/components/chrome/live-regions";
import { useHydrated } from "@/components/chrome/theme-toggle";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PAPER_BY_SCHEME, type PaperMode } from "@/lib/reader/prefs";
import { cn } from "@/lib/utils";

interface PaperOption {
  value: PaperMode;
  label: string;
  /** Shown under the swatch; explains what the mode is *for*. */
  hint: string;
}

/** Every mode, keyed for lookup. Which ones are offered depends on the scheme. */
export const PAPER_OPTIONS: Record<Exclude<PaperMode, "system">, PaperOption> = {
  paper: { value: "paper", label: "Paper", hint: "Warm book stock" },
  sepia: { value: "sepia", label: "Sepia", hint: "Softer, lower glare" },
  eink: { value: "eink", label: "E-ink", hint: "Neutral, maximum ink" },
  night: { value: "night", label: "Night", hint: "Stone-tinted dark" },
  midnight: { value: "midnight", label: "Midnight", hint: "Cool, deepest dark" },
  slate: { value: "slate", label: "Slate", hint: "Lifted, lower halation" },
};

export interface PaperPickerProps {
  value: PaperMode;
  onValueChange: (mode: PaperMode) => void;
  /**
   * Which scheme the reader is actually looking at. Omit to read it from
   * next-themes; pass it when the caller already knows, to avoid a second
   * subscription.
   */
  scheme?: "light" | "dark";
  className?: string;
  /** Accessible name for the group. */
  label?: string;
}

function useResolvedScheme(override?: "light" | "dark") {
  const { resolvedTheme } = useTheme();
  const hydrated = useHydrated();

  if (override) return override;
  // Before hydration the resolved scheme is unknown; light is the SSR default,
  // so rendering it keeps the server and the first client pass identical.
  return hydrated && resolvedTheme === "dark" ? "dark" : "light";
}

export function PaperPicker({
  value,
  onValueChange,
  scheme,
  className,
  label = "Paper mode",
}: PaperPickerProps) {
  const resolved = useResolvedScheme(scheme);
  const offered = PAPER_BY_SCHEME[resolved].map((mode) => PAPER_OPTIONS[mode]);

  // A saved mode from the other scheme resolves to "match system" here rather
  // than showing a checked radio the reader cannot see the effect of.
  const selected: PaperMode =
    value !== "system" && offered.some((o) => o.value === value) ? value : "system";

  function change(next: PaperMode) {
    onValueChange(next);
    const name =
      next === "system"
        ? "match system"
        : (PAPER_OPTIONS[next as Exclude<PaperMode, "system">]?.label ?? next);
    announce(`Paper: ${name}`);
  }

  return (
    <RadioGroup
      aria-label={label}
      value={selected}
      onValueChange={(next) => change(next as PaperMode)}
      className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", className)}
    >
      <label className={tileClass}>
        <RadioGroupItem value="system" className="sr-only" />
        <span
          className="border-rule bg-muted text-muted-foreground flex h-11 w-full items-center justify-center rounded-xl border"
          aria-hidden
        >
          <HugeiconsIcon icon={ComputerIcon} className="size-4" />
        </span>
        <span className="text-foreground text-xs font-medium">System</span>
        <span className="text-muted-foreground text-[0.6875rem] leading-tight">
          Follows the scheme
        </span>
      </label>

      {offered.map((option) => (
        <label key={option.value} className={tileClass}>
          <RadioGroupItem value={option.value} className="sr-only" />
          {/* The swatch is the real thing: `data-paper` makes tokens.css hand
              this element the exact --paper/--ink pair the reader would get,
              so the preview can never drift from the mode. */}
          <span
            data-paper={option.value}
            className="border-rule bg-paper text-ink flex h-11 w-full items-center justify-center rounded-xl border font-serif text-base"
            aria-hidden
          >
            Aa
          </span>
          <span className="text-foreground text-xs font-medium">{option.label}</span>
          <span className="text-muted-foreground text-[0.6875rem] leading-tight">
            {option.hint}
          </span>
        </label>
      ))}
    </RadioGroup>
  );
}

const tileClass = cn(
  "border-border flex cursor-pointer flex-col items-start gap-1.5 rounded-2xl border p-1.5 transition-colors",
  "hover:bg-muted has-data-checked:border-issue-accent has-data-checked:bg-muted",
  "has-focus-visible:ring-ring/40 has-focus-visible:border-ring has-focus-visible:ring-3",
);
