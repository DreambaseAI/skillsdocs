# Database runbook

Postgres backs the optional account layer only — sign-in and saved
collections. Everything else on the site runs with no database at all (see
README → "Optional: accounts and saved collections"). This file is the
operational side: running it locally, evolving the schema, and production.

Everything here uses `clickhousectl` (the ClickHouse CLI, which also manages
plain Postgres). Install once:

```bash
curl -fsSL https://clickhouse.com/cli | sh   # installs to ~/.local/bin
```

## 1. Local development

Local Postgres is a Docker container managed by `clickhousectl`, named
**githubskills**, keyed to this project directory. Docker Desktop must be
running.

```bash
clickhousectl local postgres start --name githubskills   # start (or resume)
clickhousectl local postgres dotenv --name githubskills --local
                                                         # write POSTGRES_* into .env.local
clickhousectl local server list                          # what's running, which port
clickhousectl local postgres stop githubskills           # stop, KEEPS data
clickhousectl local postgres remove githubskills         # deletes the data too
```

Notes:

- Data lives in `.clickhouse/` (gitignored) and survives `stop`/`start`.
- Defaults: Postgres 18, port 5432 (auto-shifts if taken — always read the
  port from the command output, or from `.env.local` after `dotenv`).
- Ad-hoc SQL: `clickhousectl local postgres client --name githubskills
  --query 'SELECT …'` (wraps psql; no local psql install needed).
- No TLS locally — leave `POSTGRES_SSL` and `POSTGRES_CA` unset.

After first start, create the schema (see next section), then add the auth
env vars from `.env.example` (`BETTER_AUTH_SECRET`, OAuth client IDs with
`<origin>/api/auth/callback/<provider>` callbacks).

## 2. Schema and migrations

Two owners, two mechanisms — do not mix them:

| Tables | Owner | Command |
|---|---|---|
| `user`, `session`, `account`, `verification` | Better Auth | `npx @better-auth/cli migrate` |
| `collection` (and future app tables) | this repo | `pnpm db:push` |

**Better Auth tables** are generated from the config in `src/lib/auth.ts`.
Re-run the CLI after changing that config (adding a plugin, adding
`additionalFields`) — it diffs and applies. These tables are never described
in `db/schema.sql`.

**App tables** live in `db/schema.sql`, applied by `pnpm db:push`
(`scripts/db-push.mts`), which reads `POSTGRES_*` from the environment first
and `.env.local` second.

The migration convention is **idempotent DDL, one committed file** — not
numbered migration files:

- Every statement must be safe to re-run: `CREATE TABLE IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS`.
- To change the schema: edit `db/schema.sql` additively, run `pnpm db:push`
  locally, commit the edit in the same commit as the code that needs it, and
  run `pnpm db:push` against production after deploy (see §3).
- Never edit an existing `CREATE TABLE` body to change a live table — the
  `IF NOT EXISTS` means it silently won't apply. Add an `ALTER` beneath it.
- If a change ever genuinely can't be expressed idempotently (destructive
  renames, data backfills), that's the moment to graduate `db/` to numbered
  migration files with a tracking table — don't force it through this file.

## 3. Production — ClickHouse Cloud managed Postgres

Production is a managed Postgres service in ClickHouse Cloud, driven by the
same CLI. Cloud **write** operations need API-key auth
(`clickhousectl cloud auth login --api-key … --api-secret …`); OAuth login is
read-only.

```bash
clickhousectl cloud postgres list                 # service IDs
clickhousectl cloud postgres get <id>             # state, hostname, size
clickhousectl cloud postgres certs get <id>       # the per-service CA (PEM)
clickhousectl cloud postgres reset-password <id>  # if the password is lost
```

Facts that bite:

- **The password is printed once, at `create` time.** `get` does not return
  it. Losing it means `reset-password`.
- **TLS uses a per-service CA**, not a public chain — `ssl: true` fails with
  "unable to verify the first certificate". Put the PEM from `certs get`
  into `POSTGRES_CA`; both `src/lib/db.ts` and `scripts/db-push.mts`
  understand it.

Connection details live in **`.env.prod.local`** (gitignored, `export`-style
so it can be `source`d). To apply schema changes to production:

```bash
source .env.prod.local
npx @better-auth/cli migrate    # if the auth config changed
pnpm db:push                    # if db/schema.sql changed
```

Deploys don't run migrations — schema changes are applied by hand, before or
with the deploy, and idempotency makes re-running harmless.

**Vercel env** (production; preview/development mirror them): the six
`POSTGRES_*` vars (`HOST`, `PORT`, `USER`, `PASSWORD`, `DATABASE`, `CA`),
`BETTER_AUTH_SECRET` (distinct per environment), `BETTER_AUTH_URL`
(production only — previews must derive the origin from the request, so the
var stays unset there), and the OAuth client IDs/secrets.

## 4. Later: ClickHouse analytics

The planned analytics phase adds an actual ClickHouse database next to this
Postgres: `clickhousectl local server start` for dev, a `clickhouse/` folder
(`tables/`, `materialized_views/`, `queries/`) for committed DDL, app-side
event inserts via `@clickhouse/client`, and ClickPipes CDC
(`clickhousectl cloud clickpipe …`) replicating `user`/`collection` from this
Postgres into ClickHouse Cloud for joined analytics. Until that lands, this
file covers only Postgres.
