import { compactCount } from "@/components/book/format";

/**
 * An eight-week install sparkline, set as masthead furniture.
 *
 * Deliberately not a chart: no axes, no tooltip, no legend, no canvas, no
 * client JavaScript. Real charts are WS-7's `AccessibleChart` family. This is
 * the printed-page equivalent of a stock ticker's shape — it says "rising" or
 * "flat" at a glance and nothing more, so its accessible text is a sentence
 * rather than a data table.
 */

export interface SparklineProps {
  /** Oldest to newest. Fewer than two points renders nothing. */
  values: number[];
  label: string;
}

const W = 100;
const H = 28;
const PAD = 2;

export function Sparkline({ values, label }: SparklineProps) {
  if (values.length < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  // A flat series must not divide by zero, and must not be drawn as a spike.
  const span = max - min || 1;

  const points = values.map((value, i) => {
    const x = PAD + (i / (values.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((value - min) / span) * (H - PAD * 2);
    return [x, y] as const;
  });

  const line = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
  const area = `${line} L${(W - PAD).toFixed(2)} ${H} L${PAD.toFixed(2)} ${H} Z`;

  const first = values[0];
  const last = values[values.length - 1];
  const direction =
    last > first ? "rising" : last < first ? "falling" : "steady";

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="book-spark"
        role="img"
        aria-label={`${label}: ${direction} over eight weeks, ${compactCount(first)} to ${compactCount(last)} per week.`}
      >
        <path className="book-spark__area" d={area} />
        <path d={line} />
      </svg>
    </figure>
  );
}
