"use client";

/**
 * The keymap, visible and editable.
 *
 * This dialog is escape (c) of WCAG 2.1.4: every single-character shortcut can
 * be remapped, and the remapping persists with the reading preferences. It is
 * also the only place the keymap is documented, which is the other half of the
 * problem — a shortcut nobody can discover is a shortcut that only fires by
 * accident.
 *
 * The dialog carries `role="dialog"`, which `isEditableTarget` treats as
 * off-limits, so the shortcuts are inert while it is open. Recording a new
 * binding therefore cannot fire the action it is trying to rebind.
 */

import { Alert01Icon, Delete02Icon, RecordIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useState } from "react";
import { announce } from "@/components/chrome/live-regions";
import { useHydrated } from "@/components/chrome/theme-toggle";
import { useReaderPrefs } from "@/components/providers/reader-prefs-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useShortcutAvailable } from "@/hooks/use-shortcut";
import {
  bindingsFor,
  conflictFor,
  formatKey,
  normalizeKey,
  SHORTCUT_BY_ACTION,
  SHORTCUT_GROUP_LABELS,
  SHORTCUTS,
  type ShortcutAction,
  type ShortcutGroup,
  type ShortcutSettings,
} from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

const GROUPS: ShortcutGroup[] = ["navigation", "reading", "display", "actions"];

export interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  const { extras, setShortcuts } = useReaderPrefs();
  const settings = extras.shortcuts;
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const hydrated = useHydrated();

  // `navigator` is not available during SSR and the answer changes the glyph,
  // so the platform is only consulted once the client is in charge.
  const platform: "mac" | "other" =
    hydrated && /mac|iphone|ipad/i.test(navigator.userAgent) ? "mac" : "other";

  const rebind = useCallback(
    (action: ShortcutAction, key: string) => {
      const clash = conflictFor(key, action, settings);
      if (clash) {
        const label = SHORTCUT_BY_ACTION[clash].label;
        setConflict(`${formatKey(key, platform).join(" ")} is already ${label}.`);
        announce(`That key is already assigned to ${label}.`, "assertive");
        return;
      }
      setShortcuts({
        ...settings,
        bindings: { ...settings.bindings, [action]: [key] },
      });
      setConflict(null);
      setRecording(null);
      announce(
        `${SHORTCUT_BY_ACTION[action].label} is now ${formatKey(key, platform).join(" ")}`,
      );
    },
    [settings, setShortcuts, platform],
  );

  // Recording listens on the window rather than an input, because the whole
  // point is to capture keys an input would swallow.
  useEffect(() => {
    if (!recording) return;
    // Captured after the guard: a hoisted function declaration is analysed
    // before it, so `recording` would still read as nullable inside.
    const action = recording;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setRecording(null);
        setConflict(null);
        announce("Recording cancelled");
        return;
      }
      const key = normalizeKey(event);
      if (!key) return;
      event.preventDefault();
      event.stopPropagation();
      rebind(action, key);
    }

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [recording, rebind]);

  const clearOverride = useCallback(
    (action: ShortcutAction) => {
      const next = { ...settings.bindings };
      delete next[action];
      setShortcuts({ ...settings, bindings: next });
      announce(`${SHORTCUT_BY_ACTION[action].label} reset to its default key`);
    },
    [settings, setShortcuts],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setRecording(null);
          setConflict(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Single-key shortcuts are inert while you are typing in a field or a
            dialog. Rebind anything that collides with your assistive technology,
            or switch the lot off.
          </DialogDescription>
        </DialogHeader>

        <label className="bg-muted/50 flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5">
          <span className="text-foreground text-sm font-medium">
            Shortcuts enabled
          </span>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(enabled) => {
              setShortcuts({ ...settings, enabled });
              announce(enabled ? "Keyboard shortcuts on" : "Keyboard shortcuts off");
            }}
            aria-label="Keyboard shortcuts enabled"
          />
        </label>

        {conflict ? (
          <p
            role="status"
            className="text-destructive flex items-start gap-2 text-xs leading-snug"
          >
            <HugeiconsIcon icon={Alert01Icon} className="mt-px size-3.5" aria-hidden />
            {conflict}
          </p>
        ) : null}

        <div className="max-h-[52dvh] overflow-y-auto overscroll-contain pr-1">
          {GROUPS.map((group) => {
            const rows = SHORTCUTS.filter((s) => s.group === group);
            if (rows.length === 0) return null;
            return (
              <section key={group} className="mb-4 flex flex-col gap-1">
                <h3 className="text-muted-foreground text-[0.6875rem] font-medium tracking-wide uppercase">
                  {SHORTCUT_GROUP_LABELS[group]}
                </h3>
                <Separator className="mb-1" />
                {rows.map((def) => (
                  <ShortcutRow
                    key={def.action}
                    def={def}
                    settings={settings}
                    platform={platform}
                    recording={recording === def.action}
                    onRecord={(next) => {
                      setConflict(null);
                      setRecording(next ? def.action : null);
                    }}
                    onClear={() => clearOverride(def.action)}
                  />
                ))}
              </section>
            );
          })}
        </div>

        <p className="text-muted-foreground text-[0.6875rem] leading-snug">
          <Kbd>J</Kbd> and <Kbd>K</Kbd> are left free on purpose: readers expect
          them as next and previous <em>item</em>, and <Kbd>K</Kbd> is NVDA&rsquo;s
          link key in browse mode.
        </p>
      </DialogContent>
    </Dialog>
  );
}

