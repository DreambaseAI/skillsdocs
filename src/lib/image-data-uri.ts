import "server-only";

/**
 * Identify the raster formats Satori can decode from their magic bytes.
 *
 * The response Content-Type is not trustworthy enough here: passing a
 * mislabelled image to Satori can fail the entire metadata image render.
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

export interface FetchedImage {
  bytes: Buffer;
  type: string;
}

export async function fetchImage(
  url: string,
  maxBytes = 200_000,
): Promise<FetchedImage | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "github-skills-book" },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) return null;

    const type = sniffImageType(bytes);
    return type ? { bytes, type } : null;
  } catch {
    return null;
  }
}

export async function fetchImageDataUri(
  url: string,
  maxBytes = 200_000,
): Promise<string | null> {
  const image = await fetchImage(url, maxBytes);
  return image
    ? `data:${image.type};base64,${image.bytes.toString("base64")}`
    : null;
}
