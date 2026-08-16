"use client";

/**
 * The skill board: bookmarked skills as paper stacks pinned to a cork board,
 * one stack per repo, order = the order of the keys.
 *
 * Three modes, one component:
 *
 * - **Shared** (`initialKeys` given): the board is the URL. Dragging writes
 *   the new order back with `history.replaceState` — shallow, no server
 *   round-trip — so the address bar always holds the board you are looking
 *   at, ready to copy.
 * - **Device** (`initialKeys === null`): the board is the visitor's own
 *   bookmarks list; dragging persists the new order to `localStorage`.
 * - **Saved** (`saved` given, with `initialKeys`): a named collection from
 *   the database. The owner's drags persist through the `replaceItems`
 *   action; a visitor's drags rearrange only their own view.
 *
 * Dragging is pointer-events by hand rather than HTML5 drag-and-drop: DnD
 * cannot do touch, and the mockup's mobile gesture is long-press. A stack is
 * one drag unit — the URL keys stay grouped per repo, in stack order, with
 * each repo's internal order preserved. Keyboard users get real controls: a
 * pair of move buttons per stack, invisible until focused.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PaperStack } from "@/components/board/paper-stack";
import { keysOf, stacksOf, type Stack } from "@/components/board/stacks";
import { useBoardBooks } from "@/components/board/use-board-books";
import { announce } from "@/components/chrome/live-regions";
import { EditCollectionButton } from "@/components/home/edit-collection-button";
import { SaveCollectionButton } from "@/components/home/save-collection-button";
import { ShareMenu } from "@/components/home/share-menu";
import { useBookmarks } from "@/hooks/use-favorites";
import { replaceItemsAction } from "@/app/library/actions";
import { capture } from "@/lib/analytics";
import { absoluteUrl, paths, SITE_NAME } from "@/lib/site";
import Link from "next/link";

const MONO_LABEL =
  "font-mono text-[0.62rem] font-medium tracking-[0.18em] uppercase";

/** How far a pointer may wander and still be a click, in px. */
const DRAG_SLOP = 7;
/** Touch: how long a press must hold before it becomes a drag, in ms. */
const HOLD_MS = 320;

export interface SkillBoardSaved {
  id: string;
  name: string;
  slug: string;
  /** True only for the signed-in owner — their drags persist to the server. */
  canEdit: boolean;
}

export interface SkillBoardProps {
  /** The `?skills=` keys, or null for the visitor's own device board. */
  initialKeys: readonly string[] | null;
  /** Present when the board is a saved collection; `initialKeys` holds its
   * items. */
  saved?: SkillBoardSaved;
}

