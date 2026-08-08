/**
 * Parser coverage for the four `design.md` format families, the traps that
 * were found live, and the sanitisation boundary.
 *
 * Every fixture here is a reduction of a real document fetched during
 * research — vercel.com, resend.com, clerk.com, dreambase.com, linear.app and
 * the VoltAgent registry. Nothing is invented.
 */

import { describe, expect, it } from "vitest";
import {
  LIMITS,
  looksLikeMarkdown,
  parseDesignCss,
  parseDesignMarkdown,
  SAFE_COLOR,
  SAFE_FONT,
  SAFE_LEN,
  sanitizeColor,
  sanitizeFontFamily,
  sanitizeLength,
} from "./parse";

const hexes = (m: ReturnType<typeof parseDesignMarkdown>) =>
  m.colors.map((c) => c.hex);
const families = (m: ReturnType<typeof parseDesignMarkdown>) =>
  m.fonts.map((f) => f.family);

/* ------------------------------------------------------- format families */

describe("family A — YAML frontmatter", () => {
  // Reduced from https://dreambase.com/design.md, the richest live file.
  const DOC = `---
version: "alpha"
name: Dreambase
description: AI-native intelligence and agentic analytics.
colors:
  primary: "#00623A"
  accent: "#14EC77"
  background: "#171717"
  border: "oklch(0.2739 0.0055 286.03)"
typography:
  hero:
    fontFamily: Inter
  body-md:
    fontFamily: Geist
  mono:
    fontFamily: Geist Mono
rounded: { sm: 4px, md: 6px, lg: 10px }
---

# Dreambase
`;

  const manifest = parseDesignMarkdown(DOC, "https://dreambase.com/design.md");

  it("reads the eight-key frontmatter shape", () => {
    expect(manifest.ok).toBe(true);
    expect(manifest.format).toBe("frontmatter");
    expect(manifest.name).toBe("Dreambase");
  });

  it("takes every colour notation, including oklch", () => {
    expect(hexes(manifest)).toContain("#14ec77");
    expect(hexes(manifest)).toContain("#00623a");
    expect(manifest.colors.some((c) => c.raw.startsWith("oklch"))).toBe(true);
  });

  it("assigns font roles from the parent key, not the fontFamily key", () => {
    expect(manifest.fonts.find((f) => f.role === "display")?.family).toBe("Inter");
    expect(manifest.fonts.find((f) => f.role === "mono")?.family).toBe("Geist Mono");
  });

  it("takes the middle rung of a rounded scale", () => {
    expect(manifest.radiusPx).toBe(6);
  });
});

describe("family B — Stitch bold-name bullets", () => {
  // Reduced from the registry's spotify/DESIGN.md.
  const DOC = `# Design System Inspired by Spotify

## 2. Color Palette & Roles

### Primary Brand
- **Spotify Green** (\`#1ed760\`): Primary brand accent — play buttons, CTAs
- **Near Black** (\`#121212\`): Deepest background surface
`;

  const manifest = parseDesignMarkdown(DOC, "test://spotify");

  it("pulls the name out of the bold run and the hex out of the backticks", () => {
    expect(manifest.colors.map((c) => c.key)).toContain("spotify-green");
    expect(hexes(manifest)).toEqual(expect.arrayContaining(["#1ed760", "#121212"]));
  });

  it("keeps the trailing prose as usage", () => {
    const green = manifest.colors.find((c) => c.key === "spotify-green");
    expect(green?.usage).toMatch(/play buttons/);
  });
});

