/**
 * Assembles a "book" from a GitHub repo: metadata, chapters (skills),
 * front matter (README), branding and signal. This is the single entry point
 * the route handlers use.
 *
 * Cost contract: ONE GraphQL point (repo + owner metadata, its own 5,000/hr
 * budget) plus ONE REST call (the recursive tree) per book when authenticated;
 * three REST calls when not. Everything else is raw.githubusercontent, which
 * is CDN-served and does not touch either quota. Never call the contents API
 * per file.
 */

import { cacheLife, cacheTag } from "next/cache";
import { getIssueTheme } from "./design/fetch";
import { deriveIssueTheme } from "./design/theme";
import type { IssueTheme } from "./design/types";
import {
  fetchGist,
  fetchOwnerMeta,
  fetchRawText,
  fetchRawTextBatch,
  fetchRepoAndOwner,
  fetchRepoTree,
  GitHubError,
  type OwnerMeta,
  type RepoMeta,
  type TreeEntry,
} from "./github";
import { gistBookInputs } from "./gist";
import { isGistId } from "./site";
import {
  fetchMarketplace,
  type MarketplaceInfo,
} from "./marketplace";
import {
  collectResources,
  discoverSkills,
  parseSkill,
  titleCase,
  type Skill,
} from "./skills";
import { mergeSkillsLocks, type LockedSkillSource } from "./skills-lock";
import { getRepoSignal, type RepoSignal } from "./skills-sh";

export interface BookPart {
  /** "" for ungrouped skills. */
  group: string;
  title: string;
  skills: Skill[];
  /** True for the back-of-book part that holds installed (credited) skills. */
  credited?: boolean;
}

/**
 * What kind of book this is.
 *
 * `authored` — every skill is published from this repo (the normal case).
 * `credited` — every skill is *installed into* this repo: the book is the
 * repo's working library, and it credits the skills' authors rather than
 * claiming them. `mixed` — both, with the credited skills shelved in a
 * back-of-book part.
 */
export type BookProvenance = "authored" | "credited" | "mixed";

export interface Book {
  repo: RepoMeta;
  owner: OwnerMeta | null;
  /** Repo README, used as the book's introduction. */
  readme: string | null;
  skills: Skill[];
  parts: BookPart[];
  /** True when GitHub truncated the tree and skills may be missing. */
  truncated: boolean;
  /**
   * How many `SKILL.md` files the tree actually contains, before `MAX_SKILLS`
   * and before unreadable bodies were dropped.
   *
   * `skills.length` is what we serve; this is what exists. They differ for
   * `github/awesome-copilot` (419) and `ComposioHQ/awesome-claude-skills`
   * (864), and every machine surface used to report the served number as if it
   * were the real one.
   */
  skillsTotal: number;
  /** True when `MAX_SKILLS` cut the chapter list short. */
  capped: boolean;
  /**
   * Paths of chapters whose body could not be read (CDN blip, or over the
   * 512 KB inline cap). Dropped from `skills`, but never silently: a missing
   * chapter is a fact about this render, not about the repository.
   */
  unreadable: string[];
  totalWords: number;
  totalReadingMinutes: number;
  /** Distinct directory layouts observed, for the colophon. */
  layouts: string[];
  /** skills.sh installs; null when the repo is unranked or the scrape failed. */
  signal: RepoSignal | null;
  /** Editorial metadata from a plugin marketplace manifest. Never the index. */
  marketplace: MarketplaceInfo | null;
  /** Always present — falls back to a deterministic hue from the owner name. */
  theme: IssueTheme;
  /** Stable masthead issue number, 1–99. See `issueNumberFor`. */
  issueNumber: number;
  /** Whether the repo wrote these skills, installed them, or both. */
  provenance: BookProvenance;
  /**
   * Committed `skills-lock.json` entries, keyed by lowercased skill name —
   * exact install provenance for credited skills, when the repo recorded it.
   */
  lockSources: Record<string, LockedSkillSource>;
}

/** How many skill bodies we will pull for one book. */
const MAX_SKILLS = 200;

