"use client";

/**
 * The slider every numeric reading control is made of.
 *
 * It composes Base UI's slider parts directly instead of reusing
 * `components/ui/slider.tsx`, for one reason: that wrapper does not forward
 * `getAriaValueText` to the thumb, so its `aria-valuetext` is the bare number.
 * "0.16" is not a letter-spacing value a screen-reader user can act on;
 * "0.16 em, above the WCAG minimum" is. Every slider in this panel therefore
 * carries a real value text and announces the committed result.
 */

import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { useId } from "react";
import { announce } from "@/components/chrome/live-regions";
import { cn } from "@/lib/utils";

export interface PrefSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onValueChange: (value: number) => void;
  /** What the reader sees next to the label, e.g. `0.16 em`. */
  format: (value: number) => string;
  /** What a screen reader hears. Defaults to `format`. */
  valueText?: (value: number) => string;
  /** Announced on commit, e.g. `Letter spacing 0.16 em`. */
  announceAs?: (value: number) => string;
  /** Rendered under the track when the current value deserves a caveat. */
  warning?: string;
  disabled?: boolean;
  /** Rendered to the right of the label — reset-to-default, usually. */
  action?: React.ReactNode;
  className?: string;
}

export function PrefSlider({
  label,
  value,
  min,
  max,
  step,
  onValueChange,
  format,
  valueText,
  announceAs,
  warning,
  disabled,
  action,
  className,
}: PrefSliderProps) {
  const warningId = useId();
  const text = valueText ?? format;

  return (
    <SliderPrimitive.Root
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      thumbAlignment="edge"
      onValueChange={(next) => onValueChange(next)}
      // Live means live: the value is applied on every frame of the drag, but
      // announcing every frame would make the live region unusable, so the
      // spoken confirmation waits for the reader to let go.
      onValueCommitted={(next) => {
        announce(announceAs ? announceAs(next) : `${label} ${text(next)}`);
      }}
      className={cn("flex flex-col gap-1.5", className)}
    >
      <div className="flex items-baseline justify-between gap-2">
        {/* Base UI associates the label with the thumbs itself, which is why
            the part refuses an `id` — do not add one back. */}
        <SliderPrimitive.Label className="text-foreground text-xs font-medium">
          {label}
        </SliderPrimitive.Label>
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs tabular-nums">
          {format(value)}
          {action}
        </span>
      </div>

      <SliderPrimitive.Control className="relative flex h-5 w-full touch-none items-center select-none data-disabled:opacity-50">
        {/* The `data-slot` hooks are what `theme-modes.css` redraws the
            control from under `forced-colors: active`, where a control made of
            backgrounds and a box-shadow renders as nothing at all. */}
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="bg-input/90 relative h-1.5 w-full grow overflow-hidden rounded-full select-none"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-indicator"
            className="bg-issue-accent h-full select-none"
          />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          aria-describedby={warning ? warningId : undefined}
          getAriaValueText={(_formatted, raw) => text(raw)}
          /* `ring-foreground/70`, not `/15`. A white thumb ringed at 15% over a
             white popover measured 1.02:1 against its surroundings and 1.22:1
             against its own track — sampled from a rendered screenshot — so in
             light mode the only moving part of the control had no visible
             boundary at all (WCAG 1.4.11 wants 3:1). At 70% the ring measures
             ~7:1 against the thumb and ~5:1 against the track. */
          className="ring-foreground/70 hover:ring-ring/40 focus-visible:ring-ring/40 block size-4 shrink-0 rounded-full bg-white shadow-md ring-1 transition-shadow select-none not-dark:bg-clip-padding hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden"
        />
      </SliderPrimitive.Control>

      {warning ? (
        <p id={warningId} className="text-muted-foreground text-[0.6875rem] leading-snug">
          {warning}
        </p>
      ) : null}
    </SliderPrimitive.Root>
  );
}
