/**
 * Pipeline tests.
 *
 * The security cases here are the reason the plugin order in `markdown.ts` is
 * documented as load-bearing: each of them fails loudly if someone reorders
 * sanitize, slug or Shiki, or "just adds `style` to the schema".
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import type { Root } from "hast";
import { renderMarkdown, stripFrontmatter, type MarkdownContext } from "./markdown";
import { contrastRatio, parseColor } from "./color";
import {
  PRELOADED_LANGS,
  SHIKI_THEMES,
  getHighlighter,
  isKnownLanguage,
} from "./markdown/highlighter";
import { joinPath } from "./markdown/links";

const CTX: MarkdownContext = {
  owner: "acme",
  repo: "skills",
  ref: "main",
  baseDir: "skills/demo",
};

/**
 * Serialise through the same React path the app uses, so these assertions
 * cover `toJsxRuntime` too — a tree that is clean but renders dirty is still a
 * bug, and a separate HTML serializer would not catch it.
 */
function toMarkup(tree: Root): string {
  return renderToStaticMarkup(toJsxRuntime(tree, { Fragment, jsx, jsxs }));
}

async function render(source: string, ctx: Partial<MarkdownContext> = {}) {
  const out = await renderMarkdown(source, { ...CTX, ...ctx });
  return { ...out, html: toMarkup(out.tree) };
}

/* --------------------------------------------------------------- security */

describe("sanitization", () => {
  it("drops script elements and their contents", async () => {
    const { html } = await render(
      "Hello\n\n<script>alert(document.cookie)</script>\n\nWorld",
    );
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toContain("document.cookie");
  });

  it("drops raw HTML entirely rather than escaping it into the page", async () => {
    const { html } = await render(
      '<img src=x onerror="alert(1)">\n\n<iframe src="https://evil.test"></iframe>',
    );
    expect(html).not.toMatch(/onerror/i);
    expect(html).not.toMatch(/<iframe/i);
    expect(html).not.toMatch(/evil\.test/);
  });

  it("emits no style attribute for hostile input with no code fences", async () => {
    const hostile = [
      '<div style="position:fixed;inset:0;z-index:9999">overlay</div>',
      '<span style="color:red">red</span>',
      '<p style="opacity:0">hidden</p>',
      "<style>body{display:none}</style>",
      "Normal paragraph with **bold**.",
      "| a | b |\n| - | - |\n| 1 | 2 |",
      "> quote\n\n- [ ] task\n- [x] done",
    ].join("\n\n");
    const { html } = await render(hostile);
    expect(html).not.toContain("style=");
    expect(html).not.toContain("position:fixed");
  });

  it("rejects javascript: and data: URLs in links and images", async () => {
    const { html } = await render(
      [
        "[click](javascript:alert(1))",
        "[data](data:text/html;base64,PHNjcmlwdD4=)",
        "![x](javascript:alert(2))",
        "[vb](vbscript:msgbox)",
      ].join("\n\n"),
    );
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/vbscript:/i);
    expect(html).not.toMatch(/data:text\/html/i);
  });

  it("keeps http, https and mailto links", async () => {
    const { html } = await render(
      "[a](https://example.com) [b](http://example.com) [c](mailto:a@b.test)",
    );
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('href="http://example.com"');
    expect(html).toContain('href="mailto:a@b.test"');
  });

  it("does not let a document clobber our own element ids", async () => {
    // The only ids reachable before sanitize are generated ones; sanitize
    // prefixes them, and rehype-slug runs afterwards on a clean tree.
    const { html } = await render('<a id="main-content"></a>\n\n# Heading');
    expect(html).not.toContain('id="main-content"');
  });
});

/* ------------------------------------------------------------ slug + toc */

describe("heading ids", () => {
  it("slugs after sanitize, so no clobber prefix reaches the anchors", async () => {
    const { html, headings } = await render("## Getting Started\n\n### Set up");
    expect(html).toContain('id="getting-started"');
    expect(html).not.toContain("user-content-");
    expect(headings.map((h) => h.id)).toEqual(["getting-started", "set-up"]);
  });

  it("keeps GitHub-compatible slugs despite the non-breaking glue", async () => {
    // U+00A0 is not a word separator to github-slugger. If the glue pass ran
    // before rehype-slug this id would be `write-the-skillmd` collapsed to
    // `writetheskillmd` and every in-page anchor would 404.
    const { headings } = await render("## Write the SKILL.md file");
    expect(headings[0].id).toBe("write-the-skillmd-file");
  });

  it("reports heading text with ordinary spaces, not glue", async () => {
    const { headings } = await render("## Write the SKILL.md file");
    expect(headings[0].text).toBe("Write the SKILL.md file");
    expect(headings[0].text).not.toContain(" ");
  });

  it("repairs footnote anchors that sanitize re-prefixed", async () => {
    const { html } = await render("Text with a note.[^1]\n\n[^1]: The note.");
    const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    for (const match of html.matchAll(/href="#([^"]+)"/g)) {
      expect(ids).toContain(match[1]);
    }
  });
});

