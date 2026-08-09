/**
 * Agent-facing serializers: markdown twins, `llms.txt`, and the Agent Skills
 * discovery manifest.
 *
 * Everything here is pure. The network lives in the route handlers; these
 * functions take an already-assembled `Book` and hand back bytes. That is what
 * makes the licence rules testable — and they are the rules most likely to get
 * quietly broken by a later edit.
 *
 * LICENCE POSITION. We re-publish third-party content. The rule, applied
 * uniformly by `chapterLicence()`:
 *
 *   1. A chapter is republishable only when a licence is *detectable* for it —
 *      frontmatter `license:`, a LICENSE file inside the skill directory, or a
 *      repository licence GitHub could identify.
 *   2. A chapter with no detectable licence is still *linked* — title,
 *      description, upstream URL — but its body is never inlined, and it is
 *      omitted from the agent-skills manifest entirely.
 *   3. Every surface carries the upstream URL and, when we can name it, the
 *      SPDX id. We never guess an SPDX id we did not read.
 *
 * Point 1 is why `anthropics/skills` works at all: GitHub reports
 * `license: null` for it, because the licences live in sixteen per-skill
 * `LICENSE.txt` files rather than one at the root. A naive repo-level check
 * would have silently dropped the flagship book.
 */

import type { Book } from "./book";
import { blobUrl, rawUrl, type RepoMeta } from "./github";
import type { Skill } from "./skills";
import {
  AGENT_SKILLS_SPEC,
  SITE_NAME,
  SITE_URL,
  TAKEDOWN_URL,
  absoluteUrl,
  external,
  installCommand,
  paths,
} from "./site";
import type { SeedRepo } from "./data/seed-repos";

/**
 * Where a rights complaint goes.
 *
 * Defaults to the same URL the human-facing footer prints — one address, one
 * queue. `mailto:` remains available through the env override for a deployment
 * that would rather take these privately.
 */
export const TAKEDOWN_CONTACT =
  process.env.NEXT_PUBLIC_TAKEDOWN_CONTACT ?? TAKEDOWN_URL;

/** The Agent Skills discovery schema, taken verbatim from a live manifest. */
export const AGENT_SKILLS_SCHEMA =
  "https://schemas.agentskills.io/discovery/0.2.0/schema.json";

/**
 * Site-wide discovery relations, for the `Link` header of any route that sets
 * its own (a header written by a route handler wins over one written by the
 * proxy, so a handler that sets `Link` must carry these itself).
 *
 * `rel="agent-skills"` is deliberately absent: on a book route the *book's*
 * manifest is the one an agent wants, and two links with the same relation
 * make the caller guess. Routes that have no book add the site-level one
 * themselves.
 *
 * `proxy.ts` keeps its own copy: it is deployed outside the app runtime and
 * must not import from `src/lib`.
 */
export const DISCOVERY_LINK = [
  '</llms.txt>; rel="llms-txt"',
  '</.well-known/api-catalog>; rel="api-catalog"',
  '</api/v1/openapi.json>; rel="service-desc"',
] as const;

/* -------------------------------------------------------- upstream failures */

export type UpstreamFailure = {
  status: 404 | 429 | 502;
  code: "not_found" | "rate_limited" | "upstream_error";
  message: string;
};

/**
 * Classify a failure from `getBook` for an HTTP response.
 *
 * **`instanceof GitHubError` does not survive a `use cache` boundary.**
 * Verified against the live dev server: an exhausted quota inside `getBook`
 * arrives here as a plain `Error` carrying the original message but not the
 * class, so an `instanceof` check reports every 404 and every 429 as a generic
 * 502. Duck-type the `kind` field, then fall back to the message — which is the
 * only thing guaranteed to cross intact.
 */
