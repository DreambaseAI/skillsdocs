"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  hasShortcutListener,
  onShortcut,
  onShortcutRegistryChange,
  type ShortcutAction,
} from "@/lib/shortcuts";

/**
 * Run `handler` when `action` fires.
 *
 * The handler is held in a ref so a caller can pass an inline closure without
 * resubscribing on every render — which matters here because most of these
 * closures capture reading preferences and those change on every slider frame.
 *
 * Subscribing also *registers* the action: the dispatcher will not swallow a
 * key that has no subscriber, and the shortcuts dialog will not advertise one.
 */
export function useShortcut(
  action: ShortcutAction,
  handler: () => void,
  enabled = true,
): void {
  const ref = useRef(handler);
  // Updated in an effect rather than during render: writing a ref while
  // rendering is a tearing hazard under concurrent React, and the lint rule
  // that forbids it is right.
  useEffect(() => {
    ref.current = handler;
  });

  useEffect(() => {
    if (!enabled) return;
    return onShortcut(action, () => ref.current());
  }, [action, enabled]);
}

/**
 * Whether anything on this page currently handles `action`.
 *
 * The server snapshot is `false` — nothing is subscribed until the client
 * mounts — so the dialog renders its "not available here" state first and
 * fills in, rather than claiming a shortcut works and then withdrawing it.
 */
export function useShortcutAvailable(action: ShortcutAction): boolean {
  return useSyncExternalStore(
    onShortcutRegistryChange,
    () => hasShortcutListener(action),
    () => false,
  );
}
