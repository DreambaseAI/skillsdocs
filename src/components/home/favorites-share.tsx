"use client";

/**
 * The action cluster on each "Your favorites" sub-row: a "View more →" link,
 * then a share menu whose footer carries the save action.
 *
 * The share URL is the saved collection's address whenever one exists —
 * sharing should hand out the durable, named link, not a query string — and
 * falls back to the stateless URL form for everyone else. "View more" always
 * shows the *device* set (the working copy), so it stays truthful even when
 * the saved snapshot has drifted.
 *
 * The save item wears three faces: signed out it is disabled with the reason
 * spelled out; signed in with nothing saved it opens the name dialog; signed
 * in with a saved collection it re-snapshots the device keys into it.
 */

import {
  FloppyDiskIcon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { replaceItemsAction } from "@/app/library/actions";
import { announce } from "@/components/chrome/live-regions";
import { SaveCollectionDialog } from "@/components/home/save-collection-button";
import { ShareMenu } from "@/components/home/share-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useSavedCollection } from "@/hooks/use-saved-collection";
import { capture } from "@/lib/analytics";
import { useSession } from "@/lib/auth-client";
import type { CollectionKind } from "@/lib/collections";
import { absoluteUrl, paths, SITE_NAME } from "@/lib/site";

const MONO_LABEL =
  "font-mono text-[0.62rem] font-medium tracking-[0.18em] uppercase";

const NOUNS: Record<CollectionKind, { one: string; many: string }> = {
  shelf: { one: "book", many: "books" },
  board: { one: "skill", many: "skills" },
};

export interface FavoritesShareProps {
  kind: CollectionKind;
  /** The device keys — what "View more" shows and what saving snapshots. */
  keys: readonly string[];
}

export function FavoritesShare({ kind, keys }: FavoritesShareProps) {
  const { data: session, isPending } = useSession();
  const { saved, setSaved } = useSavedCollection(kind);
  const [dialogOpen, setDialogOpen] = useState(false);

  const savedPath = saved
    ? kind === "shelf"
      ? paths.sharedShelf(saved.slug)
      : paths.sharedBoard(saved.slug)
    : null;

  // The working copy: the stateless share page for repos, the device board
  // for skills.
  const viewHref = kind === "shelf" ? paths.share(keys) : paths.board();

  const noun = NOUNS[kind];
  const count = keys.length;
  const shareUrl = absoluteUrl(
    savedPath ?? (kind === "shelf" ? paths.share(keys) : paths.board(keys)),
  );
  const shareTitle = saved
    ? `${saved.name} — ${kind === "shelf" ? "a shared shelf" : "a skill board"} on ${SITE_NAME}`
    : kind === "shelf"
      ? `Favorite skills — a shared shelf on ${SITE_NAME}`
      : `Skill board — bookmarked skills on ${SITE_NAME}`;

  const update = useCallback(async () => {
    if (!saved) return;
    const result = await replaceItemsAction({ id: saved.id, items: keys });
    if (result.ok) {
      capture("collection_updated", { kind });
      announce(`Updated ${saved.name}`);
      toast.success(`Updated “${saved.name}”`, {
        description: `Now ${count} ${count === 1 ? noun.one : noun.many}`,
      });
      setSaved({
        ...saved,
        itemCount: count,
        updatedAt: new Date().toISOString(),
      });
    } else {
      announce(result.error, "assertive");
      toast.error(result.error);
    }
  }, [saved, keys, kind, count, noun, setSaved]);

  return (
    <span className="flex items-center gap-3">
      <Link
        href={viewHref}
        className={`${MONO_LABEL} text-issue-accent no-underline hover:underline`}
      >
        View more <span aria-hidden>→</span>
      </Link>

      <ShareMenu
        url={shareUrl}
        title={shareTitle}
        summary={`${count} ${count === 1 ? noun.one : noun.many} of agent skills, shared as a ${kind}.`}
        menuLabel={kind === "shelf" ? "Share this shelf" : "Share this board"}
        className="text-ink-muted hover:text-issue-accent"
        footer={
          !session ? (
            <DropdownMenuItem
              disabled={true}
              className="flex-col items-start gap-0.5"
            >
              <span className="flex items-center gap-2.5">
                <HugeiconsIcon icon={FloppyDiskIcon} aria-hidden />
                Save to your library
              </span>
              <span className="text-muted-foreground pl-6.5 text-xs font-normal">
                {isPending
                  ? "Checking your session…"
                  : "Create an account to save — sign in from the header"}
              </span>
            </DropdownMenuItem>
          ) : saved ? (
            <DropdownMenuItem onClick={() => void update()}>
              <HugeiconsIcon icon={RefreshIcon} aria-hidden />
              Update “{saved.name}”
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setDialogOpen(true)}>
              <HugeiconsIcon icon={FloppyDiskIcon} aria-hidden />
              Save {kind} to your library…
            </DropdownMenuItem>
          )
        }
      />

      {/* Outside the menu: the menu unmounts when an item is chosen. */}
      <SaveCollectionDialog
        kind={kind}
        keys={keys}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={setSaved}
      />
    </span>
  );
}
