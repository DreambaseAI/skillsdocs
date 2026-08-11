import { cn } from "@/lib/utils";

/**
 * The star on dark stock — covers and spines. The chrome star's accent
 * colouring assumes paper underneath; on a cover the accent may be
 * indistinguishable from the ground, so the star borrows the cover's own ink.
 *
 * Its own module because both server components (the cover plate) and client
 * components (the shelf) need it, and neither should import the other.
 */
export const COVER_STAR_CLASS = cn(
  "rounded-full border-(--cover-ink)/30 bg-(--cover-ink)/8",
  "text-(--cover-ink)/70 hover:bg-(--cover-ink)/15 hover:text-(--cover-ink)",
  "aria-pressed:border-(--cover-ink)/60 aria-pressed:bg-(--cover-ink)/18 aria-pressed:text-(--cover-ink)",
  "focus-visible:border-(--cover-ink) focus-visible:ring-(--cover-ink)/40",
);
