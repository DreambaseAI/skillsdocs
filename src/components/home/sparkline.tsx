/**
 * The 8-week install sparkline.
 *
 * Deliberately not a chart component. It carries no axes, no tooltip and no
 * measurement pass — it is a piece of typographic furniture the size of a
 * word, and it has to render identically on the server so 89 index rows do
 * not each cause a layout shift. `viewBox` plus `preserveAspectRatio="none"`
 * means one path scales to whatever box the row gives it.
 *
 * Colour is `currentColor` throughout so it survives Windows High Contrast
 * Mode, where `fill` and `stroke` are not forced but the inherited text colour
 * is.
 *
 * The mark is `aria-hidden`: the numbers it draws are already stated in text
 * next to it, and eight unlabelled points announced as a data table would be
 * noise, not information. `trendLabel()` gives callers the one fact the shape
 * actually carries, as words.
 */

import { cn } from "@/lib/utils";

const WIDTH = 100;
const HEIGHT = 28;
/** Half the stroke, so the line never clips against the viewBox edge. */
const PAD = 1.5;

export interface SparklineProps {
  /** Oldest to newest. Fewer than two points renders nothing. */
  values: readonly number[];
  className?: string;
  /** Fill the area under the line. Off for dense index rows. */
  area?: boolean;
}

function points(values: readonly number[]): Array<[number, number]> {
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series has no range to normalise against; draw it down the middle
  // rather than dividing by zero and drawing nothing.
  const span = max - min || 1;
  const step = (WIDTH - PAD * 2) / (values.length - 1);

  return values.map((value, i) => [
    PAD + i * step,
    HEIGHT - PAD - ((value - min) / span) * (HEIGHT - PAD * 2),
  ]);
}

export function Sparkline({ values, className, area = false }: SparklineProps) {
  if (values.length < 2) return null;

  const coords = points(values);
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const closed = `${line} L${(WIDTH - PAD).toFixed(2)} ${HEIGHT} L${PAD} ${HEIGHT} Z`;
  const [lastX, lastY] = coords[coords.length - 1];

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={cn("h-7 w-24 overflow-visible", className)}
      aria-hidden="true"
      focusable="false"
    >
      {area && <path d={closed} fill="currentColor" opacity={0.12} />}
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={lastY} r={2} fill="currentColor" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * The trend as a signed percentage over the window, or null when there is not
 * enough data to claim one. Compares the first and last weeks — a regression
 * slope would be more defensible statistically and less legible as a label.
 */
export function trend(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const first = values[0];
  const last = values[values.length - 1];
  if (first <= 0) return null;
  return Math.round(((last - first) / first) * 100);
}

export function trendLabel(values: readonly number[]): string | null {
  const delta = trend(values);
  if (delta === null) return null;
  if (delta === 0) return "Level over 8 weeks";
  return `${delta > 0 ? "Up" : "Down"} ${Math.abs(delta)}% over 8 weeks`;
}

/** Anything inside ±5% over eight weeks is noise, not a direction. */
const FLAT = 5;

export interface TrendGlyph {
  glyph: "↑" | "↓" | "→";
  label: string;
}

/**
 * The trend as one character.
 *
 * Below the lead band of the index a sparkline is worse than nothing: 79 of
 * them, each auto-scaled to its own extrema and each tinted with its own
 * issue accent, made a 3% wobble and a 300% climb look identical and turned
 * the column into confetti. One glyph in ink says the only thing that
 * survives at that size, and it says it the same way on every row.
 */
export function trendGlyph(values: readonly number[]): TrendGlyph | null {
  const delta = trend(values);
  if (delta === null) return null;
  if (delta > FLAT) return { glyph: "↑", label: `Up ${delta}% over 8 weeks` };
  if (delta < -FLAT) return { glyph: "↓", label: `Down ${Math.abs(delta)}% over 8 weeks` };
  return { glyph: "→", label: "Level over 8 weeks" };
}
