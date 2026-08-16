-- The app's own tables. Idempotent on purpose: `pnpm db:push` applies this
-- file to whatever Postgres the POSTGRES_* env names, dev and prod alike.
-- Better Auth's tables (user, session, account, verification) are NOT here —
-- they belong to `npx @better-auth/cli migrate`.

-- One saved collection: a named, slugged snapshot of a reader's library.
-- `kind` decides the key grammar and the URL namespace:
--   shelf → items are `owner/repo`,            served at /share/<slug|uuid>
--   board → items are `owner/repo/skill-slug`, served at /bookmarks/<slug|uuid>
-- Slugs are unique per kind, not globally — the two namespaces never meet in
-- a URL. Items are an ordered jsonb array of strings, the same shape as the
-- localStorage lists they snapshot; order is meaning (the board's drag).
CREATE TABLE IF NOT EXISTS collection (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('shelf', 'board')),
  name        text NOT NULL,
  slug        text NOT NULL CHECK (slug = lower(slug)),
  items       jsonb NOT NULL DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, slug)
);

CREATE INDEX IF NOT EXISTS collection_user_idx ON collection (user_id, kind);

-- Usernames live on Better Auth's user table but are OUR columns (declared
-- as additionalFields in src/lib/auth.ts, applied here so a deploy needs no
-- second migration tool). "username" is the URL segment — lowercase, unique;
-- "displayUsername" preserves the case the reader typed.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "username" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "displayUsername" text;
CREATE UNIQUE INDEX IF NOT EXISTS user_username_idx ON "user" ("username");

-- Slugs were globally unique per kind before usernames existed; with
-- /username/repos/<slug> URLs the namespace is the owner, so the constraint
-- moves to (user_id, kind, slug). Both statements are re-run-safe.
ALTER TABLE collection DROP CONSTRAINT IF EXISTS collection_kind_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS collection_user_kind_slug_idx
  ON collection (user_id, kind, slug);

-- Backfill for accounts created before usernames: the email's local part,
-- sanitised to the username grammar; collisions (or duplicate local parts)
-- get a short id suffix. Idempotent — only NULL rows are touched.
UPDATE "user" u
SET "username" = s.base, "displayUsername" = s.base
FROM (
  SELECT id,
         btrim(lower(regexp_replace(split_part(email, '@', 1), '[^a-zA-Z0-9-]+', '-', 'g')), '-') AS base
  FROM "user" WHERE "username" IS NULL
) s
WHERE u.id = s.id
  AND u."username" IS NULL
  AND length(s.base) >= 3
  AND NOT EXISTS (SELECT 1 FROM "user" o WHERE o."username" = s.base)
  AND (SELECT count(*) FROM "user" x
       WHERE x."username" IS NULL
         AND btrim(lower(regexp_replace(split_part(x.email, '@', 1), '[^a-zA-Z0-9-]+', '-', 'g')), '-') = s.base) = 1;

UPDATE "user"
SET "username" = btrim(lower(regexp_replace(split_part(email, '@', 1), '[^a-zA-Z0-9-]+', '-', 'g')), '-') || '-' || lower(left(id, 4)),
    "displayUsername" = btrim(lower(regexp_replace(split_part(email, '@', 1), '[^a-zA-Z0-9-]+', '-', 'g')), '-') || '-' || lower(left(id, 4))
WHERE "username" IS NULL;

-- Repair pass: usernames must be lowercase (the URL grammar) — folds any row
-- an earlier backfill left mixed-case. Idempotent by construction.
UPDATE "user"
SET "username" = lower("username"), "displayUsername" = lower("displayUsername")
WHERE "username" IS NOT NULL AND "username" <> lower("username");
