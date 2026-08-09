/**
 * `GET /llms.txt` — the site index, per llmstxt.org.
 *
 * A folder literally named `llms.txt` containing `route.ts` produces the route
 * `/llms.txt`; Next treats the dot in a folder name as part of the segment.
 *
 * Served as `text/plain` even though the body is Markdown: that is the
 * convention every implementation of the spec follows, and it keeps browsers
 * from offering to download it.
 *
 * `getFeaturedBooks()` is a `use cache` function with a committed snapshot
 * fallback, so this route prerenders and can never fail on a skills.sh outage.
 */

import { getFeaturedBooks } from "@/lib/featured";
import { siteLlmsTxt } from "@/lib/serialize";
import { absoluteUrl } from "@/lib/site";

export async function GET(): Promise<Response> {
  const featured = await getFeaturedBooks();
  const body = siteLlmsTxt({ featured });

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      "access-control-allow-origin": "*",
      "x-robots-tag": "all",
      link: [
        `<${absoluteUrl("/.well-known/agent-skills/index.json")}>; rel="agent-skills"`,
        `<${absoluteUrl("/.well-known/api-catalog")}>; rel="api-catalog"`,
        `<${absoluteUrl("/api/v1/openapi.json")}>; rel="service-desc"`,
      ].join(", "),
      "x-content-tokens": String(Math.ceil(body.length / 4)),
    },
  });
}