/* ------------------------------------------------------ heading normalize */

describe("heading normalisation", () => {
  it("strips a leading H1 that duplicates the chapter title", async () => {
    const { html, repairs } = await render("# Skill Creator\n\nBody.\n\n## Next", {
      title: "skill-creator",
    });
    expect(html).not.toMatch(/<h1/);
    expect(html).toContain("<h2");
    expect(repairs).toContainEqual({
      kind: "stripped-h1",
      from: 1,
      to: 0,
      text: "Skill Creator",
    });
  });

  it("keeps a leading H1 that is not the title, but demotes it", async () => {
    const { html, repairs } = await render("# Overview\n\n## Detail", {
      title: "something-else",
    });
    expect(html).not.toMatch(/<h1/);
    expect(html).toMatch(/<h2[^>]*>Overview/);
    expect(html).toMatch(/<h3[^>]*>Detail/);
    expect(repairs.filter((r) => r.kind === "shifted")).toHaveLength(1);
    expect(repairs[0]).toMatchObject({ kind: "shifted", from: 1, to: 2 });
  });

  it("never emits an H1, because the page already renders one", async () => {
    const { html } = await render("# A\n\n# B\n\n# C");
    expect(html).not.toMatch(/<h1/);
  });

  it("repairs a skipped level so the outline has no holes", async () => {
    // Already sitting directly under the page H1, so no shift is needed — only
    // the h2 → h5 jump gets closed.
    const { headings, repairs } = await render("## Two\n\n##### Five\n\n### Three");
    expect(headings.map((h) => h.depth)).toEqual([2, 3, 3]);
    expect(repairs.filter((r) => r.kind === "shifted")).toEqual([]);
    expect(repairs).toContainEqual({
      kind: "level-repaired",
      from: 5,
      to: 3,
      text: "Five",
    });
  });

  it("produces an outline that never skips a level, for any input", async () => {
    const { headings } = await render(
      "###### Deep\n\n## Shallow\n\n#### Skip\n\n### Back\n\n###### Deeper",
    );
    let previous = 1;
    for (const heading of headings) {
      expect(heading.depth).toBeLessThanOrEqual(previous + 1);
      previous = heading.depth;
    }
  });

  it("records no repairs for a document that was already well formed", async () => {
    const { repairs } = await render("## A\n\n### B\n\n## C");
    expect(repairs).toEqual([]);
  });
});

/* -------------------------------------------------------------- highlight */

describe("syntax highlighting", () => {
  it("emits both theme variables so CSS can pick, not the pipeline", async () => {
    const { html } = await render("```ts\nconst a: number = 1\n```");
    expect(html).toContain("--shiki-light:");
    expect(html).toContain("--shiki-dark:");
    expect(html).toContain(
      `shiki-themes ${SHIKI_THEMES.light} ${SHIKI_THEMES.dark}`,
    );
  });

  it("survives an unknown language instead of throwing", async () => {
    const { html } = await render("```totally-not-a-language\nhello\n```");
    expect(html).toContain('data-lang="text"');
  });

  it("highlights untagged fences as plain text rather than skipping them", async () => {
    const { html } = await render("```\nplain\n```");
    expect(html).toContain('class="shiki');
    expect(html).toContain('data-lang="text"');
  });

  it("caps how many grammars one hostile document can pull in", async () => {
    const langs = [
      "c",
      "cpp",
      "java",
      "ruby",
      "php",
      "perl",
      "lua",
      "r",
      "scala",
      "haskell",
      "elixir",
      "erlang",
    ];
    const source = langs.map((l) => "```" + l + "\nx\n```").join("\n\n");
    const { html } = await render(source);
    const seen = [...html.matchAll(/data-lang="([^"]+)"/g)].map((m) => m[1]);
    const nonText = new Set(seen.filter((l) => l !== "text"));
    expect(nonText.size).toBeLessThanOrEqual(8);
    expect(seen).toHaveLength(langs.length);
  });

  it("attaches the raw source for the copy button", async () => {
    const { html } = await render("```bash\nnpx skills add acme/skills\n```");
    expect(html).toContain('data-source="npx skills add acme/skills"');
    expect(html).toContain('data-lang="bash"');
  });

  it("preloads only languages Shiki actually ships", () => {
    for (const lang of PRELOADED_LANGS) expect(isKnownLanguage(lang)).toBe(true);
    expect(PRELOADED_LANGS).toHaveLength(12);
  });
});

