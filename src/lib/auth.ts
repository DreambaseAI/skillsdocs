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
import {
  githubLoginExists,
  isValidUsername,
  normalizeUsername,
  usernameFromEmail,
} from "@/lib/users";

/** First free variant of a username candidate: the name, then -2 … -9. */
async function dedupedUsername(candidate: string): Promise<string | null> {
  for (let n = 1; n <= 9; n++) {
    const attempt = n === 1 ? candidate : `${candidate}-${n}`;
    const { rows } = await db.query(
      `SELECT 1 FROM "user" WHERE "username" = $1`,
      [attempt],
    );
    if (!rows[0]) return attempt;
  }
  return null;
}

export const auth = betterAuth({
  database: db,
  user: {
    // Usernames are ours, not a login credential — the columns are applied by
    // db/schema.sql and the values only ever set server-side (`input: false`
    // keeps them out of the sign-up surface).
    additionalFields: {
      username: { type: "string", required: false, input: false },
      displayUsername: { type: "string", required: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Default username at signup. GitHub sign-ins arrive with their own
        // login as the candidate (see mapProfileToUser) — allowed by
        // definition under the claim rule. Anyone else gets their email's
        // local part, but only when GitHub has never issued that name;
        // otherwise the field stays null and /library asks them to choose.
        before: async (user) => {
          const record = user as typeof user & {
            username?: string | null;
            displayUsername?: string | null;
          };
          let candidate = record.username
            ? normalizeUsername(record.username)
            : null;
          let display = record.displayUsername ?? candidate;

          if (candidate && !isValidUsername(candidate)) {
            candidate = null;
            display = null;
          }
          if (!candidate) {
            const fromEmail = usernameFromEmail(user.email ?? "");
            if (
              isValidUsername(fromEmail) &&
              !(await githubLoginExists(fromEmail))
            ) {
              candidate = fromEmail;
              display = fromEmail;
            }
          }

          const username = candidate ? await dedupedUsername(candidate) : null;
          return {
            data: {
              ...user,
              username,
              displayUsername: username ? (display ?? username) : null,
            },
          };
        },
      },
    },
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
      mapProfileToUser: (profile) => ({
        username:
          typeof profile.login === "string"
            ? profile.login.toLowerCase()
            : undefined,
        displayUsername:
          typeof profile.login === "string" ? profile.login : undefined,
      }),
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
