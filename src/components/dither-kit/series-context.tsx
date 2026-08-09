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

import { createContext, use } from "react"
import type { Seed } from "./palette"

export type SeriesContextValue = {
  dataKey: string
  seed: Seed
  dimmed: boolean
}

export const SeriesContext = createContext<SeriesContextValue | null>(null)

/** Boundary guard for series-scoped markers (`<Dot>`, `<ActiveDot>`). */
export function useSeries(part: string) {
  const ctx = use(SeriesContext)
  if (!ctx) {
    throw new Error(
      `<${part} /> must be rendered inside a series (e.g. <Area />).`
    )
  }
  return ctx
}
