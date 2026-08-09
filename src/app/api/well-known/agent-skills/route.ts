/**
 * `GET /.well-known/agent-skills/index.json` — site level.
 *
 * Lists the one skill *we* author: a skill that teaches an agent to drive this
 * site. Its digest is computed over `SITE_SKILL_MD` at request time, which is
 * the same constant the companion route serves, so the two can never drift.
 */

import { createHash } from "node:crypto";
import { etagOf } from "@/lib/http";
import { SITE_SKILL_MD, siteAgentSkills } from "@/lib/serialize";
import { absoluteUrl } from "@/lib/site";

const JSON_HEADERS: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
  "cache-control":
    "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "x-robots-tag": "all",
};

// Constant, so no `request` parameter and the route prerenders. The `ETag` is
// still emitted for the host to revalidate against.
export async function GET(): Promise<Response> {
  const digest = createHash("sha256")
    .update(SITE_SKILL_MD, "utf8")
    .digest("hex");
  const body = `${JSON.stringify(siteAgentSkills(digest), null, 2)}\n`;

  return new Response(body, {
    headers: {
      ...JSON_HEADERS,
      etag: etagOf(body),
      "content-length": String(Buffer.byteLength(body, "utf8")),
      link: [
        `<${absoluteUrl("/llms.txt")}>; rel="llms-txt"`,
        `<${absoluteUrl("/.well-known/api-catalog")}>; rel="api-catalog"`,
        `<${absoluteUrl("/api/v1/openapi.json")}>; rel="service-desc"`,
        `<${absoluteUrl("/api/v1/books")}>; rel="collection"`,
      ].join(", "),
    },
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}
