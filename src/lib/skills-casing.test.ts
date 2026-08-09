import { describe, expect, it } from "vitest";

import { titleCase } from "./skills";

/**
 * Measured on `/openai/skills`, which set `Aspnet Core`, `Chatgpt Apps`,
 * `Gh Address Comments` and `Gh Fix CI` at 30px in the contents and 46px on
 * the chapter opener. A skill directory name is lowercase by spec, so the
 * information that `aspnet` is `ASP.NET` is not in the string — it has to be
 * in a map, and the map has to be keyed by the *slug*, not by the canonical
 * name's own lowercase, because `ASP.NET`.toLowerCase() is `asp.net` and
 * `titleCase` has split on the dot long before the map is consulted.
 */

describe("titleCase", () => {
  it.each([
    ["chatgpt-apps", "ChatGPT Apps"],
    ["aspnet-core", "ASP.NET Core"],
    ["gh-address-comments", "gh Address Comments"],
    ["gh-fix-ci", "gh Fix CI"],
    ["nextjs-routing", "Next.js Routing"],
    ["dotnet-aspire", ".NET Aspire"],
  ])("sets %s as %s", (slug, expected) => {
    expect(titleCase(slug)).toBe(expected);
  });

  it("does not regress the casing that already worked", () => {
    expect(titleCase("claude-api")).toBe("Claude API");
    expect(titleCase("slack-gif-creator")).toBe("Slack GIF Creator");
    expect(titleCase("skill-creator")).toBe("Skill Creator");
    expect(titleCase("dreambase-echarts")).toBe("Dreambase ECharts");
  });
});
