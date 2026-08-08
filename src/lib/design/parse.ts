/**
 * `design.md` parser.
 *
 * Tolerant by design: the format has no schema, so we run every extractor over
 * the document and rank what comes back by confidence rather than trusting a
 * single shape. Colour literals are scanned uniformly across frontmatter
 * values, code fences, table cells, list items and bare prose.
 */

import matter from "gray-matter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { Root as MdRoot, RootContent } from "mdast";
import { formatHex, parseColor } from "../color";
import type {
  BrandColor,
  BrandFont,
  BrandVoice,
  ColorRole,
  DesignFormat,
  DesignManifest,
  FontRole,
  TokenSource,
} from "./types";

/* ------------------------------------------------------------- literals */

const COLOR_LITERAL = new RegExp(
  [
    /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b/.source,
    /oklch\([^)]*\)/.source,
    /rgba?\([^)]*\)/.source,
    /hsla?\([^)]*\)/.source,
  ].join("|"),
  "gi",
);

const LIGHT_DARK_OPEN = /light-dark\(/gi;

/**
 * Split `light-dark(a, b)` into its two arguments.
 *
 * A regex cannot do this: Vercel writes
 * `light-dark(oklch(57.61% 0.2508 258.23), oklch(57.61% 0.2321 258.23))`, and
 * any `[^)]` capture stops at the *inner* closing paren, silently truncating
 * the dark value into something unparseable. Count the depth instead.
 */
function findLightDark(text: string): Array<{ match: string; light: string; dark: string }> {
  const out: Array<{ match: string; light: string; dark: string }> = [];
  LIGHT_DARK_OPEN.lastIndex = 0;

  for (let m = LIGHT_DARK_OPEN.exec(text); m; m = LIGHT_DARK_OPEN.exec(text)) {
    const argsStart = m.index + m[0].length;
    let depth = 1;
    let split = -1;
    let i = argsStart;
    for (; i < text.length && depth > 0; i++) {
      const ch = text[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === "," && depth === 1 && split === -1) split = i;
    }
    if (depth !== 0 || split === -1) continue;

    out.push({
      match: text.slice(m.index, i),
      light: text.slice(argsStart, split).trim(),
      dark: text.slice(split + 1, i - 1).trim(),
    });
    LIGHT_DARK_OPEN.lastIndex = i;
  }
  return out;
}

/** Lines describing shadows and gridlines carry colours that aren't brand. */
const NON_BRAND_LINE = /box-shadow|text-shadow|\bshadow\b|gridline|scrim|overlay/i;

function slugKey(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "color"
  );
}

const ROLE_PATTERNS: Array<[ColorRole, RegExp]> = [
  ["background", /\b(background|bg|canvas|page|paper)\b/i],
  ["surface", /\b(surface|card|panel|elevated|popover)\b/i],
  ["foreground", /\b(foreground|fg|text|ink|copy|body)\b/i],
  ["muted", /\b(muted|subtle|secondary-text|tertiary|dim)\b/i],
  ["border", /\b(border|divider|rule|outline|stroke|hairline)\b/i],
  ["success", /\b(success|positive|ok|green)\b/i],
  ["warning", /\b(warning|caution|attention|amber|yellow)\b/i],
  ["danger", /\b(danger|destructive|error|critical|negative)\b/i],
  ["info", /\b(info|informational|note)\b/i],
  ["accent", /\b(accent|highlight|brand|signature)\b/i],
  ["primary", /\b(primary|main)\b/i],
];

function inferRole(name: string, usage: string | null): ColorRole {
  const haystack = `${name} ${usage ?? ""}`;
  for (const [role, re] of ROLE_PATTERNS) if (re.test(haystack)) return role;
  return "unknown";
}

const CONFIDENCE: Record<TokenSource, number> = {
  frontmatter: 1,
  "data-fence": 0.85,
  "css-fence": 0.8,
  table: 0.7,
  "external-css": 0.65,
  bullet: 0.6,
  prose: 0.3,
};

/* ---------------------------------------------------------- sanitisation */

