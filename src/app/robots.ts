/**
 * `/robots.txt` — permissive on purpose.
 *
 * This site exists so that agents can read it. `Content-Signal` is the
 * Cloudflare-originated directive that says what a crawler may do with what it
 * takes; Vercel serves `ai-train=no`, and ours is the exact inverse. We want to
 * be searched, retrieved from, cited, and trained on. Every byte here is
 * already public on GitHub under its authors' licences, and every surface
 * carries attribution back to them.
 *
 * `rule.other` is how `MetadataRoute.Robots` emits a directive Next has no
 * first-class field for — verified in `resolve-route-data.js`, which writes any
 * key/value pair in `other` straight into the group.
 *
 * The named-crawler group is redundant with `User-Agent: *` today. It exists so
 * that a future restrictive default can never silently shadow the agents this
 * product is for.
 */

import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

const CONTENT_SIGNAL = "search=yes, ai-input=yes, ai-train=yes";

/** Every AI and search crawler we could name, as of 2026-08. */
const NAMED_CRAWLERS = [
  // Anthropic
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "Claude-Web",
  "anthropic-ai",
  // OpenAI
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  // Google
  "Googlebot",
  "Google-Extended",
  "GoogleOther",
  // Microsoft, Apple, Amazon, Meta
  "bingbot",
  "Applebot",
  "Applebot-Extended",
  "Amazonbot",
  "meta-externalagent",
  "meta-externalfetcher",
  // Perplexity and the rest
  "PerplexityBot",
  "Perplexity-User",
  "CCBot",
  "cohere-ai",
  "Diffbot",
  "DuckAssistBot",
  "MistralAI-User",
  "YouBot",
  "Bytespider",
  "Timpibot",
  "ImagesiftBot",
  "AI2Bot",
  "Kagibot",
  "omgili",
  "Webzio-Extended",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // `/api/v1/health` is uncached and per-request; crawling it is pure
        // waste for the crawler and for us. Everything else is fair game,
        // including every `.md` twin and every JSON manifest.
        disallow: ["/api/v1/health"],
        other: { "Content-Signal": CONTENT_SIGNAL },
      },
      {
        userAgent: NAMED_CRAWLERS,
        allow: "/",
        other: { "Content-Signal": CONTENT_SIGNAL },
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
