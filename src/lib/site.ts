/**
 * Site-wide constants and URL builders.
 *
 * Every absolute URL in the app comes from here so that changing the domain is
 * a one-line change, and so that no route ever hardcodes a path that the
 * router owns.
 */

export const SITE_NAME = "GitHub Skills Book";
export const SITE_TAGLINE = "Any skills repo, read as a book.";
export const SITE_DESCRIPTION =
  "Turn any GitHub repository of agent skills into a beautifully typeset, branded reading experience. Swap “github.com” for this site and read the docs the way they deserve.";

export const AUTHOR = { name: "Kyle Ledbetter", url: "https://github.com/kyleledbetter" };
export const PUBLISHER = { name: "Dreambase", url: "https://dreambase.com" };
export const COPYRIGHT_YEAR = 2026;

export const SKILLS_SH = "https://www.skills.sh";
export const AGENT_SKILLS_SPEC = "https://agentskills.io/specification";

/**
 * This site's own repository, and the one place a repo owner is told to go.
 *
 * ARCHITECTURE §9 risk 4 makes the takedown path a hard requirement: we
 * republish third-party markdown, so there has to be an obvious, monitored
 * address. An issue tracker beats a mailbox — it is public, it is timestamped,
 * and it does not depend on a mail server nobody has provisioned. Both are
 * overridable by env so a deployment can point at its own.
 */
export const SOURCE_URL =
  process.env.NEXT_PUBLIC_SOURCE_URL ?? `${AUTHOR.url}/githubskills`;

export const TAKEDOWN_URL =
  process.env.NEXT_PUBLIC_TAKEDOWN_URL ??
  `${SOURCE_URL}/issues/new?labels=takedown&title=Takedown+request`;

/** Canonical origin, no trailing slash. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000")
).replace(/\/+$/, "");

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/* ------------------------------------------------------------ path builders */

const enc = encodeURIComponent;

export const paths = {
  home: () => "/",
  search: (q?: string) => (q ? `/search?q=${enc(q)}` : "/search"),
  book: (owner: string, repo: string) => `/${enc(owner)}/${enc(repo)}`,
  chapter: (owner: string, repo: string, slug: string) =>
    `/${enc(owner)}/${enc(repo)}/${enc(slug)}`,
  /** Markdown twin of a book — this is the book's `llms-full.txt`. */
  bookMarkdown: (owner: string, repo: string) => `/${enc(owner)}/${enc(repo)}.md`,
  chapterMarkdown: (owner: string, repo: string, slug: string) =>
    `/${enc(owner)}/${enc(repo)}/${enc(slug)}.md`,
  bookJson: (owner: string, repo: string) => `/api/v1/books/${enc(owner)}/${enc(repo)}`,
  chapterJson: (owner: string, repo: string, slug: string) =>
    `/api/v1/books/${enc(owner)}/${enc(repo)}/skills/${enc(slug)}`,
  bookManifest: (owner: string, repo: string) =>
    `/${enc(owner)}/${enc(repo)}/.well-known/agent-skills/index.json`,
} as const;

/* ------------------------------------------------------------- external */

export const external = {
  repo: (owner: string, repo: string) => `https://github.com/${owner}/${repo}`,
  owner: (owner: string) => `https://github.com/${owner}`,
  /**
   * The owner's avatar, by login.
   *
   * `avatars.githubusercontent.com/<login>` looks right and is wrong: that
   * host keys on the numeric account id, so a login lands on the generic
   * 420×420 Octocat identicon (measured: 5,065 B of placeholder for
   * `anthropics`, against 2,740 B of the real mark). `github.com/<login>.png`
   * is the login-keyed redirect and honours `?size=`.
   *
   * When the API has already given us `owner.avatarUrl` — which is the
   * id-keyed URL and correct — prefer that; this builder is for the case
   * where all we have is a name.
   */
  avatar: (owner: string, size = 128) =>
    `https://github.com/${enc(owner)}.png?size=${size}`,
  file: (owner: string, repo: string, ref: string, path: string) =>
    `https://github.com/${owner}/${repo}/blob/${ref}/${path.split("/").map(enc).join("/")}`,
  raw: (owner: string, repo: string, ref: string, path: string) =>
    `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path.split("/").map(enc).join("/")}`,
  skillsSh: (owner: string, repo: string) => `${SKILLS_SH}/${owner}/${repo}`,
} as const;

/**
 * The install command for a whole repo.
 *
 * Only the repo form is observed in the wild — `npx skills add <owner>/<repo>`.
 * A per-skill form is not part of the documented CLI, so we never invent one.
 */
export function installCommand(owner: string, repo: string): string {
  return `npx skills add ${owner}/${repo}`;
}

/** Claude Code's plugin-marketplace equivalent, when the repo ships a manifest. */
export function marketplaceCommand(owner: string, repo: string): string {
  return `/plugin marketplace add ${owner}/${repo}`;
}

/* ------------------------------------------------------------- validation */

/**
 * GitHub's own rules: 1–39 chars, alphanumerics and single hyphens, no
 * leading or trailing hyphen.
 */
const OWNER_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
/** Repo names are looser — dots, underscores and hyphens are all allowed. */
const REPO_RE = /^[\w.-]{1,100}$/;

export function isValidOwner(owner: string): boolean {
  return OWNER_RE.test(owner);
}

export function isValidRepo(repo: string): boolean {
  return REPO_RE.test(repo) && repo !== "." && repo !== "..";
}

/**
 * Pull `owner/repo` out of anything a reader might paste: a github.com URL, a
 * raw URL, an `npx skills add` command, or the bare slug. Returns null when
 * the input isn't a plausible repo reference.
 */
export function parseRepoReference(
  input: string,
): { owner: string; repo: string } | null {
  const cleaned = input
    .trim()
    .replace(/^(?:npx |pnpm dlx |bunx )?skills add\s+/i, "")
    .replace(/^git\+/, "")
    .replace(/\.git$/, "");

  const withoutHost = cleaned
    .replace(/^https?:\/\/(?:www\.)?github\.com\//i, "")
    .replace(/^https?:\/\/raw\.githubusercontent\.com\//i, "")
    .replace(/^https?:\/\/(?:www\.)?skills\.sh\//i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/^\/+/, "");

  const [owner, repo] = withoutHost.split(/[/#?]/).filter(Boolean);
  if (!owner || !repo) return null;
  if (!isValidOwner(owner) || !isValidRepo(repo)) return null;
  return { owner, repo };
}
