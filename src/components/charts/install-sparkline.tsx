"use client";

/**
 * "The wire" — the eight-week install sparkline. Owner: WS-7.
 *
 * The magazine's recurring data graphic: one repo, eight weekly buckets from
 * skills.sh, no axes, no grid, no tooltip. It reads as a mark rather than a
 * chart, which is exactly why the data table underneath it is not optional.
 *
 * The bucket order that skills.sh publishes is undocumented, so the axis is
 * labelled neutrally (`Week 1`…`Week 8`) unless the caller supplies real
 * labels. Inventing a direction we have not verified would be a lie told in
 * a graphic, which is the worst place to tell one.
 */

import { useMemo } from "react";
import { Sparkline } from "@/components/dither-kit/sparkline";
import { AccessibleChart } from "./accessible-chart";
import { compactNumber, exactNumber } from "./format";
import { HcmFallback } from "./hcm-fallback";
import { type ChartSeeds, seedAt } from "./seeds";
import {
  useChartMounted,
  useChartReducedMotion,
  useChartScheme,
} from "./use-chart-env";

export interface InstallSparklineProps {
  /** `book.signal.weeklyInstalls` — eight weekly buckets. */
  weeklyInstalls: number[];
  /** Resolved on the server by `chartSeedsFromTheme`. */
  seeds: ChartSeeds;
  /** Repo or skill this is the wire for, e.g. `anthropics/skills`. */
  subject: string;
  /** `book.signal.installs` — printed as the headline figure when given. */
  installs?: number;
  /** Override the neutral `Week N` labels once the bucket order is known. */
  weekLabels?: string[];
  /** Which theme tone to paint with. */
  seriesIndex?: number;
  height?: number;
  className?: string;
}

export function InstallSparkline({
  weeklyInstalls,
  seeds,
  subject,
  installs,
  weekLabels,
  seriesIndex = 0,
  height = 96,
  className,
}: InstallSparklineProps) {
  const scheme = useChartScheme();
  const reduced = useChartReducedMotion();
  const mounted = useChartMounted();

  // Sparkline derives its rows and config from these, and its entrance-replay
  // revision keys off row identity — a fresh array every render would restart
  // the sweep on every parent re-render.
  const values = useMemo(
    () => weeklyInstalls.filter((n) => Number.isFinite(n)),
    [weeklyInstalls],
  );
  const seed = useMemo(
    () => seedAt(seeds, scheme, seriesIndex),
    [seeds, scheme, seriesIndex],
  );

  const labels = useMemo(
    () => values.map((_, i) => weekLabels?.[i] ?? `Week ${i + 1}`),
    [values, weekLabels],
  );

  /**
   * Min–max scaling, not a zero baseline.
   *
   * dither-kit's y-scale always includes zero, and weekly install counts move
   * in a narrow band a long way above it — 24.8K to 32K on a 0–32K domain fills
   * 78–100% of the frame and draws a solid brick with a slightly wobbly top.
   * The shape, which is the only thing a sparkline is for, disappears.
   *
   * So the series is drawn against a floor a quarter of its own range below its
   * minimum. This is the classical sparkline convention (the mark carries shape,
   * never magnitude) and it is only defensible because the magnitudes are right
   * there: the caption names the high and the low, and the table beneath carries
   * every unrounded figure. Nothing here is ever the sole source of a number.
   */
  const plotted = useMemo(() => {
    if (values.length === 0) return values;
    const min = Math.min(...values);
    const span = Math.max(...values) - min;
    if (span === 0) return values;
    const floor = min - span * 0.25;
    return values.map((v) => v - floor);
  }, [values]);

  const first = values[0] ?? 0;
  const last = values.at(-1) ?? 0;
  const direction =
    values.length < 2 || first === last
      ? "flat across the period"
      : last > first
        ? `ending ${compactNumber(last - first)} above where it began`
        : `ending ${compactNumber(first - last)} below where it began`;

  const description =
    values.length === 0
      ? `No weekly install data is published for ${subject}.`
      : `${values.length} weekly install buckets for ${subject}, ${direction}. Highest week ${compactNumber(Math.max(...values))}, lowest ${compactNumber(Math.min(...values))}.`;

  return (
    <AccessibleChart
      aside={
        installs === undefined ? null : (
          <span className="chart-figure-number">
            {compactNumber(installs)}
            <span className="chart-figure-unit">installs</span>
          </span>
        )
      }
      className={className}
      columns={["Week", "Installs"]}
      description={description}
      hcm={
        <HcmFallback
          id="wire"
          kind="line"
          series={[{ label: subject, values: plotted }]}
        />
      }
      height={height}
      rows={values.map((v, i) => ({
        header: labels[i],
        cells: [exactNumber(v)],
      }))}
      title={`Weekly installs — ${subject}`}
    >
      {mounted && values.length > 1 ? (
        <Sparkline
          animate={!reduced}
          // A remount is the only way to re-run the paint loop: it captures the
          // seed set, the motion decision and `animate` when it starts, and its
          // effect is keyed on canvas geometry alone.
          key={`${scheme}-${reduced}`}
          // `plus-lighter` is additive — it can only add light. On dark paper
          // that is a glow; on light paper it is a wash toward white that eats
          // the fill. Off in light mode, always.
          bloom={scheme === "dark" ? "low" : "off"}
          color={seed}
          data={plotted}
          variant="gradient"
        />
      ) : null}
    </AccessibleChart>
  );
}
