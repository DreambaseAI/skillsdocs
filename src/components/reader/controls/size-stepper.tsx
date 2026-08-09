"use client";

/**
 * Control 3 — font size.
 *
 * A stepper on a 17-rung ladder, not a slider. Discrete steps are keyboard
 * addressable, they serialise to one integer, and they stop a reader landing
 * on 17.3px and wondering why the page looks slightly wrong. The ladder is
 * `SIZE_STEPS`, and the buttons are the same thing `Shift+=` / `Shift+-` do.
 */

import { MinusSignIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { renderedSizePx } from "@/lib/reader/metrics";
import { SIZE_STEPS } from "@/lib/reader/prefs";

export interface SizeStepperProps {
  index: number;
  fontId: string;
  onIndexChange: (index: number) => void;
}

/** The announcement both the buttons and the keyboard shortcut use. */
export function sizeAnnouncement(index: number, fontId: string): string {
  const step = SIZE_STEPS[index];
  const rendered = Math.round(renderedSizePx(fontId, step));
  // The two numbers differ whenever the family needs an x-height correction,
  // and hiding that would make the ladder look like it skips rungs.
  return rendered === step
    ? `Font size ${step} pixels`
    : `Font size ${step} pixels, rendering at ${rendered}`;
}

export function SizeStepper({ index, fontId, onIndexChange }: SizeStepperProps) {
  const step = SIZE_STEPS[index];
  const rendered = Math.round(renderedSizePx(fontId, step));
  const atMin = index <= 0;
  const atMax = index >= SIZE_STEPS.length - 1;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-foreground text-xs font-medium" id="reader-size-label">
          Font size
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {step}px{rendered === step ? "" : ` · ${rendered}px rendered`}
        </span>
      </div>

      <div
        role="group"
        aria-labelledby="reader-size-label"
        className="bg-muted/60 flex items-center gap-1 rounded-2xl p-1"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={atMin}
          aria-label={`Smaller text. Currently ${step} pixels.`}
          onClick={() => onIndexChange(index - 1)}
        >
          <HugeiconsIcon icon={MinusSignIcon} data-icon="inline-start" aria-hidden />
        </Button>

        {/*
          A meter, not a progressbar: this is a value inside a known range that
          the reader controls, which is exactly what `meter` is for, and it
          keeps the two buttons from having to carry the state themselves.
        */}
        <div
          role="meter"
          aria-labelledby="reader-size-label"
          aria-valuemin={SIZE_STEPS[0]}
          aria-valuemax={SIZE_STEPS[SIZE_STEPS.length - 1]}
          aria-valuenow={step}
          aria-valuetext={`${step} pixels`}
          className="bg-input/90 relative h-1.5 flex-1 overflow-hidden rounded-full"
        >
          <div
            className="bg-issue-accent h-full"
            style={{ width: `${(index / (SIZE_STEPS.length - 1)) * 100}%` }}
          />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={atMax}
          aria-label={`Larger text. Currently ${step} pixels.`}
          onClick={() => onIndexChange(index + 1)}
        >
          <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
