"use client";

/**
 * Saving the device library as a named collection, in two wrappers around one
 * form: `SaveCollectionButton` (a popover trigger, used on the device board)
 * and `SaveCollectionDialog` (a controlled dialog, opened from the homepage
 * share menus — a dialog rather than a popover because its opener is a menu
 * item, and the menu unmounts the moment it is chosen).
 *
 * Both snapshot the current device keys through the create action and answer
 * with the new link; `onSaved` hands the created collection back so the
 * caller's share URLs can switch to it immediately.
 */

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { createCollectionAction } from "@/app/library/actions";
import { announce } from "@/components/chrome/live-regions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { capture } from "@/lib/analytics";
import { useSession } from "@/lib/auth-client";
import type { CollectionKind, CollectionSummary } from "@/lib/collections";
import { absoluteUrl, paths } from "@/lib/site";

interface SaveCollectionFormProps {
  kind: CollectionKind;
  keys: readonly string[];
  /** Called with the created collection after a successful save. */
  onSaved?: (saved: CollectionSummary) => void;
  /** Close whatever surface hosts the form. */
  onClose: () => void;
}

function SaveCollectionForm({
  kind,
  keys,
  onSaved,
  onClose,
}: SaveCollectionFormProps) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const create = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const result = await createCollectionAction({
        kind,
        name: trimmed,
        items: keys,
      });
      if (!result.ok) {
        announce(result.error, "assertive");
        toast.error(result.error);
        return;
      }
      capture("collection_created", { kind });
      const url = absoluteUrl(
        kind === "shelf"
          ? paths.sharedShelf(result.slug)
          : paths.sharedBoard(result.slug)
      );
      onClose();
      setName("");
      announce(`Saved as ${result.slug}`);
      toast.success("Saved to your library", { description: url });
      onSaved?.({
        id: result.id,
        kind,
        name: trimmed,
        slug: result.slug,
        itemCount: keys.length,
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setBusy(false);
    }
  }, [name, busy, kind, keys, onSaved, onClose]);

  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        void create();
      }}
    >
      <label htmlFor={`save-${kind}-name`} className="text-sm font-medium">
        Name this {kind}
      </label>
      <Input
        id={`save-${kind}-name`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={kind === "shelf" ? "Weekend reading" : "Deploy toolkit"}
        maxLength={80}
      />
      <p className="text-muted-foreground text-xs">
        Saves the {keys.length}{" "}
        {kind === "shelf"
          ? keys.length === 1
            ? "repo"
            : "repos"
          : keys.length === 1
            ? "skill"
            : "skills"}{" "}
        currently on this device, at a link you can edit later.
      </p>
      <Button type="submit" size="sm" disabled={busy || !name.trim()}>
        Save
      </Button>
    </form>
  );
}

/* ---------------------------------------------------------------- popover */

export interface SaveCollectionButtonProps {
  kind: CollectionKind;
  /** The device keys the new collection snapshots. */
  keys: readonly string[];
  className?: string;
  onSaved?: (saved: CollectionSummary) => void;
}

export function SaveCollectionButton({
  kind,
  keys,
  className,
  onSaved,
}: SaveCollectionButtonProps) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

  if (!session || keys.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="ghost" size="sm" className={className} />}
      >
        Save {kind}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <SaveCollectionForm
          kind={kind}
          keys={keys}
          onSaved={onSaved}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

/* ----------------------------------------------------------------- dialog */

export interface SaveCollectionDialogProps {
  kind: CollectionKind;
  keys: readonly string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (saved: CollectionSummary) => void;
}

export function SaveCollectionDialog({
  kind,
  keys,
  open,
  onOpenChange,
  onSaved,
}: SaveCollectionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Save to your library</DialogTitle>
        </DialogHeader>
        <SaveCollectionForm
          kind={kind}
          keys={keys}
          onSaved={onSaved}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
