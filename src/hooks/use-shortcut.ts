"use client";

import { useEffect, useRef } from "react";
import { onShortcut, type ShortcutAction } from "@/lib/shortcuts";

/**
 * Run `handler` when `action` fires.
 *
 * The handler is held in a ref so a caller can pass an inline closure without
 * resubscribing on every render — which matters here because most of these
 * closures capture reading preferences and those change on every slider frame.
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
    return onShortcut((fired) => {
      if (fired === action) ref.current();
    });
  }, [action, enabled]);
}
