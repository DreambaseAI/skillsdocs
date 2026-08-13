/**
 * Theme derivation: the contrast guarantees, the achromatic-primary rescue,
 * brand-font resolution, and the CSS emission boundary.
 *
 * The lightness constants are settled maths (see the module comment in
 * `theme.ts`); these tests exist so a future chroma tweak cannot quietly
 * regress them.
 */

import { describe, expect, it, vi } from "vitest";
import { contrastRatio, parseColor, WCAG, type Oklch } from "../color";
import { parseDesignMarkdown } from "./parse";
import { CURATED } from "./registry";
import {
  auditIssueTheme,
  BRAND_FONT_SUBSTITUTIONS,
  deriveIssueTheme,
  issueScope,
  issueSelector,
  issueThemeCss,
  PAPER,
  resolveBrandFont,
  seedFromColors,
  SHIPPED_FACES,
} from "./theme";
import type { DesignManifest, IssueTheme } from "./types";

/**
 * `next/font/google` is a build-time loader: outside a Next compilation its
 * exports throw. `lib/fonts.ts` calls fifteen of them at module scope, which
 * is precisely why `theme.ts` mirrors the catalogue instead of importing it.
 * Stub them so the parity check below can still read the real data.
 */
vi.mock("next/font/google", () => {
  const face = () => ({ variable: "--stub", className: "stub", style: {} });
  const names = [
    "Atkinson_Hyperlegible_Mono", "Atkinson_Hyperlegible_Next", "Crimson_Pro",
    "EB_Garamond", "Fraunces", "Geist", "Geist_Mono", "Instrument_Serif",
    "Inter", "JetBrains_Mono", "Literata", "Lora", "Newsreader", "Public_Sans",
    "Source_Serif_4",
  ];
  return Object.fromEntries(names.map((n) => [n, face]));
});

function manifestOf(source: string): DesignManifest {
  return parseDesignMarkdown(source, "test://doc");
}

function emptyManifest(over: Partial<DesignManifest> = {}): DesignManifest {
  return {
    ok: true,
    origin: "curated",
    sourceUrl: null,
    format: "frontmatter",
    name: null,
    description: null,
    colors: [],
    fonts: [],
    radiusPx: null,
    voice: { words: [], quotes: [], summary: null },
    pointers: [],
    warnings: [],
    ...over,
  };
}

function hueManifest(h: number, c: number): DesignManifest {
  return emptyManifest({
    colors: [
      {
        name: "brand",
        key: "brand",
        raw: "",
        hex: "#000000",
        alpha: 1,
        oklch: { l: 0.6, c, h, alpha: 1 },
        role: "accent",
        usage: null,
        scheme: null,
        source: "frontmatter",
        confidence: 1,
      },
    ],
  });
}

const ratio = (color: string, paper: Oklch) => contrastRatio(parseColor(color)!, paper);

function expectValid(theme: IssueTheme, label: string) {
  const audit = auditIssueTheme(theme);
  expect(audit.light, `${label} light`).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
  expect(audit.dark, `${label} dark`).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
  expect(audit.lightHc, `${label} light HC`).toBeGreaterThanOrEqual(WCAG.AAA_TEXT);
  expect(audit.darkHc, `${label} dark HC`).toBeGreaterThanOrEqual(WCAG.AAA_TEXT);
  for (const r of audit.chartLight) {
    expect(r, `${label} chart light`).toBeGreaterThanOrEqual(WCAG.AA_NON_TEXT);
  }
  for (const r of audit.chartDark) {
    expect(r, `${label} chart dark`).toBeGreaterThanOrEqual(WCAG.AA_NON_TEXT);
  }
  expect(theme.hue).toBeGreaterThanOrEqual(0);
  expect(theme.hue).toBeLessThan(360);
  expect(theme.chroma).toBeLessThanOrEqual(0.19);
}

/* ---------------------------------------------------- the contrast floor */

