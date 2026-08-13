"use client";

/**
 * The chapter-context half of the keymap (ARCHITECTURE §5.6).
 *
 * Eleven of the sixteen shortcuts were declared, documented, drawn as key caps
 * in the help dialog — and subscribed by nothing. The dispatcher is honest
 * about that (`hasShortcutListener` makes it decline a key nobody claimed), so
 * they were not stealing keystrokes; they simply did not exist. This component
 * is the missing subscriber for the nine that need to know which book and which
 * chapter you are reading.
 *
 * ## Why it mounts in the layout and not in the pages
 *
 * There are three reading routes — the cover, a chapter, and a subchapter file
 * — and the layout is the only place that is on all three exactly once. Mounted
 * per page it would either miss `[skill]/[...file]` or, worse, double-mount
 * during Next's route transition and fire every action twice.
 *
 * ## Why there is no `usePathname()`
 *
 * Under `cacheComponents` a URL hook in a layout marks the route blocking, and
 * this component genuinely does not need to re-render when the URL changes: it
 * has no output. Every handler runs at keypress time, when `location.pathname`
 * is already correct and free. The props are pure data — hrefs and strings —
 * so the server island above can stay a cached read.
 */

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { announce } from "@/components/chrome/live-regions";
import { useShortcut } from "@/hooks/use-shortcut";

export interface BookChapterLink {
  slug: string;
  href: string;
  title: string;
}

export interface BookShortcutsProps {
  /** `/owner/repo`, already encoded by `paths.book`. */
  coverHref: string;
  /** `https://github.com/owner/repo`. */
  githubUrl: string;
  /** `npx skills add owner/repo`; null on a credited book, which has none. */
  installCommand: string | null;
  /** Every chapter, in reading order. */
  chapters: BookChapterLink[];
}

/* --------------------------------------------------------- pure helpers */

/**
 * Which chapter a reading URL is in, or null on the cover.
 *
 * Segment-wise and decoded on both sides, because `location.pathname` is
 * percent-encoded and `paths.book` encodes too — a string `startsWith` would
 * also match `/anthropics/skills-archive` against `/anthropics/skills`.
 */
export function chapterSlugFromPath(
  pathname: string,
  coverHref: string,
): string | null {
  const decode = (segment: string) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  };
  const segments = pathname.split("/").filter(Boolean).map(decode);
  const cover = coverHref.split("/").filter(Boolean).map(decode);
  if (cover.length !== 2) return null;
  if (segments[0] !== cover[0] || segments[1] !== cover[1]) return null;
  // A subchapter is `/owner/repo/<slug>/<path…>`, so the third segment is the
  // chapter either way and `]` works from inside a bundled resource file.
  return segments[2] ?? null;
}

/**
 * How far one page-turn moves the column.
 *
 * 90%, not 100%: two lines of overlap is what tells a reader the text is
 * continuous rather than resampled, and it is what every paginating reader
 * from Acrobat to Kindle does.
 */
export function pageScrollDistance(viewportHeight: number): number {
  return Math.max(1, Math.round(viewportHeight * 0.9));
}

/**
 * The tri-state motion preference, resolved.
 *
 * `data-motion` is the reader's own override (System | Force reduce | Allow)
 * and it has to beat the OS query in both directions — an explicit "allow"
 * means "I want the smooth scroll even though my laptop says otherwise". Same
 * precedence as `dither-kit/dither-paint.ts`, deliberately.
 */
export function motionIsReduced(
  motionAttribute: string | null | undefined,
  osPrefersReduce: boolean,
): boolean {
  if (motionAttribute === "reduce") return true;
  if (motionAttribute === "allow") return false;
  return osPrefersReduce;
}

function reducedMotionNow(): boolean {
  return motionIsReduced(
    document.documentElement.dataset.motion,
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false,
  );
}

/* ------------------------------------------------------------ component */

export function BookShortcuts({
  coverHref,
  githubUrl,
  installCommand,
  chapters,
}: BookShortcutsProps) {
  const router = useRouter();

  /** The current chapter's index, or -1 on the cover / an unknown slug. */
  const indexNow = useCallback(() => {
    const slug = chapterSlugFromPath(window.location.pathname, coverHref);
    return slug === null ? -1 : chapters.findIndex((c) => c.slug === slug);
  }, [chapters, coverHref]);

  const step = useCallback(
    (delta: 1 | -1) => {
      const index = indexNow();
      // From the cover, `]` opens chapter one: the cover is page zero of the
      // issue, not a place outside it.
      const target = index < 0 ? (delta === 1 ? 0 : -1) : index + delta;
      const chapter = target >= 0 ? chapters[target] : undefined;

      if (!chapter) {
        // Never silently nothing. An unbounded key that does nothing is
        // indistinguishable from a broken one — which is how this whole class
        // of bug went unnoticed for eleven shortcuts.
        announce(delta === 1 ? "Last chapter" : "First chapter");
        return;
      }
      announce(`${chapter.title}. Chapter ${target + 1} of ${chapters.length}.`);
      router.push(chapter.href);
    },
    [chapters, indexNow, router],
  );

  useShortcut("nextChapter", () => step(1));
  useShortcut("prevChapter", () => step(-1));

  const turnPage = useCallback((direction: 1 | -1) => {
    window.scrollBy({
      top: direction * pageScrollDistance(window.innerHeight),
      behavior: reducedMotionNow() ? "auto" : "smooth",
    });
  }, []);

  useShortcut("pageDown", () => turnPage(1));
  useShortcut("pageUp", () => turnPage(-1));

  useShortcut("toc", () => {
    const contents = document.getElementById("contents");
    if (contents) {
      // The contents is a `<section>`, so it is not focusable by default and
      // moving focus is the whole point — a jump that only scrolls leaves a
      // keyboard reader's tab order back at the header.
      if (!contents.hasAttribute("tabindex")) contents.tabIndex = -1;
      contents.focus({ preventScroll: true });
      contents.scrollIntoView({
        behavior: reducedMotionNow() ? "auto" : "smooth",
        block: "start",
      });
      announce("Contents");
      return;
    }
    announce("Opening the contents");
    router.push(`${coverHref}#contents`);
  });

  useShortcut("goCover", () => {
    announce("Cover");
    router.push(coverHref);
  });

  useShortcut("goGitHub", () => {
    announce("Opening this repository on GitHub in a new tab");
    // `noopener` is not optional on a `_blank` we did not render as a link:
    // without it the new document gets a live `window.opener` back into ours.
    window.open(githubUrl, "_blank", "noopener,noreferrer");
  });

  useShortcut("copyInstall", () => {
    if (installCommand === null) {
      announce(
        "No install command — this book's skills are in use here, not published from here",
      );
      return;
    }
    void copyText(installCommand, "install command");
  });

  useShortcut("copyLink", () => {
    // Origin + pathname, which is exactly the canonical URL this page declares
    // — a copied link should not carry a scroll hash or a tracking query.
    void copyText(
      `${window.location.origin}${window.location.pathname}`,
      "link to this page",
    );
  });

  return null;
}

/**
 * Copy, and say what happened either way.
 *
 * `navigator.clipboard` rejects on a denied permission and is undefined
 * outside a secure context, and both failures are silent — the reader presses
 * `C`, nothing is announced, and they paste the previous clipboard into their
 * terminal. The failure branch is `assertive` because it interrupts a task
 * they are mid-way through.
 */
async function copyText(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    announce(`Copied ${what}`);
  } catch {
    announce(`Could not copy the ${what}. It is on the page to copy by hand.`, "assertive");
  }
}
