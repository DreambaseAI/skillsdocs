/**
 * Saved collections: named, slugged snapshots of a reader's library.
 *
 * A `shelf` holds `owner/repo` keys and lives at `/share/<handle>`; a `board`
 * holds `owner/repo/skill-slug` keys and lives at `/bookmarks/<handle>`. A
 * handle is the collection's slug or its uuid — slugs are editable and unique
 * per kind, the uuid is forever, so a renamed slug breaks the pretty link but
 * never the id link.
 *
 * Item grammar and caps mirror `src/hooks/use-favorites.ts` exactly: what fits
 * in the localStorage library fits in a saved collection, nothing silently
 * dropped. Every query uses parameter binding — this file is the repo's first
 * hand-rolled SQL and interpolation stays banned in it.
 *
 * Server-only (imports the pg pool). The pure helpers are exported for tests.
 */

import { db } from "@/lib/db";

export type CollectionKind = "shelf" | "board";

export interface Collection {
  id: string;
  userId: string;
  kind: CollectionKind;
  name: string;
  slug: string;
  items: readonly string[];
  createdAt: Date;
  updatedAt: Date;
}

/** The wire shape of a collection for client UIs — no owner id, dates
 * flattened to ISO strings so it serialises across the RSC boundary. */
export interface CollectionSummary {
  id: string;
  kind: CollectionKind;
  name: string;
  slug: string;
  itemCount: number;
  updatedAt: string;
}

export function summarize(collection: Collection): CollectionSummary {
  return {
    id: collection.id,
    kind: collection.kind,
    name: collection.name,
    slug: collection.slug,
    itemCount: collection.items.length,
    updatedAt: collection.updatedAt.toISOString(),
  };
}

/* ------------------------------------------------------------- validation */

/** Same grammar as the localStorage lists — see use-favorites.ts. */
const ITEM_RE: Record<CollectionKind, RegExp> = {
  shelf: /^[\w.-]{1,39}\/[\w.-]{1,100}$/,
  board: /^[\w.-]{1,39}\/[\w.-]{1,100}\/[^/\s]{1,200}$/,
};

/** Same caps as the localStorage lists, NOT the 100-key `?skills=` URL cap. */
export const MAX_ITEMS: Record<CollectionKind, number> = {
  shelf: 200,
  board: 500,
};

export const NAME_MAX = 80;

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/;
const SLUG_MIN = 3;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Slugs that would shadow a sibling page or read as machinery. Small on
 * purpose: `/share/<x>` and `/bookmarks/<x>` have no static children today,
 * so these guard intent, not routing.
 */
const RESERVED_SLUGS = new Set(["new", "edit", "me", "manage", "library"]);

export function isUuidHandle(handle: string): boolean {
  return UUID_RE.test(handle.toLowerCase());
}

export function isValidSlug(slug: string): boolean {
  return (
    slug.length >= SLUG_MIN &&
    SLUG_RE.test(slug) &&
    !RESERVED_SLUGS.has(slug) &&
    // A slug that parses as a uuid would be unreachable — handle resolution
    // checks the uuid shape first.
    !UUID_RE.test(slug)
  );
}

export function isValidName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= NAME_MAX;
}

/**
 * A name's slug: lowercased, de-accented, everything else folded to hyphens.
 * Not github-slugger — that keeps unicode letters (GitHub anchors do), and
 * this grammar is strictly `[a-z0-9-]`. Returns "" when nothing survives;
 * callers fall back to the kind.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/**
 * Validate, dedupe (case-insensitively, first occurrence wins), cap. Order is
 * preserved — for a board, order is the board.
 */
export function cleanItems(
  kind: CollectionKind,
  items: readonly string[],
): string[] {
  const re = ITEM_RE[kind];
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const item of items) {
    if (typeof item !== "string" || !re.test(item)) continue;
    const lower = item.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    clean.push(item);
    if (clean.length >= MAX_ITEMS[kind]) break;
  }
  return clean;
}

/* ---------------------------------------------------------------- queries */

interface CollectionRow {
  id: string;
  user_id: string;
  kind: CollectionKind;
  name: string;
  slug: string;
  items: unknown;
  created_at: Date;
  updated_at: Date;
}

