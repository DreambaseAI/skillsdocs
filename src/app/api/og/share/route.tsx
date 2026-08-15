/**
 * The shared shelf's OG card: the bookcase itself, in miniature.
 *
 * `/api/og/share?repos=a/b,c/d` renders up to nine of the shared books as
 * spines on a board — each in its owner's derived accent, with its avatar at
 * the foot and its name up the bind — under the shelf's title and counts. A
 * route handler rather than the `opengraph-image` file convention because the
 * shelf lives entirely in the query string, which the file convention never
 * sees; `/share`'s `generateMetadata` points here with the same `repos` value.
 *
 * Satori constraints that bite (see the book OG card):
 *   - No OKLCH colour strings, so every colour goes through the engine to hex —
 *     including the `color-mix()` washes cover.css does in CSS, which are
 *     reproduced with `mix()` from the same colour library.
 *   - No `writing-mode`, so a spine title is a horizontal line rotated 90°
 *     inside an absolutely-placed box (transforms do not affect layout).
 *   - Remote images make slow, fragile cards; avatars are inlined as data
 *     URIs with a monogram fallback.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { curatedManifest } from "@/components/home/issue-accent";
import { formatHex, mix, parseColor, type Oklch } from "@/lib/color";
import { deriveIssueTheme } from "@/lib/design/theme";
import { fetchImageDataUri } from "@/lib/image-data-uri";
import {
  getCollectionByHandle,
  isUuidHandle,
  isValidSlug,
} from "@/lib/collections";
import { parseShareRepos } from "@/lib/share";
import { external, SITE_NAME } from "@/lib/site";

const WIDTH = 1200;
const HEIGHT = 630;

const OG_DIR = join(process.cwd(), "public", "og");

/** Hoisted, not top-level awaited — see the note in the book OG module. */
const FONTS = Promise.all([
  readFile(join(OG_DIR, "Literata-SemiBold.ttf")),
  readFile(join(OG_DIR, "Geist-Regular.ttf")),
  readFile(join(OG_DIR, "Geist-SemiBold.ttf")),
]);

/* ── the stock, from tokens.css, resolved to hex ─────────────────────── */

/** An OKLCH coordinate as a plain object — the same device the book OG card
 * uses, and deliberately not a colour string: these are the printed-object
 * stock tokens from tokens.css restated for a renderer no stylesheet can
 * reach, not new brand decisions. */
const stock = (l: number, c: number, h: number): Oklch => ({ l, c, h, alpha: 1 });

/** `--cover-ground` / `--cover-ink`: the printed-object stock. */
const GROUND = stock(0.165, 0.008, 55);
/** The page behind the case: night paper, one step darker. */
const PAPER = formatHex(stock(0.14, 0.004, 60));
const CASE = formatHex(stock(0.19, 0.005, 58));
const INK = formatHex(stock(0.965, 0.008, 85));
const MUTED = formatHex(stock(0.68, 0.008, 70));
const RULE = formatHex(stock(0.32, 0.006, 60));
const BOARD_TOP = formatHex(mix(stock(0.895, 0.004, 80), GROUND, 0.55));
const BOARD_BOTTOM = formatHex(mix(stock(0.895, 0.004, 80), GROUND, 0.85));

/** The house accent, for the title block. */
const HOUSE = deriveIssueTheme("skillsdocs", curatedManifest("skillsdocs"));
const HOUSE_ACCENT = formatHex(parseColor(HOUSE.accentDark) ?? stock(0.7, 0.12, 60));

/** How many spines fit one card shelf with room to read their titles. */
const CARD_SPINES = 9;

/* ── spine geometry: the same FNV hash the site shelf uses ───────────── */

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

interface CardSpine {
  owner: string;
  repo: string;
  label: string;
  width: number;
  height: number;
  serif: boolean;
  /** Gradient stops: the cover.css washes, premixed to hex. */
  top: string;
  mid: string;
  ground: string;
  avatar: string | null;
}

async function spineFor(owner: string, repo: string): Promise<CardSpine> {
  const theme = deriveIssueTheme(owner, curatedManifest(owner));
  const accent = parseColor(theme.accentDark) ?? stock(0.7, 0.12, 60);
  const hash = fnv1a(`${owner}/${repo}`);

  return {
    owner,
    repo,
    label: /^(agent-)?skills$/i.test(repo) ? `${owner}/${repo}` : repo,
    width: 82 + (hash % 34), // 82–115px at card scale
    height: 300 + ((hash >>> 5) % 90), // 300–389px
    serif: (hash >>> 11) % 2 === 0,
    top: formatHex(mix(GROUND, accent, 0.34)),
    mid: formatHex(mix(GROUND, accent, 0.08)),
    ground: formatHex(GROUND),
    avatar: await fetchImageDataUri(external.avatar(owner, 96)),
  };
}

