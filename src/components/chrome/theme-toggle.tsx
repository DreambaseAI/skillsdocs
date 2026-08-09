"use client";

/**
 * Axis A — colour scheme.
 *
 * This is the *chrome's* theme, not the reading surface: shadcn/stone tokens,
 * header, rails, popovers. The reading surface is axis B (`PaperPicker`) and
 * amplification is axis C (contrast). Keeping them separate is what lets a
 * reader run sepia paper inside a dark application, and what stops twenty
 * different issues from looking like twenty different websites.
 *
 * Presentational only — WS-5 composes these into the controls panel. Nothing
 * here imports from `components/reader/controls/`.
 */

import { ComputerIcon, Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTheme } from "next-themes";
import { useCallback, useSyncExternalStore } from "react";
import { announce } from "@/components/chrome/live-regions";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useShortcut } from "@/hooks/use-shortcut";
import { cn } from "@/lib/utils";

export type ColorScheme = "light" | "dark" | "system";

interface SchemeOption {
  value: ColorScheme;
  label: string;
  icon: typeof Sun03Icon;
}

export const SCHEME_OPTIONS: SchemeOption[] = [
  { value: "light", label: "Light", icon: Sun03Icon },
  { value: "dark", label: "Dark", icon: Moon02Icon },
  { value: "system", label: "System", icon: ComputerIcon },
];

function isScheme(value: unknown): value is ColorScheme {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * The next scheme in the `D` cycle.
 *
 * Two of the three states render identically — "system" *is* light or dark —
 * so any 3-cycle over them contains exactly one step that changes nothing on
 * screen. That is arithmetic, not a bug. The bug was *which* step it landed on.
 *
 * The old order was a fixed `light → dark → system`, so a reader on the default
 * "system" setting with a light OS pressed `D` and got "light": same class on
 * `<html>`, same pixels, no evidence anything had happened. Measured in
 * Chromium at `prefers-color-scheme: light` — press 1 `system → light`
 * (`class="… light"` both sides), press 2 `light → dark`, press 3
 * `dark → system` (light again). The key was live the whole time; it just
 * opened with a no-op, which reads exactly like a dead binding.
 *
 * So the cycle is now oriented against the OS: leave "system" for the scheme
 * it is *not*, cross to the scheme it is, and only then return to "system" —
 * putting the unavoidable no-op on the one edge where nothing changing is the
 * expected outcome ("match my system", which is what you were already seeing).
 *
 *   OS light:  system → dark → light → system
 *   OS dark:   system → light → dark → system
 */
export function nextScheme(
  value: ColorScheme,
  systemPrefersDark: boolean,
): ColorScheme {
  const matching: ColorScheme = systemPrefersDark ? "dark" : "light";
  const opposing: ColorScheme = systemPrefersDark ? "light" : "dark";
  if (value === "system") return opposing;
  if (value === opposing) return matching;
  return "system";
}

const NEVER_CHANGES = () => () => {};

/**
 * True only after hydration.
 *
 * `useSyncExternalStore` with a server snapshot of `false` is the hydration-
 * safe form: a `useState` + `useEffect(() => setMounted(true))` pair does the
 * same job but schedules a cascading render, which the React Compiler lint
 * rules reject outright.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );
}

/**
 * next-themes reads `localStorage` on the client, so `theme` can disagree with
 * what the server rendered for exactly one frame. Report the provider default
 * until hydrated; both sides then render "system" and there is no mismatch.
 */
function useScheme() {
  const { theme, setTheme, resolvedTheme, systemTheme } = useTheme();
  const mounted = useHydrated();

  const value: ColorScheme = mounted && isScheme(theme) ? theme : "system";
  const resolved = mounted && resolvedTheme === "dark" ? "dark" : "light";
  const systemPrefersDark = mounted && systemTheme === "dark";

  const change = useCallback(
    (next: ColorScheme) => {
      setTheme(next);
      const label = SCHEME_OPTIONS.find((o) => o.value === next)?.label ?? next;
      // "System" alone tells the reader nothing about what they are about to
      // see, so say what it resolved to.
      announce(
        next === "system"
          ? `Theme: match system. Currently ${window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"}.`
          : `Theme: ${label}`,
      );
    },
    [setTheme],
  );

  return { value, resolved, systemPrefersDark, mounted, change };
}

/* --------------------------------------------------------------- segmented */

export interface ThemeToggleProps {
  className?: string;
  /** Accessible name for the group. */
  label?: string;
}

/**
 * The full three-way control for the reading-controls panel.
 *
 * A radio group, not a toggle group: these are three mutually exclusive
 * choices and a screen reader must hear "1 of 3", not three independent
 * pressed states. Base UI gives us roving tabindex and arrow-key movement.
 */
export function ThemeToggle({ className, label = "Colour scheme" }: ThemeToggleProps) {
  const { value, change } = useScheme();

  return (
    <RadioGroup
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        if (isScheme(next)) change(next);
      }}
      className={cn("grid grid-cols-3 gap-1.5", className)}
    >
      {SCHEME_OPTIONS.map((option) => (
        <label
          key={option.value}
          className={cn(
            "border-border bg-background text-muted-foreground flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border px-2 py-2.5 text-xs font-medium transition-colors",
            "hover:bg-muted has-data-checked:border-issue-accent has-data-checked:text-foreground has-data-checked:bg-muted",
            "has-focus-visible:ring-ring/40 has-focus-visible:border-ring has-focus-visible:ring-3",
          )}
        >
          <RadioGroupItem value={option.value} className="sr-only" />
          <HugeiconsIcon icon={option.icon} className="size-4" aria-hidden />
          {option.label}
        </label>
      ))}
    </RadioGroup>
  );
}

/* ------------------------------------------------------------------ compact */

export interface ThemeToggleButtonProps {
  className?: string;
}

/**
 * The header affordance and the target of the `D` shortcut: one button that
 * cycles light → dark → system. `aria-live` is deliberately absent — the
 * button's own accessible name changes, and `announce()` says what happened,
 * so a live region on the button itself would double up.
 */
export function ThemeToggleButton({ className }: ThemeToggleButtonProps) {
  const { value, resolved, systemPrefersDark, mounted, change } = useScheme();

  const current = SCHEME_OPTIONS.find((o) => o.value === value) ?? SCHEME_OPTIONS[2];
  const next = nextScheme(value, systemPrefersDark);
  const nextLabel = SCHEME_OPTIONS.find((o) => o.value === next)?.label ?? next;

  // The `D` shortcut. `change()` already announces the result, so the keyboard
  // path and the pointer path say the same thing — and `nextScheme` is what
  // makes the first press of `D` from the default "system" state actually
  // repaint the page instead of quietly reassigning it the same colours.
  useShortcut("themeCycle", () => change(next));

  // Before mount we cannot know the resolved scheme, so show the neutral
  // system glyph rather than guessing and flipping.
  const icon = !mounted
    ? ComputerIcon
    : value === "system"
      ? ComputerIcon
      : resolved === "dark"
        ? Moon02Icon
        : Sun03Icon;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={className}
      aria-label={`Theme: ${current.label}. Switch to ${nextLabel}.`}
      onClick={() => change(next)}
    >
      <HugeiconsIcon icon={icon} data-icon="inline-start" aria-hidden />
    </Button>
  );
}
