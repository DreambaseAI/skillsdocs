"use client";

/**
 * ⌘K — search chapters and books without leaving the page.
 *
 * Ranking is ours (`lib/search.ts`), so cmdk's own substring filter is turned
 * off: it scores by fuzzy match alone and would put a 40-install chapter above
 * the book a reader typed the name of.
 *
 * The palette carries a slice of the corpus, not all of it — every book plus
 * the most-installed chapters, about 20 KB. The last row is always "search
 * everything", which lands on `/search`, where the full ~2,200-chapter index
 * is queried on the server. A palette that quietly searched 22% of the corpus
 * and said nothing would be worse than one that admits its own edge.
 *
 * WCAG 2.1.4: `/` is a single-character shortcut, so it is inert whenever
 * focus is in a text field, a `contenteditable`, or an open dialog. ⌘K carries
 * a modifier and is always live.
 *
 * **Both keys come from the shared keymap** (`useShortcut("search")`), not from
 * a listener of this component's own. The private listener this file used to
 * mount bound a bare `/` that consulted neither the off switch nor the
 * rebinding table, so the two escapes the shortcuts dialog offers were
 * decorative for the one shortcut a reader is most likely to collide with:
 * measured, `/` still opened the palette with shortcuts switched off, and
 * rebinding Search to `S` announced the change and then left `/` working and
 * `S` dead.
 */

