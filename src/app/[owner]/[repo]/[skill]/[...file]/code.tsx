import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { CodeBlock, type CodeBlockProps } from "@/components/ai-elements/code-block";
import { repoTag } from "@/lib/github";

/**
 * `CodeBlock`, behind a cache scope.
 *
 * **This wrapper is a correctness requirement, not an optimisation** — the
 * same one `app/[owner]/[repo]/render.ts` exists for, and it bit this route
 * the moment source files stopped going through `renderMarkdown`. Somewhere
 * inside Shiki something reads `Date.now()`, and under Cache Components a
 * prerender fails outright when the tree reads an unstable value:
 *
 *     Route "/[owner]/[repo]/[skill]/[...file]": Next.js encountered the
 *     unstable value `Date.now()` while prerendering.
 *
 * The prose path never showed it because `renderMarkdown` already runs inside
 * `getResourceCached`. Highlighting a `.py` in the page body does not, so it
 * gets its own scope here.
 *
 * It is the right call on cost too. Highlighting a 1,000-line schema is the
 * most expensive thing this route does and it produces the same bytes for an
 * hour, and the entry is tagged with the repository so a revalidation of the
 * book drops the file with it.
 */
export async function CachedCodeBlock({
  owner,
  repo,
  ...props
}: CodeBlockProps & { owner: string; repo: string }) {
  "use cache";
  cacheLife("repo");
  cacheTag(repoTag(owner, repo));

  return <CodeBlock {...props} />;
}
