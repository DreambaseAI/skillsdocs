/**
 * Live probe: run skill discovery against real repos and print what we found.
 *
 *   pnpm probe                    # default sample
 *   pnpm probe owner/repo ...     # specific repos
 *
 * Uses `gh api` when available (5000 req/hr) and falls back to anonymous.
 */

import { execFileSync } from "node:child_process";
import { collectResources, discoverSkills, parseSkill } from "../src/lib/skills";
import type { TreeEntry } from "../src/lib/github";

const DEFAULT_SAMPLE = [
  "anthropics/skills",
  "vercel-labs/skills",
  "mattpocock/skills",
  "DreambaseAI/skills",
  "supabase/agent-skills",
  "obra/superpowers",
  "expo/skills",
  "cloudflare/skills",
  "stripe/agent-toolkit",
  "remotion-dev/remotion",
  "microsoft/azure-skills",
  "shadcn-ui/ui",
];

function gh<T>(path: string): T {
  const out = execFileSync("gh", ["api", path], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out) as T;
}

async function probe(full: string) {
  const [owner, repo] = full.split("/");
  const meta = gh<{ default_branch: string; name: string }>(`repos/${owner}/${repo}`);
  const tree = gh<{ tree: TreeEntry[]; truncated: boolean }>(
    `repos/${owner}/${repo}/git/trees/${meta.default_branch}?recursive=1`,
  );

  const stubs = discoverSkills(tree.tree, meta.name);

  // Fetch bodies from raw.githubusercontent (not rate limited).
  const bodies = await Promise.all(
    stubs.map(async (s) => {
      const url = `https://raw.githubusercontent.com/${owner}/${repo}/${meta.default_branch}/${s.skillMdPath
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`;
      const res = await fetch(url);
      return res.ok ? await res.text() : null;
    }),
  );

  const skills = stubs.flatMap((stub, i) =>
    bodies[i] === null ? [] : [parseSkill(stub, bodies[i]!, collectResources(tree.tree, stub))],
  );

  const withIssues = skills.filter((s) => s.issues.length > 0);
  const variants = skills.filter((s) => s.variants.length > 0);
  const nested = skills.filter((s) => s.parentSlug);
  const groups = [...new Set(skills.map((s) => s.group).filter(Boolean))];

  console.log(
    `\n\x1b[1m${full}\x1b[0m  (${meta.default_branch})${tree.truncated ? "  \x1b[33m[TREE TRUNCATED]\x1b[0m" : ""}`,
  );
  console.log(
    `  skills=${skills.length}  deduped=${variants.length}  nested=${nested.length}  groups=${groups.length ? groups.join(", ") : "—"}`,
  );
  console.log(
    `  words=${skills.reduce((n, s) => n + s.wordCount, 0)}  resources=${skills.reduce((n, s) => n + s.resources.length, 0)}`,
  );

  if (withIssues.length) {
    console.log(`  \x1b[33mspec issues on ${withIssues.length}/${skills.length}:\x1b[0m`);
    for (const s of withIssues.slice(0, 4)) {
      console.log(`    - ${s.slug}: ${s.issues.join(" | ")}`);
    }
  }
  for (const s of skills.slice(0, 3)) {
    console.log(
      `    · ${s.slug.padEnd(28)} ${String(s.readingMinutes).padStart(2)}min  h=${s.headings.length}  res=${s.resources.length}  "${s.description.slice(0, 58)}${s.description.length > 58 ? "…" : ""}"`,
    );
  }
  if (variants.length) {
    console.log(
      `    variants e.g. ${variants[0].slug} → ${variants[0].variants.map((v) => v.label).join(", ")}`,
    );
  }
  return { full, count: skills.length, issues: withIssues.length };
}

const targets = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_SAMPLE;
const results = [];
for (const t of targets) {
  try {
    results.push(await probe(t));
  } catch (err) {
    console.log(`\n\x1b[31m${t}  FAILED: ${(err as Error).message.split("\n")[0]}\x1b[0m`);
  }
}
console.log(
  `\n\x1b[1mTotal:\x1b[0m ${results.reduce((n, r) => n + r.count, 0)} skills across ${results.length}/${targets.length} repos`,
);
