/**
 * Better Auth server instance. Social-only (GitHub + Google) — there is no
 * email/password surface, so the attack area is two OAuth callbacks.
 *
 * Storage is Postgres via the process-wide pool in `src/lib/db.ts`. Auth's
 * schema is created by `npx @better-auth/cli migrate`; the app's own tables
 * live in `db/schema.sql`, applied by `pnpm db:push`.
 *
 * Server-only: importing this from a client component would drag `pg` into the
 * bundle and fail loudly. Client code talks to `src/lib/auth-client.ts`.
 */

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";

export const auth = betterAuth({
  database: db,
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
  account: {
    accountLinking: {
      // One person, two providers, one account — linked on verified email so
      // a GitHub sign-in and a Google sign-in with the same address don't
      // mint two libraries.
      enabled: true,
      trustedProviders: ["github", "google"],
    },
  },
  // Session cookie is cached for a few minutes so `getSession` doesn't hit
  // Postgres on every server render.
  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