export function classifyUpstreamError(error: unknown): UpstreamFailure {
  const message = error instanceof Error ? error.message : String(error);
  const kind = (error as { kind?: unknown })?.kind;

  if (kind === "not-found" || /^not found:/i.test(message)) {
    return { status: 404, code: "not_found", message };
  }
  if (kind === "rate-limited" || /rate limit/i.test(message)) {
    return { status: 429, code: "rate_limited", message };
  }
  return { status: 502, code: "upstream_error", message };
}

/* ----------------------------------------------------------------- licences */

export interface LicenceRef {
  /** Canonical SPDX id, or null when we could not identify one. */
  spdx: string | null;
  /** Human label, always present. */
  name: string;
  /** The licence document upstream, or the SPDX page when that is all we have. */
  url: string | null;
  /** Which level of the repo declared it. */
  scope: "repo" | "skill" | "none";
  /**
   * True when a licence exists at all. False means "all rights reserved by
   * default" — link only, never inline.
   */
  redistributable: boolean;
}

const NO_LICENCE: LicenceRef = {
  spdx: null,
  name: "No licence detected",
  url: null,
  scope: "none",
  redistributable: false,
};

/**
 * SPDX ids we are willing to name. Anything outside this list is reported as a
 * free-text licence name with a null SPDX id rather than normalised into a
 * guess.
 */
const SPDX_IDS = [
  "0BSD",
  "AGPL-3.0",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BSL-1.0",
  "CC-BY-4.0",
  "CC-BY-SA-4.0",
  "CC0-1.0",
  "EPL-2.0",
  "GPL-2.0",
  "GPL-3.0",
  "ISC",
  "LGPL-3.0",
  "MIT",
  "MIT-0",
  "MPL-2.0",
  "Unlicense",
  "WTFPL",
] as const;

const SPDX_BY_LOWER = new Map(SPDX_IDS.map((id) => [id.toLowerCase(), id]));

/** Spellings observed in real `SKILL.md` frontmatter and GitHub licence names. */
const SPDX_ALIASES: Record<string, string> = {
  "apache 2.0": "Apache-2.0",
  "apache-2": "Apache-2.0",
  apache2: "Apache-2.0",
  "apache license 2.0": "Apache-2.0",
  "bsd 2-clause": "BSD-2-Clause",
  "bsd 3-clause": "BSD-3-Clause",
  'bsd 3-clause "new" or "revised" license': "BSD-3-Clause",
  "cc by 4.0": "CC-BY-4.0",
  "cc-by": "CC-BY-4.0",
  cc0: "CC0-1.0",
  "gnu affero general public license v3.0": "AGPL-3.0",
  "gnu general public license v2.0": "GPL-2.0",
  "gnu general public license v3.0": "GPL-3.0",
  "gpl v3": "GPL-3.0",
  gpl3: "GPL-3.0",
  "isc license": "ISC",
  "mit license": "MIT",
  "mozilla public license 2.0": "MPL-2.0",
  "the unlicense": "Unlicense",
};

/** Canonical SPDX id for a free-text licence string, or null if unrecognised. */
export function normaliseSpdx(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key || key === "noassertion" || key === "other") return null;
  return SPDX_BY_LOWER.get(key) ?? SPDX_ALIASES[key] ?? null;
}

export function spdxUrl(spdx: string): string {
  return `https://spdx.org/licenses/${spdx}.html`;
}

const LICENCE_FILE = /^(LICEN[CS]E|COPYING|NOTICE)(\.[A-Za-z0-9]+)?$/i;

/** The repository-level licence, as GitHub reports it. */
export function repoLicence(repo: RepoMeta): LicenceRef {
  const gh = repo.license;
  if (!gh) return NO_LICENCE;

  const spdx = normaliseSpdx(gh.spdxId) ?? normaliseSpdx(gh.name);
  if (spdx) {
    return {
      spdx,
      name: gh.name,
      url: spdxUrl(spdx),
      scope: "repo",
      redistributable: true,
    };
  }
  // GitHub found a LICENSE file it could not classify (`NOASSERTION`). That is
  // still a grant of some kind, and it is still linkable.
  return {
    spdx: null,
    name: gh.name || "Licence file present, unidentified",
    url: external.repo(repo.owner, repo.repo),
    scope: "repo",
    redistributable: true,
  };
}