/**
 * A `design.md` is third-party and attacker-controllable — anyone can publish
 * one at their own domain and we will happily fetch it. Its values end up
 * inside a `<style>` element served from *our* origin, so every one of them
 * passes a whitelist before it is allowed anywhere near CSS.
 *
 * Values that fail are **dropped, never escaped**. There is no legitimate
 * brand token containing a quote, a semicolon, a brace, an angle bracket, or a
 * `url()`, so there is nothing to preserve by trying to be clever.
 */
export const SAFE_COLOR =
  /^(?:#[0-9a-f]{3,8}|(?:oklch|oklab|rgba?|hsla?)\(\s*[0-9a-z.%\s,/+-]{1,80}\))$/i;
export const SAFE_LEN = /^-?\d{1,4}(?:\.\d{1,4})?(?:px|rem|em|%)$/;
/**
 * Family names only. Letters, digits, spaces and a few joiners — no quotes,
 * no parentheses, no separators. Unicode-aware so "Söhne" survives.
 */
export const SAFE_FONT = /^[\p{L}\p{N}][\p{L}\p{N} ._'-]{0,47}$/u;

/** Hard ceilings, so a hostile document cannot make us emit a megabyte. */
export const LIMITS = {
  colors: 64,
  fonts: 8,
  /** Bytes of derived CSS. */
  css: 32 * 1024,
} as const;

/**
 * A colour is safe only if it matches the whitelist **and** actually parses.
 * The pattern alone would pass `rgb(expression)`; the parser will not.
 */
export function sanitizeColor(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (v.length > 96 || !SAFE_COLOR.test(v)) return null;
  return parseColor(v) ? v : null;
}

export function sanitizeLength(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  return SAFE_LEN.test(v) ? v : null;
}

export function sanitizeFontFamily(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().replace(/\s+/g, " ");
  return SAFE_FONT.test(v) ? v : null;
}

/** Turn one colour literal into a BrandColor, or null if unparseable. */
function toBrandColor(
  raw: string,
  name: string,
  usage: string | null,
  source: TokenSource,
  scheme: "light" | "dark" | null = null,
): BrandColor | null {
  const oklch = parseColor(raw);
  if (!oklch) return null;
  return {
    name: name.trim() || "unnamed",
    key: slugKey(name),
    raw,
    hex: formatHex({ ...oklch, alpha: 1 }),
    alpha: oklch.alpha,
    oklch,
    role: inferRole(name, usage),
    usage: usage?.trim() || null,
    scheme,
    source,
    confidence: CONFIDENCE[source],
  };
}

/**
 * Pull every colour literal out of a string.
 * `light-dark(a, b)` yields two entries tagged with their scheme.
 */
function scanColors(
  text: string,
  name: string,
  usage: string | null,
  source: TokenSource,
): BrandColor[] {
  if (NON_BRAND_LINE.test(text)) return [];

  const out: BrandColor[] = [];
  let remainder = text;

  for (const pair of findLightDark(text)) {
    const light = toBrandColor(pair.light, name, usage, source, "light");
    const dark = toBrandColor(pair.dark, name, usage, source, "dark");
    if (light) out.push(light);
    if (dark) out.push(dark);
    remainder = remainder.replace(pair.match, " ");
  }

  for (const m of remainder.matchAll(COLOR_LITERAL)) {
    const c = toBrandColor(m[0], name, usage, source);
    if (c) out.push(c);
  }
  return out;
}

/* ---------------------------------------------------------- frontmatter */

function walkFrontmatterColors(
  value: unknown,
  path: string[],
  out: BrandColor[],
): void {
  if (typeof value === "string") {
    const name = path.at(-1) ?? "color";
    for (const c of scanColors(value, name, null, "frontmatter")) out.push(c);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkFrontmatterColors(v, [...path, String(i)], out));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      walkFrontmatterColors(v, [...path, k], out);
    }
  }
}

const GENERIC_FAMILIES = new Set([
  "sans-serif",
  "serif",
  "monospace",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "ui-rounded",
  "-apple-system",
  "blinkmacsystemfont",
  "segoe ui",
  "helvetica neue",
  "arial",
  "cursive",
  "fantasy",
  "emoji",
  "math",
]);

