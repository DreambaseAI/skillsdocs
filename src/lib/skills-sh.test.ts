/**
 * skills.sh scraper tests.
 *
 * The payload fragments below are trimmed verbatim from live responses
 * captured on 2026-08-08 (`curl -s -H 'RSC: 1' https://www.skills.sh/`),
 * including the surrounding Flight framing that makes a whole-document
 * `JSON.parse` impossible.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildRepoSignal,
  extractJsonArray,
  isGitHubSource,
  parseOwnersPayload,
  parseSkillsPayload,
  scrapeLeaderboard,
  scrapeOfficialOwners,
  snapshotLeaderboard,
  snapshotOwners,
  type SkillsShOwner,
  type SkillsShSkill,
} from "./skills-sh";

/** Flight rows around the payload, as the real response has them. */
const HOME_PAYLOAD = `2:I[4707,[],""]
4:["$","div",null,{"children":[["$","$L5",null,{"initialSkills":[{"source":"vercel-labs/skills","skillId":"find-skills","name":"find-skills","installs":2870782,"weeklyInstalls":[118887,110834,113781,109199,109085,115475,107969,101120],"isOfficial":true},{"source":"mattpocock/skills","skillId":"grill-me","name":"grill-me","installs":798974,"weeklyInstalls":[41774,46900,47001,49104,70968,69550,67971,64738]},{"source":"open.feishu.cn","skillId":"lark","name":"lark","installs":42,"weeklyInstalls":[]},{"source":"agent.qq.com","skillId":"qq","name":"qq","installs":7,"weeklyInstalls":[]},{"source":"larksuite/cli","skillId":"lark-cli","name":"lark-cli","installs":900,"weeklyInstalls":[1,2,3,4,5,6,7,8]}],"view":"top"}]]}]
6:"done"
`;

const OFFICIAL_PAYLOAD = `3:I[9911,[],"CuratedList"]
5:["$","$L3",null,{"owners":[{"owner":"anthropics","repos":[{"repo":"anthropics/skills","totalInstalls":1526645,"skills":[{"name":"frontend-design","installs":755481},{"name":"skill-creator","installs":198111}]},{"repo":"anthropics/claude-quickstarts","totalInstalls":6,"skills":[{"name":"first-run","installs":6}]}],"totalInstalls":1942411,"featuredRepo":"anthropics/skills","featuredSkill":"frontend-design"}],"avatars":{"anthropics":"/api/image-proxy?url=x"},"generatedAt":"2026-08-08T00:00:00Z"}]
`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extractJsonArray", () => {
  it("finds an array embedded in a non-JSON document", () => {
    expect(extractJsonArray('junk "xs":[1,2,3] junk', "xs")).toEqual([1, 2, 3]);
  });

  it("ignores brackets inside strings", () => {
    const text = '"xs":["a]b","c[d"]';
    expect(extractJsonArray(text, "xs")).toEqual(["a]b", "c[d"]);
  });

  it("ignores escaped quotes inside strings", () => {
    const text = String.raw`"xs":["he said \"]\" and left"]`;
    expect(extractJsonArray(text, "xs")).toEqual(['he said "]" and left']);
  });

  it("handles nested arrays and objects", () => {
    const text = '"xs":[{"a":[1,[2,3]]},{"b":[]}] trailing';
    expect(extractJsonArray(text, "xs")).toEqual([
      { a: [1, [2, 3]] },
      { b: [] },
    ]);
  });

  it("skips an occurrence that is not an array and keeps looking", () => {
    expect(extractJsonArray('"xs":null,"xs":[7]', "xs")).toEqual([7]);
  });

  it("returns null for a missing key", () => {
    expect(extractJsonArray('"ys":[1]', "xs")).toBeNull();
  });

  it("returns null for an unterminated array instead of throwing", () => {
    expect(extractJsonArray('"xs":[1,2', "xs")).toBeNull();
  });
});

