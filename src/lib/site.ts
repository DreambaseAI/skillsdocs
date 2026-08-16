/**
 * Site-wide constants and URL builders.
 *
 * Every absolute URL in the app comes from here so that changing the domain is
 * a one-line change, and so that no route ever hardcodes a path that the
 * router owns.
 */

export const SITE_NAME = "Skills Docs";
export const SITE_TAGLINE = "Human-readable agent skills documentation.";
export const SITE_DESCRIPTION =
  "Turn any repository of agent skills into beautifully typeset, branded documentation. Change “github” to “skillsdocs” in any repo URL and read it properly.";

export const AUTHOR = {
  name: "Kyle Ledbetter",
  url: "https://x.com/kyleledbetter",
};
export const PUBLISHER = { name: "Dreambase", url: "https://dreambase.com" };
export const REPO_URL = "https://github.com/DreambaseAI/skillsdocs";
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
export const SOURCE_URL = process.env.NEXT_PUBLIC_SOURCE_URL ?? REPO_URL;

export const TAKEDOWN_URL =
  process.env.NEXT_PUBLIC_TAKEDOWN_URL ??
  `${SOURCE_URL}/issues/new?labels=takedown&title=Takedown+request`;

// `VERCEL_URL` is the last rung on purpose: it is the per-deployment domain,
// which is set on preview builds where `VERCEL_PROJECT_PRODUCTION_URL` often
// is not. That gap is exactly how a preview shipped
// `<link rel="canonical" href="http://localhost:3000"/>`. A preview
// canonicalising to itself is imperfect; canonicalising to a laptop is not.
/**
 * The production origin.
 *
 * Now that the domain exists it is the default rather than a thing every
 * deploy must remember to configure. Env still wins, so previews and forks
 * override it; what changed is that forgetting no longer publishes a laptop.
 */
export const PRODUCTION_ORIGIN = "https://skillsdocs.com";

const CONFIGURED_SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : null);

/**
 * A production build with no origin configured bakes `http://localhost:3000`
 * into the prerendered `/`, `sitemap.xml`, `llms.txt`, `robots.txt` and every
 * static book page — canonical links, sitemap `<loc>`s and the agent-facing
 * URL patterns all point at the developer's laptop, and setting the variable
 * afterwards cannot fix artefacts that were already written. It fails silently
 * and totally, so it gets a loud line in the build log.
 *
 * Deliberately a warning rather than a throw: the repository's own `pnpm build`
 * gate runs without the variable, and a build that refuses to produce
 * artefacts would make the gate unrunnable. Wire the throw up in CI, where the
 * deploy target is known.
 */
const WARNED = Symbol.for("skillsdocs.site-url-warned");
type WarnedGlobal = typeof globalThis & { [WARNED]?: boolean };

if (
  !CONFIGURED_SITE_URL &&
  // Server only. This module is imported by client components too, and
  // `NODE_ENV` is "production" in the browser bundle as well — the warning
  // shipped to every visitor's console before this guard.
  typeof window === "undefined" &&
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PUBLIC_ALLOW_LOCALHOST_ORIGIN !== "1" &&
  // Next evaluates this module once per build worker and once per server
  // runtime; one line is a warning, thirty-six is noise nobody reads.
  !(globalThis as WarnedGlobal)[WARNED]
) {
  (globalThis as WarnedGlobal)[WARNED] = true;
  console.warn(
    `[site] NEXT_PUBLIC_SITE_URL is not set; falling back to ${PRODUCTION_ORIGIN} ` +
      "as the canonical origin, in sitemap.xml, in llms.txt and in every " +
      "absolute URL. Correct for production, wrong for a preview — set " +
      "NEXT_PUBLIC_SITE_URL (or VERCEL_PROJECT_PRODUCTION_URL) there."
  );
}

/**
 * Canonical origin, no trailing slash.
 *
 * Development stays on localhost so relative testing works; anything built for
 * production without an explicit origin gets the real domain, which is the
 * only value that could ever be correct there.
 */