describe("the 360-hue sweep", () => {
  it("clears AA on both papers at every hue and every seed chroma", () => {
    let worstLight = { r: Infinity, h: 0 };
    let worstDark = { r: Infinity, h: 0 };

    for (const chroma of [0.05, 0.12, 0.19, 0.3]) {
      for (let h = 0; h < 360; h++) {
        const theme = deriveIssueTheme("sweep", hueManifest(h, chroma));
        const l = ratio(theme.accentLight, PAPER.light);
        const d = ratio(theme.accentDark, PAPER.dark);
        if (l < worstLight.r) worstLight = { r: l, h };
        if (d < worstDark.r) worstDark = { r: d, h };
      }
    }

    // Research measured 4.92:1 worst-case light (binding at hue 144) and
    // 6.73:1 dark. Anything materially below means a constant moved.
    expect(worstLight.r).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
    expect(worstDark.r).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
    expect(worstLight.h).toBeGreaterThan(120);
    expect(worstLight.h).toBeLessThan(170);
  });

  it("clears AAA in high contrast at every hue", () => {
    for (let h = 0; h < 360; h += 3) {
      const theme = deriveIssueTheme("sweep", hueManifest(h, 0.19));
      expect(ratio(theme.accentLightHc, PAPER.lightHc)).toBeGreaterThanOrEqual(
        WCAG.AAA_TEXT,
      );
      expect(ratio(theme.accentDarkHc, PAPER.darkHc)).toBeGreaterThanOrEqual(
        WCAG.AAA_TEXT,
      );
    }
  });
});

/* -------------------------------------------- the achromatic-primary trap */

describe("achromatic-primary rescue", () => {
  // Vercel publishes primary #171717 — black. 46% of the registry does this.
  const VERCEL = manifestOf(`---
name: Vercel
colors:
  primary: "#171717"
  background: "#ffffff"
  highlight-pink: "#ff0080"
---

# Vercel
`);

  it("seeds the hue from the most chromatic token, never from primary", () => {
    const seed = seedFromColors(VERCEL.colors);
    expect(seed).not.toBeNull();
    // #ff0080 sits near hue 0/360 in OKLCH; #171717 has no hue at all.
    expect(seed!.c).toBeGreaterThan(0.2);
  });

  it("keeps the brand's own primary as the masthead ink", () => {
    const theme = deriveIssueTheme("vercel", VERCEL);
    expect(theme.ink).toBe("#171717");
    expect(theme.accentLight).not.toContain("0 0"); // not grey
    expectValid(theme, "vercel");
  });

  it("does not let a semantic status colour become the brand", () => {
    const doc = manifestOf(`---
colors:
  primary: "#000000"
  danger: "#ff0000"
  brand: "#6c47ff"
---
# X
`);
    const seed = seedFromColors(doc.colors);
    // Purple wins over red even though red is more chromatic in OKLCH terms.
    expect(seed!.h).toBeGreaterThan(250);
    expect(seed!.h).toBeLessThan(320);
  });

  it("falls back to a stable name hash when nothing is chromatic", () => {
    const grey = manifestOf(`---
colors:
  primary: "#000000"
  background: "#ffffff"
---
# X
`);
    const a = deriveIssueTheme("some-unknown-org-xyz", grey);
    const b = deriveIssueTheme("some-unknown-org-xyz", grey);
    expect(a.hue).toBe(b.hue);
    expect(deriveIssueTheme("другой", grey).hue).not.toBe(a.hue);
    expectValid(a, "name-hash");
  });

  it("never throws on a null manifest", () => {
    expectValid(deriveIssueTheme("nobody", null), "null manifest");
  });
});

/* ------------------------------------------------------------ the corpus */

/**
 * Every owner in the verified seed catalogue (docs/research/skills-repos.md
 * §5). Derived offline from the name hash, which is the terminal tier and the
 * one that must never produce an unreadable issue.
 */
