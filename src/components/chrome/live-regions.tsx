"use client";

import { useEffect, useState } from "react";

/**
 * The app's two screen-reader announcement channels.
 *
 * A single pair of regions lives at the document root for the whole session.
 * Mounting a live region at the moment it has something to say does not work —
 * assistive technology must observe the region *before* its content changes —
 * so these render empty and are written to through `announce()`.
 */

type Politeness = "polite" | "assertive";

const listeners = new Set<(message: string, politeness: Politeness) => void>();

/**
 * Announce a message to screen readers.
 *
 * Use `polite` for state the reader caused and can wait for ("Font size 21
 * pixels", "Chapter 4 of 9"); reserve `assertive` for failures that interrupt
 * what they were doing.
 */
export function announce(message: string, politeness: Politeness = "polite") {
  for (const listener of listeners) listener(message, politeness);
}

export function LiveRegions() {
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");

  useEffect(() => {
    const listener = (message: string, politeness: Politeness) => {
      const set = politeness === "assertive" ? setAssertive : setPolite;
      // Clearing first guarantees the region is seen to change even when the
      // same message is announced twice in a row.
      set("");
      requestAnimationFrame(() => set(message));
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {polite}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true" className="sr-only">
        {assertive}
      </div>
    </>
  );
}