export const SITE_URL = (
  CONFIGURED_SITE_URL ??
  (process.env.NODE_ENV === "production"
    ? PRODUCTION_ORIGIN
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
  /**
   * A stateless shared shelf: one or more `owner/repo` keys, comma-joined.
   * Slashes and commas are legal in a query value, so the URL stays
   * human-readable — `/share/repos?repos=anthropics/skills,vercel/ai`.
   */
  share: (keys: readonly string[]) => `/share/repos?repos=${keys.join(",")}`,
  /**
   * The skill board: bookmarked skills as `owner/repo/slug` keys,
   * comma-joined and ordered. With keys it is the stateless shared form;
   * without, the visitor's own device board.
   */
  board: (keys?: readonly string[]) =>
    keys && keys.length > 0
      ? `/share/skills?skills=${keys.join(",")}`
      : "/bookmarks",
  /**
   * A reader's pages. `/username` is the profile; `/username/repos/<x>` a
   * shelf and `/username/skills/<x>` a board, where `<x>` is the editable
   * slug or the row's rename-proof uuid.
   */
  userProfile: (username: string) => `/${enc(username)}`,
  userShelves: (username: string) => `/${enc(username)}/repos`,
  userBoards: (username: string) => `/${enc(username)}/skills`,
  userShelf: (username: string, handle: string) =>
    `/${enc(username)}/repos/${enc(handle)}`,
  userBoard: (username: string, handle: string) =>
    `/${enc(username)}/skills/${enc(handle)}`,
  /** The signed-in reader's saved shelves and boards. */
  library: () => "/library",
  book: (owner: string, repo: string) => `/${enc(owner)}/${enc(repo)}`,
  chapter: (owner: string, repo: string, slug: string) =>
    `/${enc(owner)}/${enc(repo)}/${enc(slug)}`,
  /** Markdown twin of a book — this is the book's `llms-full.txt`. */
  bookMarkdown: (owner: string, repo: string) =>
    `/${enc(owner)}/${enc(repo)}.md`,
  chapterMarkdown: (owner: string, repo: string, slug: string) =>
    `/${enc(owner)}/${enc(repo)}/${enc(slug)}.md`,
  bookJson: (owner: string, repo: string) =>
    `/api/v1/books/${enc(owner)}/${enc(repo)}`,
  chapterJson: (owner: string, repo: string, slug: string) =>
    `/api/v1/books/${enc(owner)}/${enc(repo)}/skills/${enc(slug)}`,
  bookIcon: (owner: string, repo: string) =>
    `/api/icon/${enc(owner)}/${enc(repo)}`,
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
    `https://github.com/${owner}/${repo}/blob/${ref}/${path
      .split("/")
      .map(enc)
      .join("/")}`,
  raw: (owner: string, repo: string, ref: string, path: string) =>
    `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path
      .split("/")
      .map(enc)
      .join("/")}`,
  skillsSh: (owner: string, repo: string) => `${SKILLS_SH}/${owner}/${repo}`,
} as const;

/**
 * The install command for a whole repo — `npx skills add <owner>/<repo>`.
 */
export function installCommand(owner: string, repo: string): string {
  return `npx skills add ${owner}/${repo}`;
}

/**
 * The install command for one skill.
 *
 * `--skill <name>` is the CLI's documented per-skill form (vercel-labs/skills
 * README, "Options" and "Examples"). The name is matched case-insensitively
 * against the skill's frontmatter `name` with the directory basename as
 * fallback — which is exactly what `Skill.name` holds — and the README's own
 * example quotes a name containing spaces (`--skill "Convex Best Practices"`).
 *
 * The bare three-segment form `owner/repo/<skill>` is NOT this: the CLI
 * parses it as a repo-relative subpath, so it must never be printed as a
 * per-skill install.
 */
export function skillInstallCommand(
  owner: string,
  repo: string,
  name: string,
): string {
  const quoted = /\s/.test(name) ? `"${name}"` : name;
  return `${installCommand(owner, repo)} --skill ${quoted}`;
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

/**
 * A gist id: 32 (current) or 20 (older) lowercase hex characters. Used to
 * route `/<user>/<id>` to the gist renderer instead of the repo pipeline —
 * with a repo fallback on the other side, since a hex-named repo is legal.
 * The very oldest gists have short decimal ids; those are indistinguishable
 * from ordinary repo names and are deliberately not matched.
 */
const GIST_ID_RE = /^(?:[0-9a-f]{20}|[0-9a-f]{32})$/;

export function isGistId(value: string): boolean {
  return GIST_ID_RE.test(value.toLowerCase());
}

export function isValidRepo(repo: string): boolean {
  return REPO_RE.test(repo) && repo !== "." && repo !== "..";
}

/**
 * The `skills add` CLI family the site itself prints — `npx skills add …`,
 * plus the `pnpm dlx`/`bunx` spellings. Used both to strip the wrapper before
 * parsing and to let the homepage recognise that a paste *was* the install
 * command, so it can teach the swap in the command's own terms.
 */
const INSTALL_COMMAND_RE = /^(?:npx |pnpm dlx |bunx )?skills add\s+/i;

export function isInstallCommand(input: string): boolean {
  return INSTALL_COMMAND_RE.test(input.trim());
}

/**
 * Pull `owner/repo` out of anything a reader might paste: a github.com URL, a
 * raw URL, an `npx skills add` or `/plugin marketplace add` command — with or
 * without flags (`--skill pdf`, `-g`, `--all`) — or the bare slug. Returns
 * null when the input isn't a plausible repo reference.
 */
export function parseRepoReference(
  input: string
): { owner: string; repo: string } | null {
  const cleaned = input
    .trim()
    .replace(/^\/?plugin\s+marketplace\s+add\s+/i, "")
    .replace(INSTALL_COMMAND_RE, "");

  /*
   * Command lines carry flags. Tokenise on whitespace, skip anything
   * flag-shaped, and take the first token that resolves to a repo. A flag's
   * value (`--skill remotion-best-practices`) has no slash, so it can never
   * outrank the repo argument regardless of where the flag sits.
   */
  for (const token of cleaned.split(/\s+/)) {
    if (!token || token.startsWith("-")) continue;
    const ref = parseSingleReference(token);
    if (ref) return ref;
  }
  return null;
}

function parseSingleReference(
  token: string
): { owner: string; repo: string } | null {
  const cleaned = token.replace(/^git\+/, "").replace(/\.git$/, "");

  /*
   * The scheme is optional on every host pattern.
   *
   * The homepage's own placeholder and its first example chip are
   * `github.com/anthropics/skills` — no scheme, because that is what people
   * copy out of a browser's address bar and what the product's whole promise
   * ("swap github.com for this site") is phrased in. With `https?://` required
   * the host survived stripping, `github.com` failed `isValidOwner`, and the
   * headline example fell through to `/search?q=github.com%2F…` and reported
   * no matches. Verified in the browser before the fix.
   */
  const withoutHost = cleaned
    .replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, "")
    .replace(/^(?:https?:\/\/)?raw\.githubusercontent\.com\//i, "")
    // Gists: `/<user>/<id>` survives, and `isGistId` routes it to the gist
    // renderer. The raw host's `/<user>/<id>/raw/…` tail is dropped by the
    // same two-segment split that drops `/tree/main/…` from repo URLs.
    .replace(/^(?:https?:\/\/)?gist\.github\.com\//i, "")
    .replace(/^(?:https?:\/\/)?gist\.githubusercontent\.com\//i, "")
    .replace(/^(?:https?:\/\/)?(?:www\.)?skills\.sh\//i, "")
    // Our own URLs, so a reader who copies one out of the address bar and
    // pastes it back in gets the book rather than a search for the hostname.
    .replace(/^(?:https?:\/\/)?(?:www\.)?skillsdocs\.com\//i, "")
    .replace(/^(?:https?:\/\/)?localhost:\d+\//i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/^\/+/, "");

  const [owner, repo] = withoutHost.split(/[/#?]/).filter(Boolean);
  if (!owner || !repo) return null;
  if (!isValidOwner(owner) || !isValidRepo(repo)) return null;
  return { owner, repo };
}