/* ------------------------------------------------------------ code ratio */

describe("codeRatio", () => {
  it("is zero for pure prose", async () => {
    const { codeRatio } = await render("Just words, several of them, no fences.");
    expect(codeRatio).toBe(0);
  });

  it("measures fenced code as a fraction of the document", async () => {
    const prose = "x".repeat(100);
    const code = "y".repeat(100);
    const { codeRatio } = await render(`${prose}\n\n\`\`\`\n${code}\n\`\`\`\n`);
    expect(codeRatio).toBeGreaterThan(0.4);
    expect(codeRatio).toBeLessThan(0.6);
  });

  it("ignores inline code, which is not a block", async () => {
    const { codeRatio } = await render("Run `npm install` and then `npm test`.");
    expect(codeRatio).toBe(0);
  });
});

/* ----------------------------------------------------------------- links */

describe("link resolution", () => {
  it("rewrites a relative image to raw.githubusercontent", async () => {
    const { html } = await render("![diagram](./assets/flow.png)");
    expect(html).toContain(
      'src="https://raw.githubusercontent.com/acme/skills/main/skills/demo/assets/flow.png"',
    );
    expect(html).toContain('loading="lazy"');
  });

  it("rewrites a relative link to the GitHub blob view", async () => {
    const { html } = await render("[reference](../shared/REFERENCE.md)");
    expect(html).toContain(
      'href="https://github.com/acme/skills/blob/main/skills/shared/REFERENCE.md"',
    );
    expect(html).toContain('data-external="true"');
  });

  it("prefers an internal route when we publish the target", async () => {
    const { html } = await render("[sibling](../other/SKILL.md)", {
      resolveInternal: (path) =>
        path === "skills/other/SKILL.md" ? "/acme/skills/other" : null,
    });
    expect(html).toContain('href="/acme/skills/other"');
    expect(html).toContain('data-internal="true"');
  });

  it("marks absolute links external and leaves in-page anchors alone", async () => {
    const { html } = await render("[out](https://example.com) [in](#section)");
    expect(html).toContain('data-external="true"');
    expect(html).toContain('href="#section"');
  });

  it("resolves .. without escaping the repository root", () => {
    expect(joinPath("a/b", "../../../../x")).toBe("x");
    expect(joinPath("a/b", "./c/./d")).toBe("a/b/c/d");
    expect(joinPath("", "c")).toBe("c");
  });
});

/* ---------------------------------------------------------- typography */

describe("micro-typography", () => {
  it("curls quotes and converts dashes and ellipses", async () => {
    const { html } = await render(`He said "hello" — it's fine ... really --- yes`);
    expect(html).toContain("“hello”");
    expect(html).toContain("it’s");
    expect(html).toContain("…");
    expect(html).toContain("—");
  });

  it("leaves long CLI flags alone in running prose", async () => {
    const { html } = await render("Pass --dry-run and --no-cache to the CLI.");
    expect(html).toContain("--dry-run");
    expect(html).toContain("--no-cache");
    expect(html).not.toContain("–dry-run");
  });

  it("makes a spaced double hyphen an en dash", async () => {
    const { html } = await render("Pages 10 -- 20 of the guide.");
    expect(html).toContain("–");
  });

  it("never touches text inside code", async () => {
    const { html } = await render(
      'Inline `git commit -m "x"` and:\n\n```bash\ngit log --oneline ... "quoted"\n```',
    );
    expect(html).toContain("--oneline");
    expect(html).toContain("...");
    expect(html).not.toContain("“quoted”");
  });

  it("glues short function words and units to what follows", async () => {
    const { html } = await render("Upload a file of 4 MB to the server.");
    expect(html).toContain("4 MB");
    expect(html).toContain("a file");
  });

  it("never puts glue inside a code block", async () => {
    const { html } = await render("```bash\ncp a file of 4 MB\n```");
    const pre = /<pre[\s\S]*<\/pre>/.exec(html)?.[0] ?? "";
    expect(pre).not.toContain(" ");
  });

  it("binds the last two words of a short heading", async () => {
    const { html } = await render("## Testing the skill");
    expect(html).toMatch(/the skill/);
  });
});

/* ------------------------------------------------------------- structure */

