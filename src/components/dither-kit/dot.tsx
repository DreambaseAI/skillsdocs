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

import { useChart } from "./chart-context"
import { rgb, type Seed } from "./palette"
import { useSeries } from "./series-context"

export type DotVariant = "border" | "colored-border" | "filled"

function dotPaint(variant: DotVariant, seed: Seed) {
  switch (variant) {
    case "colored-border":
      return {
        fill: "var(--card, #0b0b0c)",
        stroke: rgb(seed.line),
        strokeWidth: 1.5,
      }
    case "filled":
      return { fill: rgb(seed.star), stroke: rgb(seed.line), strokeWidth: 1 }
    default:
      return {
        fill: "var(--card, #0b0b0c)",
        stroke: rgb(seed.star, 0.8),
        strokeWidth: 1,
      }
  }
}

/** A marker at every data point along the series' top line. */
export function Dot({
  variant = "border",
  r = 2,
}: {
  variant?: DotVariant
  r?: number
}) {
  const ctx = useChart()
  const { dataKey, seed } = useSeries("Dot")
  const band = ctx.bands[dataKey]
  if (!ctx.ready || !band) return null
  const paint = dotPaint(variant, seed)

  return (
    // Fade in once the fill has drawn so dots don't float over the entrance.
    <g
      style={{
        opacity: ctx.entranceDone ? 1 : 0,
        transition: "opacity 300ms ease",
      }}
    >
      {band.map((b, i) => (
        <circle
          {...paint}
          // biome-ignore lint/suspicious/noArrayIndexKey: index is the stable x position
          key={i}
          cx={ctx.xCenter(i) ?? 0}
          cy={ctx.y(b[1])}
          r={r}
        />
      ))}
    </g>
  )
}

/** A single marker at the hovered point — keys off the shared hover index. */
export function ActiveDot({
  variant = "colored-border",
  r = 3,
}: {
  variant?: DotVariant
  r?: number
}) {
  const ctx = useChart()
  const { dataKey, seed } = useSeries("ActiveDot")
  const band = ctx.bands[dataKey]
  if (!ctx.ready || !band || ctx.hoverIndex == null || !ctx.entranceDone)
    return null
  const b = band[ctx.hoverIndex]
  if (!b) return null
  const paint = dotPaint(variant, seed)
  const cx = ctx.xCenter(ctx.hoverIndex)
  const cy = ctx.y(b[1])

  return (
    <g>
      {/* Soft halo so the active point is unmistakable over the dither. */}
      <circle cx={cx} cy={cy} r={r + 3} fill={rgb(seed.line, 1, 0.18)} />
      <circle cx={cx} cy={cy} r={r} {...paint} strokeWidth={2} />
    </g>
  )
}