interface ShortcutRowProps {
  def: (typeof SHORTCUTS)[number];
  settings: ShortcutSettings;
  platform: "mac" | "other";
  recording: boolean;
  onRecord: (next: boolean) => void;
  onClear: () => void;
}

/**
 * One row of the keymap.
 *
 * `available` is the honest bit. Eleven of the sixteen actions had no
 * subscriber anywhere in the app, and this dialog printed a key cap for every
 * one of them — a reader was told `]` was "Next chapter", pressed it, and
 * nothing moved. Now a row whose action nothing on this page handles says so,
 * and the dispatcher leaves that key to the browser.
 */
function ShortcutRow({
  def,
  settings,
  platform,
  recording: isRecording,
  onRecord,
  onClear,
}: ShortcutRowProps) {
  const available = useShortcutAvailable(def.action);
  const keys = bindingsFor(def.action, settings);
  const overridden = Boolean(settings.bindings[def.action]);

  return (
                    <div
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-xl px-2 py-1.5",
                        isRecording && "bg-muted",
                      )}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="text-foreground truncate text-sm">
                          {def.label}
                        </span>
                        {/* Never dimmed with `opacity`: compositing this note
                            at 60% dropped `--muted-foreground` under 4.5:1
                            (axe, serious). Unavailability is said in words. */}
                        <span className="text-muted-foreground truncate text-[0.6875rem]">
                          {available ? def.note : "Not available on this page"}
                        </span>
                      </span>

                      <span className="flex shrink-0 items-center gap-1.5">
                        {isRecording ? (
                          <span className="text-muted-foreground text-xs">
                            Press a key…
                          </span>
                        ) : (
                          keys.map((key) => (
                            <KbdGroup key={key}>
                              {formatKey(key, platform).map((part, index) => (
                                <Kbd key={`${key}-${index}`}>{part}</Kbd>
                              ))}
                            </KbdGroup>
                          ))
                        )}

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={
                            isRecording
                              ? `Cancel recording for ${def.label}`
                              : `Change the key for ${def.label}`
                          }
                          onClick={() => onRecord(!isRecording)}
                        >
                          <HugeiconsIcon icon={RecordIcon} aria-hidden />
                        </Button>

                        {overridden ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Reset ${def.label} to its default key`}
                            onClick={onClear}
                          >
                            <HugeiconsIcon icon={Delete02Icon} aria-hidden />
                          </Button>
                        ) : null}
                      </span>
                    </div>
  );
}
