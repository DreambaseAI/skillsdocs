/**
 * A gist, reshaped into the inputs `assembleBook` already understands.
 *
 * Gists are flat and their files are never named `SKILL.md` (the observed
 * form is `create-pr-skill.md`), so instead of loosening discovery for a
 * second layout grammar, each markdown file is projected to
 * `<stem>/SKILL.md` — the exact shape `discoverSkills` was built for. One
 * file becomes one chapter; the stem becomes the directory, so the slug,
 * the name fallback and the grouping all come out of the existing machinery
 * unchanged. Non-markdown files are dropped: a synthesized resource would be
 * re-fetched by the file routes from raw.githubusercontent.com, which does
 * not serve gists.
 *
 * Pure and network-free, like `assembleBook`, so the projection is testable
 * against a captured gist without a browser or a token.
 */

import type { GistFile, GistMeta, RepoMeta, TreeEntry } from "./github";
import { discoverSkills, titleCase } from "./skills";

const MARKDOWN_RE = /\.(?:md|markdown)$/i;

/**
 * The cover headline. A gist's URL identity is a hex hash, so the description
 * ("PR Review Guide Template") is the only human title it has. A short
 * description becomes the title outright; a long one stays the dek and the
 * first file's stem is promoted instead.
 */
const DISPLAY_NAME_MAX = 80;

export interface GistBookInputs {
  repo: RepoMeta;
  entries: TreeEntry[];
  /** Bodies in `discoverSkills` stub order, as `assembleBook` expects. */
  sources: Array<string | null>;
}

/**
 * Deep link to one file on the gist page, using GitHub's own anchor scheme
 * (`#file-` + the filename with every non-alphanumeric run collapsed to `-`).
 */
export function gistFileUrl(gistHtmlUrl: string, fileName: string): string {
  return `${gistHtmlUrl}#file-${fileName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export function gistBookInputs(gist: GistMeta): GistBookInputs {
  const markdown = gist.files.filter((f) => MARKDOWN_RE.test(f.name));

  const entries: TreeEntry[] = markdown.map((f) => ({
    path: `${f.name.replace(MARKDOWN_RE, "")}/SKILL.md`,
    type: "blob",
    size: f.size,
    // Never a real git sha — only needs to be unique so dedup can't collapse
    // two distinct files (gist filenames are unique by construction).
    sha: `gist:${gist.id}:${f.name}`,
  }));

  const contentByPath = new Map<string, string | null>(
    markdown.map((f, i) => [entries[i].path, f.content]),
  );
  const sources = discoverSkills(entries, gist.id).map(
    (stub) => contentByPath.get(stub.skillMdPath) ?? null,
  );

  return { repo: gistRepoMeta(gist, markdown), entries, sources };
}

function gistRepoMeta(gist: GistMeta, markdown: GistFile[]): RepoMeta {
  const short =
    gist.description && gist.description.length <= DISPLAY_NAME_MAX
      ? gist.description
      : null;
  const stem = markdown[0]?.name.replace(MARKDOWN_RE, "");

  return {
    owner: gist.owner,
    repo: gist.id,
    fullName: `${gist.owner}/${gist.id}`,
    displayName: short ?? (stem ? titleCase(stem) : `Gist ${gist.id.slice(0, 7)}`),
    // Consumed as the title above, so it would only echo as the dek.
    description: short ? null : gist.description,
    // Gists have no branches to speak of; only relative-link resolution ever
    // reads this, and gist markdown has no repo to be relative to.
    defaultBranch: "main",
    homepage: null,
    stars: 0,
    forks: 0,
    watchers: 0,
    openIssues: 0,
    topics: [],
    license: null,
    pushedAt: gist.updatedAt,
    createdAt: gist.createdAt,
    archived: false,
    isFork: false,
    htmlUrl: gist.htmlUrl,
    ownerAvatar: gist.ownerAvatar,
    ownerType: gist.ownerType,
    ownerUrl: gist.ownerUrl,
  };
}
