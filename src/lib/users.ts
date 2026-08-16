/**
 * Usernames: the reader's URL segment. `/kyleledbetter` is their profile,
 * `/kyleledbetter/repos/<slug>` a shelf, `/kyleledbetter/skills/<slug>` a
 * board.
 *
 * Those paths share their shape with book routes (`/anthropics/skills` IS a
 * book), which makes squatting a real attack: register `anthropics` and you
 * own the flagship book's URL. The claim rule that prevents it:
 *
 *   A username that exists as a GitHub login may only be claimed by the
 *   account whose linked GitHub identity IS that login. Anything else must
 *   not exist on GitHub at all.
 *
 * So kyleledbetter (signed in via GitHub as kyleledbetter) can claim
 * `kyleledbetter`; nobody can claim `anthropics`; and a name GitHub has
 * never issued is first come, first served. When the GitHub API cannot
 * answer, claims fail closed — a name is never granted on a network error.
 *
 * Pure helpers up top (exported for tests), queries below. Server-only.
 */

import { db } from "@/lib/db";

/** 3–30 chars, lowercase alphanumerics and internal hyphens — a strict
 * subset of GitHub's own owner grammar, so every username is also a valid
 * owner segment. */
const USERNAME_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

/**
 * First segments that are already spoken for. Everything routable at the
 * root today plus the words this feature itself gives meaning to.
 */
const RESERVED_USERNAMES = new Set([
  "api",
  "auth",
  "share",
  "bookmarks",
  "library",
  "search",
  "repos",
  "skills",
  "admin",
  "login",
  "logout",
  "signin",
  "signup",
  "settings",
  "account",
  "accounts",
  "me",
  "new",
  "edit",
  "user",
  "users",
  "help",
  "docs",
  "blog",
  "about",
  "opengraph-image",
]);

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidUsername(username: string): boolean {
  return USERNAME_RE.test(username) && !RESERVED_USERNAMES.has(username);
}

/** The email's local part folded to the username grammar; "" when nothing
 * survives. */
export function usernameFromEmail(email: string): string {
  return email
    .split("@", 1)[0]
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/, "");
}

/* ---------------------------------------------------------- GitHub guard */

const GITHUB_API = "https://api.github.com";

function githubHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN;
  return {
    accept: "application/vnd.github+json",
    "user-agent": "skillsdocs",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

/** Does GitHub have a user or org by this login? Errors count as "yes" —
 * the guard fails closed. */
export async function githubLoginExists(login: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${GITHUB_API}/users/${encodeURIComponent(login)}`,
      { headers: githubHeaders(), cache: "no-store" },
    );
    if (response.status === 404) return false;
    return true;
  } catch {
    return true;
  }
}

/** The GitHub login behind this account's linked GitHub identity, or null.
 * We store GitHub's numeric account id; the login comes from the API. */
export async function linkedGithubLogin(
  userId: string,
): Promise<string | null> {
  const { rows } = await db.query<{ account_id: string }>(
    `SELECT "accountId" AS account_id FROM account
     WHERE "userId" = $1 AND "providerId" = 'github'`,
    [userId],
  );
  const accountId = rows[0]?.account_id;
  if (!accountId || !/^\d+$/.test(accountId)) return null;
  try {
    const response = await fetch(`${GITHUB_API}/user/${accountId}`, {
      headers: githubHeaders(),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { login?: unknown };
    return typeof body.login === "string" ? body.login.toLowerCase() : null;
  } catch {
    return null;
  }
}

export type UsernameClaim = "ok" | "invalid" | "taken";

/**
 * May this user claim this (normalized) username? Grammar and reserved
 * words first, then the database, then the GitHub rule.
 */
export async function canClaimUsername(
  userId: string,
  username: string,
): Promise<UsernameClaim> {
  if (!isValidUsername(username)) return "invalid";

  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM "user" WHERE "username" = $1 AND id <> $2`,
    [username, userId],
  );
  if (rows[0]) return "taken";

  const own = await linkedGithubLogin(userId);
  if (own === username) return "ok";
  return (await githubLoginExists(username)) ? "taken" : "ok";
}

/* ---------------------------------------------------------------- queries */

export interface PublicUser {
  id: string;
  name: string;
  image: string | null;
  username: string;
  displayUsername: string;
  createdAt: Date;
}

export async function getUserByUsername(
  username: string,
): Promise<PublicUser | null> {
  if (!USERNAME_RE.test(username)) return null;
  const { rows } = await db.query<{
    id: string;
    name: string;
    image: string | null;
    username: string;
    display_username: string | null;
    created_at: Date;
  }>(
    `SELECT id, name, image, "username", "displayUsername" AS display_username,
            "createdAt" AS created_at
     FROM "user" WHERE "username" = $1`,
    [username],
  );
  const row = rows[0];
  if (!row?.username) return null;
  return {
    id: row.id,
    name: row.name,
    image: row.image,
    username: row.username,
    displayUsername: row.display_username ?? row.username,
    createdAt: row.created_at,
  };
}

export async function getUsername(userId: string): Promise<string | null> {
  const { rows } = await db.query<{ username: string | null }>(
    `SELECT "username" AS username FROM "user" WHERE id = $1`,
    [userId],
  );
  return rows[0]?.username ?? null;
}

/** Caller must have passed `canClaimUsername` first; the unique index is the
 * final referee (23505 surfaces as "taken" upstream). */
export async function setUsername(
  userId: string,
  username: string,
  displayUsername: string,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE "user"
     SET "username" = $2, "displayUsername" = $3, "updatedAt" = now()
     WHERE id = $1`,
    [userId, username, displayUsername],
  );
  return (result.rowCount ?? 0) > 0;
}
