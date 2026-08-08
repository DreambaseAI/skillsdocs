/**
 * Marketplace manifest tests.
 *
 * The three manifests below are the real shapes captured from
 * `anthropics/skills`, `cloudflare/skills` and `stripe/ai`
 * (docs/research/skills-repos.md §3).
 */

import { describe, expect, it } from "vitest";
import type { TreeEntry } from "./github";
import { findMarketplaceManifests, parseMarketplace } from "./marketplace";

const ANTHROPICS = JSON.stringify({
  name: "anthropic-agent-skills",
  owner: { name: "Keith Lazuka", email: "klazuka@anthropic.com" },
  metadata: { description: "Anthropic example skills", version: "1.0.0" },
  plugins: [
    {
      name: "document-skills",
      description: "Excel, Word, PowerPoint and PDF capabilities",
      source: "./",
      strict: false,
      skills: ["./skills/xlsx", "./skills/docx", "./skills/pptx", "./skills/pdf"],
    },
  ],
});

const CLOUDFLARE = JSON.stringify({
  $schema: "https://code.claude.com/schemas/marketplace.json",
  name: "cloudflare",
  owner: { name: "Cloudflare", url: "https://workers.cloudflare.com" },
  plugins: [
    {
      name: "cloudflare",
      source: "./",
      description: "Skills for the Cloudflare developer platform",
    },
  ],
});

const STRIPE = JSON.stringify({
  name: "stripe",
  owner: { name: "Stripe", email: "support@stripe.com" },
  plugins: [
    {
      name: "stripe",
      source: "./providers/claude/plugin/",
      description: "Stripe",
      version: "0.5.0",
      author: { name: "Stripe" },
    },
  ],
});

function blobs(...paths: string[]): TreeEntry[] {
  return paths.map((path) => ({ path, type: "blob" as const, sha: path }));
}

describe("findMarketplaceManifests", () => {
  it("prefers .claude-plugin over the other runtimes", () => {
    const found = findMarketplaceManifests(
      blobs(
        ".cursor-plugin/marketplace.json",
        ".codex-plugin/marketplace.json",
        ".claude-plugin/marketplace.json",
      ),
    );
    expect(found[0]).toBe(".claude-plugin/marketplace.json");
    expect(found).toHaveLength(3);
  });

  it("finds the .agents/plugins and .github/plugin variants", () => {
    expect(
      findMarketplaceManifests(blobs(".agents/plugins/marketplace.json")),
    ).toEqual([".agents/plugins/marketplace.json"]);
    expect(
      findMarketplaceManifests(blobs(".github/plugin/marketplace.json")),
    ).toEqual([".github/plugin/marketplace.json"]);
  });

  it("finds bespoke locations conventions would miss", () => {
    const found = findMarketplaceManifests(
      blobs(
        "src/plugins/claude/marketplace.json",
        "resources/plugins/launch/orca-marketplace.json",
        "skills/feature-flags/toggle/marketplace.json",
      ),
    );
    expect(found).toHaveLength(3);
  });

  it("ranks a nested conventional manifest below a root one", () => {
    const found = findMarketplaceManifests(
      blobs(
        ".claude/plugins/n8n/.claude-plugin/marketplace.json",
        ".claude-plugin/marketplace.json",
      ),
    );
    expect(found[0]).toBe(".claude-plugin/marketplace.json");
  });

  it("ignores vendored and fixture trees", () => {
    expect(
      findMarketplaceManifests(
        blobs(
          "node_modules/pkg/.claude-plugin/marketplace.json",
          "tests/fixtures/marketplace.json",
        ),
      ),
    ).toEqual([]);
  });

  it("ignores tree entries and unrelated filenames", () => {
    const entries: TreeEntry[] = [
      { path: ".claude-plugin", type: "tree", sha: "t" },
      { path: "package.json", type: "blob", sha: "p" },
    ];
    expect(findMarketplaceManifests(entries)).toEqual([]);
  });
});

describe("parseMarketplace", () => {
  it("reads the anthropics shape, including the explicit skills list", () => {
    const info = parseMarketplace(".claude-plugin/marketplace.json", ANTHROPICS)!;
    expect(info.name).toBe("anthropic-agent-skills");
    expect(info.publisher).toBe("Keith Lazuka");
    expect(info.publisherUrl).toBeNull();
    expect(info.description).toBe("Anthropic example skills");
    expect(info.plugins[0].skills).toHaveLength(4);
  });

  it("reads cloudflare's owner.url, which is a design.md lookup candidate", () => {
    const info = parseMarketplace(".claude-plugin/marketplace.json", CLOUDFLARE)!;
    expect(info.publisherUrl).toBe("https://workers.cloudflare.com");
    expect(info.plugins).toHaveLength(1);
    expect(info.plugins[0].skills).toEqual([]);
  });

  it("reads stripe's subdirectory source and version", () => {
    const info = parseMarketplace(".claude-plugin/marketplace.json", STRIPE)!;
    expect(info.plugins[0].source).toBe("./providers/claude/plugin/");
    expect(info.plugins[0].version).toBe("0.5.0");
  });

  it("defaults a missing source to ./", () => {
    const info = parseMarketplace("m.json", '{"name":"x","plugins":[{"name":"p"}]}')!;
    expect(info.plugins[0].source).toBe("./");
  });

  it("returns null for malformed JSON rather than throwing", () => {
    expect(parseMarketplace("m.json", "{ not json")).toBeNull();
    expect(parseMarketplace("m.json", "[]")).toBeNull();
    expect(parseMarketplace("m.json", "null")).toBeNull();
  });

  it("returns null for a same-named file belonging to something else", () => {
    expect(parseMarketplace("m.json", '{"version":3,"items":[]}')).toBeNull();
  });

  it("drops plugin entries with no name but keeps the manifest", () => {
    const info = parseMarketplace(
      "m.json",
      '{"name":"x","plugins":[{"description":"anonymous"},{"name":"real"}]}',
    )!;
    expect(info.plugins.map((p) => p.name)).toEqual(["real"]);
  });
});
