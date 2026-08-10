/**
 * Propose additions to `SEED_REPOS` from the live skills.sh leaderboard.
 *
 *   pnpm sync:seeds            # report only
 *   pnpm sync:seeds --write    # append verified entries to seed-repos.ts
 *   pnpm sync:seeds --min 5000 # only consider repos above an install floor
 *
 * ## Why this exists
 *
 * `sync:skills-sh` refreshes the *fallback snapshot* — install counts for
 * repos we already list. It cannot add a repo, because the homepage index is
 * built from `SEED_REPOS`, not from the leaderboard. Without this script a
 * repo trending on skills.sh is readable at its URL and invisible on the
 * front page, and nothing in the tooling says so.
 *
 * ## Why it does not just add everything
 *
 * Because the leaderboard is not a list of books. An install count says a
 * package was fetched, not that this repository contains skills we can render:
 * `vercel-labs/next-skills` has six figures of installs and zero `SKILL.md`
 * on `main`. Every candidate is therefore verified against the GitHub tree
 * with the same discovery the reader uses, and anything with no real skills
 * is reported and skipped rather than seeded.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { collectResources, discoverSkills } from "../src/lib/skills";
import { SEED_REPOS, type SeedRepo } from "../src/lib/data/seed-repos";
import { insertSeedEntries } from "../src/lib/data/seed-insert";
// `scrapeLeaderboard`, not `fetchLeaderboard`: the latter carries `use cache`
// and only runs inside a Next runtime.
import { isGitHubSource, scrapeLeaderboard } from "../src/lib/skills-sh";
import type { TreeEntry } from "../src/lib/github";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEEDS_FILE = join(ROOT, "src/lib/data/seed-repos.ts");

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const MIN_INSTALLS = Number(args[args.indexOf("--min") + 1]) || 1000;

const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;

type GhResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "not-found" | "rate-limited" | "error"; message: string };

/**
 * Every failure used to collapse into `null`, which the caller reported as
 * "repo not found or private".
 *
 * That is the wrong answer for the most likely failure. Verifying ~50
 * candidates costs ~100 API calls, so hitting the rate limit mid-run is
 * routine — and it rendered as a list of real repositories being declared
 * missing. With `--write` that silently produces a shorter seed list and exits
 * zero. A rate limit has to be told apart from a 404 and has to stop the run.
 */
function gh<T>(path: string): GhResult<T> {
  try {
    return {
      ok: true,
      data: JSON.parse(
        execFileSync("gh", ["api", path], {
          encoding: "utf8",
          maxBuffer: 64 * 1024 * 1024,
          stdio: ["ignore", "pipe", "pipe"],
        }),
      ) as T,
    };
  } catch (err) {
    const e = err as { stderr?: Buffer | string; stdout?: Buffer | string };
    const text = `${e.stderr ?? ""}${e.stdout ?? ""}`;
    if (/rate limit|secondary rate|abuse detection/i.test(text)) {
      return { ok: false, kind: "rate-limited", message: text.trim().slice(0, 200) };
    }
    if (/Not Found|HTTP 404/i.test(text)) {
      return { ok: false, kind: "not-found", message: "not found or private" };
    }
    return { ok: false, kind: "error", message: text.trim().slice(0, 200) || "gh failed" };
  }
}

/** A rate limit invalidates the whole run, so say so and stop. */
function bailOnRateLimit(source: string, message: string): never {
  console.log(R("rate limited"));
  console.error(
    `\n${R("GitHub rate limit hit")} while verifying ${source}.\n` +
      `  Nothing was written — a partial run would have produced a seed list\n` +
      `  missing real repositories, with no error.\n\n` +
      `  Check with: gh api rate_limit --jq .resources.core\n` +
      `  Then re-run. ${D(message)}\n`,
  );
  process.exit(2);
}

const known = new Set(SEED_REPOS.map((s) => `${s.owner}/${s.repo}`.toLowerCase()));

console.log("Fetching the live leaderboard…");
const leaderboard = await scrapeLeaderboard();

const byRepo = new Map<string, number>();
for (const skill of leaderboard) {
  if (!isGitHubSource(skill.source)) continue;
  byRepo.set(skill.source, (byRepo.get(skill.source) ?? 0) + (skill.installs ?? 0));
}

const candidates = [...byRepo.entries()]
  .filter(([source]) => !known.has(source.toLowerCase()))
  .filter(([, installs]) => installs >= MIN_INSTALLS)
  .sort((a, b) => b[1] - a[1]);

console.log(
  `\n${byRepo.size} GitHub sources on the leaderboard · ${known.size} already seeded · ` +
    `${candidates.length} candidates above ${MIN_INSTALLS.toLocaleString("en-GB")} installs\n`,
);

interface RawRepo {
  name: string;
  default_branch: string;
  description: string | null;
  homepage: string | null;
  stargazers_count: number;
  license: { spdx_id: string | null } | null;
  archived: boolean;
  owner: { login: string; avatar_url: string };
}

