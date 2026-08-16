"use client";

/**
 * The owner's pencil on a saved collection page: a popover that renames,
 * re-slugs, or deletes the shelf/board it sits on.
 *
 * Rendered only for the owner — the server page decides that — though every
 * action re-checks ownership server-side regardless. A slug change navigates
 * to the new address (the old one 404s the moment it saves); a delete routes
 * back to the library, because the page it was pressed on no longer exists.
 */

import { PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  deleteCollectionAction,
  renameCollectionAction,
  updateSlugAction,
} from "@/app/library/actions";
import { announce } from "@/components/chrome/live-regions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { invalidateSavedCollections } from "@/hooks/use-saved-collection";
import { capture } from "@/lib/analytics";
import type { CollectionKind } from "@/lib/collections";
import { paths } from "@/lib/site";

export interface EditCollectionButtonProps {
  kind: CollectionKind;
  id: string;
  name: string;
  slug: string;
  className?: string;
}

export function EditCollectionButton({
  kind,
  id,
  name,
  slug,
  className,
}: EditCollectionButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(name);
  const [slugDraft, setSlugDraft] = useState(slug);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const save = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const nextName = nameDraft.trim();
      if (nextName && nextName !== name) {
        const result = await renameCollectionAction({ id, name: nextName });
        if (!result.ok) {
          announce(result.error, "assertive");
          toast.error(result.error);
          return;
        }
      }

      const nextSlug = slugDraft.trim().toLowerCase();
      let slugChanged = false;
      if (nextSlug !== slug) {
        const result = await updateSlugAction({ id, slug: nextSlug });
        if (!result.ok) {
          setSlugError(result.error);
          announce(result.error, "assertive");
          return;
        }
        slugChanged = true;
        capture("collection_slug_edited");
      }

      invalidateSavedCollections();
      setOpen(false);
      announce("Saved");
      toast.success("Saved");
      if (slugChanged) {
        // The old address is already gone; move to the new one.
        router.replace(
          kind === "shelf"
            ? paths.sharedShelf(nextSlug)
            : paths.sharedBoard(nextSlug),
        );
      } else {
        // The name in the hero is server-rendered.
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }, [busy, nameDraft, name, slugDraft, slug, id, kind, router]);

  const remove = useCallback(async () => {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 4000);
      return;
    }
    const result = await deleteCollectionAction({ id });
    if (result.ok) {
      capture("collection_deleted", { kind });
      invalidateSavedCollections();
      announce("Deleted");
      toast.success(`Deleted “${name}”`);
      // The page under our feet is gone; the library is home.
      router.push(paths.library());
    } else {
      announce(result.error, "assertive");
      toast.error(result.error);
    }
  }, [confirming, id, kind, name, router]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          // Fresh drafts each open — the props are the truth.
          setNameDraft(name);
          setSlugDraft(slug);
          setSlugError(null);
          setConfirming(false);
        }
      }}
    >
      <PopoverTrigger
        render={<Button variant="ghost" size="sm" className={className} />}
      >
        <HugeiconsIcon
          icon={PencilEdit02Icon}
          data-icon="inline-start"
          aria-hidden
        />
        Edit
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Name</span>
            <Input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              maxLength={80}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Link</span>
            <span className="flex items-center gap-1.5">
              <span className="text-muted-foreground shrink-0 font-mono text-xs">
                {kind === "shelf" ? "/share/" : "/bookmarks/"}
              </span>
              <Input
                value={slugDraft}
                onChange={(event) => {
                  setSlugDraft(event.target.value);
                  setSlugError(null);
                }}
                aria-invalid={slugError ? true : undefined}
                maxLength={60}
                className="font-mono text-xs"
              />
            </span>
          </label>
          {slugError && (
            <p className="text-destructive text-xs" role="alert">
              {slugError}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={busy || !nameDraft.trim() || !slugDraft.trim()}
            >
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => void remove()}
            >
              {confirming ? "Really delete?" : `Delete ${kind}`}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