describe("family C — GFM tables", () => {
  // Reduced from https://clerk.com/design.md.
  const DOC = `# Clerk

| Token | Hex | Use |
|---|---|---|
| purple-400 | \`#9785ff\` | Hover state on light backgrounds |
| **purple-500** | **\`#6c47ff\`** | **Primary CTA, logomark, brand anchor** |

| Role | Family | CSS variable |
|---|---|---|
| Primary sans | Suisse Intl + Geist (numbers) | \`--font-sans\` |
| Monospace | Söhne Mono | \`--font-mono\` |
`;

  const manifest = parseDesignMarkdown(DOC, "https://clerk.com/design.md");

  it("takes the first cell as the name and the last as usage", () => {
    const p500 = manifest.colors.find((c) => c.key === "purple-500");
    expect(p500?.hex).toBe("#6c47ff");
    expect(p500?.usage).toMatch(/Primary CTA/);
  });

  it("reads the family from the column the header names, not column 1", () => {
    expect(families(manifest)).toContain("Suisse Intl");
    expect(families(manifest)).toContain("Söhne Mono");
    // "Primary sans" and "Monospace" are roles, not typefaces.
    expect(families(manifest)).not.toContain("Monospace");
  });

  it("infers the mono role from the surrounding cells", () => {
    expect(manifest.fonts.find((f) => f.family === "Söhne Mono")?.role).toBe("mono");
  });
});

describe("family C — Resend's `| Font | Role |` ordering", () => {
  // Reduced from resend-brand/SKILL.md, reached via the tree fallback.
  const DOC = `# Resend Brand Guidelines

| Font                       | Role                                    |
| -------------------------- | --------------------------------------- |
| **Domaine Display Narrow** | Display headlines (never in product UI) |
| **Favorit**                | Headings & titles                       |
| **Inter**                  | Body text                               |
| **CommitMono**             | Code                                    |

| Scale | Background  | Foreground  |
| ----- | ----------- | ----------- |
| Red   | \`#FF173F2D\` | \`#FF9592\`   |
`;

  const manifest = parseDesignMarkdown(DOC, "test://resend-brand");

  it("does not mistake the role column for a typeface", () => {
    expect(families(manifest)).toEqual(
      expect.arrayContaining(["Domaine Display Narrow", "Favorit", "Inter", "CommitMono"]),
    );
    expect(families(manifest)).not.toContain("Display headlines");
  });

  it("parses 8-digit hex with alpha", () => {
    const withAlpha = manifest.colors.find((c) => c.raw.toLowerCase() === "#ff173f2d");
    expect(withAlpha).toBeDefined();
    expect(withAlpha!.hex).toBe("#ff173f");
    expect(withAlpha!.alpha).toBeCloseTo(0x2d / 255, 3);
  });
});

describe("family D — pointer files", () => {
  // Verbatim shape of https://resend.com/design.md.
  const DOC = `# Resend Design

Resend's design and brand system — our logo, typography, colour palette and voice.

## Guidelines

- [Brand guidelines](https://github.com/resend/design-skills/blob/main/brand-guidelines/SKILL.md) — colours, typography, logo.
- [Design system](https://github.com/resend/design-skills/blob/main/design-system/SKILL.md) — component patterns.
`;

  const manifest = parseDesignMarkdown(DOC, "https://resend.com/design.md");

  it("yields no tokens but records the pointers", () => {
    expect(manifest.colors).toHaveLength(0);
    expect(manifest.format).toBe("pointer");
    expect(manifest.pointers.length).toBeGreaterThan(0);
    expect(manifest.pointers[0]).toContain("resend/design-skills");
  });
});

