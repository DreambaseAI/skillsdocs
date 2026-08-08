/**
 * GitHub data access.
 *
 * Budget discipline matters here: unauthenticated GitHub is 60 req/hr, so an
 * entire book is built from exactly TWO API calls (repo metadata + one
 * recursive tree) plus raw.githubusercontent reads, which are CDN-served and
 * not counted against the API quota.
 *
 * Set GITHUB_TOKEN to lift the ceiling to 5000 req/hr.
 */

const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";

/** Cache windows, in seconds. */
export const REVALIDATE = {
  repo: 60 * 60 * 6, // repo metadata: stars move slowly
  tree: 60 * 60 * 6, // file listing
  content: 60 * 60 * 12, // file bodies change least often
  owner: 60 * 60 * 24,
} as const;

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: "not-found" | "rate-limited" | "network" | "other",
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

function headers(): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "github-skills-book",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function ghJson<T>(path: string, revalidate: number): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      headers: headers(),
      next: { revalidate },
    });
  } catch (cause) {
    throw new GitHubError(
      `Could not reach GitHub: ${(cause as Error).message}`,
      0,
      "network",
    );
  }

  if (res.ok) return (await res.json()) as T;

  if (res.status === 404) {
    throw new GitHubError(`Not found: ${path}`, 404, "not-found");
  }
  // GitHub reports quota exhaustion as 403/429 with a zeroed remaining header.
  if (
    (res.status === 403 || res.status === 429) &&
    res.headers.get("x-ratelimit-remaining") === "0"
  ) {
    const reset = Number(res.headers.get("x-ratelimit-reset") ?? 0) * 1000;
    throw new GitHubError(
      `GitHub API rate limit reached. Resets ${reset ? new Date(reset).toISOString() : "shortly"}. Set GITHUB_TOKEN to raise the limit.`,
      res.status,
      "rate-limited",
    );
  }
  throw new GitHubError(
    `GitHub responded ${res.status} for ${path}`,
    res.status,
    "other",
  );
}

/* ------------------------------------------------------------------ types */

export interface RepoMeta {
  owner: string;
  repo: string;
  fullName: string;
  defaultBranch: string;
  description: string | null;
  homepage: string | null;
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  topics: string[];
  license: { key: string; name: string; spdxId: string | null } | null;
  pushedAt: string | null;
  createdAt: string | null;
  archived: boolean;
  isFork: boolean;
  htmlUrl: string;
  ownerAvatar: string;
  ownerType: "User" | "Organization" | string;
  ownerUrl: string;
}

export interface TreeEntry {
  path: string;
  type: "blob" | "tree" | "commit";
  size?: number;
  sha: string;
}

export interface RepoTree {
  entries: TreeEntry[];
  /** GitHub caps tree responses; a truncated tree may be missing skills. */
  truncated: boolean;
}

export interface OwnerMeta {
  login: string;
  name: string | null;
  bio: string | null;
  blog: string | null;
  avatar: string;
  htmlUrl: string;
  type: string;
  location: string | null;
  twitter: string | null;
  publicRepos: number;
  followers: number;
}

/* --------------------------------------------------------------- fetchers */

interface RawRepo {
  name: string;
  full_name: string;
  default_branch: string;
  description: string | null;
  homepage: string | null;
  stargazers_count: number;
  forks_count: number;
  subscribers_count?: number;
  watchers_count: number;
  open_issues_count: number;
  topics?: string[];
  license: { key: string; name: string; spdx_id: string | null } | null;
  pushed_at: string | null;
  created_at: string | null;
  archived: boolean;
  fork: boolean;
  html_url: string;
  owner: {
    login: string;
    avatar_url: string;
    type: string;
    html_url: string;
  };
}

