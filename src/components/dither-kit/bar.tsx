"use client"

/**
 * Vendored from dither-kit — MIT.
 *
 *   Project:  dither-kit
 *   Author:   ripgrim (Boring Software Inc)
 *   Upstream: https://github.com/Boring-Software-Inc/dither-kit
 *   Registry: https://www.tripwire.sh/r/bar-chart.json
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

import { type ReactNode, useEffect } from "react"
import {
  type AreaVariant,
  type StrokeVariant,
  useChartPart,
} from "./chart-context"
import { SeriesContext } from "./series-context"

export type BarProps = {
  dataKey: string
  variant?: AreaVariant
  strokeVariant?: StrokeVariant
  isClickable?: boolean
  children?: ReactNode
}

/**
 * One bar series. The dithered bars are painted on the canvas; this registers
 * the series and (when `isClickable`) lays transparent hit rects over each bar
 * — using the shared `barSlot` geometry so clicks line up with the pixels — to
 * select the series. The Legend offers the same toggle accessibly.
 */
export function Bar({
  dataKey,
  variant = "gradient",
  strokeVariant = "solid",
  isClickable = false,
  children,
}: BarProps) {
  const ctx = useChartPart("Bar", "bar")
  const { registerSeries, unregisterSeries } = ctx

  if (process.env.NODE_ENV !== "production" && !ctx.config[dataKey]) {
    console.warn(
      `<Bar dataKey="${dataKey}" />: "${dataKey}" is not in the chart \`config\`. Add it so the series has a colour and label.`
    )
  }

  useEffect(() => {
    registerSeries({ dataKey, kind: "bar", variant, strokeVariant })
    return () => unregisterSeries(dataKey)
  }, [dataKey, variant, strokeVariant, registerSeries, unregisterSeries])

  const band = ctx.bands[dataKey]
  if (!ctx.ready || !band) return null

  const seed = ctx.seedOf(dataKey)
  const dimmed = ctx.selectedDataKey !== null && ctx.selectedDataKey !== dataKey
  const si = ctx.configKeys.indexOf(dataKey)
  const n = ctx.configKeys.length
  const onClick = () =>
    ctx.selectDataKey(ctx.selectedDataKey === dataKey ? null : dataKey)

  return (
    <>
      {isClickable &&
        band.map((b, i) => {
          const slot = ctx.barSlot(i, si, n)
          const top = ctx.y(b[1])
          const base = ctx.y(b[0])
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: progressive enhancement; the Legend offers the same toggle accessibly
            <rect
              // biome-ignore lint/suspicious/noArrayIndexKey: index is the stable category position
              key={i}
              x={slot.x}
              y={Math.min(top, base)}
              width={slot.width}
              height={Math.abs(base - top)}
              fill="transparent"
              style={{ cursor: "pointer" }}
              onClick={onClick}
            />
          )
        })}
      <SeriesContext value={{ dataKey, seed, dimmed }}>
        {children}
      </SeriesContext>
    </>
  )
}