function parseFontStack(value: string): string[] {
  return (
    value
      // Design docs write pairings as "Suisse Intl + Geist (numbers)"; the
      // parenthetical is a note, and the `+` separates two real families.
      .replace(/\([^)]*\)/g, " ")
      .split(/[,+/]|\bor\b|\band\b/i)
      .map((s) => s.trim().replace(/^["'`]|["'`]$/g, "").replace(/\s+/g, " "))
      .filter((s) => s.length > 0 && s.length <= 40 && !/^\d/.test(s))
  );
}

function primaryFamily(stack: string[]): string | null {
  for (const f of stack) {
    if (GENERIC_FAMILIES.has(f.toLowerCase())) continue;
    const safe = sanitizeFontFamily(f);
    if (safe) return safe;
  }
  return null;
}

/**
 * Families out of a raw CSS `font-family` value.
 *
 * `parseFontStack` strips parentheticals, which is right for the prose form
 * ("Suisse Intl + Geist (numbers)") and catastrophically wrong for a real CSS
 * declaration: Vercel's is
 * `var(--font-geist-sans, var(--font-sans, "Geist", -apple-system, …))`, and
 * naive stripping yields the family "var". Quoted names are the signal here;
 * everything else in a `var()` chain is a reference, not a family.
 */
function familiesFromCssValue(value: string): string[] {
  const quoted = [...value.matchAll(/["']([^"']{1,48})["']/g)].map((m) => m[1]);
  if (quoted.length > 0) return quoted;
  if (value.includes("var(") || value.includes("--")) return [];
  return parseFontStack(value);
}

function roleFromKey(key: string): FontRole {
  const k = key.toLowerCase();
  if (/mono|code/.test(k)) return "mono";
  if (/display|hero|title|logotype/.test(k)) return "display";
  if (/head|h[1-6]|subtitle/.test(k)) return "heading";
  if (/body|paragraph|text|copy|sans|base/.test(k)) return "body";
  return "unknown";
}

function walkFrontmatterFonts(
  value: unknown,
  path: string[],
  out: BrandFont[],
): void {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (
        (k === "fontFamily" || k === "font-family" || k === "family") &&
        typeof v === "string"
      ) {
        const stack = parseFontStack(v);
        const family = primaryFamily(stack);
        if (family) {
          out.push({
            family,
            stack,
            // Prefer the *parent* key ("hero", "body-md", "mono") for the role.
            role: roleFromKey(path.at(-1) ?? k),
            source: "frontmatter",
          });
        }
      } else {
        walkFrontmatterFonts(v, [...path, k], out);
      }
    }
    return;
  }
  if (typeof value === "string" && /^(mono|sans|serif|display|body|heading)$/i.test(path.at(-1) ?? "")) {
    const stack = parseFontStack(value);
    const family = primaryFamily(stack);
    if (family) {
      out.push({ family, stack, role: roleFromKey(path.at(-1)!), source: "frontmatter" });
    }
  }
}

const RADIUS_VALUE = /(-?[\d.]+)\s*(px|rem|em)?/;

function parseRadius(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const m = value.match(RADIUS_VALUE);
    if (!m) return null;
    const n = parseFloat(m[1]);
    if (!Number.isFinite(n)) return null;
    return m[2] === "rem" || m[2] === "em" ? n * 16 : n;
  }
  if (value && typeof value === "object") {
    // A scale like { sm: 4, md: 8, lg: 12 } — take the middle rung.
    const entries = Object.entries(value as Record<string, unknown>);
    const md = entries.find(([k]) => /^(md|base|default|DEFAULT)$/.test(k));
    return parseRadius(md ? md[1] : entries[Math.floor(entries.length / 2)]?.[1]);
  }
  return null;
}

/* --------------------------------------------------------------- body */

const CSS_VAR = /--([\w-]+)\s*:\s*([^;\n}]+)/g;
const CSS_FONT = /font-family\s*:\s*([^;\n}]+)/gi;

/** `--vbg-radius: 8px` and `--radius: 8px`, but not `--vbg-radius-small`. */
const RADIUS_NAME = /(?:^|-)(?:border-)?radius$|^rounded(?:-(?:md|base|default))?$/i;