describe("isGitHubSource", () => {
  it("keeps owner/repo", () => {
    expect(isGitHubSource("anthropics/skills")).toBe(true);
    expect(isGitHubSource("vercel-labs/agent-browser")).toBe(true);
    // A dot is legal in a repo name, just not in a login.
    expect(isGitHubSource("larksuite/cli.js")).toBe(true);
  });

  it("drops bare domains and dotted owners", () => {
    expect(isGitHubSource("open.feishu.cn")).toBe(false);
    expect(isGitHubSource("agent.qq.com")).toBe(false);
    expect(isGitHubSource("uizze.com")).toBe(false);
    expect(isGitHubSource("open.feishu.cn/docs")).toBe(false);
  });

  it("drops paths with more than two segments", () => {
    expect(isGitHubSource("a/b/c")).toBe(false);
  });
});

describe("parseSkillsPayload", () => {
  it("extracts GitHub-sourced skills from a real Flight payload", () => {
    const skills = parseSkillsPayload(HOME_PAYLOAD);
    expect(skills.map((s) => s.source)).toEqual([
      "vercel-labs/skills",
      "mattpocock/skills",
      "larksuite/cli",
    ]);
    expect(skills[0].installs).toBe(2870782);
    expect(skills[0].weeklyInstalls).toHaveLength(8);
    expect(skills[0].isOfficial).toBe(true);
    expect(skills[1].isOfficial).toBeUndefined();
  });

  it("returns an empty array when the key disappears", () => {
    expect(parseSkillsPayload(HOME_PAYLOAD.replace("initialSkills", "skillRows")))
      .toEqual([]);
  });

  it("returns an empty array for garbage rather than throwing", () => {
    expect(parseSkillsPayload("")).toEqual([]);
    expect(parseSkillsPayload('"initialSkills":[{,]')).toEqual([]);
  });

  it("drops rows missing required fields but keeps the rest", () => {
    const text =
      '"initialSkills":[{"skillId":"orphan"},{"source":"a/b","skillId":"ok","installs":"nope"}]';
    const skills = parseSkillsPayload(text);
    expect(skills).toHaveLength(1);
    // A non-numeric install count coerces to 0 instead of poisoning the row.
    expect(skills[0]).toMatchObject({ source: "a/b", installs: 0 });
  });
});

describe("parseOwnersPayload", () => {
  it("extracts owners, repos and the editor's pick", () => {
    const owners = parseOwnersPayload(OFFICIAL_PAYLOAD);
    expect(owners).toHaveLength(1);
    expect(owners[0]).toMatchObject({
      owner: "anthropics",
      totalInstalls: 1942411,
      featuredRepo: "anthropics/skills",
      featuredSkill: "frontend-design",
    });
    expect(owners[0].repos).toHaveLength(2);
    expect(owners[0].repos[0].skills[0]).toEqual({
      name: "frontend-design",
      installs: 755481,
    });
  });

  it("returns an empty array when the shape changes", () => {
    expect(parseOwnersPayload(OFFICIAL_PAYLOAD.replace('"owners"', '"orgs"')))
      .toEqual([]);
  });
});

describe("scrape fallbacks", () => {
  it("returns [] when the site is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await expect(scrapeLeaderboard()).resolves.toEqual([]);
    await expect(scrapeOfficialOwners()).resolves.toEqual([]);
  });

  it("returns [] on a non-200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 503 })),
    );
    await expect(scrapeLeaderboard()).resolves.toEqual([]);
  });

  it("returns [] when the payload shape moves", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(HOME_PAYLOAD.replace("initialSkills", "leaderboardRows")),
        ),
    );
    await expect(scrapeLeaderboard()).resolves.toEqual([]);
  });

  it("parses a healthy payload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(HOME_PAYLOAD)));
    await expect(scrapeLeaderboard()).resolves.toHaveLength(3);
  });
});

