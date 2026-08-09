/**
 * The Windows High Contrast Mode rendition of a chart. Owner: WS-7.
 *
 * Why a second drawing exists at all:
 *
 * 1. Under `forced-colors: active` the UA replaces author colours with a
 *    twelve-entry system palette — but **SVG `fill` and `stroke` are not
 *    forced**. Left alone, a multi-series chart either keeps colours that clash
 *    with the forced ground or, once you opt into `forced-color-adjust: none`
 *    (which `theme-modes.css` does for `[data-chart]`), keeps colours the
 *    reader has explicitly asked the OS to override.
 * 2. Canvas pixels cannot be re-encoded at all. The dither charts are canvas.
 *
 * So the live chart is hidden in HCM and this takes its place: one drawing in
 * `CanvasText` on `Canvas`, with every series told apart by a dash pattern or a
 * hatch fill instead of a hue. It is `aria-hidden` — the figure's data table is
 * the accessible path, in HCM exactly as everywhere else. The swap is pure CSS;
 * see the `forced-colors` block in `styles/chart.css`.
 */

const VIEW_W = 320;
const VIEW_H = 140;

/** One series of the chart, in the order it is drawn. */
export interface HcmSeries {
  label: string;
  values: number[];
}

/** Six hatches, distinguishable at a glance and at print resolution. */
const HATCHES: readonly string[] = [
  "M0,4 l8,-8 M-2,2 l4,-4 M6,10 l4,-4", // 45°
  "M0,0 l0,8", // vertical
  "M0,0 l8,0", // horizontal
  "M0,-4 l8,8 M-2,6 l4,4 M6,-6 l4,4", // 135°
  "M0,4 l8,-8 M0,-4 l8,8", // cross
  "M2,2 l0,0.5 M6,6 l0,0.5", // dots
];

/** Matching dash patterns for line work. */
const DASHES: readonly string[] = [
  "0",
  "6 3",
  "2 3",
  "10 3 2 3",
  "6 3 2 3 2 3",
  "1 4",
];

function hatchId(prefix: string, index: number) {
  return `${prefix}-hatch-${index % HATCHES.length}`;
}

function Hatches({ prefix, count }: { prefix: string; count: number }) {
  return (
    <defs>
      {Array.from({ length: Math.min(count, HATCHES.length) }, (_, i) => (
        <pattern
          height="8"
          id={hatchId(prefix, i)}
          key={hatchId(prefix, i)}
          patternUnits="userSpaceOnUse"
          width="8"
        >
          <path d={HATCHES[i]} stroke="CanvasText" strokeWidth="1" />
        </pattern>
      ))}
    </defs>
  );
}

function maxOf(series: HcmSeries[]): number {
  let max = 0;
  for (const s of series) for (const v of s.values) if (v > max) max = v;
  return max || 1;
}

/* ------------------------------------------------------------------- line */

function HcmLine({ series, prefix }: { series: HcmSeries[]; prefix: string }) {
  const max = maxOf(series);
  const pad = 6;
  const plotH = VIEW_H - pad * 2;

  return (
    <>
      {series.map((s, si) => {
        const step = VIEW_W / Math.max(s.values.length - 1, 1);
        const points = s.values
          .map(
            (v, i) =>
              `${(i * step).toFixed(1)},${(pad + plotH - (v / max) * plotH).toFixed(1)}`,
          )
          .join(" ");
        return (
          <g key={`${prefix}-${s.label}`}>
            <polyline
              fill="none"
              points={points}
              stroke="CanvasText"
              strokeDasharray={DASHES[si % DASHES.length]}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            {s.values.map((v, i) => (
              <rect
                height="5"
                // biome-ignore lint/suspicious/noArrayIndexKey: index is the stable x position
                key={i}
                stroke="CanvasText"
                width="5"
                x={i * step - 2.5}
                y={pad + plotH - (v / max) * plotH - 2.5}
              />
            ))}
          </g>
        );
      })}
    </>
  );
}

/* -------------------------------------------------------------------- bar */

