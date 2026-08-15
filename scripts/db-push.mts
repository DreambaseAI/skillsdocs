/**
 * Apply `db/schema.sql` to the Postgres named by POSTGRES_*.
 *
 *   pnpm db:push               # local dev (reads .env.local)
 *   POSTGRES_HOST=… pnpm db:push  # prod: env wins over .env.local
 *
 * The schema file is idempotent DDL, so re-running is always safe. tsx does
 * not load env files — Next.js only does that for the app — so this loads
 * `.env.local` itself, without overriding anything already in the env.
 */

import { readFileSync } from "node:fs";
import { Pool } from "pg";

try {
  const already = new Set(Object.keys(process.env));
  const before = { ...process.env };
  process.loadEnvFile(".env.local");
  // loadEnvFile overrides; restore anything the caller had set explicitly.
  for (const key of already) process.env[key] = before[key];
} catch {
  // No .env.local — fine when the caller provides the env directly.
}

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DATABASE,
  // Same TLS ladder as src/lib/db.ts: a custom CA (ClickHouse Cloud), plain
  // verified TLS, or none (local Docker).
  ssl: process.env.POSTGRES_CA
    ? { ca: process.env.POSTGRES_CA }
    : process.env.POSTGRES_SSL === "true"
      ? true
      : undefined,
});

const sql = readFileSync("db/schema.sql", "utf8");

try {
  await pool.query(sql);
  const { rows } = await pool.query(
    "SELECT count(*)::int AS n FROM collection",
  );
  console.log(`schema applied — collection table has ${rows[0].n} row(s)`);
} finally {
  await pool.end();
}
