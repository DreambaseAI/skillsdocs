/**
 * The reader-facing user pages: `/username` (profile), `/username/repos`
 * (their shelves) and `/username/skills` (their boards), plus the saved
 * collection bodies the detail routes render.
 *
 * These share their URL shape with book routes — `/anthropics/skills` is a
 * book — so none of them own a route file at the `repos`/`skills` level.
 * The book routes call `resolveUser` first and hand over only when the first
 * segment is a registered username (which the claim rule in `src/lib/users.ts`
 * guarantees can never shadow a real GitHub owner that isn't the same
 * person). Server components throughout; one user lookup per request via
 * `cache`.
 */

import Image from "next/image";
import Link from "next/link";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ownerAccentStyle } from "@/components/home/issue-accent";
import {
  BookcaseFallback,
  ShelfView,
} from "@/components/collections/shelf-view";
import { SkillBoard } from "@/components/board/skill-board";
import { auth } from "@/lib/auth";
import {
  type Collection,
  type CollectionKind,
  getUserCollection,
  listCollections,
} from "@/lib/collections";
import { parseShareRepos } from "@/lib/share";
import { getUserByUsername, type PublicUser } from "@/lib/users";
import { absoluteUrl, paths } from "@/lib/site";

export const resolveUser = cache(getUserByUsername);
export const resolveUserCollection = cache(getUserCollection);
const userCollections = cache(listCollections);

const MONO_LABEL =
  "font-mono text-[0.62rem] font-medium tracking-[0.18em] uppercase";

const KIND_LABELS: Record<
  CollectionKind,
  { plural: string; unit: string; segment: string }
> = {
  shelf: { plural: "Shelves", unit: "repos", segment: "repos" },
  board: { plural: "Boards", unit: "skills", segment: "skills" },
};

function collectionHref(username: string, collection: Collection): string {
  return collection.kind === "shelf"
    ? paths.userShelf(username, collection.slug)
    : paths.userBoard(username, collection.slug);
}

/* ---------------------------------------------------------------- profile */

