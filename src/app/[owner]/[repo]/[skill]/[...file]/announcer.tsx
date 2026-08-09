"use client";

import { useEffect } from "react";

import { announce } from "@/components/chrome/live-regions";

/**
 * Announces the subchapter once after a client-side navigation.
 *
 * Same reason as `ChapterAnnouncer`: the App Router moves neither focus nor
 * the virtual cursor on a route change, so a screen-reader user who pressed
 * "next" in the appendix nav otherwise hears nothing and has no way to know
 * the page changed. The chapter is named as well as the file, because the
 * subchapter titles in one skill (`README`, `EXAMPLES`) are not distinctive
 * on their own.
 */
export function SubchapterAnnouncer({
  title,
  chapter,
  position,
  total,
}: {
  title: string;
  chapter: string;
  /** 1-based position among the files set in the book, or 0 for a font. */
  position: number;
  total: number;
}) {
  useEffect(() => {
    announce(
      position > 0
        ? `${title}, file ${position} of ${total} in ${chapter}`
        : `${title}, a bundled file of ${chapter} that is not set in the book`,
    );
  }, [title, chapter, position, total]);

  return null;
}
