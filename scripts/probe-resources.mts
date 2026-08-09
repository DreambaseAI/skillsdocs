/**
 * Does the subchapter route actually render what the classifier promised?
 *
 * `src/lib/resources.ts` claims 96.2% of the 2,518 bundled files in the corpus
 * are renderable — 72% prose, 24% code, 3.8% bytes. That number is the whole
 * argument for the route existing, and it was derived from a git tree, not
 * from a rendered page. This walks real repositories, asks the classifier what
 * each file should become, fetches the file's own URL, and reads back what the
 * page *did* become. A mismatch is a bug in one of the two.
 *
 *     pnpm probe:resources                       # the three showcase repos
 *     pnpm probe:resources anthropics/skills     # one repo
 *     BASE=http://localhost:3000 pnpm probe:resources
 *
 * Needs a server on `BASE` (default `http://localhost:3150`).
 */

import { classifyResource, type ResourceRender } from "../src/lib/resources";

const BASE = process.env.BASE ?? "http://localhost:3150";

/** Requests in flight. Dev-mode compilation is the bottleneck, not the network. */
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);

const DEFAULT_REPOS = [
  "anthropics/skills",
  "supabase/agent-skills",
  "cloudflare/skills",
];

interface ApiResource {
  path: string;
  bytes: number;
}

/** What the rendered page turned out to be. */
type Observed = ResourceRender | "preview" | "missing" | "unavailable" | "unknown";

interface Row {
  url: string;
  relPath: string;
  bytes: number;
  predicted: ResourceRender | "preview";
  observed: Observed;
}

async function json<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return (await res.json()) as T;
}

/**
 * Read the shape of a rendered subchapter out of its HTML.
 *
 * Order matters. A preview *is* a code frame with a truncation notice beside
 * it, so the notice is tested first; the binary notice and the not-found UI
 * exclude a frame entirely, so they are unambiguous.
 */
function classifyPage(html: string): Observed {
  if (html.includes("does not ship that file")) return "missing";
  if (html.includes("Could not be read")) return "unavailable";
  if (html.includes("Not reproduced here")) return "binary";
  const hasFrame = html.includes("code-line__no");
  if (hasFrame && /First \d+ lines/.test(html)) return "preview";
  if (hasFrame) return "code";
  if (html.includes('class="prose')) return "prose";
  return "unknown";
}

function encodeRel(relPath: string): string {
  return relPath.split("/").map(encodeURIComponent).join("/");
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const repos = process.argv.slice(2).filter((a) => a.includes("/"));
const targets = repos.length > 0 ? repos : DEFAULT_REPOS;

const rows: Row[] = [];

for (const target of targets) {
  const [owner, repo] = target.split("/");
  const book = await json<{ chapters: { slug: string }[] }>(
    `/api/v1/books/${owner}/${repo}`,
  );
  process.stdout.write(`${target}: ${book.chapters.length} skills\n`);

  for (const { slug } of book.chapters) {
    const skill = await json<{ resources: ApiResource[] }>(
      `/api/v1/books/${owner}/${repo}/skills/${slug}`,
    );
    for (const resource of skill.resources ?? []) {
      const cls = classifyResource(resource.path, resource.bytes);
      rows.push({
        url: `/${owner}/${repo}/${slug}/${encodeRel(resource.path)}`,
        relPath: resource.path,
        bytes: resource.bytes,
        predicted: cls.oversized ? "preview" : cls.render,
        observed: "unknown",
      });
    }
  }
}

process.stdout.write(`\n${rows.length} bundled files. Fetching…\n`);

let done = 0;
await mapLimit(rows, CONCURRENCY, async (row) => {
  const res = await fetch(BASE + row.url);
  row.observed = classifyPage(await res.text());
  done++;
  if (done % 25 === 0) process.stdout.write(`  ${done}/${rows.length}\n`);
});

/* ----------------------------------------------------------------- report */

const counts = new Map<string, number>();
for (const row of rows) {
  const key = `${row.predicted} → ${row.observed}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

const mismatches = rows.filter((r) => r.predicted !== r.observed);
const renderedInBook = rows.filter(
  (r) => r.observed === "prose" || r.observed === "code" || r.observed === "preview",
);

process.stdout.write("\npredicted → observed\n");
for (const [key, n] of [...counts].sort((a, b) => b[1] - a[1])) {
  const bad = key.split(" → ")[0] !== key.split(" → ")[1];
  process.stdout.write(`  ${bad ? "✗" : "✓"} ${key.padEnd(26)} ${n}\n`);
}

const pct = (n: number) => `${((100 * n) / rows.length).toFixed(1)}%`;
process.stdout.write(
  `\nfiles              ${rows.length}\n` +
    `set in the book    ${renderedInBook.length}  ${pct(renderedInBook.length)}\n` +
    `described only     ${rows.length - renderedInBook.length}  ${pct(rows.length - renderedInBook.length)}\n` +
    `mismatches         ${mismatches.length}\n`,
);

if (mismatches.length > 0) {
  process.stdout.write("\nmismatches\n");
  for (const row of mismatches.slice(0, 40)) {
    process.stdout.write(
      `  ${row.predicted.padEnd(8)} → ${row.observed.padEnd(11)} ${row.bytes
        .toString()
        .padStart(8)} B  ${row.url}\n`,
    );
  }
}

process.exit(mismatches.length === 0 ? 0 : 1);