function rowToCollection(row: CollectionRow): Collection {
  const items = Array.isArray(row.items)
    ? row.items.filter((v): v is string => typeof v === "string")
    : [];
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    name: row.name,
    slug: row.slug,
    items,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLS = "id, user_id, kind, name, slug, items, created_at, updated_at";

/**
 * Resolve a URL handle. Uuid-shaped (after lowercasing — pasted uppercase
 * uuids are still that row) looks up by id; anything else by slug. The uuid
 * shape is validated in JS first: `= $1::uuid` on arbitrary text would throw,
 * not miss.
 */
export async function getCollectionByHandle(
  kind: CollectionKind,
  handle: string,
): Promise<Collection | null> {
  const lower = handle.toLowerCase();
  const byId = UUID_RE.test(lower);
  if (!byId && !SLUG_RE.test(lower)) return null;
  const { rows } = await db.query<CollectionRow>(
    byId
      ? `SELECT ${COLS} FROM collection WHERE kind = $1 AND id = $2::uuid`
      : `SELECT ${COLS} FROM collection WHERE kind = $1 AND slug = $2`,
    [kind, lower],
  );
  return rows[0] ? rowToCollection(rows[0]) : null;
}

export async function listCollections(userId: string): Promise<Collection[]> {
  const { rows } = await db.query<CollectionRow>(
    `SELECT ${COLS} FROM collection WHERE user_id = $1
     ORDER BY kind, updated_at DESC`,
    [userId],
  );
  return rows.map(rowToCollection);
}

/**
 * Create with a generated slug: the name's slug, then `-2`, `-3`… on
 * collision, then a random suffix as the backstop. Insert-and-retry rather
 * than check-then-insert, so a concurrent create of the same name cannot
 * race past the unique constraint.
 */
export async function createCollection(options: {
  userId: string;
  kind: CollectionKind;
  name: string;
  items: readonly string[];
}): Promise<Collection> {
  const { userId, kind } = options;
  const name = options.name.trim();
  const items = cleanItems(kind, options.items);
  const base = ((s) => (isValidSlug(s) ? s : kind))(slugify(name));

  const candidates = [base];
  for (let n = 2; n <= 9; n++) candidates.push(`${base}-${n}`.slice(0, 60));
  candidates.push(
    `${base}-${Math.random().toString(16).slice(2, 8)}`.slice(0, 60),
  );

  for (const slug of candidates) {
    const { rows } = await db.query<CollectionRow>(
      `INSERT INTO collection (user_id, kind, name, slug, items)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (kind, slug) DO NOTHING
       RETURNING ${COLS}`,
      [userId, kind, name, slug, JSON.stringify(items)],
    );
    if (rows[0]) return rowToCollection(rows[0]);
  }
  throw new Error("could not find a free slug");
}

/** Ownership lives in the WHERE clause on every mutation: a non-owner's
 * update matches zero rows and reports `false`, indistinguishable from a
 * missing id — nothing to enumerate. */
export async function renameCollection(
  userId: string,
  id: string,
  name: string,
): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  const result = await db.query(
    `UPDATE collection SET name = $3, updated_at = now()
     WHERE id = $1::uuid AND user_id = $2`,
    [id, userId, name.trim()],
  );
  return (result.rowCount ?? 0) > 0;
}

export type SlugUpdate = "ok" | "taken" | "invalid" | "missing";

export async function updateSlug(
  userId: string,
  id: string,
  slug: string,
): Promise<SlugUpdate> {
  if (!UUID_RE.test(id)) return "missing";
  if (!isValidSlug(slug)) return "invalid";
  try {
    const result = await db.query(
      `UPDATE collection SET slug = $3, updated_at = now()
       WHERE id = $1::uuid AND user_id = $2`,
      [id, userId, slug],
    );
    return (result.rowCount ?? 0) > 0 ? "ok" : "missing";
  } catch (error) {
    // 23505 = unique_violation: the slug belongs to another collection of
    // the same kind. Checked by catching, not pre-querying — the constraint
    // is the truth and a pre-check would race it.
    if ((error as { code?: string })?.code === "23505") return "taken";
    throw error;
  }
}

export async function replaceItems(
  userId: string,
  id: string,
  items: readonly string[],
): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  // The row's own kind decides the grammar — the caller cannot smuggle board
  // keys into a shelf by lying about the kind.
  const { rows } = await db.query<Pick<CollectionRow, "kind">>(
    `SELECT kind FROM collection WHERE id = $1::uuid AND user_id = $2`,
    [id, userId],
  );
  const kind = rows[0]?.kind;
  if (!kind) return false;
  const clean = cleanItems(kind, items);
  const result = await db.query(
    `UPDATE collection SET items = $3::jsonb, updated_at = now()
     WHERE id = $1::uuid AND user_id = $2`,
    [id, userId, JSON.stringify(clean)],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteCollection(
  userId: string,
  id: string,
): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  const result = await db.query(
    `DELETE FROM collection WHERE id = $1::uuid AND user_id = $2`,
    [id, userId],
  );
  return (result.rowCount ?? 0) > 0;
}
