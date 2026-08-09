/**
 * The documented contract the accessibility suite tests against.
 *
 * Routes and selectors live here rather than inline in the specs because
 * WS-4, WS-5, WS-7 and WS-9 are landing the pages this suite audits. When a
 * selector moves, exactly one file changes. When a route does not exist yet,
 * `tests/support/routes.ts` discovers that at run time and the affected specs
 * mark themselves `fixme` instead of failing.
 *
 * Sources: ARCHITECTURE §1.3 (route map), §7.1–7.3 (acceptance checklist),
 * docs/research/a11y-llm.md §1.1 (landmark skeleton) and §1.3 (skip links).
 */

import type { ReaderPrefs } from "@/lib/reader/prefs";
import { DEFAULT_PREFS } from "@/lib/reader/prefs";

/**
 * The hermetic fixture repositories served by `tests/fixtures/github-mock.cjs`.
 *
 * `clean-book` is hand-authored and defect-free: any axe violation against it
 * is ours. `rough-book` carries the defects real repositories ship, and exists
 * to prove two things — that the heading-outline repair runs, and that content
 * defects are reported rather than fatal.
 */
export const FIXTURE = {
  owner: "a11y-fixture",
  repo: "clean-book",
  /** Chapter slugs, alphabetical, as the fixture's tree yields them. */
  chapters: ["reading-tables", "shipping-safely", "writing-clearly"],
  rough: {
    repo: "rough-book",
    chapters: ["undescribed-media", "unrepaired-outline"],
  },
} as const;

export const ROUTES = {
  home: "/",
  book: `/${FIXTURE.owner}/${FIXTURE.repo}`,
  chapter: `/${FIXTURE.owner}/${FIXTURE.repo}/${FIXTURE.chapters[2]}`,
  chapterAlt: `/${FIXTURE.owner}/${FIXTURE.repo}/${FIXTURE.chapters[0]}`,
  roughBook: `/${FIXTURE.owner}/${FIXTURE.rough.repo}`,
  /** Skipped heading levels and a duplicate H1 in the source. */
  roughOutline: `/${FIXTURE.owner}/${FIXTURE.rough.repo}/${FIXTURE.rough.chapters[1]}`,
  /** Missing alt text and vague link text in the source. */
  roughMedia: `/${FIXTURE.owner}/${FIXTURE.rough.repo}/${FIXTURE.rough.chapters[0]}`,
} as const;

export type RouteName = keyof typeof ROUTES;

/**
 * Selectors are expressed as lists of candidates, most-specific first: the
 * suite asserts the *contract* (there is a reading-controls trigger), not one
 * workstream's markup. A spec fails only when no candidate matches, which is
 * a genuine contract violation rather than a naming difference.
 */
export const SEL = {
  /** Landmark skeleton — a11y-llm §1.1. */
  main: "main#main, main",
  skipLinks: ".skip-links a, nav[aria-label='Skip links'] a",
  toc: "#toc, nav[aria-label='Table of contents'], [role='doc-toc']",
  /**
   * The two always-mounted regions from ARCHITECTURE §7.1. The ids are the
   * contract; the class-qualified fallbacks let the suite find the regions
   * `LiveRegions` renders today, which carry no id yet. Copy buttons and
   * Sonner mount their own `role="status"` nodes, so an unqualified selector
   * matches the wrong element.
   */
  liveStatus:
    "#page-status, div.sr-only[role='status'][aria-live='polite'][aria-atomic='true']",
  liveAlert: "#alerts, div.sr-only[role='alert'][aria-live='assertive'][aria-atomic='true']",

  /** The reading surface. `.reader` supplies --reader-measure / --reader-bleed. */
  reader: ".reader",
  /** Rendered third-party markdown. Violations in here are data, not failures. */
  content: ".prose",

  /** Reading controls — ARCHITECTURE §5.5 "Panel UX". */
  controlsTrigger: "#reader-controls, [data-slot='controls-trigger']",
  controlsPanel:
    "[data-slot='popover-popup'], [data-slot='drawer-popup'], [role='dialog']",

  /** Every translucent surface that forced-colors mode can render unreadable. */
  translucent: [
    "[data-slot='popover-popup']",
    "[data-slot='dialog-popup']",
    "[data-slot='drawer-popup']",
    "[data-slot='menu-popup']",
    "[data-slot='select-popup']",
    "[data-slot='tooltip-popup']",
    ".translucent-surface",
  ].join(", "),
} as const;

/** Viewports named in a11y-llm §1.11 plus the two the design targets. */
export const VIEWPORTS = {
  /** 1280 CSS px at 400% zoom — WCAG 1.4.10 Reflow. */
  reflow400: { width: 320, height: 256 },
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 1024 },
  wide: { width: 1920, height: 1080 },
} as const;

/**
 * The six presets from ARCHITECTURE §5.5, expressed as `ReaderPrefs`.
 *
 * Applied by writing the `reader-prefs` cookie, which `ReaderPrefsScript`
 * reads before first paint. That deliberately routes around WS-5's panel UI:
 * the 1.4.12 test must exercise the *layout* at each preset, and must keep
 * working while the panel is still being built.
 */
export const PRESETS: ReadonlyArray<{ id: string; prefs: ReaderPrefs }> = [
  {
    id: "book",
    prefs: { ...DEFAULT_PREFS, preset: "book" },
  },
  {
    id: "novel",
    prefs: {
      ...DEFAULT_PREFS,
      preset: "novel",
      font: "eb-garamond",
      sizeIndex: 7, // 21px
      lineHeight: 1.55,
      cpl: 62,
      align: "justify",
      paper: "sepia",
      paraGap: 0,
      paraStyle: "indented",
    },
  },
  {
    id: "magazine",
    prefs: {
      ...DEFAULT_PREFS,
      preset: "magazine",
      font: "source-serif-4",
      sizeIndex: 6, // 20px
      lineHeight: 1.55,
      cpl: 72,
      paper: "paper",
      paraGap: 1,
    },
  },
  {
    id: "terminal",
    prefs: {
      ...DEFAULT_PREFS,
      preset: "terminal",
      font: "geist-mono",
      sizeIndex: 2, // 16px
      lineHeight: 1.7,
      cpl: 78,
      paper: "midnight",
      paraGap: 1.2,
    },
  },
  {
    id: "docs",
    prefs: {
      ...DEFAULT_PREFS,
      preset: "docs",
      font: "inter",
      sizeIndex: 3, // 17px
      lineHeight: 1.65,
      cpl: 76,
      paraGap: 1,
    },
  },
  {
    id: "accessible",
    prefs: {
      ...DEFAULT_PREFS,
      preset: "accessible",
      font: "atkinson-hyperlegible-next",
      sizeIndex: 8, // 22px
      lineHeight: 1.75,
      cpl: 58,
      contrast: "high",
      paraGap: 1.6,
      tracking: 0.02,
      wordSpacing: 0.06,
    },
  },
];

/**
 * WCAG 1.4.12 Text Spacing, verbatim: line height 1.5×, paragraph spacing 2×,
 * letter spacing 0.12×, word spacing 0.16×. Injected as a user stylesheet
 * would be, with `!important`, over whatever the reader is already showing.
 */
export const TEXT_SPACING_CSS = `
  * {
    line-height: 1.5 !important;
    letter-spacing: 0.12em !important;
    word-spacing: 0.16em !important;
  }
  p, li, h1, h2, h3, h4, h5, h6, blockquote, figure, pre {
    margin-bottom: 2em !important;
  }
`;