const README_CANDIDATES = [
  "README.md",
  "readme.md",
  "Readme.md",
  "README.markdown",
  "docs/README.md",
];

/** design.md committed to the skills repo itself — tier 5 of the theme chain. */
const REPO_DESIGN_CANDIDATES = [
  "design.md",
  "DESIGN.md",
  ".github/design.md",
  ".github/DESIGN.md",
];

function findReadme(entries: TreeEntry[]): string | null {
  for (const candidate of README_CANDIDATES) {
    const hit = entries.find((e) => e.type === "blob" && e.path === candidate);
    if (hit) return hit.path;
  }
  return null;
}

/** Describe a skill path's shape, e.g. `skills/*​/SKILL.md`. */
function layoutOf(skillMdPath: string): string {
  const parts = skillMdPath.split("/");
  if (parts.length === 1) return "SKILL.md (repo root)";
  return parts
    .map((seg, i) => (i === parts.length - 2 ? "*" : seg))
    .join("/");
}

/**
 * The masthead issue number.
 *
 * DECISION: derived from an FNV-1a hash of `owner/repo`, not from the seed
 * list index. The seed list is editorial and will be reordered and extended;
 * an index-derived number would silently renumber existing issues, and the
 * ~90% of books that are not seeded would have no number at all. A hash gives
 * every repo on GitHub a number, keeps it stable across deploys, and needs no
 * storage. Collisions are expected and harmless — the number is a magazine
 * affectation, never an identifier.
 */
export function issueNumberFor(fullName: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < fullName.length; i++) {
    hash ^= fullName.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return 1 + (hash % 99);
}

/**
 * Build a Book from already-fetched inputs.
 *
 * Pure and network-free, which is what makes the regression suite possible:
 * the tests feed real captured trees straight in. `getBook` is the thin I/O
 * shell around it.
 */
export function assembleBook(input: {
  repo: RepoMeta;
  owner: OwnerMeta | null;
  entries: TreeEntry[];
  truncated: boolean;
  readme: string | null;
  /** SKILL.md bodies in stub order; null for a body that failed to load. */
  sources: Array<string | null>;
  signal?: RepoSignal | null;
  marketplace?: MarketplaceInfo | null;
  theme: IssueTheme;
  lockSources?: Record<string, LockedSkillSource>;
}): Book {
  const { repo, entries } = input;
  const all = discoverSkills(entries, repo.repo);
  const stubs = all.slice(0, MAX_SKILLS);

  const unreadable: string[] = [];
  const parsed = stubs
    .map((stub, i) => {
      const source = input.sources[i];
      if (source === null || source === undefined) {
        unreadable.push(stub.skillMdPath);
        return null;
      }
      return parseSkill(stub, source, collectResources(entries, stub));
    })
    .filter((s): s is Skill => s !== null);

  const skills = creditSkills(parsed, input.signal ?? null, input.marketplace ?? null);
  const provenance: Book["provenance"] = skills.every((s) => s.origin === "authored")
    ? "authored"
    : skills.every((s) => s.origin === "credited")
      ? "credited"
      : "mixed";

  return {
    repo,
    owner: input.owner,
    readme: input.readme,
    skills,
    parts: groupSkills(skills),
    truncated: input.truncated,
    skillsTotal: all.length,
    capped: all.length > stubs.length,
    unreadable,
    totalWords: skills.reduce((n, s) => n + s.wordCount, 0),
    totalReadingMinutes: skills.reduce((n, s) => n + s.readingMinutes, 0),
    layouts: [...new Set(stubs.map((s) => layoutOf(s.skillMdPath)))],
    signal: input.signal ?? null,
    marketplace: input.marketplace ?? null,
    theme: input.theme,
    issueNumber: issueNumberFor(repo.fullName),
    provenance,
    lockSources: input.lockSources ?? {},
  };
}

