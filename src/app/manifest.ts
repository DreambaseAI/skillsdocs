/**
 * `/manifest.webmanifest`
 *
 * A reading app should be installable. `display: minimal-ui` rather than
 * `standalone`: this is a document reader whose links go out to GitHub, and
 * stripping the URL bar from a page full of third-party links is a
 * transparency problem, not a polish win.
 *
 * Theme colours match the `themeColor` pair in the root layout's viewport
 * export — stone-50 and stone-900.
 */

import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: `${SITE_URL}/`,
    name: SITE_NAME,
    short_name: "Skills Book",
    description: SITE_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "minimal-ui",
    orientation: "any",
    background_color: "#fbfaf8",
    theme_color: "#1c1917",
    categories: ["books", "developer", "productivity", "reference"],
    lang: "en",
    dir: "ltr",
    // Square PNGs, not the OG card: an installer wants 192 and 512 and will
    // silently refuse to install without them. `maskable` carries extra padding
    // because launchers crop it to their own shape.
    icons: [
      { src: "/og/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/og/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/og/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