describe("committed snapshot", () => {
  it("is the resilience layer, so it must be populated", () => {
    // fetchLeaderboard() substitutes these whenever a live scrape yields
    // nothing. An empty snapshot would turn a skills.sh outage into a page of
    // zeroes, which is the failure mode this file exists to prevent.
    expect(snapshotLeaderboard().length).toBeGreaterThan(100);
    expect(snapshotOwners().length).toBeGreaterThan(20);
  });

  it("contains only GitHub sources", () => {
    expect(snapshotLeaderboard().every((s) => isGitHubSource(s.source))).toBe(true);
  });

  it("carries an 8-element sparkline on ranked skills", () => {
    const ranked = snapshotLeaderboard().filter((s) => s.installs > 1000);
    expect(ranked.length).toBeGreaterThan(50);
    expect(ranked.every((s) => s.weeklyInstalls.length === 8)).toBe(true);
  });

  it("resolves a signal for a well-known repo", () => {
    const signal = buildRepoSignal(
      "anthropics",
      "skills",
      snapshotLeaderboard(),
      snapshotOwners(),
    );
    expect(signal).not.toBeNull();
    expect(signal!.installs).toBeGreaterThan(1_000_000);
    expect(signal!.official).toBe(true);
    expect(signal!.weeklyInstalls).toHaveLength(8);
  });
});

describe("buildRepoSignal", () => {
  const skills: SkillsShSkill[] = [
    {
      source: "acme/skills",
      skillId: "a",
      name: "a",
      installs: 100,
      weeklyInstalls: [1, 1, 1, 1, 1, 1, 1, 1],
    },
    {
      source: "acme/skills",
      skillId: "b",
      name: "b",
      installs: 50,
      weeklyInstalls: [2, 2, 2, 2, 2, 2, 2, 2],
    },
    {
      source: "other/skills",
      skillId: "c",
      name: "c",
      installs: 999,
      weeklyInstalls: [],
    },
  ];
  const owners: SkillsShOwner[] = [
    {
      owner: "acme",
      totalInstalls: 400,
      featuredRepo: "acme/skills",
      featuredSkill: "b",
      repos: [
        {
          repo: "acme/skills",
          totalInstalls: 400,
          skills: [
            { name: "a", installs: 90 },
            { name: "z", installs: 260 },
          ],
        },
      ],
    },
  ];

  it("sums the sparkline element-wise across a repo's ranked skills", () => {
    const s = buildRepoSignal("acme", "skills", skills, owners)!;
    expect(s.weeklyInstalls).toEqual([3, 3, 3, 3, 3, 3, 3, 3]);
  });

  it("takes the larger of the two install totals", () => {
    // Leaderboard sees 150 across the top-600; /official sees the whole repo.
    expect(buildRepoSignal("acme", "skills", skills, owners)!.installs).toBe(400);
  });

  it("prefers the fresher leaderboard number per skill", () => {
    const s = buildRepoSignal("acme", "skills", skills, owners)!;
    expect(s.perSkillInstalls).toEqual({ a: 100, b: 50, z: 260 });
  });

  it("only reports featuredSkill when the pick is this repo", () => {
    expect(buildRepoSignal("acme", "skills", skills, owners)!.featuredSkill).toBe("b");
    const elsewhere = [{ ...owners[0], featuredRepo: "acme/other" }];
    expect(
      buildRepoSignal("acme", "skills", skills, elsewhere)!.featuredSkill,
    ).toBeNull();
  });

  it("matches case-insensitively, because URLs are", () => {
    expect(buildRepoSignal("ACME", "Skills", skills, owners)).not.toBeNull();
  });

  it("returns null for a repo nobody has installed", () => {
    expect(buildRepoSignal("nobody", "nothing", skills, owners)).toBeNull();
  });

  it("works from the leaderboard alone, with no /official row", () => {
    const s = buildRepoSignal("other", "skills", skills, [])!;
    expect(s.installs).toBe(999);
    expect(s.official).toBe(false);
    expect(s.weeklyInstalls).toEqual([]);
  });
});
