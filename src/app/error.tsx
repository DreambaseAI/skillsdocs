"use client";

/**
 * The site-wide error boundary.
 *
 * Next 16 passes `retry`, not `reset`: it re-fetches and re-renders the
 * segment inside a Transition rather than only clearing the error state, which
 * is what a transient upstream failure actually needs.
 *
 * Nearly every failure this app can have is GitHub saying no, and the most
 * common one by far is the unauthenticated rate limit — 60 requests an hour
 * against a 5,000/hour authenticated ceiling. That case gets named, with the
 * fix, because a self-hoster hitting it will otherwise conclude the app is
 * broken.
 *
 * Detection is best-effort by design. In production Next replaces a Server
 * Component's error message with a generic one plus a digest, so the
 * rate-limit branch fires reliably only in development and for client-side
 * failures. The hint is therefore also present, less prominently, on the
 * generic path — it is never wrong to mention, and always useless to hide.
 */

import { Alert02Icon, Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { paths } from "@/lib/site";

const RATE_LIMITED = /rate.?limit|\b403\b|secondary rate/i;

export default function GlobalErrorBoundary({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Server-side failures are already logged upstream; this catches the
    // client-side ones, which otherwise vanish.
    console.error("[skillsdocs]", error);
  }, [error]);

  const rateLimited = RATE_LIMITED.test(error.message);

  return (
    <main id="main" tabIndex={-1} className="bg-paper text-ink flex flex-1 items-center px-5 py-20 sm:px-8">
      <div className="mx-auto w-full max-w-2xl">
        <p className="text-ink-muted flex items-center gap-2 text-[0.72rem] font-semibold tracking-[0.2em] uppercase">
          <HugeiconsIcon icon={Alert02Icon} className="size-4" aria-hidden />
          Something upstream went wrong
        </p>

        <h1 className="font-display text-ink-strong mt-4 text-[clamp(2rem,5.5vw,3.25rem)] leading-[1.03] tracking-[-0.03em] text-balance">
          {rateLimited ? "GitHub is rate-limiting us." : "This page did not come back."}
        </h1>

        <p className="text-ink mt-5 text-lg leading-relaxed">
          {rateLimited
            ? "Unauthenticated requests to the GitHub API are capped at 60 per hour. Once that budget is spent, no book can be assembled until it resets."
            : "Books are assembled live from GitHub, so a slow or failing upstream shows up here. It is usually transient."}
        </p>

        <div className="mt-8 flex flex-wrap gap-2">
          <Button type="button" size="lg" onClick={() => retry()}>
            <HugeiconsIcon icon={Refresh01Icon} data-icon="inline-start" aria-hidden />
            Try again
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="border-rule"
            nativeButton={false}
            render={<Link href={paths.home()} />}
          >
            Back to the index
          </Button>
        </div>

        <section
          aria-labelledby="error-token-heading"
          className="border-rule bg-paper-raised/50 mt-12 rounded-2xl border p-5"
        >
          <h2
            id="error-token-heading"
            className="text-ink-muted text-[0.7rem] font-semibold tracking-[0.16em] uppercase"
          >
            {rateLimited ? "The fix" : "Running this yourself?"}
          </h2>
          <p className="text-ink-muted mt-3 text-sm leading-relaxed">
            Set a <code className="text-ink font-mono text-[0.9em]">GITHUB_TOKEN</code> in the
            environment. A personal access token with no scopes at all is enough — it raises the
            API ceiling from 60 requests an hour to 5,000.
          </p>
          <code className="text-ink border-rule bg-paper mt-4 block rounded-xl border px-3 py-2.5 font-mono text-[0.8rem] break-all">
            GITHUB_TOKEN=ghp_… pnpm dev
          </code>
        </section>

        {error.digest && (
          <p className="text-ink-muted mt-6 font-mono text-xs">Reference: {error.digest}</p>
        )}
      </div>
    </main>
  );
}
