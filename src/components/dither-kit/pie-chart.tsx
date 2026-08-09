"use client"

/**
 * Vendored from dither-kit — MIT.
 *
 *   Project:  dither-kit
 *   Author:   ripgrim (Boring Software Inc)
 *   Upstream: https://github.com/Boring-Software-Inc/dither-kit
 *   Registry: https://www.tripwire.sh/r/pie-chart.json
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

import type { ReactNode } from "react"
import type { ChartConfig, Margins } from "./chart-context"
import type { BloomInput } from "./dither-paint"
import { PieCanvas } from "./pie-canvas"
import { PolarRoot } from "./polar-root"

// `object` rather than `Record<string, unknown>`: interfaces don't get an
// implicit index signature, so interface-typed rows failed to satisfy the
// generic. Internal layers still index rows through their own Row type.
type Row = object

export type PieChartProps<TData extends Row> = {
  data: TData[]
  config: ChartConfig
  children: ReactNode
  dataKey: string // value field
  nameKey: string // slice-name field (looked up in config for colour)
  innerRadius?: number // 0–1 ratio for a donut
  margins?: Partial<Margins>
  className?: string
  animate?: boolean
  animationDuration?: number
  replayToken?: number
  bloom?: BloomInput
  bloomOnHover?: boolean
  defaultSelectedDataKey?: string | null
  onSelectionChange?: (key: string | null) => void
}

/** Composable dither **pie / donut** chart. Compose `<Pie>`, `<Legend>`, … inside. */
export function PieChart<TData extends Row>(props: PieChartProps<TData>) {
  return <PolarRoot chartType="pie" Canvas={PieCanvas} {...props} />
}
