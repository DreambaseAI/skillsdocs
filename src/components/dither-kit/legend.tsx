"use client"

/**
 * Vendored from dither-kit — MIT.
 *
 *   Project:  dither-kit
 *   Author:   ripgrim (Boring Software Inc)
 *   Upstream: https://github.com/Boring-Software-Inc/dither-kit
 *   Registry: https://www.tripwire.sh/r/core.json
 *   Licence:  MIT
 *
 * The registry JSON carries no `license` field and the upstream repo has no
 * LICENSE *file*, which is why this header is written by hand: MIT is declared
 * in the monorepo root package.json that contains the registry sources, and in
 * the published @dither-kit/cli and @dither-kit/registry-core packages. See
 * docs/ARCHITECTURE.md §11, "Risk 2 — dither-kit licensing".
 *
 * Local modifications by WS-7 are marked with a `WS-7:` comment.
 */

import { useCommonChart } from "./common-context"
import { cn } from "./lib"
import { rgb } from "./palette"

/** Series/slice legend. With `isClickable`, each entry toggles its selection.
 * Works in every chart family via the shared common context.
 *
 * Note: this is an absolute overlay pinned to the top of the plot, so it's best
 * for ≤2–3 entries. With more entries (or a narrow container) it wraps onto
 * extra rows that overlay the chart — reach for the in-flow `<BlockLegend>`
 * instead, which renders as a sibling and can't overlap at any width. */
export function Legend({
  isClickable = false,
  align = "right",
}: {
  isClickable?: boolean
  align?: "left" | "center" | "right"
}) {
  const chart = useCommonChart()

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 flex flex-wrap gap-3 px-1",
        align === "right" && "justify-end",
        align === "center" && "justify-center",
        align === "left" && "justify-start"
      )}
    >
      {chart.names.map((name) => {
        const seed = chart.seedOf(name)
        const emphasis = chart.selectedDataKey ?? chart.focusDataKey
        const dimmed = emphasis !== null && emphasis !== name
        return (
          <button
            key={name}
            type="button"
            disabled={!isClickable}
            onClick={() =>
              chart.selectDataKey(chart.selectedDataKey === name ? null : name)
            }
            // Hovering an entry spotlights its series so overlapping layers
            // (e.g. two meshed radar polygons) can be told apart at a glance.
            onPointerEnter={() => chart.setFocusDataKey(name)}
            onPointerLeave={() => chart.setFocusDataKey(null)}
            onFocus={() => chart.setFocusDataKey(name)}
            onBlur={() => chart.setFocusDataKey(null)}
            className={cn(
              "flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground transition-opacity",
              isClickable &&
                "pointer-events-auto cursor-pointer hover:text-foreground",
              dimmed && "opacity-40"
            )}
          >
            <span
              className="size-2 rounded-[1px]"
              style={{ backgroundColor: rgb(seed.fill) }}
            />
            {chart.labelOf(name)}
          </button>
        )
      })}
    </div>
  )
}

Legend.chartLayer = "dom" as const
