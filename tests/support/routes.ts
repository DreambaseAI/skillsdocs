/**
 * Which of the contract's routes actually exist in the running build.
 *
 * WS-4 (book shell), WS-5 (controls) and WS-9 (home) are landing in parallel
 * with this harness. Rather than delete specs for pages that do not exist yet
 * — which is how a11y coverage silently disappears — `global-setup.ts` probes
 * each route once and writes the result here. Specs read it synchronously at
 * collection time and mark themselves `fixme` with a note naming the owning
 * workstream. The day the route lands, the spec starts running with no edit.
 */

import fs from "node:fs";
import path from "node:path";

import { ROUTES, type RouteName } from "./contract";

/** Under node_modules so the repo stays clean without a .gitignore change. */
export const PROBE_FILE = path.join(
  process.cwd(),
  "node_modules/.cache/a11y-route-probe.json",
);

export type RouteProbe = Record<RouteName, { status: number; ok: boolean }>;

export function writeProbe(probe: RouteProbe): void {
  fs.mkdirSync(path.dirname(PROBE_FILE), { recursive: true });
  fs.writeFileSync(PROBE_FILE, JSON.stringify(probe, null, 2));
}

let cached: RouteProbe | null = null;

export function routeProbe(): RouteProbe {
  if (cached) return cached;
  try {
    cached = JSON.parse(fs.readFileSync(PROBE_FILE, "utf8")) as RouteProbe;
  } catch {
    // No probe (someone ran a spec directly) — assume everything is present
    // so the failure is a real assertion failure rather than a silent skip.
    cached = Object.fromEntries(
      Object.keys(ROUTES).map((k) => [k, { status: 200, ok: true }]),
    ) as RouteProbe;
  }
  return cached;
}

export function routeMissing(name: RouteName): boolean {
  return !routeProbe()[name]?.ok;
}

const BOOK = "WS-4 (src/app/[owner]/[repo]/page.tsx)";
const CHAPTER = "WS-4 (src/app/[owner]/[repo]/[skill]/page.tsx)";

const OWNER: Record<RouteName, string> = {
  home: "WS-9 (src/app/page.tsx)",
  book: BOOK,
  chapter: CHAPTER,
  chapterAlt: CHAPTER,
  roughBook: BOOK,
  roughOutline: CHAPTER,
  roughMedia: CHAPTER,
};

export function missingRouteNote(name: RouteName): string {
  const status = routeProbe()[name]?.status ?? 0;
  return `${ROUTES[name]} returned ${status}. Owned by ${OWNER[name]}; this spec runs automatically once that route responds 200.`;
}