/**
 * The licence that actually governs one chapter.
 *
 * Skill-level beats repo-level, because a repo that licenses per skill means
 * it — see the sixteen `LICENSE.txt` files in `anthropics/skills`.
 */
export function chapterLicence(book: Book, skill: Skill): LicenceRef {
  const { owner, repo, defaultBranch: ref } = book.repo;

  const declared = normaliseSpdx(skill.license);
  if (declared) {
    return {
      spdx: declared,
      name: declared,
      url: spdxUrl(declared),
      scope: "skill",
      redistributable: true,
    };
  }

  // A LICENSE file inside the skill directory. This is the `anthropics/skills`
  // shape and the reason the flagship book is republishable at all: sixteen
  // per-skill `LICENSE.txt` files, no root licence, and GitHub reporting
  // `license: null` for the repository.
  const file = skill.resources.find((r) => LICENCE_FILE.test(r.relPath));

  // Free text like `license: Complete terms in LICENSE.txt` is a grant we
  // cannot name. Point at the licence file when there is one — the SKILL.md is
  // where the claim was made, not where the terms are.
  if (skill.license) {
    return {
      spdx: null,
      name: skill.license,
      url: file
        ? blobUrl(owner, repo, ref, file.path)
        : external.file(owner, repo, ref, skill.skillMdPath),
      scope: "skill",
      redistributable: true,
    };
  }

  if (file) {
    return {
      spdx: null,
      name: `Declared in ${file.relPath}`,
      url: blobUrl(owner, repo, ref, file.path),
      scope: "skill",
      redistributable: true,
    };
  }

  return repoLicence(book.repo);
}

/** A chapter whose body we are allowed to inline. */
export function isRepublishable(book: Book, skill: Skill): boolean {
  return chapterLicence(book, skill).redistributable;
}

/** Short licence label for a one-line provenance row. */
function licenceLabel(licence: LicenceRef): string {
  if (licence.spdx) return licence.spdx;
  if (licence.redistributable) return licence.name;
  return "No licence detected — all rights reserved by its authors";
}

/* ------------------------------------------------------------------ helpers */

