/**
 * `GET /.well-known/agent-skills/githubskills-book/skill.md`
 *
 * The body of the one skill this site publishes. Served from the same
 * `SITE_SKILL_MD` constant the manifest hashes, so the advertised digest always
 * matches the bytes — verify with:
 *
 *   curl -s localhost:3000/.well-known/agent-skills/githubskills-book/skill.md |
 *     shasum -a 256
 */

import { createHash } from "node:crypto";
import { SITE_SKILL_MD } from "@/lib/serialize";
import { absoluteUrl } from "@/lib/site";

export async function GET(): Promise<Response> {
  const digest = createHash("sha256").update(SITE_SKILL_MD, "utf8").digest("hex");

  return new Response(SITE_SKILL_MD, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      "access-control-allow-origin": "*",
      "x-robots-tag": "all",
      "x-content-digest": `sha256:${digest}`,
      link: `<${absoluteUrl("/.well-known/agent-skills/index.json")}>; rel="agent-skills"`,
    },
  });
}
