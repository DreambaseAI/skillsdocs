"use client";

import { RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect } from "react";
import { UpstreamFailure } from "@/components/book/states";
import { announce } from "@/components/chrome/live-regions";
import { Button } from "@/components/ui/button";
import { useParams } from "next/navigation";

/**
 * The boundary for failures we did not anticipate.
 *
 * The three upstream conditions that are *expected* — repository missing, API
 * quota exhausted, network refused — never reach here: `loader.ts` turns them
 * into designed states inside the page, because a 404 rendered as "something
 * went wrong" is a worse answer than the 404. What is left for this boundary
 * is a genuine bug, and the only useful affordances for a genuine bug are a
 * retry that actually re-runs the render and a way out to the source.
 *
 * `reset()` re-mounts the segment and re-runs the server render. Under Cache
 * Components a transient GitHub failure will not have been cached, so the
 * second attempt is a real attempt rather than a replay of the same error.
 */

export default function BookError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ owner?: string; repo?: string }>();
  const owner = typeof params?.owner === "string" ? params.owner : "this owner";
  const repo = typeof params?.repo === "string" ? params.repo : "this repository";

  useEffect(() => {
    announce("This issue could not be set. A retry button is available.", "assertive");
    // Server errors arrive with a digest and an opaque message; the digest is
    // the only thing that correlates with the server log.
    console.error("[book] render failed", error.digest ?? "", error);
  }, [error]);

  return (
    <main id="main" tabIndex={-1} className="flex flex-1 flex-col">
      <UpstreamFailure
        owner={owner}
        repo={repo}
        detail={error.digest ? `Reference ${error.digest}` : undefined}
        retry={
          <Button type="button" onClick={reset}>
            <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" aria-hidden />
            Try again
          </Button>
        }
      />
    </main>
  );
}
