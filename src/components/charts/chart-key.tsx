/**
 * The in-flow legend for a chart. Owner: WS-7.
 *
 * dither-kit ships two legends and neither fits. The overlay `<Legend>` is a
 * row of `<button>`s absolutely positioned over the plot; `<BlockLegend>` is in
 * flow but paints its swatches from the resolved canvas seeds, which are only
 * known after mount — so it would either mismatch on hydration or pop in late.
 *
 * The DOM, unlike the canvas, *can* read a custom property. So the swatches
 * here are `var(--issue-chart-N)`: server-renderable, correct in both schemes
 * without JavaScript, and they follow a theme swap in the same frame as the
 * rest of the page. Under forced colours the swatch is redrawn as the matching
 * hatch from `hcm-fallback.tsx` — see `styles/chart.css`.
 */

import { cn } from "@/lib/utils";
import { chartVar } from "./seeds";

export interface ChartKeyEntry {
  label: string;
  /** Series index — selects both the CSS variable and the HCM hatch. */
  index: number;
  value?: string;
}

export function ChartKey({
  entries,
  className,
}: {
  entries: ChartKeyEntry[];
  className?: string;
}) {
  return (
    <ul className={cn("chart-key", className)}>
      {entries.map((entry, i) => (
        // Series index, not label: two categories can share a display string.
        <li className="chart-key-item" key={`${entry.label}-${i}`}>
          <span
            aria-hidden="true"
            className="chart-key-swatch"
            data-series={entry.index % 6}
            style={{ background: chartVar(entry.index) }}
          />
          <span className="chart-key-label">{entry.label}</span>
          {entry.value ? (
            <span className="chart-key-value">{entry.value}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
