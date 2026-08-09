"use client";

/**
 * How a book divides into parts — one ring segment per `BookPart`. Owner: WS-7.
 *
 * This is the only chart in the set where hue is the encoding, which is why it
 * is also the only one that genuinely needs the hatch differentiation in
 * `hcm-fallback.tsx`: strip the colour and a donut becomes one grey ring.
 *
 * A donut rather than a pie because the middle is useful — it carries the
 * chapter count, so the reader gets the total without reading the ring.
 */

import { useMemo } from "react";
import { Pie } from "@/components/dither-kit/pie";
import { PieChart } from "@/components/dither-kit/pie-chart";
import { AccessibleChart } from "./accessible-chart";
import { ChartKey } from "./chart-key";
import { exactNumber, percentOf } from "./format";
import { HcmFallback } from "./hcm-fallback";
import { type ChartSeeds, seedAt } from "./seeds";
import {
  useChartMounted,
  useChartReducedMotion,
  useChartScheme,
} from "./use-chart-env";

export interface ChapterPart {
  /** Part title, e.g. `Writing` — `book.parts[].title`. */
  title: string;
  /** Chapters in the part — `book.parts[].skills.length`. */
  chapters: number;
}

export interface ChaptersDonutProps {
  parts: ChapterPart[];
  seeds: ChartSeeds;
  /** The book, e.g. `anthropics/skills`. */
  subject: string;
  height?: number;
  className?: string;
}

export function ChaptersDonut({
  parts,
  seeds,
  subject,
  height = 240,
  className,
}: ChaptersDonutProps) {
  const scheme = useChartScheme();
  const reduced = useChartReducedMotion();
  const mounted = useChartMounted();

  const rows = useMemo(
    () => parts.map((part) => ({ name: part.title, chapters: part.chapters })),
    [parts],
  );

  // One config entry per slice, keyed by the slice name — that is how the polar
  // controller looks a colour up (`config[slice.name]`), not by series.
  const config = useMemo(() => {
    const out: Record<
      string,
      { label: string; color: ReturnType<typeof seedAt> }
    > = {};
    parts.forEach((part, i) => {
      out[part.title] = { label: part.title, color: seedAt(seeds, scheme, i) };
    });
    return out;
  }, [parts, seeds, scheme]);

  const total = parts.reduce((n, part) => n + part.chapters, 0);
  const largest = parts.reduce<ChapterPart | null>(
    (best, part) => (best === null || part.chapters > best.chapters ? part : best),
    null,
  );

  const description =
    parts.length === 0
      ? `${subject} has no grouped parts.`
      : `${total} chapters of ${subject} across ${parts.length} parts.${
          largest
            ? ` ${largest.title} is the largest at ${largest.chapters} chapters, ${percentOf(largest.chapters, total)} of the book.`
            : ""
        }`;

  return (
    <AccessibleChart
      className={className}
      columns={["Part", "Chapters", "Share"]}
      description={description}
      hcm={
        <HcmFallback
          id="parts"
          kind="donut"
          series={parts.map((part) => ({
            label: part.title,
            values: [part.chapters],
          }))}
        />
      }
      height={height}
      legend={
        <ChartKey
          entries={parts.map((part, i) => ({
            index: i,
            label: part.title,
            value: String(part.chapters),
          }))}
        />
      }
      rows={parts.map((part) => ({
        header: part.title,
        cells: [exactNumber(part.chapters), percentOf(part.chapters, total)],
      }))}
      title={`Chapters by part — ${subject}`}
    >
      {mounted && parts.length > 0 ? (
        <>
          <PieChart
            animate={!reduced}
            bloom={scheme === "dark" ? "low" : "off"}
            config={config}
            data={rows}
            dataKey="chapters"
            innerRadius={0.58}
            // See install-sparkline.tsx: the paint loop captures the seed set
            // and the motion decision when it starts.
            key={`${scheme}-${reduced}`}
            nameKey="name"
          >
            <Pie variant="gradient" />
          </PieChart>
          <span aria-hidden="true" className="chart-donut-center">
            <span className="chart-donut-total">{total}</span>
            <span className="chart-donut-unit">chapters</span>
          </span>
        </>
      ) : null}
    </AccessibleChart>
  );
}
