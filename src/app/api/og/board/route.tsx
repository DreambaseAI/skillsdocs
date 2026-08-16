/**
 * The skill board's OG card: the pin board itself, in miniature.
 *
 * `/api/og/board?skills=a/b/c,…` renders up to four of the pinned repos as
 * paper stacks on cork — each sheet washed with its owner's accent, pinned,
 * tilted, avatar in the corner and the skill's name across the page — under
 * the board's title and counts. A route handler rather than the
 * `opengraph-image` file convention because the board lives entirely in the
 * query string, which the file convention never sees; `/bookmarks`'
 * `generateMetadata` points here with the same `skills` value.
 *
 * Deliberately URL-only: a bookmark key carries no title, and fetching book
 * data per repo would make a slow, fragile card. Titles are title-cased from
 * the slug — the same fallback the board page shows before its data arrives —
 * so the card needs nothing but the URL and the avatars.
 *
 * Satori constraints as in the share and book cards: no OKLCH colour
 * strings (everything goes through the colour engine to hex), avatars inlined
 * as data URIs with a monogram fallback.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { curatedManifest } from "@/components/home/issue-accent";
import { parseBoardSkills } from "@/lib/board";
import { getCollectionById, isUuidHandle } from "@/lib/collections";
import { formatHex, mix, parseColor, type Oklch } from "@/lib/color";
import { deriveIssueTheme } from "@/lib/design/theme";
import { fetchImageDataUri } from "@/lib/image-data-uri";
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

/** An OKLCH coordinate as a plain object — the same device the other OG
 * cards use, and deliberately not a colour string: these restate the
 * printed-object tokens from tokens.css for a renderer no stylesheet can
 * reach, not new brand decisions. */
const stock = (l: number, c: number, h: number): Oklch => ({ l, c, h, alpha: 1 });

/** `--board-ground` / `--sheet-ground` / `--sheet-ink`: the pin board's stock. */
const CORK = stock(0.175, 0.014, 62);
const SHEET = stock(0.963, 0.011, 92);
const SHEET_INK = stock(0.27, 0.014, 60);
/** The page behind the board: night paper, one step darker than the cork. */
const PAPER = formatHex(stock(0.14, 0.004, 60));
const CORK_HEX = formatHex(CORK);
const INK = formatHex(stock(0.965, 0.008, 85));
const MUTED = formatHex(stock(0.68, 0.008, 70));
const RULE = formatHex(stock(0.32, 0.006, 60));
const DOT = formatHex(mix(CORK, SHEET, 0.13));

/** The house accent, for the title block. */
const HOUSE = deriveIssueTheme("skillsdocs", curatedManifest("skillsdocs"));
const HOUSE_ACCENT = formatHex(parseColor(HOUSE.accentDark) ?? stock(0.7, 0.12, 60));

/** How many stacks fit one card with room to read their pages. */
const CARD_STACKS = 4;

