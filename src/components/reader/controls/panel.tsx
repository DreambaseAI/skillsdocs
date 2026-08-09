"use client";

/**
 * The reading-controls panel: six presets and the fourteen Tier-1 controls.
 *
 * Everything here is live. There is no Apply button, no Save, no confirmation
 * — every control writes a custom property onto `<html>` the moment it moves,
 * which is also why the surface is non-modal on desktop: the reader has to be
 * able to watch the paragraph they are reading reflow while they drag.
 *
 * The three spacing maxima (0.16em tracking, 0.32em word spacing, 2.0em
 * paragraph spacing) deliberately overshoot the WCAG 1.4.12 author thresholds
 * (0.12 / 0.16 / 2.0). A layout that only just survives the required values has
 * not been tested; one that survives twice them has.
 */

import { KeyboardIcon, Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { announce } from "@/components/chrome/live-regions";
import { PaperPicker } from "@/components/chrome/paper-picker";
import { ThemeToggle } from "@/components/chrome/theme-toggle";
import { BodyFontPicker, CodeFontPicker } from "@/components/reader/controls/font-picker";
import { PrefSlider } from "@/components/reader/controls/pref-slider";
import { PresetRow } from "@/components/reader/controls/preset-row";
import { Segmented } from "@/components/reader/controls/segmented";
import {
  SizeStepper,
  sizeAnnouncement,
} from "@/components/reader/controls/size-stepper";
import { useReaderPrefs } from "@/components/providers/reader-prefs-provider";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { autoLineHeight, renderedSizePx } from "@/lib/reader/metrics";
import {
  LIMITS,
  type ContrastMode,
  type MotionMode,
  type ParagraphStyle,
  SIZE_STEPS,
  type TextAlign,
} from "@/lib/reader/prefs";

/** The four measure landmarks, in characters per line. */
const CPL_PRESETS = [
  { cpl: 54, label: "Narrow" },
  { cpl: 68, label: "Normal" },
  { cpl: 80, label: "Wide" },
  { cpl: 100, label: "Full" },
] as const;

/** WCAG 1.4.8 AAA asks for no more than 80 characters. */
const CPL_AAA_MAX = 80;
/** Below this the leading is under the 1.4.8 AAA floor for body text. */
const LH_AAA_MIN = 1.5;

export interface ReaderPanelProps {
  /** Opens the shortcuts dialog. Owned by the surface, not the panel. */
  onOpenShortcuts: () => void;
  className?: string;
}

export function ReaderPanel({ onOpenShortcuts, className }: ReaderPanelProps) {
  const {
    prefs,
    extras,
    update,
    applyPreset,
    resetType,
    resetEverything,
    setShortcuts,
    setFocusMode,
  } = useReaderPrefs();

  const sizePx = SIZE_STEPS[prefs.sizeIndex];
  const renderedPx = renderedSizePx(prefs.font, sizePx);
  const autoLh = autoLineHeight(renderedPx);
  const effectiveLh = prefs.lineHeight ?? autoLh;

  return (
    <div className={className}>
      <div className="flex flex-col gap-4">
        <PresetRow value={prefs.preset} onSelect={applyPreset} />

        <Separator />

        {/* ── Type ─────────────────────────────────────────────────── */}

        <SizeStepper
          index={prefs.sizeIndex}
          fontId={prefs.font}
          onIndexChange={(index) => {
            const clamped = Math.min(SIZE_STEPS.length - 1, Math.max(0, index));
            update({ sizeIndex: clamped }, sizeAnnouncement(clamped, prefs.font));
          }}
        />

        <PrefSlider
          label="Line height"
          value={Number(effectiveLh.toFixed(2))}
          min={LIMITS.lineHeight.min}
          max={LIMITS.lineHeight.max}
          step={LIMITS.lineHeight.step}
          onValueChange={(value) => update({ lineHeight: value })}
          format={(value) =>
            prefs.lineHeight === null ? `Auto ${value.toFixed(2)}` : value.toFixed(2)
          }
          valueText={(value) =>
            prefs.lineHeight === null
              ? `Automatic, ${value.toFixed(2)} at this size`
              : `${value.toFixed(2)}`
          }
          announceAs={(value) => `Line height ${value.toFixed(2)}`}
          warning={
            prefs.lineHeight !== null && prefs.lineHeight < LH_AAA_MIN
              ? "Below the 1.5 line spacing WCAG AAA asks for in body text."
              : undefined
          }
          action={
            <Button
              type="button"
              variant={prefs.lineHeight === null ? "secondary" : "ghost"}
              size="xs"
              aria-pressed={prefs.lineHeight === null}
              onClick={() => {
                const next = prefs.lineHeight === null ? autoLh : null;
                update(
                  { lineHeight: prefs.lineHeight === null ? Number(autoLh.toFixed(2)) : null },
                  prefs.lineHeight === null
                    ? `Line height ${next?.toFixed(2)}, manual`
                    : `Line height automatic, ${autoLh.toFixed(2)} at this size`,
                );
              }}
            >
              Auto
            </Button>
          }
        />

        <PrefSlider
          label="Line width"
          value={prefs.cpl}
          min={LIMITS.cpl.min}
          max={LIMITS.cpl.max}
          step={LIMITS.cpl.step}
          onValueChange={(value) => update({ cpl: value })}
          format={(value) => `${value} cpl`}
          valueText={(value) => `${value} characters per line`}
          announceAs={(value) => `Line width ${value} characters per line`}
          warning={
            prefs.cpl > CPL_AAA_MAX
              ? `Over ${CPL_AAA_MAX} characters. WCAG AAA asks for no more.`
              : undefined
          }
        />

        <div className="flex gap-1.5">
          {CPL_PRESETS.map((option) => (
            <Button
              key={option.cpl}
              type="button"
              variant={prefs.cpl === option.cpl ? "secondary" : "outline"}
              size="xs"
              className="flex-1"
              aria-pressed={prefs.cpl === option.cpl}
              onClick={() =>
                update(
                  { cpl: option.cpl },
                  `Line width ${option.label}, ${option.cpl} characters per line`,
                )
              }
            >
              {option.label}
            </Button>
          ))}
        </div>

        <BodyFontPicker
          value={prefs.font}
          sizeStepPx={sizePx}
          cpl={prefs.cpl}
          onValueChange={(font) => update({ font })}
        />

        <CodeFontPicker
          value={prefs.codeFont}
          onValueChange={(codeFont) => update({ codeFont })}
        />

        <Separator />

        {/* ── Spacing ──────────────────────────────────────────────── */}

        <PrefSlider
          label="Letter spacing"
          value={prefs.tracking}
          min={LIMITS.tracking.min}
          max={LIMITS.tracking.max}
          step={LIMITS.tracking.step}
          onValueChange={(value) => update({ tracking: value })}
          format={(value) => `${value.toFixed(3)}em`}
          valueText={(value) => `${value.toFixed(3)} em`}
          announceAs={(value) => `Letter spacing ${value.toFixed(3)} em`}
        />

        <PrefSlider
          label="Word spacing"
          value={prefs.wordSpacing}
          min={LIMITS.wordSpacing.min}
          max={LIMITS.wordSpacing.max}
          step={LIMITS.wordSpacing.step}
          onValueChange={(value) => update({ wordSpacing: value })}
          format={(value) => `${value.toFixed(2)}em`}
          valueText={(value) => `${value.toFixed(2)} em`}
          announceAs={(value) => `Word spacing ${value.toFixed(2)} em`}
        />

        <PrefSlider
          label="Paragraph spacing"
          value={prefs.paraGap}
          min={LIMITS.paraGap.min}
          max={LIMITS.paraGap.max}
          step={LIMITS.paraGap.step}
          onValueChange={(value) => update({ paraGap: value })}
          format={(value) => `${value.toFixed(2)}em`}
          valueText={(value) => `${value.toFixed(2)} em`}
          announceAs={(value) => `Paragraph spacing ${value.toFixed(2)} em`}
          disabled={prefs.paraStyle === "indented"}
          warning={
            prefs.paraStyle === "indented"
              ? "Indented paragraphs do not take a gap as well; one or the other."
              : undefined
          }
        />

        <Segmented<ParagraphStyle>
          label="Paragraphs"
          value={prefs.paraStyle}
          options={[
            { value: "spaced", label: "Spaced" },
            { value: "indented", label: "Indented" },
          ]}
          onValueChange={(paraStyle) => update({ paraStyle })}
        />

        <Segmented<TextAlign>
          label="Alignment"
          value={prefs.align}
          options={[
            { value: "left", label: "Ragged" },
            {
              value: "justify",
              label: "Justified",
              hint: "Justified text is harder to read for some people. Hyphenation is switched on with it.",
            },
          ]}
          onValueChange={(align) => update({ align })}
        />

        <Separator />

        {/* ── Surface ──────────────────────────────────────────────── */}

        <div className="flex flex-col gap-1.5">
          <span className="text-foreground text-xs font-medium">Colour scheme</span>
          <ThemeToggle />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-foreground text-xs font-medium">Paper</span>
          <PaperPicker
            value={prefs.paper}
            onValueChange={(paper) => update({ paper })}
          />
        </div>

        <Segmented<ContrastMode>
          label="Contrast"
          value={prefs.contrast}
          options={[
            { value: "normal", label: "Normal" },
            { value: "high", label: "High" },
          ]}
          onValueChange={(contrast) => update({ contrast })}
        />

        <Segmented<MotionMode>
          label="Motion"
          value={prefs.motion}
          options={[
            { value: "system", label: "System" },
            { value: "reduce", label: "Reduce" },
            { value: "allow", label: "Allow" },
          ]}
          onValueChange={(motion) => update({ motion })}
          announceAs={(option) =>
            option.value === "system"
              ? "Motion: follow the system setting"
              : `Motion: ${option.label.toLowerCase()}, overriding the system setting`
          }
        />

        <Separator />

        {/* ── Reading tools ────────────────────────────────────────── */}

        <label className="flex items-start justify-between gap-3">
          <span className="flex flex-col gap-0.5">
            <span className="text-foreground text-xs font-medium">Focus mode</span>
            <span className="text-muted-foreground text-[0.6875rem] leading-snug">
              Dims everything but the block you are reading. Escape exits.
            </span>
          </span>
          <Switch
            checked={extras.focusMode}
            onCheckedChange={setFocusMode}
            aria-label="Focus mode"
          />
        </label>

        <Separator />

        {/* ── Keyboard ─────────────────────────────────────────────── */}

        <div className="flex flex-col gap-2">
          <label className="flex items-start justify-between gap-3">
            <span className="flex flex-col gap-0.5">
              <span className="text-foreground text-xs font-medium">
                Keyboard shortcuts
              </span>
              {/*
                WCAG 2.1.4 escape (b). Speech-input users say words, and words
                are made of the single characters this keymap binds; a switch
                that turns all of them off is the only fix that works when the
                reader never focuses an input at all.
              */}
              <span className="text-muted-foreground text-[0.6875rem] leading-snug">
                Single-key shortcuts like <Kbd>T</Kbd> and <Kbd>,</Kbd>. Turn off if they
                collide with speech input or assistive technology.
              </span>
            </span>
            <Switch
              checked={extras.shortcuts.enabled}
              onCheckedChange={(enabled) => {
                setShortcuts({ ...extras.shortcuts, enabled });
                announce(
                  enabled ? "Keyboard shortcuts on" : "Keyboard shortcuts off",
                );
              }}
              aria-label="Keyboard shortcuts"
            />
          </label>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onOpenShortcuts}
          >
            <HugeiconsIcon icon={KeyboardIcon} data-icon="inline-start" aria-hidden />
            Shortcuts and remapping
          </Button>
        </div>

        <Separator />

        {/* ── Reset ────────────────────────────────────────────────── */}

        <div className="flex gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={resetType}
          >
            <HugeiconsIcon icon={Refresh01Icon} data-icon="inline-start" aria-hidden />
            Reset type
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex-1"
            onClick={resetEverything}
          >
            Reset everything
          </Button>
        </div>

        {/*
          A specimen at the reader's own settings. On a phone the drawer covers
          the paragraph they were reading, so without this the controls would
          be operating on text they cannot see.
        */}
        <p className="reader-sample text-ink border-rule bg-paper rounded-2xl border p-3">
          Skills are markdown documents that teach an agent how to do a specific job
          well — the goal, the traps, and one worked example.
        </p>
      </div>
    </div>
  );
}
