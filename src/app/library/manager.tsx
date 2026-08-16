"use client";

/**
 * The library manager: two storage tabs under the page header.
 *
 * - **Browser Storage** — the device library, exactly one item per kind: the
 *   localStorage shelf and board that every visitor has, account or not.
 *   Signed in, each carries "Save to cloud storage", which snapshots it into
 *   a named collection.
 * - **Cloud Storage** — the saved collections, one card each with rename,
 *   slug editing and delete. Signed out this tab is the pitch: empty states
 *   that ask for an account, with the sign-in buttons right there.
 *
 * The server page hands over the initial cloud list; from then on this
 * component owns it — every mutation calls its server action and re-lists,
 * so the cards always show what the database holds, not what the click
 * hoped. Slug editing is the one field with server-side failure as a normal
 * outcome ("taken"); the error renders under the field, not as a toast,
 * because the fix is another keystroke in the same input.
 */

import { Github01Icon, GoogleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { announce } from "@/components/chrome/live-regions";
import { SaveCollectionDialog } from "@/components/home/save-collection-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBookmarks, useFavorites } from "@/hooks/use-favorites";
import { invalidateSavedCollections } from "@/hooks/use-saved-collection";
import { capture } from "@/lib/analytics";
import { signIn } from "@/lib/auth-client";
import type { CollectionKind, CollectionSummary } from "@/lib/collections";
import { absoluteUrl, paths } from "@/lib/site";
import {
  deleteCollectionAction,
  listCollectionsAction,
  renameCollectionAction,
  updateSlugAction,
} from "./actions";

const MONO_LABEL =
  "font-mono text-[0.62rem] font-medium tracking-[0.18em] uppercase";

const UNITS: Record<CollectionKind, string> = {
  shelf: "repos",
  board: "skills",
};

function collectionPath(kind: CollectionKind, handle: string): string {
  return kind === "shelf"
    ? paths.sharedShelf(handle)
    : paths.sharedBoard(handle);
}

export function LibraryManager({
  initial,
  signedIn,
}: {
  initial: CollectionSummary[];
  signedIn: boolean;
}) {
  const [collections, setCollections] = useState(initial);
  const favorites = useFavorites();
  const bookmarks = useBookmarks();

  const refresh = useCallback(async () => {
    invalidateSavedCollections();
    const result = await listCollectionsAction();
    if (result.ok) setCollections(result.collections);
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className={`${MONO_LABEL} text-issue-accent`}>Saved collections</p>
        <h1 className="font-display text-ink-strong mt-1 text-[clamp(2rem,6vw,3.2rem)] leading-none tracking-[-0.02em]">
          Your library
        </h1>
        <p className={`${MONO_LABEL} text-ink-muted mt-2.5`}>
          Shelves hold repos · boards hold skills · each lives at its own link
        </p>
      </div>

      <Tabs defaultValue={signedIn ? "cloud" : "browser"}>
        <TabsList>
          <TabsTrigger value="browser">Browser Storage</TabsTrigger>
          <TabsTrigger value="cloud">Cloud Storage</TabsTrigger>
        </TabsList>

        <TabsContent value="browser" className="mt-6 flex flex-col gap-10">
          <BrowserSection
            kind="shelf"
            heading="Shelf"
            keys={favorites.keys}
            ready={favorites.ready}
            signedIn={signedIn}
            refresh={refresh}
          />
          <BrowserSection
            kind="board"
            heading="Board"
            keys={bookmarks.keys}
            ready={bookmarks.ready}
            signedIn={signedIn}
            refresh={refresh}
          />
        </TabsContent>

        <TabsContent value="cloud" className="mt-6 flex flex-col gap-10">
          {signedIn ? (
            <>
              <CloudSection
                kind="shelf"
                heading="Shelves"
                collections={collections.filter((c) => c.kind === "shelf")}
                refresh={refresh}
              />
              <CloudSection
                kind="board"
                heading="Boards"
                collections={collections.filter((c) => c.kind === "board")}
                refresh={refresh}
              />
            </>
          ) : (
            <>
              <CloudCta
                heading="Shelves"
                pitch="Name a set of favorite repos and it gets an address of its own — a link that survives this browser and follows your account."
              />
              <CloudCta
                heading="Boards"
                pitch="Pin your bookmarked skills to a named board with a durable, shareable link — reorder it once, share it everywhere."
              />
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* -------------------------------------------------------- browser storage */

function BrowserSection({
  kind,
  heading,
  keys,
  ready,
  signedIn,
  refresh,
}: {
  kind: CollectionKind;
  heading: string;
  keys: readonly string[];
  ready: boolean;
  signedIn: boolean;
  refresh: () => Promise<void>;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const unit = UNITS[kind];
  const empty = ready && keys.length === 0;
  const viewHref =
    kind === "shelf" ? paths.share([...keys]) : paths.board();

  return (
    <section aria-label={heading} className="flex flex-col gap-5">
      <div className="border-rule/70 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b pb-3">
        <h2 className="font-display text-ink-strong text-2xl tracking-[-0.01em]">
          {heading}
        </h2>
        <p className={`${MONO_LABEL} text-ink-muted`}>Stored in this browser</p>
      </div>

      <div className="border-rule/70 flex flex-col gap-3.5 rounded-lg border p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <span className="text-ink-strong font-medium">
            This browser’s {kind}
          </span>
          <span className={`${MONO_LABEL} text-ink-muted shrink-0`}>
            {ready ? `${keys.length} ${unit}` : "…"}
          </span>
        </div>

        {empty ? (
          <p className="text-ink-muted text-sm">
            {kind === "shelf"
              ? "Nothing starred yet — tap ☆ on any repo and it lands here."
              : "Nothing bookmarked yet — the ribbon beside a skill’s title pins it here."}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={viewHref} />}
            >
              Open
            </Button>
            {signedIn && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialogOpen(true)}
              >
                Save to cloud storage
              </Button>
            )}
          </div>
        )}
      </div>

      <SaveCollectionDialog
        kind={kind}
        keys={keys}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => void refresh()}
      />
    </section>
  );
}

/* ---------------------------------------------------------- cloud storage */

function CloudSection({
  kind,
  heading,
  collections,
  refresh,
}: {
  kind: CollectionKind;
  heading: string;
  collections: CollectionSummary[];
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

      {collections.length === 0 ? (
        <p className="text-ink-muted max-w-prose text-sm">
          Nothing saved yet. Save this browser’s{" "}
          {kind === "shelf" ? "shelf" : "board"} from the Browser Storage tab —
          or from the share menu on the homepage.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {collections.map((collection) => (
            <CollectionCard
              // Slug in the key: a successful slug edit re-mounts the card so
              // its draft state starts from the fresh value.
              key={`${collection.id}:${collection.slug}`}
              collection={collection}
              refresh={refresh}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function CloudCta({ heading, pitch }: { heading: string; pitch: string }) {
  const start = useCallback(async (provider: "github" | "google") => {
    capture("sign_in_started", { provider });
    await signIn.social({
      provider,
      callbackURL: window.location.pathname,
    });
  }, []);

  return (
    <section aria-label={heading} className="flex flex-col gap-5">
      <div className="border-rule/70 border-b pb-3">
        <h2 className="font-display text-ink-strong text-2xl tracking-[-0.01em]">
          {heading}
        </h2>
      </div>
      <div className="border-rule/70 flex flex-col items-start gap-4 rounded-lg border border-dashed p-5 sm:p-6">
        <p className="text-ink-muted max-w-prose text-sm">{pitch}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void start("github")}>
            <HugeiconsIcon
              icon={Github01Icon}
              data-icon="inline-start"
              aria-hidden
            />
            Continue with GitHub
          </Button>
          <Button size="sm" variant="outline" onClick={() => void start("google")}>
            <HugeiconsIcon
              icon={GoogleIcon}
              data-icon="inline-start"
              aria-hidden
            />
            Continue with Google
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ card */

function CollectionCard({
  collection,
  refresh,
}: {
  collection: CollectionSummary;
  refresh: () => Promise<void>;
}) {
  const { id, kind } = collection;
  const unit = UNITS[kind];
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
        "assertive",
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
