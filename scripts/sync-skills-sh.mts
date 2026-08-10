/**
 * Refresh the committed skills.sh snapshot.
 *
 *   pnpm sync:skills-sh
 *
 * Writes `src/lib/data/skills-sh-snapshot.json`, the last-good scrape that
 * `src/lib/skills-sh.ts` falls back to when the live RSC payload moves or the
 * site is unreachable. Run it weekly and commit the result.
 *
 * Deliberately refuses to write a smaller-than-plausible payload: silently
 * replacing a good snapshot with a broken one would remove the very safety
 * net this file exists to provide.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  scrapeLeaderboard,
  scrapeOfficialOwners,
  snapshotGeneratedAt,
  snapshotLeaderboard,
  snapshotOwners,
  type SkillsShSnapshot,
} from "../src/lib/skills-sh";

/** Observed live: 600 skills, 98 owners. Anything far below that is a regression. */
const MIN_SKILLS = 100;
const MIN_OWNERS = 20;

const OUT = fileURLToPath(
  new URL("../src/lib/data/skills-sh-snapshot.json", import.meta.url),
);

const [skills, owners] = await Promise.all([
  scrapeLeaderboard(),
  scrapeOfficialOwners(),
]);

const sources = new Set(skills.map((s) => s.source));
const repos = owners.reduce((n, o) => n + o.repos.length, 0);

console.log(
  `scraped  ${skills.length} skills across ${sources.size} sources · ${owners.length} owners across ${repos} repos`,
);
console.log(
  `existing ${snapshotLeaderboard().length} skills · ${snapshotOwners().length} owners · generated ${snapshotGeneratedAt() || "never"}`,
);

if (skills.length < MIN_SKILLS || owners.length < MIN_OWNERS) {
  console.error(
    `\nRefusing to write: expected >=${MIN_SKILLS} skills and >=${MIN_OWNERS} owners.`,
  );
  console.error(
    "The RSC payload shape probably changed. Inspect it before touching the snapshot:",
  );
  console.error("  curl -s -H 'RSC: 1' https://www.skills.sh/ | head -c 2000");
  process.exit(1);
}

const next: SkillsShSnapshot = {
  generatedAt: new Date().toISOString(),
  skills,
  owners,
};

writeFileSync(OUT, `${JSON.stringify(next, null, 0)}\n`);
console.log(`\nwrote ${OUT}`);
console.log(
  `top: ${skills
    .slice(0, 3)
    .map((s) => `${s.source}/${s.skillId} ${s.installs.toLocaleString()}`)
    .join(" · ")}`,
);

/*
 * A closing note, because the counts printed above make this look like it
 * publishes something. It does not.
 *
 * The snapshot is a FALLBACK. `getLeaderboard()` scrapes skills.sh live on an
 * hourly cache and only reads this file when the scrape fails or returns
 * implausibly little. Committing a refresh changes nothing a visitor sees.
 */
console.log(
  [
    "",
    "This file is a fallback, not the live source.",
    "  Install counts on the site refresh hourly from skills.sh on their own.",
    "  These bytes are only read when that scrape fails or changes shape.",
    "",
    "  Commit it, but you rarely need to run this: before a launch, after a",
    "  skills.sh shape change, or if the leaderboard shrinks a lot (preferLive",
    "  rejects a live scrape smaller than half this file).",
    "",
    "  To add repos to the front page — which this cannot do — use:",
    "    pnpm sync:seeds",
    "",
  ].join("\n"),
);