/* ── stack geometry: the same FNV hash the site board draws from ─────── */

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Title-case a slug — the board page's own no-data fallback. */
function slugTitle(slug: string): string {
  return slug
    .split(/[-_]+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function clampLabel(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

interface CardStack {
  owner: string;
  repo: string;
  title: string;
  /** Pages pinned from this repo beyond the top one. */
  more: number;
  serif: boolean;
  tilt: number;
  paper: string;
  accentInk: string;
  ruleInk: string;
  pinTop: string;
  pinBottom: string;
  avatar: string | null;
}

async function stackFor(
  owner: string,
  repo: string,
  slug: string,
  count: number,
): Promise<CardStack> {
  const theme = deriveIssueTheme(owner, curatedManifest(owner));
  const accent = parseColor(theme.accentDark) ?? stock(0.7, 0.12, 60);
  const hash = fnv1a(`${owner}/${repo}`);

  return {
    owner,
    repo,
    title: slugTitle(slug),
    more: count - 1,
    serif: (hash >>> 11) % 2 === 0,
    tilt: ((hash >>> 7) % 49) / 10 - 2.4,
    paper: formatHex(mix(SHEET, accent, 0.11)),
    accentInk: formatHex(mix(SHEET_INK, accent, 0.52)),
    ruleInk: formatHex(mix(SHEET, SHEET_INK, 0.14)),
    pinTop: formatHex(mix(accent, SHEET, 0.45)),
    pinBottom: formatHex(mix(accent, SHEET_INK, 0.75)),
    avatar: await fetchImageDataUri(external.avatar(owner, 96)),
  };
}

/** Scale-to-fit for the sheet's title, two lines of a 214px measure. */
function titleSize(title: string): number {
  if (title.length <= 12) return 34;
  if (title.length <= 20) return 29;
  if (title.length <= 30) return 25;
  return 22;
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

  // `?id=` is a saved board's uuid; `?skills=` is the stateless URL form.
  // The id is shape-validated before the database sees it — this endpoint is
  // unauthenticated and must not turn junk params into queries.
  const id = url.searchParams.get("id");
  let rows: ReturnType<typeof parseBoardSkills>;
  let title = "Skill board";
  if (id !== null) {
    const board = isUuidHandle(id) ? await getCollectionById("board", id) : null;
    if (!board) {
      return new Response("No such board.", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    rows = parseBoardSkills(board.items.join(","));
    title = board.name;
  } else {
    rows = parseBoardSkills(url.searchParams.get("skills") ?? undefined);
  }

  if (rows.length === 0) {
    return new Response("Nothing pinned to this board.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // Group into stacks: one per repo, first-seen order — the page's own rule.
  const byRepo = new Map<string, { owner: string; repo: string; slugs: string[] }>();
  for (const row of rows) {
    const key = `${row.owner}/${row.repo}`.toLowerCase();
    let stack = byRepo.get(key);
    if (!stack) {
      stack = { owner: row.owner, repo: row.repo, slugs: [] };
      byRepo.set(key, stack);
    }
    stack.slugs.push(row.slug);
  }
  const allStacks = [...byRepo.values()];
  const shown = allStacks.slice(0, CARD_STACKS);
  const stacks = await Promise.all(
    shown.map((s) => stackFor(s.owner, s.repo, s.slugs[0], s.slugs.length)),
  );
  const beyond = allStacks.length - shown.length;

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
              BOOKMARKS
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
            {rows.length} {rows.length === 1 ? "skill" : "skills"}
            {"  ·  "}
            {allStacks.length} {allStacks.length === 1 ? "repo" : "repos"}
            {beyond > 0 ? `  ·  ${beyond} beyond the card` : ""}
            {"  ·  "}
            {SITE_NAME}
          </div>
        </div>

        {/* --------------------------------------------------- the board */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 30,
            flexGrow: 1,
            marginTop: 26,
            borderRadius: "14px 14px 0 0",
            border: `1px solid ${RULE}`,
            borderBottom: "none",
            background: CORK_HEX,
            backgroundImage: `radial-gradient(circle at 8px 8px, ${DOT} 2px, transparent 2.5px)`,
            backgroundSize: "18px 18px",
            padding: "20px 30px 34px",
          }}
        >
          {stacks.map((stack) => (
            <div
              key={`${stack.owner}/${stack.repo}`}
              style={{
                display: "flex",
                position: "relative",
                width: 254,
                height: 300,
                transform: `rotate(${stack.tilt.toFixed(1)}deg)`,
              }}
            >
              {/* The sheets behind, when the repo pinned more than one. */}
              {stack.more > 0 ? (
                <div
                  style={{
                    position: "absolute",
                    left: -7,
                    top: 26,
                    width: 254,
                    height: 282,
                    borderRadius: 8,
                    background: formatHex(mix(SHEET, SHEET_INK, 0.22)),
                    transform: "rotate(-2.2deg)",
                  }}
                />
              ) : null}

              {/* The page itself: ruled paper in the owner's wash. */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  position: "absolute",
                  left: 0,
                  top: 18,
                  width: 254,
                  height: 282,
                  borderRadius: 8,
                  background: stack.paper,
                  backgroundImage: `repeating-linear-gradient(180deg, transparent 0px, transparent 27px, ${stack.ruleInk} 27px, ${stack.ruleInk} 28px)`,
                  color: formatHex(SHEET_INK),
                  padding: "20px 20px 16px",
                }}
              >
                {/* header: avatar + owner */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    paddingBottom: 12,
                    borderBottom: `1px solid ${formatHex(mix(SHEET, SHEET_INK, 0.3))}`,
                  }}
                >
                  {stack.avatar ? (
                    <img
                      src={stack.avatar}
                      alt=""
                      width={26}
                      height={26}
                      style={{ borderRadius: 6 }}
                    />
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        width: 26,
                        height: 26,
                        borderRadius: 6,
                        alignItems: "center",
                        justifyContent: "center",
                        background: stack.accentInk,
                        color: stack.paper,
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      {stack.owner.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      fontSize: 13,
                      fontWeight: 600,
                      letterSpacing: 2.5,
                      color: stack.accentInk,
                    }}
                  >
                    {clampLabel(stack.owner.toUpperCase(), 15)}
                  </div>
                </div>

                {/* the skill's name, in the stack's voice */}
                <div
                  style={{
                    display: "flex",
                    marginTop: 16,
                    fontFamily: stack.serif ? "Literata" : "Geist",
                    fontWeight: 600,
                    fontSize: titleSize(stack.title),
                    lineHeight: 1.15,
                    letterSpacing: stack.serif ? -0.5 : -1,
                  }}
                >
                  {clampLabel(stack.title, 40)}
                </div>

                {/* foot: repo, and how many more pages this stack holds */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: "auto",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: 2,
                      color: stack.accentInk,
                    }}
                  >
                    {clampLabel(
                      (/^(agent-)?skills$/i.test(stack.repo)
                        ? `${stack.owner}/${stack.repo}`
                        : stack.repo
                      ).toUpperCase(),
                      22,
                    )}
                  </div>
                  {stack.more > 0 ? (
                    <div
                      style={{
                        display: "flex",
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: 1.5,
                        padding: "4px 10px",
                        borderRadius: 999,
                        background: formatHex(mix(SHEET_INK, stock(0.7, 0.12, 60), 0.1)),
                        color: formatHex(SHEET),
                      }}
                    >
                      +{stack.more} {stack.more === 1 ? "SKILL" : "SKILLS"}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* the pin */}
              <div
                style={{
                  position: "absolute",
                  left: 254 / 2 - 11,
                  top: 6,
                  width: 22,
                  height: 22,
                  borderRadius: 22,
                  background: `radial-gradient(circle at 32% 28%, ${stack.pinTop} 0%, ${stack.pinBottom} 70%)`,
                }}
              />
            </div>
          ))}
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
        // The board is fully described by the URL, so the card can cache hard.
        "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
