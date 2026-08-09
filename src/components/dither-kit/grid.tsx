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

export function Grid({
  horizontal = true,
  vertical = false,
  strokeDasharray = "3 3",
}: {
  horizontal?: boolean
  vertical?: boolean
  strokeDasharray?: string
}) {
  const ctx = useChartPart("Grid")
  if (!ctx.ready) return null
  const { width } = ctx.plot

  return (
    <g className="stroke-border" strokeDasharray={strokeDasharray}>
      {horizontal &&
        ctx.y
          .ticks(4)
          .map((t) => (
            <line
              key={`h-${t}`}
              x1={0}
              x2={width}
              y1={ctx.y(t)}
              y2={ctx.y(t)}
            />
          ))}
      {vertical &&
        ctx.data.map((_, i) => (
          <line
            // biome-ignore lint/suspicious/noArrayIndexKey: index is the stable x position
            key={`v-${i}`}
            x1={ctx.xCenter(i) ?? 0}
            x2={ctx.xCenter(i) ?? 0}
            y1={0}
            y2={ctx.plot.height}
          />
        ))}
    </g>
  )
}

// Render beneath the dither canvas so grid lines sit behind the fill.
Grid.chartLayer = "back" as const