/** A CSS file can be 108 KB; stop before a pathological one becomes our problem. */
const MAX_DECLARATIONS = 4000;

interface CssHarvest {
  colors: BrandColor[];
  fonts: BrandFont[];
  radiusPx: number | null;
}

/**
 * Harvest custom properties and `font-family` declarations out of any blob of
 * CSS — a fenced block inside a design.md, or a whole external stylesheet.
 */
function harvestCss(css: string, source: TokenSource): CssHarvest {
  const colors: BrandColor[] = [];
  const fonts: BrandFont[] = [];
  let radiusPx: number | null = null;
  let seen = 0;

  for (const m of css.matchAll(CSS_VAR)) {
    if (++seen > MAX_DECLARATIONS) break;
    const [, name, value] = m;
    // Shadows, scrims and gridlines carry colours that are not the brand's.
    if (NON_BRAND_LINE.test(name)) continue;

    if (/font/i.test(name)) {
      const stack = familiesFromCssValue(value);
      const family = primaryFamily(stack);
      if (family) fonts.push({ family, stack, role: roleFromKey(name), source });
      continue;
    }

    for (const c of scanColors(value, name, null, source)) colors.push(c);
    if (radiusPx === null && RADIUS_NAME.test(name)) radiusPx = parseRadius(value);
  }

  for (const m of css.matchAll(CSS_FONT)) {
    const stack = familiesFromCssValue(m[1]);
    const family = primaryFamily(stack);
    if (family) fonts.push({ family, stack, role: "unknown", source });
  }

  return { colors, fonts, radiusPx };
}

/**
 * `- **Spotify Green** (`#1ed760`): Primary brand accent`
 * `- Primary: #6c47ff — the signature purple`
 *
 * Matched against the list item's *plain text*, because remark has already
 * turned `**bold**` into a strong node by the time we see it.
 */
