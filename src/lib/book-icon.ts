import "server-only";

import sharp from "sharp";
import { getBook } from "@/lib/book";
import { formatHex, parseColor } from "@/lib/color";
import { fetchImage, type FetchedImage } from "@/lib/image-data-uri";

export const BOOK_ICON_SIZE = 64;

const hex = (l: number, c: number, h: number) => formatHex({ l, c, h, alpha: 1 });

const PAPER = hex(0.171, 0.0045, 60);
const FALLBACK_ACCENT = hex(0.7, 0.12, 60);

interface IconData {
  accent: string;
  avatar: FetchedImage | null;
}

function toHex(color: string | null | undefined): string {
  if (!color) return FALLBACK_ACCENT;
  const parsed = parseColor(color);
  return parsed ? formatHex(parsed) : FALLBACK_ACCENT;
}

async function iconDataFor(owner: string, repo: string): Promise<IconData> {
  try {
    const book = await getBook(owner, repo);
    const avatarUrl = `${book.repo.ownerAvatar}${book.repo.ownerAvatar.includes("?") ? "&" : "?"}s=128`;

    return {
      accent: toHex(book.theme.accentDark),
      avatar: await fetchImage(avatarUrl),
    };
  } catch {
    return { accent: FALLBACK_ACCENT, avatar: null };
  }
}

async function iconInset(image: FetchedImage | null): Promise<Buffer> {
  if (image) {
    try {
      return await sharp(image.bytes)
        .resize(56, 56, { fit: "cover" })
        .png()
        .toBuffer();
    } catch {
      // A valid raster can still use a decoder unavailable in this runtime.
    }
  }

  return sharp({
    create: {
      width: 56,
      height: 56,
      channels: 4,
      background: PAPER,
    },
  })
    .png()
    .toBuffer();
}

export async function renderBookIcon(
  owner: string,
  repo: string,
): Promise<Response> {
  const icon = await iconDataFor(owner, repo);
  const inset = await iconInset(icon.avatar);
  const png = await sharp({
    create: {
      width: BOOK_ICON_SIZE,
      height: BOOK_ICON_SIZE,
      channels: 4,
      background: icon.accent,
    },
  })
    .composite([{ input: inset, left: 4, top: 4 }])
    .png()
    .toBuffer();

  return new Response(new Uint8Array(png), {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Type": "image/png",
    },
  });
}
