"use client";

/**
 * The six presets.
 *
 * First thing in the panel, because it is the only thing most readers will
 * touch. Each tile previews itself in its own face — the same trick as the
 * font picker, and the same side benefit of warming the lazy `@font-face`.
 *
 * "Custom" is a state, not a button: it appears when the current settings stop
 * matching any preset and disappears again the moment they do.
 */

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { fontById, fontStack } from "@/lib/fonts";
import { PRESETS, type ReaderPreset } from "@/lib/reader/presets";
import { SIZE_STEPS } from "@/lib/reader/prefs";
import { cn } from "@/lib/utils";

export interface PresetRowProps {
  /** The preset the current settings actually are, or null for Custom. */
  value: string | null;
  onSelect: (preset: ReaderPreset) => void;
}

export function PresetRow({ value, onSelect }: PresetRowProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-foreground text-xs font-medium" id="reader-preset-label">
          Preset
        </span>
        {value === null ? (
          <span className="text-muted-foreground text-xs">Custom</span>
        ) : null}
      </div>

      <RadioGroup
        aria-labelledby="reader-preset-label"
        value={value ?? ""}
        onValueChange={(next) => {
          const preset = PRESETS.find((p) => p.id === next);
          if (preset) onSelect(preset);
        }}
        className="grid grid-cols-3 gap-1.5"
      >
        {PRESETS.map((preset) => (
          <label
            key={preset.id}
            title={preset.hint}
            className={cn(
              "border-border flex cursor-pointer flex-col gap-0.5 rounded-2xl border px-2 py-2 transition-colors",
              "hover:bg-muted has-data-checked:border-issue-accent has-data-checked:bg-muted",
              "has-focus-visible:ring-ring/40 has-focus-visible:border-ring has-focus-visible:ring-3",
            )}
          >
            <RadioGroupItem
              value={preset.id}
              className="sr-only"
              aria-label={`${preset.label}. ${preset.hint}`}
            />
            <span
              className="text-foreground truncate text-sm"
              style={{
                fontFamily: (() => {
                  const choice = fontById(preset.prefs.font);
                  return choice ? fontStack(choice) : undefined;
                })(),
              }}
            >
              {preset.label}
            </span>
            <span className="text-muted-foreground text-[0.625rem] tabular-nums">
              {SIZE_STEPS[preset.prefs.sizeIndex]}px · {preset.prefs.cpl} cpl
            </span>
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}
