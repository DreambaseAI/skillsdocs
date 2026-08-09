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

import { useEffect } from "react"
import type { AreaVariant } from "./chart-context"
import { usePolarPart } from "./polar-context"

export type PieProps = {
  /** Fill texture applied to every slice. */
  variant?: AreaVariant
}

/**
 * The pie/donut ring. Slices come from the chart `data` (one per row); this part
 * sets the shared fill variant. The dithered wedges are painted on the canvas.
 */
export function Pie({ variant = "gradient" }: PieProps) {
  const ctx = usePolarPart("Pie", "pie")
  const { registerVariant, unregisterVariant } = ctx

  useEffect(() => {
    registerVariant("*", variant)
    return () => unregisterVariant("*")
  }, [variant, registerVariant, unregisterVariant])

  return null
}
