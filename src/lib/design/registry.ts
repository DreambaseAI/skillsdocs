/**
 * Curated brand seeds.
 *
 * These exist for one reason: 46% of brands publish an achromatic
 * `colors.primary` (Vercel `#171717`, Figma `#000000`, Resend `#fcfdff`), so
 * an automatic parse of their own `design.md` would produce a grey issue. Each
 * entry below is the most chromatic *brand* colour from that brand's own
 * published material, verified by hand.
 *
 * Keyed by GitHub owner login, lowercased.
 */
export interface CuratedSeed {
  /** The hue-bearing brand colour. */
  color: string;
  /** Brand's literal primary, used verbatim for the masthead only. */
  ink?: string;
  displayFont?: string;
  bodyFont?: string;
  monoFont?: string;
  radiusPx?: number;
  /** Site to probe for design.md when the GitHub `blog` field is wrong. */
  site?: string;
  /** Slug in VoltAgent/awesome-design-md, when it differs from the login. */
  registrySlug?: string;
}

export const CURATED: Record<string, CuratedSeed> = {
  anthropics: {
    color: "#cc785c",
    ink: "#191919",
    displayFont: "Fraunces",
    bodyFont: "Inter",
    registrySlug: "claude",
    site: "https://anthropic.com",
  },
  "vercel-labs": { color: "#ff0080", ink: "#171717", site: "https://vercel.com", registrySlug: "vercel" },
  vercel: { color: "#ff0080", ink: "#171717", registrySlug: "vercel" },
  dreambaseai: { color: "#14ec77", ink: "#00623a", site: "https://dreambase.com" },
  resend: { color: "#ff2047", ink: "#fcfdff" },
  clerk: { color: "#6c47ff" },
  supabase: { color: "#3ecf8e", ink: "#1c1c1c" },
  stripe: { color: "#635bff", site: "https://stripe.com" },
  openai: { color: "#10a37f", ink: "#000000" },
  microsoft: { color: "#0078d4" },
  google: { color: "#4285f4" },
  "google-gemini": { color: "#8e75ff" },
  cloudflare: { color: "#f6821f" },
  expo: { color: "#4630eb", ink: "#000020" },
  "remotion-dev": { color: "#0b84f3" },
  "shadcn-ui": { color: "#171717", registrySlug: "shadcn" },
  shadcn: { color: "#171717" },
  facebook: { color: "#087ea4", registrySlug: "react" },
  mattpocock: { color: "#3178c6", site: "https://totaltypescript.com" },
  obra: { color: "#7c3aed" },
  "langchain-ai": { color: "#1c3c3c" },
  "mastra-ai": { color: "#8a63d2" },
  firebase: { color: "#ffca28" },
  "better-auth": { color: "#0f0f0f" },
  "datadog-labs": { color: "#632ca6" },
  temporalio: { color: "#127cec" },
  prisma: { color: "#5a67d8" },
  posthog: { color: "#f54e00" },
  sentry: { color: "#362d59" },
  linear: { color: "#5e6ad2", registrySlug: "linear.app" },
  figma: { color: "#ff3d8b" },
  notion: { color: "#000000" },
  raycast: { color: "#ff5757" },
  cursor: { color: "#d14100" },
  framer: { color: "#0055ff" },
  netlify: { color: "#00c7b7" },
  auth0: { color: "#eb5424" },
  n8n: { color: "#ea4b71", registrySlug: "n8n" },
  "n8n-io": { color: "#ea4b71" },
  elevenlabs: { color: "#0f0f0f" },
  browserbase: { color: "#f5a623" },
  firecrawl: { color: "#f97316" },
  upstash: { color: "#00e9a3" },
  convex: { color: "#f3b01c" },
  "convex-dev": { color: "#f3b01c" },
  "drizzle-team": { color: "#c5f74f" },
  tanstack: { color: "#ff4154" },
  sveltejs: { color: "#ff3e00" },
  wix: { color: "#116dff" },
  flutter: { color: "#027dfd" },
  github: { color: "#8250df" },
  aws: { color: "#ff9900" },
  "hashicorp": { color: "#a737ff" },
  "e2b-dev": { color: "#ff8800" },
  "dbt-labs": { color: "#ff694a" },
  langfuse: { color: "#e11312" },
  "skills-collective": { color: "#22c55e" },
  "vercel-labs-agent-browser": { color: "#ff0080" },
};

/** Base URL for the community DESIGN.md registry (MIT, 74 brands). */
export const REGISTRY_RAW =
  "https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md";

export function curatedFor(owner: string): CuratedSeed | null {
  return CURATED[owner.toLowerCase()] ?? null;
}
