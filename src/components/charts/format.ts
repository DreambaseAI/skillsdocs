/**
 * Number formatting shared by the charts and their data tables. Owner: WS-7.
 *
 * The axis and the table deliberately disagree: an axis tick has ~4 characters
 * of room and wants `1.2M`, while the table is the accessible representation of
 * the data and must carry the exact figure. Two formatters, one import, so a
 * chart can never accidentally round the number a screen reader gets.
 */

const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const exact = new Intl.NumberFormat("en");

/** Axis ticks, legend values, headline figures: `1.2M`. */
export function compactNumber(value: number): string {
  return compact.format(value);
}

/** Data-table cells: `1,234,567`. Never rounded. */
export function exactNumber(value: number): string {
  return exact.format(value);
}

/** Share of a total, for donut captions and tables. */
export function percentOf(value: number, total: number): string {
  if (total <= 0) return "0%";
  const pct = (value / total) * 100;
  return `${pct >= 10 ? Math.round(pct) : pct.toFixed(1)}%`;
}

/** Axis labels have no room for a long repo or part name. */
export function truncateLabel(label: string, max = 12): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}