const SEED_OWNERS = [
  "ClickHouse", "Convex-Dev", "DreambaseAI", "PostHog", "Shopify", "WordPress",
  "addyosmani", "antfu", "anthropics", "apify", "apollographql", "auth0", "aws",
  "base", "better-auth", "bitwarden", "box", "browser-use", "browserbase",
  "clerk", "cloudflare", "coinbase", "contentful", "dagster-io", "datadog-labs",
  "deepgram", "denoland", "elevenlabs", "emilkowalski", "encoredev", "expo",
  "firebase", "firecrawl", "flutter", "get-convex", "getsentry", "github",
  "google-gemini", "google-labs-code", "googleworkspace", "greensock",
  "hashicorp", "heygen-com", "huggingface", "kepano", "langchain-ai",
  "launchdarkly", "mapbox", "mastra-ai", "mattpocock", "medusajs", "microsoft",
  "mongodb", "n8n-io", "neondatabase", "nuxt", "obra", "openai", "parallel-web",
  "pbakaus", "pinecone-io", "prisma", "react", "remotion-dev", "resend",
  "runcomfy-com", "sanity-io", "semgrep", "shadcn-ui", "stripe", "supabase",
  "sveltejs", "tavily-ai", "temporalio", "tldraw", "triggerdotdev", "upstash",
  "vercel", "vercel-labs", "webflow", "wix", "wshobson",
];

describe("the seed corpus", () => {
  it("derives a valid theme for every seed owner with no design.md at all", () => {
    for (const owner of SEED_OWNERS) {
      expectValid(deriveIssueTheme(owner, null), owner);
    }
  });

  it("derives a valid theme for every curated brand seed", () => {
    for (const [owner, seed] of Object.entries(CURATED)) {
      const color = parseColor(seed.color)!;
      const theme = deriveIssueTheme(
        owner,
        emptyManifest({
          colors: [
            {
              name: "brand",
              key: "brand",
              raw: seed.color,
              hex: seed.color,
              alpha: 1,
              oklch: color,
              role: "accent",
              usage: null,
              scheme: null,
              source: "frontmatter",
              confidence: 1.5,
            },
          ],
        }),
      );
      expectValid(theme, owner);
    }
  });

  it("covers every seed owner plus the curated map", () => {
    // Guards against the list silently shrinking in a refactor.
    expect(SEED_OWNERS.length).toBeGreaterThanOrEqual(80);
    expect(Object.keys(CURATED).length).toBeGreaterThanOrEqual(50);
  });
});

/* ------------------------------------------------------------ brand fonts */

describe("brand font resolution", () => {
  it("matches a shipped face exactly", () => {
    expect(resolveBrandFont("Geist Mono")).toMatchObject({
      id: "geist-mono",
      kind: "exact",
      note: null,
    });
    expect(resolveBrandFont("inter")?.id).toBe("inter");
  });

  it("substitutes the proprietary families the real corpus uses", () => {
    expect(resolveBrandFont("Copernicus")?.id).toBe("newsreader");
    expect(resolveBrandFont("Suisse Intl")?.id).toBe("inter");
    expect(resolveBrandFont("Domaine Display Narrow")?.id).toBe("fraunces");
    expect(resolveBrandFont("CommitMono")?.id).toBe("jetbrains-mono");
  });

  it("prefers the longest substitution key", () => {
    expect(resolveBrandFont("Söhne")?.id).toBe("inter");
    expect(resolveBrandFont("Söhne Mono")?.id).toBe("jetbrains-mono");
  });

  it("finds a family inside a brand-prefixed name", () => {
    // Resend writes "Resend Favorit" in its typography scale.
    expect(resolveBrandFont("Resend Favorit")?.id).toBe("inter");
  });

  it("strips style qualifiers before matching", () => {
    expect(resolveBrandFont("Inter Variable")?.id).toBe("inter");
    expect(resolveBrandFont("Tiempos Text")?.id).toBe("newsreader");
  });

  it("reports an unavailable family rather than guessing", () => {
    const linear = resolveBrandFont("Linear Display");
    expect(linear).toMatchObject({ id: null, kind: "unavailable" });
    expect(linear!.note).toMatch(/Linear Display/);
  });

  it("carries a colophon note whenever the rendered face is not the requested one", () => {
    for (const family of ["Copernicus", "Söhne Mono", "Favorit"]) {
      const r = resolveBrandFont(family)!;
      expect(r.kind).toBe("substituted");
      expect(r.note).toContain(family);
    }
  });

  it("refuses a family carrying CSS", () => {
    expect(resolveBrandFont('Evil"; } html { display:none } .x{font-family:"')).toBeNull();
    expect(resolveBrandFont("url(javascript:alert(1))")).toBeNull();
  });

  it("mirrors lib/fonts.ts exactly", async () => {
    const fonts = await import("../fonts");

    const mine = [...SHIPPED_FACES]
      .map((f) => `${f.id}|${f.label}|${f.cssVar}|${f.fallback}`)
      .sort();
    const theirs = fonts.ALL_FONTS.map(
      (f) => `${f.id}|${f.label}|${f.cssVar}|${f.fallback}`,
    ).sort();
    expect(mine).toEqual(theirs);

    expect(BRAND_FONT_SUBSTITUTIONS).toEqual(fonts.FONT_SUBSTITUTIONS);

    // Every substitution target must actually be a face we ship.
    for (const id of Object.values(BRAND_FONT_SUBSTITUTIONS)) {
      expect(fonts.fontById(id), id).toBeDefined();
    }
  });
});

