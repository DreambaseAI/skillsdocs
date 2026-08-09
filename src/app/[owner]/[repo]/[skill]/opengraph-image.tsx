/**
 * Per-chapter OG card: the chapter title, its part, and where it sits in the
 * book.
 *
 * Same Satori constraints as the book card — flexbox only, hex colours (the
 * theme stores `oklch()`), ttf fonts, explicit `display: flex` on anything with
 * more than one child. See the sibling `../opengraph-image.tsx` for the full
 * note.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { probeRepoStatus } from "@/lib/upstream";
import { findSkill, getBook } from "@/lib/book";
import { formatHex, parseColor } from "@/lib/color";
import { SITE_NAME } from "@/lib/site";

export const alt = "Agent Skill chapter";
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

/** See `../opengraph-image.tsx` — same palette, same reason. */
const hex = (l: number, c: number, h: number) => formatHex({ l, c, h, alpha: 1 });

const PAPER = hex(0.171, 0.0045, 60);
const INK = hex(0.895, 0.004, 80);
const BODY = hex(0.82, 0.005, 75);
const MUTED = hex(0.68, 0.008, 70);
const RULE = hex(0.36, 0.007, 60);
const FALLBACK_ACCENT = hex(0.7, 0.12, 60);

function toHex(color: string | null | undefined, fallback: string): string {
  if (!color) return fallback;
  const parsed = parseColor(color);
  return parsed ? formatHex(parsed) : fallback;
}

function clamp(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

interface Card {
  book: string;
  part: string | null;
  title: string;
  description: string;
  position: number | null;
  total: number | null;
  minutes: number | null;
  accent: string;
}

/** `null` when there is no such repository, or no such chapter in it. */
async function cardFor(
  owner: string,
  repo: string,
  slug: string,
): Promise<Card | null> {
  try {
    const book = await getBook(owner, repo);
    const skill = findSkill(book, slug);
    // A card for a chapter that is not in the book is a fabricated record.
    if (!skill) return null;
    const accent = toHex(book.theme.accentDark, FALLBACK_ACCENT);
    const part = book.parts.find((p) => p.skills.some((s) => s.slug === slug));
    return {
      book: `${book.repo.owner}/${book.repo.repo}`,
      // A single unnamed part is the "no grouping" case; showing "Skills"
      // there would be noise dressed as information.
      part: part && part.group ? part.title : null,
      title: skill.name,
      description: skill.description || `A skill from ${book.repo.fullName}.`,
      position: book.skills.findIndex((s) => s.slug === slug) + 1,
      total: book.skills.length,
      minutes: skill.readingMinutes,
      accent,
    };
  } catch {
    // See the book card: a cached rejection arrives stripped of its `kind`, so
    // the only way to tell "missing" from "rate-limited" is to ask again.
    if ((await probeRepoStatus(owner, repo)).kind === "not-found") return null;
    return {
      book: `${owner}/${repo}`,
      part: null,
      title: slug,
      description: "An Agent Skill, rendered as a chapter.",
      position: null,
      total: null,
      minutes: null,
      accent: FALLBACK_ACCENT,
    };
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ owner: string; repo: string; skill: string }>;
}) {
  const [literata, geist, geistSemibold] = await FONTS;
  const { owner, repo, skill } = await params;
  const card = await cardFor(owner, repo, skill);
  if (!card) {
    return new Response("No such chapter.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const eyebrow = [card.book, card.part].filter(Boolean).join("  ·  ");
  const footer = [
    card.position && card.total ? `Chapter ${card.position} of ${card.total}` : null,
    card.minutes ? `${card.minutes} min read` : null,
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
          padding: "64px 72px",
          background: PAPER,
          color: INK,
          fontFamily: "Geist",
        }}
      >
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: 12,
            background: card.accent,
          }}
        />

        <div style={{ display: "flex", alignItems: "center", fontSize: 26, color: MUTED, letterSpacing: 0.5 }}>
          {clamp(eyebrow, 60)}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontFamily: "Literata",
              fontSize: card.title.length > 22 ? 74 : 92,
              lineHeight: 1.04,
              letterSpacing: -3,
            }}
          >
            {clamp(card.title, 42)}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 22,
              fontSize: 30,
              lineHeight: 1.35,
              color: BODY,
            }}
          >
            {clamp(card.description, 170)}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: `1px solid ${RULE}`,
            paddingTop: 22,
            fontSize: 25,
            color: MUTED,
          }}
        >
          {/* Falls back to the book, never to the site name — that is already
              on the right, and the same words twice reads as a bug. */}
          <div style={{ display: "flex", color: INK, fontWeight: 600 }}>
            {footer.length ? footer.join("  ·  ") : clamp(card.book, 44)}
          </div>
          <div style={{ display: "flex" }}>{SITE_NAME}</div>
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
