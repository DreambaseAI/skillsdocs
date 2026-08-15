"use client";

/**
 * "Save shelf…" / "Save board…" — the door from the device library into a
 * saved, named collection.
 *
 * Renders nothing for signed-out readers: the device library works without an
 * account and this button must not nag. Signed in, it opens a one-field
 * popover (the name), snapshots the current device keys through the create
 * action, and answers with the new link.
 */

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { createCollectionAction } from "@/app/library/actions";
import { announce } from "@/components/chrome/live-regions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { capture } from "@/lib/analytics";
import { useSession } from "@/lib/auth-client";
import type { CollectionKind } from "@/lib/collections";
import { absoluteUrl, paths } from "@/lib/site";

export interface SaveCollectionButtonProps {
  kind: CollectionKind;
  /** The device keys the new collection snapshots. */
  keys: readonly string[];
  className?: string;
}

export function SaveCollectionButton({
  kind,
  keys,
  className,
}: SaveCollectionButtonProps) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
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
      setOpen(false);
      setName("");
      announce(`Saved as ${result.slug}`);
      toast.success("Saved to your library", { description: url });
    } finally {
      setBusy(false);
    }
  }, [name, busy, kind, keys]);

  if (!session || keys.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="ghost" size="sm" className={className} />}
      >
        Save {kind}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
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
            placeholder={
              kind === "shelf" ? "Weekend reading" : "Deploy toolkit"
            }
            maxLength={80}
          />
          <p className="text-muted-foreground text-xs">
            Saves the {keys.length}{" "}
            {kind === "shelf"
              ? keys.length === 1
                ? "book"
                : "books"
              : keys.length === 1
              ? "skill"
              : "skills"}{" "}
            currently on this device, at a link you can edit later.
          </p>
          <Button type="submit" size="sm" disabled={busy || !name.trim()}>
            Save
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
