/**
 * What the contents page looks like before the catalogue resolves.
 *
 * Shaped like the real thing — a wide lead, three features, a run of index
 * rows — because a spinner in the place of a contents page tells the reader
 * nothing and shifts every pixel when it resolves. Purely decorative, so the
 * whole thing is hidden from assistive technology and the Suspense boundary's
 * own busy state does the announcing.
 */

import { Skeleton } from "@/components/ui/skeleton";

const INDEX_ROWS = 10;

export function ContentsSkeleton() {
  return (
    <div className="flex flex-col gap-16 sm:gap-20" aria-hidden="true">
      <div className="border-rule rounded-3xl border p-6 sm:p-9">
        <Skeleton className="h-3 w-32" />
        <div className="mt-5 flex items-start gap-4">
          <Skeleton className="size-14 rounded-2xl sm:size-16" />
          <div className="flex-1">
            <Skeleton className="h-9 w-3/5 max-w-sm" />
            <Skeleton className="mt-3 h-3 w-28" />
          </div>
        </div>
        <Skeleton className="mt-6 h-5 w-full max-w-xl" />
        <Skeleton className="mt-2 h-5 w-4/5 max-w-md" />
        <div className="mt-8 flex gap-3">
          <Skeleton className="h-11 w-40 rounded-full" />
          <Skeleton className="size-9 rounded-full" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="border-rule rounded-2xl border p-5">
            <Skeleton className="size-10 rounded-xl" />
            <Skeleton className="mt-4 h-6 w-3/4" />
            <Skeleton className="mt-3 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-2/3" />
            <Skeleton className="mt-6 h-3 w-1/2" />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-40" />
        {Array.from({ length: INDEX_ROWS }, (_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="size-7 rounded-lg" />
            <Skeleton className="h-3 flex-1" style={{ maxWidth: `${70 - i * 3}%` }} />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}
