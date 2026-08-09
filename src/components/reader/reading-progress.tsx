"use client";

/**
 * How far through the chapter you are.
 *
 * Deliberately JS rather than `animation-timeline: scroll()`. The CSS version
 * is cheaper and runs off the main thread, but it can only move a bar — it
 * cannot produce the number, and a progress indicator with no `aria-valuenow`
 * is decoration that lies about being informative. One `requestAnimationFrame`
 * coalesced write per scroll burst is not the expensive part of this page.
 *
 * Reduced motion is honoured in `reader.css`: the bar still tracks the scroll,
 * because that is information, but it stops easing between frames, which is
 * the part that reads as movement.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface ReadingProgressProps {
  /**
   * The element whose reading is being measured. Defaults to the document.
   * Pass the chapter body and the bar means "through this chapter" rather than
   * "through this page", which is what the running head claims.
   */
  targetRef?: React.RefObject<HTMLElement | null>;
  className?: string;
}

export function ReadingProgress({ targetRef, className }: ReadingProgressProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    let frame = 0;
    let lastReported = -1;

    function measure(): number {
      const target = targetRef?.current;
      if (target) {
        const rect = target.getBoundingClientRect();
        const scrollable = rect.height - window.innerHeight;
        if (scrollable <= 0) return rect.bottom <= window.innerHeight ? 1 : 0;
        return clamp01(-rect.top / scrollable);
      }
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      // A page shorter than the viewport is fully read the moment it renders.
      if (scrollable <= 0) return 1;
      return clamp01(window.scrollY / scrollable);
    }

    function update() {
      frame = 0;
      const ratio = measure();
      barRef.current?.style.setProperty("--reading-progress", ratio.toFixed(4));

      // React only re-renders when the announced integer actually moves, so a
      // 900px scroll costs nine renders rather than nine hundred.
      const rounded = Math.round(ratio * 100);
      if (rounded !== lastReported) {
        lastReported = rounded;
        setPercent(rounded);
      }
    }

    function schedule() {
      if (frame) return;
      frame = requestAnimationFrame(update);
    }

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [targetRef]);

  return (
    <div
      role="progressbar"
      aria-label="Reading progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${percent}% read`}
      className={cn("reading-progress", className)}
    >
      <div ref={barRef} className="reading-progress__bar" />
    </div>
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
