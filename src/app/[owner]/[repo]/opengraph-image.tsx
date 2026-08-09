/**
 * Per-book OG card: owner avatar, repo, skill count, stars, issue number, and
 * the issue's brand accent.
 *
 * Satori constraints that actually bite here:
 *   - No CSS grid, flexbox only, and every multi-child element needs an
 *     explicit `display: flex`.
 *   - `oklch()` is not understood, so the accent is converted to hex. Every
 *     colour in `IssueTheme` is an oklch string.
 *   - Remote images are fetched by Satori itself, which turns a slow avatar
 *     into a slow card and a 404 avatar into a broken render. We inline it as a
 *     data URI and fall back to a monogram tile.
 *   - Fonts must be ttf/otf/woff; `next/font` only emits woff2.
 *
 * A failed `getBook` must still produce a card — a social preview is not worth
 * a 500 on a page that would otherwise render.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getBook, issueNumberFor } from "@/lib/book";
import { formatHex, parseColor } from "@/lib/color";
import { SITE_NAME } from "@/lib/site";

export const alt = "Agent Skills book cover";
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
 * The reader's night palette — the `[data-paper="night"]` coordinates from
 * `src/styles/tokens.css`, resolved through the OKLCH engine. Satori renders
 * outside any document, so `var(--paper)` has nothing to resolve against and a
 * token cannot reach this file; this keeps the card on the reader's real
 * colours rather than an approximation of them.
 */
const hex = (l: number, c: number, h: number) => formatHex({ l, c, h, alpha: 1 });

const PAPER = hex(0.171, 0.0045, 60);
const INK = hex(0.895, 0.004, 80);
const BODY = hex(0.82, 0.005, 75);
const MUTED = hex(0.68, 0.008, 70);
const RULE = hex(0.36, 0.007, 60);
/** `.dark { --issue-accent }` — the neutral used until a design.md resolves. */
const FALLBACK_ACCENT = hex(0.7, 0.12, 60);

/** oklch() from `IssueTheme` → hex, because Satori cannot parse oklch. */
function toHex(color: string | null | undefined, fallback: string): string {
  if (!color) return fallback;
  const parsed = parseColor(color);
  return parsed ? formatHex(parsed) : fallback;
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

/**
 * Identify an image from its magic bytes.
 *
 * Not from `Content-Type`: Satori hands the declared type straight to its
 * decoder, so one mislabelled response — a PNG served as `image/jpeg` — throws
 * `RangeError: Offset is outside the bounds of the DataView` and takes the
 * whole card down with it. Observed while building this; the bytes are the only
 * thing worth trusting. Anything not on this list (WebP, AVIF, SVG) is dropped
 * rather than guessed at, and the monogram tile renders instead.
 */
function sniffImageType(bytes: Buffer): string | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  return null;
}

async function avatarDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "github-skills-book" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength > 200_000) return null;
    const type = sniffImageType(bytes);
    if (!type) return null;
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

interface Cover {
  owner: string;
  repo: string;
  title: string;
  description: string;
  skillCount: number | null;
  stars: number | null;
  issueNumber: number;
  accent: string;
  avatar: string | null;
}

async function coverFor(owner: string, repo: string): Promise<Cover> {
  try {
    const book = await getBook(owner, repo);
    const [avatar] = await Promise.all([
      avatarDataUri(`${book.repo.ownerAvatar}${book.repo.ownerAvatar.includes("?") ? "&" : "?"}s=200`),
    ]);
    return {
      owner: book.repo.owner,
      repo: book.repo.repo,
      title: book.owner?.name || book.repo.owner,
      description:
        book.repo.description ??
        `${book.skills.length} Agent Skills, rendered as a book.`,
      skillCount: book.skills.length,
      stars: book.repo.stars,
      issueNumber: book.issueNumber,
      accent: toHex(book.theme.accentDark, FALLBACK_ACCENT),
      avatar,
    };
  } catch {
    // Unindexed, rate-limited, or plain missing. Still a card.
    return {
      owner,
      repo,
      title: owner,
      description: "Agent Skills, rendered as a book.",
      skillCount: null,
      stars: null,
      issueNumber: issueNumberFor(`${owner}/${repo}`),
      accent: FALLBACK_ACCENT,
      avatar: null,
    };
  }
}

function clamp(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

export default async function Image({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const [literata, geist, geistSemibold] = await FONTS;
  const { owner, repo } = await params;
  const cover = await coverFor(owner, repo);
  const stats = [
    cover.skillCount !== null
      ? `${cover.skillCount} ${cover.skillCount === 1 ? "skill" : "skills"}`
      : null,
    cover.stars ? `${compact(cover.stars)} stars` : null,
  ].filter((s): s is string => s !== null);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 72px 64px",
          background: PAPER,
          color: INK,
          fontFamily: "Geist",
        }}
      >
        <div style={{ display: "flex", position: "absolute", top: 0, left: 0, right: 0, height: 10, background: cover.accent }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {cover.avatar ? (
              <img
                src={cover.avatar}
                alt=""
                width={84}
                height={84}
                style={{ borderRadius: 18, border: `1px solid ${RULE}` }}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  width: 84,
                  height: 84,
                  borderRadius: 18,
                  background: cover.accent,
                  color: PAPER,
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 44,
                  fontWeight: 600,
                }}
              >
                {cover.owner.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", marginLeft: 24 }}>
              <div style={{ display: "flex", fontSize: 30, fontWeight: 600, letterSpacing: -0.5 }}>
                {clamp(`${cover.owner}/${cover.repo}`, 42)}
              </div>
              <div style={{ display: "flex", fontSize: 22, color: MUTED, marginTop: 4 }}>
                {SITE_NAME}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", fontSize: 18, letterSpacing: 4, color: MUTED }}>
              ISSUE
            </div>
            <div
              style={{
                display: "flex",
                fontFamily: "Literata",
                fontSize: 60,
                lineHeight: 1,
                color: cover.accent,
              }}
            >
              {String(cover.issueNumber).padStart(2, "0")}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontFamily: "Literata",
              fontSize: cover.repo.length > 18 ? 76 : 96,
              lineHeight: 1.02,
              letterSpacing: -3,
            }}
          >
            {clamp(cover.repo, 30)}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 20,
              fontSize: 30,
              lineHeight: 1.35,
              color: BODY,
            }}
          >
            {clamp(cover.description, 140)}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: `1px solid ${RULE}`,
            paddingTop: 22,
            fontSize: 26,
            color: MUTED,
          }}
        >
          <div style={{ display: "flex", color: INK, fontWeight: 600 }}>
            {stats.length ? stats.join("  ·  ") : "Agent Skills"}
          </div>
          <div style={{ display: "flex" }}>npx skills add {clamp(`${cover.owner}/${cover.repo}`, 34)}</div>
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
