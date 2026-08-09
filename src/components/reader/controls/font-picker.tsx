"use client";

/**
 * Control 1 — body face, and control 2 — code face.
 *
 * Each option renders in its own typeface. That is not decoration: the labels
 * are the only honest preview, and rendering them is also what triggers the
 * lazy `@font-face` fetch, so by the time the reader clicks Garamond the
 * browser already has it. Eleven of the fifteen faces ship with
 * `preload: false` precisely so that opening this picker is what pays for them.
 */

import { announce } from "@/components/chrome/live-regions";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { BODY_FONTS, CODE_FONTS, type FontChoice, fontStack } from "@/lib/fonts";
import { measurePx, metricsFor, renderedSizePx } from "@/lib/reader/metrics";
import { cn } from "@/lib/utils";

const GROUP_ORDER: { id: FontChoice["category"]; label: string }[] = [
  { id: "serif", label: "Literary" },
  { id: "sans", label: "Modern" },
  { id: "accessible", label: "Accessible" },
  { id: "mono", label: "Monospaced" },
];

export interface BodyFontPickerProps {
  value: string;
  /** The reader's current size step, in px, for the spoken confirmation. */
  sizeStepPx: number;
  cpl: number;
  onValueChange: (id: string) => void;
}

export function BodyFontPicker({
  value,
  sizeStepPx,
  cpl,
  onValueChange,
}: BodyFontPickerProps) {
  return (
    <RadioGroup
      aria-label="Body typeface"
      value={value}
      onValueChange={(next) => {
        const id = String(next);
        const choice = BODY_FONTS.find((f) => f.id === id);
        onValueChange(id);
        if (!choice) return;
        /*
         * The announcement carries the numbers because they are the whole
         * point of the x-height and average-advance normalisation: the reader
         * should hear that the line still holds the same number of characters
         * even though the family changed under it.
         */
        announce(
          `Body typeface: ${choice.label}. ` +
            `${Math.round(renderedSizePx(id, sizeStepPx))} pixels, ` +
            `${cpl} characters per line.`,
        );
      }}
      className="grid grid-cols-2 gap-1.5"
    >
      {GROUP_ORDER.map(({ id, label }) => {
        const group = BODY_FONTS.filter((f) => f.category === id);
        if (group.length === 0) return null;
        return (
          <div key={id} className="col-span-2 flex flex-col gap-1.5">
            <span className="text-muted-foreground text-[0.6875rem] font-medium tracking-wide uppercase">
              {label}
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {group.map((choice) => (
                <FontTile
                  key={choice.id}
                  choice={choice}
                  measure={measurePx(choice.id, sizeStepPx, cpl)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </RadioGroup>
  );
}

function FontTile({ choice, measure }: { choice: FontChoice; measure: number }) {
  const metrics = metricsFor(choice.id);
  return (
    <label
      className={cn(
        "border-border flex cursor-pointer flex-col gap-0.5 rounded-2xl border px-2.5 py-2 transition-colors",
        "hover:bg-muted has-data-checked:border-issue-accent has-data-checked:bg-muted",
        "has-focus-visible:ring-ring/40 has-focus-visible:border-ring has-focus-visible:ring-3",
      )}
    >
      <RadioGroupItem value={choice.id} className="sr-only" />
      <span
        className="text-foreground truncate text-base leading-snug"
        style={{ fontFamily: fontStack(choice) }}
      >
        {choice.label}
      </span>
      <span className="text-muted-foreground text-[0.6875rem] tabular-nums">
        {Math.round(measure)}px column
        {metrics.sizeMult !== 1 ? ` · ×${metrics.sizeMult.toFixed(3)}` : ""}
      </span>
    </label>
  );
}

export interface CodeFontPickerProps {
  value: string;
  onValueChange: (id: string) => void;
}

export function CodeFontPicker({ value, onValueChange }: CodeFontPickerProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-foreground text-xs font-medium" id="code-face-label">
        Code typeface
      </span>
      <RadioGroup
        aria-labelledby="code-face-label"
        value={value}
        onValueChange={(next) => {
          const id = String(next);
          onValueChange(id);
          const choice = CODE_FONTS.find((f) => f.id === id);
          announce(`Code typeface: ${choice?.label ?? id}`);
        }}
        className="grid grid-cols-3 gap-1.5"
      >
        {CODE_FONTS.map((choice) => (
          <label
            key={choice.id}
            className={cn(
              "border-border flex cursor-pointer items-center justify-center rounded-2xl border px-2 py-2 text-xs transition-colors",
              "hover:bg-muted has-data-checked:border-issue-accent has-data-checked:bg-muted",
              "has-focus-visible:ring-ring/40 has-focus-visible:border-ring has-focus-visible:ring-3",
            )}
            style={{ fontFamily: fontStack(choice) }}
          >
            <RadioGroupItem value={choice.id} className="sr-only" />
            <span className="text-foreground truncate">{choice.label}</span>
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}
