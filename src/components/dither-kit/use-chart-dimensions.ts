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
import { useLayoutEffect, useRef, useState } from "react"

export type Dimensions = { width: number; height: number }

/**
 * Tracks an element's CSS pixel size via {@link ResizeObserver}. Uses
 * `clientWidth`/`clientHeight` (the layout size) rather than
 * `getBoundingClientRect()` so a parent `layoutId` morph — which scales the
 * element via a transform — can't trick the chart into measuring a scaled size
 * and locking its canvas to it.
 */
export function useChartDimensions<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<Dimensions>({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = () => {
      const width = Math.max(0, el.clientWidth)
      const height = Math.max(0, el.clientHeight)
      setSize((prev) =>
        prev.width === width && prev.height === height
          ? prev // guard against repeat fires
          : { width, height }
      )
    }

    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])

  return { ref, size }
}
