/**
 * Public surface of the chart pack. Owner: WS-7.
 *
 * The only cross-boundary rule callers need to remember: `chartSeedsFromTheme`
 * runs on the **server** (it pulls in the OKLab maths in `lib/color`), and the
 * `ChartSeeds` it returns is passed to the chart as a prop. Everything else in
 * here is a client component.
 *
 *   const seeds = chartSeedsFromTheme(book.theme);   // server component
 *   <InstallSparkline seeds={seeds} weeklyInstalls={…} subject={…} />
 */

export { AccessibleChart } from "./accessible-chart";
export type {
  AccessibleChartProps,
  ChartTableRow,
} from "./accessible-chart";
export { ChaptersDonut } from "./chapters-donut";
export type { ChapterPart, ChaptersDonutProps } from "./chapters-donut";
export { ChartKey } from "./chart-key";
export type { ChartKeyEntry } from "./chart-key";
export {
  compactNumber,
  exactNumber,
  percentOf,
  truncateLabel,
} from "./format";
export { HcmFallback } from "./hcm-fallback";
export type { HcmKind, HcmSeries } from "./hcm-fallback";
export { InstallSparkline } from "./install-sparkline";
export type { InstallSparklineProps } from "./install-sparkline";
export { InstallsBarChart } from "./installs-bar-chart";
export type {
  InstallsBarChartProps,
  InstallsBarItem,
} from "./installs-bar-chart";
export { chartSeedsFromTheme, chartVar, seedAt, seedFromColor } from "./seeds";
export type { ChartScheme, ChartSeeds } from "./seeds";
