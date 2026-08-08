/**
 * Live probe: resolve design.md for real owners and audit the derived theme.
 *
 *   pnpm probe:design            # default sample
 *   pnpm probe:design vercel ... # specific owners
 */

import { parseDesignMarkdown } from "../src/lib/design/parse";
import { auditIssueTheme, deriveIssueTheme, PAPER } from "../src/lib/design/theme";
import { resolveDesignManifest } from "../src/lib/design/fetch";
import { contrastRatio, parseColor } from "../src/lib/color";
import { WCAG } from "../src/lib/color";

const SAMPLE = [
  ["DreambaseAI", "https://dreambase.com"],
  ["vercel-labs", "https://vercel.com"],
  ["resend", "https://resend.com"],
  ["clerk", "https://clerk.com"],
  ["linear", "https://linear.app"], // the SPA-shell trap
  ["anthropics", "https://anthropic.com"],
  ["supabase", "https://supabase.com"],
  ["mattpocock", "https://totaltypescript.com"],
  ["obra", null],
  ["some-unknown-org-xyz", null], // must still theme via name hash
] as const;

const pad = (s: string, n: number) => s.padEnd(n);
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;

let failures = 0;

const targets: ReadonlyArray<readonly [string, string | null]> =
  process.argv.slice(2).length
    ? process.argv.slice(2).map((o) => [o, null] as const)
    : SAMPLE;

console.log(
  `\n${pad("owner", 22)}${pad("origin", 12)}${pad("format", 12)}${pad("colors", 7)}${pad("hue", 7)}${pad("light", 8)}${pad("dark", 8)}fonts`,
);
console.log("─".repeat(96));

for (const [owner, site] of targets) {
  const manifest = await resolveDesignManifest({ owner, site });
  const theme = deriveIssueTheme(owner, manifest);
  const audit = auditIssueTheme(theme);

  const okLight = audit.light >= WCAG.AA_TEXT;
  const okDark = audit.dark >= WCAG.AA_TEXT;
  const okHc = audit.lightHc >= WCAG.AAA_TEXT && audit.darkHc >= WCAG.AAA_TEXT;
  const chartsOk = [...audit.chartLight, ...audit.chartDark].every(
    (r) => r >= WCAG.AA_NON_TEXT,
  );
  if (!okLight || !okDark || !okHc || !chartsOk) failures++;

  console.log(
    pad(owner, 22) +
      pad(manifest.origin, 12) +
      pad(manifest.format, 12) +
      pad(String(manifest.colors.length), 7) +
      pad(String(Math.round(theme.hue)), 7) +
      pad((okLight ? G : R)(audit.light.toFixed(2)), 17) +
      pad((okDark ? G : R)(audit.dark.toFixed(2)), 17) +
      D(
        [theme.displayFont, theme.bodyFont, theme.monoFont]
          .filter(Boolean)
          .join(" / ") || "—",
      ),
  );
  console.log(
    D(
      `  ${theme.accentLight} / ${theme.accentDark}   hc ${audit.lightHc.toFixed(1)}·${audit.darkHc.toFixed(1)}` +
        `   charts ${audit.chartLight.map((r) => r.toFixed(1)).join(" ")} | ${audit.chartDark.map((r) => r.toFixed(1)).join(" ")}` +
        (manifest.sourceUrl ? `\n  ${manifest.sourceUrl}` : "") +
        (manifest.voice.words.length ? `\n  voice: ${manifest.voice.words.join(", ")}` : ""),
    ),
  );
}

/* A hue sweep is the real proof: every possible brand must be readable. */
console.log("\n\x1b[1mFull hue sweep (all 360 hues at max chroma)\x1b[0m");
let worstLight = Infinity;
let worstDark = Infinity;
let worstHueL = 0;
let worstHueD = 0;
for (let h = 0; h < 360; h++) {
  const theme = deriveIssueTheme("sweep", {
    ok: true,
    origin: "curated",
    sourceUrl: null,
    format: "frontmatter",
    name: null,
    description: null,
    colors: [
      {
        name: "brand",
        key: "brand",
        raw: "",
        hex: "#000000",
        alpha: 1,
        oklch: { l: 0.6, c: 0.19, h, alpha: 1 },
        role: "accent",
        usage: null,
        scheme: null,
        source: "frontmatter",
        confidence: 1,
      },
    ],
    fonts: [],
    radiusPx: null,
    voice: { words: [], quotes: [], summary: null },
    pointers: [],
    warnings: [],
  });
  const l = contrastRatio(parseColor(theme.accentLight)!, PAPER.light);
  const d = contrastRatio(parseColor(theme.accentDark)!, PAPER.dark);
  if (l < worstLight) [worstLight, worstHueL] = [l, h];
  if (d < worstDark) [worstDark, worstHueD] = [d, h];
}
const sweepOk = worstLight >= WCAG.AA_TEXT && worstDark >= WCAG.AA_TEXT;
if (!sweepOk) failures++;
console.log(
  `  worst light ${(worstLight >= 4.5 ? G : R)(worstLight.toFixed(3))} at hue ${worstHueL}` +
    `   worst dark ${(worstDark >= 4.5 ? G : R)(worstDark.toFixed(3))} at hue ${worstHueD}`,
);

/* Parser unit check against a synthetic doc of each family. */
console.log("\n\x1b[1mFormat family parsing\x1b[0m");
const FAMILIES: Array<[string, string]> = [
  [
    "A frontmatter",
    `---\nname: Acme\ncolors:\n  primary: "#171717"\n  accent: "#14EC77"\ntypography:\n  hero:\n    fontFamily: Inter\n  mono:\n    fontFamily: Geist Mono\nrounded: 8px\n---\n# Acme\n`,
  ],
  ["B bullets", `# Brand\n\n- **Spotify Green** (\`#1ed760\`): Primary brand accent\n- **Ink** (\`#121212\`): Body copy\n`],
  ["C tables", `# Brand\n\n| Token | Value | Usage |\n|---|---|---|\n| Purple | \`#6c47ff\` | Primary CTA |\n| Ink | \`#1a1a1a\` | Text |\n`],
  ["E css fence", "# Brand\n\n```css\n:root {\n  --brand-pink: #ff0080;\n  --radius: 8px;\n  font-family: Geist, sans-serif;\n}\n```\n"],
  ["light-dark()", "# Brand\n\n```css\n:root { --accent: light-dark(#0055ff, #66a3ff); }\n```\n"],
  ["shadow rejection", "# Brand\n\n```css\n:root { --brand: #ff0080; box-shadow: 0 0 0 rgba(0,0,0,.35); }\n```\n"],
];
for (const [label, doc] of FAMILIES) {
  const m = parseDesignMarkdown(doc, "test://doc");
  console.log(
    `  ${pad(label, 20)} format=${pad(m.format, 12)} colors=${pad(String(m.colors.length), 4)} ` +
      `radius=${pad(String(m.radiusPx), 6)} fonts=${m.fonts.map((f) => `${f.family}(${f.role})`).join(",") || "—"}`,
  );
  console.log(D(`      ${m.colors.map((c) => `${c.key}=${c.hex}${c.scheme ? `@${c.scheme}` : ""}`).join(" ")}`));
}

console.log(
  failures === 0
    ? `\n${G("PASS")} — every owner themed, every accent meets AA, sweep clean.\n`
    : `\n${R(`FAIL — ${failures} contrast problem(s).`)}\n`,
);
process.exit(failures === 0 ? 0 : 1);
