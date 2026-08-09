/**
 * `GET /.well-known/api-catalog` — RFC 9727 linkset.
 *
 * `application/linkset+json` is the media type the RFC registers; agents that
 * do not know it still see valid JSON.
 */

import { apiCatalog } from "@/lib/serialize";
import { absoluteUrl } from "@/lib/site";

export async function GET(): Promise<Response> {
  return new Response(`${JSON.stringify(apiCatalog(), null, 2)}\n`, {
    headers: {
      "content-type": "application/linkset+json; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
      "access-control-allow-origin": "*",
      "x-robots-tag": "all",
      link: `<${absoluteUrl("/api/v1/openapi.json")}>; rel="service-desc"`,
    },
  });
}