describe("gfm structures", () => {
  it("renders tables, task lists and footnotes", async () => {
    const { html } = await render(
      [
        "| Tool | Use |",
        "| --- | --- |",
        "| bash | shell |",
        "",
        "- [x] done",
        "- [ ] todo",
        "",
        "Note.[^a]",
        "",
        "[^a]: Footnote body.",
      ].join("\n"),
    );
    expect(html).toContain("<table>");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("data-footnotes");
  });

  it("handles an empty document without throwing", async () => {
    const { html, headings, codeRatio, repairs } = await render("");
    expect(html).toBe("");
    expect(headings).toEqual([]);
    expect(repairs).toEqual([]);
    expect(codeRatio).toBe(0);
  });
});

/* ------------------------------------------------------------ frontmatter */

/**
 * Regression: CommonMark reads `---\nkey: value\n---` as a setext H2, so an
 * unstripped frontmatter block became a 330-character heading and the first
 * TOC entry on the real `anthropics/skills/skill-creator` document.
 */
describe("frontmatter", () => {
  const FM = [
    "---",
    "name: skill-creator",
    "description: Create new skills and measure their performance.",
    "---",
    "",
    "## Overview",
    "",
    "Body text.",
  ].join("\n");

  it("never renders a YAML block as a heading", async () => {
    const { html, headings } = await render(FM);
    expect(html).not.toContain("skill-creator");
    expect(headings.map((h) => h.text)).toEqual(["Overview"]);
    expect(headings[0].id).toBe("overview");
  });

  it("strips TOML frontmatter and CRLF line endings too", async () => {
    const { headings } = await render("+++\r\ntitle = \"x\"\r\n+++\r\n\r\n## Only\r\n");
    expect(headings.map((h) => h.text)).toEqual(["Only"]);
  });

  it("leaves a thematic break that is not frontmatter alone", async () => {
    const { html } = await render("Intro\n\n---\n\nAfter");
    expect(html).toContain("<hr");
    expect(html).toContain("After");
  });

  it("is idempotent, so a gray-matter-stripped body is untouched", async () => {
    expect(stripFrontmatter("## Already stripped\n")).toBe("## Already stripped\n");
    expect(stripFrontmatter(stripFrontmatter(FM))).toBe(stripFrontmatter(FM));
  });
});

/* -------------------------------------------------------- code contrast */

/**
 * Locks in a finding that is easy to lose.
 *
 * We paint Shiki's tokens on the reader's own paper rather than on the
 * background the theme was designed against, so "GitHub ships it" proves
 * nothing about our contrast. `github-light` — the obvious default — fails AA
 * for `variable` (3.15:1) and `keyword` (4.13:1) on our light grounds.
 *
 * The grounds are read out of tokens.css rather than copied, so the day WS-3
 * darkens a paper mode this test tells them.
 */
describe("shiki token contrast on every paper mode", () => {
  /** Matches the `--code-ground` lift applied in `styles/code.css`. */
  const GROUND_LIFT = 0.04;

  function paperRaisedGrounds(): string[] {
    const css = readFileSync(
      new URL("../styles/tokens.css", import.meta.url),
      "utf8",
    );
    return [...css.matchAll(/--paper-raised:\s*(oklch\([^)]*\))/g)].map((m) => m[1]);
  }

  it("clears AA for every scope in both themes", async () => {
    const grounds = paperRaisedGrounds();
    expect(grounds.length).toBeGreaterThanOrEqual(6);

    const highlighter = await getHighlighter();
    let worst = { ratio: Infinity, scope: "", ground: "" };

    for (const themeName of [SHIKI_THEMES.light, SHIKI_THEMES.dark]) {
      const theme = highlighter.getTheme(themeName);
      const isLight = themeName === SHIKI_THEMES.light;

      for (const ground of grounds) {
        const base = parseColor(ground);
        expect(base, `unparseable ground ${ground}`).not.toBeNull();
        const lifted = { ...base!, l: Math.min(1, base!.l + GROUND_LIFT) };
        // A light theme is only ever shown on a light ground and vice versa.
        if (isLight !== lifted.l > 0.5) continue;

        const foregrounds = [
          ...(theme.settings ?? [])
            .filter((s) => {
              const set = s.settings as { foreground?: string; background?: string };
              // Scopes carrying their own background are painted on it.
              return set?.foreground && !set.background;
            })
            .map((s) => (s.settings as { foreground: string }).foreground),
          theme.fg,
        ].filter((c): c is string => typeof c === "string");

        expect(foregrounds.length).toBeGreaterThan(20);

        for (const hex of foregrounds) {
          const fg = parseColor(hex);
          if (!fg) continue;
          const ratio = contrastRatio(fg, lifted);
          if (ratio < worst.ratio) worst = { ratio, scope: `${themeName} ${hex}`, ground };
        }
      }
    }

    expect(
      worst.ratio,
      `worst token ${worst.scope} on ${worst.ground}`,
    ).toBeGreaterThanOrEqual(4.5);
  });
});