describe("family E — external stylesheet", () => {
  // Reduced from https://vercel.com/geist/vercel-brand.css (108,891 bytes).
  const CSS = `:root {
  --vbg-font-sans: var(--font-geist-sans, var(--font-sans, "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif));
  --vbg-font-mono: var(--font-geist-mono, var(--font-mono, "Geist Mono", "SFMono-Regular", Consolas, monospace));
  --vbg-background-100: light-dark(oklch(1 0 0), oklch(0 0 0));
  --vbg-blue-700: light-dark(oklch(57.61% 0.2508 258.23), oklch(57.61% 0.2321 258.23));
  --vbg-red-700: light-dark(oklch(62.56% 0.2524 23.03), oklch(62.56% 0.2234 23.03));
  --vbg-radius: 8px;
  --vbg-radius-small: 6px;
  --vbg-shadow-border: 0 0 0 1px rgba(0, 0, 0, 0.08);
}`;

  const manifest = parseDesignCss(CSS, "https://vercel.com/geist/vercel-brand.css");

  it("normalises the percent oklch dialect", () => {
    const blue = manifest.colors.find((c) => c.key === "vbg-blue-700" && c.scheme === "light");
    expect(blue).toBeDefined();
    // 57.61% must become 0.5761, not 57.61.
    expect(blue!.oklch.l).toBeCloseTo(0.5761, 3);
    expect(blue!.oklch.c).toBeCloseTo(0.2508, 3);
    expect(blue!.oklch.h).toBeCloseTo(258.23, 1);
  });

  it("splits light-dark() into two scheme-tagged tokens", () => {
    const both = manifest.colors.filter((c) => c.key === "vbg-red-700");
    expect(both.map((c) => c.scheme).sort()).toEqual(["dark", "light"]);
  });

  it("reads quoted families out of a var() chain instead of the literal 'var'", () => {
    expect(families(manifest)).toContain("Geist");
    expect(families(manifest)).toContain("Geist Mono");
    expect(families(manifest)).not.toContain("var");
  });

  it("binds the base radius, not a scale rung", () => {
    expect(manifest.radiusPx).toBe(8);
  });

  it("rejects shadow colours", () => {
    expect(manifest.colors.some((c) => c.key.includes("shadow"))).toBe(false);
  });
});

/* ------------------------------------------------------------- the traps */

describe("the linear.app SPA trap", () => {
  // linear.app/design.md answers HTTP 200 with the Linear application shell.
  const SHELL = `<!doctype html>
<html data-sw-cache="true"><head><title>Linear</title></head>
<body><div id="root"></div></body></html>`;

  it("rejects an HTML body regardless of status", () => {
    expect(looksLikeMarkdown(SHELL, "text/html; charset=utf-8")).toBe(false);
  });

  it("rejects an HTML body even when the content type lies", () => {
    expect(looksLikeMarkdown(SHELL, "text/markdown")).toBe(false);
  });

  it("rejects a markdown body served with a non-markdown content type", () => {
    const md = `# Brand\n\n${"Real markdown, well over the minimum length. ".repeat(3)}`;
    expect(looksLikeMarkdown(md, "text/html")).toBe(false);
    expect(looksLikeMarkdown(md, "text/markdown; charset=utf-8")).toBe(true);
    expect(looksLikeMarkdown(md, "text/plain")).toBe(true);
  });

  it("rejects a body too short to be a design document", () => {
    expect(looksLikeMarkdown("# Hi", "text/markdown")).toBe(false);
  });
});

describe("shadow and gridline colours are not brand colours", () => {
  it("drops them", () => {
    const manifest = parseDesignMarkdown(
      "# Brand\n\n```css\n:root { --brand: #ff0080; box-shadow: 0 0 0 rgba(0,0,0,.35); }\n```\n",
      "test://doc",
    );
    expect(hexes(manifest)).toEqual(["#ff0080"]);
  });
});

/* ------------------------------------------------------------ the caps */

describe("hard caps", () => {
  it("truncates to 64 colours and keeps the most chromatic", () => {
    const rows = Array.from({ length: 200 }, (_, i) => {
      const grey = (i % 200).toString(16).padStart(2, "0");
      return `| token-${i} | \`#${grey}${grey}${grey}\` | grey |`;
    });
    const doc = `# Brand\n\n| Token | Hex | Use |\n|---|---|---|\n| brand | \`#ff0080\` | anchor |\n${rows.join("\n")}\n`;
    const manifest = parseDesignMarkdown(doc, "test://big");

    expect(manifest.colors.length).toBeLessThanOrEqual(LIMITS.colors);
    expect(hexes(manifest)).toContain("#ff0080");
    expect(manifest.warnings.join(" ")).toMatch(/truncated/);
  });

  it("truncates to 8 fonts", () => {
    const rows = Array.from(
      { length: 30 },
      (_, i) => `| Family${i} | body |`,
    ).join("\n");
    const manifest = parseDesignMarkdown(
      `# Brand\n\n| Font | Role |\n|---|---|\n${rows}\n`,
      "test://fonts",
    );
    expect(manifest.fonts.length).toBeLessThanOrEqual(LIMITS.fonts);
  });
});

