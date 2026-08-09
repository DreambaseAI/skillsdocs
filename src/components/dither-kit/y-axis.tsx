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

export function YAxis({
  tickFormatter,
  tickCount = 4,
  tickMargin = 8,
}: {
  tickFormatter?: (value: number) => string
  tickCount?: number
  tickMargin?: number
}) {
  const ctx = useChartPart("YAxis")
  if (!ctx.ready) return null

  return (
    <g className="fill-current font-mono text-[10px] text-muted-foreground">
      {ctx.y.ticks(tickCount).map((t) => (
        <text
          key={t}
          x={-tickMargin}
          y={ctx.y(t)}
          textAnchor="end"
          dominantBaseline="central"
          fill="currentColor"
        >
          {tickFormatter ? tickFormatter(t) : t}
        </text>
      ))}
    </g>
  )
}
