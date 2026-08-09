import { ArrowUpRight01Icon, SearchRemoveIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { StateFrame } from "@/components/book/states";
import { Button } from "@/components/ui/button";
import { SITE_NAME } from "@/lib/site";

/**
 * No issue at this address.
 *
 * Serves both cases the route can produce: a repository GitHub does not have,
 * and a chapter slug that is not in this book. It cannot tell them apart —
 * `notFound()` carries no payload — so the copy covers both honestly rather
 * than guessing and being wrong half the time.
 */

export default function BookNotFound() {
  return (
    <main id="main" tabIndex={-1} className="flex flex-1 flex-col">
      <StateFrame
        eyebrow="Not in the catalogue"
        title="There is no issue at this address"
        icon={SearchRemoveIcon}
      >
        <p className="book-standfirst">
          Either GitHub has no public repository at this path, or the chapter
          you asked for is not in this book.
        </p>
        <p>
          Chapter addresses come from the skill&rsquo;s own directory name, and
          they change when a repository is reorganised — an old link can outlive
          the file it pointed at. Opening the issue&rsquo;s cover will show
          every chapter it currently has.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button nativeButton={false} render={<Link href="/" />}>Browse {SITE_NAME}</Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <a
                href="https://github.com/search?q=path%3ASKILL.md&type=code"
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            <HugeiconsIcon
              icon={ArrowUpRight01Icon}
              data-icon="inline-start"
              aria-hidden
            />
            Search GitHub for SKILL.md
          </Button>
        </div>
      </StateFrame>
    </main>
  );
}
