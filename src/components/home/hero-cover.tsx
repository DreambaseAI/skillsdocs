/**
 * "This week's cover" — the async right half of the hero.
 *
 * Its own island so the headline and the submission line paint with the
 * shell; the plate lands when the catalogue resolves. The whole island sits
 * inside the featured owner's accent scope, so the newsstand wash, the ruled
 * shelf lines and the plate itself are all in that issue's colours.
 */

import { CoverPlate } from "@/components/home/cover-plate";
import { pickLead } from "@/components/home/contents";
import { ownerAccentStyle } from "@/components/home/issue-accent";
import { getFeaturedBooks } from "@/lib/featured";
import { cn } from "@/lib/utils";

function Stand({
  children,
  eyebrow,
  ...rest
}: React.ComponentProps<"div"> & { eyebrow?: boolean }) {
  return (
    <div
      {...rest}
      className="newsstand flex flex-col gap-6 overflow-hidden px-6 py-10 max-lg:-mx-5 max-lg:px-5 sm:max-lg:-mx-8 sm:max-lg:px-8 lg:justify-center lg:py-12"
    >
      {eyebrow ? (
        <p className="text-issue-accent relative flex items-center gap-3 font-mono text-[0.62rem] font-medium tracking-[0.22em] uppercase lg:hidden">
          <span className="bg-issue-accent h-px w-6" aria-hidden />
          This week&rsquo;s cover
        </p>
      ) : null}
      <div className="relative flex min-h-104 items-center justify-center sm:min-h-128">
        {children}
      </div>
    </div>
  );
}

export async function HeroCover() {
  const books = await getFeaturedBooks();
  const book = pickLead(books);

  return (
    <Stand
      data-issue={book.owner.toLowerCase()}
      style={ownerAccentStyle(book.owner)}
      eyebrow
    >
      {/* The issue behind the issue. */}
      <div
        aria-hidden
        className="cover-behind h-116 w-76 translate-x-16 translate-y-6 rotate-7 max-sm:hidden"
      />
      <CoverPlate
        book={book}
        className="relative motion-safe:sm:-rotate-4"
      />
    </Stand>
  );
}

/** The stand with the plate not yet inked, in the neutral accent. */
export function HeroCoverFallback() {
  const ghost = "bg-(--cover-ink)/12 rounded-sm";
  return (
    <Stand aria-hidden eyebrow={false}>
      <div className="cover-face flex aspect-330/500 w-full max-w-84 flex-col justify-between rounded-md p-6 pl-8">
        <span className={cn(ghost, "h-2.5 w-24")} />
        <div className="flex flex-col gap-3">
          <span className={cn(ghost, "size-8.5 rounded-[0.625rem]")} />
          <span className={cn(ghost, "h-9 w-3/4")} />
          <span className={cn(ghost, "h-px w-full")} />
          <span className={cn(ghost, "h-3.5 w-2/3")} />
          <span className={cn(ghost, "mt-2 h-10 w-32 rounded-full")} />
        </div>
        <span className={cn(ghost, "h-2.5 w-32")} />
      </div>
    </Stand>
  );
}
