"use client";

/**
 * Installs across a set of repos — an owner's shelf, or the leaderboard top N.
 * Owner: WS-7.
 *
 * One numeric series, with an optional issue seed on each item for comparisons
 * across repositories. Items without one use the chart's shared theme. The
 * hover tooltip is a visual enhancement; the always-present data table remains
 * the complete, keyboard-accessible representation.
 */

import { useMemo } from "react";
import { BarChart } from "@/components/dither-kit/bar-chart";
import { Bar } from "@/components/dither-kit/bar";
import { Grid } from "@/components/dither-kit/grid";
import { Tooltip as ChartTooltip } from "@/components/dither-kit/tooltip";
import { XAxis } from "@/components/dither-kit/x-axis";
import { YAxis } from "@/components/dither-kit/y-axis";
import { AccessibleChart } from "./accessible-chart";
import { compactNumber, exactNumber, percentOf, shortenLabels, truncateLabel } from "./format";
import { HcmFallback } from "./hcm-fallback";
import { type ChartSeeds, seedAt } from "./seeds";
import {
  axisLabelChars,
  useChartMounted,
  useChartReducedMotion,
  useChartScheme,
  useMeasuredWidth,
} from "./use-chart-env";

/** Left gutter carries the compact y ticks; the rest is the plot. */
const MARGINS = { top: 8, right: 4, bottom: 24, left: 40 };

export interface InstallsBarItem {
  /** Repo name, or `owner/repo` on the leaderboard. */
  label: string;
  installs: number;
  /** Optional issue palette; its selected tone colours only this bar. */
  seeds?: ChartSeeds;
}

export interface InstallsBarChartProps {
  items: InstallsBarItem[];
  seeds: ChartSeeds;
  /** What the set is, e.g. `anthropics` or `the skills.sh leaderboard`. */
  subject: string;
  seriesIndex?: number;
  height?: number;
  className?: string;
}

export function InstallsBarChart({
  items,
  seeds,
  subject,
  seriesIndex = 0,
  height = 240,
  className,
}: InstallsBarChartProps) {
  const scheme = useChartScheme();
  const reduced = useChartReducedMotion();
  const mounted = useChartMounted();
  const [plotRef, plotWidth] = useMeasuredWidth<HTMLDivElement>();
  const labelChars = axisLabelChars(
    plotWidth,
    items.length,
    MARGINS.left + MARGINS.right,
  );

  const rows = useMemo(
    () =>
      items.map((item) => ({
        label: item.label,
        installs: item.installs,
        seed: seedAt(item.seeds ?? seeds, scheme, seriesIndex),
      })),
    [items, seeds, scheme, seriesIndex],
  );
  const config = useMemo(
    () => ({
      installs: { label: "Installs", color: seedAt(seeds, scheme, seriesIndex) },
    }),
    [seeds, scheme, seriesIndex],
  );

  const total = items.reduce((n, item) => n + item.installs, 0);
  const top = items.reduce<InstallsBarItem | null>(
    (best, item) => (best === null || item.installs > best.installs ? item : best),
    null,
  );

  const description =
    items.length === 0
      ? `No install data is published for ${subject}.`
      : `Total installs for ${items.length} repositories in ${subject}. ${
          top
            ? `${top.label} leads with ${compactNumber(top.installs)}, ${percentOf(top.installs, total)} of the ${compactNumber(total)} total.`
            : ""
        }`;

  return (
    <AccessibleChart
      className={className}
      columns={["Repository", "Installs", "Share"]}
      description={description}
      hcm={
        <HcmFallback
          categories={shortenLabels(items.map((i) => i.label), 9)}
          id="installs"
          kind="bar"
          series={[{ label: "Installs", values: items.map((i) => i.installs) }]}
        />
      }
      height={height}
      rows={items.map((item) => ({
        header: item.label,
        cells: [exactNumber(item.installs), percentOf(item.installs, total)],
      }))}
      title={`Installs across ${subject}`}
    >
      <div className="size-full" ref={plotRef}>
        {mounted && items.length > 0 ? (
          <BarChart
            animate={!reduced}
            bloom={scheme === "dark" ? "low" : "off"}
            config={config}
            data={rows}
            // See the note in install-sparkline.tsx: the paint loop captures the
            // seed set and the motion decision at start, so scheme and motion
            // changes have to remount it.
            key={`${scheme}-${reduced}`}
            margins={MARGINS}
          >
            <Grid />
            <YAxis tickCount={4} tickFormatter={compactNumber} />
            {/* Every bar keeps a label; the label shortens instead. */}
            <XAxis
              dataKey="label"
              maxTicks={items.length}
              tickFormatter={(value) =>
                truncateLabel(String(value ?? ""), labelChars)
              }
            />
            <Bar colorKey="seed" dataKey="installs" variant="gradient" />
            <ChartTooltip
              labelKey="label"
              valueFormatter={(value) => exactNumber(value)}
            />
          </BarChart>
        ) : null}
      </div>
    </AccessibleChart>
  );
}