/* ----------------------------------------------------------- sanitisers */

describe("sanitisers", () => {
  it("accepts real token values", () => {
    expect(sanitizeColor("#6c47ff")).toBe("#6c47ff");
    expect(sanitizeColor("oklch(0.52 0.19 335)")).toBe("oklch(0.52 0.19 335)");
    expect(sanitizeColor("rgb(255 0 128 / 0.5)")).toBe("rgb(255 0 128 / 0.5)");
    expect(sanitizeLength("8px")).toBe("8px");
    expect(sanitizeLength("0.375rem")).toBe("0.375rem");
    expect(sanitizeFontFamily("Söhne Mono")).toBe("Söhne Mono");
  });

  it("rejects anything that could close a rule or open markup", () => {
    for (const hostile of [
      "red; } html { display: none } .x{color:red",
      "url(javascript:alert(1))",
      "expression(alert(1))",
      "</style><script>alert(1)</script>",
      "#fff /*",
      "@import url(//evil.example)",
      'oklch(1 0 0)"><script>',
    ]) {
      expect(sanitizeColor(hostile), hostile).toBeNull();
      expect(sanitizeLength(hostile), hostile).toBeNull();
      expect(sanitizeFontFamily(hostile), hostile).toBeNull();
    }
  });

  it("rejects a syntactically legal colour function that is not a colour", () => {
    // The pattern alone would pass this; the parser is the second gate.
    expect(sanitizeColor("rgb(expression)")).toBeNull();
  });

  it("caps value length", () => {
    expect(sanitizeColor(`#${"a".repeat(200)}`)).toBeNull();
    expect(sanitizeFontFamily("A".repeat(200))).toBeNull();
  });

  it("has patterns that never match a separator", () => {
    for (const ch of ["<", ">", "{", "}", ";", '"', "\\"]) {
      expect(SAFE_COLOR.test(`#fff${ch}`)).toBe(false);
      expect(SAFE_LEN.test(`8px${ch}`)).toBe(false);
      expect(SAFE_FONT.test(`Inter${ch}`)).toBe(false);
    }
  });
});

describe("a hostile design.md", () => {
  const HOSTILE = `---
name: "</style><script>alert(1)</script>"
colors:
  primary: "expression(alert(1))"
  accent: "url(javascript:alert(1))"
  brand: "#ff0080; } html { display: none } .x { color: red"
typography:
  hero:
    fontFamily: "Evil'; } body { display: none } .y { font-family: 'X"
  mono:
    fontFamily: "Geist Mono"
rounded: "999999px"
---

# Brand

\`\`\`css
:root {
  --accent: url("javascript:alert(1)");
  --safe: #14ec77;
}
\`\`\`
`;

  const manifest = parseDesignMarkdown(HOSTILE, "https://evil.example/design.md");

  it("keeps only values that are genuinely colours", () => {
    for (const c of manifest.colors) {
      expect(c.raw).toMatch(SAFE_COLOR);
      expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(hexes(manifest)).toContain("#14ec77");
  });

  it("drops a font family carrying a CSS payload", () => {
    expect(families(manifest)).not.toContain(
      "Evil'; } body { display: none } .y { font-family: 'X",
    );
    for (const f of manifest.fonts) expect(f.family).toMatch(SAFE_FONT);
    expect(families(manifest)).toContain("Geist Mono");
  });

  it("drops an absurd radius", () => {
    expect(manifest.radiusPx).toBeNull();
  });

  it("never yields a token containing markup", () => {
    const serialised = JSON.stringify({
      colors: manifest.colors.map((c) => [c.raw, c.hex]),
      fonts: families(manifest),
      radiusPx: manifest.radiusPx,
    });
    expect(serialised).not.toMatch(/<script|<\/style|javascript:|expression\(/i);
  });
});
