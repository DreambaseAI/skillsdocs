import { ArrowUpRight01Icon, FileBlockIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";

import { StateFrame } from "@/components/book/states";
import { Button } from "@/components/ui/button";
import { SITE_NAME } from "@/lib/site";

/**
 * No such bundled file.
 *
 * Its own state rather than the book's, because the reason is different and
 * the reader's next move is different. A chapter 404 means the slug is wrong;
 * this one means the *skill does not ship that path* — and it is the visible
 * face of the route's security boundary. A traversal attempt, a stale link
 * into a reorganised repository, and a typed-in guess all land here, and none
 * of them causes a byte to be fetched from GitHub.
 *
 * `notFound()` carries no payload, so the copy covers the honest set of
 * causes rather than picking one and being wrong most of the time.
 */

export default function SubchapterNotFound() {
  return (
    <main id="main" tabIndex={-1} className="flex flex-1 flex-col">
      <StateFrame
        eyebrow="Not in this skill"
        title="This skill does not ship that file"
        icon={FileBlockIcon}
      >
        <p className="book-standfirst">
          Bundled files are only ever served from the list the repository&rsquo;s
          own git tree declares for this skill. The path you asked for is not on
          it, so there was nothing to fetch.
        </p>
        <p>
          That usually means one of three things: the file lives under a
          different skill, the repository has been reorganised since the link
          was made, or the path was never real. The skill&rsquo;s appendix
          lists every file it does ship, with the ones that open here numbered
          as subchapters.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button nativeButton={false} render={<Link href="/" />}>
            Browse {SITE_NAME}
          </Button>
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
