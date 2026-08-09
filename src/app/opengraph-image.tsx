/**
 * Site OG card — the wordmark.
 *
 * Satori renders a subset of CSS: flexbox only, no grid, and every element with
 * more than one child needs an explicit `display: flex`. Fonts must be `ttf`,
 * `otf` or `woff` — never `woff2`, which is what `next/font` produces, hence the
 * hand-vendored TTFs in `public/og`. Total bundle ceiling is 500 KB; the three
 * faces here come to 317 KB.
 *
 * Colours are literal hex on purpose. This file renders outside the browser, so
 * there is no cascade to read `--paper` or `--ink` from; the values below are
 * the stone-900/stone-50 pair the tokens resolve to in dark mode.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { formatHex } from "@/lib/color";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const OG_DIR = join(process.cwd(), "public", "og");

/**
 * Kicked off once at module scope and awaited inside the handler.
 *
 * Not a top-level `await`: it makes the module async, and an async metadata
 * module makes the dev server fail the image with `failed to pipe response`
 * before any of our code runs. A hoisted promise loads the fonts exactly once
 * either way.
 */
const FONTS = Promise.all([
  readFile(join(OG_DIR, "Literata-SemiBold.ttf")),
  readFile(join(OG_DIR, "Geist-Regular.ttf")),
  readFile(join(OG_DIR, "Geist-SemiBold.ttf")),
]);

/**
 * The reader's own night palette, resolved through the OKLCH engine.
 *
 * These are the coordinates of `[data-paper="night"]` and `.dark`'s
 * `--issue-accent` in `src/styles/tokens.css`. Satori renders outside any
 * document, so `var(--paper)` resolves to nothing and a token is literally
 * unreachable here — going through `formatHex` keeps the card on the same
 * colours as the reader instead of a hand-picked approximation, and keeps the
 * numbers in one notation across the codebase.
 */
const hex = (l: number, c: number, h: number) => formatHex({ l, c, h, alpha: 1 });

const PAPER = hex(0.171, 0.0045, 60);
const INK = hex(0.895, 0.004, 80);
const MUTED = hex(0.68, 0.008, 70);
const RULE = hex(0.36, 0.007, 60);
const ACCENT = hex(0.7, 0.12, 60);

export default async function Image() {
  const [literata, geist, geistSemibold] = await FONTS;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: PAPER,
          color: INK,
          fontFamily: "Geist",
        }}
      >
        <div style={{ display: "flex", height: 8, background: ACCENT, width: 180 }} />

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontFamily: "Literata",
              fontSize: 104,
              lineHeight: 1.02,
              letterSpacing: -3,
            }}
          >
            {SITE_NAME}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 24,
              fontSize: 36,
              color: MUTED,
              letterSpacing: -0.5,
            }}
          >
            {SITE_TAGLINE}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            fontSize: 26,
            color: MUTED,
            borderTop: `1px solid ${RULE}`,
            paddingTop: 24,
          }}
        >
          <div style={{ display: "flex", color: INK, fontWeight: 600 }}>
            {SITE_URL.replace(/^https?:\/\//, "")}/&lt;owner&gt;/&lt;repo&gt;
          </div>
          <div style={{ display: "flex" }}>Append .md for Markdown</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Literata", data: literata, weight: 600, style: "normal" },
        { name: "Geist", data: geist, weight: 400, style: "normal" },
        { name: "Geist", data: geistSemibold, weight: 600, style: "normal" },
      ],
    },
  );
}
