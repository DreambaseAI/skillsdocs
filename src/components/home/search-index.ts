/**
 * Assembling the cross-book search corpus.
 *
 * Server-only: it reaches skills.sh and is wrapped in `use cache`. The
 * matching itself lives in `lib/search.ts`, which is import-safe from client
 * components; keep the two apart or the palette drags `next/cache` into the
 * browser bundle.
 *
 * The chapter list comes from skills.sh, not from GitHub. Indexing chapters
 * the honest way would mean `getBook()` for all 89 seeded repos — 178 GitHub
 * API calls against a 5,000/hour ceiling, on a page that has to render in
 * under a second. skills.sh already publishes every ranked skill name per
 * source; that is ~2,200 chapter titles across 85 of the 89 books, for zero
 * GitHub quota. Titles that skills.sh has never seen are missing from search
 * until someone opens the book — an acceptable trade for a directory page.
 */

import { cacheLife, cacheTag } from "next/cache";
import GithubSlugger from "github-slugger";
import { getFeaturedBooks, type FeaturedBook } from "@/lib/featured";
import { paths } from "@/lib/site";
import {
  fetchLeaderboard,
  fetchOfficialOwners,
  snapshotLeaderboard,
  snapshotOwners,
  type SkillsShOwner,
  type SkillsShSkill,
} from "@/lib/skills-sh";
import type { SearchDoc } from "@/lib/search";

/**
 * How many chapters the ⌘K palette carries into the browser.
 *
 * The full corpus is ~110 KB of JSON, which is not something to put in the
 * RSC payload of the home page. The top slice by installs is ~20 KB and
 * covers everything a reader is plausibly reaching for; the palette always
 * offers "search everything" as its last row, which lands on `/search` where
 * the whole index is queried server-side.
 */
export const PALETTE_CHAPTERS = 500;

/** The chapter titles skills.sh knows about, keyed by `owner/repo`. */
function chapterNames(
  skills: SkillsShSkill[],
  owners: SkillsShOwner[],
): Map<string, Map<string, number>> {
  const byRepo = new Map<string, Map<string, number>>();

  const add = (source: string, name: string, installs: number) => {
    const key = source.toLowerCase();
    let bucket = byRepo.get(key);
    if (!bucket) {
      bucket = new Map();
      byRepo.set(key, bucket);
    }
    // The homepage payload is fresher than /official, so it wins on collision.
    if (!bucket.has(name)) bucket.set(name, installs);
  };

  for (const skill of skills) add(skill.source, skill.name, skill.installs);
  for (const owner of owners) {
    for (const repo of owner.repos) {
      for (const skill of repo.skills) add(repo.repo, skill.name, skill.installs);
    }
  }
  return byRepo;
}

function bookDoc(book: FeaturedBook): SearchDoc {
  return {
    kind: "book",
    owner: book.owner,
    repo: book.repo,
    slug: null,
    title: `${book.owner}/${book.repo}`,
    subtitle: book.description,
    // The layout shapes are how a reader who cares about repo structure
    // searches — "plugins", "curated", ".claude" are all real queries.
    keywords: [...book.layouts, book.license ?? "", book.official ? "official" : ""].filter(
      Boolean,
    ),
    installs: book.installs,
    official: book.official,
    avatar: book.avatar,
    href: paths.book(book.owner, book.repo),
  };
}

function chapterDoc(book: FeaturedBook, name: string, installs: number): SearchDoc {
  // A fresh slugger per call: the shared instance in `skills.ts` de-duplicates
  // within one book, and reusing one here would append "-1" to a name that is
  // perfectly unique in its own repo.
  const slug = new GithubSlugger().slug(name);
  return {
    kind: "chapter",
    owner: book.owner,
    repo: book.repo,
    slug,
    title: name,
    subtitle: `${book.owner}/${book.repo}`,
    keywords: book.description ? [book.description] : [],
    installs,
    official: book.official,
    avatar: book.avatar,
    href: paths.chapter(book.owner, book.repo, slug),
  };
}

/**
 * Every book plus every chapter skills.sh knows about, books first.
 *
 * Never empty: `getFeaturedBooks()` is contractually non-empty, and a total
 * skills.sh outage degrades this to 89 book records with no chapters.
 */
export async function getSearchIndex(): Promise<SearchDoc[]> {
  "use cache";
  cacheLife("leaderboard");
  cacheTag("featured", "skills-sh", "search-index");

  const books = await getFeaturedBooks();

  let skills: SkillsShSkill[] = [];
  let owners: SkillsShOwner[] = [];
  try {
    [skills, owners] = await Promise.all([fetchLeaderboard(), fetchOfficialOwners()]);
  } catch {
    // Fall through to the committed snapshot.
  }
  if (skills.length === 0 && owners.length === 0) {
    skills = snapshotLeaderboard();
    owners = snapshotOwners();
  }

  const names = chapterNames(skills, owners);
  const docs: SearchDoc[] = books.map(bookDoc);

  for (const book of books) {
    const bucket = names.get(`${book.owner}/${book.repo}`.toLowerCase());
    if (!bucket) continue;
    for (const [name, installs] of bucket) docs.push(chapterDoc(book, name, installs));
  }

  return docs;
}

/**
 * The slice the ⌘K palette ships to the browser: every book, plus the most
 * installed chapters.
 */
export async function getPaletteIndex(): Promise<SearchDoc[]> {
  "use cache";
  cacheLife("leaderboard");
  cacheTag("featured", "skills-sh", "search-index");

  const all = await getSearchIndex();
  const books = all.filter((d) => d.kind === "book");
  const chapters = all
    .filter((d) => d.kind === "chapter")
    .sort((a, b) => b.installs - a.installs)
    .slice(0, PALETTE_CHAPTERS);

  return [...books, ...chapters];
}
