import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components: static shells prerender, dynamic work streams in, and
  // `use cache` / `cacheLife` / `cacheTag` become available.
  cacheComponents: true,
  partialPrefetching: true,

  cacheLife: {
    // A repo's skills change on the order of days; stars and install counts
    // move faster but are decorative. Serve stale freely, refresh every six
    // hours — the `REVALIDATE` intent in `lib/github.ts`. (This was 3600 for a
    // while, which silently tripled the steady-state GitHub API spend.)
    repo: { stale: 300, revalidate: 21_600, expire: 259_200 },
    // The skills.sh leaderboard is scraped from an undocumented payload.
    leaderboard: { stale: 600, revalidate: 3600, expire: 172_800 },
    // design.md is effectively static.
    design: { stale: 3600, revalidate: 86_400, expire: 604_800 },
    // "Does this repo exist?" — the negative-result cache behind
    // `lib/upstream.ts`. Short on purpose: a repository that appears should
    // start working within minutes, and a crawler walking made-up paths should
    // still cost one upstream call per five minutes rather than one per hit.
    probe: { stale: 60, revalidate: 300, expire: 3600 },
  },

  images: {
    // Owner avatars, and nothing else, at 28–32 CSS px. Measured: the
    // optimizer returns 528 B of WebP against 7,278 B straight from GitHub's
    // CDN — 13.8x smaller — so it stays. What did not make sense was the 4-hour
    // default TTL: the homepage carries 93 avatars, so every returning visitor
    // past four hours paid 93 revalidation round-trips for images whose URLs
    // already carry GitHub's own `?v=` cache-buster. Thirty days.
    minimumCacheTTL: 2_592_000,
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    // Profile avatars arrive from whichever OAuth provider signed the
    // reader in.
    { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "github.com" },
      { protocol: "https", hostname: "raw.githubusercontent.com" },
      { protocol: "https", hostname: "user-images.githubusercontent.com" },
      { protocol: "https", hostname: "camo.githubusercontent.com" },
    ],
  },

  /**
   * `Vary: Accept` on the HTML half of the content negotiation.
   *
   * `/{owner}/{repo}` serves HTML or Markdown off one URL depending on
   * `Accept`, and only the Markdown branch declared it — a shared cache that
   * stored the HTML first would serve HTML to every later
   * `Accept: text/markdown` request for the life of the `s-maxage=3600` entry.
   * The proxy cannot fix it alone: Next rewrites `Vary` on app-router
   * responses after the proxy has run, so a value set on `NextResponse.next()`
   * is discarded. A `headers()` rule is applied later and survives.
   *
   * MEASURED CAVEAT: under `next start` this rule is *also* discarded — the
   * app-router response sets `Vary` last, and wins. It is kept because on a
   * CDN-backed deploy (Vercel and anything else that reads
   * `.next/routes-manifest.json`) `headers()` is applied at the edge, ahead of
   * the render, where nothing downstream rewrites it. Verify on the real
   * deploy with `curl -sI <origin>/anthropics/skills | grep -i vary`; if the
   * platform does not apply it either, the `.md` URL is canonical and the
   * negotiated HTML URL must be excluded from the shared cache instead.
   *
   * The `source` patterns exclude anything with a dot in the first segment, so
   * `llms.txt`, `favicon.ico` and static assets are untouched, and exclude the
   * reserved first segments that are not owners.
   */
  async headers() {
    // Segment-anchored: the alternative must be followed by `/` or the end of
    // the path, so a real owner merely *starting* with a reserved word
    // (`sharepoint`, `searchkit`) still gets its Vary header.
    const NOT_OWNER =
      "(?:api|_next|search|share|bookmarks|library|llms\\.txt|sitemap\\.xml|robots\\.txt)(?:/|$)";
    const vary = [{ key: "Vary", value: "Accept" }];
    return [
      {
        source: `/:owner((?!${NOT_OWNER})[^/.]+)/:repo([^/]+)`,
        headers: vary,
      },
      {
        source: `/:owner((?!${NOT_OWNER})[^/.]+)/:repo([^/]+)/:skill([^/]+)`,
        headers: vary,
      },
    ];
  },

  // Skill docs are third-party content; keep the surface tight.
  poweredByHeader: false,
};

export default nextConfig;
