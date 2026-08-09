"use client";

/**
 * What the reader actually asked for, on the 404 page.
 *
 * `not-found.tsx` is rendered without params — Next does not tell it which URL
 * missed — so the path is read on the client. It is worth the client component:
 * "we looked for /acme/skills and found no SKILL.md" is a useful 404, and
 * "page not found" is not.
 *
 * When the path parses as a repository reference the most likely explanation
 * is that the repo exists but ships no skills, so the escape hatch offered is
 * GitHub rather than a search box.
 */

import { usePathname } from "next/navigation";
import { external, parseRepoReference } from "@/lib/site";

export function AttemptedPath() {
  const pathname = usePathname();
  const parsed = parseRepoReference(pathname);

  return (
    <div className="border-rule bg-paper-raised/50 rounded-2xl border p-5">
      <p className="text-ink-muted text-[0.7rem] font-semibold tracking-[0.16em] uppercase">
        You asked for
      </p>
      <code className="text-ink mt-2 block font-mono text-sm break-all">{pathname}</code>

      {parsed ? (
        <p className="text-ink-muted mt-4 text-sm leading-relaxed">
          That is a well-formed repository path, so the most likely explanation is that{" "}
          <span className="text-ink font-medium">
            {parsed.owner}/{parsed.repo}
          </span>{" "}
          contains no <code className="font-mono text-[0.9em]">SKILL.md</code> files on its default
          branch — or that it does not exist. Install count is not proof of content:{" "}
          <span className="text-ink">vercel-labs/next-skills</span> has over 136,000 installs and
          zero skills on <code className="font-mono text-[0.9em]">main</code>.{" "}
          <a
            href={external.repo(parsed.owner, parsed.repo)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-issue-accent underline decoration-1 underline-offset-4"
          >
            Check it on GitHub
          </a>
          .
        </p>
      ) : (
        <p className="text-ink-muted mt-4 text-sm leading-relaxed">
          That is not a repository path. Books live at{" "}
          <code className="font-mono text-[0.9em]">/owner/repo</code> — the same shape as the
          GitHub URL, with the host changed.
        </p>
      )}
    </div>
  );
}
