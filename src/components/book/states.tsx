import {
  Alert01Icon,
  ArrowUpRight01Icon,
  BookOpen01Icon,
  Clock01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { external, SITE_NAME } from "@/lib/site";

/**
 * The states that are not a book.
 *
 * Each of these is a page a real reader will actually land on — an empty
 * repository has 136,000 installs on skills.sh and zero `SKILL.md`, and an
 * unauthenticated deployment runs out of GitHub quota after sixty requests an
 * hour. They are set on the same paper, in the same measure, with the same
 * rules as a chapter opener, because a state that abandons the design language
 * reads as a crash even when it is expected.
 */

/**
 * The shared frame for every not-a-book page.
 *
 * Two things changed here after the visual audit.
 *
 * **The eyebrow is `--ink-muted`, not the issue accent.** "NO CHAPTERS" set in
 * a saturated colour codes as a failure, and an empty repository is not one —
 * the copy under it says so explicitly. An accent eyebrow is for a *place*
 * ("Repo No. 80"), not for a verdict.
 *
 * **The mark is the issue's, not a generic boxed glyph.** The 38px
 * icon-in-a-rounded-square was identical on the empty state and the 404, so
 * the two were formally indistinguishable — and `vercel-labs/next-skills`, a
 * repo with 136k installs, lost every trace of its own identity at exactly the
 * moment it most needed reassurance. Where an avatar is known it is set as the
 * book mark on its accent plate; where it is not, a 120px ghosted display
 * glyph stands in for it.
 */
function StateFrame({
  eyebrow,
  title,
  icon,
  avatar,
  owner,
  children,
}: {
  eyebrow: string;
  title: string;
  icon: typeof BookOpen01Icon;
  /** The owner's avatar, when the repository resolved far enough to have one. */
  avatar?: string | null;
  owner?: string;
  children: ReactNode;
}) {
  return (
    <div className="book-frame book-frame--solo">
      <div className="book-column reader">
        <div className="book-measure relative flex min-h-[60dvh] flex-col justify-center py-16">
          {/* A display glyph at 120px in 8% accent: furniture, not chrome. */}
          <span className="book-state__glyph" aria-hidden="true">
            <HugeiconsIcon icon={icon} className="size-full" strokeWidth={1} />
          </span>

          {avatar ? (
            <span className="book-mark mb-6">
              <Image
                src={avatar}
                alt=""
                width={128}
                height={128}
                unoptimized={false}
              />
            </span>
          ) : owner ? (
            <span className="book-mark mb-6">
              <span className="book-mark__fallback" aria-hidden="true">
                {owner.slice(0, 2)}
              </span>
            </span>
          ) : null}

          <p className="book-eyebrow">{eyebrow}</p>
          <h1 className="book-opener__title mt-3">{title}</h1>
          <hr className="book-rule book-rule--issue mt-6" />
          <div className="mt-6 flex flex-col gap-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ zero skills */

export interface EmptyBookProps {
  owner: string;
  repo: string;
  description?: string | null;
  installs?: number;
  avatar?: string | null;
}

export function EmptyBook({
  owner,
  repo,
  description,
  installs,
  avatar,
}: EmptyBookProps) {
  return (
    <StateFrame
      eyebrow="No skills"
      title="This repository publishes no skills"
      icon={BookOpen01Icon}
      avatar={avatar}
      owner={owner}
    >
      <p className="book-standfirst">
        We walked every directory of{" "}
        <strong className="text-ink-strong">
          {owner}/{repo}
        </strong>{" "}
        on its default branch and found no <code>SKILL.md</code>. There is
        nothing to typeset — which is a fact about the branch, not a judgement
        about the project.
      </p>
      {description ? <p className="text-ink-muted">{description}</p> : null}
      {typeof installs === "number" && installs > 0 ? (
        <p className="book-caption">
          skills.sh reports {installs.toLocaleString("en-GB")} installs for this
          source. Install count is not evidence of content: skills are
          frequently published from a branch, a release artefact, or a submodule
          that the default tree does not carry.
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          nativeButton={false}
          render={
            <a
              href={external.repo(owner, repo)}
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
          Open on GitHub
        </Button>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/" />}
        >
          Browse {SITE_NAME}
        </Button>
      </div>
    </StateFrame>
  );
}

/* ------------------------------------------------------------ rate limit */

export interface RateLimitedProps {
  owner: string;
  repo: string;
  resetAt?: string | null;
}

export function RateLimited({ owner, repo, resetAt }: RateLimitedProps) {
  return (
    <StateFrame
      eyebrow="Press stopped"
      title="GitHub is rate-limiting this deployment"
      icon={Clock01Icon}
    >
      <p className="book-standfirst">
        We could not read{" "}
        <strong className="text-ink-strong">
          {owner}/{repo}
        </strong>{" "}
        because the upstream API quota is exhausted.
      </p>
      <p>
        Unauthenticated requests to GitHub are capped at{" "}
        <strong className="text-ink-strong">60 per hour</strong> per IP address.
        A token raises that to 5,000. If you are running this yourself, set{" "}
        <code className="border-rule bg-paper-raised rounded-sm border px-1.5 py-0.5 text-[0.9em]">
          GITHUB_TOKEN
        </code>{" "}
        in the environment and restart — no scopes are required for public
        repositories.
      </p>
      {resetAt ? (
        <p className="book-caption">
          The current window resets at{" "}
          <time dateTime={resetAt}>
            {new Date(resetAt).toISOString().slice(11, 16)} UTC
          </time>
          .
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          nativeButton={false}
          render={
            <a
              href={external.repo(owner, repo)}
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
          Read it on GitHub instead
        </Button>
      </div>
    </StateFrame>
  );
}

/* ---------------------------------------------------------------- broken */

export function UpstreamFailure({
  owner,
  repo,
  detail,
  retry,
}: {
  owner: string;
  repo: string;
  detail?: string;
  retry?: ReactNode;
}) {
  return (
    <StateFrame
      eyebrow="Press stopped"
      title="This issue could not be set"
      icon={Alert01Icon}
    >
      <p className="book-standfirst">
        Something upstream failed while reading{" "}
        <strong className="text-ink-strong">
          {owner}/{repo}
        </strong>
        . It is usually transient — GitHub timing out, or a file that vanished
        between the tree listing and the read.
      </p>
      {detail ? <p className="book-caption">{detail}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {retry}
        <Button
          variant="outline"
          nativeButton={false}
          render={
            <a
              href={external.repo(owner, repo)}
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
          Open on GitHub
        </Button>
      </div>
    </StateFrame>
  );
}

export { StateFrame };
