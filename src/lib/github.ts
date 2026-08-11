/**
 * GitHub data access.
 *
 * Budget discipline matters here. File bodies come from raw.githubusercontent,
 * which is CDN-served and not counted against any API quota. The metered
 * surface is metadata and the tree listing, and it is split across GitHub's
 * two *independent* hourly budgets:
 *
 *  - authenticated: repo + owner metadata travel as ONE GraphQL query
 *    (`fetchRepoAndOwner`, 1 point of the separate 5,000-point GraphQL
 *    budget), so the whole 5,000-req REST budget is left for the one
 *    recursive-tree call a book needs.
 *  - unauthenticated (60 req/hr, and GraphQL requires a token): falls back to
 *    the REST fetchers below — repo metadata, owner metadata, tree.
 *
 * Set GITHUB_TOKEN to lift the REST ceiling to 5000 req/hr and unlock GraphQL.
 *
 * CACHING. Every fetcher below is a `use cache` function keyed on its
 * primitive arguments and tagged `repo:{owner}/{repo}`, so one webhook call to
 * POST /api/revalidate invalidates a whole book — metadata, tree, and bodies.
 *
 * The inner `fetch()` calls deliberately carry NO `next: { revalidate }`.
 * Two independent TTLs over the same bytes is not belt-and-braces, it is a
 * bug: after `revalidateTag` marks the `use cache` entry stale, re-running the
 * function would re-serve the still-fresh *fetch* entry and the webhook would
 * appear to do nothing. One owner of freshness per byte — the `use cache`
 * entry, whose windows are the `repo` profile in `next.config.ts`.
 */

import { cacheLife, cacheTag } from "next/cache";

const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";

/**
 * The underlying freshness windows, in seconds.
 *
 * Kept as the written-down intent behind the `repo` cacheLife profile (and
 * used directly where a route needs the number rather than a profile name).
 */
export const REVALIDATE = {
  repo: 60 * 60 * 6, // repo metadata: stars move slowly
  tree: 60 * 60 * 6, // file listing
  content: 60 * 60 * 12, // file bodies change least often
  owner: 60 * 60 * 24,
} as const;

/**
 * The cache tag for one repository, always lower-cased.
 *
 * GitHub is case-insensitive on both owner and name, so `MattPocock/Skills`
 * and `mattpocock/skills` are one repository with one webhook. Tagging with
 * whatever casing the URL happened to carry produced entries that
 * `revalidateTag("repo:mattpocock/skills")` could never reach — verified: three
 * casings of the same repo each took a cold path and each got its own entry.
 */
export function repoTag(owner: string, repo: string): string {
  return `repo:${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

export function ownerTag(login: string): string {
  return `owner:${login.toLowerCase()}`;
}

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

async function ghJson<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { headers: headers() });
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
  "use cache";
  cacheLife("repo");
  cacheTag(repoTag(owner, repo));

  const r = await ghJson<RawRepo>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
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
  "use cache";
  cacheLife("repo");
  cacheTag(repoTag(owner, repo));

  const data = await ghJson<{
    tree: Array<{ path: string; type: string; size?: number; sha: string }>;
    truncated: boolean;
  }>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
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
  "use cache";
  cacheLife("repo");
  cacheTag(ownerTag(login));

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
    }>(`/users/${encodeURIComponent(login)}`);
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

/* ------------------------------------------------- combined GraphQL fetch */

const GRAPHQL = `${API}/graphql`;

/**
 * Repo + owner metadata in one query. Costs 1 point of the GraphQL budget,
 * which is separate from the 5,000-req REST budget the tree call spends.
 *
 * Two deliberate REST/GraphQL differences: `issues(states: OPEN)` excludes
 * pull requests where REST's `open_issues_count` includes them (GraphQL is the
 * more honest number), and Organizations have no `followers` connection, so
 * org followers read 0.
 */
const BOOK_META_QUERY = /* GraphQL */ `
  query BookMeta($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      name
      nameWithOwner
      defaultBranchRef { name }
      description
      homepageUrl
      stargazerCount
      forkCount
      watchers { totalCount }
      issues(states: OPEN) { totalCount }
      repositoryTopics(first: 20) { nodes { topic { name } } }
      licenseInfo { key name spdxId }
      pushedAt
      createdAt
      isArchived
      isFork
      url
      owner {
        __typename
        login
        avatarUrl
        url
        ... on User {
          name
          bio
          websiteUrl
          location
          twitterUsername
          repositories(privacy: PUBLIC) { totalCount }
          followers { totalCount }
        }
        ... on Organization {
          name
          description
          websiteUrl
          location
          twitterUsername
          repositories(privacy: PUBLIC) { totalCount }
        }
      }
    }
  }