/* ----------------------------------------------------- the CSS boundary */

describe("issueSelector", () => {
  it("slugifies an owner login", () => {
    expect(issueSelector("DreambaseAI")).toBe('[data-issue="dreambaseai"]');
    expect(issueSelector("vercel-labs")).toBe('[data-issue="vercel-labs"]');
  });

  it("neutralises an owner that is trying to author CSS", () => {
    const hostile = 'x"]{}html{display:none}[y="';
    expect(issueSelector(hostile)).toBe('[data-issue="xhtmldisplaynoney"]');
    expect(issueSelector(hostile)).not.toContain("{");
  });

  it("never produces an empty attribute value", () => {
    expect(issueSelector("<<<>>>")).toBe('[data-issue="unknown"]');
  });
});

describe("issueScope", () => {
  it("slugifies a full name and pins the selector to its own style element", () => {
    const scope = issueScope("kylezantos/design-motion-principles");
    expect(scope.key).toBe("kylezantos-design-motion-principles");
    expect(scope.selector).toBe(
      '.book-issue:has(style[data-issue-scope="kylezantos-design-motion-principles"])',
    );
  });

  it("neutralises a hostile full name and never emits an empty key", () => {
    const hostile = issueScope('x"]{}html{display:none}[y="/repo');
    expect(hostile.key).not.toMatch(/[^a-z0-9-]/);
    expect(hostile.selector).not.toContain("{");
    expect(issueScope("///").key).toBe("unknown");
  });

  it("stays inside issueThemeCss's selector budget", () => {
    const long = issueScope(`${"a".repeat(60)}/${"b".repeat(60)}`);
    expect(long.selector.length).toBeLessThanOrEqual(96);
  });
});

