import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components: static shells prerender, dynamic work streams in, and
  // `use cache` / `cacheLife` / `cacheTag` become available.
  cacheComponents: true,
  partialPrefetching: true,

  cacheLife: {
    // A repo's skills change on the order of days; stars and install counts
    // move faster but are decorative. Serve stale freely, refresh hourly.
    repo: { stale: 300, revalidate: 3600, expire: 86_400 },
    // The skills.sh leaderboard is scraped from an undocumented payload.
    leaderboard: { stale: 600, revalidate: 3600, expire: 172_800 },
    // design.md is effectively static.
    design: { stale: 3600, revalidate: 86_400, expire: 604_800 },
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "github.com" },
      { protocol: "https", hostname: "raw.githubusercontent.com" },
      { protocol: "https", hostname: "user-images.githubusercontent.com" },
      { protocol: "https", hostname: "camo.githubusercontent.com" },
    ],
  },

  // Skill docs are third-party content; keep the surface tight.
  poweredByHeader: false,
};

export default nextConfig;
