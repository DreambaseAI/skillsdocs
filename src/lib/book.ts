/**
 * Assembles a "book" from a GitHub repo: metadata, chapters (skills),
 * front matter (README), branding and signal. This is the single entry point
 * the route handlers use.
 *
 * Cost contract: exactly TWO GitHub API calls per book (repo metadata + one
 * recursive tree). Everything else is raw.githubusercontent, which is
 * CDN-served and does not touch the API quota. Never call the contents API
 * per file.
 */

import { cacheLife, cacheTag } from "next/cache";
import { getIssueTheme } from "./design/fetch";
import { deriveIssueTheme } from "./design/theme";
import type { IssueTheme } from "./design/types";
import {
  fetchOwnerMeta,
  fetchRawText,
  fetchRawTextBatch,
  fetchRepoMeta,
  fetchRepoTree,
  type OwnerMeta,
  type RepoMeta,
  type TreeEntry,
} from "./github";
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
import { getRepoSignal, type RepoSignal } from "./skills-sh";

export interface BookPart {
  /** "" for ungrouped skills. */
  group: string;
  title: string;
  skills: Skill[];
}

export interface Book {
  repo: RepoMeta;
  owner: OwnerMeta | null;
  /** Repo README, used as the book's introduction. */
  readme: string | null;
  skills: Skill[];
  parts: BookPart[];
  /** True when GitHub truncated the tree and skills may be missing. */
  truncated: boolean;
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
}): Book {
  const { repo, entries } = input;
  const stubs = discoverSkills(entries, repo.repo).slice(0, MAX_SKILLS);

  const skills = stubs
    .map((stub, i) => {
      const source = input.sources[i];
      if (source === null || source === undefined) return null;
      return parseSkill(stub, source, collectResources(entries, stub));
    })
    .filter((s): s is Skill => s !== null);

  return {
    repo,
    owner: input.owner,
    readme: input.readme,
    skills,
    parts: groupSkills(skills),
    truncated: input.truncated,
    totalWords: skills.reduce((n, s) => n + s.wordCount, 0),
    totalReadingMinutes: skills.reduce((n, s) => n + s.readingMinutes, 0),
    layouts: [...new Set(stubs.map((s) => layoutOf(s.skillMdPath)))],
    signal: input.signal ?? null,
    marketplace: input.marketplace ?? null,
    theme: input.theme,
    issueNumber: issueNumberFor(repo.fullName),
  };
}

/** The SKILL.md paths a book will read, in chapter order. */
export function skillPathsFor(entries: TreeEntry[], repoName: string): string[] {
  return discoverSkills(entries, repoName)
    .slice(0, MAX_SKILLS)
    .map((s) => s.skillMdPath);
}

export async function getBook(
  ownerParam: string,
  repoParam: string,
): Promise<Book> {
  "use cache";
  cacheLife("repo");
  cacheTag("book", `repo:${ownerParam}/${repoParam}`);

  // API call 1 of 2.
  const repo = await fetchRepoMeta(ownerParam, repoParam);
  const { owner, repo: name, defaultBranch: ref } = repo;

  // API call 2 of 2. Owner metadata is a third call but is cached per owner
  // and shared across all of that owner's books.
  const [tree, ownerMeta] = await Promise.all([
    fetchRepoTree(owner, name, ref),
    fetchOwnerMeta(owner),
  ]);

  const readmePath = findReadme(tree.entries);
  const repoLocalUrls = REPO_DESIGN_CANDIDATES.filter((p) =>
    tree.entries.some((e) => e.type === "blob" && e.path === p),
  ).map((p) => `https://raw.githubusercontent.com/${owner}/${name}/${ref}/${p}`);

  const [readme, sources, marketplace, signal, theme] = await Promise.all([
    readmePath
      ? fetchRawText(owner, name, ref, readmePath)
      : Promise.resolve(null),
    fetchRawTextBatch(owner, name, ref, skillPathsFor(tree.entries, name)),
    fetchMarketplace(owner, name, ref, tree.entries),
    // A skills.sh outage must not cost us a book.
    getRepoSignal(owner, name).catch(() => null),
    resolveTheme(owner, repo.homepage, ownerMeta?.blog ?? null, repoLocalUrls),
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
 */
export function groupSkills(skills: Skill[]): BookPart[] {
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
  owner: string,
  repo: string,
  slug: string,
): Promise<string | null> {
  "use cache";
  cacheLife("repo");
  cacheTag(`repo:${owner}/${repo}`);

  const meta = await fetchRepoMeta(owner, repo);
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