describe("issueThemeCss", () => {
  const theme = deriveIssueTheme(
    "acme",
    manifestOf(`---
name: Acme
colors:
  primary: "#171717"
  accent: "#6c47ff"
typography:
  hero:
    fontFamily: Fraunces
rounded: 8px
---
# Acme
`),
  );
  const css = issueThemeCss(theme, issueSelector("acme"));

  it("emits the issue tokens for both schemes and high contrast", () => {
    expect(css).toContain('[data-issue="acme"]{');
    expect(css).toContain("--issue-accent:");
    expect(css).toContain("--issue-chart-5:");
    expect(css).toContain('.dark [data-issue="acme"]');
    expect(css).toContain('[data-contrast="high"]');
    expect(css).toContain("--radius:0.5rem;");
  });

  it("emits a font variable we declared, never the brand's own string", () => {
    expect(css).toContain("--display-font-family:var(--font-fraunces)");
    expect(css).not.toContain("fonts.googleapis.com");
    expect(css).not.toContain("@font-face");
    expect(css).not.toContain("@import");
  });

  it("balances its braces", () => {
    expect(css.split("{")).toHaveLength(css.split("}").length);
    expect(css).not.toMatch(/\{[^{}]*\{/);
  });

  it("stays far inside the 32 KB cap", () => {
    expect(css.length).toBeLessThan(4096);
  });

  it("refuses a selector it did not build", () => {
    expect(issueThemeCss(theme, "[data-issue=x]{}html{display:none}")).toBe("");
    expect(issueThemeCss(theme, "@media print")).toBe("");
    expect(issueThemeCss(theme, "</style><script>")).toBe("");
  });

  it("accepts the per-instance :has() scope", () => {
    const scope = issueScope("TanStack/tanstack.com");
    const scoped = issueThemeCss(theme, scope.selector);
    expect(scoped).toContain(
      '.book-issue:has(style[data-issue-scope="tanstack-tanstack-com"]){',
    );
    expect(scoped).toContain(
      '.dark .book-issue:has(style[data-issue-scope="tanstack-tanstack-com"])',
    );
  });

  it("drops any token value that is not a colour", () => {
    const poisoned: IssueTheme = {
      ...theme,
      accentLight: "red; } html { display: none } .x { color: red",
      accentDark: "url(javascript:alert(1))",
      accentForegroundLight: "expression(alert(1))",
      ink: "</style><script>alert(1)</script>",
      chartLight: ["#14ec77", "@import url(//evil.example)", "oklch(0.5 0.1 20)"],
      radiusPx: 999999,
    };
    const out = issueThemeCss(poisoned, issueSelector("acme"));

    expect(out).not.toMatch(/<script|<\/style|javascript:|expression\(|@import/i);
    expect(out).not.toContain("display: none");
    expect(out).not.toContain("--radius:");
    // The values that were genuinely colours survive.
    expect(out).toContain("#14ec77");
    expect(out.split("{")).toHaveLength(out.split("}").length);
  });
});

/* ------------------------------------------------- end-to-end injection */

describe("a hostile design.md cannot reach the stylesheet", () => {
  const HOSTILE = `---
name: Evil
colors:
  primary: "</style><script>alert('xss')</script>"
  accent: "expression(alert(1))"
  brand: "url(javascript:alert(1))"
  real: "#14ec77"
typography:
  hero:
    fontFamily: "Evil'; } html { display: none } .x { font-family: 'Inter"
  mono:
    fontFamily: "Geist Mono"
rounded: "8px; } html { display: none } .y {"
---

# Evil

\`\`\`css
:root {
  --x: </style><script>alert(2)</script>;
  --y: #ff0080;
}
\`\`\`

[tokens](https://evil.example/design-tokens.css)
`;

  const theme = deriveIssueTheme("evil-corp", parseDesignMarkdown(HOSTILE, "test://evil"));
  const css = issueThemeCss(theme, issueSelector("evil-corp"));

  it("produces a usable, readable theme anyway", () => {
    expectValid(theme, "evil-corp");
    expect(css.length).toBeGreaterThan(0);
  });

  it("lets no markup, script, url() or expression() through", () => {
    for (const payload of [
      "<script",
      "</style",
      "javascript:",
      "expression(",
      "url(",
      "@import",
      "display: none",
      "display:none",
      "/*",
    ]) {
      expect(css.toLowerCase(), payload).not.toContain(payload.toLowerCase());
    }
  });

  it("emits only custom properties inside every block", () => {
    for (const body of css.matchAll(/\{([^{}]*)\}/g)) {
      for (const decl of body[1].split(";").filter(Boolean)) {
        expect(decl).toMatch(/^--[a-z-]+[0-9]?:/);
      }
    }
  });

  it("never emits a font family the document authored", () => {
    expect(css).not.toContain("Evil");
    // Geist Mono is legitimate and shipped, but display is what gets emitted.
    expect(theme.fontResolution?.mono?.id).toBe("geist-mono");
  });
});