export async function fetchRepoMeta(
  owner: string,
  repo: string,
): Promise<RepoMeta> {
  const r = await ghJson<RawRepo>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    REVALIDATE.repo,
  );
  return {
    // Use GitHub's canonical casing, not whatever casing the URL had.
    owner: r.owner.login,
    repo: r.name,
    fullName: r.full_name,
    defaultBranch: r.default_branch,
    description: r.description,
    homepage: r.homepage?.trim() || null,
    stars: r.stargazers_count,
    forks: r.forks_count,
    watchers: r.subscribers_count ?? r.watchers_count,
    openIssues: r.open_issues_count,
    topics: r.topics ?? [],
    license: r.license
      ? { key: r.license.key, name: r.license.name, spdxId: r.license.spdx_id }
      : null,
    pushedAt: r.pushed_at,
    createdAt: r.created_at,
    archived: r.archived,
    isFork: r.fork,
    htmlUrl: r.html_url,
    ownerAvatar: r.owner.avatar_url,
    ownerType: r.owner.type,
    ownerUrl: r.owner.html_url,
  };
}

export async function fetchRepoTree(
  owner: string,
  repo: string,
  ref: string,
): Promise<RepoTree> {
  const data = await ghJson<{
    tree: Array<{ path: string; type: string; size?: number; sha: string }>;
    truncated: boolean;
  }>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    REVALIDATE.tree,
  );
  return {
    entries: data.tree.map((e) => ({
      path: e.path,
      type: e.type as TreeEntry["type"],
      size: e.size,
      sha: e.sha,
    })),
    truncated: Boolean(data.truncated),
  };
}

export async function fetchOwnerMeta(login: string): Promise<OwnerMeta | null> {
  try {
    const u = await ghJson<{
      login: string;
      name: string | null;
      bio: string | null;
      description?: string | null;
      blog: string | null;
      avatar_url: string;
      html_url: string;
      type: string;
      location: string | null;
      twitter_username: string | null;
      public_repos: number;
      followers?: number;
    }>(`/users/${encodeURIComponent(login)}`, REVALIDATE.owner);
    return {
      login: u.login,
      name: u.name,
      // Organizations expose `description`; users expose `bio`.
      bio: u.bio ?? u.description ?? null,
      blog: u.blog?.trim() || null,
      avatar: u.avatar_url,
      htmlUrl: u.html_url,
      type: u.type,
      location: u.location,
      twitter: u.twitter_username,
      publicRepos: u.public_repos,
      followers: u.followers ?? 0,
    };
  } catch {
    // Owner metadata is decorative — never fail a book over it.
    return null;
  }
}

/* -------------------------------------------------------------- raw files */

export function rawUrl(
  owner: string,
  repo: string,
  ref: string,
  path: string,
): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${RAW}/${owner}/${repo}/${ref}/${encoded}`;
}

export function blobUrl(
  owner: string,
  repo: string,
  ref: string,
  path: string,
): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${owner}/${repo}/blob/${ref}/${encoded}`;
}

/** Refuse to inline anything large enough to blow up a page render. */
const MAX_TEXT_BYTES = 512 * 1024;

export async function fetchRawText(
  owner: string,
  repo: string,
  ref: string,
  path: string,
): Promise<string | null> {
  try {
    const res = await fetch(rawUrl(owner, repo, ref, path), {
      headers: { "User-Agent": "github-skills-book" },
      next: { revalidate: REVALIDATE.content },
    });
    if (!res.ok) return null;

    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_TEXT_BYTES) return null;

    const text = await res.text();
    return text.length > MAX_TEXT_BYTES ? null : text;
  } catch {
    return null;
  }
}

/** Fetch many raw files with bounded concurrency, preserving input order. */
export async function fetchRawTextBatch(
  owner: string,
  repo: string,
  ref: string,
  paths: string[],
  concurrency = 8,
): Promise<Array<string | null>> {
  const out = new Array<string | null>(paths.length).fill(null);
  let cursor = 0;

  async function worker() {
    while (cursor < paths.length) {
      const i = cursor++;
      out[i] = await fetchRawText(owner, repo, ref, paths[i]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, paths.length) }, worker),
  );
  return out;
}