export async function ProfileBody({ username }: { username: string }) {
  const user = await resolveUser(username.toLowerCase());
  if (!user) notFound();

  const collections = await userCollections(user.id);
  const shelves = collections.filter((c) => c.kind === "shelf");
  const boards = collections.filter((c) => c.kind === "board");

  return (
    <div className="flex flex-col gap-12">
      <div className="flex items-center gap-5">
        {user.image ? (
          <Image
            src={user.image}
            alt=""
            width={64}
            height={64}
            className="size-14 shrink-0 rounded-2xl sm:size-16"
            aria-hidden
          />
        ) : (
          <span
            className="bg-ink/10 text-ink-strong flex size-14 shrink-0 items-center justify-center rounded-2xl text-2xl font-medium sm:size-16"
            aria-hidden
          >
            {user.displayUsername.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className={`${MONO_LABEL} text-issue-accent`}>Reader</p>
          <h1 className="font-display text-ink-strong mt-1 truncate text-[clamp(2rem,6vw,3.2rem)] leading-none tracking-[-0.02em]">
            {user.displayUsername}
          </h1>
          <p className={`${MONO_LABEL} text-ink-muted mt-2.5`}>
            {shelves.length} {shelves.length === 1 ? "shelf" : "shelves"} ·{" "}
            {boards.length} {boards.length === 1 ? "board" : "boards"}
          </p>
        </div>
      </div>

      <CollectionSection user={user} kind="shelf" collections={shelves} />
      <CollectionSection user={user} kind="board" collections={boards} />
    </div>
  );
}

/* --------------------------------------------------------- per-kind index */

export async function KindIndexBody({
  username,
  kind,
}: {
  username: string;
  kind: CollectionKind;
}) {
  const user = await resolveUser(username.toLowerCase());
  if (!user) notFound();
  const collections = (await userCollections(user.id)).filter(
    (c) => c.kind === kind,
  );

  return (
    <div className="flex flex-col gap-10">
      <div className="min-w-0">
        <p className={`${MONO_LABEL} text-issue-accent`}>
          <Link href={paths.userProfile(user.username)} className="hover:underline">
            {user.displayUsername}
          </Link>
        </p>
        <h1 className="font-display text-ink-strong mt-1 text-[clamp(2rem,6vw,3.2rem)] leading-none tracking-[-0.02em]">
          {KIND_LABELS[kind].plural}
        </h1>
      </div>
      <CollectionSection
        user={user}
        kind={kind}
        collections={collections}
        bare
      />
    </div>
  );
}

function CollectionSection({
  user,
  kind,
  collections,
  bare = false,
}: {
  user: PublicUser;
  kind: CollectionKind;
  collections: Collection[];
  bare?: boolean;
}) {
  const labels = KIND_LABELS[kind];
  const indexHref =
    kind === "shelf"
      ? paths.userShelves(user.username)
      : paths.userBoards(user.username);

  return (
    <section aria-label={labels.plural} className="flex flex-col gap-5">
      {!bare && (
        <div className="border-rule/70 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b pb-3">
          <h2 className="font-display text-ink-strong text-2xl tracking-[-0.01em]">
            {labels.plural}
          </h2>
          <Link
            href={indexHref}
            className={`${MONO_LABEL} text-issue-accent no-underline hover:underline`}
          >
            View all <span aria-hidden>→</span>
          </Link>
        </div>
      )}

      {collections.length === 0 ? (
        <p className="text-ink-muted max-w-prose text-sm">
          Nothing here yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {collections.map((collection) => (
            <li key={collection.id}>
              <Link
                href={collectionHref(user.username, collection)}
                className="border-rule/70 hover:border-issue-accent flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 rounded-lg border p-4 no-underline transition-colors sm:p-5"
              >
                <span className="text-ink-strong font-medium">
                  {collection.name}
                </span>
                <span className={`${MONO_LABEL} text-ink-muted shrink-0`}>
                  {collection.items.length} {labels.unit} ·{" "}
                  {collection.updatedAt.toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ----------------------------------------------------------- shelf detail */

export async function SavedShelfBody({
  username,
  handle,
}: {
  username: string;
  handle: string;
}) {
  const shelf = await resolveUserCollection(
    username.toLowerCase(),
    "shelf",
    handle,
  );
  if (!shelf || !shelf.username) notFound();

  const session = await auth.api.getSession({ headers: await headers() });
  const canEdit = session?.user.id === shelf.userId;
  const rows = parseShareRepos(shelf.items.join(","));

  return (
    <ShelfView
      rows={rows}
      label="A saved shelf"
      title={shelf.name}
      shareUrl={absoluteUrl(paths.userShelf(shelf.username, shelf.slug))}
      empty={
        <>This shelf is empty — its owner has not put any repos on it yet.</>
      }
      edit={
        canEdit
          ? {
              id: shelf.id,
              name: shelf.name,
              slug: shelf.slug,
              username: shelf.username,
            }
          : undefined
      }
    />
  );
}

export { BookcaseFallback };

/* ----------------------------------------------------------- board detail */

export async function SavedBoardBody({
  username,
  handle,
}: {
  username: string;
  handle: string;
}) {
  const board = await resolveUserCollection(
    username.toLowerCase(),
    "board",
    handle,
  );
  if (!board || !board.username) notFound();

  const session = await auth.api.getSession({ headers: await headers() });
  const canEdit = session?.user.id === board.userId;

  return (
    <div data-issue="skillsdocs" style={ownerAccentStyle("skillsdocs")}>
      <SkillBoard
        initialKeys={board.items}
        saved={{
          id: board.id,
          name: board.name,
          slug: board.slug,
          username: board.username,
          canEdit,
        }}
      />
    </div>
  );
}
