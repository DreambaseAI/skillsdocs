import { createHash } from "node:crypto";

/**
 * Validators and byte counts for the agent surfaces.
 *
 * Every `.md`, JSON and `.well-known` document we serve was uncacheable by the
 * *client*: `cache-control: public, max-age=0, s-maxage=3600` tells a caller to
 * revalidate on every use, and with no `ETag` there is nothing to revalidate
 * with, so every poll is a full re-download. `anthropics/skills.md` is 240 KB /
 * ~60k tokens; an agent watching a book for changes was paying that every time.
 *
 * The bodies are deterministic — the one exception, a `generated:` timestamp in
 * the book front matter, was removed for exactly this reason — so a strong
 * validator over the response bytes is honest.
 */

/** A strong `ETag` over the exact bytes of a response body. */
export function etagOf(body: string): string {
  return `"${createHash("sha256").update(body, "utf8").digest("hex").slice(0, 32)}"`;
}

/** True when the client already holds these bytes. Handles `*` and weak tags. */
export function matchesEtag(request: Request, etag: string): boolean {
  const header = request.headers.get("if-none-match");
  if (!header) return false;
  if (header.trim() === "*") return true;
  return header
    .split(",")
    .map((t) => t.trim())
    .some((t) => t === etag || t === `W/${etag}`);
}

/**
 * A response body with `ETag`, `Content-Length`, and a 304 when the caller
 * already has it.
 *
 * `Content-Length` is set explicitly because a streamed `Response` built from a
 * string does not get one, and an agent budgeting context wants to know the
 * size before it reads the body.
 */
export function serveBody(
  request: Request,
  body: string,
  headers: Record<string, string>,
  status = 200,
): Response {
  const etag = etagOf(body);
  const bytes = Buffer.byteLength(body, "utf8");
  const withValidator: Record<string, string> = {
    ...headers,
    etag,
    "content-length": String(bytes),
  };

  if (status === 200 && matchesEtag(request, etag)) {
    // A 304 must not carry Content-Length for a body it is not sending.
    const { "content-length": _drop, ...rest } = withValidator;
    void _drop;
    return new Response(null, { status: 304, headers: rest });
  }

  return new Response(body, { status, headers: withValidator });
}

/** `serveBody` for an object that is about to be `JSON.stringify`d. */
export function serveJson(
  request: Request,
  payload: unknown,
  headers: Record<string, string>,
  status = 200,
): Response {
  return serveBody(request, `${JSON.stringify(payload, null, 2)}\n`, headers, status);
}