const accepted: SeedRepo[] = [];
const rejected: Array<[string, string]> = [];

for (const [source, installs] of candidates) {
  const [owner, repo] = source.split("/");
  process.stdout.write(`  ${source.padEnd(42)} `);

  const metaResult = gh<RawRepo>(`repos/${owner}/${repo}`);
  if (!metaResult.ok) {
    if (metaResult.kind === "rate-limited") bailOnRateLimit(source, metaResult.message);
    console.log(R(metaResult.kind === "not-found" ? "no such repo" : "gh error"));
    rejected.push([source, metaResult.message]);
    continue;
  }
  const meta = metaResult.data;
  if (meta.archived) {
    console.log(Y("archived"));
    rejected.push([source, "archived"]);
    continue;
  }

  const treeResult = gh<{ tree: TreeEntry[]; truncated: boolean }>(
    `repos/${owner}/${repo}/git/trees/${meta.default_branch}?recursive=1`,
  );
  if (!treeResult.ok) {
    if (treeResult.kind === "rate-limited") bailOnRateLimit(source, treeResult.message);
    console.log(R("tree unreadable"));
    rejected.push([source, treeResult.message]);
    continue;
  }
  const tree = treeResult.data;

  // The same discovery the reader uses — an install count is not evidence of
  // a book. `vercel-labs/next-skills` is the standing counter-example.
  const stubs = discoverSkills(tree.tree, meta.name);
  if (stubs.length === 0) {
    console.log(R("0 skills"));
    rejected.push([source, "no SKILL.md after noise filtering"]);
    continue;
  }

  const layouts = [
    ...new Set(
      stubs.map((s) => {
        const parts = s.skillMdPath.split("/");
        return parts.length === 1
          ? "SKILL.md"
          : parts.map((seg, i) => (i === parts.length - 2 ? "*" : seg)).join("/");
      }),
    ),
  ];
  const resources = stubs.reduce((n, s) => n + collectResources(tree.tree, s).length, 0);

  const marketplace = tree.tree.some(
    (e) => e.type === "blob" && /(^|\/)(\.[\w-]+-plugin|\.github\/plugin)\/marketplace\.json$/.test(e.path),
  );

  accepted.push({
    owner: meta.owner.login,
    repo: meta.name,
    branch: meta.default_branch,
    skillCount: stubs.length,
    layout: layouts[0],
    layouts,
    stars: meta.stargazers_count,
    installs,
    official: false,
    license: meta.license?.spdx_id === "NOASSERTION" ? null : (meta.license?.spdx_id ?? null),
    marketplace,
    avatar: meta.owner.avatar_url,
    site: meta.homepage?.trim() || null,
    description: meta.description,
  });

  console.log(
    G(`${stubs.length} skills`) +
      D(`  ${installs.toLocaleString("en-GB")} installs · ${resources} bundled · ${layouts[0]}`),
  );
}

console.log(
  `\n${G(`${accepted.length} verified`)} · ${R(`${rejected.length} rejected`)}\n`,
);

if (rejected.length > 0) {
  console.log("Rejected:");
  for (const [source, why] of rejected) console.log(`  ${source.padEnd(42)} ${D(why)}`);
  console.log();
}

if (accepted.length === 0) {
  console.log("Nothing to add.\n");
  process.exit(0);
}

const literal = accepted
  .map(
    (s) => `  {
    owner: ${JSON.stringify(s.owner)}, repo: ${JSON.stringify(s.repo)}, branch: ${JSON.stringify(s.branch)},
    skillCount: ${s.skillCount}, layout: ${JSON.stringify(s.layout)},
    layouts: ${JSON.stringify(s.layouts)},
    stars: ${s.stars}, installs: ${s.installs}, official: ${s.official},
    license: ${JSON.stringify(s.license)}, marketplace: ${s.marketplace},
    avatar: ${JSON.stringify(s.avatar)},
    site: ${JSON.stringify(s.site)},
    description: ${JSON.stringify(s.description)},
  },`,
  )
  .join("\n");

if (!WRITE) {
  console.log("Add these to SEED_REPOS (or re-run with --write):\n");
  console.log(literal);
  console.log(
    `\n${Y("Not written.")} Review them first — a seeded repo appears on the front page.\n`,
  );
  process.exit(0);
}

const source = readFileSync(SEEDS_FILE, "utf8");
let updated: string;
try {
  updated = insertSeedEntries(source, literal);
} catch (err) {
  console.error(R((err as Error).message + "; write aborted."));
  process.exit(1);
}
writeFileSync(SEEDS_FILE, updated);
console.log(
  `${G("Wrote")} ${accepted.length} entries to src/lib/data/seed-repos.ts\n` +
    D("  Run `pnpm probe --seeds` to re-verify, then `pnpm vitest run`.\n"),
);
