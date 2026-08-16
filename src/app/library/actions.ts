"use server";

/**
 * Mutations for saved collections — the repo's first server actions.
 *
 * Every action authenticates from the request cookie (`auth.api.getSession`)
 * and passes the session's user id into queries whose WHERE clauses own the
 * authorization — a non-owner's mutation matches zero rows and reports
 * "missing", indistinguishable from an id that never existed.
 *
 * Results are plain discriminated unions, not throws: the callers are forms
 * and menus that need "that link name is taken" as data, and an error thrown
 * from an action reaches the nearest error boundary instead of the field.
 *
 * Known gap, accepted for v1: no rate limiting here (Better Auth's limiter
 * covers only `/api/auth/*`).
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  type CollectionKind,
  type CollectionSummary,
  createCollection,
  deleteCollection,
  isValidName,
  listCollections,
  renameCollection,
  replaceItems,
  summarize,
  updateSlug,
} from "@/lib/collections";
import {
  canClaimUsername,
  normalizeUsername,
  setUsername,
} from "@/lib/users";

export type ActionResult<T = Record<never, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

async function sessionUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

const SIGN_IN = "Sign in to save collections.";

export async function createCollectionAction(input: {
  kind: CollectionKind;
  name: string;
  items: readonly string[];
}): Promise<
  ActionResult<{ id: string; slug: string; username: string | null }>
> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: SIGN_IN };
  if (input.kind !== "shelf" && input.kind !== "board") {
    return { ok: false, error: "Unknown collection kind." };
  }
  if (!isValidName(input.name)) {
    return { ok: false, error: "Give it a name (up to 80 characters)." };
  }
  if (!Array.isArray(input.items)) {
    return { ok: false, error: "Nothing to save." };
  }
  const collection = await createCollection({
    userId,
    kind: input.kind,
    name: input.name,
    items: input.items,
  });
  return {
    ok: true,
    id: collection.id,
    slug: collection.slug,
    username: collection.username,
  };
}

export async function updateUsernameAction(input: {
  username: string;
}): Promise<ActionResult<{ username: string }>> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: SIGN_IN };
  const username = normalizeUsername(input.username);
  const claim = await canClaimUsername(userId, username);
  if (claim === "invalid") {
    return {
      ok: false,
      error:
        "Usernames are 3–30 characters: lowercase letters, digits and hyphens.",
    };
  }
  if (claim === "taken") {
    return { ok: false, error: "That username is taken." };
  }
  try {
    const updated = await setUsername(userId, username, username);
    return updated
      ? { ok: true, username }
      : { ok: false, error: "Not found." };
  } catch (error) {
    // The unique index is the final referee under concurrency.
    if ((error as { code?: string })?.code === "23505") {
      return { ok: false, error: "That username is taken." };
    }
    throw error;
  }
}

export async function listCollectionsAction(): Promise<
  ActionResult<{ collections: CollectionSummary[] }>
> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: SIGN_IN };
  const rows = await listCollections(userId);
  return { ok: true, collections: rows.map(summarize) };
}

export async function renameCollectionAction(input: {
  id: string;
  name: string;
}): Promise<ActionResult> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: SIGN_IN };
  if (!isValidName(input.name)) {
    return { ok: false, error: "Give it a name (up to 80 characters)." };
  }
  const renamed = await renameCollection(userId, input.id, input.name);
  return renamed ? { ok: true } : { ok: false, error: "Not found." };
}

export async function updateSlugAction(input: {
  id: string;
  slug: string;
}): Promise<ActionResult<{ slug: string }>> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: SIGN_IN };
  const slug = input.slug.trim().toLowerCase();
  const result = await updateSlug(userId, input.id, slug);
  switch (result) {
    case "ok":
      return { ok: true, slug };
    case "taken":
      return { ok: false, error: "That link name is taken." };
    case "invalid":
      return {
        ok: false,
        error:
          "Link names are 3–60 characters: lowercase letters, digits and hyphens.",
      };
    case "missing":
      return { ok: false, error: "Not found." };
  }
}

export async function replaceItemsAction(input: {
  id: string;
  items: readonly string[];
}): Promise<ActionResult> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: SIGN_IN };
  if (!Array.isArray(input.items)) {
    return { ok: false, error: "Nothing to save." };
  }
  const replaced = await replaceItems(userId, input.id, input.items);
  return replaced ? { ok: true } : { ok: false, error: "Not found." };
}

export async function deleteCollectionAction(input: {
  id: string;
}): Promise<ActionResult> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: SIGN_IN };
  const deleted = await deleteCollection(userId, input.id);
  return deleted ? { ok: true } : { ok: false, error: "Not found." };
}
