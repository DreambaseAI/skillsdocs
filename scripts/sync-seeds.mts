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

function gh<T>(path: string): T | null {
  try {
    return JSON.parse(
      execFileSync("gh", ["api", path], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }),
    ) as T;
  } catch {
    return null;
  }
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

  const meta = gh<RawRepo>(`repos/${owner}/${repo}`);
  if (!meta) {
    console.log(R("no such repo"));
    rejected.push([source, "repo not found or private"]);
    continue;
  }
  if (meta.archived) {
    console.log(Y("archived"));
    rejected.push([source, "archived"]);
    continue;
  }

  const tree = gh<{ tree: TreeEntry[]; truncated: boolean }>(
    `repos/${owner}/${repo}/git/trees/${meta.default_branch}?recursive=1`,
  );
  if (!tree) {
    console.log(R("tree unreadable"));
    rejected.push([source, "tree unreadable"]);
    continue;
  }

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
// Append before the array's closing bracket, which is the last `];` in the file.
const close = source.lastIndexOf("\n];");
if (close === -1) {
  console.error(R("Could not find the end of SEED_REPOS; write aborted."));
  process.exit(1);
}
writeFileSync(SEEDS_FILE, `${source.slice(0, close)}\n${literal}${source.slice(close)}`);
console.log(
  `${G("Wrote")} ${accepted.length} entries to src/lib/data/seed-repos.ts\n` +
    D("  Run `pnpm probe --seeds` to re-verify, then `pnpm vitest run`.\n"),
);