function clampLabel(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Scale-to-fit along the bind, mirroring the site shelf's estimate. */
function titleSize(spine: CardSpine): number {
  const room = spine.height - 130;
  const glyph = spine.serif ? 0.6 : 0.85;
  return Math.max(
    13,
    Math.min(spine.serif ? 26 : 17, room / (spine.label.length * glyph)),
  );
}

export async function GET(request: Request) {
  try {
    return await renderCard(request);
  } catch {
    // A social preview is never worth an unhandled stream error; crawlers
    // treat a plain failure gracefully and fall back to the page's text tags.
    return new Response("Could not render this card.", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

async function renderCard(request: Request) {
  const [literata, geist, geistSemibold] = await FONTS;
  const url = new URL(request.url);

  // `?handle=` is a saved shelf; `?repos=` is the stateless URL form. The
  // handle is shape-validated before the database sees it — this endpoint is
  // unauthenticated and must not turn junk params into queries.
  const handle = url.searchParams.get("handle");
  let rows: ReturnType<typeof parseShareRepos>;
  let title = "Favorite skills";
  if (handle !== null) {
    const lower = handle.toLowerCase();
    if (!isUuidHandle(lower) && !isValidSlug(lower)) {
      return new Response("No such shelf.", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    const shelf = await getCollectionByHandle("shelf", lower);
    if (!shelf) {
      return new Response("No such shelf.", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    rows = parseShareRepos(shelf.items.join(","));
    title = shelf.name;
  } else {
    rows = parseShareRepos(url.searchParams.get("repos") ?? undefined);
  }

  if (rows.length === 0) {
    return new Response("No books on this shelf.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const shown = rows.slice(0, CARD_SPINES);
  const spines = await Promise.all(
    shown.map((row) => spineFor(row.owner, row.repo)),
  );
  const more = rows.length - shown.length;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: PAPER,
          color: INK,
          fontFamily: "Geist",
          padding: "44px 56px 0",
        }}
      >
        {/* ------------------------------------------------------ header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 17,
                fontWeight: 600,
                letterSpacing: 5,
                color: HOUSE_ACCENT,
              }}
            >
              SHARED SKILLS
            </div>
            <div
              style={{
                display: "flex",
                fontFamily: "Literata",
                fontSize: 58,
                lineHeight: 1.05,
                letterSpacing: -1.5,
                marginTop: 6,
              }}
            >
              {title}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontSize: 21,
              color: MUTED,
              paddingBottom: 10,
            }}
          >
            {rows.length} {rows.length === 1 ? "book" : "books"}
            {more > 0 ? `  ·  ${more} beyond the card` : ""}
            {"  ·  "}
            {SITE_NAME}
          </div>
        </div>

        {/* ---------------------------------------------------- the case */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            marginTop: 26,
            borderRadius: "14px 14px 0 0",
            border: `1px solid ${RULE}`,
            borderBottom: "none",
            background: CASE,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              flexGrow: 1,
              gap: 18,
            }}
          >
            {spines.map((spine) => (
              <div
                key={`${spine.owner}/${spine.repo}`}
                style={{
                  display: "flex",
                  position: "relative",
                  width: spine.width,
                  height: spine.height,
                  borderRadius: "4px 4px 0 0",
                  background: `linear-gradient(180deg, ${spine.top} 0%, ${spine.mid} 60%, ${spine.ground} 100%)`,
                  borderTop: "2px solid rgba(255,255,255,0.14)",
                }}
              >
                {/* The bind's title: a horizontal line rotated onto the
                    spine. The box is placed by hand because rotation does
                    not move layout. */}
                <div
                  style={{
                    display: "flex",
                    position: "absolute",
                    left: (spine.width - (spine.height - 118)) / 2,
                    top: (spine.height - 34) / 2 - 26,
                    width: spine.height - 118,
                    height: 34,
                    alignItems: "center",
                    justifyContent: "center",
                    transform: "rotate(-90deg)",
                    fontFamily: spine.serif ? "Literata" : "Geist",
                    fontWeight: 600,
                    fontSize: titleSize(spine),
                    letterSpacing: spine.serif ? 0 : 2,
                    color: INK,
                    whiteSpace: "nowrap",
                  }}
                >
                  {spine.serif
                    ? clampLabel(spine.label, 26)
                    : clampLabel(spine.label.toUpperCase(), 24)}
                </div>

                {/* The owner's mark at the foot of the bind. */}
                {spine.avatar ? (
                  <img
                    src={spine.avatar}
                    alt=""
                    width={40}
                    height={40}
                    style={{
                      position: "absolute",
                      left: (spine.width - 40) / 2,
                      bottom: 16,
                      borderRadius: 40,
                      border: "1px solid rgba(255,255,255,0.28)",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      display: "flex",
                      position: "absolute",
                      left: (spine.width - 40) / 2,
                      bottom: 16,
                      width: 40,
                      height: 40,
                      borderRadius: 40,
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(255,255,255,0.14)",
                      border: "1px solid rgba(255,255,255,0.28)",
                      fontSize: 20,
                      fontWeight: 600,
                    }}
                  >
                    {spine.owner.slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* The board they stand on. */}
          <div
            style={{
              display: "flex",
              height: 16,
              background: `linear-gradient(180deg, ${BOARD_TOP}, ${BOARD_BOTTOM})`,
            }}
          />
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        { name: "Literata", data: literata, weight: 600, style: "normal" },
        { name: "Geist", data: geist, weight: 400, style: "normal" },
        { name: "Geist", data: geistSemibold, weight: 600, style: "normal" },
      ],
      headers: {
        // The shelf is fully described by the URL, so the card can cache hard.
        "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