/** Escape a value so it survives a single-line YAML scalar. */
function yamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, max: number): string {
  const flat = oneLine(value);
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Re-emit parsed frontmatter as YAML.
 *
 * Only used when the caller could not supply the upstream bytes; when it can,
 * the raw file is passed through untouched and this never runs.
 */
function frontmatterYaml(skill: Skill): string {
  const entries = Object.entries(skill.frontmatter).filter(
    ([, v]) => v !== undefined && v !== null,
  );
  if (entries.length === 0) return "";
  const lines = entries.map(([key, value]) =>
    typeof value === "string"
      ? `${key}: ${yamlString(value)}`
      : `${key}: ${JSON.stringify(value)}`,
  );
  return `---\n${lines.join("\n")}\n---`;
}

/**
 * The bytes of one chapter as they exist upstream.
 *
 * `raw` is the map of verbatim upstream files, keyed by slug, that the route
 * handler fetched. When a body is missing from it we reconstruct
 * frontmatter + body, which is faithful in content but not byte-identical —
 * so the digest surfaces never take this path.
 */
function chapterSource(skill: Skill, raw?: ReadonlyMap<string, string>): string {
  const upstream = raw?.get(skill.slug);
  if (upstream != null) return upstream.replace(/\s+$/, "");
  const fm = frontmatterYaml(skill);
  return fm ? `${fm}\n\n${skill.body}` : skill.body;
}

function isoNow(now?: Date): string {
  return (now ?? new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/* -------------------------------------------------------- provenance blocks */

interface ProvenanceLine {
  label: string;
  value: string;
}

function blockquote(lines: string[]): string {
  return lines.map((l) => (l ? `> ${l}` : ">")).join("\n");
}

function bullets(rows: ProvenanceLine[]): string {
  return rows.map((r) => `- **${r.label}:** ${r.value}`).join("\n");
}

/**
 * Marks where our words stop and the repository's begin.
 *
 * A comment rather than a `---` rule because the upstream file opens with its
 * own `---` frontmatter delimiter; two rules in a row read as a parsing bug,
 * and a comment is invisible when rendered but greppable when not.
 */
const UPSTREAM_MARKER =
  "<!-- Verbatim upstream SKILL.md follows, YAML frontmatter included. -->";

/* ------------------------------------------------------------ book markdown */

export interface SerializeOptions {
  /** Verbatim upstream `SKILL.md` bytes, keyed by slug. */
  raw?: ReadonlyMap<string, string>;
  /** Fixed timestamp, for reproducible tests. */
  now?: Date;
}

/**
 * The whole book as one markdown document — this *is* the book's
 * `llms-full.txt`.
 *
 * Chapters keep their upstream bytes. Chapters with no detectable licence are
 * listed with their upstream link and deliberately left un-inlined.
 */
export function bookToMarkdown(book: Book, options: SerializeOptions = {}): string {
  const { repo } = book;
  const { owner, repo: name, defaultBranch: ref } = repo;
  const bookUrl = absoluteUrl(paths.book(owner, name));
  const licence = repoLicence(repo);
  const included = book.skills.filter((s) => isRepublishable(book, s));
  const withheld = book.skills.filter((s) => !isRepublishable(book, s));

  const head = [
    "---",
    `title: ${yamlString(`${owner}/${name}`)}`,
    `description: ${yamlString(oneLine(repo.description ?? `Agent Skills from ${owner}/${name}.`))}`,
    `source: ${external.repo(owner, name)}`,
    `ref: ${ref}`,
    `license: ${licence.spdx ?? yamlString(licence.name)}`,
    `canonical: ${bookUrl}`,
    `chapters: ${book.skills.length}`,
    `words: ${book.totalWords}`,
    `generator: ${yamlString(SITE_NAME)}`,
    `generated: ${isoNow(options.now)}`,
    "---",
  ].join("\n");

  const pointer = blockquote([
    `**${owner}/${name}** — every Agent Skill in this repository, inlined verbatim.`,
    "",
    `Canonical HTML: ${bookUrl}`,
    `Per-chapter Markdown: ${absoluteUrl(paths.book(owner, name))}/<skill>.md`,
    `Machine manifest: ${absoluteUrl(paths.bookManifest(owner, name))}`,
    `JSON: ${absoluteUrl(paths.bookJson(owner, name))}`,
    `Install: \`${installCommand(owner, name)}\``,
    `Upstream: ${external.repo(owner, name)} @ \`${ref}\``,
    `Licence: ${licenceLabel(licence)}`,
    "",
    `Content is mirrored from GitHub and © its authors, served unmodified. Takedown: ${TAKEDOWN_CONTACT}`,
  ]);

  const toc = book.skills.length
    ? [
        "## Table of contents",
        "",
        book.skills
          .map((skill, i) => {
            const url = `${absoluteUrl(paths.chapter(owner, name, skill.slug))}.md`;
            const note = isRepublishable(book, skill)
              ? truncate(skill.description || "No description.", 160)
              : "Not licensed for republication — link only.";
            return `${i + 1}. [${skill.name}](${url}) — ${note}`;
          })
          .join("\n"),
      ].join("\n")
    : "_This repository contains no Agent Skills._";

  const frontMatter = book.readme
    ? ["## Front matter", "", `_The repository README, verbatim._`, "", book.readme.trim()].join("\n")
    : "";

  const chapters = book.skills.map((skill, i) =>
    chapterSection(book, skill, i + 1, options),
  );

  const notice = withheld.length
    ? [
        "## Licence notice",
        "",
        `${withheld.length} of ${book.skills.length} chapters in this book have no licence that we could detect, at either the repository or the skill level. Their bodies are **not** reproduced here and they are **not** listed in the Agent Skills manifest. Read them upstream:`,
        "",
        withheld
          .map(
            (s) =>
              `- ${s.name} — ${external.file(owner, name, ref, s.skillMdPath)}`,
          )
          .join("\n"),
      ].join("\n")
    : "";

  const stats = bullets([
    { label: "Chapters", value: String(book.skills.length) },
    { label: "Inlined", value: `${included.length} (licence detected)` },
    { label: "Words", value: book.totalWords.toLocaleString("en-US") },
    { label: "Reading time", value: `${book.totalReadingMinutes} min` },
    { label: "Stars", value: repo.stars.toLocaleString("en-US") },
    ...(book.truncated
      ? [
          {
            label: "Warning",
            value: "GitHub truncated this repository's tree; chapters may be missing.",
          },
        ]
      : []),
  ]);

  return [
    head,
    "",
    pointer,
    "",
    `# ${owner}/${name}`,
    "",
    repo.description ? oneLine(repo.description) : "",
    "",
    stats,
    "",
    toc,
    "",
    notice,
    notice ? "" : null,
    frontMatter,
    frontMatter ? "" : null,
    ...chapters,
  ]
    .filter((part): part is string => part !== null)
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trimEnd()
    .concat("\n");
}

function chapterSection(
  book: Book,
  skill: Skill,
  position: number,
  options: SerializeOptions,
): string {
  const { owner, repo: name, defaultBranch: ref } = book.repo;
  const licence = chapterLicence(book, skill);
  const rows: ProvenanceLine[] = [
    {
      label: "Source",
      value: external.file(owner, name, ref, skill.skillMdPath),
    },
    { label: "Raw", value: rawUrl(owner, name, ref, skill.skillMdPath) },
    {
      label: "Markdown",
      value: `${absoluteUrl(paths.chapter(owner, name, skill.slug))}.md`,
    },
    {
      label: "Licence",
      value: licence.url
        ? `${licenceLabel(licence)} — ${licence.url}`
        : licenceLabel(licence),
    },
  ];

  if (!licence.redistributable) {
    return [
      "---",
      "",
      `## ${position}. ${skill.name}`,
      "",
      skill.description ? oneLine(skill.description) : "",
      "",
      bullets(rows),
      "",
      "_Body withheld: no licence could be detected for this skill. Read it upstream._",
      "",
    ].join("\n");
  }

  return [
    "---",
    "",
    `## ${position}. ${skill.name}`,
    "",
    bullets(rows),
    "",
    UPSTREAM_MARKER,
    "",
    chapterSource(skill, options.raw),
    "",
  ].join("\n");
}

/* --------------------------------------------------------- chapter markdown */

/**
 * One chapter as markdown: a provenance header, then the upstream file
 * verbatim — frontmatter included.
 *
 * The header cannot live *inside* the frontmatter without modifying it, and it
 * cannot precede the frontmatter without displacing it from byte 0. We choose
 * the header: an agent that wants byte-exact input has the `Raw` link, which
 * every response also carries as an `X-Skill-Raw` header.
 */
export function skillToMarkdown(
  book: Book,
  skill: Skill,
  options: SerializeOptions = {},
): string {
  const { owner, repo: name, defaultBranch: ref } = book.repo;
  const position = book.skills.findIndex((s) => s.slug === skill.slug) + 1;
  const licence = chapterLicence(book, skill);
  const raw = rawUrl(owner, name, ref, skill.skillMdPath);

  const pointer = blockquote([
    `**${skill.name}** — chapter ${position} of ${book.skills.length} in [${owner}/${name}](${absoluteUrl(paths.book(owner, name))}).`,
    "",
    `Book (all chapters, one file): ${absoluteUrl(paths.bookMarkdown(owner, name))}`,
    `Machine manifest: ${absoluteUrl(paths.bookManifest(owner, name))}`,
    `Install the book: \`${installCommand(owner, name)}\``,
    `Upstream: ${external.file(owner, name, ref, skill.skillMdPath)} @ \`${ref}\``,
    `Raw bytes, no header: ${raw}`,
    `Licence: ${licenceLabel(licence)}${licence.url ? ` — ${licence.url}` : ""}`,
    "",
    `Content © its authors, served unmodified. Takedown: ${TAKEDOWN_CONTACT}`,
  ]);

  if (!licence.redistributable) {
    return [
      pointer,
      "",
      `# ${skill.name}`,
      "",
      skill.description ? oneLine(skill.description) : "",
      "",
      "No licence could be detected for this skill at either the repository or the skill level, so its body is not reproduced here. Read it upstream:",
      "",
      raw,
      "",
    ].join("\n");
  }

  // An HTML comment, not a `---` rule: the upstream file opens with its own
  // `---` frontmatter delimiter, and two rules in a row read as a parsing bug.
  return [
    pointer,
    "",
    UPSTREAM_MARKER,
    "",
    chapterSource(skill, options.raw),
    "",
  ].join("\n");
}

/* ------------------------------------------------------------- llms.txt */

export interface LlmsTxtInput {
  featured: Array<Pick<SeedRepo, "owner" | "repo" | "description">>;
  now?: Date;
}

/**
 * The site index, in the shape llmstxt.org specifies: an H1, a blockquote
 * summary, free prose, then `##` file-list sections. `## Optional` is last
 * because the spec gives that heading the meaning "skippable for a shorter
 * context".
 */
export function siteLlmsTxt({ featured }: LlmsTxtInput): string {
  const list = (
    rows: Array<{ name: string; url: string; note: string }>,
  ): string => rows.map((r) => `- [${r.name}](${r.url}): ${r.note}`).join("\n");

  const books = featured.slice(0, 25).map((b) => ({
    name: `${b.owner}/${b.repo}`,
    url: absoluteUrl(paths.bookMarkdown(b.owner, b.repo)),
    note: truncate(b.description ?? `Agent Skills from ${b.owner}.`, 160),
  }));

  return `# ${SITE_NAME}

> Any GitHub repository containing Agent Skills (\`SKILL.md\` files), rendered as a
> typeset book at ${SITE_URL}/<owner>/<repo>. Every page is available as clean
> Markdown by appending \`.md\` to its URL, or by sending \`Accept: text/markdown\`.
> One repository is one issue; one \`SKILL.md\` is one chapter.

Content served here is mirrored from public GitHub repositories and is owned by its
original authors under the licence declared in each repository. Skill bodies are served
verbatim — frontmatter intact, headings unshifted, descriptions unedited. Attribution and
an upstream link are on every page and in every Markdown response. A repository with no
detectable licence is linked but never inlined. Takedown: ${TAKEDOWN_CONTACT}.

URL patterns:

- \`/<owner>/<repo>\` — the book: cover, table of contents, colophon
- \`/<owner>/<repo>/<skill>\` — a chapter: one skill
- Append \`.md\` to either for Markdown; \`/<owner>/<repo>.md\` is that book's full text
- \`/<owner>/<repo>/.well-known/agent-skills/index.json\` — installable manifest with sha256 digests

## Featured books

${list(books)}

## API

${list([
  {
    name: "OpenAPI 3.1 description",
    url: absoluteUrl("/api/v1/openapi.json"),
    note: "Every agent-facing endpoint, machine-readable.",
  },
  {
    name: "Book JSON",
    url: absoluteUrl("/api/v1/books/{owner}/{repo}"),
    note: "Book manifest: chapters, digests, licence, install commands.",
  },
  {
    name: "Chapter JSON",
    url: absoluteUrl("/api/v1/books/{owner}/{repo}/skills/{skill}"),
    note: "One chapter, with its verbatim content and outline.",
  },
  {
    name: "Search",
    url: absoluteUrl("/api/v1/search?q="),
    note: "Search across every indexed book and skill.",
  },
  {
    name: "Health",
    url: absoluteUrl("/api/v1/health"),
    note: "Liveness plus the live GitHub rate-limit budget.",
  },
  {
    name: "Agent Skills discovery",
    url: absoluteUrl("/.well-known/agent-skills/index.json"),
    note: "The skill this site itself publishes, for driving this API.",
  },
  {
    name: "API catalog",
    url: absoluteUrl("/.well-known/api-catalog"),
    note: "RFC 9727 linkset pointing at everything above.",
  },
])}

## Optional

${list([
  {
    name: "Sitemap",
    url: absoluteUrl("/sitemap.xml"),
    note: "Every indexed book and chapter.",
  },
  {
    name: "Agent Skills specification",
    url: AGENT_SKILLS_SPEC,
    note: "What a SKILL.md must contain. Not our document.",
  },
  {
    name: "Robots policy",
    url: absoluteUrl("/robots.txt"),
    note: "Content-Signal: search=yes, ai-input=yes, ai-train=yes. Being read by agents is the point.",
  },
])}
`;
}

/* -------------------------------------------------- agent-skills manifests */

export interface AgentSkillEntry {
  name: string;
  type: "skill-md";
  description: string;
  url: string;
  digest: string;
}

export interface AgentSkillsManifest {
  $schema: string;
  skills: AgentSkillEntry[];
}

/**
 * The per-book discovery manifest.
 *
 * Fields are limited to the five verified against a live Mintlify manifest —
 * `name`, `type`, `description`, `url`, `digest`. The 0.2.0 JSON Schema could
 * not be fetched during research, so nothing beyond those is invented.
 *
 * `digests` maps slug to a hex sha256 of the raw upstream bytes. A chapter with
 * no digest, or no detectable licence, is omitted: a manifest entry is an
 * invitation to install, and we only extend it for content we can both verify
 * and lawfully redistribute.
 */
export function bookToAgentSkills(
  book: Book,
  digests: ReadonlyMap<string, string>,
): AgentSkillsManifest {
  const { owner, repo: name } = book.repo;

  const skills = book.skills
    .filter((skill) => isRepublishable(book, skill) && digests.has(skill.slug))
    .map((skill) => ({
      name: skill.name,
      type: "skill-md" as const,
      description: truncate(
        skill.description || `${skill.name} — from ${owner}/${name}.`,
        1024,
      ),
      url: absoluteUrl(`${paths.chapter(owner, name, skill.slug)}.md`),
      digest: `sha256:${digests.get(skill.slug)}`,
    }));

  return { $schema: AGENT_SKILLS_SCHEMA, skills };
}

/**
 * The one skill this site authors: it teaches an agent to drive these
 * endpoints.
 *
 * Held here as a string constant rather than a file on disk so that the bytes
 * hashed for the manifest digest are provably the bytes served by the route.
 */
export const SITE_SKILL_NAME = "githubskills-book";

export const SITE_SKILL_MD = `---
name: ${SITE_SKILL_NAME}
description: Find, read, and install Agent Skills from any public GitHub repository through ${SITE_URL}. Use when the user asks whether a skill exists for a task, wants to compare skill collections, wants to read a SKILL.md without cloning, or wants the install command for a skills repository.
license: MIT
---

# ${SITE_NAME}

${SITE_URL} renders any GitHub repository that contains \`SKILL.md\` files as a book:
one repository is one issue, one \`SKILL.md\` is one chapter. Every surface has a
machine-readable twin, so you never need to clone or scrape HTML.

## The one rule

Append \`.md\` to any reader URL and you get clean Markdown. That is the fastest path
to content and it is cacheable. \`Accept: text/markdown\` works on the same URLs if you
prefer content negotiation.

## Reading a repository you already know

1. \`GET ${SITE_URL}/<owner>/<repo>.md\` — the whole book: repository README plus every
   chapter, bodies verbatim with their YAML frontmatter intact, in reading order.
2. \`GET ${SITE_URL}/<owner>/<repo>/<skill>.md\` — one chapter, when you know the slug.
3. \`GET ${SITE_URL}/<owner>/<repo>/.well-known/agent-skills/index.json\` — a discovery
   manifest with one entry per chapter, each carrying a \`sha256:\` digest computed over
   the raw upstream bytes. Verify the digest before writing a skill to disk.

## Finding a repository

\`GET ${SITE_URL}/api/v1/search?q=<query>\` searches the indexed catalog and the
skills.sh install index. Results carry the book, the skill slug, the Markdown URL, and
the install command.

## Installing

The only install form verified in the wild is repository-level:

\`\`\`bash
npx skills add <owner>/<repo>
\`\`\`

Do not invent a per-skill install argument. To install a single skill, fetch its
\`.md\` twin and write it to your skills directory yourself.

## JSON, if you want structure instead of prose

- \`GET ${SITE_URL}/api/v1/books/<owner>/<repo>\` — chapters, digests, licence, stats.
- \`GET ${SITE_URL}/api/v1/books/<owner>/<repo>/skills/<skill>\` — one chapter with its
  content and heading outline.
- \`GET ${SITE_URL}/api/v1/openapi.json\` — the full OpenAPI 3.1 description.
- \`GET ${SITE_URL}/api/v1/health\` — liveness and the upstream GitHub rate-limit budget.
  Check this first if book requests start failing; unauthenticated GitHub allows 60
  requests per hour.

## Licensing, which matters here

Content is mirrored from public repositories and owned by its authors. A skill with no
detectable licence is linked but never inlined, and it is omitted from the discovery
manifest — if a chapter's body is missing, that is why, and the upstream URL is in the
response. Preserve the attribution block when you quote a chapter.
`;

export function siteAgentSkills(digest: string): AgentSkillsManifest {
  return {
    $schema: AGENT_SKILLS_SCHEMA,
    skills: [
      {
        name: SITE_SKILL_NAME,
        type: "skill-md",
        description: truncate(
          `Find, read, and install Agent Skills from any public GitHub repository through ${SITE_URL}. Use when the user asks whether a skill exists for a task, wants to compare skill collections, wants to read a SKILL.md without cloning, or wants the install command for a skills repository.`,
          1024,
        ),
        url: absoluteUrl(`/.well-known/agent-skills/${SITE_SKILL_NAME}/skill.md`),
        digest: `sha256:${digest}`,
      },
    ],
  };
}

/* --------------------------------------------------------------- api-catalog */

/** RFC 9727 linkset. Served as `application/linkset+json`. */
export function apiCatalog(): object {
  return {
    linkset: [
      {
        anchor: `${SITE_URL}/`,
        "service-desc": [
          {
            href: absoluteUrl("/api/v1/openapi.json"),
            type: "application/vnd.oai.openapi+json",
          },
        ],
        "service-doc": [
          { href: absoluteUrl("/llms.txt"), type: "text/plain" },
          {
            href: absoluteUrl(`/.well-known/agent-skills/${SITE_SKILL_NAME}/skill.md`),
            type: "text/markdown",
          },
        ],
        "service-meta": [
          {
            href: absoluteUrl("/.well-known/agent-skills/index.json"),
            type: "application/json",
          },
        ],
        status: [
          { href: absoluteUrl("/api/v1/health"), type: "application/json" },
        ],
      },
    ],
  };
}