const BULLET_COLOR = new RegExp(
  [
    /^\s*(?<name>[^(:[`]{1,48}?)\s*/.source,
    /[:\-—–]?\s*[([]?\s*`?/.source,
    /(?<color>#[0-9a-f]{3,8}|(?:oklch|rgba?|hsla?)\([^)]*\))/.source,
    /`?\s*[)\]]?\s*[:\-—–]*\s*(?<usage>.*)$/.source,
  ].join(""),
  "i",
);

function textOf(node: RootContent): string {
  let out = "";
  visit(node, (n) => {
    if ("value" in n && typeof n.value === "string") out += n.value;
  });
  return out;
}

/* ------------------------------------------------------------------ voice */

const VOICE_WORDS =
  /\b(bold|calm|clean|clear|concise|confident|crisp|direct|editorial|elegant|energetic|friendly|grounded|human|inviting|luxurious|minimal|modern|playful|precise|premium|professional|quiet|refined|restrained|serious|sharp|sophisticated|technical|timeless|trustworthy|warm|witty)\b/gi;

function extractVoice(description: string | null, body: string): BrandVoice {
  const haystack = `${description ?? ""}\n${body}`;
  const words = [
    ...new Set(
      [...haystack.matchAll(VOICE_WORDS)].map((m) => m[0].toLowerCase()),
    ),
  ].slice(0, 8);

  const quotes = body
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(
      (p) =>
        p.startsWith(">") &&
        p.length > 24 &&
        p.length < 220 &&
        !p.includes("|") &&
        !p.includes("```"),
    )
    .map((p) => p.replace(/^>\s*/, ""))
    .slice(0, 3);

  return { words, quotes, summary: description };
}

/* ------------------------------------------------------------------ main */

/** Reject SPA shells served with a 200 and an HTML body. */
export function looksLikeMarkdown(body: string, contentType: string | null): boolean {
  const trimmed = body.trimStart();
  if (trimmed.startsWith("<")) return false;
  if (contentType && !/^text\/(markdown|plain|x-markdown)/i.test(contentType)) {
    return false;
  }
  return trimmed.length >= 64;
}

export function parseDesignMarkdown(source: string, sourceUrl: string): DesignManifest {
  const warnings: string[] = [];
  const colors: BrandColor[] = [];
  const fonts: BrandFont[] = [];
  const pointers: string[] = [];
  let radiusPx: number | null = null;
  const formats = new Set<DesignFormat>();

  let data: Record<string, unknown> = {};
  let content = source;
  try {
    const parsed = matter(source);
    data = (parsed.data ?? {}) as Record<string, unknown>;
    content = parsed.content;
  } catch {
    warnings.push("Frontmatter could not be parsed; falling back to body only.");
  }

  /* Family A — YAML frontmatter. */
  if (Object.keys(data).length > 0) {
    walkFrontmatterColors(data.colors ?? data.color ?? data.palette, [], colors);
    walkFrontmatterFonts(data.typography ?? data.fonts ?? data.type, [], fonts);
    radiusPx = parseRadius(data.rounded ?? data.radius ?? data.borderRadius);
    if (colors.length || fonts.length) formats.add("frontmatter");
  }

  const name =
    typeof data.name === "string"
      ? data.name
      : (content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? null);
  const description =
    typeof data.description === "string"
      ? data.description
      : (content.match(/^>\s+(.+)$/m)?.[1]?.trim() ?? null);

  /* Body walk. */
  const tree = unified().use(remarkParse).use(remarkGfm).parse(content) as MdRoot;

  visit(tree, (node) => {
    if (node.type === "code") {
      const lang = (node.lang ?? "").toLowerCase();
      const source: TokenSource =
        lang === "json" || lang === "yaml" || lang === "yml" || lang === "ts"
          ? "data-fence"
          : "css-fence";

      const harvest = harvestCss(node.value, source);
      colors.push(...harvest.colors);
      fonts.push(...harvest.fonts);
      if (radiusPx === null) radiusPx = harvest.radiusPx;
      // Fences may also hold bare literals with no custom-property wrapper.
      for (const line of node.value.split("\n")) {
        if (line.includes("--") || NON_BRAND_LINE.test(line)) continue;
        const labelled = line.match(/^\s*["']?([\w .-]+)["']?\s*[:=]\s*(.+)$/);
        if (!labelled) continue;
        for (const c of scanColors(labelled[2], labelled[1], null, source)) {
          colors.push(c);
        }
      }
      if (colors.some((c) => c.source === source)) formats.add("mixed");
      return;
    }

    if (node.type === "table") {
      const rows = node.children;
      if (rows.length < 2) return;
      const header = rows[0].children.map((c: RootContent) => textOf(c).toLowerCase());
      // Which column holds the family matters. Resend's table is
      // `| Font | Role |` and Clerk's is `| Role | Family | CSS variable |`;
      // assuming column 1 turns "Display headlines" into a typeface.
      const fontCol = header.findIndex((h: string) => /\b(font|family|typeface)\b/.test(h));
      const isFontTable = fontCol !== -1;

      for (const row of rows.slice(1)) {
        const cells = row.children.map((c: RootContent) => textOf(c).trim());
        if (cells.length === 0) continue;
        const label = cells[0].replace(/[*`]/g, "");
        const usage = cells.length > 1 ? cells.at(-1)! : null;

        if (isFontTable) {
          const stack = parseFontStack(cells[fontCol] ?? cells[1] ?? label);
          const family = primaryFamily(stack);
          if (family) {
            fonts.push({
              family,
              stack,
              role: roleFromKey(
                cells.filter((_, i) => i !== fontCol).join(" ") || label,
              ),
              source: "table",
            });
          }
        }
        for (const cell of cells.slice(1)) {
          for (const c of scanColors(cell, label, usage, "table")) colors.push(c);
        }
      }
      formats.add("tables");
      return;
    }

    if (node.type === "listItem") {
      const line = textOf(node).split("\n")[0];
      const m = line.match(BULLET_COLOR);
      if (m?.groups) {
        const c = toBrandColor(
          m.groups.color,
          m.groups.name,
          m.groups.usage || null,
          "bullet",
        );
        if (c) {
          colors.push(c);
          formats.add("prose");
        }
      }
      return;
    }

    if (node.type === "link" && typeof node.url === "string") {
      if (
        /^https?:/i.test(node.url) &&
        /(design|brand|token|style|theme)/i.test(node.url)
      ) {
        pointers.push(node.url);
      }
    }
  });

  /* Last resort: bare literals anywhere in the prose. */
  if (colors.length === 0) {
    let n = 0;
    for (const line of content.split("\n")) {
      for (const c of scanColors(line, `unnamed-${++n}`, null, "prose")) {
        colors.push(c);
      }
    }
    if (colors.length) formats.add("prose");
  }

  if (colors.length === 0 && pointers.length > 0) formats.add("pointer");

  const deduped = dedupeColors(colors);
  if (deduped.length === 0) warnings.push("No colour tokens found.");
  const dedupedFonts = dedupeFonts(fonts);
  if (deduped.length > LIMITS.colors || dedupedFonts.length > LIMITS.fonts) {
    warnings.push(
      `Token set truncated to ${LIMITS.colors} colours and ${LIMITS.fonts} fonts.`,
    );
  }

  return {
    ok: deduped.length > 0 || dedupedFonts.length > 0,
    origin: "owner-site",
    sourceUrl,
    format: pickFormat(formats),
    name,
    description,
    colors: deduped.slice(0, LIMITS.colors),
    fonts: dedupedFonts.slice(0, LIMITS.fonts),
    radiusPx: sanitizeRadius(radiusPx),
    voice: extractVoice(description, content),
    pointers: [...new Set(pointers)].slice(0, 5),
    warnings,
  };
}

/** Radii outside this range are a parse artefact, not a design decision. */
function sanitizeRadius(px: number | null): number | null {
  if (px === null || !Number.isFinite(px)) return null;
  if (px < 0 || px > 64) return null;
  return Math.round(px * 100) / 100;
}

/**
 * Parse a whole external stylesheet as a token source.
 *
 * `vercel.com/design.md` is an Agent Skill containing zero colour literals —
 * it defers everything to `vercel.com/geist/vercel-brand.css`, 108 KB of
 * `light-dark()` oklch in both the unit and percent dialects. That file is a
 * first-class manifest; this is how we read it.
 */
export function parseDesignCss(source: string, sourceUrl: string): DesignManifest {
  const { colors, fonts, radiusPx } = harvestCss(source, "external-css");
  const deduped = dedupeColors(colors);
  const dedupedFonts = dedupeFonts(fonts);

  return {
    ok: deduped.length > 0 || dedupedFonts.length > 0,
    origin: "owner-site",
    sourceUrl,
    format: "mixed",
    name: null,
    description: null,
    colors: deduped.slice(0, LIMITS.colors),
    fonts: dedupedFonts.slice(0, LIMITS.fonts),
    radiusPx: sanitizeRadius(radiusPx),
    voice: { words: [], quotes: [], summary: null },
    pointers: [],
    warnings: [],
  };
}

function pickFormat(formats: Set<DesignFormat>): DesignFormat {
  if (formats.size === 0) return "none";
  if (formats.size > 1) return "mixed";
  return [...formats][0];
}

/**
 * Keep the highest-confidence entry per (key, scheme).
 *
 * Ordering is confidence first, then chroma — the list gets truncated at
 * `LIMITS.colors`, and truncating away the one saturated token in a 500-token
 * stylesheet would silently turn a brand grey.
 */
function dedupeColors(colors: BrandColor[]): BrandColor[] {
  const best = new Map<string, BrandColor>();
  for (const c of colors) {
    const id = `${c.key}|${c.scheme ?? ""}|${c.hex}`;
    const existing = best.get(id);
    if (!existing || c.confidence > existing.confidence) best.set(id, c);
  }
  return [...best.values()].sort(
    (a, b) => b.confidence - a.confidence || b.oklch.c - a.oklch.c,
  );
}

function dedupeFonts(fonts: BrandFont[]): BrandFont[] {
  const best = new Map<string, BrandFont>();
  for (const f of fonts) {
    const id = f.family.toLowerCase();
    const existing = best.get(id);
    // A known role beats "unknown" for the same family.
    if (!existing || (existing.role === "unknown" && f.role !== "unknown")) {
      best.set(id, f);
    }
  }
  return [...best.values()];
}
