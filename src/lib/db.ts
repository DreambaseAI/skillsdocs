/**
 * The one Postgres pool for the process. Auth and collections both draw from
 * it — two pools would double the connection budget for no benefit, and the
 * managed service in production caps connections.
 *
 * Locally this is the clickhousectl-managed Docker instance; in production a
 * ClickHouse Cloud managed Postgres. Same driver, different env. The pool
 * connects lazily, so importing this module costs nothing until a query runs.
 *
 * Server-only: `pg` must never reach a client bundle.
 */

import { Pool } from "pg";

export const db = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DATABASE,
  // ClickHouse Cloud Postgres requires TLS and presents a per-service CA
  // (fetch with `clickhousectl cloud postgres certs get <id>`), so production
  // sets POSTGRES_CA to that PEM bundle. POSTGRES_SSL=true alone covers a
  // server with a publicly-chained cert. The local Docker instance speaks no
  // TLS and sets neither.
  ssl: process.env.POSTGRES_CA
    ? { ca: process.env.POSTGRES_CA }
    : process.env.POSTGRES_SSL === "true"
      ? true
      : undefined,
});
