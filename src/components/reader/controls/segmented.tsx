"use client";

/**
 * A two-or-three-way choice.
 *
 * A radio group, not a toggle group. These are mutually exclusive options and
 * a screen reader must hear "Left, radio button, 1 of 2", not two independent
 * pressed states with no relationship between them. Base UI gives us the
 * roving tabindex and arrow-key movement that go with the role.
 */

import { announce } from "@/components/chrome/live-regions";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Appended to the announcement when the plain label is not enough. */
  hint?: string;
}

export interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onValueChange: (value: T) => void;
  /** Phrases the announcement. Defaults to `Label: Option`. */
  announceAs?: (option: SegmentedOption<T>) => string;
  className?: string;
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onValueChange,
  announceAs,
  className,
}: SegmentedProps<T>) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-foreground text-xs font-medium" id={`${label}-label`}>
        {label}
      </span>
      <RadioGroup
        aria-labelledby={`${label}-label`}
        value={value}
        onValueChange={(next) => {
          const option = options.find((o) => o.value === next);
          if (!option) return;
          onValueChange(option.value);
          announce(
            announceAs
              ? announceAs(option)
              : `${label}: ${option.label}${option.hint ? `. ${option.hint}` : ""}`,
          );
        }}
        className="bg-muted/60 flex w-full flex-row gap-0.5 rounded-2xl p-0.5"
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "text-muted-foreground flex flex-1 cursor-pointer items-center justify-center rounded-[1.1rem] px-2 py-1.5 text-xs font-medium transition-colors",
              "hover:text-foreground has-data-checked:bg-background has-data-checked:text-foreground has-data-checked:shadow-sm",
              "has-focus-visible:ring-ring/40 has-focus-visible:ring-3",
            )}
          >
            <RadioGroupItem value={option.value} className="sr-only" />
            {option.label}
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}
