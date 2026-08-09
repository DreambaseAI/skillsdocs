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

import { useChartPart } from "./chart-context"

/**
 * A horizontal marker line at a value on the y-axis — most useful as the zero
 * baseline for diverging data (`<ReferenceLine y={0} />`), or to mark a target
 * / threshold. Renders in the front SVG layer so it stays visible over the
 * dither fill; pass an optional `label` to annotate it at the right edge.
 */
export function ReferenceLine({
  y = 0,
  label,
  strokeDasharray = "4 4",
  className = "stroke-muted-foreground/60",
}: {
  y?: number
  label?: string
  strokeDasharray?: string
  className?: string
}) {
  const ctx = useChartPart("ReferenceLine")
  if (!ctx.ready) return null

  const { width } = ctx.plot
  const py = ctx.y(y)

  return (
    <g>
      <line
        x1={0}
        x2={width}
        y1={py}
        y2={py}
        className={className}
        strokeDasharray={strokeDasharray}
      />
      {label ? (
        <text
          x={width - 2}
          y={py - 3}
          textAnchor="end"
          className="fill-muted-foreground font-mono text-[10px]"
        >
          {label}
        </text>
      ) : null}
    </g>
  )
}
