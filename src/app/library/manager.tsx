"use client";

/**
 * The library manager: two sections (shelves, boards), one card per saved
 * collection, and a create row that snapshots the device library.
 *
 * The server page hands over the initial list; from then on this component
 * owns it — every mutation calls its server action and then re-lists, so the
 * cards always show what the database holds, not what the click hoped.
 *
 * Slug editing is the one field with server-side failure as a normal outcome
 * ("taken"); the error renders under the field, not as a toast, because the
 * fix is another keystroke in the same input.
 */

import { useCallback, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { announce } from "@/components/chrome/live-regions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBookmarks, useFavorites } from "@/hooks/use-favorites";
import { capture } from "@/lib/analytics";
import type { CollectionKind, CollectionSummary } from "@/lib/collections";
import { absoluteUrl, paths } from "@/lib/site";
import {
  createCollectionAction,
  deleteCollectionAction,
  listCollectionsAction,
  renameCollectionAction,
  replaceItemsAction,
  updateSlugAction,
} from "./actions";

const MONO_LABEL =
  "font-mono text-[0.62rem] font-medium tracking-[0.18em] uppercase";

function collectionPath(kind: CollectionKind, handle: string): string {
  return kind === "shelf"
    ? paths.sharedShelf(handle)
    : paths.sharedBoard(handle);
}

export function LibraryManager({ initial }: { initial: CollectionSummary[] }) {
  const [collections, setCollections] = useState(initial);
  const favorites = useFavorites();
  const bookmarks = useBookmarks();

  const refresh = useCallback(async () => {
    const result = await listCollectionsAction();
    if (result.ok) setCollections(result.collections);
  }, []);

  const deviceKeys: Record<CollectionKind, readonly string[]> = {
    shelf: favorites.keys,
    board: bookmarks.keys,
  };

  return (
    <div className="flex flex-col gap-12">
      <div>
        <p className={`${MONO_LABEL} text-issue-accent`}>Saved collections</p>
        <h1 className="font-display text-ink-strong mt-1 text-[clamp(2rem,6vw,3.2rem)] leading-none tracking-[-0.02em]">
          Your library
        </h1>
        <p className={`${MONO_LABEL} text-ink-muted mt-2.5`}>
          Your saved shelves and boards
        </p>
      </div>

      <Section
        kind="shelf"
        heading="Shelves"
        unit="repos"
        collections={collections.filter((c) => c.kind === "shelf")}
        deviceKeys={deviceKeys.shelf}
        deviceReady={favorites.ready}
        refresh={refresh}
      />
      <Section
        kind="board"
        heading="Boards"
        unit="skills"
        collections={collections.filter((c) => c.kind === "board")}
        deviceKeys={deviceKeys.board}
        deviceReady={bookmarks.ready}
        refresh={refresh}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- section */

function Section({
  kind,
  heading,
  unit,
  collections,
  deviceKeys,
  deviceReady,
  refresh,
}: {
  kind: CollectionKind;
  heading: string;
  unit: string;
  collections: CollectionSummary[];
  deviceKeys: readonly string[];
  deviceReady: boolean;
  refresh: () => Promise<void>;
}) {
  return (
    <section aria-label={heading} className="flex flex-col gap-5">
      <div className="border-rule/70 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b pb-3">
        <h2 className="font-display text-ink-strong text-2xl tracking-[-0.01em]">
          {heading}
        </h2>
        <p className={`${MONO_LABEL} text-ink-muted`}>
          {collections.length} saved
        </p>
      </div>

      <CreateRow
        kind={kind}
        unit={unit}
        deviceKeys={deviceKeys}
        deviceReady={deviceReady}
        refresh={refresh}
      />

      {collections.length === 0 ? (
        <p className="text-ink-muted max-w-prose text-sm">
          Nothing saved yet. Name your current{" "}
          {kind === "shelf" ? "shelf" : "board"} above and it gets an address of
          its own.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {collections.map((collection) => (
            <CollectionCard
              // Slug in the key: a successful slug edit re-mounts the card so
              // its draft state starts from the fresh value.
              key={`${collection.id}:${collection.slug}`}
              collection={collection}
              unit={unit}
              deviceKeys={deviceKeys}
              refresh={refresh}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------- create row */

function CreateRow({
  kind,
  unit,
  deviceKeys,
  deviceReady,
  refresh,
}: {
  kind: CollectionKind;
  unit: string;
  deviceKeys: readonly string[];
  deviceReady: boolean;
  refresh: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const empty = !deviceReady || deviceKeys.length === 0;

  const create = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || busy || empty) return;
    setBusy(true);
    try {
      const result = await createCollectionAction({
        kind,
        name: trimmed,
        items: deviceKeys,
      });
      if (!result.ok) {
        announce(result.error, "assertive");
        toast.error(result.error);
        return;
      }
      capture("collection_created", { kind });
      setName("");
      await refresh();
      const url = absoluteUrl(collectionPath(kind, result.slug));
      announce(`Saved as ${result.slug}`);
      toast.success(`Saved — it lives at ${url}`);
    } finally {
      setBusy(false);
    }
  }, [name, busy, empty, kind, deviceKeys, refresh]);

  return (
    <form
      className="flex flex-wrap items-center gap-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        void create();
      }}
    >
      <label className="sr-only" htmlFor={`create-${kind}`}>
        Name for a new saved {kind}
      </label>
      <Input
        id={`create-${kind}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={`Name this ${kind}…`}
        maxLength={80}
        className="max-w-72"
      />
      <Button type="submit" size="sm" disabled={busy || empty || !name.trim()}>
        Save current {kind}
        {deviceReady ? ` (${deviceKeys.length} ${unit})` : ""}
      </Button>
      {deviceReady && deviceKeys.length === 0 && (
        <span className="text-ink-muted text-xs">
          {kind === "shelf"
            ? "Star some repos first — the shelf saves what you starred."
            : "Bookmark some skills first — the board saves what you pinned."}
        </span>
      )}
    </form>
  );
}

/* ------------------------------------------------------------------ card */

function CollectionCard({
  collection,
  unit,
  deviceKeys,
  refresh,
}: {
  collection: CollectionSummary;
  unit: string;
  deviceKeys: readonly string[];
  refresh: () => Promise<void>;
}) {
  const { id, kind } = collection;
  const [name, setName] = useState(collection.name);
  const [slug, setSlug] = useState(collection.slug);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const href = collectionPath(kind, collection.slug);
  const url = absoluteUrl(href);

  const rename = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === collection.name) return;
    const result = await renameCollectionAction({ id, name: trimmed });
    if (result.ok) {
      announce("Renamed");
      await refresh();
    } else {
      announce(result.error, "assertive");
      toast.error(result.error);
      setName(collection.name);
    }
  }, [name, collection.name, id, refresh]);

  const saveSlug = useCallback(async () => {
    const next = slug.trim().toLowerCase();
    if (next === collection.slug) {
      setSlugError(null);
      return;
    }
    const result = await updateSlugAction({ id, slug: next });
    if (result.ok) {
      setSlugError(null);
      capture("collection_slug_edited");
      announce(`Link changed to ${result.slug}`);
      await refresh();
    } else {
      setSlugError(result.error);
      announce(result.error, "assertive");
    }
  }, [slug, collection.slug, id, refresh]);

  const sync = useCallback(async () => {
    const result = await replaceItemsAction({ id, items: deviceKeys });
    if (result.ok) {
      capture("collection_updated", { kind });
      announce("Updated from this device");
      toast.success(`Updated — now ${deviceKeys.length} ${unit}`);
      await refresh();
    } else {
      announce(result.error, "assertive");
      toast.error(result.error);
    }
  }, [id, kind, deviceKeys, unit, refresh]);

  const remove = useCallback(async () => {
    if (!confirming) {
      setConfirming(true);
      // Two clicks, not a dialog: the second click must land on the same
      // control, and stepping away resets it.
      setTimeout(() => setConfirming(false), 4000);
      return;
    }
    const result = await deleteCollectionAction({ id });
    if (result.ok) {
      capture("collection_deleted", { kind });
      announce("Deleted");
      toast.success(`Deleted “${collection.name}”`);
      await refresh();
    } else {
      announce(result.error, "assertive");
      toast.error(result.error);
    }
  }, [confirming, id, kind, collection.name, refresh]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      capture("link_copied");
      announce("Link copied to clipboard");
      toast.success("Link copied", { description: url });
    } catch {
      announce(
        "Could not copy automatically. The link is shown on screen.",
        "assertive"
      );
      toast.error("Could not copy", { description: url, duration: 20_000 });
    }
  }, [url]);

  return (
    <li className="border-rule/70 flex flex-col gap-3.5 rounded-lg border p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <label className="flex min-w-0 grow items-center gap-2">
          <span className="sr-only">Name</span>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => void rename()}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            maxLength={80}
            className="text-ink-strong max-w-96 font-medium"
          />
        </label>
        <span className={`${MONO_LABEL} text-ink-muted shrink-0`}>
          {collection.itemCount} {unit} · updated{" "}
          {new Date(collection.updatedAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
          })}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex flex-wrap items-center gap-2">
          <span className="text-ink-muted font-mono text-xs">
            {kind === "shelf" ? "/share/" : "/bookmarks/"}
          </span>
          <Input
            value={slug}
            onChange={(event) => {
              setSlug(event.target.value);
              setSlugError(null);
            }}
            onBlur={() => void saveSlug()}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            aria-label="Link name"
            aria-invalid={slugError ? true : undefined}
            maxLength={60}
            className="max-w-64 font-mono text-xs"
          />
        </label>
        {slugError && (
          <p className="text-destructive text-xs" role="alert">
            {slugError}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={href} />}
        >
          Open
        </Button>
        <Button variant="outline" size="sm" onClick={() => void copy()}>
          Copy link
        </Button>
        <Button variant="outline" size="sm" onClick={() => void sync()}>
          Update from this device
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={() => void remove()}
        >
          {confirming ? "Really delete?" : "Delete"}
        </Button>
      </div>
    </li>
  );
}
