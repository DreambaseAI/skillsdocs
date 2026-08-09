"use client";

/**
 * The one place dither-kit's accessibility failures get fixed. Owner: WS-7.
 *
 * Out of the box the pack ships three WCAG failures, and a canvas chart is
 * invisible to assistive technology by default, so none of them can be papered
 * over downstream:
 *
 *   1.1.1  Every chart announced itself as the single word "Chart", from a
 *          hard-coded `role="img" aria-label="Chart"` with no prop override.
 *   1.1.1  No text alternative for the data. The pixels *are* the content.
 *   2.1.1  The tooltip is wired to pointer events only — the values behind the
 *          drawing were reachable with a mouse and by no other means.
 *
 * The fix is structural rather than cosmetic. Every chart is a `<figure>` with
 * a real caption; the drawing is a single `role="img"` leaf carrying a written
 * name and description; and the numbers live in an honest `<table>` that is in
 * the accessibility tree at all times and can be shown on screen with one
 * button. The table — not the tooltip, not the canvas — is the primary
 * representation of the data. Everything else is illustration.
 *
 * This component is also the seam ARCHITECTURE §9 risk 2 asks for: if the
 * dither-kit licence grant were ever withdrawn, swapping the drawing for
 * hand-rolled SVG touches the `children` and `hcm` props and nothing else.
 */

import { GridTableIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useId, useState } from "react";
import { announce } from "@/components/chrome/live-regions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ChartTableRow {
  /** Row header — rendered as `<th scope="row">`. */
  header: string;
  cells: ReactNode[];
}

export interface AccessibleChartProps {
  /** The accessible name. A sentence fragment, not the word "chart". */
  title: string;
  /**
   * The accessible description: what the drawing shows and what its shape
   * means. Read after the name, and printed as the caption's second line.
   */
  description: string;
  /** Column headings for the data table, including the row-header column. */
  columns: string[];
  rows: ChartTableRow[];
  /** The live chart. Decorative — it is inside the `role="img"` leaf. */
  children: ReactNode;
  /** The monochrome rendition shown under `forced-colors: active`. */
  hcm: ReactNode;
  /** Legend or key, rendered in flow beneath the frame. */
  legend?: ReactNode;
  /**
   * Frame height in px. Fixed, always: a dither chart measures its container
   * before it draws anything, so an auto-height frame collapses to zero and
   * then jumps — textbook CLS.
   */
  height?: number;
  /** Extra text under the caption, e.g. a headline number. */
  aside?: ReactNode;
  className?: string;
}

export function AccessibleChart({
  title,
  description,
  columns,
  rows,
  children,
  hcm,
  legend,
  height = 224,
  aside,
  className,
}: AccessibleChartProps) {
  const baseId = useId();
  const descriptionId = `${baseId}-desc`;
  const tableId = `${baseId}-table`;
  const [showTable, setShowTable] = useState(false);

  const toggle = () => {
    const next = !showTable;
    setShowTable(next);
    announce(next ? `${title}: data table shown` : `${title}: data table hidden`);
  };

  return (
    <figure className={cn("chart-figure", className)} data-chart>
      <figcaption className="chart-caption">
        <span className="chart-title">{title}</span>
        <span className="chart-desc" id={descriptionId}>
          {description}
        </span>
        {aside}
      </figcaption>

      {/*
        `role="img"` makes this a leaf: the canvases, the decorative SVG and the
        forced-colours rendition inside are pruned from the accessibility tree
        wholesale, so there is exactly one node to name and no way for the pack
        to leak its own labels back out.
      */}
      <div
        aria-describedby={descriptionId}
        aria-label={title}
        className="chart-frame"
        role="img"
        style={{ height }}
      >
        <div aria-hidden="true" className="chart-live">
          {children}
        </div>
        <div aria-hidden="true" className="chart-hcm">
          {hcm}
        </div>
      </div>

      {legend ? <div className="chart-legend">{legend}</div> : null}

      <div className="chart-actions">
        <Button
          aria-controls={tableId}
          aria-expanded={showTable}
          onClick={toggle}
          size="xs"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon aria-hidden data-icon="inline-start" icon={GridTableIcon} />
          {showTable ? "Hide data" : "Show data"}
        </Button>
      </div>

      {/*
        Never unmounted and never `display: none` — `sr-only` keeps it in the
        accessibility tree, which is the whole point. The button controls
        whether it is also on screen.
      */}
      {/*
        Once visible the wrapper scrolls, and a scrollable region that cannot be
        reached from the keyboard is a 2.1.1 failure — so it takes a tab stop
        and a name, but only while it is on screen. Collapsed it is `sr-only`,
        1px square and unscrollable; a tab stop there would lead nowhere.
      */}
      <div
        aria-label={showTable ? `${title}, data table` : undefined}
        className={showTable ? "chart-table-wrap" : "sr-only"}
        id={tableId}
        role={showTable ? "group" : undefined}
        tabIndex={showTable ? 0 : undefined}
      >
        <table className="chart-table">
          <caption>{`${title}. ${description}`}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.header}>
                <th scope="row">{row.header}</th>
                {row.cells.map((cell, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: column position is the identity
                  <td key={i}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