import { ArrowRight02Icon, Book02Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { useCallback, useMemo, useRef, useState } from "react";
import { announce } from "@/components/chrome/live-regions";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { useShortcut } from "@/hooks/use-shortcut";
import { foldIndex, searchFolded, type SearchDoc } from "@/lib/search";
import { paths, parseRepoReference } from "@/lib/site";
import { cn } from "@/lib/utils";

const RESULT_LIMIT = 12;

export interface CommandPaletteProps {
  /** Books plus the most-installed chapters, from `getPaletteIndex()`. */
  docs: SearchDoc[];
  className?: string;
}

export function CommandPalette({ docs, className }: CommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Base UI moves focus here when the popup opens. `autoFocus` on the input
  // would fire before the dialog's own focus management and fight it.
  const inputRef = useRef<HTMLInputElement>(null);

  // Folding 600 records is ~1 ms, but it happens on every keystroke otherwise.
  const index = useMemo(() => foldIndex(docs), [docs]);

  // `/` cannot close the palette — focus is in the search field by then, and a
  // single-character shortcut is inert inside a text field — so a toggle here
  // only ever reads as a toggle for ⌘K.
  useShortcut("search", () => setOpen((value) => !value));

  const go = useCallback(
    (href: string, label: string) => {
      posthog.capture("search_result_opened", {
        result_type: href.startsWith("/search") ? "search" : "content",
      });
      setOpen(false);
      announce(`Opening ${label}`);
      router.push(href);
    },
    [router],
  );

  const hits = useMemo(
    () => searchFolded(index, query, { limit: RESULT_LIMIT }),
    [index, query],
  );

  // A pasted URL is not a search — it is a destination, and it outranks
  // everything because the reader already told us exactly what they want.
  const pasted = query.trim().length > 2 ? parseRepoReference(query) : null;

  const books = hits.filter((hit) => hit.doc.kind === "book");
  const chapters = hits.filter((hit) => hit.doc.kind === "chapter");

  // Which group leads is decided by the ranking, not by a fixed order.
  // `lib/search.ts` deliberately lifts a book above its own chapters when the
  // reader types the repo name — rendering Chapters first unconditionally threw
  // that away and put `frontend-design` above `anthropics/skills` for the query
  // "anthropics". `hits` is already sorted, so the leading group is whichever
  // owns the top hit.
  const booksLead = hits.length > 0 && hits[0].doc.kind === "book";
  const suggestions = useMemo(
    () => docs.filter((doc) => doc.kind === "book").slice(0, 6),
    [docs],
  );

  const chaptersGroup = chapters.length > 0 && (
    <CommandGroup heading="Chapters">
      {chapters.map((hit) => (
        <CommandItem
          key={hit.doc.href}
          value={hit.doc.href}
          onSelect={() => go(hit.doc.href, hit.doc.title)}
        >
          <HugeiconsIcon icon={Book02Icon} aria-hidden />
          {/* `min-w-0` on both, so the title shrinks last: a truncated result
              name is useless, a truncated repo path is merely terse. */}
          <span className="min-w-0 flex-1 truncate">{hit.doc.title}</span>
          <span className="text-muted-foreground min-w-0 max-w-[45%] shrink truncate pl-3 text-right text-xs">
            {hit.doc.subtitle}
          </span>
        </CommandItem>
      ))}
    </CommandGroup>
  );

  const booksGroup = (books.length > 0 || query.trim() === "") && (
    <CommandGroup heading={query.trim() === "" ? "Most installed" : "Books"}>
      {(query.trim() === "" ? suggestions : books.map((h) => h.doc)).map((doc) => (
        <CommandItem
          key={doc.href}
          value={doc.href}
          onSelect={() => go(doc.href, doc.title)}
        >
          {doc.avatar ? (
            <Image
              src={doc.avatar}
              alt=""
              width={16}
              height={16}
              className="size-4 rounded"
              aria-hidden
            />
          ) : (
            <HugeiconsIcon icon={Book02Icon} aria-hidden />
          )}
          <span className="min-w-0 flex-1 truncate">{doc.title}</span>
          {doc.subtitle && (
            <span className="text-muted-foreground min-w-0 max-w-[45%] shrink truncate pl-3 text-right text-xs">
              {doc.subtitle}
            </span>
          )}
        </CommandItem>
      ))}
    </CommandGroup>
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("border-rule text-ink-muted hover:text-ink gap-2", className)}
        onClick={() => setOpen(true)}
      >
        <HugeiconsIcon icon={Search01Icon} data-icon="inline-start" aria-hidden />
        {/* `sr-only`, not `hidden`: below `sm` the icon is the only visible
            content and it is `aria-hidden`, which left the button with no
            accessible name at all (axe `button-name`, critical). */}
        <span className="sr-only sm:not-sr-only">Search skills</span>
        <KbdGroup className="ml-1 hidden sm:inline-flex" aria-hidden>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          initialFocus={inputRef}
          className="top-[12vh] max-h-[76vh] translate-y-0 overflow-hidden p-0 sm:max-w-xl"
        >
          {/* Base UI requires the accessible name inside the popup, not beside
              it — a touch screen reader reads the popup subtree only. */}
          <DialogTitle className="sr-only">Search skills and books</DialogTitle>

          {/* `label` is a prop of the Command *root*: cmdk renders a
              visually-hidden <label> from it and points the input's
              `aria-labelledby` at that element. With no label the element is
              empty, and an `aria-labelledby` that resolves to nothing beats the
              placeholder in the name computation — leaving the combobox with an
              accessible name of "" (the only unnamed interactive node in the
              product, found in the CDP AX tree). */}
          <Command
            shouldFilter={false}
            loop
            label="Search chapters, books, or paste a repo URL"
            className="bg-transparent"
          >
            {/* cmdk renders a visually-hidden <label> and points the input's
                `aria-labelledby` at it. With no `label` prop that element is
                empty, and an `aria-labelledby` that resolves to nothing beats
                the placeholder in the name computation — leaving the combobox
                with an accessible name of "" (the only unnamed interactive
                node in the product, found in the CDP AX tree). */}
            <CommandInput
              ref={inputRef}
              value={query}
              onValueChange={setQuery}
              placeholder="Search chapters, books, or paste a repo URL…"
            />

            <CommandList className="max-h-[58vh] px-1 pb-1">
              {query.trim() !== "" && !pasted && hits.length === 0 && (
                <CommandEmpty className="text-ink-muted py-10">
                  Nothing here matches “{query.trim()}”.
                </CommandEmpty>
              )}

              {pasted && (
                <CommandGroup heading="Open">
                  <CommandItem
                    value={`open:${pasted.owner}/${pasted.repo}`}
                    onSelect={() =>
                      go(
                        paths.book(pasted.owner, pasted.repo),
                        `${pasted.owner}/${pasted.repo}`,
                      )
                    }
                  >
                    <HugeiconsIcon icon={ArrowRight02Icon} aria-hidden />
                    <span className="truncate">
                      {pasted.owner}/<span className="font-semibold">{pasted.repo}</span>
                    </span>
                    <span className="text-muted-foreground ml-auto text-xs">Open the book</span>
                  </CommandItem>
                </CommandGroup>
              )}

              {booksLead ? booksGroup : null}
              {chaptersGroup}
              {booksLead ? null : booksGroup}

              {query.trim() !== "" && (
                <CommandGroup heading="Everything else">
                  <CommandItem
                    value="search-all"
                    onSelect={() => go(paths.search(query.trim()), `search for ${query.trim()}`)}
                  >
                    <HugeiconsIcon icon={Search01Icon} aria-hidden />
                    Search every chapter for “{query.trim()}”
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>

            <div className="border-border text-muted-foreground flex items-center justify-between border-t px-4 py-2.5 text-xs">
              <span>
                <KbdGroup>
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd>
                </KbdGroup>{" "}
                to move · <Kbd>↵</Kbd> to open
              </span>
              <span>{docs.length} indexed</span>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