/**
 * Finish the authored/credited call with what only the whole book knows.
 *
 * Path shape alone misreads one real pattern: a repo that publishes its only
 * skill under `.claude/skills/` and is *installed from* — skills.sh lists it
 * as a source, or it ships a plugin marketplace manifest. Being installable
 * from is authorship, so those skills are promoted:
 *
 *   1. Per skill, when skills.sh records installs of that skill *from this
 *      repo* (`perSkillInstalls`).
 *   2. Wholesale, when every skill is dot-dir-only but the repo is on the
 *      skills.sh leaderboard or publishes a marketplace — a book with nothing
 *      visible to install from is still a publisher if people install it.
 *
 * Credited skills then shelve *after* authored ones, so chapter numbering,
 * the cover preview and the parts all agree that the repo's own work opens
 * the book and its library closes it.
 */
function creditSkills(
  skills: Skill[],
  signal: RepoSignal | null,
  marketplace: MarketplaceInfo | null,
): Skill[] {
  const installable = new Set(
    Object.keys(signal?.perSkillInstalls ?? {}).map((n) => n.toLowerCase()),
  );
  let promoted = skills.map((s) =>
    s.origin === "credited" && installable.has(s.name.toLowerCase())
      ? { ...s, origin: "authored" as const }
      : s,
  );

  const allCredited = promoted.length > 0 && promoted.every((s) => s.origin === "credited");
  if (allCredited && (signal || marketplace)) {
    promoted = promoted.map((s) => ({ ...s, origin: "authored" as const }));
  }

  return [
    ...promoted.filter((s) => s.origin === "authored"),
    ...promoted.filter((s) => s.origin === "credited"),
  ];
}

/** The SKILL.md paths a book will read, in chapter order. */
export function skillPathsFor(entries: TreeEntry[], repoName: string): string[] {
  return discoverSkills(entries, repoName)
    .slice(0, MAX_SKILLS)
    .map((s) => s.skillMdPath);
}

/**
 * A book, or the reason there isn't one — as *data*.
 *
 * Failures are returned rather than thrown because this is the function behind
 * the `"use cache"` boundary, and a rejection does not survive that boundary
 * intact. In a production build Next replaces the rejection with a redacted
 * `Error` ("The specific message is omitted in production builds…"), stripping
 * `name`, `kind` and `status`. Every caller that classified on those fields
 * therefore reported a nonexistent repository as `502 upstream_error`, told
 * agents to retry a permanent condition forever, and published Next's internal
 * error text as part of the JSON API contract. Measured on a production build:
 * `/api/md/anthropics/does-not-exist-repo-xyz` → 502.
 *
 * A discriminated return value is plain data, so it crosses the boundary
 * unharmed and `getBook` can raise a real `GitHubError` on the other side.
 */
type BookFetch =
  | { ok: true; book: Book }
  | {
      ok: false;
      kind: GitHubError["kind"];
      status: number;
      message: string;
    };

/**
 * GitHub treats owners and repository names case-insensitively, so
 * `/MattPocock/Skills` and `/mattpocock/skills` are the same book. Folding the
 * key here is what stops them from minting separate cache entries under
 * separate tags — which made `revalidateTag("repo:mattpocock/skills")`
 * structurally unable to reach the entry a mixed-case URL created.
 */
export function cacheKeyFor(owner: string, repo: string): [string, string] {
  return [owner.toLowerCase(), repo.toLowerCase()];
}

export async function getBook(
  ownerParam: string,
  repoParam: string,
): Promise<Book> {
  const [owner, repo] = cacheKeyFor(ownerParam, repoParam);
  const result = await fetchBook(owner, repo);
  if (result.ok) return result.book;
  // Thrown *outside* the cache scope, so `kind` and `status` reach the caller.
  throw new GitHubError(result.message, result.status, result.kind);
}

