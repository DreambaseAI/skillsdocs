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
