/**
 * Assembles a "book" from a GitHub repo: metadata, chapters (skills),
 * front matter (README) and structure. This is the single entry point the
 * route handlers use.
 */

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
  collectResources,
  discoverSkills,
  parseSkill,
  titleCase,
  type Skill,
} from "./skills";

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

export async function getBook(
  ownerParam: string,
  repoParam: string,
): Promise<Book> {
  const repo = await fetchRepoMeta(ownerParam, repoParam);
  const { owner, repo: name, defaultBranch: ref } = repo;

  const [tree, ownerMeta] = await Promise.all([
    fetchRepoTree(owner, name, ref),
    fetchOwnerMeta(owner),
  ]);

  const stubs = discoverSkills(tree.entries, name).slice(0, MAX_SKILLS);

  const readmePath = findReadme(tree.entries);
  const readmePromise = readmePath
    ? fetchRawText(owner, name, ref, readmePath)
    : Promise.resolve(null);
  const sourcesPromise = fetchRawTextBatch(
    owner,
    name,
    ref,
    stubs.map((s) => s.skillMdPath),
  );
  const [readme, sources] = await Promise.all([readmePromise, sourcesPromise]);

  const skills = stubs
    .map((stub, i) => {
      const source = sources[i];
      if (source === null) return null;
      return parseSkill(stub, source, collectResources(tree.entries, stub));
    })
    .filter((s): s is Skill => s !== null);

  return {
    repo,
    owner: ownerMeta,
    readme,
    skills,
    parts: groupSkills(skills),
    truncated: tree.truncated,
    totalWords: skills.reduce((n, s) => n + s.wordCount, 0),
    totalReadingMinutes: skills.reduce((n, s) => n + s.readingMinutes, 0),
    layouts: [...new Set(stubs.map((s) => layoutOf(s.skillMdPath)))],
  };
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