`;

interface GqlRepository {
  name: string;
  nameWithOwner: string;
  defaultBranchRef: { name: string } | null;
  description: string | null;
  homepageUrl: string | null;
  stargazerCount: number;
  forkCount: number;
  watchers: { totalCount: number };
  issues: { totalCount: number };
  repositoryTopics: { nodes: Array<{ topic: { name: string } } | null> | null };
  licenseInfo: { key: string; name: string; spdxId: string | null } | null;
  pushedAt: string | null;
  createdAt: string | null;
  isArchived: boolean;
  isFork: boolean;
  url: string;
  owner: {
    __typename: string;
    login: string;
    avatarUrl: string;
    url: string;
    name?: string | null;
    bio?: string | null;
    description?: string | null;
    websiteUrl?: string | null;
    location?: string | null;
    twitterUsername?: string | null;
    repositories?: { totalCount: number };
    followers?: { totalCount: number };
  };
}

function rateLimitedError(res: Response): GitHubError {
  const reset = Number(res.headers.get("x-ratelimit-reset") ?? 0) * 1000;
  return new GitHubError(
    `GitHub GraphQL rate limit reached. Resets ${reset ? new Date(reset).toISOString() : "shortly"}.`,
    429,
    "rate-limited",
  );
}

async function gqlRepoAndOwner(
  owner: string,
  repo: string,
): Promise<{ repo: RepoMeta; owner: OwnerMeta }> {
  let res: Response;
  try {
    res = await fetch(GRAPHQL, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        query: BOOK_META_QUERY,
        variables: { owner, repo },
      }),
    });
  } catch (cause) {
    throw new GitHubError(
      `Could not reach GitHub: ${(cause as Error).message}`,
      0,
      "network",
    );
  }

  if (
    (res.status === 403 || res.status === 429) &&
    res.headers.get("x-ratelimit-remaining") === "0"
  ) {
    throw rateLimitedError(res);
  }
  if (!res.ok) {
    throw new GitHubError(
      `GitHub GraphQL responded ${res.status}`,
      res.status,
      "other",
    );
  }

  const payload = (await res.json()) as {
    data?: { repository: GqlRepository | null } | null;
    errors?: Array<{ type?: string; message?: string }>;
  };
  const errors = payload.errors ?? [];
  if (errors.some((e) => e.type === "RATE_LIMITED")) {
    throw rateLimitedError(res);
  }

  const r = payload.data?.repository;
  if (!r) {
    // GraphQL reports a missing repo as `repository: null` + a NOT_FOUND
    // error, all inside an HTTP 200.
    if (errors.length === 0 || errors.some((e) => e.type === "NOT_FOUND")) {
      throw new GitHubError(`Not found: ${owner}/${repo}`, 404, "not-found");
    }
    throw new GitHubError(
      `GitHub GraphQL error: ${errors[0]?.message ?? "unknown"}`,
      502,
      "other",
    );
  }

  const o = r.owner;
  return {
    repo: {
      // Use GitHub's canonical casing, not whatever casing the URL had.
      owner: o.login,
      repo: r.name,
      fullName: r.nameWithOwner,
      defaultBranch: r.defaultBranchRef?.name ?? "HEAD",
      description: r.description,
      homepage: r.homepageUrl?.trim() || null,
      stars: r.stargazerCount,
      forks: r.forkCount,
      watchers: r.watchers.totalCount,
      openIssues: r.issues.totalCount,
      topics: (r.repositoryTopics.nodes ?? [])
        .filter((n): n is { topic: { name: string } } => n !== null)
        .map((n) => n.topic.name),
      license: r.licenseInfo
        ? {
            key: r.licenseInfo.key,
            name: r.licenseInfo.name,
            spdxId: r.licenseInfo.spdxId,
          }
        : null,
      pushedAt: r.pushedAt,
      createdAt: r.createdAt,
      archived: r.isArchived,
      isFork: r.isFork,
      htmlUrl: r.url,
      ownerAvatar: o.avatarUrl,
      ownerType: o.__typename,
      ownerUrl: o.url,
    },
    owner: {
      login: o.login,
      name: o.name ?? null,
      // Users expose `bio`; Organizations expose `description`.
      bio: o.bio ?? o.description ?? null,
      blog: o.websiteUrl?.trim() || null,
      avatar: o.avatarUrl,
      htmlUrl: o.url,
      type: o.__typename,
      location: o.location ?? null,
      twitter: o.twitterUsername ?? null,
      publicRepos: o.repositories?.totalCount ?? 0,
      followers: o.followers?.totalCount ?? 0,
    },
  };
}

/**
 * The one metadata read a book performs.
 *
 * Authenticated, this is a single GraphQL point and spends nothing from the
 * REST budget; if the GraphQL budget is ever exhausted it falls back to REST,
 * so the two 5,000/hr pools back each other up. Unauthenticated (GraphQL
 * requires a token), it is the two REST calls it always was.
 */
export async function fetchRepoAndOwner(
  owner: string,
  repo: string,
): Promise<{ repo: RepoMeta; owner: OwnerMeta | null }> {
  "use cache";
  cacheLife("repo");
  cacheTag(repoTag(owner, repo), ownerTag(owner));

  if (process.env.GITHUB_TOKEN) {
    try {
      return await gqlRepoAndOwner(owner, repo);
    } catch (error) {
      const exhausted =
        error instanceof GitHubError && error.kind === "rate-limited";
      if (!exhausted) throw error;
      // Fall through: the REST budget is metered independently.
    }
  }

  const meta = await fetchRepoMeta(owner, repo);
  return { repo: meta, owner: await fetchOwnerMeta(meta.owner) };
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

/**
 * Read one file from raw.githubusercontent.
 *
 * Cached per file rather than only as part of the book, so the `.md` routes,
 * the sha256 digests in the agent-skills manifest, and the HTML render all hit
 * the same entry instead of re-reading the same bytes three times.
 */
export async function fetchRawText(
  owner: string,
  repo: string,
  ref: string,
  path: string,
): Promise<string | null> {
  "use cache";
  cacheLife({
    stale: 300,
    revalidate: REVALIDATE.content,
    expire: REVALIDATE.content * 2,
  });
  cacheTag(repoTag(owner, repo));

  try {
    const res = await fetch(rawUrl(owner, repo, ref, path), {
      headers: { "User-Agent": "github-skills-book" },
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

/**
 * Fetch many raw files with bounded concurrency, preserving input order.
 *
 * Not itself a cache scope — it fans out to `fetchRawText`, which is. Caching
 * here too would key an entry on the whole path array and duplicate every
 * body in memory for no gain.
 */
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

/* ---------------------------------------------------------- rate-limit budget */

export interface RateLimitBudget {
  limit: number;
  remaining: number;
  resetAt: string;
  /** True when a GITHUB_TOKEN is configured — 5000/hr instead of 60/hr. */
  authenticated: boolean;
}

/**
 * The live API quota, for `/api/v1/health`.
 *
 * Deliberately NOT cached: a stale budget is worse than none, and this is the
 * one endpoint whose whole job is to tell you the current number. `/rate_limit`
 * does not itself consume quota.
 */
export async function rateLimitBudget(): Promise<RateLimitBudget> {
  const authenticated = Boolean(process.env.GITHUB_TOKEN);
  try {
    const res = await fetch(`${API}/rate_limit`, {
      headers: headers(),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as {
      rate: { limit: number; remaining: number; reset: number };
    };
    return {
      limit: data.rate.limit,
      remaining: data.rate.remaining,
      resetAt: new Date(data.rate.reset * 1000).toISOString(),
      authenticated,
    };
  } catch {
    return {
      limit: authenticated ? 5000 : 60,
      remaining: -1,
      resetAt: "",
      authenticated,
    };
  }
}
