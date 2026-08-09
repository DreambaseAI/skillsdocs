/**
 * Probes every contract route once, before any worker loads a spec.
 *
 * Also warms them: the first request to a `use cache` route under Cache
 * Components pays for the whole GitHub round trip and the Shiki highlighter,
 * which would otherwise land inside the first test's timeout.
 */

import type { FullConfig } from "@playwright/test";

import { ROUTES, type RouteName } from "./contract";
import { writeProbe, type RouteProbe } from "./routes";

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL =
    config.projects[0]?.use?.baseURL ??
    process.env.E2E_BASE_URL ??
    "http://127.0.0.1:3311";

  const probe = {} as RouteProbe;
  const names = Object.keys(ROUTES) as RouteName[];

  for (const name of names) {
    const url = new URL(ROUTES[name], baseURL).href;
    try {
      const res = await fetch(url, { headers: { accept: "text/html" } });
      // Read the body: streamed Suspense content is where the real work is,
      // and a 200 status alone does not mean the page rendered.
      const body = await res.text();
      const ok = res.status === 200 && body.length > 0;
      probe[name] = { status: res.status, ok };
    } catch (error) {
      probe[name] = { status: 0, ok: false };
      process.stderr.write(
        `[a11y] route probe failed for ${url}: ${(error as Error).message}\n`,
      );
    }
  }

  writeProbe(probe);

  const missing = names.filter((n) => !probe[n].ok);
  if (missing.length > 0) {
    process.stdout.write(
      `[a11y] routes not yet available (specs will report as fixme): ${missing
        .map((n) => `${n} → ${ROUTES[n]} (${probe[n].status})`)
        .join(", ")}\n`,
    );
  }
}
