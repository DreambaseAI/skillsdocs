import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { highlightCode, lineDecorations } from "./code-block";

/**
 * The whole-file highlighter, exercised against real grammars.
 *
 * These are not snapshot tests of Shiki's token output — that is Shiki's job
 * and it changes with every grammar release. What is asserted here is the four
 * things *we* added and that a whole-file view is broken without: the ordinals
 * exist and are hidden from assistive tech, every line carries an `#L42`
 * target, both themes are emitted onto one tree, and an unknown language
 * degrades to plain text instead of throwing the page away.
 */

const PY = ["import sys", "", "def main():", "    print(sys.argv)"].join("\n");

/** Server components are async; `highlightCode` hands back plain React. */
function html(node: React.ReactNode): string {
  return renderToStaticMarkup(node as React.ReactElement);
}

describe("highlightCode", () => {
  it("highlights on the server, with tokens in the markup", async () => {
    const out = await highlightCode(PY, "python");
    const markup = html(out.node);

    expect(out.language).toBe("python");
    expect(out.lines).toBe(4);
    // Tokens, not an empty shell waiting for an effect to fill it.
    expect(markup).toContain("import");
    expect(markup.match(/class="line"/g)?.length).toBe(4);
  });

  it("emits both themes on one tree, never a baked colour", async () => {
    const out = await highlightCode(PY, "python");
    const markup = html(out.node);

    expect(markup).toContain("--shiki-light:");
    expect(markup).toContain("--shiki-dark:");
    // A baked `color:#xxxxxx` would mean one theme won at build time and the
    // other four cascade rules in `code.css` have nothing to choose between.
    expect(markup).not.toMatch(/style="[^"]*(?<!-)color:\s*#/);
  });

  it("numbers the lines without speaking them", async () => {
    const out = await highlightCode(PY, "python", { showLineNumbers: true });
    const markup = html(out.node);

    expect(markup.match(/class="code-line__no"/g)?.length).toBe(4);
    // Four ordinals read aloud before four lines of code is four wasted
    // announcements per line for the whole file.
    expect(markup.match(/aria-hidden="true"/g)?.length).toBe(4);
    expect(markup).toContain(">4</span>");
  });

  it("gives every line a GitHub-shaped target so `#L42` resolves", async () => {
    const out = await highlightCode(PY, "python", { lineAnchors: true });
    const markup = html(out.node);

    expect(markup).toContain('id="L1"');
    expect(markup).toContain('id="L4"');
    expect(markup).toContain('data-line="3"');
  });

  it("keeps ordinals and anchors independent", async () => {
    const bare = html((await highlightCode(PY, "python")).node);
    expect(bare).not.toContain("code-line__no");
    expect(bare).not.toContain('id="L1"');
  });

  it("loads a grammar the singleton did not preload", async () => {
    // `xml` covers the `.xsd` schemas `anthropics/skills/docx` ships and is
    // not in the twelve preloaded for fences.
    const out = await highlightCode("<a><b/></a>", "xml");
    expect(out.language).toBe("xml");
  });

  it("degrades an unknown language to text rather than throwing", async () => {
    // The upstream component types this as `BundledLanguage` and lets
    // `codeToHtml` throw. The language here comes from a file extension in a
    // stranger's repository, so it has to be a runtime decision.
    const out = await highlightCode("hello", "not-a-real-language");
    expect(out.language).toBe("text");
    expect(html(out.node)).toContain("hello");
  });

  it("normalises CRLF and the POSIX trailing newline", async () => {
    // A stray `\r` renders as a zero-width gap at the end of every line, and a
    // file that ends the way POSIX asks would otherwise show a phantom final
    // line one past `wc -l`.
    const out = await highlightCode("a\r\nb\r\n", "text");
    expect(out.lines).toBe(2);
    expect(html(out.node)).not.toContain("\r");
  });

  it("counts an empty file as no lines", async () => {
    expect((await highlightCode("", "text")).lines).toBe(0);
  });
});

describe("lineDecorations", () => {
  it("puts the ordinal first, so it reads as a gutter", () => {
    const transformer = lineDecorations({
      showLineNumbers: true,
      lineAnchors: true,
      anchorPrefix: "L",
    });
    const node = {
      type: "element" as const,
      tagName: "span",
      properties: {} as Record<string, unknown>,
      children: [{ type: "text" as const, value: "code" }],
    };

    // Shiki calls `line` with `this` bound to its own context; ours never
    // touches it.
    transformer.line?.call(
      undefined as never,
      node as never,
      7,
    );

    expect(node.properties.id).toBe("L7");
    expect(node.properties["data-line"]).toBe("7");
    expect(node.children[0]).toMatchObject({ tagName: "span" });
  });
});