export function SkillBoard({ initialKeys, saved }: SkillBoardProps) {
  const bookmarks = useBookmarks();
  const shared = initialKeys !== null;
  const [paramKeys, setParamKeys] = useState<readonly string[]>(
    initialKeys ?? [],
  );
  const keys = shared ? paramKeys : bookmarks.keys;

  const stacks = useMemo(() => stacksOf(keys), [keys]);
  const books = useBoardBooks(stacks.map((s) => s.repoKey));

  const commit = useCallback(
    (next: Stack[]) => {
      const nextKeys = keysOf(next);
      if (saved) {
        // The view reorders immediately either way; only the owner's order
        // reaches the server. A failed write is announced, not silently lost.
        setParamKeys(nextKeys);
        if (saved.canEdit) {
          void replaceItemsAction({ id: saved.id, items: nextKeys }).then(
            (result) => {
              if (!result.ok) {
                announce("Could not save the new order.", "assertive");
              }
            },
            () => announce("Could not save the new order.", "assertive"),
          );
        }
      } else if (shared) {
        setParamKeys(nextKeys);
        window.history.replaceState(null, "", paths.board(nextKeys));
      } else {
        bookmarks.reorder(nextKeys);
      }
      capture("board_rearranged");
    },
    [shared, saved, bookmarks],
  );

  const moveStack = useCallback(
    (repoKey: string, delta: -1 | 1) => {
      const index = stacks.findIndex((s) => s.repoKey === repoKey);
      const target = index + delta;
      if (index === -1 || target < 0 || target >= stacks.length) return;
      const next = [...stacks];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      commit(next);
      announce(
        `${moved.owner}/${moved.repo} moved to position ${target + 1} of ${next.length}`,
      );
    },
    [stacks, commit],
  );

  /* ---------------------------------------------------------- dragging */

  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const [dragging, setDragging] = useState<string | null>(null);
  const suppressClick = useRef(false);
  const drag = useRef<{
    repoKey: string;
    /** Where the pointer went down — the slop test measures from here. */
    startX: number;
    startY: number;
    /** The pointer's latest position, for re-anchoring after a reorder. */
    lastX: number;
    lastY: number;
    /** The grab point inside the card: the sheet must stay held exactly
     * where it was picked up, through any number of reorders. */
    grabDX: number;
    grabDY: number;
    /** The card's untransformed slot position; translate is measured from
     * here, and it moves every time a reorder gives the card a new slot. */
    homeLeft: number;
    homeTop: number;
    /**
     * Every slot's geometry, captured once at activation, in visual order.
     * Hit-testing runs against these, never against live DOM rects: the DOM
     * lags the reordered state by a React commit, and measuring it mid-drag
     * makes the order thrash. Grid slots do not move during a drag; the
     * cards do.
     */
    slots: { left: number; top: number; width: number; height: number }[];
    active: boolean;
    hold: ReturnType<typeof setTimeout> | null;
    order: Stack[];
  } | null>(null);

  // During a drag the preview order lives here; committed order lives in the
  // keys. `endDrag` clears it because the keys then say the same thing.
  const [orderPreview, setOrderPreview] = useState<Stack[] | null>(null);

  const endDrag = useCallback(
    (commitOrder: boolean) => {
      const state = drag.current;
      if (!state) return;
      if (state.hold) clearTimeout(state.hold);
      const el = itemRefs.current.get(state.repoKey);
      if (el) el.style.translate = "";
      document.body.style.userSelect = "";
      if (state.active) {
        suppressClick.current = true;
        setTimeout(() => {
          suppressClick.current = false;
        }, 0);
        if (commitOrder) commit(state.order);
      }
      drag.current = null;
      setDragging(null);
      setOrderPreview(null);
    },
    [commit],
  );

  /** Promote a pending press to a live drag: fix the grab point inside the
   * card, its untransformed home, and the slot map everything is measured
   * against for the rest of the gesture. */
  const activate = useCallback(() => {
    const state = drag.current;
    if (!state || state.active) return;
    // At activation no reorder has happened yet, so state.order matches the
    // DOM and this reads out the grid's slot geometry in visual order.
    state.slots = state.order.map((stack) => {
      const el = itemRefs.current.get(stack.repoKey);
      const rect = el?.getBoundingClientRect();
      return rect
        ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
        : { left: 0, top: 0, width: 0, height: 0 };
    });
    const from = state.order.findIndex((s) => s.repoKey === state.repoKey);
    const home = state.slots[from];
    if (home) {
      state.grabDX = state.startX - home.left;
      state.grabDY = state.startY - home.top;
      state.homeLeft = home.left;
      state.homeTop = home.top;
    }
    state.active = true;
    setDragging(state.repoKey);
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const state = drag.current;
      if (!state) return;
      state.lastX = event.clientX;
      state.lastY = event.clientY;

      if (!state.active) {
        const slop = Math.hypot(
          event.clientX - state.startX,
          event.clientY - state.startY,
        );
        if (slop < DRAG_SLOP) return;
        if (state.hold) {
          // Touch: movement before the hold elapsed is a scroll, not a drag.
          clearTimeout(state.hold);
          drag.current = null;
          return;
        }
        activate();
      }

      const el = itemRefs.current.get(state.repoKey);
      if (el) {
        el.style.translate = `${event.clientX - state.grabDX - state.homeLeft}px ${event.clientY - state.grabDY - state.homeTop}px`;
      }

      // Hit-test the pointer against the slot map: entering another slot
      // claims its position. Slots are fixed for the whole gesture, so this
      // cannot race the React commit the way live DOM rects do.
      const from = state.order.findIndex((s) => s.repoKey === state.repoKey);
      for (let i = 0; i < state.slots.length; i++) {
        if (i === from) continue;
        const slot = state.slots[i];
        if (
          event.clientX >= slot.left &&
          event.clientX <= slot.left + slot.width &&
          event.clientY >= slot.top &&
          event.clientY <= slot.top + slot.height
        ) {
          const next = [...state.order];
          const [moved] = next.splice(from, 1);
          next.splice(i, 0, moved);
          state.order = next;
          setOrderPreview(next);
          // The card's home is now slot i. Restate the translate from the
          // same grab point once React has committed the new order — the
          // sheet never leaves the cursor's grip.
          requestAnimationFrame(() => {
            const current = drag.current;
            const item = itemRefs.current.get(state.repoKey);
            if (!current?.active || !item) return;
            const home = current.slots[i];
            if (!home) return;
            current.homeLeft = home.left;
            current.homeTop = home.top;
            item.style.translate = `${current.lastX - current.grabDX - home.left}px ${current.lastY - current.grabDY - home.top}px`;
          });
          break;
        }
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      if (drag.current?.active) event.preventDefault();
    };
    const onUp = () => endDrag(true);
    const onCancel = () => endDrag(false);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, [endDrag, activate]);

  const shown = dragging && orderPreview ? orderPreview : stacks;

  const onPointerDown = useCallback(
    (event: React.PointerEvent, repoKey: string) => {
      if (event.button !== 0) return;
      const state = {
        repoKey,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        grabDX: 0,
        grabDY: 0,
        homeLeft: 0,
        homeTop: 0,
        slots: [] as { left: number; top: number; width: number; height: number }[],
        active: false,
        hold: null as ReturnType<typeof setTimeout> | null,
        order: stacks,
      };
      if (event.pointerType === "touch") {
        state.hold = setTimeout(() => {
          const current = drag.current;
          if (!current || current.repoKey !== repoKey) return;
          current.hold = null;
          activate();
        }, HOLD_MS);
      }
      drag.current = state;
    },
    [stacks, activate],
  );

  /* ------------------------------------------------------------- stats */

  const allLoaded = stacks.every((s) => s.repoKey in books);
  const minutes = allLoaded
    ? stacks.reduce((sum, s) => {
        const book = books[s.repoKey];
        if (!book) return sum;
        return (
          sum +
          s.slugs.reduce(
            (m, slug) => m + (book.skills[slug.toLowerCase()]?.minutes ?? 0),
            0,
          )
        );
      }, 0)
    : null;

  const shareUrl = saved
    ? absoluteUrl(paths.sharedBoard(saved.slug))
    : absoluteUrl(paths.board(keys));

  /* ------------------------------------------------------ empty states */

  if (saved && keys.length === 0) {
    return (
      <EmptyBoard>
        This board is empty — its owner has not pinned any skills to it yet.
      </EmptyBoard>
    );
  }
  if (shared && keys.length === 0) {
    return (
      <EmptyBoard>
        This link pins no skills — it may have been trimmed in transit. A
        shared board looks like{" "}
        <code className="text-ink font-mono text-[0.85em]">
          /bookmarks?skills=anthropics/skills/frontend-design
        </code>
        .
      </EmptyBoard>
    );
  }
  if (!shared && bookmarks.ready && keys.length === 0) {
    return (
      <EmptyBoard>
        Nothing is pinned yet. Bookmark a skill — the ribbon beside its title —
        and it lands here as a page on the board.
      </EmptyBoard>
    );
  }

  return (
    <div className="flex flex-col">
      {/* ------------------------------------------------------------ head */}
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div className="min-w-0">
          <p className={`${MONO_LABEL} text-issue-accent`}>
            {saved ? "A saved board" : "Bookmarks"}
          </p>
          <h1 className="font-display text-ink-strong mt-1 text-[clamp(2rem,6vw,3.2rem)] leading-none tracking-[-0.02em]">
            {saved ? saved.name : "Skill board"}
          </h1>
          <p className={`${MONO_LABEL} text-ink-muted mt-2.5`}>
            {keys.length} {keys.length === 1 ? "skill" : "skills"} · from{" "}
            {stacks.length} {stacks.length === 1 ? "repo" : "repos"}
            {minutes ? <> · {minutes} min of reading</> : null}
          </p>
        </div>
        <span className="flex items-center gap-2">
          {/* Saving belongs to the device board only: a saved board already
              has its address, and a `?skills=` board is someone else's. */}
          {!shared && (
            <SaveCollectionButton
              kind="board"
              keys={keys}
              className="border-rule text-ink hover:text-issue-accent rounded-full border"
            />
          )}
          <ShareMenu
            url={shareUrl}
            title={`${saved ? saved.name : "Skill board"} — bookmarked skills on ${SITE_NAME}`}
            summary={`${keys.length} bookmarked ${keys.length === 1 ? "skill" : "skills"}, pinned to a board.`}
            label="Share board"
            menuLabel="Share this board"
            className="border-rule text-ink hover:text-issue-accent rounded-full border"
          />
          {saved?.canEdit && (
            <EditCollectionButton
              kind="board"
              id={saved.id}
              name={saved.name}
              slug={saved.slug}
              className="border-rule text-ink hover:text-issue-accent rounded-full border"
            />
          )}
        </span>
      </div>

      {/* ----------------------------------------------------- the board */}
      <ul
        aria-label="Pinned skills"
        className="pin-board mt-8 grid grid-cols-1 gap-x-10 gap-y-12 rounded-lg p-6 pt-8 pb-10 sm:mt-10 sm:grid-cols-2 sm:p-10 sm:pb-14 xl:grid-cols-3"
      >
        {shown.map((stack) => {
          const book = books[stack.repoKey];
          const top = stack.slugs[0];
          return (
            <PaperStack
              key={stack.repoKey}
              owner={stack.owner}
              repo={stack.repo}
              slug={top}
              count={stack.slugs.length}
              meta={book === undefined ? undefined : book?.skills[top.toLowerCase()] ?? null}
              issueNumber={book?.issueNumber}
              href={paths.chapter(stack.owner, stack.repo, top)}
              rootProps={{
                ref: (el: HTMLLIElement | null) => {
                  if (el) itemRefs.current.set(stack.repoKey, el);
                  else itemRefs.current.delete(stack.repoKey);
                },
                onPointerDown: (e) => onPointerDown(e, stack.repoKey),
                onClickCapture: (e) => {
                  if (suppressClick.current) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                },
                "data-dragging": dragging === stack.repoKey ? "" : undefined,
              } as SkillBoardRootProps}
            >
              <button
                type="button"
                className="paper-move"
                data-dir="earlier"
                onClick={() => moveStack(stack.repoKey, -1)}
              >
                <span aria-hidden>‹</span>
                <span className="sr-only">
                  Move {stack.owner}/{stack.repo} earlier
                </span>
              </button>
              <button
                type="button"
                className="paper-move"
                data-dir="later"
                onClick={() => moveStack(stack.repoKey, 1)}
              >
                <span aria-hidden>›</span>
                <span className="sr-only">
                  Move {stack.owner}/{stack.repo} later
                </span>
              </button>
            </PaperStack>
          );
        })}
      </ul>

      {/* ---------------------------------------------------- captions */}
      <div className="text-ink-muted mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 font-mono text-[0.62rem] tracking-[0.14em] uppercase">
        <span>Drag a page to rearrange · click to read</span>
        <span>
          {saved
            ? saved.canEdit
              ? "Your board — rearranging saves the new order"
              : "A saved board — rearranging here changes only your view"
            : shared
              ? "This board lives in the link — rearranging rewrites it"
              : "Boards stay on this device until you share one"}
        </span>
      </div>
    </div>
  );
}

/** The rootProps shape PaperStack spreads — typed loosely for the data attr. */
type SkillBoardRootProps = React.ComponentPropsWithoutRef<"li"> & {
  ref?: React.Ref<HTMLLIElement>;
  "data-dragging"?: string;
};

function EmptyBoard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-5">
      <h1 className="font-display text-ink-strong text-4xl tracking-[-0.02em]">
        An empty board
      </h1>
      <p className="text-ink-muted max-w-prose">{children}</p>
      <Link
        href={paths.home()}
        className="text-issue-accent font-medium underline decoration-1 underline-offset-4"
      >
        Browse the catalogue
      </Link>
    </div>
  );
}