function HcmBars({
  categories,
  series,
  prefix,
}: {
  categories?: string[];
  series: HcmSeries[];
  prefix: string;
}) {
  const max = maxOf(series);
  const pad = 6;
  // Reserve a strip at the foot for category labels when there are any: a bar
  // chart whose bars are unlabelled is a row of rectangles, not a chart.
  const labelH = categories?.length ? 14 : 0;
  const plotH = VIEW_H - pad * 2 - labelH;
  const columns = Math.max(...series.map((s) => s.values.length), 1);
  const slot = VIEW_W / columns;
  const barW = (slot * 0.72) / series.length;

  return (
    <>
      {series.map((s, si) =>
        s.values.map((v, i) => {
          const h = Math.max(1, (v / max) * plotH);
          return (
            <rect
              fill={
                series.length > 1 ? `url(#${hatchId(prefix, si)})` : "CanvasText"
              }
              height={h}
              key={`${s.label}-${i}`}
              stroke="CanvasText"
              strokeWidth="1"
              width={barW}
              x={i * slot + slot * 0.14 + si * barW}
              y={pad + plotH - h}
            />
          );
        }),
      )}
      {categories?.map((label, i) => (
        <text
          fill="CanvasText"
          fontSize="9"
          key={label}
          textAnchor="middle"
          x={i * slot + slot / 2}
          y={VIEW_H - 3}
        >
          {label}
        </text>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ donut */

function arcPath(
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  a0: number,
  a1: number,
): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const x = (r: number, a: number) => cx + Math.cos(a) * r;
  const y = (r: number, a: number) => cy + Math.sin(a) * r;
  return [
    `M${x(r1, a0)},${y(r1, a0)}`,
    `A${r1},${r1} 0 ${large} 1 ${x(r1, a1)},${y(r1, a1)}`,
    `L${x(r0, a1)},${y(r0, a1)}`,
    `A${r0},${r0} 0 ${large} 0 ${x(r0, a0)},${y(r0, a0)}`,
    "Z",
  ].join(" ");
}

function HcmDonut({ series, prefix }: { series: HcmSeries[]; prefix: string }) {
  // One "series" per slice, each holding a single value.
  const values = series.map((s) => s.values[0] ?? 0);
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const cx = VIEW_W / 2;
  const cy = VIEW_H / 2;
  const r1 = Math.min(cx, cy) - 6;
  const r0 = r1 * 0.58;

  // Cumulative sweep, resolved up front rather than accumulated inside the
  // map: a running total mutated from a render callback is exactly what
  // `react-hooks/immutability` exists to catch.
  const wedges: Array<{ label: string; d: string }> = [];
  let angle = -Math.PI / 2;
  for (const [i, v] of values.entries()) {
    const next = angle + (v / total) * Math.PI * 2;
    wedges.push({ label: series[i].label, d: arcPath(cx, cy, r0, r1, angle, next) });
    angle = next;
  }

  return (
    <>
      {wedges.map((wedge, i) => (
        <path
          d={wedge.d}
          fill={`url(#${hatchId(prefix, i)})`}
          key={wedge.label}
          stroke="CanvasText"
          strokeWidth="1.5"
        />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------- root */

export type HcmKind = "line" | "bar" | "donut";

/**
 * Renders `series` in forced-colours-safe monochrome. Mount it as
 * `AccessibleChart`'s `hcm` prop; the CSS decides when it is visible.
 */
export function HcmFallback({
  categories,
  id,
  kind,
  series,
}: {
  /** X-axis category labels — bar charts only. Keep them short. */
  categories?: string[];
  /** Unique per chart instance — namespaces the SVG pattern ids. */
  id: string;
  kind: HcmKind;
  series: HcmSeries[];
}) {
  // A circle must not be stretched; the cartesian forms should fill the frame.
  const fit = kind === "donut" ? "xMidYMid meet" : "none";

  return (
    <svg
      aria-hidden="true"
      className="chart-hcm-svg"
      focusable="false"
      preserveAspectRatio={fit}
      role="presentation"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
    >
      <Hatches count={series.length} prefix={id} />
      {kind === "line" && <HcmLine prefix={id} series={series} />}
      {kind === "bar" && (
        <HcmBars categories={categories} prefix={id} series={series} />
      )}
      {kind === "donut" && <HcmDonut prefix={id} series={series} />}
    </svg>
  );
}

export { DASHES as HCM_DASHES, HATCHES as HCM_HATCHES };