async function fetchBook(
  ownerParam: string,
  repoParam: string,
): Promise<BookFetch> {
  "use cache";
  cacheLife("repo");
  cacheTag("book", `repo:${ownerParam}/${repoParam}`);

  try {
    return { ok: true, book: await buildBook(ownerParam, repoParam) };
  } catch (error) {
    const kind = error instanceof GitHubError ? error.kind : "other";
    const status = error instanceof GitHubError ? error.status : 0;
    if (kind !== "not-found") {
      // A quota reset or a network blip must not be pinned for six hours; a
      // missing repository can be, and cheaply absorbs crawler traffic.
      cacheLife({ stale: 0, revalidate: 60, expire: 300 });
    }
    return {
      ok: false,
      kind,
      status,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function buildBook(
  ownerParam: string,
  repoParam: string,
): Promise<Book> {
  // A hex id in repo position is a gist reference — `gist.github.com/u/id`
  // pasted into the hero lands here as `/u/id`. A repo legitimately named 32
  // hex characters still resolves: only a *missing* gist falls through.
  if (isGistId(repoParam)) {
    try {
      return await buildGistBook(ownerParam, repoParam);
    } catch (error) {
      if (!(error instanceof GitHubError) || error.kind !== "not-found") {
        throw error;
      }
    }
  }

  // Repo + owner metadata: one GraphQL point when authenticated, two REST
  // calls when not.
  const { repo, owner: ownerMeta } = await fetchRepoAndOwner(
    ownerParam,
    repoParam,
  );
  const { owner, repo: name, defaultBranch: ref } = repo;

  // The book's one REST call.
  const tree = await fetchRepoTree(owner, name, ref);

  const readmePath = findReadme(tree.entries);
  const repoLocalUrls = REPO_DESIGN_CANDIDATES.filter((p) =>
    tree.entries.some((e) => e.type === "blob" && e.path === p),
  ).map((p) => `https://raw.githubusercontent.com/${owner}/${name}/${ref}/${p}`);

  // Committed skills-CLI locks: exact provenance for credited skills. Raw
  // CDN reads, so a monorepo with several costs no quota.
  const lockPaths = tree.entries
    .filter(
      (e) =>
        e.type === "blob" &&
        (e.path === "skills-lock.json" || e.path.endsWith("/skills-lock.json")),
    )
    .map((e) => e.path);

  const [readme, sources, marketplace, signal, theme, lockTexts] =
    await Promise.all([
      readmePath
        ? fetchRawText(owner, name, ref, readmePath)
        : Promise.resolve(null),
      fetchRawTextBatch(owner, name, ref, skillPathsFor(tree.entries, name)),
      fetchMarketplace(owner, name, ref, tree.entries),
      // A skills.sh outage must not cost us a book.
      getRepoSignal(owner, name).catch(() => null),
      resolveTheme(owner, repo.homepage, ownerMeta?.blog ?? null, repoLocalUrls),
      fetchRawTextBatch(owner, name, ref, lockPaths),
    ]);

  return assembleBook({
    repo,
    owner: ownerMeta,
    entries: tree.entries,
    truncated: tree.truncated,
    readme,
    sources,
    signal,
    marketplace,
    theme,
    lockSources: mergeSkillsLocks(lockTexts),
  });
}

/**
 * A gist as a one-off book: one REST call for everything (the gist payload
 * carries its file bodies inline), one more for owner metadata. No tree, no
 * GraphQL, no skills.sh signal (gists aren't indexed there), no marketplace.
 */
async function buildGistBook(user: string, id: string): Promise<Book> {
  const gist = await fetchGist(user, id);
  const { repo, entries, sources } = gistBookInputs(gist);

  const ownerMeta = await fetchOwnerMeta(repo.owner);
  const theme = await resolveTheme(repo.owner, null, ownerMeta?.blog ?? null, []);

  return assembleBook({
    repo,
    owner: ownerMeta,
    entries,
    truncated: false,
    readme: null,
    sources,
    signal: null,
    marketplace: null,
    theme,
  });
}

/**
 * Resolve the issue theme, never failing. The design chain already falls back
 * to a name hash; this guard covers the chain itself throwing.
 */
async function resolveTheme(
  owner: string,
  homepage: string | null,
  blog: string | null,
  repoLocalUrls: string[],
): Promise<IssueTheme> {
  try {
    const { theme } = await getIssueTheme({
      owner,
      site: blog ?? homepage,
      repoLocalUrls,
    });
    return theme;
  } catch {
    return deriveIssueTheme(owner, {
      ok: false,
      origin: "name-hash",
      sourceUrl: null,
      format: "none",
      name: null,
      description: null,
      colors: [],
      fonts: [],
      radiusPx: null,
      voice: { words: [], quotes: [], summary: null },
      pointers: [],
      warnings: ["Theme resolution failed; fell back to a name hash."],
    });
  }
}

/**
 * Group skills into parts. Grouping only earns its keep when it actually
 * partitions the set — a single group, or one group per skill, is noise.
 *
 * In a mixed book the credited skills form their own closing part — every
 * book ends with its citations — and only the authored skills are grouped by
 * path. An all-credited book gets no special part: the whole book is the
 * credit, and `Book.provenance` carries that fact.
 */
export function groupSkills(skills: Skill[]): BookPart[] {
  const authored = skills.filter((s) => s.origin === "authored");
  const credited = skills.filter((s) => s.origin === "credited");
  if (authored.length === 0 || credited.length === 0) {
    return groupByPath(skills);
  }
  return [
    ...groupByPath(authored),
    { group: "credited", title: "Credited skills", skills: credited, credited: true },
  ];
}

function groupByPath(skills: Skill[]): BookPart[] {
  const groups = new Set(skills.map((s) => s.group).filter(Boolean));
  const allGrouped = skills.every((s) => s.group);

  if (!allGrouped || groups.size < 2 || groups.size === skills.length) {
    return [{ group: "", title: "Skills", skills }];
  }

  const byGroup = new Map<string, Skill[]>();
  for (const skill of skills) {
    const list = byGroup.get(skill.group);
    if (list) list.push(skill);
    else byGroup.set(skill.group, [skill]);
  }

  return [...byGroup.entries()]
    .map(([group, list]) => ({ group, title: titleCase(group), skills: list }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function findSkill(book: Book, slug: string): Skill | undefined {
  return book.skills.find((s) => s.slug === slug);
}

/** Ordered chapter list with neighbours, for page-turn navigation. */
export function chapterNav(
  book: Book,
  slug: string,
): { index: number; prev: Skill | null; next: Skill | null } {
  const index = book.skills.findIndex((s) => s.slug === slug);
  return {
    index,
    prev: index > 0 ? book.skills[index - 1] : null,
    next:
      index >= 0 && index < book.skills.length - 1
        ? book.skills[index + 1]
        : null,
  };
}

/**
 * The unmodified bytes of one chapter's SKILL.md.
 *
 * WS-6 needs these for sha256 digests and the `.md` routes; going through the
 * book would hand back a trimmed, frontmatter-parsed body instead.
 */
export async function getSkillRaw(
  ownerParam: string,
  repoParam: string,
  slug: string,
): Promise<string | null> {
  const [owner, repo] = cacheKeyFor(ownerParam, repoParam);
  return getSkillRawCached(owner, repo, slug);
}

async function getSkillRawCached(
  owner: string,
  repo: string,
  slug: string,
): Promise<string | null> {
  "use cache";
  cacheLife("repo");
  cacheTag(`repo:${owner}/${repo}`);

  // Mirrors `buildBook`: a gist chapter's bytes are already in the gist
  // payload, and a missing gist falls through to the repo path.
  if (isGistId(repo)) {
    try {
      const { entries, sources } = gistBookInputs(await fetchGist(owner, repo));
      const index = discoverSkills(entries, repo).findIndex(
        (s) => s.slug === slug,
      );
      return index >= 0 ? (sources[index] ?? null) : null;
    } catch (error) {
      if (!(error instanceof GitHubError) || error.kind !== "not-found") {
        throw error;
      }
    }
  }

  const { repo: meta } = await fetchRepoAndOwner(owner, repo);
  const tree = await fetchRepoTree(meta.owner, meta.repo, meta.defaultBranch);
  const stub = discoverSkills(tree.entries, meta.repo).find(
    (s) => s.slug === slug,
  );
  if (!stub) return null;
  return fetchRawText(
    meta.owner,
    meta.repo,
    meta.defaultBranch,
    stub.skillMdPath,
  );
}
