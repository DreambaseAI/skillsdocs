"use client";

/**
 * The signed-in reader's most recent saved collection of a kind — what the
 * homepage share menus point at by default once a saved shelf or board
 * exists.
 *
 * One fetch per user per page load, shared: the shelf row and the board row
 * both ask, and a module-level cache keyed on the user id collapses that into
 * a single `listCollectionsAction` call. Signed out (or while the session is
 * still resolving) the answer is simply `null`, which callers read as "use
 * the stateless URL form".
 */

import { useCallback, useEffect, useState } from "react";
import { listCollectionsAction } from "@/app/library/actions";
import { useSession } from "@/lib/auth-client";
import type { CollectionKind, CollectionSummary } from "@/lib/collections";

let cache: { userId: string; promise: Promise<CollectionSummary[]> } | null =
  null;

function fetchCollections(userId: string): Promise<CollectionSummary[]> {
  if (!cache || cache.userId !== userId) {
    cache = {
      userId,
      promise: listCollectionsAction().then((result) =>
        result.ok ? result.collections : [],
      ),
    };
  }
  return cache.promise;
}

/** Drop the cache — call after a mutation elsewhere (e.g. /library). */
export function invalidateSavedCollections() {
  cache = null;
}

export interface SavedCollection {
  /** Most recently updated saved collection of this kind, or null. */
  saved: CollectionSummary | null;
  /** Push a fresh value after this surface itself created or updated one. */
  setSaved: (saved: CollectionSummary | null) => void;
}

export function useSavedCollection(kind: CollectionKind): SavedCollection {
  const { data: session } = useSession();
  const userId = session?.user.id ?? null;
  // Keyed by user so signing out needs no state write — the derivation below
  // simply stops matching, and a different account never sees stale data.
  const [fetched, setFetched] = useState<{
    userId: string;
    saved: CollectionSummary | null;
  } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void fetchCollections(userId).then((collections) => {
      // The action lists newest-updated first within each kind.
      if (alive) {
        setFetched({
          userId,
          saved: collections.find((c) => c.kind === kind) ?? null,
        });
      }
    });
    return () => {
      alive = false;
    };
  }, [userId, kind]);

  const saved = userId && fetched?.userId === userId ? fetched.saved : null;

  const setSaved = useCallback(
    (next: CollectionSummary | null) => {
      if (userId) setFetched({ userId, saved: next });
    },
    [userId],
  );

  return { saved, setSaved };
}
