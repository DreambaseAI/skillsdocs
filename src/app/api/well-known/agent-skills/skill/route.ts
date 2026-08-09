/**
 * `GET /.well-known/agent-skills/skills-docs/skill.md`
 *
 * The body of the one skill this site publishes. Served from the same
 * `SITE_SKILL_MD` constant the manifest hashes, so the advertised digest always
 * matches the bytes — verify with:
 *
 *   curl -s localhost:3000/.well-known/agent-skills/skills-docs/skill.md |
 *     shasum -a 256
 */

import { createHash } from "node:crypto";
import { etagOf } from "@/lib/http";
import { SITE_SKILL_MD } from "@/lib/serialize";
import { absoluteUrl } from "@/lib/site";

// No `request` parameter on purpose: this document is a constant, so the route
// prerenders and is served from the static tier. It still carries an `ETag`
// (and `Content-Length`), which is what lets the host answer `If-None-Match`
// with a 304 without the handler ever running.
export async function GET(): Promise<Response> {
  const digest = createHash("sha256")
    .update(SITE_SKILL_MD, "utf8")
    .digest("hex");

  return new Response(SITE_SKILL_MD, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control":
        "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      "access-control-allow-origin": "*",
      "x-robots-tag": "all",
      "x-content-digest": `sha256:${digest}`,
      etag: etagOf(SITE_SKILL_MD),
      "content-length": String(Buffer.byteLength(SITE_SKILL_MD, "utf8")),
      link: `<${absoluteUrl("/.well-known/agent-skills/index.json")}>; rel="agent-skills"`,
    },
  });
}
